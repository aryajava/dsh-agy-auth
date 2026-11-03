/** Antigravity model adapter backed by the installed agy CLI. */
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { createInterface } from 'node:readline'
import { classifyEvent, formatToolActivity } from './events.js'
import { AgyModelCatalog, groupModels, resolveModelTarget } from './catalog.js'
import { SessionBindings } from './sessions.js'
import { buildPrompt } from './prompt.js'
import {
  classifyFailure, modelEnvironment, permissionArgs, resolveAgy, suppressAgyUpdater,
} from './config.js'

const PROVIDER = 'antigravity'
const MAX_STDERR = 16_000
const MAX_STDERR_LINES = 200

/**
 * Abort-shaped error used before a stream is established.
 * @param {string} message - failure message.
 * @returns {Error} coded error.
 */
function abortError(message) {
  return Object.assign(new Error(message), { code: 'ABORTED' })
}

/**
 * Bound concurrent agy runs with a FIFO queue.
 */
class Semaphore {
  /**
   * @param {number} limit - maximum concurrent holders.
   */
  constructor(limit) {
    this.limit = limit
    this.active = 0
    this.waiters = []
  }

  /**
   * Acquire one slot.
   * @param {AbortSignal} [signal] - cancellation.
   * @returns {Promise<() => void>} release callback.
   */
  acquire(signal) {
    if (signal?.aborted === true) return Promise.reject(abortError('the Antigravity call was cancelled'))
    if (this.active < this.limit) {
      this.active += 1
      return Promise.resolve(() => { this.release() })
    }
    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject, signal, onAbort: undefined }
      if (signal !== undefined) {
        waiter.onAbort = () => {
          const index = this.waiters.indexOf(waiter)
          if (index >= 0) this.waiters.splice(index, 1)
          reject(abortError('the Antigravity call was cancelled'))
        }
        signal.addEventListener('abort', waiter.onAbort, { once: true })
      }
      waiter.resolve = () => {
        if (waiter.onAbort !== undefined) waiter.signal.removeEventListener('abort', waiter.onAbort)
        this.active += 1
        resolve(() => { this.release() })
      }
      this.waiters.push(waiter)
    })
  }

  /** Release one slot and wake the next waiter. */
  release() {
    this.active = Math.max(0, this.active - 1)
    const next = this.waiters.shift()
    if (next !== undefined) next.resolve()
  }
}

/**
 * Create a bounded async queue of stream chunks.
 * @returns {object} queue with async iterator and push/end/fail.
 */
function createQueue() {
  const items = []
  const waiters = []
  let ended = false
  let error
  return {
    push(item) {
      if (ended) return
      const waiter = waiters.shift()
      if (waiter !== undefined) waiter.resolve({ value: item, done: false })
      else items.push(item)
    },
    end() {
      if (ended) return
      ended = true
      for (const waiter of waiters.splice(0)) waiter.resolve({ value: undefined, done: true })
    },
    fail(cause) {
      if (ended) return
      ended = true
      error = cause
      for (const waiter of waiters.splice(0)) waiter.reject(cause)
    },
    [Symbol.asyncIterator]() {
      return {
        next() {
          if (items.length > 0) return Promise.resolve({ value: items.shift(), done: false })
          if (error !== undefined) return Promise.reject(error)
          if (ended) return Promise.resolve({ value: undefined, done: true })
          return new Promise((resolve, reject) => waiters.push({ resolve, reject }))
        },
      }
    },
  }
}

/**
 * Kill one agy child and its process tree.
 * @param {import('node:child_process').ChildProcess | null} child - child.
 */
function killTree(child) {
  if (child === null || child.pid === undefined) return
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
    } else {
      process.kill(-child.pid, 'SIGKILL')
    }
  } catch {
    try { child.kill('SIGKILL') } catch { /* already gone */ }
  }
}

/**
 * Build the coding workspace for one session.
 * @param {object} options - resolution inputs.
 * @param {Record<string, unknown>} options.ctx - plugin context.
 * @param {string} options.sessionId - DSH session id.
 * @param {string} options.fallback - configured fallback.
 * @returns {string} absolute existing directory.
 */
