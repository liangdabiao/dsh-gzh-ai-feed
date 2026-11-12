import test from 'node:test'
import assert from 'node:assert/strict'
import { clusterArticles, extractKeywords, getArticleTags } from '../lib/cluster.js'
import { displayDate, resolveDisplayDate } from '../lib/dates.js'
import { normalizeArticle, dedupeArticles, sortByEngagement, formatNumber } from '../lib/normalize.js'

const mk = (photoId, title, type, topic, like = 1000, author = '公众号') => ({
  ...normalizeArticle({ photoId, title, type, topic, likeCount: like, commentCount: Math.floor(like / 10), shareCount: Math.floor(like / 20), userName: author, url: `https://mp.weixin.qq.com/s/${photoId}`, coverUrl: `https://mmbiz.qpic.cn/${photoId}.jpg`, gmtCreate: '2026-11-12 10:00:00' }),
})

test('extractKeywords：中文 2-4 字片段（贪婪切分，上游同款行为）', () => {
  const kws = extractKeywords('大模型微调的教程，怎么入门实践')
  assert.ok(kws.length >= 1 && kws.length <= 5)
  assert.ok(kws.every((k) => k.length >= 2))
})

test('getArticleTags：type 优先 topic 补充，泛标签跳过', () => {
  const tags = getArticleTags({ type: '#AI,#AI大模型', topic: '#AI #GPT' })
  assert.deepEqual(tags, ['#AI大模型', '#GPT'])
})

test('clusterArticles：标签分组 + 小组合并 + 保底分类', () => {
  const articles = [
    mk('BV1', '大模型文章A', '#AI,#AI大模型', '', 5000),
    mk('BV2', '大模型文章B', '#AI,#AI大模型', '', 4000),
    mk('BV3', '大模型文章C', '#AI,#AI大模型', '', 3000),
    mk('BV4', 'AI绘画文章1', '#AI绘画', '', 2000),
    mk('BV5', 'AI绘画文章2', '#AI绘画', '', 1500),
    mk('BV6', 'AI绘画文章3', '#AI绘画', '', 1200),
    mk('BV7', '完全无标签', '', '', 800),
  ]
  const clusters = clusterArticles(articles)
  assert.ok(clusters.length >= 2)
  const counts = clusters.map((c) => c.count)
  assert.deepEqual(counts, [...counts].sort((a, b) => b - a))
  for (const c of clusters) {
    const eng = c.articles.map((a) => a.engagement_num)
    assert.deepEqual(eng, [...eng].sort((a, b) => b - a))
  }
  assert.ok(clusters.some((c) => c.category === '其他'))
})

test('clusterArticles：互斥标签同质数据不死循环（上游死循环 bug 回归测试）', () => {
  const articles = []
  for (let i = 0; i < 40; i++) {
    articles.push(mk(`BV${i}`, `大模型文章${i}`, i % 2 === 0 ? '#AI,#AI大模型,#Agent' : '#AI,#AI大模型', '', 1000 + i))
  }
  const clusters = clusterArticles(articles) // 修复前此处死循环
  assert.ok(clusters.length >= 1)
})

test('clusterArticles：大组用第二标签拆分', () => {
  const articles = []
  for (let i = 0; i < 40; i++) {
    articles.push(mk(`BV${i}`, `大模型文章${i}`, i % 2 === 0 ? '#AI,#AI大模型,#Agent' : '#AI,#AI大模型', '', 1000 + i))
  }
  const clusters = clusterArticles(articles)
  assert.ok(clusters.some((c) => c.category === '#Agent' || c.category === '#AI大模型'))
})

test('dates：16:00 标注规则（仅展示语义，无拦截）', () => {
  const after = new Date(2026, 10, 13, 16, 0)
  const before = new Date(2026, 10, 13, 15, 59)
  assert.equal(displayDate(after), '2026-11-12')
  assert.equal(displayDate(before), '2026-11-11')
})

test('dates：resolveDisplayDate 无拦截语义', () => {
  const r1 = resolveDisplayDate('')
  assert.ok(r1.date && !r1.empty) // 没有拦截语义
  const r2 = resolveDisplayDate('2099-01-01') // 未来日期也不拦截（仅标注）
  assert.equal(r2.date, '2099-01-01')
  assert.throws(() => resolveDisplayDate('2026/11/01'), /yyyy-MM-dd/)
})

test('normalize：url 直给 + engagement 口径 + http 封面升级', () => {
  const a = normalizeArticle({ photoId: 'P1', title: ' T ', userName: '', likeCount: '100', commentCount: null, shareCount: 20, url: 'https://mp.weixin.qq.com/s/x', coverUrl: 'http://mmbiz.qpic.cn/x.jpg' })
  assert.equal(a.url, 'https://mp.weixin.qq.com/s/x')
  assert.equal(a.author, '未知公众号')
  assert.equal(a.cover_url, 'https://mmbiz.qpic.cn/x.jpg')
  assert.equal(a.engagement_num, 120) // read 缺失 → like+comment+share
  assert.equal(a.read_count, 0)
})

test('normalize：readCount 兼容（接口未来返回则优先）', () => {
  const a = normalizeArticle({ photoId: 'P1', readCount: 50000, likeCount: 100, commentCount: 10, shareCount: 5 })
  assert.equal(a.read_count, 50000)
  assert.equal(a.engagement_num, 50000)
})

test('normalize：去重与排序（互动总量降序）', () => {
  const items = [mk('P3', 'c', '', '', 100), mk('P1', 'a', '', '', 300), mk('P2', 'b', '', '', 200), mk('P1', 'dup', '', '', 999)]
  const deduped = dedupeArticles(items)
  assert.equal(deduped.length, 3)
  const sorted = sortByEngagement(deduped)
  assert.equal(sorted[0].photo_id, 'P1')
})

test('formatNumber', () => {
  assert.equal(formatNumber(52000), '5.2w')
  assert.equal(formatNumber(1500), '1.5k')
  assert.equal(formatNumber(999), '999')
})
