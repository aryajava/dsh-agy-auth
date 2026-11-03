/** Discover Antigravity models from the installed agy CLI. */
import { runProcess } from '../command.js'
import { resolveAgy } from './config.js'

/**
 * Parse agy models output.
 * @param {string} text - stdout.
 * @returns {{ id: string, name: string }[]} models in CLI order.
 */
export function parseModelsOutput(text) {
  const models = []
  const seen = new Set()
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line === '' || /^fetching/i.test(line) || /^available models/i.test(line)) continue
    let id = ''
    let name = ''
    const tab = line.indexOf('\t')
    if (tab > 0) {
      id = line.slice(0, tab).trim()
      name = line.slice(tab + 1).trim()
    } else {
      const match = /^(\S+)\s{2,}(.+)$/.exec(line) ?? /^(\S+)\s+(.+)$/.exec(line)
      if (match === null) continue
      id = match[1]
      name = match[2].trim()
    }
    if (id === '' || id.startsWith('Usage') || seen.has(id)) continue
    seen.add(id)
    models.push({ id, name: name === '' ? id : name })
  }
  return models
}

/** Known models used when the CLI cannot be probed (signed out, old build, offline). */
export const FALLBACK_MODELS = Object.freeze([
  { id: 'gemini-4-argon-medium', name: 'Gemini 4 Argon (Medium)' },
  { id: 'gemini-4-argon-high', name: 'Gemini 4 Argon (High)' },
  { id: 'gemini-4-argon-low', name: 'Gemini 4 Argon (Low)' },
  { id: 'gemini-3.8-flash-high', name: 'Gemini 3.8 Flash (High)' },
  { id: 'gemini-3.8-flash-medium', name: 'Gemini 3.8 Flash (Medium)' },
  { id: 'gemini-3.8-flash-low', name: 'Gemini 3.8 Flash (Low)' },
  { id: 'claude-opus-5-5-low', name: 'Claude Opus 5.5 (Low)' },
  { id: 'claude-opus-5-5-medium', name: 'Claude Opus 5.5 (Medium)' },
  { id: 'claude-opus-5-5-high', name: 'Claude Opus 5.5 (High)' },
  { id: 'claude-sonnet-5-5-low', name: 'Claude Sonnet 5.5 (Low)' },
  { id: 'claude-sonnet-5-5-medium', name: 'Claude Sonnet 5.5 (Medium)' },
  { id: 'claude-sonnet-5-5-high', name: 'Claude Sonnet 5.5 (High)' },
  { id: 'gpt-oss-120b-medium', name: 'GPT-OSS 120B (Medium)' },
])

const EFFORT_ORDER = ['low', 'medium', 'high', 'xhigh', 'max']
const EFFORT_SUFFIX = /^(.*)-(low|medium|high|xhigh|max)$/

/**
 * Fold Gemini effort-suffixed slugs into one base model with selectable efforts.
 * Claude and GPT-OSS slugs stay exact because agy rejects --effort for them.
 * @param {{ id: string, name: string }[]} models - raw catalog.
 * @returns {{ id: string, name: string, efforts?: string[] }[]} picker entries.
 */
export function groupModels(models) {
  const groups = new Map()
  const order = []
  for (const model of models) {
    const match = EFFORT_SUFFIX.exec(model.id)
    const isGemini = model.id.startsWith('gemini-')
    if (!isGemini || match === null) {
      order.push({ id: model.id, name: model.name })
      continue
    }
    const base = match[1]
    const effort = match[2]
    let group = groups.get(base)
    if (group === undefined) {
      const name = model.name.replace(/\s*\((?:low|medium|high|xhigh|max)\)\s*$/i, '') || base
      group = { id: base, name, efforts: [] }
      groups.set(base, group)
      order.push(group)
    }
    if (!group.efforts.includes(effort)) group.efforts.push(effort)
  }
  for (const group of groups.values()) {
    group.efforts.sort((left, right) => EFFORT_ORDER.indexOf(left) - EFFORT_ORDER.indexOf(right))
  }
  return order
}

