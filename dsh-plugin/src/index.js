/**
 * Host half of the DeepSeek Harness Antigravity account manager.
 *
 * Registers model tools and the same-origin JSON API used by the browser page.
 * The `agy-auth` CLI remains the only component that touches credentials.
 *
 * @module @fikrilal/dsh-agy-auth
 */
import { LaunchError } from './command.js'
import { AgyAuthService, InputError } from './service.js'
import { createTools } from './tools.js'
import { normalizeModelConfig } from './model/config.js'
import { createAntigravityAdapter } from './model/adapter.js'
import { ActivityStore } from './model/activity.js'

/** Cordis plugin name. */
export const name = 'agy-auth'

/** Tools are always available; the HTTP API mounts only when a web server exists. */
export const inject = ['tools']

/** Same-origin route prefix. Keep in sync with src/client/api.ts. */
export const API_PREFIX = '/agy-auth/api'

/** Largest request body accepted by the JSON API. */
const MAX_BODY_BYTES = 64 * 1024

/**
 * Write one JSON response.
 * @param {import('node:http').ServerResponse} res - response to own.
 * @param {number} status - HTTP status.
 * @param {unknown} payload - JSON payload.
 */
function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(payload))
}

/**
 * Read a bounded JSON request body.
 * @param {import('node:http').IncomingMessage} req - request to consume.
 * @returns {Promise<Record<string, unknown>>} parsed object.
 * @throws {InputError} for a missing/incorrect media type, malformed JSON, or an oversized body.
 */
async function readJsonBody(req) {
  const essence = String(req.headers['content-type'] ?? '').split(';', 1)[0].trim().toLowerCase()
  if (essence !== 'application/json') {
    throw new InputError('unsupported_media_type', 'content-type must be application/json')
  }
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.byteLength
    if (size > MAX_BODY_BYTES) {
      req.resume()
      throw new InputError('payload_too_large', 'request body is too large')
    }
    chunks.push(chunk)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (text.trim() === '') return {}
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new InputError('invalid_json', 'request body must be JSON')
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new InputError('invalid_json', 'request body must be a JSON object')
  }
  return parsed
}

/**
 * Build the API handler bound to one service.
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context for trust and logging.
 * @param {AgyAuthService} service - account service.
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => Promise<void>} handler.
 */
