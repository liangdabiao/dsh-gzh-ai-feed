// 显示日期规则（上游 main 逻辑）：queryAiMsgs 接口无日期参数（抓全库热门），日期仅作日报标注。
// 今天 16:00 后标注为 T-1，否则 T-2。
const pad = (n) => String(n).padStart(2, '0')

export const DATA_CUTOFF_HOUR = 16

export function fmtDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// 日报标注日期（展示语义，非查询参数）
export function displayDate(now = new Date()) {
  const offset = now.getHours() >= DATA_CUTOFF_HOUR ? 1 : 2
  return fmtDate(new Date(now.getTime() - offset * 86400_000))
}

/**
 * 解析目标日期（仅展示语义）：
 * - 空 / 'latest' → 按标注规则
 * - 具体日期 → 校验格式（接口无日期过滤，抓取始终是全库热门）
 */
export function resolveDisplayDate(input, now = new Date()) {
  const raw = String(input || '').trim()
  if (!raw || raw === 'latest') return { date: displayDate(now), note: '' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new Error(`日期格式应为 yyyy-MM-dd（收到「${raw}」）`)
  }
  const [y, m, d] = raw.split('-').map(Number)
  const probe = new Date(y, m - 1, d)
  if (probe.getFullYear() !== y || probe.getMonth() !== m - 1 || probe.getDate() !== d) {
    throw new Error(`日期不存在：${raw}`)
  }
  return {
    date: raw,
    note: '接口抓取全库热门内容（无日期过滤），日报以该日期标注归档。',
  }
}
