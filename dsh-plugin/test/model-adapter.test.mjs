import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { AgyAuthService } from '../src/service.js'
import { normalizeModelConfig } from '../src/model/config.js'
import { createAntigravityAdapter } from '../src/model/adapter.js'
import { ActivityStore } from '../src/model/activity.js'

const here = dirname(fileURLToPath(import.meta.url))
const fake = join(here, 'fake-agy-stream.mjs')

/**
 * Create an adapter backed by the fake stream process.
 * @returns {Promise<{ adapter: any, service: AgyAuthService, logPath: string, sessionsFile: string, cleanup: () => Promise<void> }>} fixture.
 */
async function fixture(options = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-agy-model-adapter-'))
  const logPath = join(dir, 'argv.log')
  const sessionsFile = join(dir, 'sessions.json')
  const service = new AgyAuthService({
    binary: process.execPath,
    args: [fake],
    env: { FAKE_AGY_ARGV: logPath, ...(options.env ?? {}) },
    listTtlMs: 0,
    statusTtlMs: 0,
    commandTimeoutMs: 20_000,
  })
  const config = normalizeModelConfig({
    agyPath: process.execPath,
    agyArgs: [fake],
    stateFile: sessionsFile,
    timeoutMs: 20_000,
    maxConcurrent: 1,
    permissionMode: 'skip',
    defaultModel: 'gemini-3.8-flash-low',
  }, { agyPath: process.execPath })
  const activity = new ActivityStore(sessionsFile, () => {})
  const adapter = createAntigravityAdapter({
    config,
    service,
    ctx: options.ctx ?? { get: () => undefined },
    log: () => {},
    activity,
  })
  return {
    adapter,
    activity,
    service,
    logPath,
    sessionsFile,
    cleanup: async () => {
      adapter.dispose()
      service.dispose()
      await rm(dir, { recursive: true, force: true })
    },
  }
}

/**
 * Collect every chunk from one stream call.
 * @param {any} adapter - adapter.
 * @param {Record<string, unknown>} request - GenerateOptions.
 * @returns {Promise<any[]>} chunks.
 */
async function collect(adapter, request) {
  const chunks = []
  for await (const chunk of adapter.stream(request)) chunks.push(chunk)
  return chunks
}

test('streams text, thinking, tool activity, usage, and a stop finish', async () => {
  const fixtureValue = await fixture()
  try {
    const chunks = await collect(fixtureValue.adapter, {
      provider: 'antigravity',
      model: 'gemini-3.8-flash-low',
      sessionId: 'sess-1',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    })
    const text = chunks.filter(chunk => chunk.type === 'text-delta').map(chunk => chunk.text).join('')
    const reasoning = chunks.filter(chunk => chunk.type === 'reasoning-delta').map(chunk => chunk.text).join('')
    const usage = chunks.find(chunk => chunk.type === 'usage')
    const finish = chunks.find(chunk => chunk.type === 'finish')
    assert.equal(text, 'Hello world')
    assert.match(reasoning, /considering/)
    assert.match(reasoning, /run_command/)
    assert.equal(usage.usage.inputTokens, 100)
    assert.equal(usage.usage.outputTokens, 5)
    assert.equal(usage.usage.reasoningTokens, 3)
    assert.deepEqual(finish.reason, { kind: 'stop' })
    assert.equal(chunks.filter(chunk => chunk.type === 'finish').length, 1)

    const saved = JSON.parse(readFileSync(fixtureValue.sessionsFile, 'utf8'))
    assert.equal(saved.sessions['sess-1'].conversationId, 'conv-new')
    assert.equal(saved.sessions['sess-1'].model, 'gemini-3.8-flash')
  } finally {
    await fixtureValue.cleanup()
  }
})

