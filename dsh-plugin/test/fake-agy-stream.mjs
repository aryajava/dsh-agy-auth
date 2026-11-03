#!/usr/bin/env node
/** Fake agy stream-json process for adapter tests. */
import { appendFileSync, existsSync, writeFileSync } from 'node:fs'

const argv = process.argv.slice(2)
const log = process.env.FAKE_AGY_ARGV
if (log !== undefined && log !== '') appendFileSync(log, JSON.stringify(argv) + '\n')

if (argv.includes('models')) {
  process.stdout.write('gemini-3.8-flash-high\tGemini 3.8 Flash (High)\ngemini-3.8-flash-medium\tGemini 3.8 Flash (Medium)\ngemini-3.8-flash-low\tGemini 3.8 Flash (Low)\nclaude-sonnet-4-6\tClaude Sonnet 4.6 (Thinking)\n')
  process.exit(0)
}

const capacityFile = process.env.FAKE_AGY_CAPACITY_FILE
if (capacityFile !== undefined && capacityFile !== '' && !existsSync(capacityFile)) {
  writeFileSync(capacityFile, '1')
  const modelIndex = argv.indexOf('--model')
  const model = modelIndex >= 0 ? argv[modelIndex + 1] : 'gemini-3.8-flash-high'
  process.stdout.write(JSON.stringify({
    event: 'init',
    conversation_id: 'conv-capacity',
    init: { model, cwd: process.cwd(), tools: [], permission_mode: 'always-proceed' },
  }) + '\n')
  process.stdout.write(JSON.stringify({
    event: 'result',
    result: {
      conversation_id: 'conv-capacity',
      status: 'ERROR',
      error: 'API error (attempt 4): UNAVAILABLE (code 503): No capacity available for model ' + model + ' on the server',
      usage: { input_tokens: 10, output_tokens: 0, total_tokens: 10 },
    },
  }) + '\n')
  process.exit(0)
}

const conversationIndex = argv.indexOf('--conversation')
const conversation = conversationIndex >= 0 ? argv[conversationIndex + 1] : 'conv-new'
const lines = [
  { event: 'init', conversation_id: conversation, init: { model: 'gemini-3.8-flash-low', cwd: process.cwd(), tools: [], permission_mode: 'always-proceed' } },
  { event: 'step_update', step_update: { step_index: 1, state: 'ACTIVE', step_type: 'thinking', text_delta: 'considering' } },
  { event: 'step_update', step_update: { step_index: 2, state: 'ACTIVE', step_type: 'tool_call', tool_info: { name: 'run_command', parameters: { command: 'echo hi' } } } },
  { event: 'step_update', step_update: { step_index: 2, state: 'DONE', step_type: 'tool_call', tool_info: { name: 'run_command', output: 'hi' } } },
  { event: 'step_update', step_update: { step_index: 3, state: 'ACTIVE', step_type: 'agent_response', text_delta: 'Hello ' } },
  { event: 'step_update', step_update: { step_index: 3, state: 'DONE', step_type: 'agent_response', text_delta: 'world', usage: { input_tokens: 100, output_tokens: 5, thinking_tokens: 3, total_tokens: 105 } } },
  { event: 'result', result: { conversation_id: conversation, status: 'SUCCESS', response: 'Hello world', usage: { input_tokens: 100, output_tokens: 5, thinking_tokens: 3, total_tokens: 105 } } },
]
for (const line of lines) process.stdout.write(JSON.stringify(line) + '\n')