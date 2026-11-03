/**
 * Account service over the `agy-auth` JSON CLI.
 *
 * The service is the single owner of the CLI boundary: it resolves the
 * launcher, runs commands with deadlines, validates the versioned envelope,
 * caches `list`/`status`/`path` reads, and keeps one interactive OAuth login
 * session alive. Tools and HTTP routes both call this service.
 *
 * @module @fikrilal/dsh-agy-auth/service
 */
import { spawn } from 'node:child_process'
import { LaunchError, parseEnvelope, resolveCommand, runProcess, tailLine } from './command.js'

/** Default configuration applied over the Loader row's config object. */
export const DEFAULT_CONFIG = Object.freeze({
  binary: 'agy-auth',
  agyPath: '',
  args: [],
  env: {},
  commandTimeoutMs: 120_000,
  listTimeoutMs: 180_000,
  listTtlMs: 60_000,
  statusTtlMs: 30_000,
  loginTimeoutMs: 600_000,
})

/** Input rejected before it reaches the CLI. */
export class InputError extends Error {
  /**
   * @param {string} code - stable machine code.
   * @param {string} message - user-facing message.
   */
  constructor(code, message) {
    super(message)
    this.name = 'InputError'
    this.code = code
  }
}

/**
 * Merge the Loader row's config with defaults and validate every field.
 * @param {Record<string, unknown> | undefined} input - raw config.
 * @returns {typeof DEFAULT_CONFIG} normalized config.
 * @throws {InputError} for an invalid field.
 */
export function normalizeConfig(input) {
  const raw = input ?? {}
  const binary = raw.binary ?? DEFAULT_CONFIG.binary
  if (typeof binary !== 'string' || binary.trim() === '') {
    throw new InputError('invalid_config', 'binary must be a non-empty string')
  }
  const agyPath = raw.agyPath ?? DEFAULT_CONFIG.agyPath
  if (typeof agyPath !== 'string') throw new InputError('invalid_config', 'agyPath must be a string')
  const args = raw.args ?? DEFAULT_CONFIG.args
  if (!Array.isArray(args) || args.some(value => typeof value !== 'string')) {
    throw new InputError('invalid_config', 'args must be an array of strings')
  }
  const env = raw.env ?? DEFAULT_CONFIG.env
  if (typeof env !== 'object' || env === null || Array.isArray(env)) {
    throw new InputError('invalid_config', 'env must be an object of string values')
  }
  for (const value of Object.values(env)) {
    if (typeof value !== 'string') throw new InputError('invalid_config', 'env values must be strings')
  }
  /**
   * Read a bounded integer field.
   * @param {string} key - field name.
   * @param {number} minimum - inclusive minimum.
   * @returns {number} validated value.
   */
  const integer = (key, minimum) => {
    const value = raw[key] ?? DEFAULT_CONFIG[key]
    if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum) {
      throw new InputError('invalid_config', `${key} must be a number >= ${minimum}`)
    }
    return Math.floor(value)
  }
  return {
    binary: binary.trim(),
    agyPath: agyPath.trim(),
    args: [...args],
    env: { ...env },
    commandTimeoutMs: integer('commandTimeoutMs', 1_000),
    listTimeoutMs: integer('listTimeoutMs', 1_000),
    listTtlMs: integer('listTtlMs', 0),
    statusTtlMs: integer('statusTtlMs', 0),
    loginTimeoutMs: integer('loginTimeoutMs', 10_000),
  }
}

/**
 * Validate a non-empty user string.
 * @param {unknown} value - candidate.
 * @param {string} field - field name for the message.
 * @param {number} [max] - maximum length.
 * @returns {string} trimmed value.
 * @throws {InputError} when empty, non-string, too long, or carrying NUL.
 */
export function requireText(value, field, max = 320) {
  if (typeof value !== 'string') throw new InputError('invalid_input', `${field} must be a string`)
  const text = value.trim()
  if (text === '') throw new InputError('invalid_input', `${field} must not be empty`)
  if (text.length > max) throw new InputError('invalid_input', `${field} is too long`)
  if (text.includes('\u0000')) throw new InputError('invalid_input', `${field} contains a NUL byte`)
  return text
}

