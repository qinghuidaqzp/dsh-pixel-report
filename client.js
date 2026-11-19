;(function () {
/**
 * dsh-pixel-report, Web half: the Pixel Report (像素战报) tab in the right sidebar.
 *
 * Polls the Host `pixelReport` service and renders a shareable 1080x1560 pixel-art
 * battle report card on a canvas (low-res 180x260 pixel art upscaled 6x with
 * nearest-neighbour, paired with sharp high-res CJK typography). Supports
 * Today / This Week views, 3 retro color themes, privacy masking, PNG download,
 * and clipboard copy.
 */

/* ───────────────────────── text ───────────────────────── */
var LOCALE_NS = 'dshPixelReport'
var LOCALE = {
  zh: {
    title: '像素战报',
    guide: '把 Agent 今天或本周的活做成一张复古像素风战报卡片，一键下载或复制分享。',
    today: '今日',
    week: '本周',
    themeMidnight: '深海',
    themeGameboy: '掌机',
    themeArcade: '街机',
    hideNames: '隐藏文件名',
    download: '下载 PNG',
    copy: '复制图片',
    copied: '已复制图片',
    copyUnsupported: '当前环境不支持直接复制图片，请点「下载 PNG」',
    downloaded: '已开始下载',
    refresh: '刷新',
    reset: '清空统计',
    resetConfirm: '再点一次确认清空',
    noHost: '没有连上像素战报的后台。请确认插件已装在这个 profile 里，并重启 dsh。',
    loadFailed: '读取统计失败：{msg}',
    emptyHint: '当前时段还没有记录到 Agent 活动；发一条消息后战报会自动点亮。',
    priceNote: '按 DeepSeek 官方价估算（{date} 核对）：{rows}。工作日 9–12 点、14–18 点为高峰（翻倍）；现在是{now}。',
    priceCustom: '按插件自定义价格计算：{rows}。',
    priceRow: '{label} 命中 ¥{hit} / 未命中 ¥{miss}',
    peak: '高峰时段',
    offPeak: '空闲时段',
    // Card labels
    cardTitle: '像素战报',
    cardDay: '今日战报',
    cardWeek: '本周战报',
    kpiFiles: '改动文件',
    kpiCommands: '执行命令',
    kpiSessions: '会话 · 轮次',
    kpiCost: '估算花费',
    kpiCache: '缓存命中率',
    kpiPeak: '最忙时段',
    mostEdited: '最常改 {name} ({n}次)',
    totalEdits: '共改动 {n} 个文件',
    noFileEdits: '尚未改动文件',
    toolSub: '工具 {n} 次 · 主力 {tool}',
    toolSubPlain: '工具调用共 {n} 次',
    sessSub: '模型调用 {req} 次 · 活跃 {dur}',
    costSub: '总计 {tok} tokens',
    cacheSub: '命中 {hit} · 省下 {saved}',
    cacheSubZero: '暂无缓存命中记录',
    peakSub: '单小时 {n} 次操作',
    peakSubNone: '等待首个活跃时段',
    chartTitleDay: '24 小时活跃分布',
    chartTitleWeek: '近 7 天活跃趋势',
    tokenTitle: 'Token 构成',
    legHit: '缓存命中 {p}',
    legMiss: '未命中输入 {p}',
    legOut: '输出 {p}',
    streakTag: '连续活跃 {n} 天',
    longestTag: '最长会话 {n} 轮',
    watermarkLeft: 'dsh-pixel-report · 像素战报',
    hiddenWorkspace: 'PRIVATE WORKSPACE',
  },
  en: {
    title: 'Pixel Report',
    guide: 'Turn your agent’s day or week into a shareable retro pixel-art battle report card.',
    today: 'Today',
    week: '7 Days',
    themeMidnight: 'DeepSea',
    themeGameboy: 'GameBoy',
    themeArcade: 'Arcade',
    hideNames: 'Hide names',
    download: 'Download PNG',
    copy: 'Copy Image',
    copied: 'Copied to clipboard',
    copyUnsupported: 'Clipboard image copy is unavailable here; use Download PNG',
    downloaded: 'Download started',
    refresh: 'Refresh',
    reset: 'Clear stats',
    resetConfirm: 'Click again to clear',
    noHost: 'Cannot reach the Pixel Report host. Check that the plugin is installed in this profile and restart dsh.',
    loadFailed: 'Could not load statistics: {msg}',
    emptyHint: 'No agent activity recorded in this window yet. Start a conversation to light up the card.',
    priceNote: 'Estimated with DeepSeek list prices ({date}): {rows}. Weekdays 9–12 & 14–18 Beijing time are peak (2×); {now} now.',
    priceCustom: 'Priced with custom rates: {rows}.',
    priceRow: '{label} hit ¥{hit} / miss ¥{miss}',
    peak: 'peak',
    offPeak: 'off-peak',
    cardTitle: 'PIXEL REPORT',
    cardDay: 'DAILY REPORT',
    cardWeek: 'WEEKLY REPORT',
    kpiFiles: 'FILES CHANGED',
    kpiCommands: 'COMMANDS RUN',
    kpiSessions: 'SESSIONS / TURNS',
    kpiCost: 'EST. COST',
    kpiCache: 'CACHE HIT RATE',
    kpiPeak: 'BUSIEST HOUR',
    mostEdited: 'Top: {name} ({n}x)',
    totalEdits: '{n} files touched',
    noFileEdits: 'No files edited yet',
    toolSub: '{n} tools · top {tool}',
    toolSubPlain: '{n} tool calls total',
    sessSub: '{req} calls · active {dur}',
    costSub: '{tok} tokens total',
    cacheSub: 'Hit {hit} · saved {saved}',
    cacheSubZero: 'No cache hits yet',
    peakSub: '{n} actions in peak hour',
    peakSubNone: 'Waiting for first activity',
    chartTitleDay: '24H ACTIVITY',
    chartTitleWeek: '7-DAY ACTIVITY',
    tokenTitle: 'TOKEN MIX',
    legHit: 'Cache {p}',
    legMiss: 'Uncached {p}',
    legOut: 'Output {p}',
    streakTag: '{n}d streak',
    longestTag: 'Best session {n} turns',
    watermarkLeft: 'dsh-pixel-report',
    hiddenWorkspace: 'PRIVATE WORKSPACE',
  },
}

function lang() {
  const l = (document.documentElement.lang || navigator.language || 'zh').toLowerCase()
  return l.startsWith('zh') ? 'zh' : 'en'
}
function tr(key, vars) {
  let s = (LOCALE[lang()] || LOCALE.zh)[key] || LOCALE.zh[key] || key
  if (vars) for (const k in vars) s = s.split(`{${k}}`).join(String(vars[k]))
  return s
}

/* ───────────────────────── styles ───────────────────────── */
var CSS = `
.pxr{--pxr-accent:var(--dsw-alias-state-business-primary,#4a6cf7);
  --pxr-rule:color-mix(in srgb,currentColor 13%,transparent);
  --pxr-muted:color-mix(in srgb,currentColor 58%,transparent);
  --pxr-card:color-mix(in srgb,currentColor 4%,transparent);
  --pxr-ok:#2f9e66;--pxr-err:#d4483e;
  box-sizing:border-box;height:100%;overflow-y:auto;padding:14px 14px 20px;display:flex;flex-direction:column;gap:12px;font-size:13px;line-height:1.5}
.pxr *{box-sizing:border-box}
.pxr>*{flex:0 0 auto}
.pxr-bar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px}
.pxr-seg{display:inline-flex;border:1px solid var(--pxr-rule);border-radius:8px;padding:2px;background:var(--pxr-card);gap:2px}
.pxr-seg button{border:0;background:transparent;color:var(--pxr-muted);font:inherit;font-size:12px;font-weight:500;padding:4px 10px;border-radius:6px;cursor:pointer;transition:background .12s,color .12s}
.pxr-seg button.on{background:var(--pxr-accent);color:#fff}
.pxr-themes{display:inline-flex;gap:5px;align-items:center}
.pxr-swatch{display:inline-flex;align-items:center;gap:5px;border:1px solid var(--pxr-rule);border-radius:8px;padding:4px 8px;background:transparent;color:inherit;font:inherit;font-size:11.5px;cursor:pointer}
.pxr-swatch i{width:10px;height:10px;border-radius:2px;display:inline-block;border:1px solid rgba(255,255,255,.35)}
.pxr-swatch.on{border-color:var(--pxr-accent);background:color-mix(in srgb,var(--pxr-accent) 12%,transparent);font-weight:600}
.pxr-opts{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px;color:var(--pxr-muted)}
.pxr-check{display:inline-flex;align-items:center;gap:6px;cursor:pointer;user-select:none}
.pxr-check input{accent-color:var(--pxr-accent);cursor:pointer;margin:0}
.pxr-stage{position:relative;border-radius:10px;overflow:hidden;border:1px solid var(--pxr-rule);background:#0d1326;box-shadow:0 8px 24px -12px rgba(0,0,0,.45)}
.pxr-stage canvas{display:block;width:100%;height:auto;aspect-ratio:1080/1632}
.pxr-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.pxr-btn{font:inherit;font-size:12.5px;font-weight:600;padding:8px 12px;border-radius:8px;border:1px solid var(--pxr-rule);background:var(--pxr-card);color:inherit;cursor:pointer;transition:opacity .12s,background .12s}
.pxr-btn:hover{background:color-mix(in srgb,currentColor 8%,transparent)}
.pxr-btn.primary{background:var(--pxr-accent);border-color:var(--pxr-accent);color:#fff}
.pxr-btn.primary:hover{opacity:.92}
.pxr-btn.small{font-size:11.5px;font-weight:500;padding:4px 10px}
.pxr-btn.armed{border-color:var(--pxr-err);color:var(--pxr-err)}
.pxr-toast{font-size:12px;padding:6px 10px;border-radius:8px;background:color-mix(in srgb,var(--pxr-ok) 14%,transparent);color:var(--pxr-ok);text-align:center}
.pxr-toast.warn{background:color-mix(in srgb,var(--pxr-err) 12%,transparent);color:var(--pxr-err)}
.pxr-hint{margin:0;padding:8px 10px;border-radius:8px;border:1px dashed var(--pxr-rule);color:var(--pxr-muted);font-size:12px}
.pxr-error{padding:10px 12px;border-radius:10px;border:1px solid var(--pxr-err);color:var(--pxr-err);font-size:12.5px}
.pxr-foot{display:grid;gap:8px;color:var(--pxr-muted);font-size:11.5px;padding-top:2px}
.pxr-foot p{margin:0}
.pxr-foot-row{display:flex;gap:8px;align-items:center}
`

/* ───────────────────────── themes ───────────────────────── */
var THEMES = {
  midnight: {
    id: 'midnight',
    swatch: '#1a2b56',
    bg: '#0b1021',
    bg2: '#111a34',
    panel: '#162140',
    panelAlt: '#1b284d',
    border: '#3e5c9a',
    borderHi: '#6b94e0',
    borderLo: '#070b17',
    text: '#eef5ff',
    muted: '#8da4cc',
    accent: '#4deeea',
    gold: '#ffd166',
    green: '#52e59b',
    red: '#ff6b7a',
    barOff: '#23325b',
    barFill: '#4deeea',
    barPeak: '#ffd166',
    whaleBody: '#3ec6ff',
    whaleLight: '#8be9ff',
    whaleDark: '#1b7bb5',
    whaleBelly: '#d8f8ff',
    whaleEye: '#0b1021',
    spout: '#7bf1d6',
    wave1: '#1d3c73',
    wave2: '#2c5ba0',
    shadow: '#060a14',
  },
  gameboy: {
    id: 'gameboy',
    swatch: '#306230',
    bg: '#0f380f',
    bg2: '#174417',
    panel: '#1d4d1d',
    panelAlt: '#245824',
    border: '#6c921c',
    borderHi: '#9bbc0f',
    borderLo: '#092409',
    text: '#d4e872',
    muted: '#8bac0f',
    accent: '#c4e040',
    gold: '#e6f58c',
    green: '#b4dc3c',
    red: '#d4e872',
    barOff: '#143f14',
    barFill: '#8bac0f',
    barPeak: '#d4e872',
    whaleBody: '#8bac0f',
    whaleLight: '#c4e040',
    whaleDark: '#306230',
    whaleBelly: '#d4e872',
    whaleEye: '#0f380f',
    spout: '#c4e040',
    wave1: '#154215',
    wave2: '#306230',
    shadow: '#081f08',
  },
  arcade: {
    id: 'arcade',
    swatch: '#ff7b3b',
    bg: '#191018',
    bg2: '#231622',
    panel: '#2c1b29',
    panelAlt: '#362133',
    border: '#8f4f66',
    borderHi: '#ff9f43',
    borderLo: '#0e070d',
    text: '#fff2e6',
    muted: '#c89aa8',
    accent: '#ff9f43',
    gold: '#ffd32a',
    green: '#55efc4',
    red: '#ff5e6c',
    barOff: '#41283d',
    barFill: '#ff9f43',
    barPeak: '#ffd32a',
    whaleBody: '#ff7f50',
    whaleLight: '#ffb580',
    whaleDark: '#b83b4a',
    whaleBelly: '#ffe6d4',
    whaleEye: '#191018',
    spout: '#ffd32a',
    wave1: '#4a243d',
    wave2: '#6e3455',
    shadow: '#0d060b',
  },
}

/* ───────────────────────── pixel bitmap font (5x7) ───────────────────────── */
var FONT5X7 = {
  '0': ['01110','10001','10011','10101','11001','10001','01110'],
  '1': ['00100','01100','00100','00100','00100','00100','01110'],
  '2': ['01110','10001','00001','00110','01000','10000','11111'],
  '3': ['11110','00001','00001','01110','00001','00001','11110'],
  '4': ['00010','00110','01010','10010','11111','00010','00010'],
  '5': ['11111','10000','11110','00001','00001','10001','01110'],
  '6': ['01110','10000','11110','10001','10001','10001','01110'],
  '7': ['11111','00001','00010','00100','01000','01000','01000'],
  '8': ['01110','10001','10001','01110','10001','10001','01110'],
  '9': ['01110','10001','10001','01111','00001','00010','01100'],
  'A': ['01110','10001','10001','11111','10001','10001','10001'],
  'B': ['11110','10001','10001','11110','10001','10001','11110'],
  'C': ['01110','10001','10000','10000','10000','10001','01110'],
  'D': ['11100','10010','10001','10001','10001','10010','11100'],
  'E': ['11111','10000','10000','11110','10000','10000','11111'],
  'F': ['11111','10000','10000','11110','10000','10000','10000'],
  'G': ['01110','10001','10000','10111','10001','10001','01110'],
  'H': ['10001','10001','10001','11111','10001','10001','10001'],
  'I': ['01110','00100','00100','00100','00100','00100','01110'],
  'J': ['00111','00010','00010','00010','10010','10010','01100'],
  'K': ['10001','10010','10100','11000','10100','10010','10001'],
  'L': ['10000','10000','10000','10000','10000','10000','11111'],
  'M': ['10001','11011','10101','10101','10001','10001','10001'],
  'N': ['10001','11001','10101','10011','10001','10001','10001'],
  'O': ['01110','10001','10001','10001','10001','10001','01110'],
  'P': ['11110','10001','10001','11110','10000','10000','10000'],
  'Q': ['01110','10001','10001','10001','10101','10010','01101'],
  'R': ['11110','10001','10001','11110','10100','10010','10001'],
  'S': ['01111','10000','10000','01110','00001','00001','11110'],
  'T': ['11111','00100','00100','00100','00100','00100','00100'],
  'U': ['10001','10001','10001','10001','10001','10001','01110'],
  'V': ['10001','10001','10001','10001','10001','01010','00100'],
  'W': ['10001','10001','10001','10101','10101','11011','10001'],
  'X': ['10001','10001','01010','00100','01010','10001','10001'],
  'Y': ['10001','10001','01010','00100','00100','00100','00100'],
  'Z': ['11111','00001','00010','00100','01000','10000','11111'],
  '+': ['00000','00100','00100','11111','00100','00100','00000'],
  '-': ['00000','00000','00000','11111','00000','00000','00000'],
  '.': ['00000','00000','00000','00000','00000','01100','01100'],
  ',': ['00000','00000','00000','00000','00110','00100','01000'],
  ':': ['00000','01100','01100','00000','01100','01100','00000'],
  '?': ['01110','10001','00010','00100','00100','00000','00100'],
  '/': ['00001','00010','00010','00100','01000','01000','10000'],
  '%': ['11001','11010','00010','00100','01000','01011','10011'],
  '¥': ['10001','01010','00100','11111','00100','11111','00100'],
  '_': ['00000','00000','00000','00000','00000','00000','11111'],
  ' ': ['00000','00000','00000','00000','00000','00000','00000'],
  '·': ['00000','00000','00000','00100','00000','00000','00000'],
  '!': ['00100','00100','00100','00100','00100','00000','00100'],
  '(': ['00010','00100','01000','01000','01000','00100','00010'],
  ')': ['01000','00100','00010','00010','00010','00100','01000'],
  '<': ['00010','00100','01000','10000','01000','00100','00010'],
  '—': ['00000','00000','00000','11111','00000','00000','00000'],
}

/* ───────────────────────── pixel sprites ───────────────────────── */
// 8x8 pixel icons for KPI cards
var ICONS_8 = {
  file: [
    '.11111..',
    '.122211.',
    '.122221.',
    '.123321.',
    '.122221.',
    '.123321.',
    '.122221.',
    '.111111.',
  ],
  term: [
    '11111111',
    '12222221',
    '12322221',
    '12232221',
    '12322221',
    '12223321',
    '12222221',
    '11111111',
  ],
  turn: [
    '.111111.',
    '12222221',
    '12333321',
    '12222221',
    '12332221',
    '.111221.',
    '....121.',
    '.....1..',
  ],
  coin: [
    '..1111..',
    '.133331.',
    '13233231',
    '13322331',
    '13322331',
    '13233231',
    '.133331.',
    '..1111..',
  ],
  cache: [
    '.111111.',
    '12233221',
    '12333321',
    '12322321',
    '12233221',
    '.122221.',
    '..1221..',
    '...11...',
  ],
  clock: [
    '..1111..',
    '.122221.',
    '12232221',
    '12232221',
    '12233321',
    '12222221',
    '.122221.',
    '..1111..',
  ],
}

// 28x20 Pixel Whale mascot (legend: L=light, B=body, D=dark, W=belly, E=eye, S=spout, G=gold)
var WHALE_SPRITE = [
  '.........SS..SS.............',
  '........S..SS..S............',
  '...........SS...............',
  '...........SS...............',
  '.......LLLLLLLLLL...........',
  '.....LLBBBBBBBBBBLL.........',
  '....LBBBBBBBBBBBBBBL........',
  '...LBBBBBBBBBBBBBBBBL....BB.',
  '..LBBBEEBBBBBBBBBBBBBL..BBL.',
  '..LBBBEEBBBBBBBBBBBBBBBBBBL.',
  '..LBBBBBBBBBBBBBBBBBBBBBBBL.',
  '..LBBBBBBBBBBBBBBBBBBBBBB...',
  '..DBBWWWWWWWWWWWWBBBBBDD....',
  '...DWWWWWWWWWWWWWWBBDDD.....',
  '....DDWWWWWWWWWWWDDDD.......',
  '......DDDDDDDDDDDD..........',
]

// Tiny 9x6 whale for the watermark
var MINI_WHALE = [
  '...S.S...',
  '....S....',
  '.BBBBBB.B',
  'BBEBBBBBB',
  'BBWWWWBB.',
  '.BBBBBB..',
]

// 7x7 pixel accessories drawn next to/above the whale based on deterministic rank
var ACCESSORIES = {
  moon:  ['..111..','.11....','11.....','11.....','11.....','.11....','..111..'],
  sun:   ['...1...','1..1..1','..111..','1111111','..111..','1..1..1','...1...'],
  wrench:['..111..','.11.11.','.1111..','..11...','.11....','11.....','1......'],
  coin:  ['..111..','.11111.','1121211','1112111','1121211','.11111.','..111..'],
  visor: ['.......','.......','1111111','1221221','1111111','.......','.......'],
  crown: ['.......','1..1..1','1.111.1','1111111','1121211','1111111','.......'],
  bolt:  ['...11..','..11...','.11111.','...11..','..11...','.11....','1......'],
  shield:['.11111.','1122211','1121211','1122211','.11111.','..111..','...1...'],
  star:  ['...1...','...1...','..111..','1111111','..111..','.11.11.','1.....1'],
  sleep: ['1111...','..1....','.1.....','1111...','....111','.....1.','....111'],
}

/* ───────────────────────── formatting ───────────────────────── */
function fmtInt(n) {
  n = Math.round(Number(n) || 0)
  return n.toLocaleString('en-US')
}
function fmtTokens(n) {
  n = Math.max(0, Number(n) || 0)
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 1 : 2) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 1 : 1) + 'K'
  return String(Math.round(n))
}
function fmtMoney(v) {
  v = Math.max(0, Number(v) || 0)
  if (v === 0) return '¥0.00'
  if (v < 0.01) return '¥' + v.toFixed(4)
  if (v < 1) return '¥' + v.toFixed(3)
  return '¥' + v.toFixed(2)
}
function fmtDuration(ms) {
  ms = Math.max(0, Number(ms) || 0)
  if (ms === 0) return '0s'
  if (ms < 1000) return '<1s'
  const sec = Math.round(ms / 1000)
  if (sec < 60) return sec + 's'
  const min = Math.floor(sec / 60)
  if (min < 60) return min + 'm'
  const h = Math.floor(min / 60)
  const rem = min % 60
  return rem > 0 ? `${h}h${rem}m` : `${h}h`
}
function fmtHour(h) {
  if (typeof h !== 'number' || h < 0 || h > 23) return '--:--'
  return String(h).padStart(2, '0') + ':00'
}
function pctInt(part, whole) {
  if (whole <= 0) return '0%'
  const r = Math.round((part / whole) * 100)
  if (r === 0 && part > 0) return '<1%'
  return r + '%'
}

