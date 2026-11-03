/** Parser for agy --output-format stream-json events. */

/**
 * Pick the first defined property from an object.
 * @param {Record<string, unknown>} object - source.
 * @param {string[]} keys - candidate keys.
 * @returns {unknown} first present value.
 */
function pick(object, keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(object, key)) {
      const value = object[key]
      if (value !== undefined) return value
    }
  }
  return undefined
}

/**
 * Parse the token usage object agy reports.
 * @param {unknown} value - raw usage.
 * @returns {Record<string, number>} normalized usage fields.
 */
export function parseUsage(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {}
  const source = value
  const number = (candidate) => (typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : undefined)
  const result = {}
  const input = number(source.input_tokens ?? source.inputTokens ?? source.prompt_tokens)
  const output = number(source.output_tokens ?? source.outputTokens ?? source.completion_tokens)
  const thinking = number(source.thinking_tokens ?? source.thinkingTokens ?? source.reasoning_tokens)
  const cacheRead = number(source.cache_read_tokens ?? source.cacheReadTokens ?? source.cached_tokens)
  const cacheWrite = number(source.cache_write_tokens ?? source.cacheWriteTokens ?? source.cache_creation_input_tokens)
  const total = number(source.total_tokens ?? source.totalTokens)
  if (input !== undefined) result.input_tokens = input
  if (output !== undefined) result.output_tokens = output
  if (thinking !== undefined) result.thinking_tokens = thinking
  if (cacheRead !== undefined) result.cache_read_tokens = cacheRead
  if (cacheWrite !== undefined) result.cache_write_tokens = cacheWrite
  if (total !== undefined) result.total_tokens = total
  return result
}

/**
 * Normalize an agy step type.
 * @param {unknown} value - step_type.
 * @returns {'text' | 'thinking' | 'tool' | 'other'} step family.
 */
export function stepFamily(value) {
  if (typeof value !== 'string') return 'other'
  const type = value.toLowerCase()
  if (type === 'agent_response' || type === 'assistant' || type === 'text' || type === 'response' || type === 'message') return 'text'
  if (type === 'thinking' || type === 'thought' || type === 'reasoning') return 'thinking'
  if (type.includes('tool') || type === 'function_call' || type === 'subagent' || type === 'subagent_message' || type === 'subagent_result') return 'tool'
  return 'other'
}

/**
 * Extract a text fragment from a step.
 * @param {Record<string, unknown>} source - step payload.
 * @returns {string} text, possibly empty.
 */
export function extractText(source) {
  const delta = source.text_delta ?? source.textDelta
  if (typeof delta === 'string') return delta
  const direct = pick(source, ['text', 'content', 'agent_text', 'agentText', 'output_text'])
  if (typeof direct === 'string') return direct
  const payload = source.payload ?? source.step_payload ?? source.stepPayload
  if (payload !== null && typeof payload === 'object' && !Array.isArray(payload)) {
    const nested = pick(payload, ['text', 'content', 'agent_text', 'agentText'])
    if (typeof nested === 'string') return nested
  }
  return ''
}

/**
 * Extract tool activity from a step.
 * @param {Record<string, unknown>} source - step payload.
 * @returns {{ name: string, args?: unknown, output?: unknown, error?: string } | undefined} tool info.
 */
export function extractTool(source) {
  const info = pick(source, ['tool_info', 'toolInfo', 'tool', 'tool_call', 'toolCall'])
  const holder = info !== null && typeof info === 'object' && !Array.isArray(info) ? info : source
  const name = pick(holder, ['name', 'tool_name', 'toolName', 'canonical_name'])
  if (typeof name !== 'string' || name === '') return undefined
  const args = pick(holder, ['parameters', 'params', 'input', 'args', 'input_json', 'inputJson'])
  const output = pick(holder, ['output', 'result', 'output_text'])
  const rawError = holder.error
  let error
  if (typeof rawError === 'string') error = rawError
  else if (rawError !== null && typeof rawError === 'object' && typeof rawError.message === 'string') error = rawError.message
  const tool = { name }
  if (args !== undefined) tool.args = args
  if (output !== undefined) tool.output = output
  if (error !== undefined) tool.error = error
  return tool
}

