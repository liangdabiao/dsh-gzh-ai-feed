// 智能聚类（移植自上游 cluster_articles 六步算法）：type+topic 标签分组 → 大组拆分 → 小组合并 → 标题关键词再拆 → 保底 5 类。
const STOP_WORDS = new Set('的了是在和与及或但对于从到被将把让给用有这那个也都还又不没就才能会要可以怎么什么为什么怎样如何哪些多少一个一些这些那些已经正在可能应该必须需要通过进行使用利用根据关于对于由于因为所以虽然但是然而因此所以如果那么只要只有无论不管即使不仅而且'.split(''))

// 过于宽泛的标签，聚类时跳过
const GENERIC_TAGS = new Set(['#AI', '#人工智能', '#ai', 'AI', '人工智能', '#科技', '#技术', '#人工智能应用', '#智能', '科技', '技术'])

export function extractKeywords(title) {
  if (!title) return []
  const cleaned = String(title).replace(/[^\u4e00-\u9fff\w]/g, ' ')
  const segments = cleaned.match(/[\u4e00-\u9fff]{2,4}/g) || []
  return segments.filter((s) => ![...s].every((c) => STOP_WORDS.has(c))).slice(0, 5)
}

export function getArticleTags(article) {
  const tags = []
  const atype = String(article.type || '').trim()
  if (atype) {
    for (const t of atype.split(/[,，]+/)) {
      const tag = t.trim()
      if (tag && !GENERIC_TAGS.has(tag)) tags.push(tag)
    }
  }
  const topic = String(article.topic || '').trim()
  if (topic) {
    for (const t of topic.split(/[,，\s]+/)) {
      const tag = t.trim()
      if (tag && !GENERIC_TAGS.has(tag) && !tags.includes(tag)) tags.push(tag)
    }
  }
  return tags
}

const sortedTop = (arts, n = 5) => [...arts].sort((a, b) => b.like_count - a.like_count).slice(0, n)

export function clusterArticles(articles) {
  const total = articles.length
  if (!total) return []

  // 第一步：首个有效标签分组
  const topicGroups = new Map()
  for (const article of articles) {
    const tags = getArticleTags(article)
    const key = tags.length ? tags[0] : '其他'
    if (!topicGroups.has(key)) topicGroups.set(key, [])
    topicGroups.get(key).push(article)
  }

  // 第二步：大组（>20% 或 >25 条）用第二标签拆分
  const splitThreshold = Math.max(total * 0.2, 25)
  for (const [topic, arts] of [...topicGroups.entries()]) {
    if (arts.length <= splitThreshold || topic === '其他') continue
    topicGroups.delete(topic)
    for (const article of arts) {
      const tags = getArticleTags(article)
      const key = tags.length >= 2 ? tags[1] : topic
      if (!topicGroups.has(key)) topicGroups.set(key, [])
      topicGroups.get(key).push(article)
    }
  }

  // 第三步：合并小组（< 3 篇），先用标签匹配已有大组
  const finalGroups = new Map()
  const smallArticles = []
  for (const [topic, arts] of topicGroups.entries()) {
    if (arts.length >= 3) finalGroups.set(topic, arts)
    else smallArticles.push(...arts)
  }
  const stillOrphan = []
  for (const article of smallArticles) {
    const tags = getArticleTags(article)
    const hit = tags.find((t) => finalGroups.has(t))
    if (hit) finalGroups.get(hit).push(article)
    else stillOrphan.push(article)
  }
  if (stillOrphan.length) {
    const key = '其他'
    if (!finalGroups.has(key)) finalGroups.set(key, [])
    finalGroups.get(key).push(...stillOrphan)
  }

  // 第四步：过大组（>30% 或 >40 条）用标题高频词拆分（最多 3 轮）
  const MAX_GROUP_SIZE = Math.max(total * 0.3, 40)
  for (let round = 0; round < 3; round++) {
    const oversized = [...finalGroups.entries()].filter(([t, a]) => a.length > MAX_GROUP_SIZE)
    if (!oversized.length) break
    for (const [topic, arts] of oversized) {
      const kwCounter = new Map()
      const articleKwMap = new Map()
      for (const article of arts) {
        const kws = extractKeywords(article.title)
        articleKwMap.set(article, kws)
        for (const kw of kws) kwCounter.set(kw, (kwCounter.get(kw) || 0) + 1)
      }
      const commonKws = [...kwCounter.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .filter(([kw, cnt]) => cnt >= 5 && !topic.includes(kw)
          && !GENERIC_TAGS.has(`#${kw}`)
          && !['人工智能', '智能', '模型', '技术', '应用'].includes(kw))
        .map(([kw]) => kw)
      if (!commonKws.length) continue
      const splitKw = commonKws[0]
      const newGroup = []
      const remaining = []
      for (const article of arts) {
        (articleKwMap.get(article) || []).includes(splitKw) ? newGroup.push(article) : remaining.push(article)
      }
      if (newGroup.length >= 5) {
        finalGroups.set(`#${splitKw}`, newGroup)
        finalGroups.set(topic, remaining)
      }
    }
  }

  // 第五步：保底至少 5 个分类（对最大组用第二标签拆）
  // 防死循环：两组互斥标签时会互相搬空（上游 Python 同款隐患）——空组直接删除 + 轮数上限
  let splitGuard = 0
  while (finalGroups.size < 5 && finalGroups.size && splitGuard++ < 10) {
    const largestTopic = [...finalGroups.entries()].sort((a, b) => b[1].length - a[1].length)[0][0]
    const largestArts = finalGroups.get(largestTopic)
    if (largestArts.length < 6) break
    const subGroups = new Map()
    const remain = []
    for (const article of largestArts) {
      const secondTag = getArticleTags(article).find((t) => t !== largestTopic)
      if (secondTag) {
        if (!subGroups.has(secondTag)) subGroups.set(secondTag, [])
        subGroups.get(secondTag).push(article)
      } else remain.push(article)
    }
    if (subGroups.size) {
      const [bestSub, bestArts] = [...subGroups.entries()].sort((a, b) => b[1].length - a[1].length)[0]
      if (bestArts.length >= 3) {
        finalGroups.set(bestSub, bestArts)
        const newArts = [...remain]
        for (const [k, v] of subGroups.entries()) {
          if (k !== bestSub) newArts.push(...v)
        }
        if (newArts.length) finalGroups.set(largestTopic, newArts)
        else finalGroups.delete(largestTopic) // 原组被完全搬空：删除而不是保留空组（否则两组互换死循环）
        continue
      }
    }
    break
  }

  // 第六步：按条数降序输出
  const clusters = [...finalGroups.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([category, arts]) => ({
      category,
      count: arts.length,
      articles: sortedTop(arts, 5),
      total_likes: arts.reduce((n, a) => n + a.engagement_num, 0),
      avg_likes: Math.floor(arts.reduce((n, a) => n + a.engagement_num, 0) / arts.length),
    }))
  return clusters
}
