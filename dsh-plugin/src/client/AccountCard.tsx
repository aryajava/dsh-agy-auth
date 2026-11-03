/** One stored account card with quota windows and row actions. */
import {
  Button, IconEditOutlineRegular, IconTrashOutlineRegular, StateDot, Tag,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { AccountRow, QuotaBucket, QuotaGroup, QuotaWindow, UsageAccount } from './types.ts'
import { displayName, formatAbsolute, formatDay, formatReset, quotaTone } from './format.ts'
import { useI18n } from './i18n.tsx'

/** Props for the account card. */
interface AccountCardProps {
  account: AccountRow
  usage?: UsageAccount
  pending: string | null
  onSwitch: (id: string) => void
  onAlias: (account: AccountRow) => void
  onRemove: (account: AccountRow) => void
}

/**
 * Render one quota window as a labelled bar.
 * @param props.label - window name.
 * @param props.window - quota data.
 * @returns the quota block.
 */
function QuotaBar({ label, window }: { label: string; window: QuotaWindow | undefined }) {
  const { t } = useI18n()
  const percent = window?.remaining_percent
  const tone = quotaTone(window)
  const width = percent === undefined ? 0 : Math.max(0, Math.min(100, percent))
  return (
    <div className="agy-quota">
      <div className="agy-quota-head">
        <span>{label}</span>
        <span className="agy-quota-value" data-tone={tone}>
          {percent === undefined ? '—' : `${String(percent)}%`}
        </span>
      </div>
      <div
        className="agy-bar"
        data-tone={tone}
        role="progressbar"
        aria-label={`${label} remaining`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent ?? 0}
      >
        <div className="agy-bar-fill" style={{ width: `${String(width)}%` }} />
      </div>
      <span className="agy-quota-reset" title={formatAbsolute(window?.resets_at)}>
        {window?.resets_at === undefined ? t('Reset time unavailable') : t('Resets {time}', { time: formatReset(window.resets_at) })}
      </span>
    </div>
  )
}

/**
 * Map a usage bucket to the shared quota-bar shape.
 * @param bucket - CLI bucket.
 * @returns quota window.
 */
function bucketWindow(bucket: QuotaBucket): QuotaWindow {
  return {
    remaining_percent: bucket.remaining_percent,
    resets_at: bucket.reset_time,
  }
}

/**
 * Render one model-family quota group.
 * @param props.group - CLI group.
 * @param props.index - group order.
 * @returns the group block.
 */
function QuotaGroupSection({ group, index }: { group: QuotaGroup; index: number }) {
  const { t } = useI18n()
  const buckets = Array.isArray(group.buckets) ? group.buckets : []
  const family = t(group.name ?? 'Quota group')
  return (
    <section className="agy-quota-group" data-family={family} data-index={index} aria-label={family}>
      <div className="agy-quota-group-head">
        <h4>{family}</h4>
        {group.description !== undefined && group.description !== '' && (
          <p>{t(group.description)}</p>
        )}
      </div>
      <div className="agy-quota-group-bars">
        {buckets.map(bucket => (
          <QuotaBar
            key={bucket.id ?? bucket.name ?? String(bucket.window)}
            label={t(bucket.name ?? bucket.window ?? 'Quota')}
            window={bucketWindow(bucket)}
          />
        ))}
        {buckets.length === 0 && <span className="agy-hint">No bucket data.</span>}
      </div>
    </section>
  )
}

/**
 * Render one account row.
 * @param props - account, usage groups, pending key, and row commands.
 * @returns the account card.
 */
export function AccountCard({ account, usage, pending, onSwitch, onAlias, onRemove }: AccountCardProps) {
  const { t } = useI18n()
  const id = account.id ?? ''
  const busy = pending !== null
  const switching = pending === `switch:${id}`
  const name = displayName(account)
  const added = account.added_at === undefined ? '' : t('added {time}', { time: formatDay(account.added_at) })
  const used = account.last_used_at === undefined ? '' : t('last used {time}', { time: formatDay(account.last_used_at) })
  const meta = [id, added, used].filter(part => part !== '').join(' · ')

  return (
    <article className="agy-account" data-active={account.active} aria-busy={switching}>
      <div className="agy-account-head">
        <div className="agy-identity">
          <div className="agy-name-row">
            <StateDot state={account.active ? 'done' : 'idle'} />
            <span className="agy-name">{name}</span>
            {account.active && <Tag tone="success">{t('Active')}</Tag>}
            {account.plan !== undefined && account.plan !== '' && <Tag tone="neutral">{account.plan}</Tag>}
            {account.expired && <Tag tone="warning">{t('Token expired')}</Tag>}
            {!account.stored && <Tag tone="warning">{t('Not stored')}</Tag>}
          </div>
          <div className="agy-email">{account.email !== undefined && account.email !== '' ? account.email : t('No email in credential')}</div>
          {meta !== '' && <div className="agy-meta">{meta}</div>}
        </div>
        <div className="agy-row-actions">
          {account.active ? (
            <span className="agy-in-use">{t('In use')}</span>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => { onSwitch(id) }}
            >
              {switching ? t('Switching…') : t('Switch')}
            </Button>
          )}
          <button
            type="button"
            className="agy-icon-button"
            aria-label={t('Edit alias for {name}', { name })}
            title={t('Edit alias')}
            disabled={busy}
            onClick={() => { onAlias(account) }}
          >
            <IconEditOutlineRegular size={14} />
          </button>
          <button
            type="button"
            className="agy-icon-button agy-icon-danger"
            aria-label={t('Remove {name}', { name })}
            title={t('Remove account')}
            disabled={busy}
            onClick={() => { onRemove(account) }}
          >
            <IconTrashOutlineRegular size={14} />
          </button>
        </div>
      </div>
      {Array.isArray(usage?.groups) && usage.groups.length > 0 ? (
        <div className="agy-quota-groups">
          {usage.groups.map((group, index) => (
            <QuotaGroupSection key={group.name ?? String(index)} group={group} index={index} />
          ))}
        </div>
      ) : (
        <div className="agy-quotas">
          <QuotaBar label={t('All models · 5-hour')} window={account.usage?.five_hour} />
          <QuotaBar label={t('All models · weekly')} window={account.usage?.weekly} />
        </div>
      )}
      {account.usage_error !== undefined && (
        <p className="agy-usage-error">{t('Quota unavailable ({message}).', { message: account.usage_error })}</p>
      )}
    </article>
  )
}