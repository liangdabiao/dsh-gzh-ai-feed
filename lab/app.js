// 公众号爆款雷达 · 面板逻辑：概览（抓日报表单+历史）/ 详情页（分类卡片 + 视频列表 + 情报调查两个视图）/ 设置。
// 「去对话深挖」走 agent：嵌入 dsh → postMessage（client.js startSession，有 start-ok 握手）。
// ⚠️日期规则：全库热门 · 日期仅标注数据——请求无数据日期时面板直接提示切换（不调接口）。
(() => {
  const $app = document.getElementById('app')
  const $toast = document.getElementById('toast')
  const EMBEDDED = (() => { try { return window.parent !== window } catch { return false } })()

  const state = { catalog: null, view: 'cards' }
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

  async function api(path) {
    const res = await fetch(`/gzh-ai-feed${path}`)
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      const err = new Error(body.error || `HTTP ${res.status}`)
      err.status = res.status
      err.blocked = Boolean(body.blocked)
      err.latest = body.latest
      throw err
    }
    return body
  }
  async function apiPost(path, payload) {
    const res = await fetch(`/gzh-ai-feed${path}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload || {}),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      const err = new Error(body.error || `HTTP ${res.status}`)
      err.blocked = Boolean(body.blocked)
      err.latest = body.latest
      throw err
    }
    return body
  }
  async function apiDelete(path) {
    const res = await fetch(`/gzh-ai-feed${path}`, { method: 'DELETE' })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
    return body
  }

  // 打开外部链接：桌面端 iframe 里 window.open 会被 WebContentsView deny，
  // 先请宿主用系统默认浏览器打开；宿主不支持（网页版/无桌面）时退回新窗口。
  async function openLink(u) {
    if (!u || u === '#' || u === 'about:blank') return
    try {
      const r = await apiPost('/api/open', { url: u })
      if (r?.ok) { toast('已在系统浏览器打开'); return }
      throw new Error(r?.error || '打开失败')
    } catch (e) {
      const win = window.open(u, '_blank', 'noopener')
      if (!win) {
        const hint = /404|not found/i.test(String(e.message))
          ? '宿主还没重启（/api/open 未上线），重启 dsh 后就能用系统浏览器打开'
          : e.message
        toast(`链接打不开：${hint}`, true)
      }
    }
  }

  // 面板里的外链一律交给系统浏览器（桌面端 <a target="_blank"> 同样会被 deny）
  function bindExternalLinks() {
    document.querySelectorAll('a[target="_blank"]').forEach((a) => {
      a.onclick = (e) => { e.preventDefault(); e.stopPropagation(); openLink(a.getAttribute('href')) }
    })
  }

  let toastTimer = null
  function toast(msg, isErr) {
    $toast.textContent = msg
    $toast.className = `toast show${isErr ? ' err' : ''}`
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => { $toast.className = 'toast' }, 3200)
  }
  function copyFallback(prompt, reason) {
    navigator.clipboard?.writeText(prompt).then(
      () => toast(`${reason}，草稿已复制到剪贴板——请粘贴到 dsh 对话`, true),
      () => toast(`${reason}，复制也失败了`, true))
  }

  const ICONS = {
    home: '<path d="M4 11l8-7 8 7"/><path d="M6 9.5V20h12V9.5"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a2 2 0 1 1-2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0 .33-1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    trash: '<path d="M5 7h14"/><path d="M9 7V5h6v2"/><path d="M7 7l1 13h8l1-13"/>',
    spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
    ext: '<path d="M14 5h5v5"/><path d="M19 5l-8 8"/><path d="M18 14v5H5V6h5"/>',
    back: '<path d="M14 6l-6 6 6 6"/>',
    play: '<path d="M8 5l11 7-11 7V5z"/>',
  }
  const ic = (name, cls = 'ic') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`

  async function loadCatalog() {
    state.catalog = await api('/api/catalog')
    renderNavCounts()
    renderRailFoot()
    return state.catalog
  }
  function renderNavCounts() {
    const c = state.catalog
    if (!c) return
    document.querySelectorAll('[data-count]').forEach((n) => {
      if (n.dataset.count === 'feeds') n.textContent = (c.feeds || []).length
    })
  }
  function renderRailFoot() {
    const c = state.catalog
    if (!c) return
    const latest = (c.feeds || [])[0]
    document.getElementById('rail-foot').innerHTML =
      `<div class="v-head">GZH AI FEED v${esc(c.version)}</div>` +
      `<div class="v-row"><span>API Key</span><span>${c.has_key ? '已配置' : '未配置'}</span></div>` +
      `<div class="v-row"><span>最新数据日</span><span>${esc(c.latest_date || '—')}</span></div>` +
      `<div class="v-row"><span>最近日报</span><span>${esc(latest ? `${latest.date} ${latest.total}条` : '—')}</span></div>`
  }

  // ---------- 送 prompt 到 agent 对话 ----------
  function sendAgentPrompt(prompt, okMsg = '已在宿主开新对话——agent 处理中') {
    if (!EMBEDDED) {
      navigator.clipboard?.writeText(prompt).then(
        () => toast('草稿已复制——粘贴到 dsh 对话即可开始'),
        () => copyFallback(prompt, '复制失败'))
      return
    }
    let done = false
    const cleanup = () => { done = true; clearTimeout(timer); removeEventListener('message', onMsg) }
    const onMsg = (e) => {
      if (e.origin !== location.origin) return
      if (e.data?.type === 'gzh-ai-feed:start-ok') { if (!done) { cleanup(); toast(okMsg) } }
      else if (e.data?.type === 'gzh-ai-feed:start-failed') { if (!done) { cleanup(); toast(`没能开新对话：${e.data.message || ''}`, true) } }
    }
    const timer = setTimeout(() => { if (!done) { cleanup(); copyFallback(prompt, '未收到宿主确认') } }, 1500)
    addEventListener('message', onMsg)
    parent.postMessage({ type: 'gzh-ai-feed:refresh', prompt }, location.origin)
  }

  function digPrompt(feed) {
    return [
      `请深挖 公众号爆款雷达 ${feed.date} 日报里的热门话题：`,
      `1. bili_feed(action="get", feedId="${feed.feed_id}") 补读条目`,
      '2. 选 1-2 个我感兴趣的话题，按 gzh-ai-feed 技能的调查模式（竞品/舆情/人物/验证）用可用搜索工具做多引擎交叉验证',
      '3. 输出结构化调查报告（发现带来源+可信度标注 ✅⚠️❌🔍，信息源 A/B/C/D 分级）。',
    ].join('\n')
  }

  // ---------- 视图：概览 ----------
  function viewHome() {
    const c = state.catalog
    const feeds = c.feeds || []
    return `
      <header class="head">
        <span class="eyebrow">WECHAT VIRAL RADAR</span>
        <div class="head-row">
          <h1>公众号<strong>爆款雷达</strong></h1>
        </div>
        <p>按关键词翻页扫描公众号爆款文章（默认关键词 AI，可换任意关键词），按互动总量发现爆款，智能聚类生成深色主题 HTML 日报（封面图+互动数据+文章直链）。接口抓全库热门（无日期过滤），日报日期仅作标注。RedFox API Key ${c.has_key ? '已配置' : '未配置——去「设置」页填写'}。</p>
      </header>
      ${!c.has_key ? `<div class="empty" style="margin-bottom:var(--sp-6);padding:var(--sp-4) var(--sp-5);text-align:left"><div class="e-title">🔑 还没有配置 RedFox API Key</div><p>到<a href="#/settings">「设置」</a>页填写（ak_ 开头，<a href="https://redfox.hk/settings/api-keys?source=github" target="_blank" rel="noreferrer">红狐 hub 获取 ↗</a>）。接口抓全库热门内容（无日期过滤）。</p></div>` : ''}
      <section class="sec" style="margin-top:0">
        <div class="sec-head"><span class="num">01</span><h2>生成日报</h2></div>
        <div class="form" style="max-width:760px">
          <div class="field"><label>KEYWORDS · 关键词（逗号分隔；留空 = 默认 AI + 自动扩展词批量查询）</label>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <input id="f-kw" placeholder="如：Stable Diffusion,ComfyUI,AI绘画" style="flex:1;min-width:220px">
              <button class="btn accent" id="f-fetch">${ic('play')}生成日报</button>
            </div>
            <div class="hint">默认扩展词：${esc((c.expand_keywords || []).join(' / '))}。</div>
          </div>
          <div class="form-row">
            <div class="field"><label>DATE · 日报标注日期（接口抓全库热门，日期仅标注）</label>
              <input id="f-date" type="date" placeholder="yyyy-MM-dd"></div>
            <div class="field"><label>COUNT · 扫描条数上限</label>
              <select id="f-count"><option value="50">50</option><option value="100">100</option><option value="200" selected>200</option></select></div>
          </div>
          <div class="hint" id="f-status"></div>
        </div>
      </section>
      <section class="sec">
        <div class="sec-head"><span class="num">02</span><h2>日报归档</h2></div>
        ${feeds.length ? `<div class="cards">${feeds.map((r) => `
          <a class="card" href="#/f/${encodeURIComponent(r.feed_id)}">
            <div class="c-top">
              <div class="c-title">${esc(r.date)} 日报</div>
              ${r.has_report ? '<span class="chip done">有HTML</span>' : '<span class="chip">可生成</span>'}
            </div>
            <div class="c-sub">${r.total} 条 · ${r.topic_count} 类 · 关键词 ${esc((r.keywords || []).join('/'))}</div>
            ${(r.emerging || []).length ? `<div class="c-sub" style="color:var(--accent)">🔥 起量信号：${esc(r.emerging.join('、'))}</div>` : ''}
            <div class="c-foot"><span>${esc(String(r.fetched_at).slice(0, 16).replace('T', ' '))}</span><span style="margin-left:auto">${esc((r.categories || []).slice(0, 3).map((x) => x.category).join(' / '))}</span></div>
          </a>`).join('')}</div>`
        : `<div class="empty"><div class="e-title">还没有日报</div><p>点「生成日报」——按互动总量扫描AI公众号爆款文章并聚类成话题卡片。</p></div>`}
      </section>`
  }

  // ---------- 视图：日报详情 ----------
  function renderCards(container, clusters) {
    if (!clusters?.length) {
      container.innerHTML = '<div class="empty-inline">没有聚类数据。</div>'
      return
    }
    container.innerHTML = clusters.map((c, i) => `
      <div class="block" style="margin-bottom:var(--sp-5)">
        <div class="block-head"><span class="mono" style="color:var(--accent)">${String(i + 1).padStart(2, '0')}</span><h3>${esc(c.category)}</h3><span class="mono">${c.count} 条</span></div>
        <div class="plates">${c.articles.map((v) => `
          <div class="plate" style="--pc:var(--accent)">
            ${v.cover_url ? `<img class="p-cover" src="${esc(v.cover_url)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none'">` : ''}
            <div class="p-main">
              <div class="p-title">${v.url ? `<a href="${esc(v.url)}" target="_blank" rel="noreferrer">${esc(v.title)}</a>` : esc(v.title)}</div>
              <div class="p-meta">@${esc(v.author)} · ${esc(v.published_at ? String(v.published_at).slice(0, 16) : '--')}</div>
              <div class="p-eng">${[
                `👍 ${v.like_count}`,
                `💬 ${v.comment_count}`,
                `📤 ${v.share_count}`,
              ].map((s) => `<span>${esc(s)}</span>`).join('')}</div>
            </div>
            ${v.url ? `<a class="p-go" href="${esc(v.url)}" target="_blank" rel="noreferrer" title="查看视频">${ic('ext')}</a>` : ''}
          </div>`).join('')}</div>
      </div>`).join('')
    bindExternalLinks()
  }

  async function viewFeed(id) {
    let data
    try {
      data = await api(`/api/feeds/${encodeURIComponent(id)}`)
    } catch (e) {
      const netDown = !e.status
      return `<a class="back" href="#/">${ic('back')} 概览</a><div class="empty"><div class="e-title">${netDown ? '面板服务连接失败' : '日报记录不存在'}</div><p>${netDown ? '开发预览：DSH_HOME=<数据目录> node scripts/devserver.mjs' : esc(e.message)}</p></div>`
    }
    const meta = data.feed
    const raw = data.raw
    const cur = state.view || 'cards'

    const stats = `
      <div class="pstats">
        <div class="pstat" style="--pc:var(--accent)"><div class="p-name">扫描文章</div><div class="p-num">${meta.total}<span class="unit" style="font-size:12px;color:var(--text-helper)"> 条</span></div><div class="p-sub">${esc((meta.keywords || []).join(' / '))}</div></div>
        <div class="pstat" style="--pc:var(--accent)"><div class="p-name">聚类分类</div><div class="p-num">${meta.topic_count}</div><div class="p-sub">${esc((meta.categories || []).slice(0, 2).map((x) => x.category).join(' / '))}</div></div>
        <div class="pstat" style="--pc:var(--accent)"><div class="p-name">标注日期</div><div class="p-num" style="font-size:15px;padding-top:6px">${esc(meta.date)}</div><div class="p-sub">全库热门 · 日期仅标注</div></div>
        <div class="pstat" style="--pc:var(--accent)"><div class="p-name">抓取时间</div><div class="p-num" style="font-size:15px;padding-top:6px">${esc(String(meta.fetched_at).slice(11, 16))}</div><div class="p-sub">接口无日期过滤</div></div>
      </div>`

    const tabs = `
      <div class="ptabs" style="margin-bottom:0">
        <button class="ptab${cur === 'cards' ? ' on' : ''}" data-view-tab="cards" style="--pt:var(--accent)">📰 分类卡片</button>
      </div>`

    return `
      <a class="back" href="#/">${ic('back')} 概览</a>
      <div class="detail-head">
        <div>
          <h1>${esc(meta.date)} 日报</h1>
          <div class="c-sub" style="margin-top:4px">抓取于 ${esc(String(meta.fetched_at).slice(0, 16).replace('T', ' '))} · 记录 ${esc(meta.feed_id)}</div>
        </div>
        <div class="actions">
          ${meta.has_report
            ? `<button class="btn accent" data-open-report="${esc(id)}">${ic('ext')}打开 HTML 日报</button>`
            : `<button class="btn accent" id="mk-report">${ic('play')}生成 HTML 日报</button>`}
          <button class="btn ghost" data-dig="${esc(id)}">${ic('spark')}去对话深挖</button>
          <button class="btn ghost" data-del-feed="${esc(id)}" title="删除记录">${ic('trash')}</button>
        </div>
      </div>
      ${stats}
      ${tabs}
      <div id="view-cards"><div class="loading">LOADING…</div></div>`
  }

  function bindFeed(id, data) {
    const raw = data.raw
    renderCards(document.getElementById('view-cards'), raw?.clusters || [])
    // gzh 无情报 tab，单视图
    const del = document.querySelector('[data-del-feed]')
    if (del) del.onclick = async () => {
      if (!confirm('删除这期日报？（条目与 HTML 一并删除，不可恢复）')) return
      try {
        await apiDelete(`/api/feeds/${encodeURIComponent(id)}`)
        toast('已删除')
        location.hash = '#/'
      } catch (e) { toast(e.message, true) }
    }
    const dig = document.querySelector('[data-dig]')
    if (dig) dig.onclick = () => {
      sendAgentPrompt(digPrompt(data.feed), '已在宿主开新对话——agent 深挖后输出调查报告')
    }
    const mk = document.getElementById('mk-report')
    if (mk) mk.onclick = async () => {
      mk.disabled = true
      try {
        await apiPost(`/api/feeds/${encodeURIComponent(id)}/report`)
        toast('HTML 日报已生成')
        location.reload()
      } catch (e) { toast(e.message, true); mk.disabled = false }
    }
  }

  // ---------- HTML 日报查看器（面板内嵌） ----------
  async function openReportView(id) {
    document.getElementById('report-view')?.remove()
    const el = document.createElement('div')
    el.id = 'report-view'
    el.className = 'report-view'
    el.innerHTML = `
      <div class="rv-panel" role="dialog" aria-modal="true" aria-label="HTML 日报">
        <div class="rv-bar">
          <div class="rv-title">${ic('ext')}<span>深色主题 HTML 日报</span></div>
          <div class="rv-actions">
            <button class="btn ghost" id="rv-close">关闭</button>
          </div>
        </div>
        <div class="rv-body"><div class="loading">LOADING…</div></div>
      </div>`
    document.body.appendChild(el)
    const body = el.querySelector('.rv-body')
    const close = () => {
      removeEventListener('keydown', onKey)
      el.remove()
    }
    const onKey = (e) => { if (e.key === 'Escape') close() }
    addEventListener('keydown', onKey)
    el.querySelector('#rv-close').onclick = close
    el.addEventListener('click', (e) => { if (e.target === el) close() })
    try {
      const res = await fetch(`/gzh-ai-feed/api/feeds/${encodeURIComponent(id)}/report`, { cache: 'no-store' })
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}))
        throw new Error(detail.error || `HTTP ${res.status}`)
      }
      const html = await res.text()
      const frame = document.createElement('iframe')
      frame.className = 'rv-frame'
      frame.title = 'HTML 日报'
      frame.srcdoc = html
      body.innerHTML = ''
      body.appendChild(frame)
    } catch (e) {
      body.innerHTML = `<div class="empty"><div class="e-title">日报打不开</div><p>${esc(e.message)}</p></div>`
    }
  }

  // ---------- 视图：设置 ----------
  function viewSettings() {
    return `
      <a class="back" href="#/">${ic('back')} 概览</a>
      <header class="head">
        <span class="eyebrow">SETTINGS</span>
        <h1>设<strong>置</strong></h1>
        <p>RedFox API Key 是查询的唯一凭证。这里保存的 Key 优先于环境变量，低于插件配置。接口抓全库热门内容（无日期过滤），日报日期仅作标注。</p>
      </header>
      <div class="form">
        <div class="field"><label>API KEY · RedFox API Key（ak_ 开头）</label>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <input id="s-key" placeholder="ak_…" style="flex:1;min-width:220px;font-family:var(--font-mono);font-size:12px">
            <button class="btn" id="s-key-save">保存 Key</button>
          </div>
          <div class="hint" id="s-key-hint">…</div>
          <div class="hint">获取：<a href="https://redfox.hk/settings/api-keys?source=github" target="_blank" rel="noreferrer">redfox.hk/settings/api-keys ↗</a>。保存在本机 dsh 数据目录，不上传。</div>
        </div>
        <div class="field"><label>PROXY · HTTP(S) 代理（访问 redfox.hk 走代理时填；清空 = 直连）</label>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <input id="s-proxy" placeholder="http://127.0.0.1:7890" style="flex:1;min-width:220px;font-family:var(--font-mono);font-size:12px">
            <button class="btn" id="s-proxy-save">保存代理</button>
          </div>
        </div>
        <div class="field"><label>API BASE · 接口地址（测试/自建网关用，默认 https://redfox.hk）</label>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <input id="s-base" placeholder="https://redfox.hk" style="flex:1;min-width:220px;font-family:var(--font-mono);font-size:12px">
            <button class="btn" id="s-base-save">保存地址</button>
          </div>
        </div>
      </div>`
  }

  async function bindSettings() {
    async function refreshSettings() {
      try {
        const { settings } = await api('/api/settings')
        const keyHint = document.getElementById('s-key-hint')
        if (keyHint) keyHint.textContent = settings.has_key
          ? `已配置（…${settings.key_tail || '******'}${settings.from_env ? '，其中环境变量可用' : ''}）。重新输入会覆盖。`
          : '未配置。'
        const inp = document.getElementById('s-key')
        if (inp && document.activeElement !== inp) inp.placeholder = settings.has_key ? `已配置（…${settings.key_tail}），输入新值覆盖` : 'ak_…'
        const proxy = document.getElementById('s-proxy')
        if (proxy && document.activeElement !== proxy) proxy.value = settings.proxy_url || ''
        const base = document.getElementById('s-base')
        if (base && document.activeElement !== base) base.value = settings.api_base || ''
      } catch { /* 宿主未就绪 */ }
    }
    await refreshSettings()
    const bind = (id, payload) => {
      const btn = document.getElementById(id)
      if (!btn) return
      btn.onclick = async () => {
        try {
          const input = btn.parentElement.querySelector('input')
          await apiPost('/api/settings', payload(input.value.trim()))
          toast('设置已保存')
          await refreshSettings()
          loadCatalog().catch(() => {})
        } catch (e) { toast(e.message, true) }
      }
    }
    bind('s-key-save', (v) => ({ api_key: v }))
    bind('s-proxy-save', (v) => ({ proxy_url: v }))
    bind('s-base-save', (v) => ({ api_base: v }))
  }

  // ---------- 渲染辅助 ----------
  function bindCommon() {
    bindExternalLinks()
    document.querySelectorAll('[data-open-report]').forEach((b) => {
      b.onclick = () => { openReportView(b.dataset.openReport) }
    })
    const fetchBtn = document.getElementById('f-fetch')
    if (fetchBtn) fetchBtn.onclick = async () => {
      const kw = document.getElementById('f-kw')?.value.trim() || ''
      const date = document.getElementById('f-date')?.value || ''
      fetchBtn.disabled = true
      const status = document.getElementById('f-status')
      if (status) status.textContent = '扫描中（batch 批量查询，约几秒）…'
      try {
        const r = await apiPost('/api/feeds', {
          date: date || 'latest',
          keywords: kw || undefined,
          count: Number(document.getElementById('f-count')?.value) || 200,
        })
        toast(`日报完成：${r.feed.total} 条 · ${r.feed.topic_count} 类`)
        state.view = 'cards'
        location.hash = `#/f/${encodeURIComponent(r.feed.feed_id)}`
      } catch (e) {
        toast(e.message, true)
        if (status) status.textContent = ''
      }
      fetchBtn.disabled = false
    }
    // gzh 接口无日期过滤，日期仅作标注语义（不需要拦截）
  }

  // ---------- 路由 ----------
  async function render() {
    try { await loadCatalog() } catch {}
    const hash = location.hash || '#/'
    const mf = hash.match(/^#\/f\/(.+)$/)
    const feedId = mf ? decodeURIComponent(mf[1]) : null
    document.querySelectorAll('.nav a').forEach((a) => {
      const cur = feedId ? '' : hash === '#/' ? 'home' : hash.startsWith('#/settings') ? 'settings' : 'home'
      a.classList.toggle('on', a.dataset.view === cur)
    })
    if (feedId && /^[\p{L}\p{N}_-]+$/u.test(feedId)) {
      $app.innerHTML = await viewFeed(feedId)
      bindCommon()
      try {
        const data = await api(`/api/feeds/${encodeURIComponent(feedId)}`)
        bindFeed(feedId, data)
      } catch { /* 卡片已在 HTML 中提示错误 */ }
      return
    }
    if (hash.startsWith('#/settings')) { $app.innerHTML = viewSettings(); bindCommon(); bindSettings(); return }
    $app.innerHTML = viewHome()
    bindCommon()
  }

  async function boot() {
    try { await loadCatalog() } catch {
      state.catalog = { version: '-', has_key: false, key_source: 'none', feeds: [], settings: {} }
      renderNavCounts()
    }
    render().catch(() => {})
  }
  // 报告 iframe 里的链接点击会 postMessage 过来，统一交给 openLink 走系统浏览器
  addEventListener('message', (e) => {
    if (e.origin !== location.origin) return
    const m = e.data
    if (m && m.type === 'dsh:open-link' && typeof m.url === 'string') openLink(m.url)
  })
  addEventListener('hashchange', () => { state.view = 'cards'; render() })
  boot()
  setTimeout(() => { if (!state.catalog?.version || state.catalog.version === '-') boot() }, 2500)
})()
