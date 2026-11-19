/**
 * Deterministic title, rank grade, and mascot accessory rules for a report
 * period. Never random — identical stats always yield the exact same badge.
 * @module dsh-pixel-report/lib/rank
 */

/**
 * @typedef {{
 *   id: string,
 *   grade: 'S+' | 'S' | 'A' | 'B' | 'C' | 'ZZZ',
 *   accessory: 'sleep' | 'moon' | 'sun' | 'wrench' | 'coin' | 'visor' | 'crown' | 'bolt' | 'shield' | 'star',
 *   titleZh: string,
 *   titleEn: string,
 *   subZh: string,
 *   subEn: string,
 * }} RankBadge
 */

/**
 * Compute a deterministic RPG grade from real activity volume.
 * @param {any} s
 * @returns {'S+' | 'S' | 'A' | 'B' | 'C' | 'ZZZ'}
 */
export function computeGrade(s) {
  const actions = (s.requests || 0) + (s.toolCalls || 0)
  if (actions <= 0 && (s.turns || 0) <= 0) return 'ZZZ'
  const lines = (s.linesAdded || 0) + (s.linesDeleted || 0)
  const score =
    (s.turns || 0) * 6 +
    (s.toolCalls || 0) * 3 +
    (s.filesChanged || 0) * 10 +
    Math.min(lines, 2000) * 0.2 +
    Math.min((s.totalTokens || 0) / 10_000, 120)

  if (score >= 280) return 'S+'
  if (score >= 160) return 'S'
  if (score >= 80) return 'A'
  if (score >= 30) return 'B'
  return 'C'
}

/**
 * Evaluate a deterministic title and rank badge from a period summary.
 * @param {any} s
 * @returns {RankBadge}
 */
export function evaluateRank(s) {
  const requests = s.requests || 0
  const toolCalls = s.toolCalls || 0
  const turns = s.turns || 0
  const commands = s.commands || 0
  const filesChanged = s.filesChanged || 0
  const linesAdded = s.linesAdded || 0
  const linesDeleted = s.linesDeleted || 0
  const promptTokens = s.promptTokens || 0
  const cacheReadTokens = s.cacheReadTokens || 0
  const saved = s.saved || 0
  const longestTurns = s.longestSession?.turns || 0
  const hours = Array.isArray(s.hours) && s.hours.length === 24 ? s.hours : new Array(24).fill(0)
  const busiestHour = typeof s.busiestHour === 'number' ? s.busiestHour : -1

  const grade = computeGrade(s)

  if (requests === 0 && toolCalls === 0 && turns === 0) {
    return {
      id: 'idle',
      grade: 'ZZZ',
      accessory: 'sleep',
      titleZh: '像素鲸打盹中',
      titleEn: 'Idle Whale',
      subZh: '今天还没开工，开一个会话即可点亮战报',
      subEn: 'No activity recorded yet — start a session to light this up',
    }
  }

  const totalHourActs = hours.reduce((a, b) => a + b, 0)
  const nightActs = hours[22] + hours[23] + hours[0] + hours[1] + hours[2] + hours[3] + hours[4]
  const earlyActs = hours[5] + hours[6] + hours[7] + hours[8]
  const isNightHour = busiestHour >= 23 || (busiestHour >= 0 && busiestHour <= 4)
  const isEarlyHour = busiestHour >= 5 && busiestHour <= 8
  const cacheRate = promptTokens > 0 ? cacheReadTokens / promptTokens : 0

  // 1. Night Owl: strong late-night focus
  if (totalHourActs >= 3 && ((nightActs / totalHourActs) >= 0.4 || isNightHour)) {
    return {
      id: 'night-owl',
      grade,
      accessory: 'moon',
      titleZh: '夜猫子工程师',
      titleEn: 'Night Owl Engineer',
      subZh: '深夜才是主力输出时段，越晚越清醒',
      subEn: 'Peak firepower after dark while everyone else sleeps',
    }
  }

  // 2. Early Bird: dawn momentum
  if (totalHourActs >= 3 && ((earlyActs / totalHourActs) >= 0.45 || isEarlyHour)) {
    return {
      id: 'early-bird',
      grade,
      accessory: 'sun',
      titleZh: '破晓卷王',
      titleEn: 'Early Bird Coder',
      subZh: '太阳刚升起，代码已经在跑了',
      subEn: 'Shipping code before the morning coffee kicks in',
    }
  }

  // 3. Refactor Maniac: heavy deletions / large rewrites
  if (
    ((linesAdded + linesDeleted) >= 400 && linesDeleted >= 120) ||
    (linesDeleted >= 60 && linesDeleted >= linesAdded)
  ) {
    return {
      id: 'refactor-maniac',
      grade,
      accessory: 'wrench',
      titleZh: '重构狂魔',
      titleEn: 'Refactor Maniac',
      subZh: '大刀阔斧删改代码，专治历史包袱',
      subEn: 'Fearless rewrites and surgical deletions all day',
    }
  }

  // 4. Cache Whisperer: high cache efficiency + real savings
  if (
    (cacheRate >= 0.85 && saved >= 0.5) ||
    (cacheRate >= 0.90 && promptTokens >= 10_000)
  ) {
    return {
      id: 'cache-whisperer',
      grade,
      accessory: 'coin',
      titleZh: '省钱大师',
      titleEn: 'Cache Whisperer',
      subZh: '缓存命中率拉满，帮钱包守住每一分钱',
      subEn: 'Sky-high cache hits keeping the API bill razor thin',
    }
  }

  // 5. Terminal Warlord: command-heavy workflow
  if (commands >= 10 && commands / Math.max(1, toolCalls) >= 0.45) {
    return {
      id: 'terminal-warlord',
      grade,
      accessory: 'visor',
      titleZh: '命令行战神',
      titleEn: 'Terminal Warlord',
      subZh: '终端敲得冒火星，能用命令绝不手点',
      subEn: 'Shell commands flying nonstop across the terminal',
    }
  }

  // 6. Code Machine: high volume of new code or many files touched
  if (linesAdded >= 250 || filesChanged >= 8) {
    return {
      id: 'code-machine',
      grade,
      accessory: 'crown',
      titleZh: '高产代码机',
      titleEn: 'Code Machine',
      subZh: '文件连改带写，产出密度拉满',
      subEn: 'Cranking out edits and new files at full throttle',
    }
  }

  // 7. Marathon Runner: deep multi-turn session
  if (longestTurns >= 10 || turns >= 20) {
    return {
      id: 'marathon',
      grade,
      accessory: 'bolt',
      titleZh: '持久战专家',
      titleEn: 'Marathon Runner',
      subZh: '超长对话稳扎稳打，一步不乱',
      subEn: 'Locked in for a deep, multi-turn engineering session',
    }
  }

  // 8. Efficiency Ace: solid cache hit rate
  if (cacheRate >= 0.7 && requests >= 4) {
    return {
      id: 'efficiency-ace',
      grade,
      accessory: 'shield',
      titleZh: '节奏掌控者',
      titleEn: 'Efficiency Ace',
      subZh: '缓存稳健、步骤利落，人机配合丝滑',
      subEn: 'Steady cache hits and crisp, focused agent steps',
    }
  }

  // 9. Steady Builder: clean default for active sessions
  return {
    id: 'steady-builder',
    grade,
    accessory: 'star',
    titleZh: '稳健推进者',
    titleEn: 'Steady Builder',
    subZh: '日拱一卒，功不唐捐',
    subEn: 'Brick by brick, steady progress every turn',
  }
}
