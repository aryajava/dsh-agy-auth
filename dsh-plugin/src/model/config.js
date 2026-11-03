/** Model-provider configuration for the Antigravity adapter. */
import { existsSync, mkdirSync, utimesSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { findOnPath, resolveCommand } from '../command.js'

/** Defaults for the nested model configuration. */
export const DEFAULT_MODEL = Object.freeze({
  enabled: true,
  defaultModel: 'gemini-3.8-flash',
  defaultEffort: 'medium',
  hiddenModels: [],
  permissionMode: 'skip',
  timeoutMs: 600_000,
  idleTimeoutMs: 300_000,
  maxConcurrent: 1,
  contextChars: 24_000,
  maxPromptChars: 24_000,
  contextWindow: 1_000_000,
  maxTokens: 8_192,
  forwardSystemPrompt: false,
  proxyUrl: '',
  autoRotate: false,
  capacityFallback: true,
  allowAuxiliary: true,
  auxiliaryPermissionMode: 'plan',
  auxiliaryMaxChars: 800_000,
  stateFile: '',
  agyPath: '',
  agyHome: '',
  agyArgs: [],
  extraArgs: [],
  cwd: '',
  mediaDir: '',
  mediaTtlMs: 604_800_000,
  retryMaxRetries: 2,
  retryInitialDelayMs: 1_000,
  retryMaxDelayMs: 8_000,
  suppressAgyAutoUpdate: process.platform === 'win32',
  goalContext: true,
  planContext: true,
})

const PERMISSION_MODES = new Set(['skip', 'plan', 'accept-edits'])
const EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max'])

/**
 * Resolve the DSH home used for plugin state.
 * @returns {string} absolute home path.
 */
export function dshHome() {
  const configured = process.env.DSH_HOME
  if (typeof configured === 'string' && configured.trim() !== '') return configured
  return join(homedir(), '.dsh')
}

/**
 * Read a bounded integer from the raw config.
 * @param {unknown} value - candidate.
 * @param {number} fallback - default.
 * @param {number} minimum - inclusive minimum.
 * @returns {number} validated integer.
 */
function integer(value, fallback, minimum) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum) return fallback
  return Math.floor(value)
}

/**
 * Read a string array from the raw config.
 * @param {unknown} value - candidate.
 * @returns {string[]} string array.
 */
function strings(value) {
  if (!Array.isArray(value)) return []
  return value.filter(entry => typeof entry === 'string')
}

/**
 * Normalize the nested model config and merge in the top-level agy path.
 * @param {Record<string, unknown> | undefined} input - raw config.model.
 * @param {{ agyPath?: string }} base - top-level plugin config.
 * @returns {typeof DEFAULT_MODEL & { warnings: string[] }} normalized model config.
 */
