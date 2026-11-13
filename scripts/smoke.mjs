// 冒烟测试（离线）：假 RedFox queryAiMsgs 分页服务器 + 工具直调全链路（翻页/换词/去重）+ 面板 API 全路由。
// 运行：npm run smoke
const { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } = await import('node:fs')
const { tmpdir } = await import('node:os')
const { join } = await import('node:path')
const http = await import('node:http')

const tmp = mkdtempSync(join(tmpdir(), 'dsh-gzh-smoke-'))
process.env.DSH_HOME = tmp
delete process.env.REDFOX_API_KEY
delete process.env.X_API_KEY

let failed = 0
const check = (name, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
  if (!cond) failed++
}

// ── 假 RedFox queryAiMsgs 分页服务器 ──
// AI 关键词 3 页（第3页重复率高触发换词）；自定义关键词 1 页；文章按互动量乱序
const A = (id, title, author, like, comment, share, type, topic, kw) => ({
  photoId: id, title, userName: author, authorId: 'u' + id.slice(-2),
  likeCount: like, commentCount: comment, shareCount: share,
  type, topic, url: `https://mp.weixin.qq.com/s/${id}`, coverUrl: 'https://mmbiz.qpic.cn/cover.jpg',
  gmtCreate: '2026-11-12 10:00:00',
})
// 每类 ≥3 条保证聚类成组
const DB = {
  AI: [
    A('g1', 'GPT-5.4 深夜发布解读', '科技早报', 52000, 8000, 3000, '#AI大模型,#AI热点', '#GPT #OpenAI'),
    ...Array.from({ length: 12 }, (_x, i) => A(`a${i}`, `大模型深度文章${i}`, 'AI前线', 9000 - i * 100, 400, 200, '#AI,#AI大模型', '')),
    A('g2', 'RAG 实战指南', '架构师之路', 31000, 1200, 500, '#AI,#RAG', '#RAG'),
    A('g3', 'Agent 框架对比', '开发者社区', 27000, 9000, 2000, '#AI,#Agent', '#Agent'),
    ...Array.from({ length: 6 }, (_x, i) => A(`b${i}`, `AI绘画教程${i}`, '设计小站', 8000 - i * 50, 300, 100, '#AI绘画', '')),
    ...Array.from({ length: 4 }, (_x, i) => A(`c${i}`, `AI热点快讯${i}`, '快讯号', 6000 - i * 100, 200, 80, '#AI热点', '')),
    A('g4', 'LangChain 入门', '开发者社区', 5000, 200, 100, '#AI,#RAG', '#LangChain'),
    A('g5', 'Agent 编排实战', '开发者社区', 4000, 150, 60, '#AI,#Agent', '#Agent'),
    A('g6', 'RAG 检索优化', '架构师之路', 3000, 100, 40, '#AI,#RAG', '#RAG'),
    A('dup1', '跨页重复文章1', 'AI前线', 2000, 80, 30, '#AI,#AI大模型', ''),
    A('dup2', '跨页重复文章2', 'AI前线', 1500, 60, 20, '#AI,#AI大模型', ''),
    ...Array.from({ length: 3 }, (_x, i) => A(`d${i}`, `无标签文章${i}`, '杂谈号', 800 - i * 50, 20, 5, '', '')),
  ],
}
const srv = http.createServer((req, res) => {
  let body = ''
  req.on('data', (c) => { body += c })
  req.on('end', () => {
    const reply = (obj) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)) }
    if (req.headers['x-api-key'] !== 'ak_smoke') return reply({ code: 3106, msg: 'bad key' })
    const payload = JSON.parse(body || '{}')
    const kw = payload.keyword
    const page = payload.pageNum || 1
    const list = DB[kw] || DB.AI // 未知关键词回退 AI 库（模拟模糊检索）
    // AI 第 3 页：整页重复（跨页重复数据），模拟重复率过高
    if (kw === 'AI' && page === 3) return reply({ code: 2000, data: { list: [A('dup1', '跨页重复文章1', 'AI前线', 2000, 80, 30, '#AI,#AI大模型', ''), A('dup2', '跨页重复文章2', 'AI前线', 1500, 60, 20, '#AI,#AI大模型', '')] } })
    if (kw === 'AI' && page === 2) return reply({ code: 2000, data: { list: [A('g7', '翻页文章7', 'AI前线', 12000, 500, 200, '#AI,#AI大模型', ''), A('g8', '翻页文章8', '开发者社区', 11000, 400, 150, '#AI,#Agent', ''), A('g9', '翻页文章9', '架构师之路', 10000, 300, 100, '#AI,#RAG', '')] } })
    const start = (page - 1) * 20
    return reply({ code: 2000, data: { list: list.slice(start, start + (payload.pageSize || 20)) } })
  })
})
await new Promise((r) => srv.listen(0, '127.0.0.1', r))
mkdirSync(join(tmp, 'gzh-ai-feed'), { recursive: true })
writeFileSync(join(tmp, 'gzh-ai-feed', 'settings.json'), JSON.stringify({ api_key: 'ak_smoke', api_base: `http://127.0.0.1:${srv.address().port}` }))

