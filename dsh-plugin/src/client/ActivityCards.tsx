/** Antigravity tool activity as a native disclosure trail under a completed turn. */
import { useEffect, useMemo, useState } from 'react'
import {
  DisclosureRow, IconApiOutlineRegular, IconBrowseOutlineRegular, IconChecklistOutlineRegular,
  IconChevronDownOutlineRegular, IconCodeOutlineRegular, IconEditOutlineRegular, IconSearchOutlineRegular,
  IconSparkleRegular, Tag, TerminalBlock, type TerminalBlockLabels,
} from '@deepseek-ai/dsh-client-ui-primitives'
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

/** Props of the activity trail. */
interface ActivityCardsProps {
  turn: TurnOwner
  sessionId?: string
}

/** Translator exposed by the page i18n provider. */
type Translate = (key: string, vars?: Record<string, string | number>) => string

/** Row glyph family, named after the Host's own tool variants. */
type RowIcon = 'command' | 'read' | 'write' | 'edit' | 'memory' | 'task' | 'tool'

/** Expanded content of one row; null when the step has nothing more to show. */
type RowBody =
  | { kind: 'terminal'; command: string; output?: string; exitCode?: number }
  | { kind: 'file'; path: string; measure?: string }
  | { kind: 'text'; label?: string; text: string }

/** One row of the trail, derived from a recorded step. */
interface RowView {
  key: string
  icon: RowIcon
  title: string
  summary: string
  /** Hover title carrying the untruncated summary. */
  detail?: string
  measure?: string
  exitCode?: number
  error?: string
  /** agy's spilled full-output file for a truncated result. */
  spill?: string
  body: RowBody | null
}

/** Argument names agy uses across its file tools. */
const FILE_KEYS = ['Path', 'AbsolutePath', 'TargetFile', 'file_path', 'path']
/** Argument names agy uses for a shell command. */
const COMMAND_KEYS = ['CommandLine', 'command', 'cmd', 'script']
/** Argument names that carry a free-text query. */
const QUERY_KEYS = ['query', 'Query', 'pattern', 'Pattern', 'prompt', 'url', 'Url']

/** Parse JSON-ish tool arguments. */
function objectArgs(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value)
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
    const value = args[key]
    if (typeof value === 'string' && value !== '') return value
  }
  return ''
}

/** Human-readable text from an output value. */
function outputText(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  try { return JSON.stringify(value, null, 2) } catch { return String(value) }
}

/** First non-empty line, used as a row summary for failures. */
function firstLine(text: string): string {
  for (const part of text.split('\n')) {
    const line = part.trim()
    if (line !== '') return line
  }
  return text.trim()
}

/**
 * Pull the path out of agy's truncation notice.
 * @param text - tool output.
 * @returns the spilled file path, or undefined.
 */