export function normalizeModelConfig(input, base = {}) {
  const raw = (input && typeof input === 'object' && !Array.isArray(input)) ? input : {}
  const permissionMode = typeof raw.permissionMode === 'string' && PERMISSION_MODES.has(raw.permissionMode)
    ? raw.permissionMode
    : DEFAULT_MODEL.permissionMode
  const defaultEffort = typeof raw.defaultEffort === 'string' && EFFORTS.has(raw.defaultEffort)
    ? raw.defaultEffort
    : DEFAULT_MODEL.defaultEffort
  const auxiliaryPermissionMode = typeof raw.auxiliaryPermissionMode === 'string' && PERMISSION_MODES.has(raw.auxiliaryPermissionMode)
    ? raw.auxiliaryPermissionMode
    : DEFAULT_MODEL.auxiliaryPermissionMode
  const stateFile = typeof raw.stateFile === 'string' && raw.stateFile.trim() !== ''
    ? raw.stateFile
    : join(dshHome(), 'agy-auth-model', 'sessions.json')
  const agyPath = typeof raw.agyPath === 'string' && raw.agyPath.trim() !== ''
    ? raw.agyPath.trim()
    : (typeof base.agyPath === 'string' ? base.agyPath : '')
  const warnings = []
  if (permissionMode === 'skip') {
    warnings.push('Antigravity runs agy with --dangerously-skip-permissions: agy owns its file and shell tools, outside DSH approval.')
  }
  if (raw.autoRotate === true) {
    warnings.push('autoRotate is enabled: a quota failure may switch the live agy credential while other sessions run. Keep it off unless you accept that risk.')
  }
  return {
    enabled: raw.enabled !== false,
    defaultModel: typeof raw.defaultModel === 'string' && raw.defaultModel.trim() !== '' ? raw.defaultModel.trim() : DEFAULT_MODEL.defaultModel,
    defaultEffort,
    hiddenModels: strings(raw.hiddenModels),
    permissionMode,
    timeoutMs: integer(raw.timeoutMs, DEFAULT_MODEL.timeoutMs, 10_000),
    idleTimeoutMs: integer(raw.idleTimeoutMs, DEFAULT_MODEL.idleTimeoutMs, 10_000),
    maxConcurrent: integer(raw.maxConcurrent, DEFAULT_MODEL.maxConcurrent, 1),
    contextChars: integer(raw.contextChars, DEFAULT_MODEL.contextChars, 1_000),
    maxPromptChars: integer(raw.maxPromptChars, DEFAULT_MODEL.maxPromptChars, 1_000),
    contextWindow: integer(raw.contextWindow, DEFAULT_MODEL.contextWindow, 1_000),
    maxTokens: integer(raw.maxTokens, DEFAULT_MODEL.maxTokens, 1),
    forwardSystemPrompt: raw.forwardSystemPrompt === true,
    proxyUrl: typeof raw.proxyUrl === 'string' ? raw.proxyUrl.trim() : '',
    autoRotate: raw.autoRotate === true,
    capacityFallback: raw.capacityFallback !== false,
    allowAuxiliary: raw.allowAuxiliary !== false,
    auxiliaryPermissionMode,
    auxiliaryMaxChars: integer(raw.auxiliaryMaxChars, DEFAULT_MODEL.auxiliaryMaxChars, 1_000),
    stateFile,
    agyPath,
    agyHome: typeof raw.agyHome === 'string' ? raw.agyHome.trim() : '',
    agyArgs: strings(raw.agyArgs),
    extraArgs: strings(raw.extraArgs),
    cwd: typeof raw.cwd === 'string' ? raw.cwd.trim() : '',
    mediaDir: typeof raw.mediaDir === 'string' ? raw.mediaDir.trim() : '',
    mediaTtlMs: integer(raw.mediaTtlMs, DEFAULT_MODEL.mediaTtlMs, 60_000),
    retryMaxRetries: integer(raw.retryMaxRetries, DEFAULT_MODEL.retryMaxRetries, 0),
    retryInitialDelayMs: integer(raw.retryInitialDelayMs, DEFAULT_MODEL.retryInitialDelayMs, 100),
    retryMaxDelayMs: integer(raw.retryMaxDelayMs, DEFAULT_MODEL.retryMaxDelayMs, 100),
    suppressAgyAutoUpdate: raw.suppressAgyAutoUpdate !== false && (process.platform === 'win32' || raw.suppressAgyAutoUpdate === true),
    goalContext: raw.goalContext !== false,
    planContext: raw.planContext !== false,
    warnings,
  }
}

/**
 * Resolve the agy executable without starting it.
 * @param {typeof DEFAULT_MODEL} config - model config.
 * @returns {{ ok: true, command: string, args: string[] } | { ok: false, error: string }} launch plan.
 */