/**
 * Resolve one requested model id to its agy base slug and effective effort.
 * Accepts both folded base ids and legacy / exact suffixed ids.
 * @param {string} model - requested id.
 * @param {string} fallbackEffort - configured default effort.
 * @returns {{ model: string, effort?: string, gemini: boolean }} run target.
 */
export function resolveModelTarget(model, fallbackEffort) {
  const match = EFFORT_SUFFIX.exec(model)
  if (model.startsWith('gemini-') && match !== null) {
    return { model: match[1], effort: match[2], gemini: true }
  }
  if (model.startsWith('gemini-')) return { model, effort: fallbackEffort, gemini: true }
  return { model, gemini: false }
}

/**
 * Cached model catalog backed by 'agy models'.
 */
export class AgyModelCatalog {
  /**
   * @param {object} options - catalog options.
   * @param {() => NodeJS.ProcessEnv} options.environment - child environment.
   * @param {string} options.cwd - working directory.
   * @param {number} [options.ttlMs] - cache lifetime.
   * @param {(message: string) => void} [options.log] - diagnostic sink.
   */
  constructor(options) {
    this.options = options
    this.ttlMs = options.ttlMs ?? 300_000
    this.cache = []
    this.cachedAt = 0
    this.inflight = undefined
  }

  /**
   * Return cached models when fresh.
   * @returns {{ id: string, name: string }[]} cached models.
   */
  current() {
    return this.cache
  }

  /**
   * Refresh the model list from agy.
   * @param {AbortSignal} [signal] - cancellation.
   * @returns {Promise<{ id: string, name: string }[]>} models.
   */
  async refresh(signal) {
    if (this.inflight !== undefined) return this.inflight
    const plan = resolveAgy(this.options.config)
    if (!plan.ok) {
      this.options.log?.('model catalog: ' + plan.error)
      if (this.cache.length === 0) {
        this.cache = [...FALLBACK_MODELS]
        this.cachedAt = Date.now()
      }
      return this.cache
    }
    const promise = (async () => {
      try {
        const outcome = await runProcess({
          command: plan.command,
          args: [...plan.args, 'models'],
          env: this.options.environment(),
          cwd: this.options.cwd,
          timeoutMs: 30_000,
          ...(signal === undefined ? {} : { signal }),
        })
        if (outcome.code !== 0) {
          this.options.log?.('model catalog: agy models exited ' + String(outcome.code))
          if (this.cache.length === 0) {
            this.cache = [...FALLBACK_MODELS]
            this.cachedAt = Date.now()
          }
          return this.cache
        }
        const parsed = parseModelsOutput(outcome.stdout)
        if (parsed.length > 0) {
          this.cache = parsed
          this.cachedAt = Date.now()
        } else if (this.cache.length === 0) {
          this.cache = [...FALLBACK_MODELS]
          this.cachedAt = Date.now()
        }
        return this.cache
      } catch (error) {
        this.options.log?.('model catalog: ' + (error instanceof Error ? error.message : String(error)))
        return this.cache
      } finally {
        this.inflight = undefined
      }
    })()
    this.inflight = promise
    return promise
  }

  /**
   * Return models, refreshing when stale.
   * @param {AbortSignal} [signal] - cancellation.
   * @returns {Promise<{ id: string, name: string }[]>} models.
   */
  async list(signal) {
    if (this.cache.length > 0 && Date.now() - this.cachedAt < this.ttlMs) return this.cache
    return this.refresh(signal)
  }

  /**
   * Resolve one model id.
   * @param {string} model - model id.
   * @param {AbortSignal} [signal] - cancellation.
   * @returns {Promise<{ id: string, name: string }>} model metadata.
   */
  async get(model, signal) {
    const models = await this.list(signal)
    const found = models.find(entry => entry.id === model)
    return found ?? { id: model, name: model }
  }
}