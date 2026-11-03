/** Wire and view types shared by the browser half. */

/** One quota window returned by the CLI. */
export interface QuotaWindow {
  remaining_percent?: number
  resets_at?: string
  group?: string
}

/** One bucket from `agy-auth usage --all --json`. */
export interface QuotaBucket {
  id?: string
  name?: string
  description?: string
  window?: string
  remaining_fraction?: number
  remaining_percent?: number
  reset_time?: string
}

/** One model-family quota group. */
export interface QuotaGroup {
  name?: string
  description?: string
  buckets?: QuotaBucket[]
}

/** One account's quota groups. */
export interface UsageAccount {
  id?: string
  number?: number
  alias?: string
  active?: boolean
  updated_at?: string
  groups?: QuotaGroup[]
}

/** `agy-auth usage --all --json` data payload. */
export interface UsageData {
  accounts?: UsageAccount[]
}

/** CLI envelope carrying usage groups. */
export interface UsageEnvelope {
  ok?: boolean
  data?: UsageData
  error?: NoticeError
}

/** One account row from `agy-auth list --json`. */
export interface AccountRow {
  number?: number
  id?: string
  active: boolean
  stored: boolean
  email?: string
  alias?: string
  auth_method?: string
  expires_at?: string
  expired: boolean
  added_at?: string
  last_used_at?: string
  source?: string
  plan?: string
  usage?: {
    five_hour?: QuotaWindow
    weekly?: QuotaWindow
    updated_at?: string
    stale?: boolean
  }
  usage_error?: string
}

/** Error document carried by the Host API and the CLI envelope. */
export interface NoticeError {
  code: string
  message: string
  hint?: string
  candidates?: Array<{ id: string; email?: string; alias?: string; number?: number }>
}

/** `agy-auth status --json` payload. */
export interface StatusData {
  registry?: string
  registry_file?: string
  accounts_dir?: string
  token_file?: string
  keyring_service?: string
  keyring_user?: string
  keyring_available?: boolean
  mirror?: string
  running_agy?: number
  stored_accounts?: number
  desktop_config?: string
  desktop_running?: boolean
  desktop_pid?: number
  current?: {
    email?: string
    source?: string
    auth_method?: string
    has_refresh?: boolean
    stored?: boolean
    expires_at?: string | null
    expires_in?: string
    expired?: boolean
    account_id?: string
  } | null
}

/** `agy-auth path --json` payload. */
export interface PathsData {
  registry?: string
  registry_file?: string
  accounts_dir?: string
  encryption_key?: string
  agy_token_file?: string
  keyring_service?: string
  keyring_user?: string
  keyring_available?: boolean
}

/** One aggregated page state. */
export interface StateData {
  ok: boolean
  available: boolean
  binary: {
    configured: string
    available: boolean
    resolved?: string | null
    via?: string | null
    error: NoticeError | null
  }
  version: string | null
  accounts: AccountRow[]
  current: AccountRow | null
  status: StatusData | null
  paths: PathsData | null
  error: NoticeError | null
  statusError: NoticeError | null
  warnings: string[]
  fetchedAt: string
}

/** Interactive sign-in session. */
export interface LoginSession {
  id: string
  status: 'starting' | 'waiting' | 'exchanging' | 'done' | 'failed' | 'cancelled'
  alias: string | null
  url: string | null
  startedAt: string
  account: AccountRow | null
  error: NoticeError | null
  warnings: string[]
}

/** Presentation notice shown above the account list. */
export interface Notice {
  tone: 'success' | 'error' | 'info'
  text: string
  hint?: string
}

/** Cleanup result. */
export interface CleanResult {
  dry_run: boolean
  backups: string[]
  snapshots: string[]
  preserved?: boolean
}

/** Complete presentation snapshot. */
export interface Snapshot {
  phase: 'idle' | 'loading' | 'ready' | 'error'
  data: StateData | null
  usage: UsageData | null
  usageError: NoticeError | null
  error: NoticeError | null
  pending: string | null
  refreshing: boolean
  login: LoginSession | null
  notice: Notice | null
  lastRefresh: number | null
}

/** Commands exposed to the page. */
export interface AgyAuthActions {
  refresh: (force?: boolean) => void
  switchAccount: (id: string) => Promise<void>
  addAccount: (alias: string) => Promise<boolean>
  setAlias: (id: string, alias: string) => Promise<boolean>
  removeAccount: (id: string, logout: boolean) => Promise<boolean>
  rotate: () => Promise<void>
  clean: (dryRun: boolean) => Promise<CleanResult | null>
  startLogin: (alias: string) => Promise<void>
  submitLoginCode: (code: string) => Promise<void>
  cancelLogin: () => Promise<void>
  dismissLogin: () => void
  dismissNotice: () => void
}

/** Props injected into the registered page and icon components. */
export interface AgyAuthInjected {
  useAgy: <T>(selector: (snapshot: Snapshot) => T) => T
  actions: AgyAuthActions
}