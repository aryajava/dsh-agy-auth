/** Durable DSH-session to agy-conversation bindings. */
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const MAX_SESSIONS = 500
const VERSION = 1

/**
 * Persistent map from DSH session ids to Antigravity conversation ids.
 */
export class SessionBindings {
  /**
   * @param {string} file - JSON file path.
   * @param {(message: string) => void} [log] - diagnostic sink.
   */
  constructor(file, log) {
    this.file = file
    this.log = log
    this.loaded = false
    this.sessions = {}
  }

  /** Load the file once. */
  load() {
    if (this.loaded) return
    this.loaded = true
    try {
      const raw = readFileSync(this.file, 'utf8')
      const parsed = JSON.parse(raw)
      if (parsed !== null && typeof parsed === 'object' && parsed.sessions !== null && typeof parsed.sessions === 'object') {
        this.sessions = parsed.sessions
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') this.log?.('session bindings: could not read ' + this.file)
    }
  }

  /**
   * Read the complete binding entry.
   * @param {string} sessionId - DSH session id.
   * @returns {{ conversationId: string, model?: string, updatedAt?: number } | undefined} binding.
   */
  getEntry(sessionId) {
    this.load()
    const entry = this.sessions[sessionId]
    return entry !== null && typeof entry === 'object' && typeof entry.conversationId === 'string' && entry.conversationId !== ''
      ? entry
      : undefined
  }

  /**
   * Read one conversation id.
   * @param {string} sessionId - DSH session id.
   * @returns {string | undefined} conversation id.
   */
  get(sessionId) {
    this.load()
    const entry = this.sessions[sessionId]
    return entry !== null && typeof entry === 'object' && typeof entry.conversationId === 'string' && entry.conversationId !== ''
      ? entry.conversationId
      : undefined
  }

  /**
   * Persist one conversation id.
   * @param {string} sessionId - DSH session id.
   * @param {string} conversationId - agy conversation id.
   * @param {string} model - model id used for the binding.
   */
  set(sessionId, conversationId, model) {
    if (sessionId === '' || conversationId === '') return
    this.load()
    this.sessions[sessionId] = { conversationId, model, updatedAt: Date.now() }
    this.prune()
    this.save()
  }

  /**
   * Remove one binding.
   * @param {string} sessionId - DSH session id.
   */
  remove(sessionId) {
    this.load()
    if (Object.prototype.hasOwnProperty.call(this.sessions, sessionId)) {
      delete this.sessions[sessionId]
      this.save()
    }
  }

  /** Keep the store bounded. */
  prune() {
    const entries = Object.entries(this.sessions)
    if (entries.length <= MAX_SESSIONS) return
    entries.sort((a, b) => Number(a[1]?.updatedAt ?? 0) - Number(b[1]?.updatedAt ?? 0))
    for (const [id] of entries.slice(0, entries.length - MAX_SESSIONS)) delete this.sessions[id]
  }

  /** Atomically persist the map. */
  save() {
    const directory = dirname(this.file)
    const temp = this.file + '.' + String(process.pid) + '.tmp'
    try {
      mkdirSync(directory, { recursive: true, mode: 0o700 })
      writeFileSync(temp, JSON.stringify({ version: VERSION, sessions: this.sessions }, null, 2), { encoding: 'utf8', mode: 0o600 })
      renameSync(temp, this.file)
    } catch (error) {
      this.log?.('session bindings: could not save ' + this.file)
      try {
        unlinkSync(temp)
      } catch {
        // Best effort cleanup.
      }
    }
  }
}