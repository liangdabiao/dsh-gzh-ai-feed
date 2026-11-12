// AI公众号信息源 · 数据层。
//   $DSH_HOME/gzh-ai-feed/
//   ├── settings.json        api_key / api_base(测试用) / proxy_url
//   ├── feeds/index.json     日报索引（新→旧）
//   └── feeds/<id>/
//       ├── meta.json        日期/关键词/统计/聚类概览
//       ├── raw.json         articles + clusters
//       └── report.html      深色主题 HTML 日报
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, normalize } from 'node:path'

export const DATA_DIR = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'gzh-ai-feed')
const FEEDS_DIR = join(DATA_DIR, 'feeds')
const INDEX_FILE = join(FEEDS_DIR, 'index.json')
const SETTINGS_FILE = join(DATA_DIR, 'settings.json')

const nowIso = () => new Date().toISOString()

function readJson(file, fallback = null) {
  if (!existsSync(file)) return fallback
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

function writeJson(file, value) {
  mkdirSync(FEEDS_DIR, { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', 'utf8')
  renameSync(tmp, file)
}

function writeFile(file, content) {
  mkdirSync(FEEDS_DIR, { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, String(content ?? ''), 'utf8')
  renameSync(tmp, file)
  return file
}

// ── 设置 ───────────────────────────────────────────────────────────────
export function getSettings() {
  return readJson(SETTINGS_FILE, {}) || {}
}

export function saveSettings(patch) {
  const next = { ...getSettings(), ...patch, updated_at: nowIso() }
  writeJson(SETTINGS_FILE, next)
  return next
}

// ── 日报记录 ───────────────────────────────────────────────────────────
function feedDir(id) {
  const safe = String(id).replace(/[^\p{L}\p{N}_-]+/gu, '')
  if (!safe || safe !== String(id)) throw new Error('非法日报 id')
  const dir = join(FEEDS_DIR, safe)
  if (normalize(dir) !== normalize(join(FEEDS_DIR, safe))) throw new Error('非法日报 id')
  return dir
}

export function createFeedId(dateStr) {
  const ts = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${dateStr}-${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}${String(ts.getMilliseconds()).padStart(3, '0')}`
}

export function publicMeta(meta) {
  return {
    feed_id: meta.feed_id,
    date: meta.date,
    keywords: meta.keywords || [],
    total: meta.total || 0,
    topic_count: meta.topic_count || 0,
    categories: meta.categories || [],
    fetched_at: meta.fetched_at,
    has_report: existsSync(join(FEEDS_DIR, meta.feed_id, 'report.html')),
  }
}

export function saveFeed(data) {
  const id = createFeedId(data.date)
  const dir = feedDir(id)
  mkdirSync(dir, { recursive: true })
  writeJson(join(dir, 'raw.json'), { ...data, feed_id: id })
  const meta = {
    feed_id: id,
    date: data.date,
    keywords: data.keywords || [],
    total: data.articles?.length || 0,
    topic_count: data.clusters?.length || 0,
    categories: (data.clusters || []).slice(0, 12).map((c) => ({ category: c.category, count: c.count })),
    fetched_at: data.fetched_at,
  }
  writeJson(join(dir, 'meta.json'), meta)
  const index = getFeedIndex().filter((i) => i.feed_id !== id)
  index.unshift({ feed_id: id, date: meta.date, fetched_at: meta.fetched_at })
  writeJson(INDEX_FILE, index.slice(0, 200))
  return meta
}

export function getMeta(feedId) {
  return readJson(join(feedDir(feedId), 'meta.json'))
}

export function getRaw(feedId) {
  return readJson(join(feedDir(feedId), 'raw.json'))
}

function getFeedIndex() {
  return readJson(INDEX_FILE, []) || []
}

export function listFeeds({ limit = 50 } = {}) {
  const index = getFeedIndex()
  const out = []
  for (const item of index.slice(0, limit)) {
    const meta = getMeta(item.feed_id)
    if (meta) out.push(publicMeta(meta))
  }
  return out
}

export function resolveFeed(feedId) {
  if (feedId) {
    const meta = getMeta(feedId)
    if (!meta) throw new Error(`日报记录不存在：${feedId}。用 list 查看已有日报。`)
    return meta
  }
  const [latest] = listFeeds({ limit: 1 })
  if (!latest) throw new Error('还没有日报记录。先 fetch。')
  return getMeta(latest.feed_id)
}

export function saveReportHtml(feedId, html) {
  return writeFile(join(feedDir(feedId), 'report.html'), html)
}

export function readReportHtml(feedId) {
  const file = join(feedDir(feedId), 'report.html')
  return existsSync(file) ? file : null
}

export function deleteFeed(feedId) {
  const dir = feedDir(feedId)
  if (!existsSync(dir)) return { ok: false, error: `日报记录不存在: ${feedId}` }
  rmSync(dir, { recursive: true, force: true })
  writeJson(INDEX_FILE, getFeedIndex().filter((i) => i.feed_id !== feedId))
  return { ok: true }
}
