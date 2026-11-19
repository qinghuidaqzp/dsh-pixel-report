/**
 * Prices for turning token counts into money. Pure; no harness imports.
 *
 * Defaults are DeepSeek's official CNY list prices per million tokens as
 * published at api-docs.deepseek.com/zh-cn/quick_start/pricing on 2026-11-19,
 * off-peak (空闲时段). Peak prices are double. Users can override every number
 * in the plugin config, because DeepSeek changes prices from time to time.
 * @module dsh-pixel-report/lib/pricing
 */

export const PRICES_CHECKED = '2026-11-19'

/** Off-peak CNY per 1M tokens. `match` is tested against the model id. */
export const DEFAULT_PRICES = Object.freeze([
  Object.freeze({ match: 'pro|reasoner', label: 'deepseek-v4-pro', hit: 0.15, miss: 4.5, output: 13.5 }),
  Object.freeze({ match: 'flash|chat|deepseek', label: 'deepseek-flash', hit: 0.02, miss: 1, output: 4 }),
])

/**
 * @typedef {{ match: string, label?: string, hit: number, miss: number, output: number }} PriceRow
 * @typedef {{ hit: number, miss: number, output: number, label: string, known: boolean, peak: boolean }} Price
 */

/**
 * Whether a moment falls in DeepSeek's peak window: Beijing time, Monday to
 * Friday, 9:00-12:00 and 14:00-18:00. Statutory holidays are not modelled, so
 * a weekday holiday is priced as a working day (slightly high, never low).
 * @param {number} atMs
 * @returns {boolean}
 */
export function isPeak(atMs) {
  const bj = new Date(atMs + 8 * 3600 * 1000)
  const day = bj.getUTCDay()
  if (day === 0 || day === 6) return false
  const minutes = bj.getUTCHours() * 60 + bj.getUTCMinutes()
  return (minutes >= 540 && minutes < 720) || (minutes >= 840 && minutes < 1080)
}

/**
 * Price for one model at one moment.
 * @param {string} model
 * @param {number} atMs
 * @param {{ rows?: readonly PriceRow[], peakPricing?: boolean }} [options]
 * @returns {Price}
 */
export function priceFor(model, atMs, options = {}) {
  const rows = options.rows?.length ? options.rows : DEFAULT_PRICES
  const id = String(model ?? '').toLowerCase()
  let row = rows.find(r => safeTest(r.match, id))
  const known = Boolean(row)
  row ??= rows[rows.length - 1]
  const peak = options.peakPricing !== false && isPeak(atMs)
  const k = peak ? 2 : 1
  return { hit: row.hit * k, miss: row.miss * k, output: row.output * k, label: row.label ?? row.match, known, peak }
}

function safeTest(source, text) {
  try { return new RegExp(source, 'i').test(text) } catch { return false }
}

/**
 * Money for a token count at a per-million price.
 * @param {number} tokens
 * @param {number} perMillion
 */
export function cost(tokens, perMillion) {
  return (Math.max(0, tokens) / 1e6) * perMillion
}