function spillFile(text: string): string | undefined {
  const match = /file:\/\/\/([^\s"')]+)/i.exec(text) ?? /file at ([^\s"')]+\.txt)/i.exec(text)
  const raw = match?.[1] ?? ''
  if (raw === '') return undefined
  const trimmed = raw.replace(/[.,;:]+$/, '')
  try { return decodeURIComponent(trimmed) } catch { return trimmed }
}

/** Whether agy replaced a long result with its spill notice. */
function isTruncated(text: string): boolean {
  return /output was truncated due to being too long/i.test(text)
}

/** Byte count in the smallest unit that still reads precisely. */
function bytesText(bytes: number): string {
  if (bytes < 1_000) return String(bytes) + ' B'
  const scale = bytes < 1_000_000 ? 1_000 : 1_000_000
  const unit = scale === 1_000 ? 'KB' : 'MB'
  const value = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(bytes / scale)
  return value + ' ' + unit
}

/**
 * Turn agy's `N lines, M bytes` read summary into a compact measure.
 * @param text - tool output.
 * @param t - translator.
 * @returns the measure, or undefined for anything else.
 */
function fileMeasure(text: string, t: Translate): string | undefined {
  const match = /^(\d+)\s+lines?,\s*(\d+)\s+bytes?$/i.exec(text.trim())
  if (match === null) return undefined
  const lines = Number(match[1] ?? 0)
  const bytes = Number(match[2] ?? 0)
  const lineText = lines === 1 ? t('1 line') : t('{count} lines', { count: lines })
  return lineText + ' · ' + bytesText(bytes)
}

/** Keep the last path segments, where the file name lives, for a one-line row. */
function shortPath(path: string): string {
  const segments = path.split(/[/\\]+/).filter(part => part !== '')
  if (segments.length <= 2) return path
  return '…/' + segments.slice(-2).join('/')
}

/** Duration of a run as an inline meta fragment. */
function formatSpan(ms: number): string {
  if (!Number.isFinite(ms) || ms < 1_000) return ''
  const total = Math.round(ms / 1_000)
  if (total < 60) return String(total) + 's'
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  if (minutes < 60) return seconds === 0 ? String(minutes) + 'm' : String(minutes) + 'm ' + String(seconds) + 's'
  return String(Math.floor(minutes / 60)) + 'h ' + String(minutes % 60) + 'm'
}

/**
 * Split agy's command envelope into the parts the terminal card draws.
 * agy returns `Command exited with code N.`, a blank line, then `Command output:`
 * and the text, or a "no output" sentence, or a spill notice.
 * @param raw - recorded tool output.
 * @returns exit code, body text, and spill path.
 */
function parseCommand(raw: string): { output?: string; exitCode?: number; spill?: string } {
  let text = raw.replace(/^\s+/, '')
  let exitCode: number | undefined
  const exit = /^Command exited with code (-?\d+)\.\s*/i.exec(text)
  if (exit !== null) {
    exitCode = Number(exit[1])
    text = text.slice(exit[0].length)
  }
  text = text.replace(/^Command output:[ \t]*\n?/i, '')
  text = text.replace(/^No output from the command\./i, '')
  // agy separates the envelope from the body with blank lines; they are not
  // part of the output and would render as an empty gap above the first line.
  text = text.replace(/^(?:[ \t]*\r?\n)+/, '')
  text = text.replace(/\s+$/, '')
  if (isTruncated(text)) return { exitCode, spill: spillFile(text) }
  return { output: text === '' ? undefined : text, exitCode }
}

/** Command card copy for the localized terminal primitive. */
function terminalLabels(t: Translate): TerminalBlockLabels {
  return {
    commandLine: line => t('Command line {line}', { line }),
    signal: signal => t('Stopped by {signal}', { signal }),
    exitCode: code => t('Exit code {code}', { code }),
    noExitCode: t('No exit code'),
    running: t('Running'),
    failed: t('Failed'),
    done: t('Done'),
    copy: t('Copy'),
    copied: t('Copied'),
    noOutput: t('No output'),
    collapseAria: t('Collapse output'),
    collapse: t('Collapse'),
    expandAria: hidden => t('Expand {count} more lines', { count: hidden }),
    expand: hidden => t('… {count} more lines', { count: hidden }),
  }
}

/**
 * Derive the row for one recorded step.
 * @param entry - recorded step.
 * @param index - position in the turn, used for the React key.
 * @param t - translator.
 * @returns the row view.
 */
function rowView(entry: ActivityEntry, index: number, t: Translate): RowView {
  const key = (entry.stepIndex ?? String(index)) + ':' + String(entry.time)
  const args = objectArgs(entry.tool.args)
  const name = entry.tool.name.toLowerCase()
  const raw = outputText(entry.tool.output).trim()
  const error = entry.tool.error
  const truncated = isTruncated(raw)
  const path = firstString(args, FILE_KEYS)
  const command = firstString(args, COMMAND_KEYS)
  const measure = truncated ? undefined : fileMeasure(raw, t)
  const text = truncated ? '' : raw
  /** agy replaced the result with a spill notice; say so on the row itself. */
  const truncatedFlag = truncated ? t('Truncated') : undefined
  const base = {
    key,
    error,
    spill: truncated ? spillFile(raw) : undefined,
  }

  if (command !== '' || /command|shell|terminal|bash|exec/.test(name)) {
    const parsed = parseCommand(raw)
    return {
      ...base,
      icon: 'command',
      title: t('Command'),
      summary: command === '' ? '' : command.replace(/\s*\n\s*/g, ' ; '),
      detail: command,
      exitCode: parsed.exitCode,
      measure: truncatedFlag,
      spill: parsed.spill ?? base.spill,
      // A truncated command has no readable output to draw: the terminal card's
      // empty state would claim "no output" above the notice naming its file.
      body: parsed.spill !== undefined || (command === '' && parsed.output === undefined)
        ? null
        : { kind: 'terminal', command: command === '' ? entry.tool.name : command, output: parsed.output, exitCode: parsed.exitCode },
    }
  }

  if (path !== '' || measure !== undefined) {
    const edit = /edit|replace|apply/.test(name)
    const write = !edit && /write|create/.test(name)
    return {
      ...base,
      icon: edit ? 'edit' : write ? 'write' : 'read',
      title: edit ? t('Edit') : write ? t('Write') : t('Read'),
      summary: error === undefined ? shortPath(path) : firstLine(error),
      detail: error ?? path,
      measure: measure ?? truncatedFlag,
      body: { kind: 'file', path, measure },
    }
  }

  const server = typeof args.ServerName === 'string' ? args.ServerName : ''
  const tool = typeof args.ToolName === 'string' ? args.ToolName : ''
  if (server !== '' || tool !== '' || /mcp/.test(name)) {
    const label = server !== '' && tool !== '' ? server + ' / ' + tool : tool !== '' ? tool : server
    const query = firstString(objectArgs(args.Arguments), QUERY_KEYS)
    const memory = /memory|memori|recall/i.test(server + ' ' + tool)
    return {
      ...base,
      icon: memory ? 'memory' : 'tool',
      title: memory ? t('Memory') : t('Tool call'),
      summary: error === undefined ? (query !== '' ? query : label) : firstLine(error),
      detail: error ?? (query !== '' ? query : label),
      measure: truncatedFlag,
      body: label === '' && text === '' ? null : { kind: 'text', label, text },
    }
  }

  const action = typeof args.Action === 'string' ? args.Action : ''
  const taskId = typeof args.TaskId === 'string' ? args.TaskId : ''
  const ref = taskId.split('/').filter(part => part !== '').pop() ?? ''
  if (action !== '' || taskId !== '' || /task/.test(name)) {
    return {
      ...base,
      icon: 'task',
      title: t('Task'),
      summary: error === undefined ? (ref === '' ? action : ref) : firstLine(error),
      detail: error ?? [action, taskId].filter(part => part !== '').join(' · '),
      measure: truncatedFlag,
      body: action === '' && ref === '' && text === '' ? null : {
        kind: 'text',
        label: [action, ref].filter(part => part !== '').join(' · '),
        text,
      },
    }
  }

  return {
    ...base,
    icon: 'tool',
    title: t('Tool call'),
    summary: entry.tool.name,
    detail: entry.tool.name,
    measure: truncatedFlag,
    body: text === '' ? null : { kind: 'text', label: entry.tool.name, text },
  }
}

/** Glyph for a row family, at the 14px the Host's rows use. */
function RowGlyph({ icon }: { icon: RowIcon }) {
  switch (icon) {
    case 'command': return <IconApiOutlineRegular size={14} />
    case 'read': return <IconBrowseOutlineRegular size={14} />
    case 'write': return <IconEditOutlineRegular size={14} />
    case 'edit': return <IconEditOutlineRegular size={14} />
    case 'memory': return <IconSearchOutlineRegular size={14} />
    case 'task': return <IconChecklistOutlineRegular size={14} />
    case 'tool': return <IconCodeOutlineRegular size={14} />
  }
}

/**
 * Render one trail row: a 24px disclosure header over its recorded body.
 * @param props.row - derived row.
 * @returns the list item.
 */
function ActivityRow({ row }: { row: RowView }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const labels = useMemo(() => terminalLabels(t), [t])
  const expandable = row.body !== null || row.error !== undefined || row.spill !== undefined
  const exitCode = row.exitCode
  const failed = exitCode !== undefined && exitCode !== 0
  const summary = (
    <>
      {row.summary !== '' && (
        <>
          <span className="agy-activity-sep" data-shimmer-decoration aria-hidden="true" />
          <span
            className="agy-activity-summary"
            data-tone={row.error === undefined ? undefined : 'error'}
            title={row.detail === undefined || row.detail === '' ? undefined : row.detail}
          >
            {row.summary}
          </span>
        </>
      )}
      {row.measure !== undefined && <span className="agy-activity-meta">{row.measure}</span>}
      {failed && (
        <Tag tone="neutral" className="agy-activity-exit">
          <span className="agy-activity-exit-dot" aria-hidden="true" />
          {t('Exit code {code}', { code: exitCode })}
        </Tag>
      )}
    </>
  )
  return (
    <li className="agy-activity-item">
      <DisclosureRow
        icon={<RowGlyph icon={row.icon} />}
        title={row.title}
        open={open && expandable}
        expandable={expandable}
        expandOnRowClick={expandable}
        keepContentWhenOpen
        onToggle={() => { setOpen(value => !value) }}
        collapsedContent={summary}
      >
        <div className="agy-activity-body">
          {row.body?.kind === 'terminal' && (
            <TerminalBlock
              className="agy-activity-terminal"
              command={row.body.command}
              output={row.body.output}
              exitCode={row.body.exitCode}
              maxLines={Infinity}
              labels={labels}
            />
          )}
          {row.body?.kind === 'file' && (
            <div className="agy-activity-file">
              {row.body.path !== '' && <code className="agy-activity-file-path">{row.body.path}</code>}
              {row.body.measure !== undefined && (
                <span className="agy-activity-file-measure">{row.body.measure}</span>
              )}
            </div>
          )}
          {row.body?.kind === 'text' && (
            <div className="agy-activity-panel">
              {row.body.label !== undefined && row.body.label !== '' && (
                <div className="agy-activity-label">{row.body.label}</div>
              )}
              {row.body.text !== '' && <div className="agy-activity-text">{row.body.text}</div>}
            </div>
          )}
          {row.error !== undefined && (
            <div className="agy-activity-panel">
              <div className="agy-activity-text" data-tone="error">{row.error}</div>
            </div>
          )}
          {row.spill !== undefined && (
            <p className="agy-activity-notice">
              {t('Output was truncated by agy. Full file:')} <code>{row.spill}</code>
            </p>
          )}
        </div>
      </DisclosureRow>
    </li>
  )
}

/**
 * Render the activity recorded during one chat turn.
 * @param props.turn - turn start/end times.
 * @param props.sessionId - current DSH session.
 * @returns the trail, or null when the turn recorded nothing.
 */
export function ActivityCards({ turn, sessionId }: ActivityCardsProps) {
  const { t } = useI18n()
  const [entries, setEntries] = useState<ActivityEntry[]>([])
  const [open, setOpen] = useState(true)
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
  const rows = useMemo(() => entries.map((entry, index) => rowView(entry, index, t)), [entries, t])
  if (rows.length === 0) return null
  const started = entries[0]?.time ?? 0
  const ended = entries[entries.length - 1]?.time ?? started
  const steps = rows.length === 1 ? t('1 step') : t('{count} steps', { count: rows.length })
  const span = formatSpan(ended - started)
  return (
    <section className="agy-activity" data-open={open ? 'true' : 'false'} aria-label={t('Antigravity activity')}>
      <button
        type="button"
        className="agy-activity-bar"
        aria-expanded={open}
        onClick={() => { setOpen(value => !value) }}
      >
        <IconSparkleRegular size={14} />
        <span className="agy-activity-bar-label">{t('Antigravity activity')}</span>
        <span className="agy-activity-dot" aria-hidden="true" />
        <span className="agy-activity-bar-meta">{steps}</span>
        {span !== '' && (
          <>
            <span className="agy-activity-dot" aria-hidden="true" />
            <span className="agy-activity-bar-meta">{span}</span>
          </>
        )}
        <IconChevronDownOutlineRegular size={14} className="agy-activity-bar-chevron" />
      </button>
      {open && (
        <ul className="agy-activity-list">
          {rows.map(row => <ActivityRow key={row.key} row={row} />)}
        </ul>
      )}
    </section>
  )
}
