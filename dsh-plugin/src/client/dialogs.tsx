/** Dialogs for saving, signing in, renaming, removing, and cleaning. */
import { useEffect, useState } from 'react'
import { Button, Input, Modal, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { AccountRow, CleanResult, LoginSession, Notice, NoticeError } from './types.ts'
import { displayName } from './format.ts'
import { useI18n } from './i18n.tsx'

/** Shared dialog props. */
interface BaseProps {
  open: boolean
  pending: string | null
  notice: Notice | null
  onClose: () => void
}

/**
 * Render an inline command failure inside a dialog.
 * @param props.notice - current notice.
 * @returns the error line or null.
 */
function DialogError({ notice }: { notice: Notice | NoticeError | null }) {
  if (notice === null) return null
  if ('tone' in notice) {
    if (notice.tone !== 'error') return null
    return (
      <p className="agy-dialog-error" role="alert">
        {notice.text}
        {notice.hint !== undefined && <span className="agy-dialog-hint">{notice.hint}</span>}
      </p>
    )
  }
  return (
    <p className="agy-dialog-error" role="alert">
      {notice.message}
      {notice.hint !== undefined && <span className="agy-dialog-hint">{notice.hint}</span>}
    </p>
  )
}

/** Props for the add-account dialog. */
interface AddAccountDialogProps extends BaseProps {
  onSubmit: (alias: string) => Promise<boolean>
}

/**
 * Save the account currently signed in to agy.
 * @param props - dialog state and submit command.
 * @returns the dialog.
 */
export function AddAccountDialog({ open, pending, notice, onClose, onSubmit }: AddAccountDialogProps) {
  const { t } = useI18n()
  const [alias, setAlias] = useState('')
  useEffect(() => { if (open) setAlias('') }, [open])

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('Save the live agy account')}
      description={t('agy-auth reads the credential agy is using now and stores an encrypted snapshot under ~/.config/agy-auth.')}
      closeLabel={t('Close')}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending !== null}>{t('Cancel')}</Button>
          <Button
            variant="primary"
            disabled={pending !== null}
            onClick={() => { void onSubmit(alias).then(saved => { if (saved) onClose() }) }}
          >
            {pending === 'add' ? t('Saving…') : t('Save account')}
          </Button>
        </>
      )}
    >
      <DialogError notice={notice} />
      <label className="agy-field">
        <span className="agy-field-label">{t('Alias (optional)')}</span>
        <Input
          value={alias}
          data-modal-autofocus
          placeholder="personal"
          autoComplete="off"
          spellCheck={false}
          disabled={pending !== null}
          onChange={(event) => { setAlias(event.currentTarget.value) }}
        />
      </label>
      <p className="agy-hint">{t('A short alias of up to 32 characters with no spaces. You can set one later.')}</p>
    </Modal>
  )
}

/** Props for the sign-in dialog. */
interface LoginDialogProps extends BaseProps {
  login: LoginSession | null
  onStart: (alias: string) => Promise<void>
  onSubmitCode: (code: string) => Promise<void>
  onCancel: () => Promise<void>
  onDismiss: () => void
}

/**
 * Interactive Google sign-in: start the CLI, open its URL, submit the code.
 * @param props - session state and commands.
 * @returns the dialog.
 */
