/** Presentation helpers for accounts and quota. */
import type { AccountRow, QuotaWindow } from './types.ts'

/** Quota tone derived from the remaining percentage. */
export type QuotaTone = 'success' | 'warning' | 'critical' | 'unknown'

/**
 * Pick the tone for a remaining percentage.
 * @param window - quota window.
 * @returns tone.
 */
export function quotaTone(window: QuotaWindow | undefined): QuotaTone {
  if (window?.remaining_percent === undefined) return 'unknown'
  if (window.remaining_percent >= 50) return 'success'
  if (window.remaining_percent >= 20) return 'warning'
  return 'critical'
}

/**
 * Format one account's display name.
 * @param account - account row.
 * @returns alias, then email, then id.
 */
export function displayName(account: AccountRow | null | undefined): string {
  if (account === null || account === undefined) return 'Unknown account'
  if (typeof account.alias === 'string' && account.alias !== '') return account.alias
  if (typeof account.email === 'string' && account.email !== '') return account.email
  return account.id ?? 'Unknown account'
}

/**
 * Format a duration in front of a reset timestamp.
 * @param iso - reset instant.
 * @returns "in 2h 5m", "reset due", or an empty string.
 */
export function formatReset(iso: string | undefined): string {
  if (iso === undefined) return ''
  const at = Date.parse(iso)
  if (!Number.isFinite(at)) return ''
  const diff = at - Date.now()
  if (diff <= 0) return 'reset due'
  const minutes = Math.round(diff / 60_000)
  if (minutes < 60) return `in ${String(minutes)}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    const rest = minutes % 60
    return rest === 0 ? `in ${String(hours)}h` : `in ${String(hours)}h ${String(rest)}m`
  }
  const days = Math.floor(hours / 24)
  const restHours = hours % 24
  return restHours === 0 ? `in ${String(days)}d` : `in ${String(days)}d ${String(restHours)}h`
}

/**
 * Format an absolute timestamp for a tooltip.
 * @param iso - timestamp.
 * @returns localized date or an empty string.
 */
export function formatAbsolute(iso: string | undefined): string {
  if (iso === undefined) return ''
  const at = Date.parse(iso)
  if (!Number.isFinite(at)) return iso
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(at))
}

/**
 * Format a timestamp as a relative day for metadata lines.
 * @param iso - timestamp.
 * @returns human text.
 */
export function formatDay(iso: string | undefined): string {
  if (iso === undefined) return ''
  const at = Date.parse(iso)
  if (!Number.isFinite(at)) return iso
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(at))
}

/**
 * Shorten an account id for the metadata line.
 * @param id - full id.
 * @returns the id, or an empty string.
 */
export function shortId(id: string | undefined): string {
  return id === undefined ? '' : id
}