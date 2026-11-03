/**
 * Browser-side model for the Antigravity page.
 *
 * React-free: one snapshot, one listener set, and commands that own their
 * transport calls and polling. Components receive the snapshot through the
 * renderer-bound `useAgy` hook and commands through the inject face.
 */
import { ApiError, apiJson, apiPost } from './api.ts'
import type {
  AgyAuthActions, CleanResult, LoginSession, Notice, NoticeError, Snapshot, StateData, UsageData, UsageEnvelope,
} from './types.ts'

/** Mutation envelope shared by the Host routes. */
interface MutationEnvelope {
  ok: boolean
  error?: NoticeError
  warnings?: string[]
}

/** Login route envelope. */
interface LoginEnvelope {
  ok: boolean
  login: LoginSession | null
  error?: NoticeError
}

/** Store handle returned to the plugin body. */
export interface AgyAuthStore {
  source: {
    /** Current snapshot; identical between changes. */
    getSnapshot: () => Snapshot
    /** Subscribe to changes. */
    subscribe: (listener: () => void) => () => void
  }
  actions: AgyAuthActions
  /** Stop every timer. */
  dispose: () => void
}

const INITIAL: Snapshot = {
  phase: 'idle',
  data: null,
  usage: null,
  usageError: null,
  error: null,
  pending: null,
  refreshing: false,
  login: null,
  notice: null,
  lastRefresh: null,
}

/** Login states that still need polling. */
const LOGIN_ACTIVE = new Set<LoginSession['status']>(['starting', 'waiting', 'exchanging'])

/**
 * Convert any thrown value into a presentation notice.
 * @param error - thrown value.
 * @returns notice.
 */
function toNotice(error: unknown): Notice {
  if (error instanceof ApiError) return { tone: 'error', text: error.message, ...(error.hint === undefined ? {} : { hint: error.hint }) }
  return { tone: 'error', text: error instanceof Error ? error.message : String(error) }
}

/** Default silent refresh interval. */
const DEFAULT_POLL_MS = 30_000

/**
 * Create the page store.
 * @param options - polling configuration.
 * @returns store handle.
 */
