// AI公众号信息源引擎：翻页扫描（首词深翻5页/后续2页、重复率>70%换词、75%目标即停）→ 清洗去重 → 聚类 → HTML 日报。
// 与 bili-ai-feed 同构；差异：queryAiMsgs 接口无日期参数（全库热门），爆款口径 = 互动总量（接口不返回 readCount）。
import { fetchPage, DEFAULT_KEYWORDS, PAGE_SIZE, PAGES_PER_KEYWORD, resolveApiKey, resolveApiBase, SOURCE_LABEL } from './redfox.js'
import { resolveDisplayDate } from './dates.js'
import { normalizeArticle, dedupeArticles, sortByEngagement } from './normalize.js'
import { clusterArticles } from './cluster.js'
import { formatDigestHtml } from './report.js'

export function feedOpts({ settings = {}, config = {} } = {}) {
  return {
    apiKey: resolveApiKey({ settings, config }),
    apiBase: resolveApiBase({ settings }),
    proxyUrl: config?.proxyUrl || settings.proxy_url || '',
  }
}

// 关键词列表：默认 6 词；自定义只用用户列表
export function buildKeywords(keywordsArg) {
  const list = String(keywordsArg || '').split(/[,，]/).map((k) => k.trim()).filter(Boolean)
  if (!list.length) return [...DEFAULT_KEYWORDS]
  return list
}

/**
 * 翻页扫描（上游 fetch_articles 策略）：
 * - 首关键词深翻 PAGES_PER_KEYWORD 页，后续关键词浅查 2 页
 * - 当前页重复率 >70%（新增 <30%）换下一个关键词
 * - 达到目标 75% 即跳过剩余关键词；页间 0.5s 礼貌间隔
 */
export async function scanArticles({ keywords, count = 200, apiKey, apiBase, proxyUrl = '', pageSize = PAGE_SIZE } = {}) {
  const articles = []
  const seen = new Set()
  const pages = []
  for (let i = 0; i < keywords.length; i++) {
    if (articles.length >= count) break
    const kw = keywords[i]
    const maxPages = i === 0 ? PAGES_PER_KEYWORD : 2
    for (let page = 1; page <= maxPages; page++) {
      if (articles.length >= count) break
      const batch = await fetchPage({ keyword: kw, pageNum: page, apiKey, apiBase, proxyUrl, pageSize })
      pages.push({ keyword: kw, page, items: batch.length })
      if (!batch.length) break
      let newCount = 0
      for (const item of batch) {
        const article = normalizeArticle(item)
        if (article.photo_id && !seen.has(article.photo_id)) {
          seen.add(article.photo_id)
          articles.push(article)
          newCount++
        }
      }
      if (batch.length > 0 && newCount / batch.length < 0.3) break // 重复率过高换词
      if (page < maxPages) await new Promise((r) => setTimeout(r, 500))
    }
    if (articles.length >= count * 0.75) break
  }
  return { articles, pages }
}

/**
 * 生成日报（同步）。接口无日期过滤：抓全库热门，date 仅作标注归档。
 * @returns {{ date, date_note, keywords, articles, clusters, pages, fetched_at }}
 */
export async function fetchFeed({ date, keywords: keywordsArg, count = 200, apiKey, apiBase, proxyUrl = '', now = new Date() } = {}) {
  if (!apiKey) throw new Error('未配置 RedFox API Key。请到面板「设置」页填入，或在插件配置/环境变量 REDFOX_API_KEY 里配置（获取：https://redfox.hk/settings/api-keys?source=github）。')
  const resolved = resolveDisplayDate(date, now)
  const keywords = buildKeywords(keywordsArg)
  const { articles, pages } = await scanArticles({ keywords, count, apiKey, apiBase, proxyUrl })
  const sorted = sortByEngagement(dedupeArticles(articles), count)
  return {
    date: resolved.date,
    date_note: resolved.note,
    requested_date: date || resolved.date,
    keywords,
    articles: sorted,
    clusters: clusterArticles(sorted),
    pages,
    fetched_at: new Date().toISOString(),
  }
}

export { SOURCE_LABEL, formatDigestHtml }