function createHandler(ctx, service, activity) {
  let usageCache = null
  let usageAt = 0
  return async (req, res) => {
    const connection = ctx.get('connection')
    const rejection = connection?.requestRejection?.(req)
    if (rejection !== undefined) {
      res.statusCode = rejection
      res.end()
      return
    }
    const url = new URL(req.url ?? '/', 'http://localhost')
    const route = url.pathname.slice(API_PREFIX.length)
    try {
      if (route === '/state') {
        if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: { code: 'method_not_allowed', message: 'use GET' } })
        const state = await service.state({ force: url.searchParams.get('force') === '1' })
        return sendJson(res, 200, state)
      }
      if (route === '/activity') {
        if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: { code: 'method_not_allowed', message: 'use GET' } })
        const session = url.searchParams.get('session') ?? ''
        const since = Number(url.searchParams.get('since') ?? '0')
        const until = Number(url.searchParams.get('until') ?? String(Date.now()))
        return sendJson(res, 200, { ok: true, activities: activity.list(session, Number.isFinite(since) ? since : 0, Number.isFinite(until) ? until : Date.now()) })
      }
      if (route === '/usage') {
        if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: { code: 'method_not_allowed', message: 'use GET' } })
        const force = url.searchParams.get('force') === '1'
        if (!force && usageCache !== null && Date.now() - usageAt < 60_000) {
          return sendJson(res, 200, usageCache)
        }
        usageCache = await service.usageAll()
        usageAt = Date.now()
        return sendJson(res, 200, usageCache)
      }
      if (route === '/switch') {
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: { code: 'method_not_allowed', message: 'use POST' } })
        const body = await readJsonBody(req)
        return sendJson(res, 200, await service.switch(body.account, { target: body.target, relaunch: body.relaunch === true }))
      }
      if (route === '/add') {
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: { code: 'method_not_allowed', message: 'use POST' } })
        const body = await readJsonBody(req)
        return sendJson(res, 200, await service.add({ alias: body.alias, target: body.target }))
      }
      if (route === '/alias') {
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: { code: 'method_not_allowed', message: 'use POST' } })
        const body = await readJsonBody(req)
        return sendJson(res, 200, await service.setAlias(body.account, body.alias))
      }
      if (route === '/remove') {
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: { code: 'method_not_allowed', message: 'use POST' } })
        const body = await readJsonBody(req)
        if (body.confirm !== true) {
          return sendJson(res, 400, { ok: false, error: { code: 'confirmation_required', message: 'confirm must be true' } })
        }
        return sendJson(res, 200, await service.remove(body.account, { logout: body.logout === true }))
      }
      if (route === '/rotate') {
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: { code: 'method_not_allowed', message: 'use POST' } })
        const body = await readJsonBody(req)
        return sendJson(res, 200, await service.rotate({ force: body.force === true, target: body.target, relaunch: body.relaunch === true }))
      }
      if (route === '/clean') {
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: { code: 'method_not_allowed', message: 'use POST' } })
        const body = await readJsonBody(req)
        return sendJson(res, 200, await service.clean({ dryRun: body.dryRun === true }))
      }
      if (route === '/login') {
        if (req.method === 'GET') return sendJson(res, 200, { ok: true, login: service.login.snapshot() })
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: { code: 'method_not_allowed', message: 'use GET or POST' } })
        const body = await readJsonBody(req)
        return sendJson(res, 200, { ok: true, login: await service.login.start(body.alias) })
      }
      if (route === '/login/code') {
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: { code: 'method_not_allowed', message: 'use POST' } })
        const body = await readJsonBody(req)
        return sendJson(res, 200, { ok: true, login: service.login.submitCode(body.code) })
      }
      if (route === '/login/cancel') {
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: { code: 'method_not_allowed', message: 'use POST' } })
        await readJsonBody(req)
        return sendJson(res, 200, { ok: true, login: service.login.cancel() })
      }
      return sendJson(res, 404, { ok: false, error: { code: 'not_found', message: 'unknown endpoint' } })
    } catch (error) {
      if (error instanceof InputError) {
        return sendJson(res, 400, { ok: false, error: { code: error.code, message: error.message } })
      }
      if (error instanceof LaunchError) {
        return sendJson(res, 200, {
          ok: false,
          error: { code: error.code, message: error.message, ...(error.hint === undefined ? {} : { hint: error.hint }) },
        })
      }
      ctx.logger?.warn?.(error instanceof Error ? error : new Error(String(error)))
      return sendJson(res, 500, { ok: false, error: { code: 'internal_error', message: 'internal error' } })
    }
  }
}

/**
 * Build the model-provider diagnostic tool.
 * @param {() => Record<string, any> | null} getAdapter - current adapter.
 * @param {Record<string, any>} modelConfig - normalized model config.
 * @returns {Record<string, unknown>} raw tool definition.
 */
