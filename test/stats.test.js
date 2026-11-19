import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { isPeak, priceFor, cost } from '../lib/pricing.js'
import { diffLines, countLines } from '../lib/diff.js'
import { evaluateRank, computeGrade } from '../lib/rank.js'
import { StatsTracker, dayKey, hourOf, fileIdentity, extractFileChanges } from '../lib/stats.js'

const BJ_OFFSET = 480 // UTC+8

// Helper: Beijing timestamp -> epoch ms
function bj(iso) {
  return new Date(`${iso}+08:00`).getTime()
}

describe('pricing', () => {
  it('detects Beijing weekday peak hours (9-12, 14-18) vs off-peak & weekends', () => {
    // 2026-11-19 is Thursday
    assert.equal(isPeak(bj('2026-11-19T08:59:00')), false)
    assert.equal(isPeak(bj('2026-11-19T09:00:00')), true)
    assert.equal(isPeak(bj('2026-11-19T11:59:00')), true)
    assert.equal(isPeak(bj('2026-11-19T12:00:00')), false)
    assert.equal(isPeak(bj('2026-11-19T14:00:00')), true)
    assert.equal(isPeak(bj('2026-11-19T17:59:00')), true)
    assert.equal(isPeak(bj('2026-11-19T18:00:00')), false)
    // 2026-11-21 is Saturday
    assert.equal(isPeak(bj('2026-11-21T10:30:00')), false)
  })

  it('doubles prices during peak hours and supports custom price rows', () => {
    const off = priceFor('deepseek-flash', bj('2026-11-19T22:00:00'))
    const pk = priceFor('deepseek-flash', bj('2026-11-19T10:00:00'))
    assert.equal(off.hit, 0.02)
    assert.equal(off.miss, 1)
    assert.equal(off.output, 4)
    assert.equal(pk.hit, 0.04)
    assert.equal(pk.miss, 2)
    assert.equal(pk.output, 8)

    const pro = priceFor('deepseek-v4-pro', bj('2026-11-19T22:00:00'))
    assert.equal(pro.hit, 0.15)
    assert.equal(pro.miss, 4.5)
    assert.equal(pro.output, 13.5)

    const custom = priceFor('my-model', bj('2026-11-19T10:00:00'), {
      rows: [{ match: 'my-model', label: 'My', hit: 0.5, miss: 2, output: 5 }],
      peakPricing: false,
    })
    assert.equal(custom.peak, false)
    assert.equal(custom.hit, 0.5)
    assert.equal(cost(500_000, custom.miss), 1)
  })
})

describe('diff', () => {
  it('counts lines and computes added/deleted accurately', () => {
    assert.equal(countLines(''), 0)
    assert.equal(countLines('a\n'), 1)
    assert.equal(countLines('a\nb\nc\n'), 3)

    assert.deepEqual(diffLines('a\nb\nc\n', 'a\nb\nc\n'), { added: 0, deleted: 0 })
    assert.deepEqual(diffLines(null, 'line1\nline2\n'), { added: 2, deleted: 0 })
    assert.deepEqual(diffLines('a\nb\nc\n', 'a\nx\ny\nc\n'), { added: 2, deleted: 1 })
    assert.deepEqual(diffLines('a\nb\nc\nd\n', 'a\nd\n'), { added: 0, deleted: 2 })
  })
})

