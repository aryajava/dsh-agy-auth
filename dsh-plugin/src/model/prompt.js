/** Prompt construction for the Antigravity model adapter. */

/**
 * Flatten one content block to text.
 * @param {unknown} block - content block.
 * @returns {string} text.
 */
function blockText(block) {
  if (block === null || typeof block !== 'object') return ''
  const value = block
  if (value.type === 'text' && typeof value.text === 'string') return value.text
  if (value.type === 'reasoning' && typeof value.text === 'string') return value.text
  if (value.type === 'image') {
    const name = typeof value.attachment?.name === 'string' && value.attachment.name !== '' ? ' ' + value.attachment.name : ''
    return '[image' + name + ']'
  }
  if (value.type === 'file') return '[file]'
  if (value.type === 'tool-call') return '[tool call ' + String(value.name ?? '') + ']'
  if (value.type === 'tool-result') {
    const content = Array.isArray(value.content) ? value.content.map(blockText).join('') : ''
    return content === '' ? '[tool result]' : '[tool result] ' + content
  }
  return ''
}

/**
 * Flatten a message to text.
 * @param {Record<string, unknown>} message - DSH message.
 * @returns {string} text.
 */
export function messageText(message) {
  if (message === null || typeof message !== 'object') return ''
  const content = message.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map(blockText).filter(part => part !== '').join('')
  return ''
}

/**
 * Whether a message is a tool result, not a human turn.
 * @param {Record<string, unknown>} message - DSH message.
 * @returns {boolean} true for tool results.
 */
export function isToolResult(message) {
  if (message === null || typeof message !== 'object') return false
  if (message.role === 'tool') return true
  const source = message.source
  if (source !== null && typeof source === 'object' && source.kind === 'tool') return true
  return Array.isArray(message.content) && message.content.length > 0 && message.content.every(block => block?.type === 'tool-result')
}

/**
 * Whether a user-role message was injected by DSH rather than typed by a human.
 * Runtime context, time context, skill reminders, and file-policy snapshots are
 * user-role messages in the loop's surface; sending the last one as the prompt
 * would replace the human request with harness metadata.
 * @param {Record<string, unknown>} message - DSH message.
 * @returns {boolean} true for synthetic user context.
 */
export function isSyntheticUser(message) {
  if (message === null || typeof message !== 'object' || message.role !== 'user') return false
  const source = message.source
  if (source !== null && typeof source === 'object' && typeof source.kind === 'string') {
    return source.kind !== 'user'
  }
  return false
}

/**
 * Strip harness reminders that may share a real user message.
 * @param {string} text - message text.
 * @returns {string} human-visible text.
 */
export function cleanUserText(text) {
  let value = text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/gi, '').trim()
  const runtime = value.indexOf('\nCurrent runtime context')
  if (runtime > 0) value = value.slice(0, runtime).trim()
  return value
}

/**
 * Find the latest human user message.
 * @param {Record<string, unknown>[]} messages - request messages.
 * @returns {{ index: number, text: string } | undefined} latest user turn.
 */
export function latestUserTurn(messages) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role !== 'user' || isToolResult(message) || isSyntheticUser(message)) continue
    const text = cleanUserText(messageText(message))
    if (text !== '') return { index, text }
  }
  return undefined
}

/**
 * Build a compact conversation digest.
 * @param {Record<string, unknown>[]} messages - messages to include.
 * @param {number} maxChars - total character budget.
 * @returns {string} digest.
 */
export function buildDigest(messages, maxChars) {
  const rows = []
  for (const message of messages) {
    if (message === null || typeof message !== 'object') continue
    if (message.role === 'system' || message.role === 'developer') continue
    if (isSyntheticUser(message)) continue
    const raw = messageText(message)
    const text = (message.role === 'user' ? cleanUserText(raw) : raw).trim()
    if (text === '') continue
    const role = message.role === 'assistant' ? 'Assistant' : isToolResult(message) ? 'Tool' : 'User'
    const clipped = text.length > 4_000 ? text.slice(0, 4_000) + '...' : text
    rows.push(role + ': ' + clipped)
  }
  let digest = rows.join('\n\n')
  if (digest.length > maxChars) digest = digest.slice(digest.length - maxChars)
  return digest
}

/**
 * Build the prompt for one agy run.
 * @param {object} options - prompt options.
 * @param {Record<string, unknown>[]} options.messages - request messages.
 * @param {string | undefined} options.system - system prompt.
 * @param {string | undefined} options.conversationId - bound agy conversation.
 * @param {boolean} options.forwardSystemPrompt - include the DSH system prompt.
 * @param {number} options.maxChars - digest budget.
 * @param {string | undefined} options.purpose - auxiliary purpose.
 * @param {{ path: string, name?: string }[] | undefined} options.images - staged image paths.
 * @param {{ objective?: string, phase?: string, roundsStarted?: number, maxGoalRounds?: number } | undefined} options.goal - active DSH goal.
 * @param {boolean | undefined} options.planActive - whether DSH plan mode is active.
 * @returns {string} prompt text.
 */
export function buildPrompt(options) {
  const messages = Array.isArray(options.messages) ? options.messages : []
  const latest = latestUserTurn(messages)
  const system = options.forwardSystemPrompt && typeof options.system === 'string' && options.system.trim() !== ''
    ? '[System instructions]\n' + options.system.trim() + '\n\n'
    : ''
  const toolPolicy = options.purpose === undefined
    ? '[Tool output policy]\nIf a tool result says its output was truncated and gives a file path, read that file with your file tools before relying on the result. Do not treat the truncation notice as the command output.\n\n'
    : ''
  const context = []
  if (options.goal !== undefined && typeof options.goal.objective === 'string' && options.goal.objective.trim() !== '') {
    const count = options.goal.roundsStarted === undefined ? '' : ' (round ' + String(options.goal.roundsStarted) + '/' + String(options.goal.maxGoalRounds ?? '?') + ')'
    context.push('[DSH goal]\n' + options.goal.objective.trim() + (options.goal.phase === undefined ? '' : ' [' + options.goal.phase + ']') + count)
  }
  if (options.planActive === true) context.push('[DSH plan mode]\nactive — keep the final plan and next actions explicit.')
  const contextText = context.length === 0 ? '' : context.join('\n\n') + '\n\n'
  const imageList = Array.isArray(options.images) && options.images.length > 0
    ? '\n\n[Attached images]\n' + options.images.map(image => '- ' + image.path + (image.name === undefined || image.name === '' ? '' : ' (' + image.name + ')')).join('\n')
    : ''
  if (options.purpose !== undefined) {
    const digest = buildDigest(messages, options.maxChars)
    return system + toolPolicy + contextText + 'This is an internal DSH ' + options.purpose + ' call.\n\n' + (digest === '' ? 'Produce the requested result.' : digest) + imageList
  }
  if (options.conversationId !== undefined && latest !== undefined) {
    const tail = messages.slice(latest.index + 1)
    const tailDigest = buildDigest(tail, Math.min(4_000, options.maxChars))
    return system + toolPolicy + contextText + latest.text + (tailDigest === '' ? '' : '\n\n[Context after the request]\n' + tailDigest) + imageList
  }
  const before = latest === undefined ? messages : messages.slice(0, latest.index)
  const digest = buildDigest(before, options.maxChars)
  if (latest === undefined) {
    return system + toolPolicy + contextText + (digest === '' ? 'Continue the task from the DSH session.' : digest) + imageList
  }
  const header = digest === '' ? '' : '[Recent conversation]\n' + digest + '\n\n'
  return system + toolPolicy + contextText + header + '[Current request]\n' + latest.text + imageList
}