/* ───────────────────────── low-res pixel helpers ───────────────────────── */
function pxRect(ctx, x, y, w, h, color) {
  ctx.fillStyle = color
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h))
}

function pxFrame(ctx, x, y, w, h, T, fillColor) {
  // Clipped pixel corner beveled RPG panel
  pxRect(ctx, x + 1, y + 1, w - 2, h - 2, fillColor || T.panel)
  // Top & bottom borders
  pxRect(ctx, x + 1, y, w - 2, 1, T.borderHi)
  pxRect(ctx, x + 1, y + h - 1, w - 2, 1, T.borderLo)
  // Left & right borders
  pxRect(ctx, x, y + 1, 1, h - 2, T.border)
  pxRect(ctx, x + w - 1, y + 1, 1, h - 2, T.border)
  // Inner top highlight & bottom shade
  pxRect(ctx, x + 2, y + 1, w - 4, 1, T.border)
  pxRect(ctx, x + 2, y + h - 2, w - 4, 1, T.shadow)
  // Corner rivets
  pxRect(ctx, x + 2, y + 2, 1, 1, T.borderHi)
  pxRect(ctx, x + w - 3, y + 2, 1, 1, T.borderHi)
  pxRect(ctx, x + 2, y + h - 3, 1, 1, T.border)
  pxRect(ctx, x + w - 3, y + h - 3, 1, 1, T.border)
}

