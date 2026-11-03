/** Native-style agy tool activity cards rendered under a completed chat turn. */
import { useEffect, useMemo, useState } from 'react'
import { apiJson } from './api.ts'
import { useI18n } from './i18n.tsx'

/** One recorded agy tool step. */
interface ActivityEntry {
  time: number
  stepIndex?: string
  tool: {
    name: string
    args?: unknown
    output?: unknown
    error?: string
  }
}

/** Turn boundaries passed by the chat turn-tail slot. */
interface TurnOwner {
  start?: { time: number }
  end?: { time: number }
}

/** Props of the activity card list. */
interface ActivityCardsProps {
  turn: TurnOwner
  sessionId?: string
}

/** Parse JSON-ish tool arguments. */
function objectArgs(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
    } catch {
      return {}
    }
  }
  return {}
}

/** First string field from an argument object. */
function firstString(args: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    if (typeof args[key] === 'string' && args[key] !== '') return args[key] as string
  }
  return ''
}

/** Human-readable text from an output value. */
function outputText(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  try { return JSON.stringify(value, null, 2) } catch { return String(value) }
}

/** Extract a file path from agy's truncation notice. */
function truncatedFilePath(output: string): string | null {
  const match = /file:\/\/\/([^\s)]+)/i.exec(output) ?? /file at ([^\s)]+\.txt)/i.exec(output)
  if (match === null) return null
  const raw = match[1] ?? ''
  try { return decodeURIComponent(raw) } catch { return raw }
}

/** One terminal-like card. */
function TerminalCard({ entry }: { entry: ActivityEntry }) {
  const { t } = useI18n()
  const args = objectArgs(entry.tool.args)
  const command = firstString(args, ['CommandLine', 'command', 'cmd', 'script'])
  const output = outputText(entry.tool.output)
  const truncated = truncatedFilePath(output)
  return (
    <section className="agy-activity-card" data-kind="terminal">
      <header className="agy-activity-head">
        <span className="agy-activity-kind">{t('Command')}</span>
        <code>{entry.tool.name}</code>
      </header>
      {command !== '' && <pre className="agy-activity-command"><span aria-hidden="true">$ </span>{command}</pre>}
      {output !== '' && <pre className="agy-activity-output">{output}</pre>}
      {truncated !== null && (
        <p className="agy-activity-note">
          {t('Output was truncated by agy. Full file:')} <code>{truncated}</code>
        </p>
      )}
      {entry.tool.error !== undefined && <pre className="agy-activity-error">{entry.tool.error}</pre>}
      {output === '' && entry.tool.error === undefined && <p className="agy-activity-empty">{t('Completed')}</p>}
    </section>
  )
}

/** One file-edit or read card. */
function FileCard({ entry }: { entry: ActivityEntry }) {
  const { t } = useI18n()
  const args = objectArgs(entry.tool.args)
  const path = firstString(args, ['AbsolutePath', 'TargetFile', 'path', 'file_path', 'TargetFile'])
  const body = firstString(args, ['CodeContent', 'ReplacementContent', 'content', 'new_string'])
  const output = outputText(entry.tool.output)
  return (
    <section className="agy-activity-card" data-kind="file">
      <header className="agy-activity-head">
        <span className="agy-activity-kind">{t('File')}</span>
        <code>{entry.tool.name}</code>
      </header>
      {path !== '' && <div className="agy-activity-path">{path}</div>}
      {body !== '' && <pre className="agy-activity-output">{body.length > 4_000 ? body.slice(0, 4_000) + '…' : body}</pre>}
      {output !== '' && <pre className="agy-activity-output">{output.length > 4_000 ? output.slice(0, 4_000) + '…' : output}</pre>}
      {entry.tool.error !== undefined && <pre className="agy-activity-error">{entry.tool.error}</pre>}
    </section>
  )
}

/** One search/list/generic card. */
function GenericCard({ entry }: { entry: ActivityEntry }) {
  const { t } = useI18n()
  const args = objectArgs(entry.tool.args)
  const query = firstString(args, ['Query', 'query', 'Pattern', 'pattern', 'DirectoryPath', 'path'])
  const output = outputText(entry.tool.output)
  return (
    <section className="agy-activity-card" data-kind="generic">
      <header className="agy-activity-head">
        <span className="agy-activity-kind">{t('Activity')}</span>
        <code>{entry.tool.name}</code>
      </header>
      {query !== '' && <div className="agy-activity-path">{query}</div>}
      {output !== '' && <pre className="agy-activity-output">{output.length > 4_000 ? output.slice(0, 4_000) + '…' : output}</pre>}
      {entry.tool.error !== undefined && <pre className="agy-activity-error">{entry.tool.error}</pre>}
    </section>
  )
}

/**
 * Render the activity cards recorded during one chat turn.
 * @param props.turn - turn start/end times.
 * @param props.sessionId - current DSH session.
 * @returns card list or null.
 */
export function ActivityCards({ turn, sessionId }: ActivityCardsProps) {
  const { t } = useI18n()
  const [entries, setEntries] = useState<ActivityEntry[]>([])
  const since = turn.start?.time ?? 0
  const until = turn.end?.time ?? Date.now()
  const query = useMemo(() => {
    if (sessionId === undefined || sessionId === '') return null
    return '/activity?session=' + encodeURIComponent(sessionId) + '&since=' + String(since) + '&until=' + String(until)
  }, [sessionId, since, until])
  useEffect(() => {
    if (query === null) return
    let cancelled = false
    void apiJson<{ ok: boolean, activities: ActivityEntry[] }>(query).then((payload) => {
      if (!cancelled) setEntries(Array.isArray(payload.activities) ? payload.activities : [])
    }).catch(() => {
      if (!cancelled) setEntries([])
    })
    return () => { cancelled = true }
  }, [query])
  if (entries.length === 0) return null
  return (
    <section className="agy-activity" aria-label={t('Antigravity activity')}>
      <header className="agy-activity-title">{t('Antigravity activity')}</header>
      {entries.map(entry => {
        const name = entry.tool.name.toLowerCase()
        if (/command|shell|terminal|bash|exec/.test(name)) return <TerminalCard key={(entry.stepIndex ?? '') + entry.time} entry={entry} />
        if (/write|edit|replace|view|read|file/.test(name)) return <FileCard key={(entry.stepIndex ?? '') + entry.time} entry={entry} />
        return <GenericCard key={(entry.stepIndex ?? '') + entry.time} entry={entry} />
      })}
    </section>
  )
}