function resolveWorkspace(options) {
  const sessions = options.ctx.get('sessions')
  if (sessions !== undefined && options.sessionId !== '') {
    try {
      const header = sessions.get(options.sessionId)?.header
      const cwd = header?.cwd ?? header?.workspace
      if (typeof cwd === 'string' && cwd !== '' && statSync(cwd).isDirectory()) return cwd
    } catch {
      // Session may have disappeared; use the fallback.
    }
  }
  if (options.fallback !== '') {
    try {
      if (statSync(options.fallback).isDirectory()) return options.fallback
    } catch {
      // Invalid configured workspace; fall back to the host cwd.
    }
  }
  return process.cwd()
}

/**
 * Write a long prompt to a temp file so it fits argv limits.
 * @param {string} stateFile - session binding file; prompts live beside it.
 * @param {string} prompt - prompt text.
 * @returns {string} file path.
 */
function writePromptFile(stateFile, prompt) {
  const directory = join(dirname(stateFile), 'prompts')
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const file = join(directory, 'prompt-' + randomUUID() + '.md')
  writeFileSync(file, prompt, { encoding: 'utf8', mode: 0o600 })
  return file
}

/**
 * Collect image attachment references from request messages.
 * @param {unknown} messages - request messages.
 * @returns {{ attachment: Record<string, unknown> }[]} image blocks.
 */
function collectImages(messages) {
  const found = []
  const walk = (value) => {
    if (value === null || typeof value !== 'object') return
    if (Array.isArray(value)) {
      for (const entry of value) walk(entry)
      return
    }
    if (value.type === 'image' && value.attachment !== undefined && value.attachment !== null) {
      found.push({ attachment: value.attachment })
      return
    }
    for (const key of ['content', 'messages']) {
      if (value[key] !== undefined) walk(value[key])
    }
  }
  walk(messages)
  return found
}

/**
 * Stage image attachments into a directory agy is allowed to read.
 * @param {object} options - staging options.
 * @param {Record<string, any>} options.ctx - plugin context.
 * @param {Record<string, any>} options.config - model config.
 * @param {{ attachment: Record<string, unknown> }[]} options.images - image blocks.
 * @param {AbortSignal} [options.signal] - cancellation.
 * @param {(message: string) => void} options.log - diagnostic sink.
 * @returns {Promise<{ files: { path: string, name?: string }[], dirs: string[] }>} staged files.
 */
async function stageImages(options) {
  const store = options.ctx.get('attachments')
  if (store === undefined || (typeof store.readImage !== 'function' && typeof store.imageHostPath !== 'function')) return { files: [], dirs: [] }
  const directory = options.config.mediaDir !== ''
    ? options.config.mediaDir
    : join(dirname(options.config.stateFile), 'media')
  try {
    mkdirSync(directory, { recursive: true, mode: 0o700 })
    const now = Date.now()
    for (const name of readdirSync(directory)) {
      const path = join(directory, name)
      try {
        if (now - statSync(path).mtimeMs > options.config.mediaTtlMs) unlinkSync(path)
      } catch {
        // Best-effort retention.
      }
    }
  } catch {
    return { files: [], dirs: [] }
  }
  const files = []
  const dirs = new Set()
  const seen = new Set()
  for (const image of options.images.slice(0, 20)) {
    const attachment = image.attachment
    const id = typeof attachment.attachmentId === 'string' ? attachment.attachmentId : ''
    if (id !== '' && seen.has(id)) continue
    if (id !== '') seen.add(id)
    try {
      let path
      if (typeof store.imageHostPath === 'function') path = store.imageHostPath(attachment)
      if (typeof path !== 'string' || path === '' || !existsSync(path)) {
        const stored = await store.readImage(attachment, options.signal)
        const mediaType = typeof attachment.mediaType === 'string' ? attachment.mediaType : 'image/png'
        const extension = mediaType === 'image/jpeg' ? '.jpg' : mediaType === 'image/webp' ? '.webp' : mediaType === 'image/gif' ? '.gif' : '.png'
        const leaf = 'img-' + (id === '' ? randomUUID() : id.slice(0, 24)) + '-' + randomUUID().slice(0, 8) + extension
        path = join(directory, leaf)
        writeFileSync(path, Buffer.from(stored.data), { mode: 0o600 })
      }
      files.push({
        path,
        ...(typeof attachment.name === 'string' && attachment.name !== '' ? { name: attachment.name } : {}),
      })
      dirs.add(dirname(path))
    } catch (error) {
      options.log('image staging skipped: ' + (error instanceof Error ? error.message : String(error)))
    }
  }
  return { files, dirs: [...dirs] }
}

