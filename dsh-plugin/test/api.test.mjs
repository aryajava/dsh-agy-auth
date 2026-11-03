import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { apply } from '../src/index.js'
import { createSeed } from './fake-state.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const fakeCli = join(here, 'fake-agy-auth.mjs')

/**
 * Boot the Host half over a real HTTP server with captured registrations.
 * @param {{ deny?: boolean }} [options] - trust-fence switch.
 * @returns {Promise<{ base: string, tools: unknown[], close: () => Promise<void> }>} fixture.
 */
async function boot(options = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-agy-auth-api-'))
  const statePath = join(dir, 'state.json')
  writeFileSync(statePath, JSON.stringify(createSeed(), null, 2))
  const registrations = []
  const tools = []
  const ctx = {
    tools: { register: definition => { tools.push(definition) } },
    effect: (factory) => { const disposer = factory(); return () => { if (typeof disposer === 'function') disposer() } },
    get: name => name === 'connection'
      ? {
          requestRejection: req => (options.deny === true && req.headers['x-deny'] === '1' ? 401 : undefined),
        }
      : undefined,
    inject: (_deps, callback) => callback({
      effect: (factory) => { const disposer = factory(); return () => { if (typeof disposer === 'function') disposer() } },
      webServer: {
        register: (route) => {
          registrations.push(route)
          return () => {}
        },
      },
    }),
    logger: { warn: () => {} },
  }
  apply(ctx, {
    binary: process.execPath,
    args: [fakeCli],
    env: { FAKE_AGY_STATE: statePath },
    listTtlMs: 0,
    statusTtlMs: 0,
    commandTimeoutMs: 20_000,
    loginTimeoutMs: 20_000,
  })
  const route = registrations[0]
  const server = createServer((req, res) => { route.handler(req, res) })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  return {
    base: `http://127.0.0.1:${address.port}`,
    tools,
    close: async () => {
      await new Promise(resolve => server.close(resolve))
      await rm(dir, { recursive: true, force: true })
    },
  }
}

/**
 * Poll until a predicate holds.
 * @param {() => Promise<boolean>} predicate - condition.
 * @returns {Promise<void>} resolves when true.
 */
async function waitFor(predicate) {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    if (await predicate()) return
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  throw new Error('condition timed out')
}

test('registers the model tools and one API route', async () => {
  const fixture = await boot()
  try {
    assert.equal(fixture.tools.length, 9)
    assert.deepEqual(fixture.tools.map(tool => tool.name).sort(), [
      'agy_auth_add', 'agy_auth_alias', 'agy_auth_list', 'agy_auth_remove',
      'agy_auth_rotate', 'agy_auth_status', 'agy_auth_switch', 'agy_auth_usage',
      'agy_model_status',
    ])
  } finally {
    await fixture.close()
  }
})

test('GET /state returns the page state', async () => {
  const fixture = await boot()
  try {
    const response = await fetch(`${fixture.base}/agy-auth/api/state`)
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.ok, true)
    assert.equal(body.accounts.length, 3)
    assert.equal(body.current.alias, 'personal')
    assert.equal(body.version, '0.3.0-fake')
  } finally {
    await fixture.close()
  }
})

test('POST /switch switches and reports the account', async () => {
  const fixture = await boot()
  try {
    const response = await fetch(`${fixture.base}/agy-auth/api/switch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ account: 'acct_work02' }),
    })
    const body = await response.json()
    assert.equal(body.ok, true)
    const state = await (await fetch(`${fixture.base}/agy-auth/api/state`)).json()
    assert.equal(state.current.alias, 'work')
  } finally {
    await fixture.close()
  }
})

test('malformed requests fail before the CLI runs', async () => {
  const fixture = await boot()
  try {
    const wrongType = await fetch(`${fixture.base}/agy-auth/api/switch`, { method: 'POST', body: '{}' })
    assert.equal(wrongType.status, 400)
    assert.equal((await wrongType.json()).error.code, 'unsupported_media_type')

    const noConfirm = await fetch(`${fixture.base}/agy-auth/api/remove`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ account: 'acct_work02' }),
    })
    assert.equal(noConfirm.status, 400)
    assert.equal((await noConfirm.json()).error.code, 'confirmation_required')

    const missing = await fetch(`${fixture.base}/agy-auth/api/switch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    assert.equal(missing.status, 400)
    assert.equal((await missing.json()).error.code, 'invalid_input')
  } finally {
    await fixture.close()
  }
})

test('interactive login round trip through the API', async () => {
  const fixture = await boot()
  try {
    const started = await (await fetch(`${fixture.base}/agy-auth/api/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ alias: 'fresh' }),
    })).json()
    assert.equal(started.ok, true)

    await waitFor(async () => {
      const current = await (await fetch(`${fixture.base}/agy-auth/api/login`)).json()
      return typeof current.login?.url === 'string'
    })
    const accepted = await (await fetch(`${fixture.base}/agy-auth/api/login/code`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: 'good-code' }),
    })).json()
    assert.equal(accepted.ok, true)

    await waitFor(async () => {
      const current = await (await fetch(`${fixture.base}/agy-auth/api/login`)).json()
      return current.login?.status === 'done'
    })
    const state = await (await fetch(`${fixture.base}/agy-auth/api/state`)).json()
    assert.equal(state.current.alias, 'fresh')
    assert.equal(state.accounts.length, 4)
  } finally {
    await fixture.close()
  }
})

test('the trust fence rejects a denied request', async () => {
  const fixture = await boot({ deny: true })
  try {
    const response = await fetch(`${fixture.base}/agy-auth/api/state`, { headers: { 'x-deny': '1' } })
    assert.equal(response.status, 401)
  } finally {
    await fixture.close()
  }
})

test('unknown endpoints and methods answer 404 and 405', async () => {
  const fixture = await boot()
  try {
    assert.equal((await fetch(`${fixture.base}/agy-auth/api/nope`)).status, 404)
    assert.equal((await fetch(`${fixture.base}/agy-auth/api/state`, { method: 'POST' })).status, 405)
  } finally {
    await fixture.close()
  }
})