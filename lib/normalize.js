// 条目清洗：公众号文章字段统一（url 接口直给、readCount 接口缺失→互动总量口径、http 封面升级 https）。
const pad = (n) => String(n).padStart(2, '0')

export function formatNumber(n) {
  const num = Number(n) || 0
  if (num >= 10000) return `${(num / 10000).toFixed(1)}w`
  if (num >= 1000) return `${(num / 1000).toFixed(1)}k`
  return String(num)
}

function httpsUrl(u) {
  const s = String(u || '').trim()
  return /^https?:\/\//.test(s) ? s.replace(/^http:\/\//, 'https://') : ''
}

export function normalizeArticle(item = {}) {
  const photoId = String(item.photoId || '').trim()
  const like = Number(item.likeCount) || 0
  const comment = Number(item.commentCount) || 0
  const share = Number(item.shareCount) || 0
  // 上游按 readCount 筛爆款，但接口实测不返回该字段——以互动总量为爆款口径（若接口未来返回 read 则优先）
  const read = Number(item.readCount) || 0
  const gmt = String(item.gmtCreate ?? '') || ''
  return {
    photo_id: photoId,
    url: String(item.url || '').trim() || '',
    title: String(item.title || '').trim() || '无标题',
    author: String(item.userName || '').trim() || '未知公众号',
    author_id: String(item.authorId || '').trim(),
    avatar_url: httpsUrl(item.userHeadUrl),
    cover_url: httpsUrl(item.coverUrl),
    read_count: read,
    like_count: like,
    comment_count: comment,
    share_count: share,
    engagement_num: read || (like + comment + share),
    type: String(item.type ?? '').trim(),
    topic: String(item.topic ?? '').trim(),
    published_at: gmt,
    published_date: /^\d{4}-\d{2}-\d{2}/.test(gmt) ? gmt.slice(0, 10) : '',
  }
}

export function dedupeArticles(articles) {
  const seen = new Set()
  return articles.filter((a) => {
    if (!a.photo_id || seen.has(a.photo_id)) return false
    seen.add(a.photo_id)
    return true
  })
}

export function sortByEngagement(articles, topN = 200) {
  return [...articles].sort((a, b) => b.engagement_num - a.engagement_num).slice(0, topN)
}