/**
 * Validate an account query that will be placed in argv.
 * @param {unknown} value - candidate.
 * @param {string} [field] - field name.
 * @returns {string} trimmed query.
 * @throws {InputError} when empty, too long, multi-line, or flag-like.
 */
export function requireQuery(value, field = 'account') {
  const text = requireText(value, field)
  if (text.startsWith('-')) throw new InputError('invalid_input', `${field} must not start with "-"`)
  if (/[\r\n]/.test(text)) throw new InputError('invalid_input', `${field} must not contain a line break`)
  return text
}

/**
 * Validate an alias value that will be placed in argv.
 * @param {unknown} value - candidate.
 * @returns {string} trimmed alias.
 * @throws {InputError} when empty, too long, or flag-like.
 */
export function requireAlias(value) {
  const text = requireText(value, 'alias', 32)
  if (text.startsWith('-')) throw new InputError('invalid_input', 'alias must not start with "-"')
  return text
}

/**
 * Validate a switch target.
 * @param {unknown} value - candidate.
 * @returns {'all' | 'cli' | 'desktop'} target.
 */
export function requireTarget(value) {
  if (value === undefined) return 'all'
  if (value === 'all' || value === 'cli' || value === 'desktop') return value
  throw new InputError('invalid_input', "target must be 'all', 'cli', or 'desktop'")
}

/**
 * Extract warning lines from CLI stderr.
 * @param {string} stderr - captured stderr.
 * @returns {string[]} warning texts.
 */
function stderrWarnings(stderr) {
  return stderr.split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.startsWith('warning:'))
    .map(line => line.slice('warning:'.length).trim())
    .filter(line => line !== '')
}

/** Terminal login states. */
const LOGIN_TERMINAL = new Set(['done', 'failed', 'cancelled'])

/** One interactive OAuth login started from the page. */
export class LoginManager {
  /**
   * @param {AgyAuthService} service - owner of the CLI launch plan.
   */
  constructor(service) {
    this.service = service
    /** @type {Record<string, any> | null} */
    this.current = null
    this.clearTimer = undefined
  }