/**
 * Read the DSH goal and plan-mode state for one session.
 * @param {Record<string, any>} ctx - plugin context.
 * @param {string} sessionId - DSH session id.
 * @param {Record<string, any>} config - model config.
 * @returns {{ goal?: Record<string, unknown>, planActive?: boolean }} context.
 */
function sessionContext(ctx, sessionId, config) {
  if (sessionId === '') return {}
  try {
    const agents = ctx.get('agents')
    const agent = agents?.get(sessionId)
    if (agent === undefined) return {}
    const result = {}
    if (config.goalContext) {
      const goal = ctx.get('goals')?.get(agent)
      if (goal !== undefined) {
        result.goal = {
          objective: goal.objective,
          phase: goal.phase,
          roundsStarted: goal.roundsStarted,
          maxGoalRounds: goal.maxGoalRounds,
        }
      }
    }
    if (config.planContext) {
      const plan = ctx.get('planMode')?.get(agent)
      if (plan !== undefined) result.planActive = plan.active === true
    }
    return result
  } catch {
    return {}
  }
}

/**
 * Create the Antigravity adapter object.
 * @param {object} options - adapter dependencies.
 * @param {Record<string, any>} options.config - normalized model config.
 * @param {import('../service.js').AgyAuthService} options.service - account service.
 * @param {Record<string, any>} options.ctx - plugin context.
 * @param {(message: string) => void} options.log - diagnostic sink.
 * @returns {Record<string, any>} adapter.
 */