export function LoginDialog({ open, pending, notice, login, onClose, onStart, onSubmitCode, onCancel, onDismiss }: LoginDialogProps) {
  const { t } = useI18n()
  const [alias, setAlias] = useState('')
  const [code, setCode] = useState('')

  useEffect(() => {
    if (open) {
      setAlias('')
      setCode('')
    }
  }, [open])
  useEffect(() => {
    if (login?.status === 'done' || login?.status === 'cancelled') setCode('')
  }, [login?.status])

  const stage = login === null || login.status === 'cancelled' ? 'setup' : login.status
  const busy = pending !== null
  const closeAfterCancel = (): void => {
    void onCancel().then(() => { onClose() })
  }

  /**
   * Render the dialog body for the current stage.
   * @returns body content.
   */
  const body = (() => {
    if (stage === 'setup') {
      return (
        <>
          <DialogError notice={notice} />
          <label className="agy-field">
            <span className="agy-field-label">{t('Alias (optional)')}</span>
            <Input
              value={alias}
              data-modal-autofocus
              placeholder="work"
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
              onChange={(event) => { setAlias(event.currentTarget.value) }}
            />
          </label>
          <p className="agy-hint">{t('Google will ask you to approve access. The page then asks for the authorization code shown on antigravity.google/oauth-callback.')}</p>
        </>
      )
    }
    if (stage === 'starting') {
      return (
        <div className="agy-login-progress">
          <StateDot state="ongoing" />
          <span>{t('Starting the agy-auth sign-in…')}</span>
        </div>
      )
    }
    if (stage === 'waiting' || stage === 'exchanging') {
      const validUrl = login?.url !== null && login?.url !== undefined && login.url.startsWith('https://')
      return (
        <>
          <DialogError notice={notice} />
          <ol className="agy-steps">
            <li>
              {validUrl
                ? (
                    <a className="agy-link" href={login.url ?? '#'} target="_blank" rel="noreferrer">
                      {t('Open the Google sign-in page')}
                    </a>
                  )
                : <span>{t('Waiting for the sign-in URL…')}</span>}
            </li>
            <li>{t('Approve access, then copy the authorization code shown on the callback page.')}</li>
            <li>{t('Paste the code here and submit.')}</li>
          </ol>
          <label className="agy-field">
            <span className="agy-field-label">{t('Authorization code')}</span>
            <Input
              value={code}
              data-modal-autofocus
              className="agy-code-input"
              placeholder="4/0Ab…"
              autoComplete="off"
              spellCheck={false}
              disabled={stage === 'exchanging'}
              onChange={(event) => { setCode(event.currentTarget.value) }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && code.trim() !== '' && stage !== 'exchanging') {
                  void onSubmitCode(code).then(() => { setCode('') })
                }
              }}
            />
          </label>
          {stage === 'exchanging' && (
            <div className="agy-login-progress">
              <StateDot state="ongoing" />
              <span>{t('Verifying the code with Google…')}</span>
            </div>
          )}
        </>
      )
    }
    if (stage === 'done') {
      const account = login?.account ?? null
      return (
        <div className="agy-login-done">
          <StateDot state="done" />
          <div>
            <p className="agy-login-title">{t('Signed in as {name}.', { name: displayName(account) })}</p>
            <p className="agy-hint">{t('The account is stored and active. Restart agy to use it.')}</p>
          </div>
        </div>
      )
    }
    return (
      <>
        <DialogError notice={login?.error ?? notice} />
        <p className="agy-hint">{t('The sign-in did not finish. You can try again with the same alias.')}</p>
      </>
    )
  })()

  const footer = (() => {
    if (stage === 'setup') {
      return (
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>{t('Cancel')}</Button>
          <Button variant="primary" disabled={busy} onClick={() => { void onStart(alias) }}>
            {pending === 'login' ? t('Starting…') : t('Start sign-in')}
          </Button>
        </>
      )
    }
    if (stage === 'waiting' || stage === 'exchanging') {
      return (
        <>
          <Button variant="ghost" onClick={closeAfterCancel} disabled={stage === 'exchanging'}>{t('Cancel sign-in')}</Button>
          <Button
            variant="primary"
            disabled={busy || code.trim() === ''}
            onClick={() => { void onSubmitCode(code).then(() => { setCode('') }) }}
          >
            {stage === 'exchanging' ? t('Verifying…') : t('Submit code')}
          </Button>
        </>
      )
    }
    if (stage === 'done') {
      return (
        <Button variant="primary" onClick={() => { onDismiss(); onClose() }}>{t('Done')}</Button>
      )
    }
    if (stage === 'failed') {
      return (
        <>
          <Button variant="ghost" onClick={() => { onDismiss() }}>{t('Close')}</Button>
          <Button variant="primary" onClick={() => { onDismiss(); void onStart(alias) }}>{t('Try again')}</Button>
        </>
      )
    }
    return <Button variant="ghost" onClick={closeAfterCancel} disabled={busy}>{t('Cancel')}</Button>
  })()

  return (
    <Modal
      open={open}
      onClose={stage === 'exchanging' ? () => {} : onClose}
      title={t('Sign in to Google Antigravity')}
      description={t('Adds a new account through the same OAuth client Antigravity CLI uses. Your current credential is backed up first.')}
      closeLabel={t('Close')}
      footer={footer}
    >
      {body}
    </Modal>
  )
}

/** Props for the alias dialog. */
interface AliasDialogProps extends BaseProps {
  account: AccountRow | null
  onSubmit: (id: string, alias: string) => Promise<boolean>
}

/**
 * Set or clear one account alias.
 * @param props - target account and submit command.
 * @returns the dialog.
 */