// ── 工具直调 ──
const { gzhFeedTool } = await import('../src/host.js')
const call = async (args) => {
  try { return await gzhFeedTool.execute(args, {}) } catch (e) { return { ok: false, summary: String(e?.message || e) } }
}
let fid
{
  const r = await call({ action: 'fetch', count: 200 })
  check('fetch 入库', r.ok && r.summary.includes('feedId='), r.summary.slice(0, 60))
  fid = r.summary.match(/feedId=([\p{L}\p{N}-]+)/u)?.[1]
  check('fetch 分类概览表', r.data.includes('### 分类概览') && r.data.includes('| 分类 | 数量 | 占比 |'), '')
  check('fetch 多分类聚类', (r.data.match(/^\*\*.+\*\*（/gm) || []).length >= 3, (r.data.match(/^\*\*.+\*\*（/gm) || []).length + ' 类')
  check('fetch 互动口径口径标注', r.data.includes('互动总量口径'), '')
  check('fetch 文章链接', r.data.includes('mp.weixin.qq.com/s/g1'), '')
  check('fetch 翻页去重', !r.data.includes('翻页文章7') || r.summary.includes('篇'), '') // 翻页文章应可出现（第2页有效数据）
  check('fetch 重复率换词', r.summary.includes('篇') && !r.summary.includes('0 篇'), '')
  check('fetch 页脚', (r.footer || '').includes('公众号爆款雷达') && (r.footer || '').includes(fid), (r.footer || '').slice(0, 80))
}
{
  const r = await call({ action: 'fetch', keywords: 'RAG,LangChain', count: 50 })
  check('自定义关键词', r.ok && r.summary.includes('feedId='), '')
  const r2 = await call({ action: 'fetch' })
  check('默认关键词含6词', r2.ok, '')
}
{
  const r = await call({ action: 'list' })
  check('list 日报列表', r.ok && r.data.split('\n').length >= 2, (r.data || '').split('\n')[0])
  const r2 = await call({ action: 'get', feedId: fid })
  check('get 补读文章', r2.ok && r2.data.includes('mp.weixin.qq.com'), '')
  const unknown = await call({ action: 'destroy' })
  check('未知 action 报错', !unknown.ok && unknown.summary.includes('只能是'), '')
  const badDate = await call({ action: 'fetch', date: '2026/11/01' })
  check('非法日期友好报错', !badDate.ok && badDate.summary.includes('yyyy-MM-dd'), '')
}