function drawSprite(ctx, rows, x, y, palette, scale) {
  scale = scale || 1
  for (let r = 0; r < rows.length; r++) {
    const line = rows[r]
    for (let c = 0; c < line.length; c++) {
      const ch = line[c]
      const col = palette[ch]
      if (!col) continue
      ctx.fillStyle = col
      ctx.fillRect(x + c * scale, y + r * scale, scale, scale)
    }
  }
}

function measurePixelText(text, scale) {
  scale = scale || 1
  const s = String(text || '').toUpperCase()
  return s.length > 0 ? s.length * (6 * scale) - scale : 0
}

function drawPixelText(ctx, text, x, y, color, scale, shadowColor) {
  scale = scale || 1
  const s = String(text || '').toUpperCase()
  let cx = Math.round(x)
  const cy = Math.round(y)
  for (let i = 0; i < s.length; i++) {
    const glyph = FONT5X7[s[i]] || FONT5X7[' ']
    if (shadowColor) {
      ctx.fillStyle = shadowColor
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 5; c++) {
          if (glyph[r][c] === '1') ctx.fillRect(cx + c * scale + scale, cy + r * scale + scale, scale, scale)
        }
      }
    }
    ctx.fillStyle = color
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 5; c++) {
        if (glyph[r][c] === '1') ctx.fillRect(cx + c * scale, cy + r * scale, scale, scale)
      }
    }
    cx += 6 * scale
  }
  return cx - Math.round(x)
}

