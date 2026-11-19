#!/usr/bin/env node
// A local stand-in for the DeepSeek chat-completions API, for testing
// dsh-pixel-report without an API key.
//
// Simulates DeepSeek's 64-token prefix cache and emits real tool calls so the
// plugin's hooks (`llm/stream`, `tools/result`, `session/event`, `workspace/changes`)
// are exercised end-to-end:
//   - user message containing "write" -> calls `write` on `hello.js`
//   - user message containing "edit"  -> calls `edit` on `hello.js`
//   - user message containing "bash" or "tool" -> calls `bash` (`echo pixel-ok`)
//   - anything else -> short text reply
//
// usage: node test/mockseek.mjs [port]   (default 3890)

import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const PORT = Number(process.argv[2] ?? process.env.MOCK_PORT ?? 3890)
const TTL_MS = Number(process.env.MOCK_TTL_MS ?? 60 * 60 * 1000)
const UNIT = 64

export function estimateTokens(text) {
  let cjk = 0
  for (const ch of text) if (ch.codePointAt(0) > 0x2e7f) cjk++
  return cjk + Math.ceil((text.length - cjk) / 4)
}

export function serializePrompt(body) {
  const messages = Array.isArray(body.messages) ? body.messages : []
  const system = messages.filter(m => m.role === 'system')
  const rest = messages.filter(m => m.role !== 'system')
  const part = m => JSON.stringify({ role: m.role, content: m.content ?? null, tool_calls: m.tool_calls, tool_call_id: m.tool_call_id })
  return [...system.map(part), JSON.stringify(body.tools ?? []), ...rest.map(part)].join('\n')
}

const seen = []

function cacheHit(text, now) {
  for (let i = seen.length - 1; i >= 0; i--) if (now - seen[i].at > TTL_MS) seen.splice(i, 1)
  let best = 0
  for (const s of seen) {
    const max = Math.min(s.text.length, text.length)
    let n = 0
    while (n < max && s.text.charCodeAt(n) === text.charCodeAt(n)) n++
    if (n > best) best = n
  }
  seen.push({ text, at: now })
  if (seen.length > 200) seen.shift()
  const tokens = estimateTokens(text.slice(0, best))
  return Math.floor(tokens / UNIT) * UNIT
}

function lastUserText(messages) {
  const parts = []
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role === 'tool') return parts.length ? parts.join('\n') : null
    if (m.role !== 'user') break
    parts.push(typeof m.content === 'string' ? m.content : JSON.stringify(m.content))
  }
  return parts.join('\n')
}

const server = createServer((req, res) => {
  if (req.method === 'GET' && req.url.endsWith('/models')) {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ object: 'list', data: [{ id: 'deepseek-flash', object: 'model' }] }))
    return
  }
  if (req.method !== 'POST' || !req.url.endsWith('/chat/completions')) {
    res.writeHead(404); res.end(); return
  }
  let raw = ''
  req.on('data', d => { raw += d })
  req.on('end', () => {
    let body
    try { body = JSON.parse(raw) } catch { res.writeHead(400); res.end('bad json'); return }
    const now = Date.now()
    const prompt = serializePrompt(body)
    const promptTokens = estimateTokens(prompt)
    const hit = Math.min(cacheHit(prompt, now), promptTokens)
    const messages = body.messages ?? []
    const userText = lastUserText(messages)
    const tools = new Set((body.tools ?? []).map(t => t.function?.name))

    let planned = null
    if (userText !== null) {
      if (/\bwrite\b|写文件/i.test(userText) && tools.has('write')) {
        planned = {
          name: 'write',
          args: JSON.stringify({
            file_path: 'hello.js',
            content: [
              'export function greet(name) {',
              '  return `Hello, ${name}!`',
              '}',
              'export const version = 1',
              '',
            ].join('\n'),
          }),
        }
      } else if (/\bedit\b|修改/i.test(userText) && tools.has('edit')) {
        planned = {
          name: 'edit',
          args: JSON.stringify({
            file_path: 'hello.js',
            old_string: 'export const version = 1',
            new_string: 'export const version = 2\nexport const ready = true',
          }),
        }
      } else if (/\bbash\b|\btool\b|命令/i.test(userText) && tools.has('bash')) {
        planned = {
          name: 'bash',
          args: JSON.stringify({ command: 'echo pixel-report-ok' }),
        }
      }
    }

    const id = 'mock-' + now
    const base = { id, object: 'chat.completion.chunk', created: Math.floor(now / 1000), model: body.model }
    const send = obj => res.write('data: ' + JSON.stringify(obj) + '\n\n')
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
    let completion
    if (planned) {
      send({
        ...base,
        choices: [{
          index: 0,
          delta: {
            role: 'assistant',
            content: null,
            tool_calls: [{ index: 0, id: 'call_' + now, type: 'function', function: { name: planned.name, arguments: planned.args } }],
          },
          finish_reason: null,
        }],
      })
      send({ ...base, choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] })
      completion = estimateTokens(planned.args) + 12
    } else {
      const text = userText === null ? '操作已完成，战报数据已更新。' : '好的，收到。'
      send({ ...base, choices: [{ index: 0, delta: { role: 'assistant', content: text }, finish_reason: null }] })
      send({ ...base, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })
      completion = estimateTokens(text)
    }
    send({
      ...base,
      choices: [],
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completion,
        total_tokens: promptTokens + completion,
        prompt_cache_hit_tokens: hit,
        prompt_cache_miss_tokens: promptTokens - hit,
      },
    })
    res.write('data: [DONE]\n\n')
    res.end()
    console.log(`[mockseek] ${new Date(now).toISOString()} model=${body.model} prompt=${promptTokens} hit=${hit} ${planned ? `tool:${planned.name}` : 'text'}`)
  })
})

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  server.listen(PORT, '127.0.0.1', () => console.log(`[mockseek] listening on http://127.0.0.1:${PORT}/v1`))
}