// ── 面板 API ──
const { registerApi } = await import('../lib/api.js')
const { Writable } = await import('node:stream')
const { EventEmitter } = await import('node:events')
const routes = {}
registerApi({ get: () => undefined, webServer: { register: (r) => { routes[r.path] = r.handler } } }, { config: {} })
const req = async (method, path, body) => {
  const reqObj = new EventEmitter()
  reqObj.method = method
  reqObj.url = `/gzh-ai-feed${path}`
  reqObj.headers = body ? { 'content-type': 'application/json', host: 'x', origin: 'http://x' } : { host: 'x' }
  const chunks = []
  const resObj = new Writable({ write(c, _e, cb) { chunks.push(c); cb() } })
  resObj.statusCode = 0
  resObj.writeHead = (code) => { resObj.statusCode = code }
  const done = new Promise((resolve) => {
    const origEnd = resObj.end.bind(resObj)
    resObj.end = (...args) => { origEnd(...args); resolve({ status: resObj.statusCode, json: (() => { try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { return null } })(), text: () => Buffer.concat(chunks).toString('utf8') }) }
  })
  const p = routes['/gzh-ai-feed'](reqObj, resObj)
  if (body) reqObj.emit('data', Buffer.from(JSON.stringify(body)))
  reqObj.emit('end')
  await p
  return done
}
{
  const cat = await req('GET', '/api/catalog')
  check('catalog：key/默认词/历史', cat.status === 200 && cat.json.has_key && cat.json.default_keywords.length === 6 && cat.json.display_date && cat.json.feeds.length >= 2, `feeds=${cat.json?.feeds?.length}`)
  const one = await req('GET', `/api/feeds/${fid}`)
  check('日报详情带 raw', one.status === 200 && one.json.raw?.clusters?.length >= 3, `clusters=${one.json?.raw?.clusters?.length}`)
  const rep = await req('GET', `/api/feeds/${fid}/report`)
  const html = rep.text ? rep.text() : ''
  check('HTML 日报关键元素', rep.status === 200 && html.includes('category-card') && html.includes('mmbiz.qpic.cn'), '')
  check('HTML 无占位残留', !html.includes('{{DATE}}') && !html.includes('{{CATEGORY_CARDS}}') && !html.includes('{{AVG_READS}}') && !html.includes('[object Object]') && !html.includes('>undefined<'), '')
  // 面板直查（POST 抓取路由必须覆盖——bili 教训）
  const panelFetch = await req('POST', '/api/feeds', { date: 'latest', keywords: 'AI', count: 50 })
  check('面板直查抓取+HTML落盘', panelFetch.status === 200 && panelFetch.json.ok && panelFetch.json.feed?.total >= 10, `status=${panelFetch.status} err=${panelFetch.json?.error || "-"} total=${panelFetch.json?.feed?.total}`)
  const del = await req('DELETE', `/api/feeds/${panelFetch.json.feed.feed_id}`)
  check('面板删记录', del.status === 200 && del.json.ok, '')
}
{
  const st = await req('GET', '/api/settings')
  check('settings GET 尾号', st.status === 200 && st.json.settings.has_key && st.json.settings.key_tail.length === 6, String(st.json.settings.key_tail))
  const bad = await req('POST', '/api/settings', { api_key: 'no-prefix' })
  check('settings 非 ak_ 拒绝', bad.status === 400, '')
}
{
  const idx = readFileSync(new URL('../lab/index.html', import.meta.url), 'utf8')
  check('lab 引用 scheme/app', idx.includes('app.js') && idx.includes('scheme.js'), '')
  const appjs = readFileSync(new URL('../lab/app.js', import.meta.url), 'utf8')
  check('lab 消息类型与 client 对齐', appjs.includes('gzh-ai-feed:refresh') && appjs.includes('gzh-ai-feed:start-ok'), '')
  const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  check('client 消息类型一致', client.includes('gzh-ai-feed:refresh') && client.includes('gzh-ai-feed:start-ok'), '')
  const skill = readFileSync(new URL('../skills/gzh-ai-feed/SKILL.md', import.meta.url), 'utf8')
  check('技能口径说明', skill.includes('互动总量') && skill.includes('无日期过滤'), '')
}

srv.close()
rmSync(tmp, { recursive: true, force: true })
console.log(failed ? `\n${failed} 项失败` : '\n全部通过')
process.exit(failed ? 1 : 0)