/* ───────────────────────── high-res CJK helpers ───────────────────────── */
var CJK_FONT = '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", system-ui, sans-serif'

function fitText(ctx, text, maxW) {
  const s = String(text || '')
  if (ctx.measureText(s).width <= maxW) return s
  let lo = 0, hi = s.length
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (ctx.measureText(s.slice(0, mid) + '…').width <= maxW) lo = mid
    else hi = mid - 1
  }
  return lo > 0 ? s.slice(0, lo) + '…' : '…'
}

function drawCJK(ctx, text, x, y, opts) {
  const size = opts.size || 24
  const weight = opts.weight || 700
  const align = opts.align || 'left'
  ctx.font = `${weight} ${size}px ${CJK_FONT}`
  ctx.textBaseline = 'top'
  ctx.textAlign = align
  const str = opts.maxWidth ? fitText(ctx, text, opts.maxWidth) : String(text || '')
  if (opts.shadow) {
    const off = opts.shadowOffset || 3
    ctx.fillStyle = opts.shadow
    ctx.fillText(str, Math.round(x) + off, Math.round(y) + off)
  }
  ctx.fillStyle = opts.color || '#ffffff'
  ctx.fillText(str, Math.round(x), Math.round(y))
}

/* ───────────────────────── main pixel card renderer ───────────────────────── */
var CARD_W = 1080
var CARD_H = 1632
var PX = 6
var GRID_W = CARD_W / PX // 180
var GRID_H = CARD_H / PX // 272

