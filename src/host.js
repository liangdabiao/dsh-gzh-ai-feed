// AI公众号信息源 · Host 半边（gzh_feed 原生工具 + gzh-ai-feed 技能提供方 + 硬规则注入 + 面板数据面）。
// 翻页扫描约 10-30 秒（首词深翻 5 页 + 后续词 2 页 + 0.5s 页间隔）；聚类与呈现由会话模型按技能完成。
import Schema from '@deepseek-ai/schemastery'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createSkillProvider } from '../lib/skills.js'
import { systemSection } from './systemPrompt.js'
import { registerApi } from '../lib/api.js'
import { fetchFeed, feedOpts, SOURCE_LABEL } from '../lib/engine.js'
import { formatNumber } from '../lib/normalize.js'
import {
  saveFeed, getMeta, getRaw, listFeeds, publicMeta, getSettings, saveReportHtml,
} from '../lib/store.js'
import { formatDigestHtml } from '../lib/report.js'

export const name = 'gzh-ai-feed' // = cordis.patch.yml 的 id

export const inject = ['tools', 'skills', 'systemPrompt', 'webServer', 'connection']

export const Config = Schema.object({
  injectRules: Schema.boolean().default(true).description('注入公众号信息源工作流到系统提示'),
  apiKey: Schema.string().default('').description('RedFox API Key（ak_ 开头；留空读面板设置或环境变量 REDFOX_API_KEY）'),
  proxyUrl: Schema.string().default('').description('HTTP(S) 代理（访问 redfox.hk 用），留空直连'),
})

function check(args, spec) {
  const problems = []
  for (const key of spec.required || []) {
    if (args?.[key] === undefined) problems.push(`缺少必填参数 ${key}`)
  }
  for (const [key, rule] of Object.entries(spec.properties || {})) {
    const value = args?.[key]
    if (value === undefined) continue
    if (rule.enum && !rule.enum.includes(value)) problems.push(`${key} 只能是 ${rule.enum.join(' / ')} 之一`)
  }
  for (const key of Object.keys(args || {})) {
    if (!spec.properties || !(key in spec.properties)) problems.push(`未知参数 ${key}`)
  }
  if (problems.length) throw new Error(`参数有误：${problems.join('；')}。`)
}

const str = (description, extra = {}) => ({ type: 'string', description, ...extra })
const num = (description, extra = {}) => ({ type: 'number', description, ...extra })
const text = (value) => [{ type: 'text', text: value }]

const OUTPUT = {
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['ok', 'summary'],
    properties: {
      ok: { type: 'boolean' },
      summary: { type: 'string', description: '给模型看的回执' },
      data: { type: 'string', description: '可选：分类概览/文章明细' },
      footer: { type: 'string', description: '可选：输出时需逐字附带的引擎页脚' },
    },
  },
  render: (_args, value) => text([value.summary, value.data, value.footer].filter(Boolean).join('\n\n')),
}

const result = (ok, summary, data = '', footer = '') => ({ ok, summary, data, footer })

const MAX_TEXT = 58000

function buildFooter(meta) {
  return `📰 数据源：redfox.hk API（AI公众号信息源）· ${meta.date} 标注 · 扫描 ${meta.total} 篇 · 聚类 ${meta.topic_count} 类 · 记录 ${meta.feed_id}`
}

// 单篇文章行（模型可读）
function renderRow(a, idx) {
  const reads = a.read_count ? ` 📖${formatNumber(a.read_count)}` : ''
  return `${idx}｜[${a.title}](${a.url})｜${a.author}${reads}｜👍${formatNumber(a.like_count)} 💬${formatNumber(a.comment_count)} 📤${formatNumber(a.share_count)}｜${a.published_at ? String(a.published_at).slice(0, 10) : '--'}`
}

