import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyEvent, formatToolActivity, parseUsage, stepFamily } from '../src/model/events.js'
import { AgyModelCatalog, FALLBACK_MODELS, groupModels, parseModelsOutput, resolveModelTarget } from '../src/model/catalog.js'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('classifies the real agy init, step, and result shapes', () => {
  const init = classifyEvent(JSON.parse('{"event":"init","conversation_id":"conv-1","init":{"model":"gemini-3.8-flash-low","tools":[],"permission_mode":"always-proceed"}}'))
  assert.equal(init.kind, 'init')
  assert.equal(init.conversationId, 'conv-1')
  assert.equal(init.model, 'gemini-3.8-flash-low')

  const step = classifyEvent(JSON.parse('{"event":"step_update","step_update":{"step_index":1,"state":"ACTIVE","step_type":"agent_response","text_delta":"hello"}}'))
  assert.equal(step.kind, 'step')
  assert.equal(step.family, 'text')
  assert.equal(step.text, 'hello')
  assert.equal(step.fragment, true)

  const done = classifyEvent(JSON.parse('{"event":"step_update","step_update":{"step_index":1,"state":"DONE","step_type":"agent_response","text_delta":"","duration_seconds":2.5,"usage":{"input_tokens":100,"output_tokens":5,"thinking_tokens":3,"total_tokens":105}}}'))
  assert.deepEqual(done.usage, { input_tokens: 100, output_tokens: 5, thinking_tokens: 3, total_tokens: 105 })

  const result = classifyEvent(JSON.parse('{"event":"result","result":{"conversation_id":"conv-1","status":"SUCCESS","response":"hello","usage":{"input_tokens":100,"output_tokens":5}}}'))
  assert.equal(result.kind, 'result')
  assert.equal(result.ok, true)
  assert.equal(result.response, 'hello')
  assert.equal(result.conversationId, 'conv-1')
})

test('classifies thinking and tool activity', () => {
  assert.equal(stepFamily('thinking'), 'thinking')
  assert.equal(stepFamily('tool_call'), 'tool')
  assert.equal(stepFamily('agent_response'), 'text')
  const thinking = classifyEvent({ event: 'step_update', step_update: { step_type: 'thinking', text_delta: 'consider' } })
  assert.equal(thinking.family, 'thinking')
  assert.equal(thinking.text, 'consider')
  const tool = classifyEvent({ event: 'step_update', step_update: { step_type: 'tool_call', tool_info: { name: 'run_command', parameters: { command: 'echo hi' }, output: 'hi' } } })
  assert.equal(tool.family, 'tool')
  assert.equal(tool.tool.name, 'run_command')
  assert.equal(tool.tool.output, 'hi')
  assert.match(formatToolActivity(tool.tool), /run_command/)
  assert.match(formatToolActivity(tool.tool), /echo hi/)
})

test('parses usage aliases and rejects non-numbers', () => {
  assert.deepEqual(parseUsage({ inputTokens: 4, completion_tokens: 2, reasoning_tokens: 1, cached_tokens: 3 }), {
    input_tokens: 4, output_tokens: 2, thinking_tokens: 1, cache_read_tokens: 3,
  })
  assert.deepEqual(parseUsage(null), {})
})

test('folds Gemini effort slugs into selectable efforts', () => {
  const grouped = groupModels([
    { id: 'gemini-3.8-flash-high', name: 'Gemini 3.8 Flash (High)' },
    { id: 'gemini-3.8-flash-low', name: 'Gemini 3.8 Flash (Low)' },
    { id: 'claude-sonnet-5-5-high', name: 'Claude Sonnet 5.5 (High)' },
  ])
  assert.deepEqual(grouped[0], { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', efforts: ['low', 'high'] })
  assert.deepEqual(grouped[1], { id: 'claude-sonnet-5-5-high', name: 'Claude Sonnet 5.5 (High)' })
  assert.deepEqual(resolveModelTarget('gemini-3.8-flash-low', 'medium'), { model: 'gemini-3.8-flash', effort: 'low', gemini: true })
  assert.deepEqual(resolveModelTarget('claude-sonnet-5-5-high', 'medium'), { model: 'claude-sonnet-5-5-high', gemini: false })
})

test('uses the fallback catalog when agy cannot be probed', async () => {
  const catalog = new AgyModelCatalog({
    config: { agyPath: join(tmpdir(), 'missing-agy.exe'), agyArgs: [] },
    environment: () => ({}),
    cwd: tmpdir(),
    log: () => {},
  })
  const models = await catalog.list()
  assert.equal(models.length, FALLBACK_MODELS.length)
  assert.equal(models.some(model => model.id === 'gemini-3.8-flash-low'), true)
})

test('parses agy models output', () => {
  const models = parseModelsOutput('Fetching available models...\ngemini-3.8-flash-high\tGemini 3.8 Flash (High)\nclaude-sonnet-4-6  Claude Sonnet 4.6 (Thinking)\n')
  assert.deepEqual(models, [
    { id: 'gemini-3.8-flash-high', name: 'Gemini 3.8 Flash (High)' },
    { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6 (Thinking)' },
  ])
})