#!/usr/bin/env node
/**
 * Fake agy-auth CLI for tests and UI verification.
 *
 * It speaks the real versioned JSON envelope (schema_version 1) and keeps its
 * registry in the JSON file named by FAKE_AGY_STATE. It deliberately covers the
 * commands the plugin calls: version, path, status, list, switch, add, alias,
 * remove, rotate, clean, usage, login.
 */
import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { createSeed } from './fake-state.mjs'

const statePath = process.env.FAKE_AGY_STATE
if (statePath === undefined || statePath === '') {
  process.stderr.write('fake-agy-auth: FAKE_AGY_STATE is required\n')
  process.exit(2)
}

const now = () => new Date()
const iso = (offsetMs) => new Date(Date.now() + offsetMs).toISOString()

/** Read the fake registry, seeding it once when the file is missing. */
function load() {
  try {
    return JSON.parse(readFileSync(statePath, 'utf8'))
  } catch {
    // First use: another process may be seeding at the same moment.
  }
  const seed = createSeed()
  const temp = `${statePath}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(temp, JSON.stringify(seed, null, 2))
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      renameSync(temp, statePath)
      break
    } catch {
      pause(25)
    }
  }
  try {
    rmSync(temp, { force: true })
  } catch {
    // A successful rename already removed the source name.
  }
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      return JSON.parse(readFileSync(statePath, 'utf8'))
    } catch {
      pause(25)
    }
  }
  throw new Error('fake-agy-auth: state file never became readable')
}

/**
 * Block for a few milliseconds without starting a timer.
 * @param {number} ms - milliseconds.
 */
function pause(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/**
 * Persist the fake registry atomically.
 * @param {Record<string, any>} state - registry.
 */
function save(state) {
  const temp = `${statePath}.${process.pid}.tmp`
  writeFileSync(temp, JSON.stringify(state, null, 2))
  renameSync(temp, statePath)
}

/** Emit one envelope and exit. */
function emit(command, data, exit = 0) {
  process.stdout.write(`${JSON.stringify({ schema_version: 1, command, data })}\n`)
  process.exit(exit)
}

/** Emit one error envelope and exit. */
function fail(command, code, message, hint, exit = 1) {
  process.stdout.write(`${JSON.stringify({ schema_version: 1, command, error: { code, message, hint } })}\n`)
  process.exit(exit)
}

/**
 * Render one account row the way the real list command does.
 * @param {Record<string, any>} account - stored account.
 * @param {number} number - 1-based row.
 * @param {string} currentId - active account id.
 * @returns {Record<string, unknown>} row.
 */
function row(account, number, currentId) {
  return {
    number,
    id: account.id,
    active: account.id === currentId,
    stored: true,
    email: account.email,
    ...(account.alias === null ? {} : { alias: account.alias }),
    auth_method: account.auth_method,
    plan: account.plan,
    added_at: account.added_at,
    last_used_at: account.last_used_at,
    usage: account.usage,
  }
}

/**
 * Resolve one query the way the real registry does for exact forms.
 * @param {Record<string, any>} state - registry.
 * @param {string} query - account id, alias, email, or row number.
 * @returns {Record<string, any> | undefined} account.
 */
function resolve(state, query) {
  const value = query.trim()
  const number = Number(value)
  if (Number.isInteger(number) && number >= 1 && number <= state.accounts.length) return state.accounts[number - 1]
  return state.accounts.find(account =>
    account.id === value
    || account.alias === value
    || account.email === value
    || account.id.startsWith(value))
}

const raw = process.argv.slice(2).filter(arg => arg !== '--json' && arg !== '--no-color')
const command = raw[0]
const state = load()

if (command === 'version') {
  emit('version', { version: '0.3.0-fake' })
}
if (command === 'path') {
  emit('path', {
    registry: 'C:\\Users\\fake\\.config\\agy-auth',
    registry_file: 'C:\\Users\\fake\\.config\\agy-auth\\registry.json',
    accounts_dir: 'C:\\Users\\fake\\.config\\agy-auth\\accounts',
    encryption_key: 'C:\\Users\\fake\\.config\\agy-auth\\encryption.key',
    agy_token_file: 'C:\\Users\\fake\\.gemini\\antigravity-cli\\antigravity-oauth-token',
    keyring_service: 'gemini',
    keyring_user: 'antigravity',
    keyring_available: true,
  })
}
if (command === 'status') {
  const active = state.accounts.find(account => account.id === state.currentId)
  emit('status', {
    registry: 'C:\\Users\\fake\\.config\\agy-auth',
    registry_file: 'C:\\Users\\fake\\.config\\agy-auth\\registry.json',
    accounts_dir: 'C:\\Users\\fake\\.config\\agy-auth\\accounts',
    token_file: 'C:\\Users\\fake\\.gemini\\antigravity-cli\\antigravity-oauth-token',
    keyring_service: 'gemini',
    keyring_user: 'antigravity',
    keyring_available: true,
    mirror: 'in sync',
    running_agy: 0,
    stored_accounts: state.accounts.length,
    desktop_config: 'C:\\Users\\fake\\.config\\Antigravity',
    desktop_running: false,
    current: active === undefined ? null : {
      email: active.email,
      source: 'file',
      auth_method: active.auth_method,
      has_refresh: true,
      stored: true,
      expires_at: iso(3600 * 1000),
      expires_in: 'in 1 hour',
      expired: false,
      account_id: active.id,
    },
  })
}
if (command === 'list') {
  const delay = Number(process.env.FAKE_AGY_DELAY_MS ?? '0')
  setTimeout(() => {
    const accounts = state.accounts.map((account, index) => row(account, index + 1, state.currentId))
    const active = accounts.find(account => account.active) ?? null
    emit('list', { accounts, current: active })
  }, Number.isFinite(delay) ? delay : 0)
} else if (command === 'switch') {
  const target = raw[raw.indexOf('--target') + 1] ?? 'all'
  const account = resolve(state, raw[1] ?? '')
  if (account === undefined) fail('switch', 'account_not_found', `no account matches "${raw[1]}"`, 'Run agy-auth list.')
  state.currentId = account.id
  account.last_used_at = now().toISOString()
  save(state)
  emit('switch', {
    account: { id: account.id, email: account.email, alias: account.alias, auth_method: account.auth_method, plan: account.plan },
    target,
    cli_switched: target !== 'desktop',
    desktop_switched: false,
    desktop_relaunched: raw.includes('--relaunch'),
    written: ['keyring', 'file'],
  })
} else if (command === 'add') {
  const aliasIndex = raw.indexOf('--alias')
  const alias = aliasIndex >= 0 ? raw[aliasIndex + 1] : null
  let account = state.accounts.find(entry => entry.id === 'acct_live04')
  if (account === undefined) {
    account = {
      id: 'acct_live04',
      email: 'live@example.com',
      alias,
      plan: 'Pro',
      auth_method: 'consumer',
      added_at: now().toISOString(),
      last_used_at: now().toISOString(),
      usage: {
        five_hour: { remaining_percent: 100, resets_at: iso(5 * 3600 * 1000) },
        weekly: { remaining_percent: 100, resets_at: iso(7 * 86400 * 1000) },
        updated_at: now().toISOString(),
      },
    }
    state.accounts.push(account)
  } else if (alias !== null) {
    account.alias = alias
  }
  state.currentId = account.id
  save(state)
  emit('add', { created: true, account, source: 'file', desktop_captured: false })
} else if (command === 'alias') {
  const sub = raw[1]
  const account = resolve(state, raw[2] ?? '')
  if (account === undefined) fail('alias', 'account_not_found', 'no matching account', 'Run agy-auth list.')
  if (sub === 'set') account.alias = raw[3] ?? null
  else if (sub === 'clear') account.alias = null
  save(state)
  emit('alias', account)
} else if (command === 'remove') {
  const account = resolve(state, raw[1] ?? '')
  if (account === undefined) fail('remove', 'account_not_found', 'no matching account', 'Run agy-auth list.')
  state.accounts = state.accounts.filter(entry => entry.id !== account.id)
  if (state.currentId === account.id) state.currentId = null
  save(state)
  emit('remove', { removed: [account], logged_out: raw.includes('--logout') })
} else if (command === 'rotate') {
  const index = state.accounts.findIndex(account => account.id === state.currentId)
  const next = state.accounts[(index + 1) % state.accounts.length]
  state.currentId = next.id
  save(state)
  emit('rotate', {
    rotated: true,
    forced: raw.includes('--force'),
    reason: raw.includes('--force') ? 'forced' : 'active account exhausted',
    account: { id: next.id, email: next.email, alias: next.alias },
    target: 'all',
    cli_switched: true,
    desktop_switched: false,
    desktop_relaunched: false,
    written: ['file'],
  })
} else if (command === 'clean') {
  emit('clean', { dry_run: raw.includes('--dry-run'), backups: [], snapshots: [], preserved: false })
} else if (command === 'usage') {
  emit('usage', {
    accounts: state.accounts.map((account, index) => ({
      number: index + 1,
      id: account.id,
      email: account.email,
      alias: account.alias,
      active: account.id === state.currentId,
      description: 'Fake quota summary',
      updated_at: now().toISOString(),
      groups: [
        {
          name: 'Gemini Models',
          buckets: [
            { id: 'gemini-5h', name: 'Gemini 5h', window: '5h', remaining_fraction: account.usage.five_hour.remaining_percent / 100, remaining_percent: account.usage.five_hour.remaining_percent, reset_time: account.usage.five_hour.resets_at },
            { id: 'gemini-weekly', name: 'Gemini weekly', window: 'weekly', remaining_fraction: account.usage.weekly.remaining_percent / 100, remaining_percent: account.usage.weekly.remaining_percent, reset_time: account.usage.weekly.resets_at },
          ],
        },
      ],
    })),
  })
} else if (command === 'login') {
  const aliasIndex = raw.indexOf('--alias')
  const alias = aliasIndex >= 0 ? raw[aliasIndex + 1] : null
  process.stderr.write('Open this URL in a browser and approve access:\n\n')
  process.stderr.write('https://accounts.google.com/o/oauth2/v2/auth?client_id=fake&code_challenge=fake\n\n')
  process.stderr.write('After approving, antigravity.google/oauth-callback shows an authorization code.\n')
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity })
  lines.once('line', (line) => {
    if (line.trim() === 'bad-code') {
      fail('login', 'oauth_error', 'the authorization code is invalid', 'Copy the code shown after approving access and try again.')
    }
    const account = {
      id: 'acct_signin05',
      email: 'signed-in@example.com',
      alias,
      plan: 'Pro',
      auth_method: 'consumer',
      added_at: now().toISOString(),
      last_used_at: now().toISOString(),
      usage: {
        five_hour: { remaining_percent: 100, resets_at: iso(5 * 3600 * 1000) },
        weekly: { remaining_percent: 100, resets_at: iso(7 * 86400 * 1000) },
        updated_at: now().toISOString(),
      },
    }
    state.accounts.push(account)
    state.currentId = account.id
    save(state)
    emit('login', { created: true, account, written: ['keyring', 'file'] })
  })
} else {
  fail(command ?? 'help', 'usage', `unknown command "${command}"`, 'Run agy-auth help.', 2)
}
