/**
 * Pure daily & weekly activity statistics tracker for dsh-pixel-report.
 * No harness imports; deterministic given a clock and timezone offset.
 * @module dsh-pixel-report/lib/stats
 */

import { createHash } from 'node:crypto'
import { basename } from 'node:path'
import { diffLines, countLines } from './diff.js'
import { priceFor, cost, isPeak, DEFAULT_PRICES, PRICES_CHECKED } from './pricing.js'
import { evaluateRank } from './rank.js'

const KEEP_DAYS = 90
const MAX_TURN_MS = 60 * 60 * 1000 // Cap one turn at 60 min in case of sleep/idle
const SCHEMA_VERSION = 1

const SHELL_TOOLS = new Set([
  'bash', 'pwsh', 'powershell', 'terminal', 'shell', 'execute_command', 'run_command',
])

const FILE_TOOLS = new Set([
  'write', 'edit', 'apply_patch', 'str_replace_editor', 'create_file', 'write_file', 'edit_file',
])

const PRE_DISPATCH_ERRORS = new Set([
  'ABORTED_BEFORE_DISPATCH', 'PERMISSION_DENIED', 'UNKNOWN_TOOL', 'POLICY_DENIED', 'CANCELLED',
])

/**
 * Resolve UTC offset in minutes (e.g. +480 for Beijing UTC+8).
 * @param {number} atMs
 * @param {number | null | undefined} tzOffsetMin
 */
function resolveOffsetMin(atMs, tzOffsetMin) {
  if (typeof tzOffsetMin === 'number' && Number.isFinite(tzOffsetMin)) return tzOffsetMin
  return -new Date(atMs).getTimezoneOffset()
}

/**
 * Calendar date string `YYYY-MM-DD` in the target timezone.
 * @param {number} atMs
 * @param {number | null} [tzOffsetMin]
 */
export function dayKey(atMs, tzOffsetMin = null) {
  const shifted = new Date(atMs + resolveOffsetMin(atMs, tzOffsetMin) * 60_000)
  return shifted.toISOString().slice(0, 10)
}

/**
 * Hour of day `0..23` in the target timezone.
 * @param {number} atMs
 * @param {number | null} [tzOffsetMin]
 */
export function hourOf(atMs, tzOffsetMin = null) {
  const shifted = new Date(atMs + resolveOffsetMin(atMs, tzOffsetMin) * 60_000)
  return shifted.getUTCHours()
}

/**
 * Privacy-safe file key: short hash of full path + basename only.
 * Full directory paths are never persisted on disk or sent to the client.
 * @param {string} rawPath
 */
export function fileIdentity(rawPath) {
  const cleaned = String(rawPath || '').replace(/\\/g, '/').trim()
  if (!cleaned) return null
  const name = basename(cleaned) || cleaned
  const hash = createHash('sha256').update(cleaned).digest('hex').slice(0, 8)
  return { key: `${hash}:${name}`, name }
}

/**
 * Extract basename of a workspace directory path.
 * @param {string} cwd
 */
export function workspaceLabel(cwd) {
  const cleaned = String(cwd || '').replace(/\\/g, '/').replace(/\/+$/, '').trim()
  if (!cleaned) return ''
  return basename(cleaned) || ''
}

function emptyDay(date) {
  return {
    date,
    requests: 0,
    promptTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 0,
    cost: 0,
    saved: 0,
    toolCalls: 0,
    toolErrors: 0,
    commands: 0,
    turns: 0,
    activeMs: 0,
    linesAdded: 0,
    linesDeleted: 0,
    hours: new Array(24).fill(0),
    tools: {},
    models: {},
    files: {},     // key -> { name, edits, added, deleted }
    sessions: {},  // shortSessionKey -> { turns, requests, activeMs, firstAt, lastAt }
    workspace: '',
  }
}