export function createAgyAuthStore(options: { pollMs?: number } = {}): AgyAuthStore {
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS
  let snapshot: Snapshot = INITIAL
  const listeners = new Set<() => void>()
  let started = false
  let refreshing = false
  let refreshQueued = false
  let pollTimer: ReturnType<typeof setInterval> | undefined
  let loginTimer: ReturnType<typeof setInterval> | undefined
  let noticeTimer: ReturnType<typeof setTimeout> | undefined

  /**
   * Publish one patch and notify listeners.
   * @param patch - changed fields.
   */
  function publish(patch: Partial<Snapshot>): void {
    snapshot = { ...snapshot, ...patch }
    for (const listener of listeners) listener()
  }

  /**
   * Show a notice, replacing any current one.
   * @param notice - notice to show.
   */
  function notify(notice: Notice): void {
    clearTimeout(noticeTimer)
    publish({ notice })
    noticeTimer = setTimeout(() => {
      if (snapshot.notice === notice) publish({ notice: null })
    }, 9_000)
  }

  /**
   * Show a command failure.
   * @param error - error document or thrown value.
   */
  function notifyError(error: NoticeError | unknown): void {
    if (error !== null && typeof error === 'object' && 'code' in error && 'message' in error) {
      const doc = error as NoticeError
      notify({ tone: 'error', text: doc.message, ...(doc.hint === undefined ? {} : { hint: doc.hint }) })
      return
    }
    notify(toNotice(error))
  }

  /**
   * Show a command success, folding CLI warnings into the text.
   * @param text - success text.
   * @param warnings - CLI warnings.
   */
  function notifySuccess(text: string, warnings: string[] | undefined): void {
    const extra = warnings !== undefined && warnings.length > 0 ? ` ${warnings[0]}` : ''
    notify({ tone: 'success', text: `${text}.${extra}` })
  }

  /**
   * Read the page state from the Host.
   * @param force - bypass the Host cache.
   */
  async function refresh(force = false): Promise<void> {
    if (refreshing) {
      if (force) refreshQueued = true
      return
    }
    refreshing = true
    if (snapshot.data === null) publish({ phase: 'loading' })
    publish({ refreshing: true })
    try {
      const [stateResult, usageResult] = await Promise.allSettled([
        apiJson<StateData>(force ? '/state?force=1' : '/state'),
        apiJson<UsageEnvelope>(force ? '/usage?force=1' : '/usage'),
      ])
      if (stateResult.status === 'rejected') throw stateResult.reason
      const data = stateResult.value
      let usage: UsageData | null = snapshot.usage
      let usageError: NoticeError | null = null
      if (usageResult.status === 'fulfilled') {
        usage = usageResult.value.data ?? null
        usageError = null
      } else {
        const cause = usageResult.reason
        usageError = cause instanceof ApiError
          ? { code: cause.code, message: cause.message, ...(cause.hint === undefined ? {} : { hint: cause.hint }) }
          : { code: 'usage_unavailable', message: cause instanceof Error ? cause.message : String(cause) }
      }
      publish({ phase: 'ready', data, usage, usageError, error: null, lastRefresh: Date.now() })
    } catch (error) {
      if (error instanceof ApiError) {
        publish({ phase: snapshot.data === null ? 'error' : 'ready', error: { code: error.code, message: error.message, ...(error.hint === undefined ? {} : { hint: error.hint }) } })
      } else {
        publish({ phase: snapshot.data === null ? 'error' : 'ready', error: { code: 'network_error', message: toNotice(error).text } })
      }
    } finally {
      refreshing = false
      publish({ refreshing: false })
      if (refreshQueued) {
        refreshQueued = false
        void refresh(true)
      }
    }
  }

  /** Stop login polling. */
  function stopLoginPolling(): void {
    if (loginTimer !== undefined) clearInterval(loginTimer)
    loginTimer = undefined
  }

  /** Start login polling while a session is active. */
  function ensureLoginPolling(): void {
    if (loginTimer !== undefined) return
    loginTimer = setInterval(() => {
      void pollLogin()
    }, 1_200)
  }

  /** Poll the current login session once. */
  async function pollLogin(): Promise<void> {
    try {
      const result = await apiJson<LoginEnvelope>('/login')
      publish({ login: result.login })
      if (result.login === null || !LOGIN_ACTIVE.has(result.login.status)) {
        stopLoginPolling()
        if (result.login?.status === 'done') await refresh(true)
      }
    } catch {
      stopLoginPolling()
    }
  }

  /** Read the current login session once. */
  async function syncLogin(): Promise<void> {
    try {
      const result = await apiJson<LoginEnvelope>('/login')
      publish({ login: result.login })
      if (result.login !== null && LOGIN_ACTIVE.has(result.login.status)) ensureLoginPolling()
    } catch {
      // The Host may still be starting; the next poll retries.
    }
  }

  /** Stop the timers owned by a store with no listeners. */
  function stopTimers(): void {
    if (pollTimer !== undefined) clearInterval(pollTimer)
    pollTimer = undefined
    stopLoginPolling()
  }

  /** Start polling on the first subscriber. */
  function ensureStarted(): void {
    if (started) return
    started = true
    void refresh(false)
    void syncLogin()
    pollTimer = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') void refresh(false)
    }, pollMs)
  }

  /**
   * Run one command exclusively; a second command waits for the first.
   * @param key - pending key.
   * @param run - command body.
   * @returns the body's value, or undefined while busy.
   */
  async function exclusive<T>(key: string, run: () => Promise<T>): Promise<T | undefined> {
    if (snapshot.pending !== null) return undefined
    publish({ pending: key })
    try {
      return await run()
    } catch (error) {
      notifyError(error)
      return undefined
    } finally {
      publish({ pending: null })
    }
  }

  /**
   * Send one mutation and refresh on success.
   * @param path - API path.
   * @param body - JSON body.
   * @param success - success text.
   * @param key - pending key.
   * @returns whether the Host accepted it.
   */
  async function mutate(path: string, body: Record<string, unknown>, success: string, key: string): Promise<boolean> {
    const value = await exclusive(key, async () => {
      const result = await apiPost<MutationEnvelope>(path, body)
      if (!result.ok) {
        notifyError(result.error ?? { code: 'command_failed', message: 'the command failed' })
        return false
      }
      notifySuccess(success, result.warnings)
      await refresh(true)
      return true
    })
    return value === true
  }

  const actions: AgyAuthActions = {
    refresh: (force = true) => { void refresh(force) },
    async switchAccount(id) {
      await mutate('/switch', { account: id }, 'Switched the live Antigravity account', `switch:${id}`)
    },
    addAccount(alias) {
      return mutate('/add', alias.trim() === '' ? {} : { alias: alias.trim() }, 'Saved the live agy account', 'add')
    },
    setAlias(id, alias) {
      return mutate('/alias', { account: id, alias: alias.trim() }, alias.trim() === '' ? 'Cleared the alias' : 'Updated the alias', `alias:${id}`)
    },
    removeAccount(id, logout) {
      return mutate('/remove', { account: id, confirm: true, logout }, 'Removed the stored account', `remove:${id}`)
    },
    async rotate() {
      await mutate('/rotate', {}, 'Checked quota rotation', 'rotate')
    },
    async clean(dryRun) {
      const value = await exclusive('clean', async () => {
        const result = await apiPost<MutationEnvelope & { data?: CleanResult }>('/clean', { dryRun })
        if (!result.ok) {
          notifyError(result.error ?? { code: 'clean_failed', message: 'cleanup failed' })
          return null
        }
        if (!dryRun) {
          notifySuccess('Pruned managed backups and orphan snapshots', result.warnings)
          await refresh(true)
        }
        return result.data ?? null
      })
      return value ?? null
    },
    async startLogin(alias) {
      const value = await exclusive('login', async () => {
        const result = await apiPost<LoginEnvelope>('/login', alias.trim() === '' ? {} : { alias: alias.trim() })
        if (!result.ok) {
          notifyError(result.error ?? { code: 'login_failed', message: 'could not start sign-in' })
          return
        }
        publish({ login: result.login })
        ensureLoginPolling()
      })
      void value
    },
    async submitLoginCode(code) {
      const value = await exclusive('login-code', async () => {
        const result = await apiPost<LoginEnvelope>('/login/code', { code })
        if (!result.ok) {
          notifyError(result.error ?? { code: 'login_failed', message: 'could not submit the code' })
          return
        }
        publish({ login: result.login })
        ensureLoginPolling()
      })
      void value
    },
    async cancelLogin() {
      try {
        const result = await apiPost<LoginEnvelope>('/login/cancel')
        publish({ login: result.login })
        stopLoginPolling()
      } catch (error) {
        notifyError(error)
      }
    },
    dismissLogin() {
      stopLoginPolling()
      publish({ login: null })
    },
    dismissNotice() {
      clearTimeout(noticeTimer)
      publish({ notice: null })
    },
  }

  return {
    source: {
      getSnapshot: () => snapshot,
      subscribe(listener) {
        listeners.add(listener)
        ensureStarted()
        return () => {
          listeners.delete(listener)
          if (listeners.size === 0) {
            started = false
            stopTimers()
          }
        }
      },
    },
    actions,
    dispose() {
      started = false
      clearTimeout(noticeTimer)
      stopTimers()
      listeners.clear()
    },
  }
}