test('binds the next turn to the agy conversation id', async () => {
  const fixtureValue = await fixture()
  try {
    const request = {
      provider: 'antigravity',
      model: 'gemini-3.8-flash-low',
      sessionId: 'sess-2',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    }
    await collect(fixtureValue.adapter, request)
    await collect(fixtureValue.adapter, request)
    const lines = readFileSync(fixtureValue.logPath, 'utf8').trim().split(/\r?\n/).map(line => JSON.parse(line))
      .filter(line => !line.includes('models'))
    assert.equal(lines.length, 2)
    assert.equal(lines[0].includes('--conversation'), false)
    assert.equal(lines[1].includes('--conversation'), true)
    assert.equal(lines[1][lines[1].indexOf('--conversation') + 1], 'conv-new')
    assert.equal(lines[0].includes('--dangerously-skip-permissions'), true)
  } finally {
    await fixtureValue.cleanup()
  }
})

test('stages image paths and authorizes their directory', async () => {
  const imageDir = await mkdtemp(join(tmpdir(), 'dsh-agy-image-'))
  const imagePath = join(imageDir, 'shot.png')
  writeFileSync(imagePath, Buffer.from('89504e470d0a1a0a', 'hex'))
  const fixtureValue = await fixture({
    ctx: {
      get: (name) => name === 'attachments'
        ? { imageHostPath: () => imagePath }
        : undefined,
    },
  })
  try {
    await collect(fixtureValue.adapter, {
      provider: 'antigravity',
      model: 'gemini-3.8-flash-low',
      sessionId: 'sess-image',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'look' },
          { type: 'image', attachment: { attachmentId: 'img-1', mediaType: 'image/png', bytes: 8, width: 1, height: 1, name: 'shot.png' } },
        ],
      }],
    })
    const argv = JSON.parse(readFileSync(fixtureValue.logPath, 'utf8').trim().split(/\r?\n/)[0])
    const prompt = argv[argv.indexOf('-p') + 1]
    assert.match(prompt, /\[Attached images\]/)
    assert.match(prompt, /shot\.png/)
    assert.equal(argv.includes('--add-dir'), true)
    assert.equal(argv[argv.indexOf('--add-dir') + 1], imageDir)
  } finally {
    await fixtureValue.cleanup()
    await rm(imageDir, { recursive: true, force: true })
  }
})

test('falls back to a lower Gemini effort on capacity 503', async () => {
  const capacityFile = join(await mkdtemp(join(tmpdir(), 'dsh-agy-capacity-')), 'hit')
  const fixtureValue = await fixture({ env: { FAKE_AGY_CAPACITY_FILE: capacityFile } })
  try {
    const chunks = await collect(fixtureValue.adapter, {
      provider: 'antigravity',
      model: 'gemini-3.8-flash-high',
      sessionId: 'sess-capacity',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    })
    const text = chunks.filter(chunk => chunk.type === 'text-delta').map(chunk => chunk.text).join('')
    const finish = chunks.find(chunk => chunk.type === 'finish')
    assert.equal(text, 'Hello world')
    assert.deepEqual(finish.reason, { kind: 'stop' })
    const lines = readFileSync(fixtureValue.logPath, 'utf8').trim().split(/\r?\n/).map(line => JSON.parse(line))
      .filter(line => !line.includes('models'))
    assert.equal(lines.length, 2)
    assert.equal(lines[0][lines[0].indexOf('--model') + 1], 'gemini-3.8-flash-high')
    assert.equal(lines[1][lines[1].indexOf('--model') + 1], 'gemini-3.8-flash-medium')
    assert.equal(lines[1].includes('--conversation'), false)
  } finally {
    await fixtureValue.cleanup()
    await rm(dirname(capacityFile), { recursive: true, force: true })
  }
})

test('records agy tool activity for the activity cards', async () => {
  const fixtureValue = await fixture()
  try {
    await collect(fixtureValue.adapter, {
      provider: 'antigravity',
      model: 'gemini-3.8-flash-low',
      sessionId: 'sess-activity',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'run it' }] }],
    })
    const entries = fixtureValue.activity.list('sess-activity', 0, Date.now() + 1_000)
    assert.equal(entries.length, 1)
    assert.equal(entries[0].tool.name, 'run_command')
    assert.equal(entries[0].tool.output, 'hi')
  } finally {
    await fixtureValue.cleanup()
  }
})

