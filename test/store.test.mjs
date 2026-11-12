import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tmp = mkdtempSync(join(tmpdir(), 'dsh-gzh-store-'))
process.env.DSH_HOME = tmp
delete process.env.REDFOX_API_KEY

const { saveFeed, getMeta, getRaw, listFeeds, publicMeta, deleteFeed, getSettings, saveSettings, saveReportHtml, readReportHtml, resolveFeed } = await import('../lib/store.js')
const { formatDigestHtml } = await import('../lib/report.js')

test.after(() => { rmSync(tmp, { recursive: true, force: true }) })

const feedFixture = () => ({
  date: '2026-11-12',
  keywords: ['AI'],
  articles: [
    { photo_id: 'P1', url: 'https://mp.weixin.qq.com/s/P1', title: '文章一', author: '甲号', like_count: 5000, comment_count: 500, share_count: 100, read_count: 0, engagement_num: 5600, cover_url: 'https://mmbiz.qpic.cn/1.jpg', published_at: '2026-11-12 10:00:00' },
    { photo_id: 'P2', url: 'https://mp.weixin.qq.com/s/P2', title: '文章二', author: '乙号', like_count: 3000, comment_count: 300, share_count: 50, read_count: 0, engagement_num: 3350, cover_url: '', published_at: '2026-11-12 11:00:00' },
  ],
  clusters: [{ category: '#AI大模型', count: 2, articles: [{ photo_id: 'P1', url: 'https://mp.weixin.qq.com/s/P1', title: '文章一', author: '甲号', like_count: 5000, comment_count: 500, share_count: 100, read_count: 0, engagement_num: 5600, cover_url: 'https://mmbiz.qpic.cn/1.jpg', published_at: '2026-11-12 10:00:00' }], total_likes: 8950, avg_likes: 4475 }],
  pages: [{ keyword: 'AI', page: 1, items: 2 }],
  fetched_at: '2026-11-13T02:00:00.000Z',
})

test('saveFeed/listFeeds/getMeta/getRaw 全链路', () => {
  const meta = saveFeed(feedFixture())
  assert.ok(meta.feed_id.startsWith('2026-11-12-'))
  assert.equal(meta.total, 2)
  assert.equal(meta.topic_count, 1)
  const got = getMeta(meta.feed_id)
  assert.equal(got.date, '2026-11-12')
  const raw = getRaw(meta.feed_id)
  assert.equal(raw.articles.length, 2)
  const list = listFeeds()
  assert.equal(list.length, 1)
})

test('settings', () => {
  saveSettings({ api_key: 'ak_test', proxy_url: '' })
  assert.equal(getSettings().api_key, 'ak_test')
  saveSettings({ api_base: 'http://127.0.0.1:9' })
  assert.equal(getSettings().api_base, 'http://127.0.0.1:9')
})

test('listReports：按 mode 过滤不需要（gzh 单模式），resolveFeed 缺省最新', () => {
  const meta = resolveFeed(undefined)
  assert.equal(meta.date, '2026-11-12')
  assert.throws(() => resolveFeed('nope'), /不存在/)
})

test('report.html 落盘 + formatDigestHtml（gzh 占位符）', () => {
  const meta = listFeeds()[0]
  const raw = getRaw(meta.feed_id)
  const html = formatDigestHtml({ dateStr: raw.date, articles: raw.articles, clusters: raw.clusters, source: 'AI公众号信息源-dsh' })
  assert.ok(html.includes('category-card'))
  assert.ok(html.includes('文章一'))
  assert.ok(html.includes('mmbiz.qpic.cn/1.jpg'))
  assert.ok(!html.includes('{{DATE}}') && !html.includes('{{CATEGORY_CARDS}}') && !html.includes('{{AVG_READS}}') && !html.includes('{{TOPIC_COUNT}}') && !html.includes('[object Object]') && !html.includes('>undefined<'))
  saveReportHtml(meta.feed_id, html)
  assert.ok(readReportHtml(meta.feed_id))
  assert.equal(publicMeta(getMeta(meta.feed_id)).has_report, true)
})

test('deleteFeed', () => {
  const meta = listFeeds()[0]
  assert.ok(existsSync(join(tmp, 'gzh-ai-feed', 'feeds', meta.feed_id)))
  assert.deepEqual(deleteFeed(meta.feed_id), { ok: true })
  assert.equal(listFeeds().length, 0)
  assert.equal(deleteFeed(meta.feed_id).ok, false)
})