describe('rank rules (deterministic)', () => {
  it('returns idle whale for empty period', () => {
    const r = evaluateRank({ requests: 0, toolCalls: 0, turns: 0 })
    assert.equal(r.id, 'idle')
    assert.equal(r.grade, 'ZZZ')
  })

  it('awards Night Owl when activity concentrates after 22:00', () => {
    const hours = new Array(24).fill(0)
    hours[23] = 6
    hours[0] = 4
    const r = evaluateRank({ requests: 6, toolCalls: 4, turns: 4, hours, busiestHour: 23 })
    assert.equal(r.id, 'night-owl')
    assert.equal(r.titleZh, '夜猫子工程师')
    // Must be deterministic
    assert.deepEqual(evaluateRank({ requests: 6, toolCalls: 4, turns: 4, hours, busiestHour: 23 }), r)
  })

  it('awards Early Bird for dawn peak', () => {
    const hours = new Array(24).fill(0)
    hours[6] = 5
    const r = evaluateRank({ requests: 5, toolCalls: 2, turns: 2, hours, busiestHour: 6 })
    assert.equal(r.id, 'early-bird')
  })

  it('awards Refactor Maniac for heavy deletions', () => {
    const hours = new Array(24).fill(0)
    hours[15] = 8
    const r = evaluateRank({
      requests: 8, toolCalls: 6, turns: 4, linesAdded: 80, linesDeleted: 160,
      hours, busiestHour: 15,
    })
    assert.equal(r.id, 'refactor-maniac')
    assert.equal(r.titleZh, '重构狂魔')
  })

  it('awards Cache Whisperer for high cache hit rate + savings', () => {
    const hours = new Array(24).fill(0)
    hours[14] = 8
    const r = evaluateRank({
      requests: 8, toolCalls: 2, turns: 3, promptTokens: 500_000, cacheReadTokens: 460_000, saved: 0.9,
      hours, busiestHour: 14,
    })
    assert.equal(r.id, 'cache-whisperer')
  })

  it('awards Terminal Warlord for command-heavy days', () => {
    const hours = new Array(24).fill(0)
    hours[14] = 20
    const r = evaluateRank({
      requests: 10, toolCalls: 20, commands: 14, turns: 5, hours, busiestHour: 14,
    })
    assert.equal(r.id, 'terminal-warlord')
  })

  it('scales RPG grade monotonically with activity volume', () => {
    assert.equal(computeGrade({ requests: 1, toolCalls: 0, turns: 1 }), 'C')
    assert.equal(computeGrade({ requests: 5, toolCalls: 10, turns: 4, filesChanged: 1 }), 'B')
    assert.equal(computeGrade({ requests: 10, toolCalls: 12, turns: 6, filesChanged: 3, linesAdded: 80 }), 'A')
    assert.equal(computeGrade({ requests: 15, toolCalls: 20, turns: 10, filesChanged: 5, linesAdded: 200 }), 'S')
    assert.equal(computeGrade({ requests: 30, toolCalls: 40, turns: 18, filesChanged: 10, linesAdded: 600, totalTokens: 400_000 }), 'S+')
  })
})