function normalizeDay(date, raw) {
  const d = emptyDay(date)
  if (!raw || typeof raw !== 'object') return d
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0)
  d.requests = num(raw.requests)
  d.promptTokens = num(raw.promptTokens)
  d.cacheReadTokens = num(raw.cacheReadTokens)
  d.cacheWriteTokens = num(raw.cacheWriteTokens)
  d.outputTokens = num(raw.outputTokens)
  d.cost = num(raw.cost)
  d.saved = num(raw.saved)
  d.toolCalls = num(raw.toolCalls)
  d.toolErrors = num(raw.toolErrors)
  d.commands = num(raw.commands)
  d.turns = num(raw.turns)
  d.activeMs = num(raw.activeMs)
  d.linesAdded = num(raw.linesAdded)
  d.linesDeleted = num(raw.linesDeleted)
  if (Array.isArray(raw.hours) && raw.hours.length === 24) {
    d.hours = raw.hours.map(num)
  }
  if (raw.tools && typeof raw.tools === 'object') {
    for (const [k, v] of Object.entries(raw.tools)) if (num(v) > 0) d.tools[k] = num(v)
  }
  if (raw.models && typeof raw.models === 'object') {
    for (const [k, v] of Object.entries(raw.models)) if (num(v) > 0) d.models[k] = num(v)
  }
  if (raw.files && typeof raw.files === 'object') {
    for (const [k, v] of Object.entries(raw.files)) {
      if (v && typeof v === 'object' && typeof v.name === 'string') {
        d.files[k] = {
          name: basename(v.name),
          edits: num(v.edits),
          added: num(v.added),
          deleted: num(v.deleted),
        }
      }
    }
  }
  if (raw.sessions && typeof raw.sessions === 'object') {
    for (const [k, v] of Object.entries(raw.sessions)) {
      if (v && typeof v === 'object') {
        d.sessions[k] = {
          turns: num(v.turns),
          requests: num(v.requests),
          activeMs: num(v.activeMs),
          firstAt: num(v.firstAt),
          lastAt: num(v.lastAt),
        }
      }
    }
  }
  if (typeof raw.workspace === 'string') d.workspace = workspaceLabel(raw.workspace)
  return d
}

function sessionKey(sessionId) {
  const s = String(sessionId || '').trim()
  if (!s) return ''
  return createHash('sha256').update(s).digest('hex').slice(0, 12)
}

function isPreDispatchFailure(result) {
  if (!result?.isError) return false
  const code = String(result?.error?.info?.code ?? '')
  return PRE_DISPATCH_ERRORS.has(code)
}

/**
 * Extract file changes from a completed tool result.
 * @param {string} name
 * @param {any} args
 * @param {any} result
 * @returns {{ path: string, added: number, deleted: number }[]}
 */
export function extractFileChanges(name, args, result) {
  if (!result || result.isError) return []
  const val = result.value
  const out = []

  if (name === 'write' || name === 'write_file' || name === 'create_file') {
    const p = val?.path || args?.file_path || args?.path
    if (!p) return []
    if (val && typeof val.after === 'string') {
      const d = val.before == null ? { added: countLines(val.after), deleted: 0 } : diffLines(val.before, val.after)
      out.push({ path: String(p), ...d })
    } else if (typeof args?.content === 'string') {
      out.push({ path: String(p), added: countLines(args.content), deleted: 0 })
    } else {
      out.push({ path: String(p), added: 0, deleted: 0 })
    }
    return out
  }

  if (name === 'edit' || name === 'edit_file') {
    const p = val?.path || args?.file_path || args?.path
    if (!p) return []
    if (val && typeof val.before === 'string' && typeof val.after === 'string') {
      out.push({ path: String(p), ...diffLines(val.before, val.after) })
    } else if (typeof args?.old_string === 'string' && typeof args?.new_string === 'string') {
      out.push({ path: String(p), ...diffLines(args.old_string, args.new_string) })
    } else {
      out.push({ path: String(p), added: 0, deleted: 0 })
    }
    return out
  }

  if (name === 'apply_patch') {
    if (Array.isArray(val?.operations)) {
      for (const op of val.operations) {
        if (op?.status !== 'completed') continue
        if (Array.isArray(op.changes) && op.changes.length > 0) {
          for (const ch of op.changes) {
            if (!ch?.path) continue
            out.push({ path: String(ch.path), ...diffLines(ch.before ?? '', ch.after ?? '') })
          }
        } else if (op.destination || op.path) {
          out.push({ path: String(op.destination || op.path), added: 0, deleted: 0 })
        }
      }
      return out
    }
    if (Array.isArray(val?.affectedPaths)) {
      for (const p of val.affectedPaths) out.push({ path: String(p), added: 0, deleted: 0 })
    }
    return out
  }

  if (name === 'str_replace_editor') {
    const cmd = args?.command
    if (!cmd || cmd === 'view') return []
    const p = args?.path
    if (!p) return []
    if (cmd === 'create') {
      out.push({ path: String(p), added: countLines(args.file_text), deleted: 0 })
    } else if (cmd === 'insert') {
      out.push({ path: String(p), added: countLines(args.new_str), deleted: 0 })
    } else if (cmd === 'str_replace') {
      out.push({ path: String(p), ...diffLines(args.old_str ?? '', args.new_str ?? '') })
    }
    return out
  }

  return out
}

