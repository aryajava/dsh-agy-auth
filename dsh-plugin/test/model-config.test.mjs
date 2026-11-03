import assert from 'node:assert/strict'
import { mkdtemp, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { classifyFailure, isQuotaFailure, modelEnvironment, normalizeModelConfig, permissionArgs, suppressAgyUpdater } from '../src/model/config.js'

test('normalizes defaults with the top-level agy path', () => {
  const config = normalizeModelConfig(undefined, { agyPath: 'C:/agy/agy.exe' })
  assert.equal(config.enabled, true)
  assert.equal(config.permissionMode, 'skip')
  assert.equal(config.defaultModel, 'gemini-3.8-flash')
  assert.equal(config.agyPath, 'C:/agy/agy.exe')
  assert.equal(config.maxConcurrent, 1)
  assert.equal(config.warnings.length, 1)
})

test('honors safe permission modes and warns on auto rotation', () => {
  const safe = normalizeModelConfig({ permissionMode: 'plan' }, {})
  assert.deepEqual(permissionArgs(safe), ['--mode', 'plan'])
  assert.equal(safe.warnings.length, 0)
  const rotate = normalizeModelConfig({ permissionMode: 'skip', autoRotate: true }, {})
  assert.equal(rotate.warnings.length, 2)
  assert.deepEqual(permissionArgs(rotate), ['--dangerously-skip-permissions'])
})

test('builds proxy environment with loopback exclusions', () => {
  const env = modelEnvironment({ PATH: 'x', NO_PROXY: 'example.test' }, 'http://127.0.0.1:7890')
  assert.equal(env.HTTPS_PROXY, 'http://127.0.0.1:7890')
  assert.match(env.NO_PROXY, /example\.test/)
  assert.match(env.NO_PROXY, /127\.0\.0\.1/)
  assert.equal(modelEnvironment({ PATH: 'x' }, '').PATH, 'x')
})

test('classifies failures for retry routing', () => {
  assert.equal(classifyFailure('API error: UNAVAILABLE (code 503): No capacity available for model gemini-3.8-flash-high').code, 'AGY_CAPACITY')
  assert.equal(classifyFailure('HTTP 429 quota exhausted').code, 'AGY_RATE_LIMIT')
  assert.equal(classifyFailure('fetch failed: ECONNRESET').code, 'AGY_NETWORK')
  assert.equal(classifyFailure('not signed in').code, 'AGY_AUTH')
  assert.equal(classifyFailure('tool run_command failed').code, 'AGY_TOOL')
})

test('refreshes the agy update timestamp on Windows mode', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'agy-update-'))
  const file = join(dir, 'last_check.timestamp')
  try {
    await writeFile(file, '')
    const old = new Date(Date.now() - 3_600_000)
    await utimes(file, old, old)
    const config = normalizeModelConfig({ suppressAgyAutoUpdate: true, agyHome: dir }, {})
    assert.equal(suppressAgyUpdater(config), true)
    const info = await stat(file)
    assert.equal(info.mtimeMs > old.getTime(), true)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('detects quota failures', () => {
  assert.equal(isQuotaFailure('HTTP 429 Too Many Requests'), true)
  assert.equal(isQuotaFailure('quota exhausted'), true)
  assert.equal(isQuotaFailure('cannot connect to server'), false)
})