function renderBattleCard(canvas, report, opts) {
  const T = THEMES[opts.theme] || THEMES.midnight
  const range = opts.range === 'week' ? 'week' : 'today'
  const hideNames = Boolean(opts.hideNames || report.hideNames)
  const isZh = lang() === 'zh'
  const data = range === 'week' ? report.week : report.today
  const rank = data.rank || { id: 'idle', grade: 'ZZZ', accessory: 'sleep', titleZh: '像素鲸打盹中', titleEn: 'Idle Whale', subZh: '', subEn: '' }

  canvas.width = CARD_W
  canvas.height = CARD_H
  const ctx = canvas.getContext('2d')

  // Offscreen low-res pixel canvas (180x272)
  const low = document.createElement('canvas')
  low.width = GRID_W
  low.height = GRID_H
  const p = low.getContext('2d')
  p.imageSmoothingEnabled = false

  // 1. Background & subtle retro dither grid
  pxRect(p, 0, 0, GRID_W, GRID_H, T.bg)
  for (let y = 0; y < GRID_H; y += 2) {
    for (let x = (y % 4 === 0 ? 0 : 2); x < GRID_W; x += 4) {
      if (y < 36 || y > 253) pxRect(p, x, y, 1, 1, T.bg2)
    }
  }
  // Outer decorative arcade frame
  pxRect(p, 2, 2, GRID_W - 4, 1, T.border)
  pxRect(p, 2, GRID_H - 3, GRID_W - 4, 1, T.border)
  pxRect(p, 2, 2, 1, GRID_H - 4, T.border)
  pxRect(p, GRID_W - 3, 2, 1, GRID_H - 4, T.border)
  pxRect(p, 3, 3, 2, 2, T.accent)
  pxRect(p, GRID_W - 5, 3, 2, 2, T.accent)
  pxRect(p, 3, GRID_H - 5, 2, 2, T.accent)
  pxRect(p, GRID_W - 5, GRID_H - 5, 2, 2, T.accent)

  // 2. Header banner (y = 6..30, h = 24)
  pxFrame(p, 6, 6, 168, 24, T, T.panelAlt)
  const modeTag = range === 'week' ? '7 DAYS' : 'TODAY'
  const tagW = measurePixelText(modeTag, 1) + 6
  pxRect(p, 10, 9, tagW, 9, T.accent)
  drawPixelText(p, modeTag, 13, 10, T.shadow, 1)
  const dateText = range === 'week'
    ? `${data.startDate.slice(5)}..${data.endDate.slice(5)}`
    : data.startDate
  drawPixelText(p, dateText, 10 + tagW + 4, 10, T.gold, 1, T.shadow)
  const subTitle = 'PIXEL REPORT'
  const subW = measurePixelText(subTitle, 1)
  drawPixelText(p, subTitle, 170 - subW, 19, T.muted, 1, T.shadow)

  // 3. Hero Character & Rank Window (y = 34..82, h = 48)
  pxFrame(p, 6, 34, 168, 48, T, T.panel)
  pxRect(p, 11, 39, 44, 38, T.bg)
  pxRect(p, 11, 39, 44, 1, T.borderLo)
  pxRect(p, 11, 76, 44, 1, T.border)
  pxRect(p, 11, 39, 1, 38, T.borderLo)
  pxRect(p, 54, 39, 1, 38, T.border)
  const stars = [[15, 43], [21, 46], [48, 42], [43, 48], [17, 52], [50, 51]]
  for (let i = 0; i < stars.length; i++) {
    pxRect(p, stars[i][0], stars[i][1], 1, 1, i % 2 === 0 ? T.gold : T.accent)
  }
  pxRect(p, 12, 67, 42, 9, T.wave1)
  for (let wx = 12; wx < 54; wx += 4) {
    pxRect(p, wx, 66, 2, 1, T.wave2)
    pxRect(p, wx + 2, 69, 2, 1, T.wave2)
    pxRect(p, wx, 72, 2, 1, T.wave2)
  }
  drawSprite(p, WHALE_SPRITE, 19, 52, {
    L: T.whaleLight,
    B: T.whaleBody,
    D: T.whaleDark,
    W: T.whaleBelly,
    E: T.whaleEye,
    S: T.spout,
    G: T.gold,
  }, 1)
  const accSprite = ACCESSORIES[rank.accessory] || ACCESSORIES.star
  drawSprite(p, accSprite, 44, 41, { '1': T.gold, '2': T.accent }, 1)

  drawPixelText(p, 'TITLE', 60, 40, T.accent, 1, T.shadow)
  pxRect(p, 60, 72, 2, 2, T.green)
  pxRect(p, 102, 72, 2, 2, T.gold)

  // Right Rank Shield (x = 141..169, y = 39..77, 28x38)
  pxFrame(p, 141, 39, 28, 38, T, T.panelAlt)
  const rLabel = 'RANK'
  drawPixelText(p, rLabel, 141 + Math.floor((28 - measurePixelText(rLabel, 1)) / 2), 43, T.muted, 1, T.shadow)
  const gradeColor = rank.grade === 'S+' || rank.grade === 'S'
    ? T.gold
    : rank.grade === 'A' ? T.green
    : rank.grade === 'ZZZ' ? T.muted : T.accent
  const gScale = rank.grade.length <= 2 ? 2 : 1
  const gw = measurePixelText(rank.grade, gScale)
  const gx = 141 + Math.floor((28 - gw) / 2)
  const gy = gScale === 2 ? 54 : 58
  drawPixelText(p, rank.grade, gx, gy, gradeColor, gScale, T.shadow)
  const starCount = rank.grade === 'S+' ? 5 : rank.grade === 'S' ? 4 : rank.grade === 'A' ? 3 : rank.grade === 'B' ? 2 : rank.grade === 'C' ? 1 : 0
  if (starCount > 0) {
    const totalW = starCount * 4 - 2
    const sx = 141 + Math.floor((28 - totalW) / 2)
    for (let i = 0; i < starCount; i++) {
      pxRect(p, sx + i * 4, 71, 2, 2, T.gold)
    }
  }

  // 4. 2x3 Core Stats Grid (y = 86..173, each box 82x27, gap 3)
  const iconPal = (accent) => ({ '1': T.borderHi, '2': T.bg, '3': accent })
  const kpiBoxes = [
    { x: 6,  y: 86,  icon: 'file',  ic: T.green,  val: fmtInt(data.filesChanged) },
    { x: 92, y: 86,  icon: 'term',  ic: T.accent, val: fmtInt(data.commands) },
    { x: 6,  y: 116, icon: 'turn',  ic: T.gold,   val: `${fmtInt(data.sessions)} / ${fmtInt(data.turns)}` },
    { x: 92, y: 116, icon: 'coin',  ic: T.gold,   val: fmtMoney(data.cost) },
    { x: 6,  y: 146, icon: 'cache', ic: T.green,  val: pctInt(data.cacheReadTokens, data.promptTokens) },
    { x: 92, y: 146, icon: 'clock', ic: T.red,    val: fmtHour(data.busiestHour) },
  ]
  for (let i = 0; i < kpiBoxes.length; i++) {
    const b = kpiBoxes[i]
    pxFrame(p, b.x, b.y, 82, 27, T, T.panel)
    drawSprite(p, ICONS_8[b.icon], b.x + 4, b.y + 3, iconPal(b.ic), 1)
    const vx = b.x + 4
    const vy = b.y + 12
    if (i === 0 && (data.linesAdded > 0 || data.linesDeleted > 0)) {
      const vw = drawPixelText(p, b.val, vx, vy, T.text, 1, T.shadow)
      const addStr = '+' + fmtInt(data.linesAdded)
      const delStr = '-' + fmtInt(data.linesDeleted)
      const ax = vx + vw + 4
      if (ax + measurePixelText(addStr + ' ' + delStr, 1) < b.x + 79) {
        const aw = drawPixelText(p, addStr, ax, vy, T.green, 1, T.shadow)
        drawPixelText(p, delStr, ax + aw + 3, vy, T.red, 1, T.shadow)
      } else if (ax + measurePixelText(addStr, 1) < b.x + 79) {
        drawPixelText(p, addStr, ax, vy, T.green, 1, T.shadow)
      }
    } else {
      const vc = i === 3 ? T.gold : i === 4 ? T.green : i === 5 ? T.accent : T.text
      drawPixelText(p, b.val, vx, vy, vc, 1, T.shadow)
    }
  }

  // 5. Pixel Bar Chart Panel (y = 177..226, h = 49)
  pxFrame(p, 6, 177, 168, 49, T, T.panel)
  // Baseline at y = 213, ticks at y = 215..221 (well inside bottom border at 225)
  pxRect(p, 12, 213, 156, 1, T.border)
  for (let gx = 12; gx < 168; gx += 3) {
    pxRect(p, gx, 198, 1, 1, T.barOff)
    pxRect(p, gx, 206, 1, 1, T.barOff)
  }

  if (range === 'today') {
    const hours = Array.isArray(data.hours) && data.hours.length === 24 ? data.hours : new Array(24).fill(0)
    const maxH = Math.max(...hours, 1)
    const peakLabel = data.busiestHour >= 0 ? `PEAK ${fmtHour(data.busiestHour)}` : 'IDLE'
    drawPixelText(p, peakLabel, 170 - measurePixelText(peakLabel, 1), 180, T.gold, 1, T.shadow)

    // 6 bricks * 3px = 18px (y = 194..211), leaving 5px clear gap below PEAK header (y=180..187)
    for (let h = 0; h < 24; h++) {
      const bx = 18 + h * 6
      const val = hours[h] || 0
      const isPeakBar = val > 0 && h === data.busiestHour
      const bricks = val > 0 ? Math.max(1, Math.round((val / maxH) * 6)) : 0
      for (let slot = 0; slot < 6; slot++) {
        pxRect(p, bx, 210 - slot * 3, 4, 2, T.barOff)
      }
      for (let slot = 0; slot < bricks; slot++) {
        const col = isPeakBar ? T.barPeak : (slot >= 4 ? T.green : T.barFill)
        pxRect(p, bx, 210 - slot * 3, 4, 2, col)
      }
      if (isPeakBar) {
        const topY = 210 - bricks * 3
        pxRect(p, bx + 1, topY, 2, 1, T.gold)
        pxRect(p, bx, topY - 1, 4, 1, T.gold)
      }
    }
    const ticks = [[0, '00'], [6, '06'], [12, '12'], [18, '18'], [23, '23']]
    for (const [hr, lbl] of ticks) {
      const tx = 18 + hr * 6 - 3
      drawPixelText(p, lbl, Math.max(11, Math.min(156, tx)), 215, T.muted, 1)
    }
  } else {
    const wdays = Array.isArray(report.weekDays) ? report.weekDays : []
    const maxA = Math.max(...wdays.map(d => d.actions || 0), 1)
    let peakIdx = -1, peakVal = 0
    for (let i = 0; i < wdays.length; i++) {
      if ((wdays[i].actions || 0) > peakVal) { peakVal = wdays[i].actions; peakIdx = i }
    }
    const peakLabel = peakIdx >= 0 ? `PEAK ${wdays[peakIdx].date.slice(5)}` : 'IDLE'
    drawPixelText(p, peakLabel, 170 - measurePixelText(peakLabel, 1), 180, T.gold, 1, T.shadow)

    for (let i = 0; i < Math.min(7, wdays.length); i++) {
      const d = wdays[i]
      const bx = 18 + i * 21
      const val = d.actions || 0
      const isPeakBar = i === peakIdx && val > 0
      const bricks = val > 0 ? Math.max(1, Math.round((val / maxA) * 6)) : 0
      for (let slot = 0; slot < 6; slot++) {
        pxRect(p, bx, 210 - slot * 3, 14, 2, T.barOff)
      }
      for (let slot = 0; slot < bricks; slot++) {
        const col = isPeakBar ? T.barPeak : (slot >= 4 ? T.green : T.barFill)
        pxRect(p, bx, 210 - slot * 3, 14, 2, col)
      }
      if (isPeakBar) {
        const topY = 210 - bricks * 3
        pxRect(p, bx + 5, topY, 4, 1, T.gold)
      }
      // 2-digit day of month (e.g. "13".."19") = 11px wide under 14px bar, zero overlap!
      const dayNum = d.date.slice(8, 10)
      const dw = measurePixelText(dayNum, 1)
      drawPixelText(p, dayNum, bx + Math.floor((14 - dw) / 2), 215, isPeakBar ? T.gold : T.muted, 1)
    }
  }

  // 6. Token Mix HP/MP Panel (y = 230..253, h = 23)
  pxFrame(p, 6, 230, 168, 23, T, T.panel)
  const tokTotalStr = fmtTokens(data.totalTokens) + ' TOKENS'
  drawPixelText(p, tokTotalStr, 170 - measurePixelText(tokTotalStr, 1), 233, T.accent, 1, T.shadow)

  const barX = 12, barY = 242, barW = 156, barH = 4
  pxRect(p, barX, barY, barW, barH, T.barOff)
  const totalTok = Math.max(0, data.totalTokens || 0)
  const hitTok = Math.max(0, data.cacheReadTokens || 0)
  const outTok = Math.max(0, data.outputTokens || 0)
  const missTok = Math.max(0, totalTok - hitTok - outTok)
  if (totalTok > 0) {
    const wHit = Math.round((hitTok / totalTok) * barW)
    const wMiss = Math.round((missTok / totalTok) * barW)
    const wOut = Math.max(0, barW - wHit - wMiss)
    if (wHit > 0) pxRect(p, barX, barY, wHit, barH, T.green)
    if (wMiss > 0) pxRect(p, barX + wHit, barY, wMiss, barH, T.accent)
    if (wOut > 0) pxRect(p, barX + wHit + wMiss, barY, wOut, barH, T.gold)
    for (let nx = barX + 6; nx < barX + barW; nx += 6) {
      pxRect(p, nx, barY, 1, barH, T.shadow)
    }
  }
  pxRect(p, 12, 248, 3, 3, T.green)
  pxRect(p, 66, 248, 3, 3, T.accent)
  pxRect(p, 126, 248, 3, 3, T.gold)

  // 7. Footer Watermark Bar (y = 257..268)
  pxRect(p, 6, 257, 168, 1, T.border)
  drawSprite(p, MINI_WHALE, 8, 260, { B: T.whaleBody, W: T.whaleBelly, E: T.whaleEye, S: T.spout }, 1)

  // ─────── Blit upscaled pixel art (nearest-neighbour, crisp!) ───────
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(low, 0, 0, CARD_W, CARD_H)

  // ─────── Pass 2: High-res sharp CJK & metadata typography ───────
  drawCJK(ctx, tr('cardTitle'), 10 * PX, 19.2 * PX, {
    size: 40, weight: 900, color: T.text, shadow: T.shadow, shadowOffset: 3, maxWidth: 420,
  })
  const wsLabel = hideNames ? '' : (data.workspace || '')
  if (wsLabel) {
    drawCJK(ctx, wsLabel, 170 * PX, 9.5 * PX, {
      size: 22, weight: 700, align: 'right', color: T.accent, shadow: T.shadow, shadowOffset: 2, maxWidth: 320,
    })
  } else if (hideNames) {
    drawCJK(ctx, tr('hiddenWorkspace'), 170 * PX, 9.5 * PX, {
      size: 18, weight: 700, align: 'right', color: T.muted, shadow: T.shadow, shadowOffset: 2, maxWidth: 320,
    })
  }

  const titleStr = isZh ? rank.titleZh : rank.titleEn
  const subStr = isZh ? rank.subZh : rank.subEn
  drawCJK(ctx, titleStr, 60 * PX, 48.5 * PX, {
    size: 42, weight: 900, color: T.gold, shadow: T.shadow, shadowOffset: 3, maxWidth: 465,
  })
  drawCJK(ctx, subStr, 60 * PX, 59.5 * PX, {
    size: 22, weight: 600, color: T.text, shadow: T.shadow, shadowOffset: 2, maxWidth: 465,
  })

  const streakText = tr('streakTag', { n: report.streakDays || 0 })
  const longestText = tr('longestTag', { n: data.longestSession?.turns || 0 })
  drawCJK(ctx, streakText, 64 * PX, 70.5 * PX, {
    size: 20, weight: 700, color: T.green, shadow: T.shadow, shadowOffset: 2, maxWidth: 220,
  })
  drawCJK(ctx, longestText, 106 * PX, 70.5 * PX, {
    size: 20, weight: 700, color: T.gold, shadow: T.shadow, shadowOffset: 2, maxWidth: 205,
  })

  const fileSub = !hideNames && data.mostEditedFile
    ? tr('mostEdited', { name: data.mostEditedFile.name, n: data.mostEditedFile.edits })
    : (data.filesChanged > 0 ? tr('totalEdits', { n: data.filesChanged }) : tr('noFileEdits'))
  const cmdSub = data.topTool
    ? tr('toolSub', { n: fmtInt(data.toolCalls), tool: data.topTool.name })
    : tr('toolSubPlain', { n: fmtInt(data.toolCalls) })
  const sessSub = tr('sessSub', { req: fmtInt(data.requests), dur: fmtDuration(data.activeMs) })
  const costSub = tr('costSub', { tok: fmtTokens(data.totalTokens) })
  const cacheSub = data.cacheReadTokens > 0
    ? tr('cacheSub', { hit: fmtTokens(data.cacheReadTokens), saved: fmtMoney(data.saved) })
    : tr('cacheSubZero')
  const peakSub = data.busiestHour >= 0
    ? tr('peakSub', { n: fmtInt(data.busiestHourCount || 0) })
    : tr('peakSubNone')

  const kpiText = [
    { x: 6,  y: 86,  title: tr('kpiFiles'),    sub: fileSub },
    { x: 92, y: 86,  title: tr('kpiCommands'), sub: cmdSub },
    { x: 6,  y: 116, title: tr('kpiSessions'), sub: sessSub },
    { x: 92, y: 116, title: tr('kpiCost'),     sub: costSub },
    { x: 6,  y: 146, title: tr('kpiCache'),    sub: cacheSub },
    { x: 92, y: 146, title: tr('kpiPeak'),     sub: peakSub },
  ]
  for (const k of kpiText) {
    drawCJK(ctx, k.title, (k.x + 14) * PX, (k.y + 3.5) * PX, {
      size: 24, weight: 800, color: T.muted, shadow: T.shadow, shadowOffset: 2, maxWidth: 385,
    })
    drawCJK(ctx, k.sub, (k.x + 4) * PX, (k.y + 21.3) * PX, {
      size: 18, weight: 600, color: T.muted, maxWidth: 445,
    })
  }

  drawCJK(ctx, range === 'week' ? tr('chartTitleWeek') : tr('chartTitleDay'), 12 * PX, 180.0 * PX, {
    size: 24, weight: 800, color: T.text, shadow: T.shadow, shadowOffset: 2, maxWidth: 520,
  })

  drawCJK(ctx, tr('tokenTitle'), 12 * PX, 232.5 * PX, {
    size: 23, weight: 800, color: T.text, shadow: T.shadow, shadowOffset: 2, maxWidth: 360,
  })
  drawCJK(ctx, tr('legHit', { p: pctInt(hitTok, totalTok) }), 16.5 * PX, 247.2 * PX, {
    size: 18, weight: 700, color: T.green, maxWidth: 280,
  })
  drawCJK(ctx, tr('legMiss', { p: pctInt(missTok, totalTok) }), 70.5 * PX, 247.2 * PX, {
    size: 18, weight: 700, color: T.accent, maxWidth: 310,
  })
  drawCJK(ctx, tr('legOut', { p: pctInt(outTok, totalTok) }), 130.5 * PX, 247.2 * PX, {
    size: 18, weight: 700, color: T.gold, maxWidth: 220,
  })

  drawCJK(ctx, tr('watermarkLeft'), 19.5 * PX, 259.8 * PX, {
    size: 22, weight: 800, color: T.text, shadow: T.shadow, shadowOffset: 2, maxWidth: 420,
  })
  ctx.font = '700 18px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'top'
  ctx.fillStyle = T.muted
  ctx.fillText('dsh plugin add github:qinghuidaqzp/dsh-pixel-report', 173 * PX, 261.2 * PX)
}

