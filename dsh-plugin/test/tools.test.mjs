import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { AgyAuthService } from '../src/service.js'
import { createSeed } from './fake-state.mjs'
import { createTools } from '../src/tools.js'

const here = dirname(fileURLToPath(import.meta.url))
const fakeCli = join(here, 'fake-agy-auth.mjs')

/**
 * Create one tool set backed by the fake CLI.
 * @returns {Promise<{ tools: Map<string, any>, cleanup: () => Promise<void> }>} fixture.
 */
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-agy-auth-tools-'))
  const service = new AgyAuthService({
    binary: process.execPath,
    args: [fakeCli],
    env: { FAKE_AGY_STATE: join(dir, 'state.json') },
    listTtlMs: 0,
    statusTtlMs: 0,
    commandTimeoutMs: 20_000,
  })
  return {
    tools: new Map(createTools(service).map(tool => [tool.name, tool])),
    cleanup: async () => {
      service.dispose()
      await rm(dir, { recursive: true, force: true })
    },
  }
}

/**
 * Run one tool and project its model-facing text.
 * @param {any} tool - tool definition.
 * @param {Record<string, unknown>} args - tool arguments.
 * @returns {Promise<{ value: any, text: string }>} value and text.
 */
async function call(tool, args) {
  const value = await tool.execute(args)
  const content = tool.output.render(args, value)
  const text = content.filter(block => block.type === 'text').map(block => block.text).join('\n')
  return { value, text }
}

test('agy_auth_list returns accounts and a readable table', async () => {
  const { tools, cleanup } = await fixture()
  try {
    const { value, text } = await call(tools.get('agy_auth_list'), {})
    assert.equal(value.ok, true)
    assert.equal(value.accounts.length, 3)
    assert.match(text, /Stored Antigravity accounts: 3/)
    assert.match(text, /personal/)
    assert.match(text, /5h 74%/)
  } finally {
    await cleanup()
  }
})

test('agy_auth_switch renders the switched account', async () => {
  const { tools, cleanup } = await fixture()
  try {
    const { value, text } = await call(tools.get('agy_auth_switch'), { account: 'acct_work02' })
    assert.equal(value.ok, true)
    assert.match(text, /work/)
  } finally {
    await cleanup()
  }
})

test('agy_auth_switch reports an unknown account without throwing', async () => {
  const { tools, cleanup } = await fixture()
  try {
    const { value, text } = await call(tools.get('agy_auth_switch'), { account: 'missing' })
    assert.equal(value.ok, false)
    assert.equal(value.error.code, 'account_not_found')
    assert.match(text, /account_not_found/)
  } finally {
    await cleanup()
  }
})

test('agy_auth_remove requires explicit confirmation', async () => {
  const { tools, cleanup } = await fixture()
  try {
    const { value, text } = await call(tools.get('agy_auth_remove'), { account: 'acct_test03' })
    assert.equal(value.ok, false)
    assert.equal(value.error.code, 'confirmation_required')
    assert.match(text, /confirmation_required/)
    const confirmed = await call(tools.get('agy_auth_remove'), { account: 'acct_test03', confirm: true })
    assert.equal(confirmed.value.ok, true)
  } finally {
    await cleanup()
  }
})

test('agy_auth_alias sets an alias', async () => {
  const { tools, cleanup } = await fixture()
  try {
    const { value, text } = await call(tools.get('agy_auth_alias'), { account: 'acct_test03', alias: 'spare' })
    assert.equal(value.ok, true)
    assert.match(text, /Alias for test@example\.com set to "spare"/)
    const list = await call(tools.get('agy_auth_list'), {})
    assert.match(list.text, /spare/)
  } finally {
    await cleanup()
  }
})

test('agy_auth_status and agy_auth_usage render storage and groups', async () => {
  const { tools, cleanup } = await fixture()
  try {
    const status = await call(tools.get('agy_auth_status'), {})
    assert.equal(status.value.ok, true)
    assert.match(status.text, /Registry:/)
    const usage = await call(tools.get('agy_auth_usage'), {})
    assert.equal(usage.value.ok, true)
    assert.match(usage.text, /Gemini Models/)
  } finally {
    await cleanup()
  }
})

test('every tool declares a JSON schema and a renderer', async () => {
  const { tools, cleanup } = await fixture()
  try {
    assert.equal(tools.size, 8)
    for (const tool of tools.values()) {
      assert.equal(typeof tool.description, 'string')
      assert.equal(tool.parameters.type, 'object')
      assert.deepEqual(tool.output.schema, { type: 'object' })
      assert.equal(typeof tool.output.render, 'function')
    }
  } finally {
    await cleanup()
  }
})
