/**
 * Fast, pure line-diff utilities for counting lines added and deleted
 * when file-editing tools report `before` and `after` text.
 * @module dsh-pixel-report/lib/diff
 */

/**
 * Split text into logical lines (a single trailing newline does not create an
 * extra empty line).
 * @param {string | null | undefined} text
 * @returns {string[]}
 */
export function splitLines(text) {
  if (typeof text !== 'string' || text.length === 0) return []
  const normalized = text.replace(/\r\n/g, '\n')
  const trimmed = normalized.endsWith('\n') ? normalized.slice(0, -1) : normalized
  if (trimmed.length === 0) return ['']
  return trimmed.split('\n')
}

/**
 * Count logical lines in a text string.
 * @param {string | null | undefined} text
 * @returns {number}
 */
export function countLines(text) {
  return splitLines(text).length
}

/**
 * Compute `{ added, deleted }` line counts between `before` and `after`.
 * Uses prefix/suffix trimming + exact rolling-array LCS when small, and falls
 * back to multiset line overlap for very large diffs so it never stalls.
 * @param {string | null | undefined} before
 * @param {string | null | undefined} after
 * @returns {{ added: number, deleted: number }}
 */
export function diffLines(before, after) {
  if (before === after) return { added: 0, deleted: 0 }
  const a = splitLines(before)
  const b = splitLines(after)
  if (a.length === 0) return { added: b.length, deleted: 0 }
  if (b.length === 0) return { added: 0, deleted: a.length }

  let start = 0
  const minLen = Math.min(a.length, b.length)
  while (start < minLen && a[start] === b[start]) start++

  let endA = a.length - 1
  let endB = b.length - 1
  while (endA >= start && endB >= start && a[endA] === b[endB]) {
    endA--
    endB--
  }

  const m = endA - start + 1
  const n = endB - start + 1
  if (m <= 0) return { added: Math.max(0, n), deleted: 0 }
  if (n <= 0) return { added: 0, deleted: Math.max(0, m) }

  // Exact LCS for reasonable diff regions
  if (m * n <= 200_000) {
    let prev = new Uint32Array(n + 1)
    let curr = new Uint32Array(n + 1)
    for (let i = 0; i < m; i++) {
      const lineA = a[start + i]
      for (let j = 0; j < n; j++) {
        if (lineA === b[start + j]) curr[j + 1] = prev[j] + 1
        else curr[j + 1] = prev[j + 1] >= curr[j] ? prev[j + 1] : curr[j]
      }
      const tmp = prev
      prev = curr
      curr = tmp
      curr.fill(0)
    }
    const common = prev[n]
    return { added: n - common, deleted: m - common }
  }

  // O(m + n) multiset fallback for huge files
  const counts = new Map()
  for (let i = 0; i < m; i++) {
    const line = a[start + i]
    counts.set(line, (counts.get(line) ?? 0) + 1)
  }
  let matched = 0
  for (let j = 0; j < n; j++) {
    const line = b[start + j]
    const c = counts.get(line) ?? 0
    if (c > 0) {
      counts.set(line, c - 1)
      matched++
    }
  }
  return { added: n - matched, deleted: m - matched }
}