/* ───────────────────────── DOM helpers ───────────────────────── */
function el(tag, attrs, ...kids) {
  const node = document.createElement(tag)
  if (attrs) for (const k in attrs) {
    const v = attrs[k]
    if (v == null || v === false) continue
    if (k === 'class') node.className = v
    else if (k === 'style') node.setAttribute('style', v)
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v)
    else node.setAttribute(k, v === true ? '' : v)
  }
  for (const kid of kids.flat()) {
    if (kid != null && kid !== false) node.append(kid instanceof Node ? kid : document.createTextNode(String(kid)))
  }
  return node
}

/** Unwrap a remote call result: dsh returns { ok, value } or the value itself. */
async function call(fn) {
  const r = await fn()
  if (r && typeof r === 'object' && 'ok' in r && ('value' in r || 'error' in r)) {
    if (!r.ok) throw new Error(r.error?.message || String(r.error?.code || 'error'))
    return r.value
  }
  return r
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('toBlob returned null'))), 'image/png')
  })
}

/* ───────────────────────── interactive view ───────────────────────── */
function mountReport(root, getService) {
  let alive = true
  let timer = null
  let report = null
  let lastKey = ''
  let range = 'today'
  let theme = 'midnight'
  let hideOverride = null // null = follow host config, boolean = user toggle
  let toastTimer = null
  let resetArmed = null

  const canvas = el('canvas', { width: CARD_W, height: CARD_H })
  const stage = el('div', { class: 'pxr-stage' }, canvas)
  const toastEl = el('div', { class: 'pxr-toast', style: 'display:none' })
  const hintEl = el('p', { class: 'pxr-hint', style: 'display:none' })
  const errorEl = el('div', { class: 'pxr-error', style: 'display:none' })
  const priceEl = el('p')

  const showToast = (msg, warn) => {
    if (toastTimer) clearTimeout(toastTimer)
    toastEl.textContent = msg
    toastEl.className = 'pxr-toast' + (warn ? ' warn' : '')
    toastEl.style.display = 'block'
    toastTimer = setTimeout(() => { toastEl.style.display = 'none' }, 2600)
  }

  const btnToday = el('button', { type: 'button', class: 'on', onclick: () => { range = 'today'; syncControls(); redraw() } }, tr('today'))
  const btnWeek = el('button', { type: 'button', onclick: () => { range = 'week'; syncControls(); redraw() } }, tr('week'))

  const themeBtns = [
    ['midnight', tr('themeMidnight'), THEMES.midnight.swatch],
    ['gameboy', tr('themeGameboy'), THEMES.gameboy.swatch],
    ['arcade', tr('themeArcade'), THEMES.arcade.swatch],
  ].map(([id, label, color]) => el('button', {
    type: 'button',
    class: 'pxr-swatch' + (theme === id ? ' on' : ''),
    'data-theme': id,
    onclick: () => { theme = id; syncControls(); redraw() },
  }, el('i', { style: `background:${color}` }), label))

  const hideCheck = el('input', {
    type: 'checkbox',
    onchange: () => { hideOverride = hideCheck.checked; redraw() },
  })
  const hideWrap = el('label', { class: 'pxr-check' }, hideCheck, tr('hideNames'))

  const downloadBtn = el('button', {
    type: 'button',
    class: 'pxr-btn primary',
    onclick: async () => {
      if (!report) return
      try {
        const blob = await canvasToBlob(canvas)
        const url = URL.createObjectURL(blob)
        const d = (range === 'week' ? report.week : report.today).endDate
        const a = el('a', { href: url, download: `pixel-report-${range}-${d}.png` })
        document.body.append(a)
        a.click()
        a.remove()
        setTimeout(() => URL.revokeObjectURL(url), 5000)
        showToast(tr('downloaded'), false)
      } catch (err) {
        showToast(err?.message || String(err), true)
      }
    },
  }, tr('download'))

  const copyBtn = el('button', {
    type: 'button',
    class: 'pxr-btn',
    onclick: async () => {
      if (!report) return
      if (!navigator.clipboard || typeof navigator.clipboard.write !== 'function' || typeof ClipboardItem === 'undefined') {
        showToast(tr('copyUnsupported'), true)
        return
      }
      try {
        const blob = await canvasToBlob(canvas)
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
        showToast(tr('copied'), false)
      } catch {
        showToast(tr('copyUnsupported'), true)
      }
    },
  }, tr('copy'))

  const refreshBtn = el('button', { type: 'button', class: 'pxr-btn small', onclick: () => load(true) }, tr('refresh'))
  const resetBtn = el('button', {
    type: 'button',
    class: 'pxr-btn small',
    onclick: async () => {
      if (resetArmed) {
        clearTimeout(resetArmed); resetArmed = null
        resetBtn.textContent = tr('reset'); resetBtn.classList.remove('armed')
        const svc = getService()
        if (!svc) return
        try { await call(() => svc.reset()); load(true) } catch (err) { showError(tr('loadFailed', { msg: err?.message || String(err) })) }
        return
      }
      resetBtn.textContent = tr('resetConfirm')
      resetBtn.classList.add('armed')
      resetArmed = setTimeout(() => {
        resetArmed = null
        resetBtn.textContent = tr('reset')
        resetBtn.classList.remove('armed')
      }, 3000)
    },
  }, tr('reset'))

  const syncControls = () => {
    btnToday.className = range === 'today' ? 'on' : ''
    btnWeek.className = range === 'week' ? 'on' : ''
    for (const b of themeBtns) b.className = 'pxr-swatch' + (b.dataset.theme === theme ? ' on' : '')
  }

  const showError = (msg) => {
    errorEl.textContent = msg
    errorEl.style.display = 'block'
  }
  const clearError = () => { errorEl.style.display = 'none' }

  const redraw = () => {
    if (!report) return
    const effectiveHide = hideOverride !== null ? hideOverride : Boolean(report.hideNames)
    hideCheck.checked = effectiveHide
    renderBattleCard(canvas, report, { range, theme, hideNames: effectiveHide })
    const cur = range === 'week' ? report.week : report.today
    const empty = cur.requests === 0 && cur.toolCalls === 0 && cur.turns === 0
    hintEl.textContent = tr('emptyHint')
    hintEl.style.display = empty ? 'block' : 'none'

    const p = report.prices
    const rows = p.rows.map(x => tr('priceRow', { label: x.label, hit: x.hit, miss: x.miss })).join('；')
    priceEl.textContent = p.custom
      ? tr('priceCustom', { rows })
      : tr('priceNote', { date: p.checked, rows, now: p.peakNow ? tr('peak') : tr('offPeak') })
  }

  root.replaceChildren(
    el('div', { class: 'pxr-bar' },
      el('div', { class: 'pxr-seg' }, btnToday, btnWeek),
      el('div', { class: 'pxr-themes' }, themeBtns),
    ),
    el('div', { class: 'pxr-actions' }, downloadBtn, copyBtn),
    toastEl,
    el('div', { class: 'pxr-opts' }, hideWrap),
    errorEl,
    hintEl,
    stage,
    el('footer', { class: 'pxr-foot' }, priceEl, el('div', { class: 'pxr-foot-row' }, refreshBtn, resetBtn)),
  )

  const load = async (force) => {
    if (!alive) return
    const svc = getService()
    if (!svc) { showError(tr('noHost')); lastKey = ''; return }
    if (!force && document.hidden) return
    try {
      const r = await call(() => svc.getReport())
      if (!alive) return
      clearError()
      const key = r.revision + '|' + lang() + '|' + r.prices.peakNow + '|' + r.today.endDate + '|' + r.hideNames
      report = r
      if (key !== lastKey || force) {
        lastKey = key
        redraw()
      }
    } catch (err) {
      if (alive) { showError(tr('loadFailed', { msg: err?.message || String(err) })); lastKey = '' }
    }
  }

  load(true)
  timer = setInterval(() => load(false), 4000)
  const onVisible = () => { if (!document.hidden) load(false) }
  document.addEventListener('visibilitychange', onVisible)

  return {
    destroy() {
      alive = false
      clearInterval(timer)
      if (toastTimer) clearTimeout(toastTimer)
      if (resetArmed) clearTimeout(resetArmed)
      document.removeEventListener('visibilitychange', onVisible)
    },
  }
}

