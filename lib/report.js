// HTML 日报渲染（移植自上游 gzh daily_report.py generate_report/generate_category_cards）。
// 模板占位符：{{DATE}}/{{DATE_CN}}/{{TOTAL_COUNT}}/{{TOPIC_COUNT}}/{{AVG_READS}}/{{TOTAL_LIKES}}/{{CATEGORY_CARDS}}/{{TIMESTAMP}}
// gzh 版无情报调查板块（上游无此模块）；爆款口径 = 互动总量（接口不返回 readCount）。
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { formatNumber } from './normalize.js'
import { esc } from './html.js'

const TEMPLATE = join(dirname(fileURLToPath(import.meta.url)), 'report_template.html')

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

function dateCn(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr)
  if (!m) return dateStr
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  if (Number.isNaN(dt.getTime())) return dateStr
  return `${dt.getFullYear()}年${dt.getMonth() + 1}月${dt.getDate()}日 星期${WEEKDAYS[(dt.getDay() + 6) % 7]}`
}

function categoryCards(clusters) {
  return clusters.map((cluster, i) => {
    const articlesHtml = cluster.articles.map((a) => {
      const cover = a.cover_url
        ? `<img class="article-cover" src="${esc(a.cover_url)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
        : ''
      const link = a.url || '#'
      return `
                <div class="article-item">
                    ${cover}
                    <div class="article-info">
                        <a href="${esc(link)}" target="_blank" class="article-title">${esc(a.title)}</a>
                        <div class="article-meta">
                            <span class="author">${esc(a.author)}</span>
                            <span class="metrics">
                                <span class="metric">&#x1f441; ${formatNumber(a.read_count)}</span>
                                <span class="metric">&#x1f44d; ${formatNumber(a.like_count)}</span>
                                <span class="metric">&#x1f4ac; ${formatNumber(a.comment_count)}</span>
                            </span>
                        </div>
                    </div>
                </div>`
    }).join('')
    return `
        <div class="category-card reveal">
            <div class="card-header">
                <span class="card-number">${String(i + 1).padStart(2, '0')}</span>
                <h3 class="card-category">${esc(cluster.category)}</h3>
                <span class="card-count">${cluster.count} 篇</span>
            </div>
            <div class="card-body">${articlesHtml}
            </div>
        </div>`
  }).join('')
}

export function formatDigestHtml({ dateStr, articles, clusters, source }) {
  let template
  try {
    template = readFileSync(TEMPLATE, 'utf8')
  } catch (err) {
    throw new Error(`无法读取模板文件 ${TEMPLATE}: ${err.message}`)
  }
  const total = articles.length
  const totalLikes = articles.reduce((n, a) => n + a.like_count, 0)
  const totalReads = articles.reduce((n, a) => n + a.read_count, 0)
  const avgReads = total && totalReads > 0 ? Math.floor(totalReads / total) : null // 接口无阅读数据时显示 —（互动口径）
  const authorCounter = new Map()
  for (const a of articles) authorCounter.set(a.author, (authorCounter.get(a.author) || 0) + 1)
  const topAuthor = [...authorCounter.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '-'

  return template
    .replaceAll('{{DATE}}', esc(dateStr))
    .replaceAll('{{DATE_CN}}', esc(dateCn(dateStr)))
    .replaceAll('{{TOTAL_COUNT}}', String(total))
    .replaceAll('{{TOPIC_COUNT}}', String(clusters.length))
    .replaceAll('{{AVG_READS}}', avgReads === null ? '—' : formatNumber(avgReads))
    .replaceAll('{{TOTAL_LIKES}}', formatNumber(totalLikes))
    .replaceAll('{{CATEGORY_CARDS}}', categoryCards(clusters))
    .replaceAll('{{TIMESTAMP}}', esc(new Date().toISOString().replace('T', ' ').slice(0, 19)))
    .replaceAll('{{SOURCE}}', esc(source || '公众号爆款雷达-dsh'))
    .replaceAll('{{TOP_AUTHOR}}', esc(topAuthor))
}