describe('StatsTracker aggregation, timezone buckets, privacy, and reconciliation', () => {
  it('groups Beijing day buckets and 24h hours accurately across midnight', () => {
    const t1 = bj('2026-11-18T23:45:00')
    const t2 = bj('2026-11-19T00:15:00')
    assert.equal(dayKey(t1, BJ_OFFSET), '2026-11-18')
    assert.equal(hourOf(t1, BJ_OFFSET), 23)
    assert.equal(dayKey(t2, BJ_OFFSET), '2026-11-19')
    assert.equal(hourOf(t2, BJ_OFFSET), 0)

    const tracker = new StatsTracker({ now: () => t2, tzOffsetMin: BJ_OFFSET, workspace: '/Users/dev/secret-repo' })
    tracker.observeUsage({
      at: t1,
      options: { model: 'deepseek-flash', sessionId: 's1' },
      usage: { inputTokens: 10_000, cacheReadTokens: 40_000, cacheWriteTokens: 0, outputTokens: 2_000 },
    })
    tracker.observeUsage({
      at: t2,
      options: { model: 'deepseek-flash', sessionId: 's2' },
      usage: { inputTokens: 5_000, cacheReadTokens: 45_000, cacheWriteTokens: 0, outputTokens: 1_000 },
    })

    const rep = tracker.report(t2)
    assert.equal(rep.today.startDate, '2026-11-19')
    assert.equal(rep.today.requests, 1)
    assert.equal(rep.today.hours[0], 1)
    assert.equal(rep.today.hours[23], 0)
    assert.equal(rep.week.requests, 2)
    assert.equal(rep.week.sessions, 2)
    assert.equal(rep.streakDays, 2)
    assert.equal(rep.today.workspace, 'secret-repo')
  })

  it('extracts files & lines from write/edit/apply_patch and never stores full paths', () => {
    const now = bj('2026-11-19T15:00:00')
    const tracker = new StatsTracker({ now: () => now, tzOffsetMin: BJ_OFFSET })

    // Pre-dispatch denied tool must be ignored
    assert.equal(tracker.observeToolResult({
      name: 'bash',
      args: { command: 'rm -rf /' },
      result: { isError: true, error: { message: 'denied', info: { code: 'PERMISSION_DENIED' } } },
      sessionId: 's1',
      at: now,
    }), false)

    // Write file
    tracker.observeToolResult({
      name: 'write',
      args: { file_path: '/Users/alice/private/src/app.js' },
      result: { isError: false, value: { path: '/Users/alice/private/src/app.js', operation: 'create', before: null, after: 'a\nb\nc\n' } },
      sessionId: 's1',
      at: now,
    })

    // Edit same file
    tracker.observeToolResult({
      name: 'edit',
      args: { file_path: '/Users/alice/private/src/app.js' },
      result: { isError: false, value: { path: '/Users/alice/private/src/app.js', before: 'a\nb\nc\n', after: 'a\nb2\nc\nd\n' } },
      sessionId: 's1',
      at: now,
    })

    // Bash command
    tracker.observeToolResult({
      name: 'bash',
      args: { command: 'npm test' },
      result: { isError: false, value: { exitCode: 0 } },
      sessionId: 's1',
      at: now,
    })

    const rep = tracker.report(now)
    assert.equal(rep.today.filesChanged, 1)
    assert.equal(rep.today.linesAdded, 5) // 3 created + 2 added in edit
    assert.equal(rep.today.linesDeleted, 1) // 1 replaced in edit
    assert.equal(rep.today.commands, 1)
    assert.equal(rep.today.toolCalls, 3)
    assert.equal(rep.today.mostEditedFile.name, 'app.js')
    assert.equal(rep.today.mostEditedFile.edits, 2)

    // Ensure serialized JSON never contains full directory path
    const rawJson = JSON.stringify(tracker)
    assert.equal(rawJson.includes('/Users/alice/private'), false)
    assert.equal(fileIdentity('/Users/alice/private/src/app.js').name, 'app.js')

    // Roundtrip load
    const tracker2 = new StatsTracker({ now: () => now, tzOffsetMin: BJ_OFFSET })
    tracker2.load(JSON.parse(rawJson))
    const rep2 = tracker2.report(now)
    assert.equal(rep2.today.filesChanged, 1)
    assert.equal(rep2.today.linesAdded, 5)
    assert.equal(rep2.today.commands, 1)
  })

  it('reconciles workspace/changes without double-counting tool edits and adds shell-edited files', () => {
    const t0 = bj('2026-11-19T16:00:00')
    const tracker = new StatsTracker({ now: () => t0, tzOffsetMin: BJ_OFFSET })

    tracker.observeSessionEvent({ sessionId: 's1', cwd: '/repo/demo', event: { type: 'turn/start', time: t0, data: { turn: 1 } } })
    tracker.observeToolResult({
      name: 'write',
      args: { file_path: '/repo/demo/a.js' },
      result: { isError: false, value: { path: '/repo/demo/a.js', operation: 'create', before: null, after: '1\n2\n3\n' } },
      sessionId: 's1',
      at: t0 + 1000,
    })
    tracker.observeSessionEvent({ sessionId: 's1', cwd: '/repo/demo', event: { type: 'turn/end', time: t0 + 5000, data: { turn: 1 } } })

    // workspace/changes reports the same a.js (net +3) PLUS b.js created by a bash script (+10)
    tracker.observeWorkspaceChanges({
      sessionId: 's1',
      at: t0 + 5100,
      summary: {
        turn: 1,
        cwd: '/repo/demo',
        files: [
          { path: 'a.js', display: 'a.js', added: 3, deleted: 0 },
          { path: 'b.js', display: 'b.js', added: 10, deleted: 0 },
        ],
      },
    })

    const rep = tracker.report(t0 + 6000)
    assert.equal(rep.today.turns, 1)
    assert.equal(rep.today.activeMs, 5000)
    assert.equal(rep.today.filesChanged, 2)
    assert.equal(rep.today.linesAdded, 13) // 3 (not 6!) + 10
    assert.equal(rep.today.linesDeleted, 0)
  })

  it('respects hideNames privacy option', () => {
    const now = bj('2026-11-19T15:00:00')
    const tracker = new StatsTracker({ now: () => now, tzOffsetMin: BJ_OFFSET, hideNames: true, workspace: '/secret/proj' })
    tracker.observeToolResult({
      name: 'write',
      args: { file_path: '/secret/proj/keys.env' },
      result: { isError: false, value: { path: '/secret/proj/keys.env', operation: 'create', before: null, after: 'A=1\n' } },
      sessionId: 's1',
      at: now,
    })
    const rep = tracker.report(now)
    assert.equal(rep.hideNames, true)
    assert.equal(rep.today.workspace, '')
    assert.equal(rep.today.mostEditedFile, null)
    assert.equal(rep.today.filesChanged, 1)
  })

  it('extracts apply_patch and str_replace_editor changes', () => {
    const patchRes = extractFileChanges('apply_patch', {}, {
      isError: false,
      value: {
        operations: [
          { status: 'completed', kind: 'update', path: 'x.ts', changes: [{ path: 'x.ts', before: 'old\n', after: 'new1\nnew2\n' }] },
        ],
      },
    })
    assert.deepEqual(patchRes, [{ path: 'x.ts', added: 2, deleted: 1 }])

    const viewRes = extractFileChanges('str_replace_editor', { command: 'view', path: 'x.ts' }, { isError: false, value: 'ok' })
    assert.deepEqual(viewRes, [])

    const repRes = extractFileChanges('str_replace_editor', { command: 'str_replace', path: 'x.ts', old_str: 'a\nb', new_str: 'a\nc\nd' }, { isError: false, value: 'ok' })
    assert.deepEqual(repRes, [{ path: 'x.ts', added: 2, deleted: 1 }])
  })
})