/* ───────────────────────── registration ───────────────────────── */
var REPORT_CODEC = {
  mode: 'strict',
  typeSymbol: 'dsh-pixel-report#PixelReport',
  schema: { parse: checkReport },
  create: () => ({ parse: checkReport }),
}
function checkReport(v) {
  if (!v || typeof v !== 'object' || typeof v.revision !== 'number' || !v.today || !v.week || !Array.isArray(v.weekDays)) {
    throw new TypeError('pixel report: malformed report')
  }
  return v
}
var REMOTE_CONTRIBUTION = {
  package: 'dsh-pixel-report',
  descriptors: ['getReport', 'reset'].map(method => ({
    id: 'dsh-pixel-report#pixelReport/' + method,
    service: 'pixelReport',
    namespace: 'pixelReport',
    method,
    invocation: { kind: 'direct' },
    parameters: [],
    result: REPORT_CODEC,
  })),
}

window.__ModuleLoader__.load({
  id: 'dsh-pixel-report',
  factory(require) {
    const React = require('react')
    let getService = () => null

    function PixelReportTab() {
      const ref = React.useRef(null)
      React.useEffect(() => {
        if (!ref.current) return undefined
        const view = mountReport(ref.current, () => getService())
        return () => view.destroy()
      }, [])
      return React.createElement('div', { ref, className: 'pxr' })
    }

    return {
      inject: ['slots', 'locale', 'sidebarRightTabs', 'remote'],
      apply(ctx) {
        const step = (label, fn) => { try { return fn() } catch (err) { console.error(`[dsh-pixel-report] ${label} failed`, err); throw err } }
        step('styles', () => ctx.effect(() => {
          const node = document.createElement('style')
          node.dataset.dshPixelReport = ''
          node.textContent = CSS
          document.head.append(node)
          return () => node.remove()
        }))
        let mounted = false
        const remote = ctx.remote
        if (remote && typeof remote.$mount === 'function') {
          Promise.resolve(remote.$mount(REMOTE_CONTRIBUTION)).then(off => {
            mounted = true
            ctx.effect(() => () => { mounted = false; if (typeof off === 'function') off() }, 'dsh-pixel-report: remote contribution')
          }).catch(err => console.error('[dsh-pixel-report] remote mount failed', err))
        }
        getService = () => {
          try { return ctx.get('remote.pixelReport') ?? (mounted ? ctx.remote?.pixelReport : null) ?? null } catch { return null }
        }
        step('locale', () => ctx.effect(() => ctx.locale.register(LOCALE_NS, LOCALE)))
        step('tab type', () => ctx.effect(() => ctx.sidebarRightTabs.register({
          id: 'dsh-pixel-report',
          kind: 'pixel-report',
          title: () => tr('title'),
          guide: [{ id: 'pixel-report', order: 63, title: () => tr('title'), description: () => tr('guide') }],
        }), 'dsh-pixel-report: tab type'))
        step('tab body', () => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register(
          { name: 'sidebar.right.pane.tab', key: 'dsh-pixel-report', locale: LOCALE_NS },
          PixelReportTab,
        )))
        ctx.effect(() => () => { getService = () => null })
      },
    }
  },
})

})();