  /**
   * Start one login process. Only one session can be active.
   * @param {string | undefined} alias - optional account alias.
   * @returns {Record<string, unknown>} public session snapshot.
   */
  async start(alias) {
    if (this.current !== null && !LOGIN_TERMINAL.has(this.current.status)) {
      throw new InputError('login_in_progress', 'a sign-in is already running')
    }
    clearTimeout(this.clearTimer)
    const label = alias === undefined || alias === '' ? undefined : requireAlias(alias)
    const plan = this.service.plan()
    const env = this.service.environment({ AGY_AUTH_NO_UPDATE_CHECK: '1' })
    const args = [...plan.args, '--json', '--no-color', 'login', '--no-browser']
    if (this.service.config.agyPath !== '') args.push('--agy', this.service.config.agyPath)
    if (label !== undefined) args.push('--alias', label)

    const session = {
      id: crypto.randomUUID(),
      status: 'starting',
      alias: label ?? null,
      url: null,
      startedAt: new Date().toISOString(),
      account: null,
      error: null,
      warnings: [],
      stdout: '',
      stderr: '',
      child: null,
      timedOut: false,
    }
    const child = spawn(plan.command, args, { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    session.child = child
    // The CLI can exit between a URL and a code; the write then fails with
    // EPIPE, which the close handler already reports as the session outcome.
    child.stdin.on('error', () => {})
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')

    const timeout = setTimeout(() => {
      session.timedOut = true
      child.kill('SIGKILL')
    }, this.service.config.loginTimeoutMs)
    timeout.unref()
    session.timeout = timeout

    child.stdout.on('data', (chunk) => {
      session.stdout += chunk
      if (session.stdout.length > 2_000_000) session.stdout = session.stdout.slice(-1_000_000)
    })
    child.stderr.on('data', (chunk) => {
      session.stderr += chunk
      if (session.stderr.length > 200_000) session.stderr = session.stderr.slice(-100_000)
      if (session.url === null) {
        const match = /https:\/\/[^\s"'<>]+/.exec(session.stderr)
        if (match !== null) {
          session.url = match[0]
          if (session.status === 'starting') session.status = 'waiting'
        }
      }
    })
    child.on('error', (error) => {
      this.finish(session, null, error)
    })
    child.on('close', (code) => {
      this.finish(session, code)
    })

    this.current = session
    return this.snapshot()
  }

  /**
   * Deliver the authorization code to the waiting CLI process.
   * @param {string} code - code shown by the Google callback page.
   * @returns {Record<string, unknown>} public session snapshot.
   */
  submitCode(code) {
    const session = this.active('waiting')
    const value = requireText(code, 'code', 8_192)
    if (/[\r\n]/.test(value)) throw new InputError('invalid_input', 'code must be one line')
    session.status = 'exchanging'
    session.child.stdin.write(`${value}\n`)
    return this.snapshot()
  }

  /**
   * Cancel the active session.
   * @returns {Record<string, unknown> | null} public session snapshot.
   */
  cancel() {
    const session = this.current
    if (session === null || LOGIN_TERMINAL.has(session.status)) return this.snapshot()
    session.status = 'cancelled'
    session.child?.kill('SIGKILL')
    return this.snapshot()
  }

  /**
   * Settle one session from its process outcome.
   * @param {Record<string, any>} session - session record.
   * @param {number | null} code - child exit code.
   * @param {Error} [spawnError] - spawn failure.
   */
  finish(session, code, spawnError) {
    if (session.finished === true) return
    session.finished = true
    clearTimeout(session.timeout)
    session.child = null
    if (session.status === 'cancelled') {
      session.status = 'cancelled'
    } else if (spawnError !== undefined) {
      session.status = 'failed'
      session.error = { code: 'agy_auth_spawn_failed', message: spawnError.message }
    } else if (session.timedOut) {
      session.status = 'failed'
      session.error = { code: 'login_timeout', message: 'the sign-in timed out; start again' }
    } else {
      const envelope = parseEnvelope(session.stdout)
      if (envelope !== undefined && typeof envelope.error === 'object' && envelope.error !== null) {
        const doc = envelope.error
        session.status = 'failed'
        session.error = {
          code: String(doc.code ?? 'login_failed'),
          message: String(doc.message ?? 'sign-in failed'),
          ...(typeof doc.hint === 'string' ? { hint: doc.hint } : {}),
        }
      } else if (code === 0 && envelope !== undefined && typeof envelope.data === 'object' && envelope.data !== null) {
        session.status = 'done'
        session.account = envelope.data.account ?? null
        session.warnings = stderrWarnings(session.stderr)
      } else {
        session.status = 'failed'
        session.error = {
          code: 'login_failed',
          message: tailLine(session.stderr) || `agy-auth login exited with code ${String(code)}`,
        }
      }
    }
    this.service.invalidate()
    this.clearTimer = setTimeout(() => {
      if (this.current === session) this.current = null
    }, 300_000)
    this.clearTimer.unref()
  }

  /**
   * Require an active session in one of the given states.
   * @param {...string} states - acceptable states.
   * @returns {Record<string, any>} active session.
   */
  active(...states) {
    const session = this.current
    if (session === null || !states.includes(session.status)) {
      throw new InputError('login_not_waiting', 'the sign-in is not waiting for an authorization code')
    }
    return session
  }

  /**
   * Public, secret-free session view.
   * @returns {Record<string, unknown> | null} snapshot.
   */
  snapshot() {
    const session = this.current
    if (session === null) return null
    return {
      id: session.id,
      status: session.status,
      alias: session.alias,
      url: session.url,
      startedAt: session.startedAt,
      account: session.account,
      error: session.error,
      warnings: session.warnings,
    }
  }

  /** Stop the active session and its timer. */
  dispose() {
    clearTimeout(this.clearTimer)
    if (this.current !== null) {
      clearTimeout(this.current.timeout)
      this.current.child?.kill('SIGKILL')
    }
  }
}

/** Account and quota operations over the CLI. */
export class AgyAuthService {
  /**
   * @param {Record<string, unknown>} [config] - Loader row config.
   */
  constructor(config) {
    this.config = normalizeConfig(config)
    this.login = new LoginManager(this)
    /** @type {Map<string, { at: number, value: unknown, pending?: Promise<unknown> }>} */
    this.cache = new Map()
    /** Bumped by invalidation so an older in-flight read cannot rewrite the cache. */
    this.generation = 0
    /** @type {ReturnType<typeof resolveCommand> | undefined} */
    this.cachedPlan = undefined
    /** Set by the model-provider assembly for status diagnostics. */
    this.modelStatus = undefined
  }

  /**
   * Resolve the CLI launch plan, caching only success.
   * @returns {ReturnType<typeof resolveCommand>} plan.
   * @throws {LaunchError} when unavailable.
   */
  plan() {
    if (this.cachedPlan !== undefined) return this.cachedPlan
    this.cachedPlan = resolveCommand(this.config.binary, this.config.args)
    return this.cachedPlan
  }

  /**
   * Child environment: the host environment plus the plugin's overrides.
   * @param {Record<string, string>} [extra] - additional values.
   * @returns {NodeJS.ProcessEnv} environment.
   */
  environment(extra = {}) {
    return {
      ...process.env,
      AGY_AUTH_NO_UPDATE_CHECK: '1',
      ...this.config.env,
      ...extra,
    }
  }

  /**
   * Describe the current launch resolution without starting a process.
   * @returns {Record<string, unknown>} availability facts.
   */
  binaryInfo() {
    try {
      const plan = this.plan()
      return {
        configured: this.config.binary,
        available: true,
        resolved: plan.source,
        via: plan.via,
        error: null,
      }
    } catch (error) {
      return {
        configured: this.config.binary,
        available: false,
        resolved: null,
        via: null,
        error: error instanceof LaunchError
          ? { code: error.code, message: error.message, hint: error.hint }
          : { code: 'agy_auth_unavailable', message: String(error) },
      }
    }
  }

  /**
   * Convert a launch failure into a result.
   * @param {unknown} error - thrown launcher error.
   * @returns {{ ok: false, error: Record<string, unknown> }} result.
   */
  static launchFailure(error) {
    return {
      ok: false,
      error: error instanceof LaunchError
        ? { code: error.code, message: error.message, ...(error.hint === undefined ? {} : { hint: error.hint }) }
        : { code: 'agy_auth_unavailable', message: error instanceof Error ? error.message : String(error) },
      warnings: [],
    }
  }

  /**
   * Run one CLI command and validate its envelope.
   * @param {string[]} args - CLI arguments after the global flags.
   * @param {{ signal?: AbortSignal, timeoutMs?: number, stdin?: string }} [options] - invocation options.
   * @returns {Promise<{ ok: boolean, data?: unknown, error?: Record<string, unknown>, warnings: string[] }>} result.
   */
  async invoke(args, options = {}) {
    if (options.signal?.aborted === true) {
      return { ok: false, error: { code: 'cancelled', message: 'the call was cancelled' }, warnings: [] }
    }
    let plan
    try {
      plan = this.plan()
    } catch (error) {
      return AgyAuthService.launchFailure(error)
    }
    const timeoutMs = options.timeoutMs ?? (args[0] === 'list' ? this.config.listTimeoutMs : this.config.commandTimeoutMs)
    let outcome
    try {
      outcome = await runProcess({
        command: plan.command,
        args: [...plan.args, '--json', '--no-color', ...args],
        env: this.environment(),
        timeoutMs,
        ...(options.stdin === undefined ? {} : { stdin: options.stdin }),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      })
    } catch (error) {
      return AgyAuthService.launchFailure(error)
    }
    const warnings = stderrWarnings(outcome.stderr)
    if (outcome.timedOut) {
      return {
        ok: false,
        error: { code: 'timeout', message: `agy-auth ${args[0]} timed out after ${timeoutMs}ms` },
        warnings,
      }
    }
    const envelope = parseEnvelope(outcome.stdout)
    if (envelope !== undefined && typeof envelope.error === 'object' && envelope.error !== null) {
      const doc = envelope.error
      return {
        ok: false,
        error: {
          code: String(doc.code ?? 'command_failed'),
          message: String(doc.message ?? 'agy-auth failed'),
          ...(typeof doc.hint === 'string' ? { hint: doc.hint } : {}),
          ...(Array.isArray(doc.candidates) ? { candidates: doc.candidates } : {}),
        },
        warnings,
      }
    }
    if (outcome.code !== 0) {
      return {
        ok: false,
        error: {
          code: 'command_failed',
          message: tailLine(outcome.stderr) || tailLine(outcome.stdout)
            || `agy-auth ${args[0]} exited with code ${String(outcome.code)}`,
        },
        warnings,
      }
    }
    if (envelope === undefined) {
      return {
        ok: false,
        error: { code: 'unexpected_output', message: `agy-auth ${args[0]} did not print a JSON envelope` },
        warnings,
      }
    }
    return { ok: true, data: envelope.data ?? null, warnings }
  }

  /**
   * Memoize one read with a TTL and in-flight coalescing.
   * @template T
   * @param {string} key - cache key.
   * @param {number} ttlMs - freshness window.
   * @param {() => Promise<T>} producer - read.
   * @param {boolean} force - ignore a fresh entry.
   * @returns {Promise<T>} value.
   */
  async memo(key, ttlMs, producer, force = false) {
    const entry = this.cache.get(key)
    if (entry !== undefined) {
      if (entry.pending !== undefined) return entry.pending
      if (!force && Date.now() - entry.at < ttlMs) return entry.value
    }
    const generation = this.generation
    const pending = producer().then((value) => {
      if (generation === this.generation) this.cache.set(key, { at: Date.now(), value })
      return value
    }, (error) => {
      if (generation === this.generation) this.cache.delete(key)
      throw error
    })
    this.cache.set(key, { at: 0, value: undefined, pending })
    return pending
  }

  /** Drop cached reads after a mutation or a sign-in. */
  invalidate() {
    this.generation += 1
    this.cache.delete('list')
    this.cache.delete('status')
    this.cache.delete('path')
  }

  /**
   * Read the complete page state.
   * @param {{ force?: boolean, signal?: AbortSignal }} [options] - read options.
   * @returns {Promise<Record<string, unknown>>} page state.
   */
  async state(options = {}) {
    const binary = this.binaryInfo()
    const base = {
      ok: false,
      available: binary.available,
      binary,
      version: null,
      accounts: [],
      current: null,
      status: null,
      paths: null,
      error: binary.error,
      statusError: null,
      warnings: [],
      fetchedAt: new Date().toISOString(),
    }
    if (!binary.available) return base
    const force = options.force === true
    const signal = options.signal
    const [list, status, paths, version] = await Promise.all([
      this.memo('list', this.config.listTtlMs, () => this.invoke(['list'], { signal }), force),
      this.memo('status', this.config.statusTtlMs, () => this.invoke(['status'], { signal }), force),
      this.memo('path', this.config.statusTtlMs, () => this.invoke(['path'], { signal }), force),
      this.memo('version', this.config.statusTtlMs, () => this.invoke(['version'], { signal }), false),
    ])
    return {
      ...base,
      ok: list.ok,
      version: version.ok ? version.data?.version ?? null : null,
      accounts: list.ok ? list.data?.accounts ?? [] : [],
      current: list.ok ? list.data?.current ?? null : null,
      status: status.ok ? status.data : null,
      paths: paths.ok ? paths.data : null,
      error: list.ok ? null : list.error,
      statusError: status.ok ? null : status.error,
      warnings: [...list.warnings, ...status.warnings].slice(0, 10),
      fetchedAt: new Date().toISOString(),
    }
  }

  /**
   * Read storage health without the quota list.
   * @param {{ force?: boolean, signal?: AbortSignal }} [options] - read options.
   * @returns {Promise<Record<string, unknown>>} status view.
   */
  async statusView(options = {}) {
    const binary = this.binaryInfo()
    const base = {
      ok: false,
      available: binary.available,
      binary,
      version: null,
      status: null,
      paths: null,
      current: null,
      error: binary.error,
      warnings: [],
      fetchedAt: new Date().toISOString(),
    }
    if (!binary.available) return base
    const force = options.force === true
    const signal = options.signal
    const [status, paths, version] = await Promise.all([
      this.memo('status', this.config.statusTtlMs, () => this.invoke(['status'], { signal }), force),
      this.memo('path', this.config.statusTtlMs, () => this.invoke(['path'], { signal }), force),
      this.memo('version', this.config.statusTtlMs, () => this.invoke(['version'], { signal }), force),
    ])
    return {
      ...base,
      ok: status.ok,
      version: version.ok ? version.data?.version ?? null : null,
      status: status.ok ? status.data : null,
      paths: paths.ok ? paths.data : null,
      current: status.ok ? status.data?.current ?? null : null,
      error: status.ok ? null : status.error,
      warnings: status.warnings,
      fetchedAt: new Date().toISOString(),
    }
  }

  /**
   * Switch the active account.
   * @param {string} account - account query.
   * @param {{ target?: unknown, relaunch?: boolean, signal?: AbortSignal }} [options] - switch options.
   * @returns {Promise<Record<string, unknown>>} result.
   */
  async switch(account, options = {}) {
    const query = requireQuery(account, 'account')
    const target = requireTarget(options.target)
    const args = ['switch', query, '--target', target]
    if (options.relaunch === true) args.push('--relaunch')
    const result = await this.invoke(args, { signal: options.signal })
    if (result.ok) this.invalidate()
    return result
  }

  /**
   * Save the account currently signed in to agy.
   * @param {{ alias?: string, target?: unknown, signal?: AbortSignal }} [options] - capture options.
   * @returns {Promise<Record<string, unknown>>} result.
   */
  async add(options = {}) {
    const target = requireTarget(options.target)
    const args = ['add', '--target', target]
    const alias = options.alias === undefined || options.alias === '' ? undefined : requireAlias(options.alias)
    if (alias !== undefined) args.push('--alias', alias)
    const result = await this.invoke(args, { signal: options.signal })
    if (result.ok) this.invalidate()
    return result
  }

  /**
   * Set or clear one account alias.
   * @param {string} account - account query.
   * @param {string} alias - new alias, or an empty string to clear.
   * @param {{ signal?: AbortSignal }} [options] - call options.
   * @returns {Promise<Record<string, unknown>>} result.
   */
  async setAlias(account, alias, options = {}) {
    const query = requireQuery(account, 'account')
    const value = typeof alias === 'string' ? alias.trim() : ''
    const args = value === '' ? ['alias', 'clear', query] : ['alias', 'set', query, requireAlias(value)]
    const result = await this.invoke(args, { signal: options.signal })
    if (result.ok) this.invalidate()
    return result
  }

  /**
   * Remove one stored account.
   * @param {string} account - account query.
   * @param {{ logout?: boolean, signal?: AbortSignal }} [options] - removal options.
   * @returns {Promise<Record<string, unknown>>} result.
   */
  async remove(account, options = {}) {
    const query = requireQuery(account, 'account')
    const args = ['remove', query, '--yes']
    if (options.logout === true) args.push('--logout')
    const result = await this.invoke(args, { signal: options.signal })
    if (result.ok) this.invalidate()
    return result
  }

  /**
   * Switch to the healthiest account when the active one is exhausted.
   * @param {{ force?: boolean, target?: unknown, relaunch?: boolean, signal?: AbortSignal }} [options] - rotate options.
   * @returns {Promise<Record<string, unknown>>} result.
   */
  async rotate(options = {}) {
    const target = requireTarget(options.target)
    const args = ['rotate', '--target', target]
    if (options.force === true) args.push('--force')
    if (options.relaunch === true) args.push('--relaunch')
    const result = await this.invoke(args, { signal: options.signal })
    if (result.ok) this.invalidate()
    return result
  }

  /**
   * Prune managed backups and orphan snapshots.
   * @param {{ dryRun?: boolean, signal?: AbortSignal }} [options] - clean options.
   * @returns {Promise<Record<string, unknown>>} result.
   */
  async clean(options = {}) {
    const args = ['clean']
    if (options.dryRun === true) args.push('--dry-run')
    return this.invoke(args, { signal: options.signal })
  }

  /**
   * Read every account's quota groups.
   * @param {{ signal?: AbortSignal }} [options] - call options.
   * @returns {Promise<Record<string, unknown>>} result.
   */
  async usageAll(options = {}) {
    return this.invoke(['usage', '--all'], { signal: options.signal })
  }

  /** Stop timers and child processes owned by the service. */
  dispose() {
    this.login.dispose()
  }
}