export function resolveAgy(config) {
  const binary = config.agyPath !== '' ? config.agyPath : 'agy'
  try {
    const plan = resolveCommand(binary, config.agyArgs)
    return { ok: true, command: plan.command, args: plan.args }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Format the permission flags for one agy run.
 * @param {typeof DEFAULT_MODEL} config - model config.
 * @returns {string[]} argv flags.
 */
export function permissionArgs(config, mode = config.permissionMode) {
  if (mode === 'skip') return ['--dangerously-skip-permissions']
  return ['--mode', mode]
}

/**
 * Resolve the agy home whose update-check timestamp is refreshed.
 * @param {typeof DEFAULT_MODEL} config - model config.
 * @returns {string} absolute agy home.
 */
export function agyHome(config) {
  if (config.agyHome !== '') return config.agyHome
  if (typeof process.env.AGY_HOME === 'string' && process.env.AGY_HOME !== '') return process.env.AGY_HOME
  return join(homedir(), '.gemini', 'antigravity-cli')
}

/**
 * Refresh agy's update-check fast path so its background updater does not spawn.
 * @param {typeof DEFAULT_MODEL} config - model config.
 * @returns {boolean} whether the timestamp was refreshed.
 */
export function suppressAgyUpdater(config) {
  if (!config.suppressAgyAutoUpdate) return false
  const directory = agyHome(config)
  try {
    mkdirSync(directory, { recursive: true, mode: 0o700 })
    const timestamp = join(directory, 'last_check.timestamp')
    if (existsSync(timestamp)) {
      const now = new Date()
      utimesSync(timestamp, now, now)
    } else {
      writeFileSync(timestamp, '', { mode: 0o600 })
    }
    return true
  } catch {
    return false
  }
}

/**
 * Classify one agy run failure for retry and UI routing.
 * @param {string} text - result error, stderr tail, or timeout message.
 * @returns {{ code: string, message: string }} stable failure code and trimmed message.
 */
export function classifyFailure(text) {
  const message = text.trim() === '' ? 'agy did not complete the request' : text.trim()
  if (/(?:\b429\b|quota|rate.?limit|resource.?exhausted|too many requests)/i.test(message)) return { code: 'AGY_RATE_LIMIT', message }
  if (/(?:not signed in|invalid_grant|unauthori[sz]ed|\b401\b|\b403\b|login required|auth(?:entication)? failed)/i.test(message)) return { code: 'AGY_AUTH', message }
  // Capacity exhaustion gets a distinct non-retryable code so the adapter can
  // downgrade effort; generic server overload still uses AGY_SERVER.
  if (/(?:no capacity available|capacity unavailable|unavailable.*capacity|capacity.*unavailable)/i.test(message)) return { code: 'AGY_CAPACITY', message }
  if (/(?:\bUNAVAILABLE\b|overloaded|server.?busy|\b50[03]\b)/i.test(message)) return { code: 'AGY_SERVER', message }
  if (/(?:econnreset|econnrefused|enotfound|ehostunreach|network|fetch failed|socket hang up|tls|timeout|timed out|\b50[24]\b|service unavailable)/i.test(message)) return { code: 'AGY_NETWORK', message }
  if (/(?:not eligible|eligibility|unsupported account|permission denied|access denied)/i.test(message)) return { code: 'AGY_ELIGIBILITY', message }
  if (/(?:tool .*failed|command failed|exit code|permission required)/i.test(message)) return { code: 'AGY_TOOL', message }
  return { code: 'AGY_ERROR', message }
}

/**
 * Build the child environment with the optional proxy.
 * @param {NodeJS.ProcessEnv} base - inherited environment.
 * @param {string} proxyUrl - optional proxy URL.
 * @returns {NodeJS.ProcessEnv} child environment.
 */
export function modelEnvironment(base, proxyUrl) {
  if (proxyUrl === '') return { ...base }
  const noProxy = base.NO_PROXY ?? base.no_proxy ?? ''
  const mergedNoProxy = noProxy === '' ? '127.0.0.1,localhost,::1' : noProxy + ',127.0.0.1,localhost,::1'
  return {
    ...base,
    HTTP_PROXY: proxyUrl,
    HTTPS_PROXY: proxyUrl,
    ALL_PROXY: proxyUrl,
    http_proxy: proxyUrl,
    https_proxy: proxyUrl,
    all_proxy: proxyUrl,
    NO_PROXY: mergedNoProxy,
    no_proxy: mergedNoProxy,
  }
}

/**
 * Whether an error looks like an Antigravity quota/rate-limit failure.
 * @param {string} text - result error or stderr.
 * @returns {boolean} true for quota-class failures.
 */
export function isQuotaFailure(text) {
  return /(?:\b429\b|quota|rate.?limit|resource.?exhausted|exhausted|limit reached|too many requests)/i.test(text)
}

/**
 * Find agy on PATH when no explicit path is configured.
 * @returns {string | undefined} executable path.
 */
export function findAgyOnPath() {
  return findOnPath('agy')
}