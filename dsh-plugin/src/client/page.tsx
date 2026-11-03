/** Antigravity accounts page: accounts, quota, actions, and storage health. */
import { useState } from 'react'
import {
  Button, IconCloseOutlineRegular, IconPlusOutlineRegular, IconRefreshOutlineRegular,
  IconUserOutlineRegular, IconUsersOutlineRegular, IconWarningTriangleOutlineRegular, StateDot, Tag,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { AccountCard } from './AccountCard.tsx'
import { AddAccountDialog, AliasDialog, CleanDialog, LoginDialog, RemoveDialog } from './dialogs.tsx'
import { formatAbsolute } from './format.ts'
import { useI18n } from './i18n.tsx'
import type { AccountRow, AgyAuthInjected, CleanResult, StateData } from './types.ts'

/** Whether a sign-in session still needs a code. */
function loginNeedsAttention(state: { status: string } | null): boolean {
  return state !== null && (state.status === 'starting' || state.status === 'waiting' || state.status === 'exchanging')
}

/** Props for the storage panel. */
interface StorageCardProps {
  data: StateData
  onClean: () => void
  busy: boolean
}

/**
 * Render storage paths and credential health.
 * @param props.data - page state.
 * @param props.onClean - cleanup preview command.
 * @param props.busy - whether a command is running.
 * @returns the storage card.
 */
function StorageCard({ data, onClean, busy }: StorageCardProps) {
  const { t } = useI18n()
  const status = data.status
  const paths = data.paths
  const keyring = (paths?.keyring_service ?? status?.keyring_service ?? 'gemini') + ' / ' + (paths?.keyring_user ?? status?.keyring_user ?? 'antigravity')
  const keyringAvailable = paths?.keyring_available ?? status?.keyring_available
  const running = status?.running_agy
  const versionLine = (data.version ?? 'unknown version')
    + (data.binary.resolved === null || data.binary.resolved === undefined ? '' : ' · ' + data.binary.resolved)
  const rows: Array<{ label: string; value: string; mono?: boolean }> = [
    { label: t('Registry'), value: paths?.registry ?? status?.registry ?? t('unknown'), mono: true },
    { label: t('Accounts'), value: paths?.accounts_dir ?? status?.accounts_dir ?? t('unknown'), mono: true },
    { label: t('Token file'), value: paths?.agy_token_file ?? status?.token_file ?? t('unknown'), mono: true },
    { label: t('Encryption key'), value: paths?.encryption_key ?? t('unknown'), mono: true },
    { label: t('Keyring'), value: keyring },
    { label: t('Credential mirror'), value: status?.mirror ?? t('unknown') },
    {
      label: t('agy processes'),
      value: running === undefined || running < 0 ? t('unknown') : running === 0 ? t('not running') : t('{count} running', { count: running }),
    },
    {
      label: t('Antigravity Desktop'),
      value: status?.desktop_running === undefined ? t('unknown') : status.desktop_running ? t('running') : t('not running'),
    },
    { label: t('CLI'), value: versionLine, mono: true },
  ]
  return (
    <section className="agy-storage" aria-label="Storage and credential health">
      <div className="agy-section-head">
        <div>
          <h2>{t('Storage and credential health')}</h2>
          <p>{t('Snapshots and backups live under the agy-auth registry. Back up the encryption key separately.')}</p>
        </div>
        <div className="agy-section-actions">
          {keyringAvailable !== undefined && (
            <Tag tone={keyringAvailable ? 'success' : 'warning'}>{keyringAvailable ? t('Keyring available') : t('File storage only')}</Tag>
          )}
          <Button size="sm" variant="outline" disabled={busy} onClick={onClean}>{t('Clean storage…')}</Button>
        </div>
      </div>
      <dl className="agy-facts">
        {rows.map(row => (
          <div className="agy-fact" key={row.label}>
            <dt>{row.label}</dt>
            <dd className={row.mono === true ? 'agy-mono' : undefined} title={row.value}>{row.value}</dd>
          </div>
        ))}
      </dl>
      {data.statusError !== null && (
        <p className="agy-usage-error">{t('Storage status unavailable: {message}', { message: data.statusError.message })}</p>
      )}
    </section>
  )
}

/**
 * Render the Antigravity accounts page.
 * @param props - renderer-bound snapshot hook and commands.
 * @returns the page.
 */
export function AgyAuthPage({ useAgy, actions }: AgyAuthInjected) {
  const { lang, setLang, t } = useI18n()
  const snapshot = useAgy(state => state)
  const data = snapshot.data
  const accounts = data?.accounts ?? []
  const pending = snapshot.pending
  const notice = snapshot.notice
  const login = snapshot.login
  const [addOpen, setAddOpen] = useState(false)
  const [loginOpen, setLoginOpen] = useState(false)
  const [aliasAccount, setAliasAccount] = useState<AccountRow | null>(null)
  const [removeAccount, setRemoveAccount] = useState<AccountRow | null>(null)
  const [cleanOpen, setCleanOpen] = useState(false)
  const [cleanPreview, setCleanPreview] = useState<CleanResult | null>(null)
  const busy = pending !== null

  /** Open the sign-in dialog, resetting a finished session first. */
  const openLogin = (): void => {
    if (login !== null && (login.status === 'done' || login.status === 'failed' || login.status === 'cancelled')) {
      actions.dismissLogin()
    }
    setLoginOpen(true)
  }

  /** Preview cleanup and open its confirmation. */
  const previewClean = (): void => {
    void actions.clean(true).then((result) => {
      if (result === null) return
      setCleanPreview(result)
      setCleanOpen(true)
    })
  }

  const usageById = new Map((snapshot.usage?.accounts ?? []).map(entry => [entry.id ?? '', entry]))
  const current = data?.current ?? null
  const liveUnstored = current !== null && current.stored === false
  const updated = snapshot.lastRefresh === null ? null : formatAbsolute(new Date(snapshot.lastRefresh).toISOString())
  const accountCount = accounts.length === 1 ? t('1 stored account') : t('{count} stored accounts', { count: accounts.length })

  return (
    <div className="agy-page">
      <div className="agy-page-inner">
        <header className="agy-head">
          <div className="agy-head-copy">
            <h1>{t('Antigravity Accounts')}</h1>
            <p>{t('Switch the live agy credential, save accounts, and watch plan quota.')}</p>
          </div>
          <div className="agy-head-actions">
            {updated !== null && <span className="agy-updated">{t('Updated {time}', { time: updated })}</span>}
            <Button
              size="sm"
              variant="ghost"
              aria-label={lang === 'en' ? t('Switch to Indonesian') : t('Switch to English')}
              title={lang === 'en' ? t('Switch to Indonesian') : t('Switch to English')}
              onClick={() => { setLang(lang === 'en' ? 'id' : 'en') }}
            >
              {lang === 'en' ? 'ID' : 'EN'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label={t('Refresh accounts and quota')}
              title={t('Refresh accounts and quota')}
              disabled={snapshot.refreshing}
              icon={snapshot.refreshing ? <StateDot state="ongoing" size={14} /> : <IconRefreshOutlineRegular size={14} />}
              onClick={() => { actions.refresh(true) }}
            />
            <Button size="sm" variant="outline" disabled={busy || accounts.length === 0} onClick={() => { void actions.rotate() }}>
              {pending === 'rotate' ? t('Rotating…') : t('Rotate quota')}
            </Button>
            <Button size="sm" variant="outline" icon={<IconPlusOutlineRegular size={14} />} disabled={busy} onClick={() => { setAddOpen(true) }}>
              {t('Save current')}
            </Button>
            <Button size="sm" variant="primary" icon={<IconUserOutlineRegular size={14} />} disabled={busy} onClick={openLogin}>
              {t('Sign in')}
            </Button>
          </div>
        </header>

        {notice !== null && (
          <div className="agy-notice" data-tone={notice.tone} role="status">
            <div>
              <p>{notice.text}</p>
              {notice.hint !== undefined && <p className="agy-notice-hint">{notice.hint}</p>}
            </div>
            <button type="button" className="agy-icon-button" aria-label={t('Dismiss notice')} onClick={() => { actions.dismissNotice() }}>
              <IconCloseOutlineRegular size={13} />
            </button>
          </div>
        )}

        {loginNeedsAttention(login) && (
          <div className="agy-banner" role="status">
            <StateDot state="ongoing" />
            <div>
              <p>{t('Sign-in is waiting for the authorization code.')}</p>
              <p className="agy-banner-hint">{t('Finish it before the sign-in window closes.')}</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => { setLoginOpen(true) }}>{t('Resume sign-in')}</Button>
          </div>
        )}

        {liveUnstored && (
          <div className="agy-banner" role="status">
            <IconWarningTriangleOutlineRegular size={16} />
            <div>
              <p>{t('agy is signed in as {name}, but the account is not stored.', { name: current.email !== undefined && current.email !== '' ? current.email : 'an unknown account' })}</p>
              <p className="agy-banner-hint">{t('Save it to switch back to it later.')}</p>
            </div>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => { setAddOpen(true) }}>{t('Save it')}</Button>
          </div>
        )}

        {snapshot.usageError !== null && (
          <p className="agy-usage-error">{t('Detailed quota groups are unavailable: {message}', { message: snapshot.usageError.message })}</p>
        )}

        {data !== null && data.warnings.length > 0 && (
          <ul className="agy-warnings">
            {data.warnings.map(warning => <li key={warning}>{warning}</li>)}
          </ul>
        )}

        {snapshot.phase === 'loading' && data === null && (
          <section className="agy-skeleton" aria-busy="true" aria-label="Reading accounts">
            <StateDot state="ongoing" />
            <span>{t('Reading accounts and quota…')}</span>
          </section>
        )}

        {snapshot.phase === 'error' && data === null && (
          <section className="agy-empty" role="alert">
            <IconWarningTriangleOutlineRegular size={28} />
            <h2>{t('The Harness Host did not answer')}</h2>
            <p>{snapshot.error?.message ?? t('The Antigravity API is unreachable.')}</p>
            <Button variant="outline" onClick={() => { actions.refresh(true) }}>{t('Try again')}</Button>
          </section>
        )}

        {data !== null && !data.available && (
          <section className="agy-empty">
            <IconWarningTriangleOutlineRegular size={28} />
            <h2>{t('The agy-auth CLI is not available')}</h2>
            <p>{data.error?.message ?? t('Could not run {binary}.', { binary: data.binary.configured })}</p>
            <p className="agy-hint">
              {data.error?.hint ?? t('Install it with npm install -g @fikrilal/agy-auth and make sure it is on PATH.')}
            </p>
            <div className="agy-empty-actions">
              <Button variant="outline" onClick={() => { actions.refresh(true) }}>{t('Retry')}</Button>
            </div>
            <p className="agy-hint agy-install">npm install -g @fikrilal/agy-auth</p>
          </section>
        )}

        {data !== null && data.available && data.error !== null && accounts.length === 0 && (
          <section className="agy-empty" role="alert">
            <IconWarningTriangleOutlineRegular size={28} />
            <h2>{t('agy-auth could not read the accounts')}</h2>
            <p>{data.error.message}</p>
            {data.error.hint !== undefined && <p className="agy-hint">{data.error.hint}</p>}
            <Button variant="outline" onClick={() => { actions.refresh(true) }}>{t('Try again')}</Button>
          </section>
        )}

        {data !== null && data.available && data.error === null && accounts.length === 0 && (
          <section className="agy-empty">
            <IconUsersOutlineRegular size={28} />
            <h2>{t('No Antigravity accounts yet')}</h2>
            <p>{t('Sign in with Google to add one, or save the account agy is already using.')}</p>
            <div className="agy-empty-actions">
              <Button variant="primary" icon={<IconUserOutlineRegular size={14} />} disabled={busy} onClick={openLogin}>{t('Sign in')}</Button>
              <Button variant="outline" icon={<IconPlusOutlineRegular size={14} />} disabled={busy} onClick={() => { setAddOpen(true) }}>{t('Save current agy account')}</Button>
            </div>
            <p className="agy-hint">{t('agy-auth stores an encrypted snapshot and switches the live credential. Restart agy after switching.')}</p>
          </section>
        )}

        {accounts.length > 0 && (
          <section className="agy-accounts" aria-label={t('Stored accounts')}>
            <div className="agy-accounts-head">
              <h2>{accountCount}</h2>
              <span className="agy-hint">{t('Quota grouped by model family: Gemini, Claude/GPT, and Argon when available.')}</span>
            </div>
            <div className="agy-account-list">
              {accounts.map(account => (
                <AccountCard
                  key={account.id ?? account.email ?? String(account.number)}
                  account={account}
                  usage={usageById.get(account.id ?? '')}
                  pending={pending}
                  onSwitch={(id) => { void actions.switchAccount(id) }}
                  onAlias={setAliasAccount}
                  onRemove={setRemoveAccount}
                />
              ))}
            </div>
            <p className="agy-footnote">
              {t('Switching writes the live credential for agy and, by default, Antigravity Desktop. Running sessions keep the old credential until they restart.')}
            </p>
          </section>
        )}

        {data !== null && data.available && (
          <StorageCard data={data} onClean={previewClean} busy={busy} />
        )}

        <footer className="agy-footer">
          <span>{data?.version ? 'agy-auth ' + data.version : 'agy-auth'}</span>
          <span>{t('Plugin UI for Google Antigravity CLI accounts. Not affiliated with Google.')}</span>
        </footer>
      </div>

      <AddAccountDialog
        open={addOpen}
        pending={pending}
        notice={notice}
        onClose={() => { setAddOpen(false) }}
        onSubmit={alias => actions.addAccount(alias)}
      />
      <LoginDialog
        open={loginOpen}
        pending={pending}
        notice={notice}
        login={login}
        onClose={() => { setLoginOpen(false) }}
        onStart={alias => actions.startLogin(alias)}
        onSubmitCode={code => actions.submitLoginCode(code)}
        onCancel={() => actions.cancelLogin()}
        onDismiss={() => { actions.dismissLogin() }}
      />
      <AliasDialog
        open={aliasAccount !== null}
        pending={pending}
        notice={notice}
        account={aliasAccount}
        onClose={() => { setAliasAccount(null) }}
        onSubmit={(id, alias) => actions.setAlias(id, alias)}
      />
      <RemoveDialog
        open={removeAccount !== null}
        pending={pending}
        notice={notice}
        account={removeAccount}
        onClose={() => { setRemoveAccount(null) }}
        onRemove={(id, logout) => actions.removeAccount(id, logout)}
      />
      <CleanDialog
        open={cleanOpen}
        result={cleanPreview}
        pending={pending}
        notice={notice}
        onClose={() => { setCleanOpen(false) }}
        onConfirm={() => actions.clean(false).then(result => result !== null)}
      />
    </div>
  )
}