// ---------------------------------------------------------------------------
// 工具：gzh_feed —— fetch / list / get
// ---------------------------------------------------------------------------
export const gzhFeedTool = {
  name: 'gzh_feed',
  description:
    'AI公众号信息源：每日扫描AI相关公众号，按互动总量（点赞+评论+分享）发现爆款文章，智能聚类话题，产出深色主题 HTML 日报（封面图+互动数据+文章直链）。支持自定义关键词（如 "AI Agent,RAG,LangChain"）。' +
    '接口抓全库热门内容（无日期过滤），日报日期仅作标注（今天16:00后标注昨天，否则标注前天）。' +
    '需要 RedFox API Key（面板「设置」页或环境变量 REDFOX_API_KEY）。',
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['action'],
    properties: {
      action: str('fetch 生成日报；list 历史日报；get 读详情', { enum: ['fetch', 'list', 'get'] }),
      date: str('fetch：日报标注日期 yyyy-MM-dd（仅标注语义，接口抓全库热门；不传=按 16:00 规则自动标注）'),
      keywords: str('fetch：自定义关键词逗号分隔（如 "AI Agent,RAG,LangChain"）；不传=默认 AI/人工智能/大模型/GPT/Agent/AI绘画'),
      count: num('fetch：目标文章数，默认 200（最大 200）'),
      feedId: str('get 定位：目标日报记录 id；缺省=最新一次'),
    },
  },
  output: OUTPUT,
  async execute(args, ctxConfig) {
    check(args, this.parameters)
    const cfg = ctxConfig || {}

    // ── fetch ────────────────────────────────────────────────────────────
    if (args.action === 'fetch') {
      const opts = feedOpts({ settings: getSettings(), config: cfg })
      if (!opts.apiKey) {
        return result(false, '未配置 RedFox API Key。请用户到面板「AI公众号信息源 → 设置」填入，或在插件配置/环境变量 REDFOX_API_KEY 里配置（获取：https://redfox.hk/settings/api-keys?source=github）。')
      }
      const count = Math.min(Math.max(Number(args.count) || 200, 20), 200)
      const data = await fetchFeed({ date: args.date, keywords: args.keywords, count, ...opts })

      if (!data.articles.length) {
        return result(false,
          `关键词 ${data.keywords.join('/')} 暂无内容。可建议用户更换关键词；不要自动改查其他关键词。`,
          '', `📰 数据源：redfox.hk API（AI公众号信息源）· 0 篇`)
      }

      const meta = saveFeed(data)
      const html = formatDigestHtml({ dateStr: data.date, articles: data.articles, clusters: data.clusters, source: SOURCE_LABEL })
      const reportFile = saveReportHtml(meta.feed_id, html)
      const pm = publicMeta(meta)

      // 分类概览 + 各类头部文章
      const total = data.articles.length
      const overview = [
        `## AI公众号信息源 · ${data.date} 日报`,
        '',
        `**扫描 ${total} 篇热门文章（互动总量口径），聚类 ${data.clusters.length} 个分类**`,
        '',
        '---',
        '',
        '### 分类概览',
        '',
        '| 分类 | 数量 | 占比 | 头部文章亮点 |',
        '|------|------|------|------|',
        ...data.clusters.slice(0, 12).map((c) => {
          const top = c.articles[0]
          const highlight = top ? `${String(top.title).slice(0, 24)}…（👍${formatNumber(top.like_count)}）` : '-'
          return `| ${c.category} | ${c.count}篇 | ${(c.count * 100 / total).toFixed(1)}% | ${highlight} |`
        }),
        '',
        '### 各分类头部文章（TOP5/类，标题带链接）',
        '',
        ...data.clusters.slice(0, 8).flatMap((c) => [
          `**${c.category}**（${c.count}篇 · 篇均互动${formatNumber(c.avg_likes)}）`,
          ...c.articles.slice(0, 5).map((a, i) => `  ${renderRow(a, i + 1)}`),
          '',
        ]),
      ].join('\n')

      const summary =
        `已入库（feedId=${meta.feed_id}）。${data.date} 标注 · ${total} 篇 · ${data.clusters.length} 类。` +
        `向用户输出：分类概览表 → 各分类头部文章列表（含链接与互动数据）→ 日报地址 ${reportFile}。` +
        `爆款口径是互动总量（接口不返回阅读数），如实转述。`

      return result(true, summary, overview.slice(0, MAX_TEXT), buildFooter(pm))
    }

    // ── list ─────────────────────────────────────────────────────────────
    if (args.action === 'list') {
      const list = listFeeds({ limit: 20 })
      if (!list.length) return result(false, '还没有日报记录。先 fetch。')
      const lines = list.map((r) =>
        `${r.feed_id}｜${r.date}｜${r.total}篇 ${r.topic_count}类`)
      return result(true, `共 ${list.length} 期日报（新→旧）。读详情用 action="get"。`, lines.join('\n').slice(0, MAX_TEXT))
    }

    // ── get ──────────────────────────────────────────────────────────────
    if (args.action === 'get') {
      const meta = resolveFeedMeta(args.feedId)
      const raw = getRaw(meta.feed_id)
      if (!raw) throw new Error(`日报数据缺失：${meta.feed_id}`)
      const pool = raw.articles || []
      const body = pool.slice(0, 50).map((a, i) => renderRow(a, i + 1)).join('\n')
      return result(true,
        `${meta.date} 标注日报共 ${pool.length} 篇（${meta.topic_count} 类）。引用时链接取 url 字段。`,
        body.slice(0, MAX_TEXT), buildFooter(publicMeta(meta)))
    }

    throw new Error(`未知 action：${args.action}`)
  },
}

function resolveFeedMeta(feedId) {
  if (feedId) {
    const meta = getMeta(feedId)
    if (!meta) throw new Error(`日报记录不存在：${feedId}。用 list 查看已有日报。`)
    return meta
  }
  const [latest] = listFeeds({ limit: 1 })
  if (!latest) throw new Error('还没有日报记录。先 fetch。')
  return getMeta(latest.feed_id)
}

// ---------------------------------------------------------------------------
// 装配
// ---------------------------------------------------------------------------
export function apply(ctx, config) {
  const skillDirs = [join(dirname(fileURLToPath(import.meta.url)), '..', 'skills')]

  const toolWithConfig = { ...gzhFeedTool, execute(args) { return gzhFeedTool.execute(args, config) } }

  ctx.effect(() => ctx.tools.register(toolWithConfig), `${name}: tool`)
  ctx.effect(() => ctx.skills.registerProvider(() => createSkillProvider(skillDirs)), `${name}: skills`)
  if (config.injectRules !== false) {
    ctx.effect(() => ctx.systemPrompt.section(systemSection()), `${name}: workflow`)
  }
  ctx.effect(() => registerApi(ctx, { config }), `${name}: routes`)
}

export { publicMeta }
