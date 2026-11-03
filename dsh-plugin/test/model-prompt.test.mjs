import assert from 'node:assert/strict'
import test from 'node:test'
import { buildDigest, buildPrompt, isToolResult, latestUserTurn, messageText } from '../src/model/prompt.js'

const messages = [
  { role: 'system', content: [{ type: 'text', text: 'system rules' }] },
  { role: 'user', content: [{ type: 'text', text: 'first question' }] },
  { role: 'assistant', content: [{ type: 'text', text: 'first answer' }] },
  { role: 'user', content: [{ type: 'text', text: 'current question' }] },
]

test('extracts message text and the latest human turn', () => {
  assert.equal(messageText(messages[1]), 'first question')
  const latest = latestUserTurn(messages)
  assert.equal(latest.index, 3)
  assert.equal(latest.text, 'current question')
  assert.equal(isToolResult({ role: 'tool', content: [] }), true)
  assert.equal(isToolResult(messages[3]), false)
})

test('ignores DSH runtime-context and system-reminder messages', () => {
  const injected = [
    ...messages,
    { role: 'user', source: { kind: 'runtime-context' }, content: [{ type: 'text', text: 'Current runtime context. This snapshot supersedes earlier runtime-context snapshots.' }] },
    { role: 'user', source: { kind: 'time-context' }, content: [{ type: 'text', text: 'Time sampled while preparing turn 1, step 1.' }] },
  ]
  const latest = latestUserTurn(injected)
  assert.equal(latest.index, 3)
  assert.equal(latest.text, 'current question')
  const prompt = buildPrompt({ messages: injected, system: undefined, conversationId: undefined, forwardSystemPrompt: false, maxChars: 10_000 })
  assert.match(prompt, /current question/)
  assert.doesNotMatch(prompt, /Current runtime context/)
  assert.doesNotMatch(prompt, /Time sampled/)
})

test('strips an inline system reminder from the human message', () => {
  const inline = [
    { role: 'user', content: [{ type: 'text', text: 'Implement the fix.\n\n<system-reminder>\nignore this\n</system-reminder>' }] },
  ]
  assert.equal(latestUserTurn(inline).text, 'Implement the fix.')
})

test('builds a fresh prompt with digest and current request', () => {
  const prompt = buildPrompt({ messages, system: 'system rules', conversationId: undefined, forwardSystemPrompt: false, maxChars: 10_000 })
  assert.match(prompt, /first question/)
  assert.match(prompt, /first answer/)
  assert.match(prompt, /Current request/)
  assert.match(prompt, /current question/)
  assert.doesNotMatch(prompt, /system rules/)
})

test('builds a bound prompt from only the latest request', () => {
  const prompt = buildPrompt({ messages, system: 'system rules', conversationId: 'conv-1', forwardSystemPrompt: false, maxChars: 10_000 })
  assert.match(prompt, /Tool output policy/)
  assert.match(prompt, /current question/)
})

test('includes goal, plan, and staged image context', () => {
  const prompt = buildPrompt({
    messages,
    conversationId: undefined,
    forwardSystemPrompt: false,
    maxChars: 10_000,
    goal: { objective: 'ship the feature', phase: 'active', roundsStarted: 1, maxGoalRounds: 4 },
    planActive: true,
    images: [{ path: 'C:/tmp/shot.png', name: 'shot.png' }],
  })
  assert.match(prompt, /ship the feature/)
  assert.match(prompt, /plan mode/i)
  assert.match(prompt, /C:\/tmp\/shot\.png/)
})

test('forwards the system prompt only when enabled', () => {
  const prompt = buildPrompt({ messages, system: 'system rules', conversationId: 'conv-1', forwardSystemPrompt: true, maxChars: 10_000 })
  assert.match(prompt, /system rules/)
  assert.match(prompt, /current question/)
})

test('digest keeps the most recent text under the budget', () => {
  const digest = buildDigest(messages, 20)
  assert.equal(digest.length <= 20, true)
  assert.match(digest, /first answer|current question/)
})