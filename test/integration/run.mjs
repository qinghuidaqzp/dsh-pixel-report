#!/usr/bin/env node
// End-to-end check in a real dsh, without an API key.
//
// Starts test/mockseek.mjs (local DeepSeek stand-in), then runs three headless
// turns in one real dsh session:
//   1. write hello.js
//   2. edit hello.js
//   3. bash echo pixel-report-ok
// Verifies that stats.json records real LLM usage, cache hits, file changes,
// line counts (+added / -deleted), bash commands, tool calls, turns, and
// omits full directory paths for privacy.
//
// usage: DSH_BIN=/path/to/dsh node test/integration/run.mjs

import { spawn, execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../..')
const DSH = process.env.DSH_BIN || 'dsh'
const PORT = Number(process.env.MOCK_PORT || 3891)

const mock = spawn(process.execPath, [join(root, 'test/mockseek.mjs'), String(PORT)], { stdio: ['ignore', 'pipe', 'inherit'] })
await new Promise((ok, fail) => {
  mock.stdout.on('data', d => { if (String(d).includes('listening')) ok() })
  mock.on('exit', code => fail(new Error(`mock exited ${code}`)))
})

const work = mkdtempSync(join(tmpdir(), 'pixel-report-it-'))
let failed = false
try {
  const statsFile = join(work, 'stats.json')
  const patch = join(work, 'patch.yml')
  writeFileSync(patch, [
    '- id: llm-pi-ai',
    '  config:',
    '    providers:',
    '      mockseek:',
    '        api: openai-completions',
    `        baseURL: http://127.0.0.1:${PORT}/v1`,
    '        apiKeyEnv: MOCKSEEK_KEY',
    '        models:',
    '          - id: deepseek-flash',
    '- id: agent-default-model',
    '  config:',
    '    provider: mockseek',
    '    model: deepseek-flash',
    '- insert:',
    '    - id: pixel-report',
    `      name: ${JSON.stringify(join(root, 'index.js'))}`,
    '      config:',
    `        stateFile: ${JSON.stringify(statsFile)}`,
    '',
  ].join('\n'))

  const env = { ...process.env, DSH_HOME: join(work, 'home'), DSH_TELEMETRY_MODE: 'DISABLED', MOCKSEEK_KEY: 'dummy' }
  const run = args => execFileSync(DSH, ['--profile', 'headless', '--patch', patch, '--approval-policy', 'never', ...args], {
    cwd: work, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  })

  const first = run(['--json', 'please write hello.js'])
  const session = /"sessionId":"([^"]+)"/.exec(first)?.[1]
  assert.ok(session, 'no session id in the first run')
  run(['--session-id', session, 'please edit hello.js'])
  run(['--session-id', session, 'please run bash tool'])

  const raw = readFileSync(statsFile, 'utf8')
  const data = JSON.parse(raw)
  const days = Object.values(data.days)
  assert.equal(days.length, 1, 'expected 1 day bucket')
  const today = days[0]

  console.log('Recorded day summary:', {
    date: today.date,
    requests: today.requests,
    turns: today.turns,
    toolCalls: today.toolCalls,
    commands: today.commands,
    files: Object.values(today.files),
    linesAdded: today.linesAdded,
    linesDeleted: today.linesDeleted,
    promptTokens: today.promptTokens,
    cacheReadTokens: today.cacheReadTokens,
    cost: Number(today.cost.toFixed(6)),
    saved: Number(today.saved.toFixed(6)),
  })

  assert.ok(today.requests >= 6, `expected >= 6 LLM requests, got ${today.requests}`)
  assert.ok(today.turns >= 3, `expected >= 3 turns, got ${today.turns}`)
  assert.ok(today.toolCalls >= 3, `expected >= 3 tool calls, got ${today.toolCalls}`)
  assert.ok(today.commands >= 1, `expected >= 1 bash command, got ${today.commands}`)
  assert.ok(today.cacheReadTokens > 0, 'expected cache hits across turns')
  assert.ok(today.cost > 0, 'expected non-zero cost')
  assert.ok(today.saved > 0, 'expected non-zero cache savings')

  const files = Object.values(today.files)
  assert.ok(files.some(f => f.name === 'hello.js' && f.edits >= 2), 'hello.js not recorded with >= 2 edits')
  assert.ok(today.linesAdded >= 6, `expected >= 6 lines added, got ${today.linesAdded}`)
  assert.ok(today.linesDeleted >= 1, `expected >= 1 lines deleted, got ${today.linesDeleted}`)
  assert.equal(raw.includes(work), false, 'full directory path leaked into stats.json')

  console.log('integration test passed!')
} catch (error) {
  failed = true
  console.error(error)
} finally {
  mock.kill()
  rmSync(work, { recursive: true, force: true })
}
process.exit(failed ? 1 : 0)
