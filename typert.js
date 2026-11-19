/**
 * Host-face Typert manifest for dsh-pixel-report: the two calls the sidebar
 * makes through `remote.pixelReport`. dsh's typert-loader picks this file up
 * from the package's `./typert` export; index.js registers it directly when
 * the plugin is loaded from a file path instead of by package name.
 * @module dsh-pixel-report/typert
 */

import { z } from 'zod'

const strictCodec = (name, schema) => ({
  mode: 'strict',
  typeSymbol: 'dsh-pixel-report#' + name,
  schema,
  create: () => schema,
})

const num = z.number()
const str = z.string()

const periodSchema = z.object({
  range: str,
  startDate: str,
  endDate: str,
  requests: num,
  promptTokens: num,
  cacheReadTokens: num,
  outputTokens: num,
  totalTokens: num,
  cacheHitRate: num,
  cost: num,
  saved: num,
  toolCalls: num,
  commands: num,
  turns: num,
  sessions: num,
  filesChanged: num,
  linesAdded: num,
  linesDeleted: num,
  hours: z.array(num),
  busiestHour: num,
  rank: z.object({
    id: str,
    grade: str,
    accessory: str,
    titleZh: str,
    titleEn: str,
    subZh: str,
    subEn: str,
  }).passthrough(),
}).passthrough()

const reportSchema = z.object({
  version: num,
  revision: num,
  generatedAt: num,
  since: num,
  hideNames: z.boolean(),
  streakDays: num,
  prices: z.object({
    checked: str,
    peakNow: z.boolean(),
    peakPricing: z.boolean(),
    custom: z.boolean(),
    rows: z.array(z.object({ label: str, hit: num, miss: num, output: num })),
  }),
  today: periodSchema,
  week: periodSchema,
  weekDays: z.array(z.object({
    date: str,
    requests: num,
    toolCalls: num,
    turns: num,
    filesChanged: num,
    linesAdded: num,
    linesDeleted: num,
    cost: num,
    saved: num,
    actions: num,
  }).passthrough()),
}).passthrough()

const report$codec = strictCodec('PixelReport', reportSchema)

const call = (method, result) => ({
  id: 'dsh-pixel-report#pixelReport/' + method,
  service: 'pixelReport',
  namespace: 'pixelReport',
  method,
  invocation: { kind: 'direct' },
  parameters: [],
  result,
})

export const TYPERT = {
  package: 'dsh-pixel-report',
  face: 'host',
  schemas: [],
  invocations: [call('getReport', report$codec), call('reset', report$codec)],
  model: { services: [], events: [], objects: [] },
}

export default TYPERT
