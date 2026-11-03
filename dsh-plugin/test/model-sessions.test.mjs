import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { SessionBindings } from '../src/model/sessions.js'

test('persists and clears session bindings', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-agy-model-sessions-'))
  const file = join(dir, 'sessions.json')
  try {
    const store = new SessionBindings(file)
    assert.equal(store.get('s1'), undefined)
    store.set('s1', 'conv-1', 'gemini-3.8-flash-low')
    const entry = store.getEntry('s1')
    assert.equal(entry.conversationId, 'conv-1')
    assert.equal(entry.model, 'gemini-3.8-flash-low')

    const reloaded = new SessionBindings(file)
    assert.equal(reloaded.get('s1'), 'conv-1')
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    assert.equal(parsed.sessions.s1.conversationId, 'conv-1')

    reloaded.remove('s1')
    assert.equal(reloaded.get('s1'), undefined)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
