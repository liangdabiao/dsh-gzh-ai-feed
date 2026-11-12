// 真实网络冒烟：默认关键词翻页扫描生成公众号 AI 日报，打印分类概览样例。
//   DSH_HOME=<目录> node scripts/live.mjs [关键词] [ak_xxx]
// key 优先级：命令行第二参 > 数据目录 settings.json > 环境变量 REDFOX_API_KEY。
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [, , kwArg, keyArg] = process.argv
const home = process.env.DSH_HOME || join(process.env.HOME || process.env.USERPROFILE, '.dsh')

if (keyArg) {
  mkdirSync(join(home, 'gzh-ai-feed'), { recursive: true })
  writeFileSync(join(home, 'gzh-ai-feed', 'settings.json'), JSON.stringify({ api_key: keyArg }, null, 2))
  console.log('API key 已写入 settings.json')
}
const { getSettings } = await import('../lib/store.js')
if (!getSettings().api_key && !process.env.REDFOX_API_KEY && !process.env.X_API_KEY) {
  console.error('缺少 RedFox API Key：node scripts/live.mjs <关键词> ak_xxx')
  process.exit(1)
}

const { gzhFeedTool } = await import('../src/host.js')
const call = (args) => gzhFeedTool.execute(args, {})

console.log(`真实抓取日报（默认关键词翻页扫描，约 10-30 秒）`)
const t0 = Date.now()
const r = await call({ action: 'fetch', keywords: kwArg || undefined })
console.log(`\n[${Math.round((Date.now() - t0) / 1000)}s] ${r.summary}`)
if (r.data) console.log(r.data.split('\n').slice(0, 24).join('\n') + '\n…')
console.log(`\n页脚: ${r.footer || '—'}`)
