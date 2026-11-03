import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { parseEnvelope, resolveCommand } from '../src/command.js'
import { AgyAuthService, normalizeConfig } from '../src/service.js'
import { createSeed } from './fake-state.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const fakeCli = join(here, 'fake-agy-auth.mjs')

/**
 * Create one service backed by the fake CLI and a fresh state file.
 * @returns {Promise<{ service: AgyAuthService, statePath: string, cleanup: () => Promise<void> }>} fixture.
 */
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-agy-auth-'))
  const statePath = join(dir, 'state.json')
  writeFileSync(statePath, JSON.stringify(createSeed(), null, 2))
  const service = new AgyAuthService({
    binary: process.execPath,
    args: [fakeCli],
    env: { FAKE_AGY_STATE: statePath },
    listTtlMs: 0,
    statusTtlMs: 0,
    commandTimeoutMs: 20_000,
    loginTimeoutMs: 20_000,
  })
  return {
    service,
    statePath,
    cleanup: async () => {
      service.dispose()
      await rm(dir, { recursive: true, force: true })
    },
  }
}

/**
 * Poll until a predicate holds or the deadline expires.
 * @param {() => Promise<boolean>} predicate - condition.
 * @param {number} [timeoutMs] - deadline.
 * @returns {Promise<void>} resolves when true.
 */
async function waitFor(predicate, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await predicate()) return
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  throw new Error('condition timed out')
}

test('normalizeConfig carries agyPath and rejects non-strings', () => {
  const config = normalizeConfig({ binary: 'agy-auth', agyPath: ' C:\\Tools\\agy.exe ' })
  assert.equal(config.agyPath, 'C:\\Tools\\agy.exe')
  assert.throws(() => normalizeConfig({ agyPath: 1 }), /agyPath/)
})

test('parseEnvelope tolerates warnings around the JSON document', () => {
  const parsed = parseEnvelope('some noise\n{"schema_version":1,"command":"list","data":{"accounts":[]}}\n')
  assert.equal(parsed.command, 'list')
  assert.deepEqual(parsed.data.accounts, [])
  assert.equal(parseEnvelope('not json'), undefined)
})

test('resolveCommand launches a direct executable without a shell', () => {
  const plan = resolveCommand(process.execPath)
  assert.equal(plan.command, process.execPath)
  assert.deepEqual(plan.args, [])
  assert.equal(plan.via, 'direct')
})

test('state reads accounts, active account, storage, and version', async () => {
  const { service, cleanup } = await fixture()
  try {
    const state = await service.state()
    assert.equal(state.ok, true)
    assert.equal(state.version, '0.3.0-fake')
    assert.equal(state.accounts.length, 3)
    assert.equal(state.current.alias, 'personal')
    assert.equal(state.status.mirror, 'in sync')
    assert.equal(state.binary.available, true)
    assert.equal(state.accounts[1].usage.five_hour.remaining_percent, 18)
  } finally {
    await cleanup()
  }
})

test('switch invalidates the cached list', async () => {
  const { service, cleanup } = await fixture()
  try {
    assert.equal((await service.state()).current.alias, 'personal')
    const switched = await service.switch('acct_work02')
    assert.equal(switched.ok, true)
    const state = await service.state()
    assert.equal(state.current.alias, 'work')
    assert.equal(state.accounts.find(account => account.active).id, 'acct_work02')
  } finally {
    await cleanup()
  }
})

test('alias set and clear round-trips through the CLI', async () => {
  const { service, cleanup } = await fixture()
  try {
    assert.equal((await service.setAlias('acct_test03', 'spare')).ok, true)
    let state = await service.state()
    assert.equal(state.accounts.find(account => account.id === 'acct_test03').alias, 'spare')
    assert.equal((await service.setAlias('acct_test03', '')).ok, true)
    state = await service.state()
    assert.equal(state.accounts.find(account => account.id === 'acct_test03').alias, undefined)
  } finally {
    await cleanup()
  }
})

test('remove deletes one stored account', async () => {
  const { service, cleanup } = await fixture()
  try {
    assert.equal((await service.remove('acct_test03')).ok, true)
    const state = await service.state()
    assert.equal(state.accounts.length, 2)
  } finally {
    await cleanup()
  }
})

test('login captures the URL, accepts the code, and refreshes the list', async () => {
  const { service, cleanup } = await fixture()
  try {
    await service.state()
    const started = await service.login.start('signed-in')
    assert.equal(started.status === 'starting' || started.status === 'waiting', true)
    await waitFor(() => service.login.snapshot()?.url !== null)
    assert.match(service.login.snapshot().url, /^https:\/\/accounts\.google\.com\//)
    service.login.submitCode('good-code')
    await waitFor(() => service.login.snapshot()?.status === 'done')
    const finished = service.login.snapshot()
    assert.equal(finished.account.alias, 'signed-in')
    const state = await service.state()
    assert.equal(state.current.alias, 'signed-in')
    assert.equal(state.accounts.length, 4)
  } finally {
    await cleanup()
  }
})

test('login failure carries the CLI error document', async () => {
  const { service, cleanup } = await fixture()
  try {
    await service.login.start()
    await waitFor(() => service.login.snapshot()?.url !== null)
    service.login.submitCode('bad-code')
    await waitFor(() => service.login.snapshot()?.status === 'failed')
    assert.equal(service.login.snapshot().error.code, 'oauth_error')
  } finally {
    await cleanup()
  }
})

test('unknown account becomes a structured result, not a throw', async () => {
  const { service, cleanup } = await fixture()
  try {
    const result = await service.switch('nobody')
    assert.equal(result.ok, false)
    assert.equal(result.error.code, 'account_not_found')
    assert.match(result.error.message, /no account matches/)
  } finally {
    await cleanup()
  }
})

test('missing binary reports an actionable unavailable state', async () => {
  const service = new AgyAuthService({ binary: 'agy-auth-definitely-missing' })
  try {
    const state = await service.state()
    assert.equal(state.ok, false)
    assert.equal(state.available, false)
    assert.equal(state.error.code, 'agy_auth_not_found')
    assert.match(state.error.hint, /npm install -g/)
  } finally {
    service.dispose()
  }
})

test('rotate switches to another account', async () => {
  const { service, cleanup } = await fixture()
  try {
    await service.state()
    const result = await service.rotate({ force: true })
    assert.equal(result.ok, true)
    assert.equal(result.data.rotated, true)
    assert.notEqual(result.data.account.id, 'acct_personal01')
  } finally {
    await cleanup()
  }
})

test('resolveCommand unwraps a Windows npm shim', { skip: process.platform !== 'win32' }, async () => {
  const { mkdtemp, rm, writeFile } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const dir = await mkdtemp(join(tmpdir(), 'dsh-agy-auth-shim-'))
  try {
    const script = join(dir, 'launcher.mjs')
    await writeFile(script, 'process.exit(0)\n')
    const shim = join(dir, 'agy-auth.cmd')
    await writeFile(shim, '@echo off\r\nnode "%~dp0\\launcher.mjs" %*\r\n')
    const plan = resolveCommand(shim)
    assert.equal(plan.command, process.execPath)
    assert.deepEqual(plan.args, [script])
    assert.equal(plan.via, 'node-shim')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})