export class StatsTracker {
  /**
   * @param {{
   *   now?: () => number,
   *   tzOffsetMin?: number | null,
   *   prices?: import('./pricing.js').PriceRow[],
   *   peakPricing?: boolean,
   *   hideNames?: boolean,
   *   workspace?: string,
   * }} [options]
   */
  constructor(options = {}) {
    this.now = options.now ?? Date.now
    this.tzOffsetMin = options.tzOffsetMin ?? null
    this.prices = options.prices
    this.peakPricing = options.peakPricing !== false
    this.hideNames = Boolean(options.hideNames)
    this.defaultWorkspace = workspaceLabel(options.workspace ?? '')
    /** @type {Record<string, ReturnType<typeof emptyDay>>} */
    this.days = {}
    this.since = this.now()
    this.revision = 0
    /** Ephemeral per-session open turn state for duration & workspace/changes reconciliation */
    this._openTurns = new Map() // sessionId -> { turn, startedAt, dayDate, files: Map<fileKey, { added, deleted }> }
    this._lastTurn = new Map()  // `${sessionId}:${turn}` -> { dayDate, files: Map<fileKey, { added, deleted }> }
  }

  #day(atMs) {
    const key = dayKey(atMs, this.tzOffsetMin)
    let d = this.days[key]
    if (!d) {
      d = emptyDay(key)
      if (this.defaultWorkspace) d.workspace = this.defaultWorkspace
      this.days[key] = d
      this.#prune(atMs)
    }
    return d
  }

  #touchSession(day, sessionId, atMs) {
    const sk = sessionKey(sessionId)
    if (!sk) return null
    let s = day.sessions[sk]
    if (!s) {
      s = { turns: 0, requests: 0, activeMs: 0, firstAt: atMs, lastAt: atMs }
      day.sessions[sk] = s
    } else {
      if (atMs < s.firstAt || s.firstAt === 0) s.firstAt = atMs
      if (atMs > s.lastAt) s.lastAt = atMs
    }
    return s
  }

  #prune(atMs) {
    const keys = Object.keys(this.days).sort()
    if (keys.length <= KEEP_DAYS) return
    const cutoff = dayKey(atMs - (KEEP_DAYS - 1) * 86_400_000, this.tzOffsetMin)
    for (const k of keys) {
      if (k < cutoff) delete this.days[k]
    }
  }

  /**
   * Record one completed LLM stream usage sample.
   * @param {{ options?: any, usage: any, at?: number }} input
   */
  observeUsage({ options, usage, at = this.now() }) {
    if (!usage || typeof usage !== 'object') return false
    const input = Math.max(0, Number(usage.inputTokens) || 0)
    const cacheRead = Math.max(0, Number(usage.cacheReadTokens) || 0)
    const cacheWrite = Math.max(0, Number(usage.cacheWriteTokens) || 0)
    const output = Math.max(0, Number(usage.outputTokens) || 0)
    const prompt = input + cacheRead + cacheWrite
    if (prompt <= 0 && output <= 0) return false

    const model = String(options?.model ?? 'unknown')
    const price = priceFor(model, at, { rows: this.prices, peakPricing: this.peakPricing })
    const spent = cost(input + cacheWrite, price.miss) + cost(cacheRead, price.hit) + cost(output, price.output)
    const saved = cost(cacheRead, Math.max(0, price.miss - price.hit))

    const d = this.#day(at)
    d.requests++
    d.promptTokens += prompt
    d.cacheReadTokens += cacheRead
    d.cacheWriteTokens += cacheWrite
    d.outputTokens += output
    d.cost += spent
    d.saved += saved
    d.hours[hourOf(at, this.tzOffsetMin)]++
    d.models[model] = (d.models[model] ?? 0) + 1

    const s = this.#touchSession(d, options?.sessionId, at)
    if (s) s.requests++

    this.revision++
    return true
  }

  /**
   * Record one completed tool execution from `tools/result`.
   * @param {{ name: string, args?: any, result: any, sessionId?: string, at?: number }} input
   */
  observeToolResult({ name, args, result, sessionId, at = this.now() }) {
    const toolName = String(name || '').trim()
    if (!toolName || toolName === 'run_code') return false
    if (isPreDispatchFailure(result)) return false

    const d = this.#day(at)
    d.toolCalls++
    if (result?.isError) d.toolErrors++
    d.tools[toolName] = (d.tools[toolName] ?? 0) + 1
    d.hours[hourOf(at, this.tzOffsetMin)]++

    if (SHELL_TOOLS.has(toolName)) {
      d.commands++
    }

    if (FILE_TOOLS.has(toolName) && !result?.isError) {
      const changes = extractFileChanges(toolName, args, result)
      const openTurn = sessionId ? this._openTurns.get(sessionId) : null
      for (const ch of changes) {
        const ident = fileIdentity(ch.path)
        if (!ident) continue
        const rec = (d.files[ident.key] ??= { name: ident.name, edits: 0, added: 0, deleted: 0 })
        rec.edits++
        rec.added += ch.added
        rec.deleted += ch.deleted
        d.linesAdded += ch.added
        d.linesDeleted += ch.deleted

        if (openTurn && openTurn.dayDate === d.date) {
          const prev = openTurn.files.get(ident.key) ?? { added: 0, deleted: 0 }
          prev.added += ch.added
          prev.deleted += ch.deleted
          openTurn.files.set(ident.key, prev)
        }
      }
    }

    this.#touchSession(d, sessionId, at)
    this.revision++
    return true
  }

  /**
   * Record session lifecycle events (`turn/start`, `turn/end`, workspace label).
   * @param {{ sessionId: string, cwd?: string, event: any, at?: number }} input
   */
  observeSessionEvent({ sessionId, cwd, event, at = this.now() }) {
    if (!event || typeof event !== 'object') return false
    const evTime = typeof event.time === 'number' && Number.isFinite(event.time) ? event.time : at
    const d = this.#day(evTime)
    if (cwd) {
      const label = workspaceLabel(cwd)
      if (label) d.workspace = label
    }

    if (event.type === 'turn/start') {
      const turn = Number(event.data?.turn ?? 0)
      this._openTurns.set(sessionId, { turn, startedAt: evTime, dayDate: d.date, files: new Map() })
      this.#touchSession(d, sessionId, evTime)
      return false
    }

    if (event.type === 'turn/end') {
      const turn = Number(event.data?.turn ?? 0)
      const open = this._openTurns.get(sessionId)
      const elapsed = open ? Math.min(MAX_TURN_MS, Math.max(0, evTime - open.startedAt)) : 0
      if (open) {
        this._lastTurn.set(`${sessionId}:${turn}`, { dayDate: open.dayDate, files: open.files })
        if (this._lastTurn.size > 64) this._lastTurn.delete(this._lastTurn.keys().next().value)
        this._openTurns.delete(sessionId)
      }
      d.turns++
      d.activeMs += elapsed
      const s = this.#touchSession(d, sessionId, evTime)
      if (s) {
        s.turns++
        s.activeMs += elapsed
      }
      this.revision++
      return true
    }

    return false
  }

  /**
   * Reconcile per-turn `workspace/changes` summary (captures git diffs from
   * shell commands and refines net line counts without double-counting).
   * @param {{ sessionId: string, summary: any, at?: number }} input
   */
  observeWorkspaceChanges({ sessionId, summary, at = this.now() }) {
    if (!summary || !Array.isArray(summary.files)) return false
    const turnKey = `${sessionId}:${Number(summary.turn ?? 0)}`
    const turnRec = this._lastTurn.get(turnKey) ?? this._openTurns.get(sessionId)
    const d = turnRec?.dayDate && this.days[turnRec.dayDate] ? this.days[turnRec.dayDate] : this.#day(at)
    if (summary.cwd) {
      const label = workspaceLabel(summary.cwd)
      if (label) d.workspace = label
    }

    let changed = false
    for (const f of summary.files) {
      const rawPath = f.path || f.display
      if (!rawPath) continue
      const ident = fileIdentity(rawPath)
      if (!ident) continue
      const added = Math.max(0, Number(f.added) || 0)
      const deleted = Math.max(0, Number(f.deleted) || 0)

      // Check if we already tracked this file (by exact key or same basename within this turn)
      let matchedKey = null
      if (turnRec?.files) {
        if (turnRec.files.has(ident.key)) {
          matchedKey = ident.key
        } else {
          for (const k of turnRec.files.keys()) {
            if (k.endsWith(':' + ident.name)) { matchedKey = k; break }
          }
        }
      }

      if (matchedKey) {
        const prev = turnRec.files.get(matchedKey)
        const deltaAdd = added - prev.added
        const deltaDel = deleted - prev.deleted
        if (deltaAdd !== 0 || deltaDel !== 0) {
          d.linesAdded = Math.max(0, d.linesAdded + deltaAdd)
          d.linesDeleted = Math.max(0, d.linesDeleted + deltaDel)
          const rec = d.files[matchedKey]
          if (rec) {
            rec.added = Math.max(0, rec.added + deltaAdd)
            rec.deleted = Math.max(0, rec.deleted + deltaDel)
          }
          prev.added = added
          prev.deleted = deleted
          changed = true
        }
      } else {
        // File modified outside file tools (e.g. via bash/formatter/git)
        const rec = (d.files[ident.key] ??= { name: ident.name, edits: 0, added: 0, deleted: 0 })
        rec.edits++
        rec.added += added
        rec.deleted += deleted
        d.linesAdded += added
        d.linesDeleted += deleted
        if (turnRec?.files) turnRec.files.set(ident.key, { added, deleted })
        changed = true
      }
    }

    if (changed) this.revision++
    return changed
  }

  /** Compute consecutive active day streak ending today (or yesterday if today is quiet). */
  streakDays(atMs = this.now()) {
    const isActive = (d) => Boolean(d && (d.requests > 0 || d.toolCalls > 0 || d.turns > 0))
    const todayStr = dayKey(atMs, this.tzOffsetMin)
    let offset = isActive(this.days[todayStr]) ? 0 : 1
    let streak = 0
    for (let i = offset; i < KEEP_DAYS; i++) {
      const k = dayKey(atMs - i * 86_400_000, this.tzOffsetMin)
      if (!isActive(this.days[k])) break
      streak++
    }
    return streak
  }

  /** Aggregate one or more day buckets into a clean report summary. */
  #summarize(dayList, label, startDate, endDate, hideNames) {
    const hours = new Array(24).fill(0)
    const tools = {}
    const models = {}
    const files = {}
    const sessions = {}
    let requests = 0, promptTokens = 0, cacheReadTokens = 0, cacheWriteTokens = 0, outputTokens = 0
    let costSum = 0, savedSum = 0, toolCalls = 0, toolErrors = 0, commands = 0, turns = 0, activeMs = 0
    let linesAdded = 0, linesDeleted = 0
    let workspace = ''

    for (const d of dayList) {
      if (!d) continue
      requests += d.requests
      promptTokens += d.promptTokens
      cacheReadTokens += d.cacheReadTokens
      cacheWriteTokens += d.cacheWriteTokens
      outputTokens += d.outputTokens
      costSum += d.cost
      savedSum += d.saved
      toolCalls += d.toolCalls
      toolErrors += d.toolErrors
      commands += d.commands
      turns += d.turns
      activeMs += d.activeMs
      linesAdded += d.linesAdded
      linesDeleted += d.linesDeleted
      if (d.workspace) workspace = d.workspace
      for (let h = 0; h < 24; h++) hours[h] += d.hours[h] || 0
      for (const [k, v] of Object.entries(d.tools)) tools[k] = (tools[k] ?? 0) + v
      for (const [k, v] of Object.entries(d.models)) models[k] = (models[k] ?? 0) + v
      for (const [k, f] of Object.entries(d.files)) {
        const cur = (files[k] ??= { name: f.name, edits: 0, added: 0, deleted: 0 })
        cur.edits += f.edits
        cur.added += f.added
        cur.deleted += f.deleted
      }
      for (const [k, s] of Object.entries(d.sessions)) {
        const cur = (sessions[k] ??= { turns: 0, requests: 0, activeMs: 0, firstAt: s.firstAt, lastAt: s.lastAt })
        cur.turns += s.turns
        cur.requests += s.requests
        cur.activeMs += s.activeMs
        if (s.firstAt && (!cur.firstAt || s.firstAt < cur.firstAt)) cur.firstAt = s.firstAt
        if (s.lastAt > cur.lastAt) cur.lastAt = s.lastAt
      }
    }

    const fileList = Object.values(files)
    fileList.sort((a, b) => (b.edits - a.edits) || ((b.added + b.deleted) - (a.added + a.deleted)) || a.name.localeCompare(b.name))
    const topFile = fileList[0] ?? null

    const toolEntries = Object.entries(tools).sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
    const topTool = toolEntries[0] ? { name: toolEntries[0][0], count: toolEntries[0][1] } : null

    const modelEntries = Object.entries(models).sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
    const topModel = modelEntries[0]?.[0] ?? ''

    let busiestHour = -1
    let busiestHourCount = 0
    for (let h = 0; h < 24; h++) {
      if (hours[h] > busiestHourCount) {
        busiestHourCount = hours[h]
        busiestHour = h
      }
    }

    const sessionList = Object.values(sessions)
    let longestSession = null
    for (const s of sessionList) {
      const spanMs = s.activeMs > 0 ? s.activeMs : Math.max(0, s.lastAt - s.firstAt)
      if (
        !longestSession ||
        s.turns > longestSession.turns ||
        (s.turns === longestSession.turns && spanMs > longestSession.durationMs)
      ) {
        longestSession = { turns: s.turns || (s.requests > 0 ? 1 : 0), requests: s.requests, durationMs: spanMs }
      }
    }

    const totalTokens = promptTokens + outputTokens
    const cacheHitRate = promptTokens > 0 ? cacheReadTokens / promptTokens : 0

    const summary = {
      range: label,
      startDate,
      endDate,
      workspace: hideNames ? '' : (workspace || this.defaultWorkspace || ''),
      requests,
      promptTokens,
      cacheReadTokens,
      cacheWriteTokens,
      outputTokens,
      totalTokens,
      cacheHitRate,
      cost: costSum,
      saved: savedSum,
      toolCalls,
      toolErrors,
      commands,
      turns,
      activeMs,
      sessions: sessionList.length,
      filesChanged: fileList.length,
      linesAdded,
      linesDeleted,
      mostEditedFile: !hideNames && topFile ? { name: topFile.name, edits: topFile.edits, added: topFile.added, deleted: topFile.deleted } : null,
      topTool,
      topModel,
      hours,
      busiestHour,
      busiestHourCount,
      longestSession,
    }
    summary.rank = evaluateRank(summary)
    return summary
  }

  /** Build the complete RPC report payload. */
  report(atMs = this.now()) {
    const todayDate = dayKey(atMs, this.tzOffsetMin)
    const todayDay = this.days[todayDate] ?? emptyDay(todayDate)
    const weekDates = []
    const weekDaysList = []
    for (let i = 6; i >= 0; i--) {
      const k = dayKey(atMs - i * 86_400_000, this.tzOffsetMin)
      weekDates.push(k)
      weekDaysList.push(this.days[k] ?? emptyDay(k))
    }

    const today = this.#summarize([todayDay], 'today', todayDate, todayDate, this.hideNames)
    const week = this.#summarize(weekDaysList, 'week', weekDates[0], weekDates[6], this.hideNames)
    const weekDays = weekDaysList.map(d => ({
      date: d.date,
      requests: d.requests,
      toolCalls: d.toolCalls,
      turns: d.turns,
      filesChanged: Object.keys(d.files).length,
      linesAdded: d.linesAdded,
      linesDeleted: d.linesDeleted,
      cost: d.cost,
      saved: d.saved,
      actions: d.requests + d.toolCalls,
    }))

    const rows = (this.prices?.length ? this.prices : DEFAULT_PRICES).map(r => ({
      label: r.label ?? r.match, hit: r.hit, miss: r.miss, output: r.output,
    }))

    return {
      version: SCHEMA_VERSION,
      revision: this.revision,
      generatedAt: atMs,
      since: this.since,
      hideNames: this.hideNames,
      streakDays: this.streakDays(atMs),
      prices: {
        checked: PRICES_CHECKED,
        peakNow: isPeak(atMs),
        peakPricing: this.peakPricing,
        custom: Boolean(this.prices?.length),
        rows,
      },
      today,
      week,
      weekDays,
    }
  }

  reset() {
    this.days = {}
    this._openTurns.clear()
    this._lastTurn.clear()
    this.since = this.now()
    this.revision++
  }

  toJSON() {
    return {
      version: SCHEMA_VERSION,
      since: this.since,
      days: this.days,
    }
  }

  load(data) {
    if (!data || typeof data !== 'object') return
    if (typeof data.since === 'number' && Number.isFinite(data.since)) this.since = data.since
    this.days = {}
    if (data.days && typeof data.days === 'object') {
      for (const [date, raw] of Object.entries(data.days)) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          this.days[date] = normalizeDay(date, raw)
        }
      }
    }
    this.#prune(this.now())
  }
}
