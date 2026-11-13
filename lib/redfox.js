// RedFox API · 公众号爆款雷达传输层（queryAiMsgs 单关键词分页接口）。
// 与 bili-ai-feed 同款传输：JSON POST + 可选 CONNECT 隧道代理，双 header。
import http from 'node:http'
import https from 'node:https'
import { TLSSocket } from 'node:tls'

export const DEFAULT_API_BASE = 'https://redfox.hk'
export const GZH_QUERY_PATH = '/story/api/parseWork/queryAiMsgs'
export const SOURCE_LABEL = '公众号爆款雷达-dsh'

export const DEFAULT_KEYWORDS = ['AI', '人工智能', '大模型', 'GPT', 'Agent', 'AI绘画']
export const PAGE_SIZE = 20
export const PAGES_PER_KEYWORD = 5 // 首关键词最大翻页数（后续关键词仅翻 2 页，上游策略）

export function resolveApiKey({ settings = {}, config = {} } = {}) {
  return String(config.apiKey || settings.api_key || process.env.REDFOX_API_KEY || process.env.X_API_KEY || '').trim()
}

export function resolveApiBase({ settings = {} } = {}) {
  const base = String(settings.api_base || process.env.REDFOX_API_BASE || '').trim()
  return (base || DEFAULT_API_BASE).replace(/\/+$/, '')
}

function connectTunnel(proxyUrl, targetHost, targetPort, timeout) {
  return new Promise((resolve, reject) => {
    const proxy = new URL(proxyUrl)
    const req = http.request({
      host: proxy.hostname,
      port: Number(proxy.port) || 80,
      method: 'CONNECT',
      path: `${targetHost}:${targetPort}`,
      headers: { host: `${targetHost}:${targetPort}` },
      timeout,
    })
    req.on('connect', (res, socket) => {
      if (res.statusCode !== 200) { socket.destroy(); reject(new Error(`proxy CONNECT ${res.statusCode}`)); return }
      resolve(socket)
    })
    req.on('timeout', () => req.destroy(new Error('proxy connect timeout')))
    req.on('error', reject)
    req.end()
  })
}

export function httpPostJson(url, body, { timeout = 20000, proxyUrl = '', headers = {} } = {}) {
  const u = new URL(url)
  const isHttp = u.protocol === 'http:'
  const port = Number(u.port) || (isHttp ? 80 : 443)
  const payload = Buffer.from(JSON.stringify(body), 'utf8')
  const transport = isHttp ? http : https
  const opts = {
    host: u.hostname,
    port,
    method: 'POST',
    path: `${u.pathname}${u.search}`,
    headers: {
      'content-type': 'application/json',
      'content-length': payload.length,
      ...headers,
    },
  }
  return new Promise((resolve, reject) => {
    const finish = (socket) => {
      const req = transport.request(socket ? { ...opts, socket, agent: false } : { ...opts, agent: false }, (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          try {
            resolve({ status: res.statusCode, json: JSON.parse(text) })
          } catch {
            reject(new Error(`响应不是合法 JSON（HTTP ${res.statusCode}）：${text.slice(0, 200)}`))
          }
        })
      })
      req.on('error', reject)
      req.setTimeout(timeout, () => req.destroy(new Error(`请求超时（${timeout}ms）`)))
      req.end(payload)
    }
    if (proxyUrl && !isHttp) {
      connectTunnel(proxyUrl, u.hostname, port, timeout)
        .then((socket) => finish(new TLSSocket(socket, { servername: u.hostname })))
        .catch(reject)
    } else {
      finish()
    }
  })
}

export class InsufficientCreditsError extends Error {
  constructor(message) {
    super(message)
    this.name = 'InsufficientCreditsError'
  }
}

export function friendlyApiError(json) {
  const code = json?.code
  const msg = String(json?.msg || json?.message || '')
  if (code === 3201 || msg.includes('积分不足')) {
    return new InsufficientCreditsError('RedFox 账户积分不足（3201）：请到 https://redfox.hk/dashboard/recharge 充值，或确认 Key 已绑定可用积分。')
  }
  if (code === 3203 || msg.includes('付费调用')) {
    return new Error('RedFox 该接口已转为付费调用（3203）：请到 https://redfox.hk/dashboard/recharge 充值后重试。')
  }
  if (code === 3106 || code === 3107) return new Error(`RedFox 鉴权失败（${code}）：请检查面板「设置」页的 API Key。`)
  if (code === 3108) return new Error('RedFox 提交被限频（3108），稍等片刻再试。')
  if (code === 401 || code === 403) return new Error(`RedFox 鉴权失败（${code}）：请检查面板「设置」页的 API Key。`)
  return new Error(`API 错误（code=${code ?? '?'}）：${msg || JSON.stringify(json).slice(0, 200)}`)
}

// 单关键词单页查询（3108 一次重试，与上游 fetch_page 一致；3201 直接抛）
export async function fetchPage({ keyword, pageNum = 1, apiKey, apiBase, proxyUrl = '', pageSize = PAGE_SIZE, timeout = 20000 } = {}) {
  if (!apiKey) {
    throw new Error('未配置 RedFox API Key。请到面板「设置」页填入，或在插件配置/环境变量 REDFOX_API_KEY 里配置（获取：https://redfox.hk/settings/api-keys?source=github）。')
  }
  const payload = { keyword, pageNum, pageSize, source: SOURCE_LABEL }
  const headers = {
    'X-API-KEY': apiKey,
    'REDFOX_API_KEY': apiKey,
    'User-Agent': 'gzh-ai-feed/0.1',
  }
  let lastErr = null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { json } = await httpPostJson(`${apiBase}${GZH_QUERY_PATH}`, payload, { timeout, proxyUrl, headers })
      const code = json?.code
      if (code === 3108) {
        lastErr = friendlyApiError(json)
        await new Promise((r) => setTimeout(r, 5000))
        continue
      }
      if (code === 3201) throw friendlyApiError(json)
      if (code !== 200 && code !== 2000) throw friendlyApiError(json)
      const data = json?.data || {}
      return Array.isArray(data.list) ? data.list : []
    } catch (err) {
      if (err instanceof InsufficientCreditsError) throw err
      lastErr = err
      if (attempt < 1) continue
    }
  }
  throw lastErr || new Error('请求失败（已尝试 2 次）')
}
