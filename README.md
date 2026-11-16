# dsh-gzh-ai-feed · 公众号爆款雷达

> 每日自动扫描全网 AI 公众号，按互动总量找出最火的爆款文章，智能聚类后生成深色主题 HTML 日报（封面图+互动数据+文章直链）。
<img width="1662" height="1407" alt="image" src="https://github.com/user-attachments/assets/4622e0a2-bd1a-4cfa-8ae2-f0386858ecc6" />

dsh 插件（完整形态：原生工具 + 数据持久化 + 侧栏看板）。支持自定义关键词分页扫描。移植自 [redfox-community](https://github.com/redfox-data/redfox-community) 的 skills/gzh-ai-feed，Python 引擎（daily_report.py 902 行）全量重写为 Node。

## ⚠️ 数据口径修正（对上游的务实改进）

- **接口实测不返回阅读数（readCount）字段**——上游按 readCount 筛选爆款的逻辑实际失效（全部落 0）。dsh 版改用**互动总量（点赞+评论+分享）**作为爆款口径，若接口未来返回 readCount 则自动优先。
- **接口无日期过滤**（抓全库热门内容），日报日期仅作标注（今天 16:00 后标注 T-1，否则 T-2）——上游 --date 语义即是如此。

## 功能

- **gzh_feed 工具**（agent 对话内使用）
  - `fetch`：翻页扫描（首词深翻 5 页、后续词 2 页、重复率 >70% 换词、75% 目标即停、0.5s 页间隔）→ 六步智能聚类 → HTML 日报落盘
  - `list` / `get`：日报历史与补读
- **侧栏看板**：直查日报（关键词/条数）、分类卡片（公众号封面缩略图+互动数据+文章直链）、深色主题 HTML 日报（面板内嵌查看）、历史归档
- **gzh-ai-feed 技能**：数据口径说明 + 聚类机制 + 展示纪律 + 调查模式延伸（references 三份方法论快照）

## 安装

```bash
dsh plugin --profile web add https://github.com/liangdabiao/dsh-gzh-ai-feed
```

前置：dsh >= 0.2.1-rc.2；RedFox API Key（[红狐 hub 获取](https://redfox.hk/settings/api-keys?source=github)，`ak_` 开头）。

## 开发

```bash
npm install        # 安装依赖并构建 dist/client.js
npm test           # 单测（node --test）
npm run smoke      # 离线冒烟：假分页服务器（翻页/换词/去重）+ 工具直调 + 面板 API 全路由
npm run dev        # 开发预览：DSH_HOME=<数据目录> node scripts/devserver.mjs 5200
npm run live       # 真实抓取：DSH_HOME=<目录> node scripts/live.mjs [关键词] ak_xxx
```

数据目录：`$DSH_HOME/gzh-ai-feed/`（settings.json + feeds/<id>/meta.json、raw.json、report.html）。

## License

MIT