function createModelStatusTool(getAdapter, modelConfig) {
  return {
    name: 'agy_model_status',
    description: 'Show the Antigravity model provider: availability, permission mode, default model/effort, idle timeout, and discovered models.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: {
      schema: { type: 'object' },
      render(_args, value) {
        if (value.ok !== true) {
          return [{ type: 'text', text: 'Antigravity provider unavailable: ' + String(value.error?.message ?? 'not registered') }]
        }
        const lines = [
          'Provider: antigravity (' + (value.enabled ? 'enabled' : 'disabled') + ')',
          'Available: ' + (value.available ? 'yes' : 'no'),
          'Permission: ' + String(value.permissionMode),
          'Default model: ' + String(value.defaultModel) + ' · effort ' + String(value.defaultEffort ?? 'provider default'),
          'Idle timeout: ' + String(Math.round(Number(value.idleTimeoutMs ?? 0) / 1000)) + 's',
          'Retry: ' + String(value.retry?.maxRetries ?? 0) + ' · ' + String(value.retry?.initialDelayMs ?? 0) + 'ms..' + String(value.retry?.maxDelayMs ?? 0) + 'ms',
          'Auto rotation: ' + (value.autoRotate ? 'on' : 'off'),
          'Capacity fallback: ' + (value.capacityFallback === false ? 'off' : 'on'),
          'Windows update suppression: ' + (value.suppressAgyAutoUpdate ? 'on' : 'off'),
          'Proxy: ' + (value.proxy ? 'configured' : 'inherited'),
          'Models: ' + (Array.isArray(value.models) && value.models.length > 0 ? value.models.map(model => model.id).join(', ') : 'none'),
        ]
        if (typeof value.error === 'string') lines.push('Error: ' + value.error)
        if (Array.isArray(value.warnings)) for (const warning of value.warnings) lines.push('Warning: ' + warning)
        return [{ type: 'text', text: lines.join('\n') }]
      },
    },
    async execute() {
      const adapter = getAdapter()
      if (adapter === null) {
        return {
          ok: false,
          enabled: modelConfig.enabled,
          error: { code: 'model_unavailable', message: 'the Antigravity model provider is not registered in this composition' },
        }
      }
      const status = await adapter.status()
      return { ok: true, ...status }
    },
  }
}

/**
 * Mount tools, the model provider, and the browser API.
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @param {Record<string, unknown>} [config] - Loader row config.
 */
export function apply(ctx, config) {
  const service = new AgyAuthService(config)
  const raw = config ?? {}
  const modelConfig = normalizeModelConfig(raw.model, { agyPath: typeof raw.agyPath === 'string' ? raw.agyPath : '' })
  const activity = new ActivityStore(modelConfig.stateFile, (message) => { try { ctx.logger?.info?.(message) } catch { /* logging is best effort */ } })
  let adapter = null
  const modelLog = (message) => { try { ctx.logger?.info?.(message) } catch { /* logging is best effort */ } }
  ctx.effect(() => () => {
    adapter?.dispose?.()
    service.dispose()
  }, 'agy-auth: service')
  for (const definition of createTools(service)) ctx.tools.register(definition)
  ctx.tools.register(createModelStatusTool(() => adapter, modelConfig))
  if (modelConfig.enabled) {
    for (const warning of modelConfig.warnings) {
      try { ctx.logger?.warn?.(warning) } catch { /* logging is best effort */ }
    }
    ctx.inject(['llm'], (scope) => {
      scope.effect(() => {
        const next = createAntigravityAdapter({ config: modelConfig, service, ctx, log: modelLog, activity })
        adapter = next
        let dispose
        try {
          dispose = scope.llm.registerAdapter(['antigravity'], next)
          service.modelStatus = () => next.status()
          modelLog('[agy-auth] registered Antigravity model provider')
        } catch (error) {
          modelLog('[agy-auth] could not register the Antigravity model provider: ' + (error instanceof Error ? error.message : String(error)))
          next.dispose()
          adapter = null
          return () => {}
        }
        return () => {
          try { dispose?.() } catch { /* registration may already be released */ }
          next.dispose()
          if (adapter === next) {
            adapter = null
            service.modelStatus = undefined
          }
        }
      }, 'agy-auth: antigravity model provider')
    })
  }
  ctx.inject(['webServer'], (scope) => {
    scope.effect(() => scope.webServer.register({
      kind: 'prefix',
      path: API_PREFIX,
      handler: createHandler(ctx, service, activity),
    }), 'agy-auth: http api')
  })
}