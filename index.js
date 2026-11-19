/**
 * dsh-pixel-report, Host half.
 *
 * Passively observes three hooks without altering any behavior:
 *   - `llm/stream`: token usage, prompt cache hits, cost and cache savings;
 *   - `tools/result`: tool calls, shell commands, files written/edited and line diffs;
 *   - `session/event`: turns, active durations, and `workspace/changes` summaries
 *     (when `@deepseek-ai/dsh-workspace-changes` is present) to capture git/shell diffs
 *     without double-counting.
 * Exposes daily and 7-day summaries to the Web sidebar via the `pixelReport` RPC service.
 * @module dsh-pixel-report
 */

import Schema from '@deepseek-ai/schemastery'
import { AsyncLocalStorage } from 'node:async_hooks'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { StatsTracker } from './lib/stats.js'
import { TYPERT } from './typert.js'

export const name = 'pixel-report'

const PriceRow = Schema.object({
  match: Schema.string().required().description('正则，匹配模型 id，例如 `flash`'),
  label: Schema.string().description('显示名'),
  hit: Schema.number().required().description('缓存命中的输入，元 / 百万 token（空闲时段）'),
  miss: Schema.number().required().description('缓存未命中的输入，元 / 百万 token（空闲时段）'),
  output: Schema.number().required().description('输出，元 / 百万 token（空闲时段）'),
})

export const Config = Schema.object({
  stateFile: Schema.string().description('统计数据保存到的文件。留空则只保存在内存里，重启后清零。'),
  hideNames: Schema.boolean().default(false).description('隐私模式：隐藏战报卡片上的最常编辑文件名和工作区名称。'),
  peakPricing: Schema.boolean().default(true).description('按 DeepSeek 峰谷价计算：工作日 9-12 点、14-18 点（北京时间）价格翻倍。'),
  prices: Schema.array(PriceRow).default([]).description('自定义价格（按顺序匹配模型 id）。留空使用内置的 DeepSeek 官方价格。'),
})

/** Marks a stream already being observed, so a routing plugin's inner call is not counted twice. */
const observing = new AsyncLocalStorage()

export function apply(ctx, config) {
  const tracker = new StatsTracker({
    prices: config.prices,
    peakPricing: config.peakPricing,
    hideNames: config.hideNames,
    workspace: process.cwd(),
  })
  const stateFile = config.stateFile || ''

  if (stateFile) {
    try {
      tracker.load(JSON.parse(readFileSync(stateFile, 'utf8')))
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        console.warn('[dsh-pixel-report] ' + `cannot read ${stateFile}: ${error.message}`)
      }
    }
  }

  let saveTimer = null
  const saveNow = () => {
    saveTimer = null
    if (!stateFile) return
    try {
      mkdirSync(dirname(stateFile), { recursive: true })
      const tmp = `${stateFile}.${process.pid}.tmp`
      writeFileSync(tmp, JSON.stringify(tracker))
      renameSync(tmp, stateFile)
    } catch (error) {
      console.warn('[dsh-pixel-report] ' + `cannot save ${stateFile}: ${error.message}`)
    }
  }
  const scheduleSave = () => {
    if (stateFile && !saveTimer) saveTimer = setTimeout(saveNow, 2000)
  }
  ctx.effect(() => () => {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveNow()
    }
  })

  // 1. Observe LLM usage chunks
  ctx.on('llm/stream', (options, next) => {
    const downstream = next()
    if (observing.getStore()) return downstream
    return (async function* pixelReportStream() {
      let usage = null
      let iterator
      let completed = false
      try {
        iterator = downstream[Symbol.asyncIterator]()
        for (;;) {
          const step = await observing.run(true, () => iterator.next())
          if (step.done) break
          const chunk = step.value
          if (chunk?.type === 'usage' && chunk.usage) usage = chunk.usage
          yield chunk
        }
        completed = true
      } finally {
        if (!completed) { try { await iterator?.return?.() } catch {} }
        if (usage) {
          try {
            if (tracker.observeUsage({ options, usage })) scheduleSave()
          } catch (error) {
            console.warn('[dsh-pixel-report] ' + `usage record failed: ${error?.message}`)
          }
        }
      }
    })()
  }, { global: true })

  // 2. Observe completed tool calls
  ctx.on('tools/result', (exec, result) => {
    try {
      const sessionId = exec?.agent?.id ?? ''
      if (tracker.observeToolResult({ name: exec?.name, args: exec?.arguments, result, sessionId })) {
        scheduleSave()
      }
    } catch (error) {
      console.warn('[dsh-pixel-report] ' + `tool record failed: ${error?.message}`)
    }
  }, { global: true })

  // 3. Observe session turns & workspace/changes summaries
  ctx.on('session/event', (session, event) => {
    try {
      const sessionId = session?.id ?? ''
      const cwd = session?.header?.cwd ?? ''
      if (tracker.observeSessionEvent({ sessionId, cwd, event })) scheduleSave()
      if (event?.type === 'workspace/changes') {
        const wc = ctx.get?.('workspaceChanges') ?? ctx.workspaceChanges
        const summary = wc?.summary?.(sessionId, event.seq)
        if (summary && tracker.observeWorkspaceChanges({ sessionId, summary })) scheduleSave()
      }
    } catch (error) {
      console.warn('[dsh-pixel-report] ' + `session event failed: ${error?.message}`)
    }
  }, { global: true })

  const service = {
    getReport: () => tracker.report(),
    reset: () => {
      tracker.reset()
      saveNow()
      return tracker.report()
    },
  }
  Object.defineProperty(service, 'typertRemote', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: { service, serviceKey: 'pixelReport', namespace: 'pixelReport' },
  })
  ctx.provide('pixelReport', service)

  // When loaded by package name, dsh's typert-loader registers ./typert itself.
  // Loaded from a file path (development), it does not, so register here.
  ctx.inject(['typert'], scope => {
    const registry = scope.typert
    if (registry.getPackage?.('dsh-pixel-report', 'host')) return
    const entryName = ctx.fiber?.entry?.options?.name
    if (!entryName || entryName !== 'dsh-pixel-report') registry.register(TYPERT)
  })

  return tracker
}
