---
name: gzh-ai-feed
description: AI公众号信息源 — Daily scan of AI WeChat public accounts, finding the hottest articles by engagement, auto-clustering into topics, and generating a styled HTML report with cover images and metrics. Use when the user wants AI daily reports, 公众号爆款, AI content curation, 每日AI热点, or 公众号日报.
---

# AI公众号信息源

每日自动扫描全网 AI 公众号，按互动总量找出最火的爆款内容，智能聚类后生成深色主题 HTML 日报。

## 数据口径（重要）

- **接口无日期过滤**：抓取的是全库热门内容；日报日期仅作标注（今天 16:00 后标注 T-1，否则 T-2）。不要向用户承诺"只查某天的文章"。
- **爆款口径 = 互动总量**（点赞+评论+分享）：接口实测不返回阅读数字段（上游按 readCount 筛选是失效逻辑）。展示互动数据时如实呈现 👍/💬/📤 三项。
- 每篇文章：标题、公众号、封面图、点赞、评论、分享、发布时间、文章直链（mp.weixin.qq.com）。
- 默认关键词 AI/人工智能/大模型/GPT/Agent/AI绘画；自定义关键词只用用户列表；翻页策略为首词深翻 5 页、后续词 2 页、重复率 >70% 换词。

## 工作流程

1. `gzh_feed(action="fetch", keywords?, date?)`：翻页扫描（约 10-30 秒）→ 智能聚类（六步算法，分类由当天内容动态决定）→ HTML 日报落盘
2. 向用户输出：分类概览表 → 各分类头部文章（标题带链接 + 互动数据）→ 日报地址
3. 需要深挖某话题时：用可用搜索工具按调查模式（竞品/舆情/人物/验证）做多引擎交叉验证，参照 [investigation-modes.md](references/investigation-modes.md)

## 展示纪律

- 所有数值来自数据服务返回，严禁估算编造；没查到写"暂无"。
- 查询无结果时如实说明并建议更换关键词，不自动改查。
- 文章链接保持完整可点击；不用破折号（用 " - "）；末尾逐字附上工具返回的页脚。

## 面板

- 侧栏「AI公众号信息源」面板：直查日报（关键词/条数）、分类卡片（公众号封面缩略图+互动数据+文章直链）、深色主题 HTML 日报、历史归档。
- 深挖话题时引导用户「去对话深挖」，agent 按调查模式做延伸搜索。
