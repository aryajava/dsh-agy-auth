/** Bounded, credential-free agy tool activity for the chat activity cards. */
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const VERSION = 1
const MAX_ACTIVITIES = 2_000
const MAX_PER_SESSION = 100

/**
 * Persistent record of agy tool steps, keyed by DSH session.
 */
export class ActivityStore {
  /**
   * @param {string} stateFile - model session-binding file; activity.json lives beside it.
   * @param {(message: string) => void} [log] - diagnostic sink.
   */
  constructor(stateFile, log) {
    this.file = join(dirname(stateFile), 'activity.json')
    this.log = log
    this.loaded = false
    this.activities = {}
  }

  /** Load the store once. */
  load() {
    if (this.loaded) return
    this.loaded = true
    try {
      const parsed = JSON.parse(readFileSync(this.file, 'utf8'))
      if (parsed !== null && typeof parsed === 'object' && parsed.activities !== null && typeof parsed.activities === 'object') {
        this.activities = parsed.activities
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') this.log?.('activity store: could not read ' + this.file)
    }
  }

  /**
   * Record or update one agy tool step.
   * @param {string} sessionId - DSH session id.
   * @param {{ stepIndex?: string, tool: Record<string, unknown>, time?: number }} entry - tool activity.
   */
  record(sessionId, entry) {
    if (sessionId === '' || entry.tool === undefined || typeof entry.tool.name !== 'string') return
    this.load()
    const list = Array.isArray(this.activities[sessionId]) ? this.activities[sessionId] : []
    const stepIndex = entry.stepIndex ?? ''
    const existing = stepIndex === '' ? undefined : list.find(item => item.stepIndex === stepIndex)
    let tool = entry.tool
    try {
      if (JSON.stringify(tool).length > 32_000) {
        tool = {
          name: tool.name,
          ...(typeof tool.error === 'string' ? { error: tool.error.slice(0, 4_000) } : {}),
          ...(typeof tool.output === 'string' ? { output: tool.output.slice(0, 4_000) + '\n…truncated' } : { output: '…truncated' }),
        }
      }
    } catch {
      tool = { name: String(tool.name), output: '…unserializable tool activity' }
    }
    const record = {
      time: entry.time ?? Date.now(),
      stepIndex,
      tool,
    }
    if (existing !== undefined) {
      existing.tool = tool
      existing.time = record.time
    } else {
      list.push(record)
    }
    this.activities[sessionId] = list.slice(-MAX_PER_SESSION)
    this.prune()
    this.save()
  }

  /** Keep the store bounded across sessions. */
  prune() {
    const entries = Object.entries(this.activities)
    const total = entries.reduce((sum, [, list]) => sum + (Array.isArray(list) ? list.length : 0), 0)
    if (total <= MAX_ACTIVITIES) return
    entries.sort((left, right) => {
      const leftTime = Array.isArray(left[1]) && left[1].length > 0 ? Number(left[1][left[1].length - 1].time ?? 0) : 0
      const rightTime = Array.isArray(right[1]) && right[1].length > 0 ? Number(right[1][right[1].length - 1].time ?? 0) : 0
      return leftTime - rightTime
    })
    let remaining = total
    for (const [session, list] of entries) {
      if (remaining <= MAX_ACTIVITIES) break
      const count = Array.isArray(list) ? list.length : 0
      if (count > 0) {
        delete this.activities[session]
        remaining -= count
      }
    }
  }

  /**
   * Read activities overlapping a turn time range.
   * @param {string} sessionId - DSH session id.
   * @param {number} since - inclusive start time.
   * @param {number} until - inclusive end time.
   * @returns {{ time: number, stepIndex: string, tool: Record<string, unknown> }[]} activities.
   */
  list(sessionId, since, until) {
    this.load()
    const list = Array.isArray(this.activities[sessionId]) ? this.activities[sessionId] : []
    return list.filter(item => item.time >= since && item.time <= until).slice(-MAX_PER_SESSION)
  }

  /** Atomically persist the store. */
  save() {
    const temp = this.file + '.' + String(process.pid) + '.tmp'
    try {
      mkdirSync(dirname(this.file), { recursive: true, mode: 0o700 })
      writeFileSync(temp, JSON.stringify({ version: VERSION, activities: this.activities }), { encoding: 'utf8', mode: 0o600 })
      renameSync(temp, this.file)
    } catch {
      try { unlinkSync(temp) } catch { /* best effort */ }
    }
  }
}