export function AliasDialog({ open, pending, notice, account, onClose, onSubmit }: AliasDialogProps) {
  const { t } = useI18n()
  const [alias, setAlias] = useState('')
  const id = account?.id ?? ''

  useEffect(() => {
    if (open) setAlias(account?.alias ?? '')
    // Only a different target resets the draft; a poll must not overwrite typing.
  }, [open, account?.id])

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('Alias for {name}', { name: displayName(account) })}
      description={t('Aliases make switch and remove queries short. Up to 32 characters, no spaces, not a number.')}
      closeLabel={t('Close')}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending !== null}>{t('Cancel')}</Button>
          {account?.alias !== undefined && (
            <Button
              variant="outline"
              disabled={pending !== null}
              onClick={() => { void onSubmit(id, '').then(saved => { if (saved) onClose() }) }}
            >
              {t('Clear alias')}
            </Button>
          )}
          <Button
            variant="primary"
            disabled={pending !== null || alias.trim() === '' || alias.trim() === (account?.alias ?? '')}
            onClick={() => { void onSubmit(id, alias).then(saved => { if (saved) onClose() }) }}
          >
            {t('Save alias')}
          </Button>
        </>
      )}
    >
      <DialogError notice={notice} />
      <label className="agy-field">
        <span className="agy-field-label">{t('Alias')}</span>
        <Input
          value={alias}
          data-modal-autofocus
          placeholder="personal"
          autoComplete="off"
          spellCheck={false}
          disabled={pending !== null}
          onChange={(event) => { setAlias(event.currentTarget.value) }}
        />
      </label>
    </Modal>
  )
}

/** Props for the removal dialog. */
interface RemoveDialogProps extends BaseProps {
  account: AccountRow | null
  onRemove: (id: string, logout: boolean) => Promise<boolean>
}

/**
 * Remove one stored snapshot, optionally logging out the live credential.
 * @param props - target account and command.
 * @returns the dialog.
 */
export function RemoveDialog({ open, pending, notice, account, onClose, onRemove }: RemoveDialogProps) {
  const { t } = useI18n()
  const [logout, setLogout] = useState(false)
  const id = account?.id ?? ''

  useEffect(() => {
    if (open) setLogout(false)
  }, [open])

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('Remove {name}?', { name: displayName(account) })}
      description={t('The encrypted snapshot is deleted. This cannot be undone.')}
      closeLabel={t('Close')}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending !== null}>{t('Cancel')}</Button>
          <Button
            variant="outline"
            className="agy-danger-button"
            disabled={pending !== null}
            onClick={() => { void onRemove(id, logout).then(removed => { if (removed) onClose() }) }}
          >
            {pending === `remove:${id}` ? t('Removing…') : t('Remove account')}
          </Button>
        </>
      )}
    >
      <DialogError notice={notice} />
      <p className="agy-dialog-text">
        {account?.active === true
          ? t('This is the active account. The live agy credential is kept unless you also log out.')
          : t('The live agy credential is not affected.')}
      </p>
      <label className="agy-check">
        <input
          type="checkbox"
          checked={logout}
          disabled={pending !== null}
          onChange={(event) => { setLogout(event.currentTarget.checked) }}
        />
        <span>{t('Also delete the live agy credential (logout)')}</span>
      </label>
    </Modal>
  )
}

/** Props for the storage cleanup dialog. */
interface CleanDialogProps {
  open: boolean
  result: CleanResult | null
  pending: string | null
  notice: Notice | null
  onClose: () => void
  onConfirm: () => Promise<boolean>
}

/**
 * Preview and confirm pruning managed backups and orphan snapshots.
 * @param props - preview result and command.
 * @returns the dialog.
 */
export function CleanDialog({ open, result, pending, notice, onClose, onConfirm }: CleanDialogProps) {
  const { t } = useI18n()
  const backups = result?.backups ?? []
  const snapshots = result?.snapshots ?? []
  const total = backups.length + snapshots.length
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('Clean agy-auth storage')}
      description={t('Prunes managed backups beyond the retention limit and snapshots that no stored account references. Unreferenced snapshots are preserved when the registry is missing.')}
      closeLabel={t('Close')}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending !== null}>{t('Close')}</Button>
          {total > 0 && (
            <Button
              variant="outline"
              className="agy-danger-button"
              disabled={pending !== null}
              onClick={() => { void onConfirm().then(done => { if (done) onClose() }) }}
            >
              {pending === 'clean' ? t('Removing…') : t('Remove {count} items', { count: total })}
            </Button>
          )}
        </>
      )}
    >
      <DialogError notice={notice} />
      {total === 0
        ? <p className="agy-dialog-text">{t('Nothing to clean.')}</p>
        : (
            <ul className="agy-clean-list">
              {backups.map(name => <li key={name}><code>{name}</code> <span>{t('backup')}</span></li>)}
              {snapshots.map(name => <li key={name}><code>{name}</code> <span>{t('orphan snapshot')}</span></li>)}
            </ul>
          )}
      {result?.preserved === true && <p className="agy-hint">{t('The registry is missing, so snapshots were preserved for a rebuild.')}</p>}
    </Modal>
  )
}