/**
 * Classify one decoded stream-json line.
 * @param {unknown} value - decoded JSON object.
 * @returns {Record<string, unknown> | undefined} classified event.
 */
export function classifyEvent(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const object = value
  const eventName = typeof object.event === 'string' ? object.event : typeof object.type === 'string' ? object.type : ''
  if (eventName === 'init' || eventName === 'initialized') {
    const init = object.init !== null && typeof object.init === 'object' && !Array.isArray(object.init) ? object.init : {}
    const conversationId = pick(object, ['conversation_id', 'conversationId'])
    const model = pick(init, ['model', 'modelName']) ?? pick(object, ['model', 'modelName'])
    return {
      kind: 'init',
      conversationId: typeof conversationId === 'string' && conversationId !== '' ? conversationId : undefined,
      model: typeof model === 'string' ? model : undefined,
    }
  }
  if (eventName === 'step_update' || eventName === 'step' || eventName === 'stepUpdate') {
    const nested = object.step_update ?? object.stepUpdate ?? object.step
    const source = nested !== null && typeof nested === 'object' && !Array.isArray(nested) ? nested : object
    const stepType = pick(source, ['step_type', 'stepType', 'type'])
    const family = stepFamily(stepType)
    const tool = family === 'tool' ? extractTool(source) : undefined
    const text = extractText(source)
    const usage = parseUsage(source.usage)
    const state = pick(source, ['state'])
    const stepIndex = pick(source, ['step_index', 'stepIndex', 'step_idx', 'stepIdx'])
    return {
      kind: 'step',
      family,
      stepType: typeof stepType === 'string' ? stepType : '',
      text,
      fragment: source.text_delta !== undefined || source.textDelta !== undefined,
      tool,
      usage,
      state: typeof state === 'string' ? state : undefined,
      stepIndex: typeof stepIndex === 'number' || typeof stepIndex === 'string' ? String(stepIndex) : undefined,
    }
  }
  if (eventName === 'result' || eventName === 'done' || eventName === 'final') {
    const result = object.result !== null && typeof object.result === 'object' && !Array.isArray(object.result) ? object.result : object
    const conversationId = pick(result, ['conversation_id', 'conversationId'])
    const status = pick(result, ['status'])
    const response = pick(result, ['response', 'text', 'content'])
    const rawError = pick(result, ['error', 'error_message', 'errorMessage'])
    const normalizedStatus = status === undefined ? undefined : String(status).toUpperCase()
    const ok = normalizedStatus === undefined
      ? rawError === undefined
      : ['SUCCESS', 'OK', 'COMPLETED', 'DONE'].includes(normalizedStatus)
    const errorText = typeof rawError === 'string'
      ? rawError
      : rawError !== null && typeof rawError === 'object' && typeof rawError.message === 'string'
        ? rawError.message
        : undefined
    return {
      kind: 'result',
      conversationId: typeof conversationId === 'string' ? conversationId : '',
      ok,
      response: typeof response === 'string' ? response : '',
      error: errorText,
      usage: parseUsage(result.usage),
    }
  }
  if (object.usage !== undefined && (object.status !== undefined || object.response !== undefined)) {
    return classifyEvent({ event: 'result', result: object })
  }
  if (object.step_type !== undefined || object.stepType !== undefined) {
    return classifyEvent({ event: 'step_update', step_update: object })
  }
  return undefined
}

/**
 * Format one tool activity line for the reasoning channel.
 * @param {{ name: string, args?: unknown, output?: unknown, error?: string }} tool - tool info.
 * @returns {string} compact annotation.
 */
export function formatToolActivity(tool) {
  const truncate = (value) => {
    const text = typeof value === 'string' ? value : JSON.stringify(value)
    if (typeof text !== 'string') return ''
    return text.length > 600 ? text.slice(0, 600) + '...' : text
  }
  const args = tool.args === undefined ? '' : ' ' + truncate(tool.args)
  const outcome = tool.error !== undefined ? ' -> error: ' + truncate(tool.error) : tool.output !== undefined ? ' -> ' + truncate(tool.output) : ''
  return '[agy tool] ' + tool.name + args + outcome
}