test('uses plan mode and no conversation for auxiliary calls', async () => {
  const fixtureValue = await fixture()
  try {
    await collect(fixtureValue.adapter, {
      provider: 'antigravity',
      model: 'gemini-3.8-flash-low',
      purpose: 'session-title',
      sessionId: 'sess-aux',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'title this' }] }],
    })
    const argv = JSON.parse(readFileSync(fixtureValue.logPath, 'utf8').trim().split(/\r?\n/)[0])
    assert.equal(argv.includes('--mode'), true)
    assert.equal(argv.includes('plan'), true)
    assert.equal(argv.includes('--conversation'), false)
    assert.equal(existsSync(fixtureValue.sessionsFile), false)
  } finally {
    await fixtureValue.cleanup()
  }
})

test('maps a grouped Gemini effort to its exact agy slug', async () => {
  const fixtureValue = await fixture()
  try {
    await collect(fixtureValue.adapter, {
      provider: 'antigravity',
      model: 'gemini-3.8-flash',
      reasoningEffort: 'high',
      sessionId: 'sess-effort',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'think' }] }],
    })
    const argv = JSON.parse(readFileSync(fixtureValue.logPath, 'utf8').trim().split(/\r?\n/)[0])
    assert.equal(argv[argv.indexOf('--model') + 1], 'gemini-3.8-flash-high')
    assert.equal(argv.includes('--effort'), false)
  } finally {
    await fixtureValue.cleanup()
  }
})

test('retry policy is already resolved and produces finite delays', async () => {
  const fixtureValue = await fixture()
  try {
    const policy = fixtureValue.adapter.providerRetryPolicy()
    assert.equal(policy.mode, 'normal')
    assert.equal(policy.retryableCodes.includes('AGY_NETWORK'), true)
    assert.equal(policy.retryableCodes.includes('AGY_TIMEOUT'), true)
    assert.equal(policy.retryableCodes.includes('AGY_CAPACITY'), false)
    assert.equal(Number.isFinite(policy.initialDelayMs), true)
    assert.equal(Number.isFinite(policy.maxDelayMs), true)
    assert.equal(Number.isFinite(policy.jitterRatio), true)
    assert.equal(typeof policy.backoff, 'undefined')
    const exponential = Math.min(policy.initialDelayMs * 2 ** 0, policy.maxDelayMs)
    const jitter = 1 - policy.jitterRatio + 2 * policy.jitterRatio * 0.5
    const delayMs = Math.min(exponential * jitter, policy.maxDelayMs)
    assert.equal(Number.isFinite(delayMs), true)
  } finally {
    await fixtureValue.cleanup()
  }
})

test('resolves models and reports provider status', async () => {
  const fixtureValue = await fixture()
  try {
    const adapter = fixtureValue.adapter
    const models = await adapter.listModels('antigravity')
    assert.equal(models.length, 2)
    assert.equal(models[0].provider, 'antigravity')
    const resolved = await adapter.resolveModel('antigravity', 'gemini-3.8-flash')
    assert.equal(resolved.name, 'Gemini 3.8 Flash')
    assert.equal(resolved.reasoning.efforts[0].id, 'low')
    assert.deepEqual(resolved.inputModalities, ['text', 'image'])
    assert.equal(resolved.context.contextWindow > 0, true)
    const prepared = await adapter.prepareCall('antigravity', 'gemini-3.8-flash')
    assert.equal(prepared.model.id, 'gemini-3.8-flash')
    assert.equal(typeof prepared.stream, 'function')
    const status = await adapter.status()
    assert.equal(status.provider, 'antigravity')
    assert.equal(status.permissionMode, 'skip')
    assert.equal(status.models.length, 2)
  } finally {
    await fixtureValue.cleanup()
  }
})