export function createAntigravityAdapter(options) {
  const config = options.config
  const service = options.service
  const ctx = options.ctx
  const log = options.log
  const activity = options.activity
  const sessions = new SessionBindings(config.stateFile, log)
  const semaphore = new Semaphore(config.maxConcurrent)
  const active = new Set()
  let disposed = false
  const catalog = new AgyModelCatalog({
    config,
    environment: () => modelEnvironment(service.environment(), config.proxyUrl),
    cwd: config.cwd !== '' ? config.cwd : process.cwd(),
    log,
  })

  /**
   * Return model metadata for the picker.
   * @param {string} model - model id.
   * @param {AbortSignal} [signal] - cancellation.
   * @returns {Promise<Record<string, unknown>>} resolved model.
   */
  async function resolveModelInfo(model, signal) {
    const models = await catalog.list(signal)
    const grouped = groupModels(models)
    const target = resolveModelTarget(model, config.defaultEffort)
    const found = grouped.find(entry => entry.id === (target.gemini ? target.model : model))
    const effortName = (value) => value.charAt(0).toUpperCase() + value.slice(1)
    const info = {
      provider: PROVIDER,
      id: model,
      name: found?.name ?? model,
      description: 'Google Antigravity model through the agy CLI',
      inputModalities: ['text', 'image'],
      context: { contextWindow: config.contextWindow },
      defaultMaxTokens: config.maxTokens,
    }
    if (target.gemini && Array.isArray(found?.efforts) && found.efforts.length > 0) {
      const defaultEffort = target.effort !== undefined && found.efforts.includes(target.effort)
        ? target.effort
        : found.efforts.includes(config.defaultEffort) ? config.defaultEffort : undefined
      info.reasoning = {
        efforts: found.efforts.map(effort => ({ id: effort, name: effortName(effort) })),
        ...(defaultEffort === undefined ? {} : { defaultEffort }),
      }
    }
    return info
  }

  /**
   * Build the primary request plus same-family lower-effort attempts.
   * @param {Record<string, any>} request - GenerateOptions.
   * @returns {Promise<Record<string, any>[]>} attempts in order.
   */
  async function capacityAttempts(request) {
    const primary = { ...request, provider: PROVIDER }
    if (!config.capacityFallback) return [primary]
    try {
      const model = typeof request.model === 'string' && request.model !== '' ? request.model : config.defaultModel
      const target = resolveModelTarget(model, config.defaultEffort)
      if (!target.gemini) return [primary]
      const current = typeof request.reasoningEffort === 'string' && request.reasoningEffort !== ''
        ? request.reasoningEffort
        : target.effort ?? config.defaultEffort
      const order = ['low', 'medium', 'high', 'xhigh', 'max']
      const index = order.indexOf(current)
      if (index <= 0) return [primary]
      return [
        primary,
        ...order.slice(0, index).reverse().map(effort => ({
          ...request,
          provider: PROVIDER,
          model: target.model,
          reasoningEffort: effort,
        })),
      ]
    } catch {
      return [primary]
    }
  }

  /**
   * Wrap a queue so a capacity failure before any content can be retried
   * without leaking the failed attempt's usage or finish to the consumer.
   * @param {object} forward - real stream queue.
   * @returns {Record<string, any>} attempt queue.
   */
  function createAttemptQueue(forward) {
    let content = false
    let pendingUsage
    let pendingFinish
    let retryableCapacity = false
    return {
      push(chunk) {
        if (chunk.type === 'usage') {
          pendingUsage = chunk
          return
        }
        if (chunk.type === 'finish') {
          pendingFinish = chunk
          retryableCapacity = chunk.reason.kind === 'error'
            && chunk.reason.failure?.code === 'AGY_CAPACITY'
            && !content
          if (!retryableCapacity) {
            if (pendingUsage !== undefined) forward.push(pendingUsage)
            forward.push(chunk)
          }
          return
        }
        if (chunk.type === 'block-start' || chunk.type === 'text-delta'
          || chunk.type === 'reasoning-delta' || chunk.type === 'block-end') content = true
        forward.push(chunk)
      },
      end() {},
      fail(error) { forward.fail(error) },
      get retryableCapacity() { return retryableCapacity },
      flushFailure() {
        if (pendingUsage !== undefined) forward.push(pendingUsage)
        if (pendingFinish !== undefined) forward.push(pendingFinish)
      },
    }
  }

  /**
   * Run one prompt through agy and push chunks into the queue.
   * @param {Record<string, any>} request - GenerateOptions.
   * @param {object} queue - chunk queue.
   * @param {(child: import('node:child_process').ChildProcess | null) => void} setChild - child handle.
   */
  async function produce(request, queue, setChild) {
    const plan = resolveAgy(config)
    if (!plan.ok) {
      queue.fail(Object.assign(new Error('agy is not available: ' + plan.error), { code: 'AGY_NOT_FOUND' }))
      return
    }
    const purpose = typeof request.purpose === 'string' ? request.purpose : undefined
    if (purpose !== undefined && !config.allowAuxiliary) {
      throw Object.assign(new Error('auxiliary DSH calls are disabled for the Antigravity provider'), { code: 'AUXILIARY_DISABLED' })
    }
    const requestedModel = typeof request.model === 'string' && request.model !== '' ? request.model : config.defaultModel
    const target = resolveModelTarget(requestedModel, config.defaultEffort)
    const model = target.model
    const bindingModel = model
    const effort = target.gemini
      ? (typeof request.reasoningEffort === 'string' && request.reasoningEffort !== '' ? request.reasoningEffort : target.effort ?? config.defaultEffort)
      : undefined
    const runModel = target.gemini && effort !== undefined ? target.model + '-' + effort : model
    const sessionId = typeof request.sessionId === 'string' ? request.sessionId : ''
    let entry = purpose === undefined && sessionId !== '' ? sessions.getEntry(sessionId) : undefined
    if (entry !== undefined && entry.model !== undefined && entry.model !== '' && entry.model !== bindingModel) {
      sessions.remove(sessionId)
      entry = undefined
    }
    const imageBundle = purpose === undefined
      ? await stageImages({
        ctx,
        config,
        images: collectImages(Array.isArray(request.messages) ? request.messages : []),
        signal: request.signal,
        log,
      })
      : { files: [], dirs: [] }
    const session = purpose === undefined ? sessionContext(ctx, sessionId, config) : {}
    const prompt = buildPrompt({
      messages: Array.isArray(request.messages) ? request.messages : [],
      system: typeof request.system === 'string' ? request.system : undefined,
      conversationId: entry?.conversationId,
      forwardSystemPrompt: config.forwardSystemPrompt,
      maxChars: purpose === undefined ? config.contextChars : config.auxiliaryMaxChars,
      purpose,
      images: imageBundle.files,
      goal: session.goal,
      planActive: session.planActive,
    })
    let promptFile
    let termPrompt = prompt
    if (prompt.length > config.maxPromptChars) {
      promptFile = writePromptFile(config.stateFile, prompt)
      termPrompt = 'Read the full task from ' + promptFile + ' and carry it out. Do not ask for confirmation; use the tools available to you.'
    }
    const cwd = resolveWorkspace({ ctx, sessionId, fallback: config.cwd })
    const permissionMode = purpose === undefined ? config.permissionMode : config.auxiliaryPermissionMode
    const args = [
      ...plan.args,
      '-p', termPrompt,
      '--output-format', 'stream-json',
      '--model', runModel,
      '--print-timeout', String(Math.ceil(config.timeoutMs / 1000)) + 's',
      '--disable-slash-commands',
      ...permissionArgs(config, permissionMode),
      ...(entry?.conversationId !== undefined ? ['--conversation', entry.conversationId] : []),
      ...imageBundle.dirs.flatMap(directory => ['--add-dir', directory]),
      ...config.extraArgs,
    ]
    let child = null
    let timedOut = false
    let aborted = false
    let exitCode = null
    let spawnError = null
    let usage = {}
    let conversationId = entry?.conversationId
    let sawText = false
    let sawContent = false
    let resultSeen = false
    let resultOk = true
    let resultError = ''
    let resultResponse = ''
    let parserClosed = false
    const stderrLines = []
    let stderrLength = 0
    let current = null
    let nextIndex = 0
    let idleTimer
    let hardTimer
    let timeoutKind = ''
    let onAbort

    const push = (chunk) => {
      if (chunk.type !== 'usage' && chunk.type !== 'finish') {
        if (chunk.type === 'text-delta') { sawText = true; sawContent = true }
        if (chunk.type === 'reasoning-delta') sawContent = true
      }
      queue.push(chunk)
    }
    const startBlock = (type) => {
      if (current !== null && current.type === type) return
      if (current !== null) closeBlock()
      current = { type, index: nextIndex, text: '' }
      nextIndex += 1
      queue.push({ type: 'block-start', index: current.index, blockType: type })
    }
    const closeBlock = () => {
      if (current === null) return
      queue.push({ type: 'block-end', index: current.index, block: { type: current.type, text: current.text } })
      current = null
    }
    const delta = (type, text) => {
      if (text === '') return
      startBlock(type)
      current.text += text
      if (type === 'text') push({ type: 'text-delta', index: current.index, text })
      else push({ type: 'reasoning-delta', index: current.index, text })
    }
    const annotation = (tool) => {
      if (current !== null) closeBlock()
      startBlock('reasoning')
      delta('reasoning', formatToolActivity(tool) + '\n')
      closeBlock()
    }
    const resetIdle = () => {
      if (timedOut) return
      clearTimeout(idleTimer)
      idleTimer = setTimeout(() => {
        timedOut = true
        timeoutKind = 'idle'
        killTree(child)
      }, config.idleTimeoutMs)
      idleTimer.unref?.()
    }

    try {
      if (request.signal?.aborted === true) {
        aborted = true
        queue.push({ type: 'finish', reason: { kind: 'aborted', failure: { message: 'the Antigravity call was cancelled', code: 'ABORTED' } } })
        return
      }
      suppressAgyUpdater(config)
      child = spawn(plan.command, args, {
        cwd,
        env: modelEnvironment(service.environment(), config.proxyUrl),
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: process.platform !== 'win32',
      })
      setChild(child)
      active.add(child)
      child.stderr?.setEncoding('utf8')
      child.stderr?.on('data', (chunk) => {
        const text = String(chunk)
        for (const line of text.split(/\r?\n/)) {
          if (line.trim() === '') continue
          stderrLines.push(line)
          stderrLength += line.length
          while (stderrLines.length > MAX_STDERR_LINES || stderrLength > MAX_STDERR) {
            const removed = stderrLines.shift()
            stderrLength -= removed === undefined ? 0 : removed.length
          }
        }
      })
      const closePromise = new Promise((resolve) => {
        child.once('error', (error) => { spawnError = error; resolve() })
        child.once('close', (code) => { exitCode = code; resolve() })
      })
      hardTimer = setTimeout(() => {
        timedOut = true
        timeoutKind = 'hard'
        killTree(child)
      }, config.timeoutMs)
      hardTimer.unref?.()
      resetIdle()
      if (request.signal !== undefined) {
        onAbort = () => { aborted = true; killTree(child) }
        if (request.signal.aborted) onAbort()
        else request.signal.addEventListener('abort', onAbort, { once: true })
      }
      if (child.stdout === null) throw new Error('agy produced no stdout pipe')
      const reader = createInterface({ input: child.stdout, crlfDelay: Infinity })
      for await (const line of reader) {
        resetIdle()
        const text = line.trim()
        if (text === '' || text[0] !== '{') continue
        let decoded
        try {
          decoded = JSON.parse(text)
        } catch {
          continue
        }
        const event = classifyEvent(decoded)
        if (event === undefined) continue
        if (event.kind === 'init') {
          if (typeof event.conversationId === 'string' && event.conversationId !== '') {
            conversationId = event.conversationId
            if (purpose === undefined && sessionId !== '') sessions.set(sessionId, conversationId, bindingModel)
          }
          continue
        }
        if (event.kind === 'step') {
          for (const [key, value] of Object.entries(event.usage ?? {})) usage[key] = value
          const family = event.family
          if (family === 'tool' && event.tool !== undefined) {
            if (sessionId !== '' && activity !== undefined) {
              try {
                activity.record(sessionId, { stepIndex: event.stepIndex, tool: event.tool, time: Date.now() })
              } catch {
                // Activity cards are best effort; never fail the model run.
              }
            }
            annotation(event.tool)
            continue
          }
          if (typeof event.text === 'string' && event.text !== '') {
            const blockType = family === 'thinking' ? 'reasoning' : 'text'
            if (event.fragment !== true && family === 'text' && sawText) {
              // A completed step repeats text already streamed as fragments.
              continue
            }
            delta(blockType, event.text)
          }
          continue
        }
        if (event.kind === 'result') {
          resultSeen = true
          resultOk = event.ok === true
          resultError = typeof event.error === 'string' ? event.error : ''
          resultResponse = typeof event.response === 'string' ? event.response : ''
          if (typeof event.conversationId === 'string' && event.conversationId !== '') {
            conversationId = event.conversationId
            if (purpose === undefined && sessionId !== '') sessions.set(sessionId, conversationId, bindingModel)
          }
          for (const [key, value] of Object.entries(event.usage ?? {})) usage[key] = value
        }
      }
      parserClosed = true
      await closePromise
      if (spawnError !== null) {
        queue.fail(Object.assign(new Error('could not start agy: ' + spawnError.message), { code: 'AGY_SPAWN_FAILED' }))
        return
      }
      if (resultResponse !== '' && !sawText) delta('text', resultResponse)
      if (current !== null) closeBlock()
      if (!resultSeen && !aborted && !timedOut && exitCode !== 0) {
        resultOk = false
        resultError = stderrLines.slice(-3).join(' | ') || 'agy exited with code ' + String(exitCode)
      }
      if (!resultSeen && !aborted && !timedOut && exitCode === 0) {
        resultOk = false
        resultError = 'agy produced no final result'
      }
      let failure = ''
      let finish
      if (aborted) {
        finish = { kind: 'aborted', failure: { message: 'the Antigravity call was cancelled', code: 'ABORTED' } }
      } else if (timedOut) {
        failure = timeoutKind === 'idle'
          ? 'agy idle timeout after ' + String(config.idleTimeoutMs) + 'ms'
          : 'agy timed out after ' + String(config.timeoutMs) + 'ms'
        finish = { kind: 'error', failure: { message: failure, code: 'AGY_TIMEOUT' } }
      } else if (resultSeen && resultOk && resultError === '' && (sawContent || resultResponse.trim() !== '')) {
        finish = { kind: 'stop' }
      } else if (resultSeen && resultOk && resultError === '' && !sawContent && resultResponse.trim() === '') {
        finish = { kind: 'error', failure: { message: 'agy returned an empty response', code: 'AGY_EMPTY' } }
      } else {
        failure = resultError !== '' ? resultError : 'agy did not complete the request'
        const tail = stderrLines.slice(-2).join(' | ')
        if (tail !== '') failure += ' (' + tail.slice(0, 500) + ')'
        const classified = classifyFailure(failure)
        if (config.autoRotate && !sawContent && classified.code === 'AGY_RATE_LIMIT') {
          try {
            const rotated = await service.rotate({ force: false })
            if (rotated.ok) failure += ' Rotated to the next stored agy-auth account; retry the request.'
            else failure += ' Automatic rotation failed: ' + String(rotated.error?.message ?? 'unknown error')
          } catch (error) {
            failure += ' Automatic rotation failed: ' + (error instanceof Error ? error.message : String(error))
          }
        }
        if (purpose === undefined && sessionId !== '' && !sawContent) sessions.remove(sessionId)
        finish = { kind: 'error', failure: { message: failure, code: classified.code } }
      }
      if (Object.keys(usage).length > 0) {
        queue.push({
          type: 'usage',
          usage: {
            inputTokens: usage.input_tokens ?? 0,
            outputTokens: usage.output_tokens ?? 0,
            ...(usage.total_tokens === undefined ? {} : { totalTokens: usage.total_tokens }),
            ...(usage.cache_read_tokens === undefined ? {} : { cacheReadTokens: usage.cache_read_tokens }),
            ...(usage.cache_write_tokens === undefined ? {} : { cacheWriteTokens: usage.cache_write_tokens }),
            ...(usage.thinking_tokens === undefined ? {} : { reasoningTokens: usage.thinking_tokens }),
          },
        })
      }
      queue.push({ type: 'finish', reason: finish })
    } catch (error) {
      if (!parserClosed && !aborted && !timedOut) {
        queue.fail(error)
      } else {
        const failure = classifyFailure(error instanceof Error ? error.message : String(error))
        queue.push({ type: 'finish', reason: { kind: 'error', failure } })
      }
    } finally {
      if (idleTimer !== undefined) clearTimeout(idleTimer)
      if (hardTimer !== undefined) clearTimeout(hardTimer)
      if (onAbort !== undefined && request.signal !== undefined) request.signal.removeEventListener('abort', onAbort)
      if (child !== null) active.delete(child)
      if (promptFile !== undefined) {
        try { unlinkSync(promptFile) } catch { /* best effort */ }
      }
      setChild(null)
      queue.end()
    }
  }

  const adapter = {
    providerInfo(provider) {
      return { id: provider, name: 'Google Antigravity' }
    },
    providerRetryPolicy() {
      // registerAdapter stores this object as the resolved policy; it does not
      // apply resolveRetryPolicy to it. Keep the delay fields top-level so the
      // retry plugin's localDelay()/policyKey never see undefined and produce a
      // NaN delay that the durable llm/retry event cannot serialize.
      return {
        mode: 'normal',
        maxRetries: config.retryMaxRetries,
        retryableCodes: ['AGY_NETWORK', 'AGY_TIMEOUT', 'AGY_EMPTY', 'AGY_SERVER'],
        initialDelayMs: config.retryInitialDelayMs,
        maxDelayMs: Math.max(config.retryInitialDelayMs, config.retryMaxDelayMs),
        jitterRatio: 0.2,
      }
    },
    imageRequestPricing() {
      return undefined
    },
    imageRequestTarget(_provider, _model, image) {
      return { width: image.width, height: image.height, maxBytes: image.bytes }
    },
    async listModels(provider) {
      if (disposed) return []
      const models = groupModels(await catalog.list())
      const hidden = new Set(config.hiddenModels)
      return models.filter(model => !hidden.has(model.id)).map((model) => {
        const info = {
          provider,
          id: model.id,
          name: model.name,
          description: 'Google Antigravity model through the agy CLI',
          inputModalities: ['text', 'image'],
        }
        if (Array.isArray(model.efforts) && model.efforts.length > 0) {
          const defaultEffort = model.efforts.includes(config.defaultEffort) ? config.defaultEffort : undefined
          info.reasoning = {
            efforts: model.efforts.map(effort => ({ id: effort, name: effort.charAt(0).toUpperCase() + effort.slice(1) })),
            ...(defaultEffort === undefined ? {} : { defaultEffort }),
          }
        }
        return info
      })
    },
    async resolveModel(provider, model, signal) {
      const info = await resolveModelInfo(model, signal)
      return { ...info, provider }
    },
    async prepareCall(provider, model, signal) {
      const info = await resolveModelInfo(model, signal)
      return { model: info, stream: (request) => adapter.stream(request) }
    },
    async *stream(request) {
      if (disposed) throw Object.assign(new Error('the Antigravity provider is disposed'), { code: 'ADAPTER_DISPOSED' })
      if (config.enabled !== true) throw Object.assign(new Error('the Antigravity provider is disabled'), { code: 'ADAPTER_DISABLED' })
      if (request.provider !== undefined && request.provider !== PROVIDER) {
        throw Object.assign(new Error('unsupported provider route: ' + String(request.provider)), { code: 'UNSUPPORTED_PROVIDER' })
      }
      const release = await semaphore.acquire(request.signal)
      let child = null
      const queue = createQueue()
      const task = (async () => {
        const attempts = await capacityAttempts(request)
        for (let index = 0; index < attempts.length; index += 1) {
          const attempt = createAttemptQueue(queue)
          await produce(attempts[index], attempt, (next) => { child = next })
          if (attempt.retryableCapacity && index < attempts.length - 1) continue
          if (attempt.retryableCapacity) attempt.flushFailure()
          break
        }
        queue.end()
      })().catch((error) => {
        queue.fail(error)
      })
      try {
        for await (const chunk of queue) yield chunk
      } finally {
        if (child !== null) killTree(child)
        await task.catch(() => undefined)
        release()
      }
    },
    async status() {
      const plan = resolveAgy(config)
      const models = plan.ok ? await catalog.list() : []
      return {
        enabled: config.enabled,
        provider: PROVIDER,
        available: plan.ok,
        error: plan.ok ? null : plan.error,
        models: groupModels(models),
        defaultModel: config.defaultModel,
        defaultEffort: config.defaultEffort,
        hiddenModels: config.hiddenModels,
        permissionMode: config.permissionMode,
        idleTimeoutMs: config.idleTimeoutMs,
        retry: {
          maxRetries: config.retryMaxRetries,
          initialDelayMs: config.retryInitialDelayMs,
          maxDelayMs: Math.max(config.retryInitialDelayMs, config.retryMaxDelayMs),
          jitterRatio: 0.2,
          retryableCodes: ['AGY_NETWORK', 'AGY_TIMEOUT', 'AGY_EMPTY', 'AGY_SERVER'],
        },
        proxy: config.proxyUrl !== '',
        autoRotate: config.autoRotate,
        capacityFallback: config.capacityFallback,
        suppressAgyAutoUpdate: config.suppressAgyAutoUpdate,
        warnings: config.warnings,
        stateFile: config.stateFile,
      }
    },
    dispose() {
      disposed = true
      for (const child of active) killTree(child)
      active.clear()
    },
  }
  return adapter
}