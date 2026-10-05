// ==UserScript==
// @name         YouTube 帖子/评论 导出 Markdown
// @namespace    https://github.com/marko/yt-post-md
// @version      1.0.0
// @description  将 YouTube 社区帖子(/post/…)及评论、回复导出为 .md 文件(视频页评论也可用)
// @match        https://www.youtube.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  let running = false, cancel = false;

  /* ---------- UI ---------- */
  const btn = document.createElement('button');
  btn.textContent = '⬇ 导出 MD';
  btn.title = '点击:加载全部评论+回复并导出\nShift+点击:只导出当前已加载内容';
  Object.assign(btn.style, {
    position: 'fixed', right: '16px', bottom: '16px', zIndex: 99999,
    padding: '8px 14px', border: 'none', borderRadius: '18px',
    background: '#065fd4', color: '#fff', font: '14px/1.2 Roboto,Arial,sans-serif',
    cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,.35)', display: 'none',
  });
  document.body.appendChild(btn);
  setInterval(() => {
    const p = location.pathname;
    btn.style.display = p.startsWith('/post/') || p === '/watch' ? 'block' : 'none';
  }, 800);

  btn.addEventListener('click', async (e) => {
    if (running) { cancel = true; btn.textContent = '正在收尾…'; return; }
    running = true; cancel = false;
    try {
      if (!e.shiftKey) await loadAll();
      const md = buildMarkdown();
      download(md.name, md.text);
      btn.textContent = `✔ 已导出 (${md.count} 条)`;
    } catch (err) {
      console.error(err);
      btn.textContent = '✖ 出错,见控制台';
    }
    running = false;
    setTimeout(() => (btn.textContent = '⬇ 导出 MD'), 4000);
  });

  /* ---------- 加载全部评论与回复 ---------- */
  const countLoaded = () => $$('ytd-comment-thread-renderer').length;
  const totalComments = () => {
    const t = $('ytd-comments-header-renderer #count')?.textContent || '';
    const n = parseInt(t.replace(/[^\d]/g, ''), 10);
    return isNaN(n) ? 0 : n;
  };

  async function loadAll() {
    // 1) 向下滚动加载顶层评论
    let stable = 0, last = -1;
    while (!cancel && stable < 5) {
      window.scrollTo(0, document.documentElement.scrollHeight);
      await sleep(1200);
      const n = countLoaded();
      stable = n === last ? stable + 1 : 0;
      last = n;
      btn.textContent = `加载评论 ${n}…(再点取消)`;
    }
    // 2) 展开所有回复
    const clickedAt = new WeakMap();
    let idle = 0;
    while (!cancel && idle < 4) {
      const targets = $$(
        'ytd-comment-replies-renderer #more-replies button,' +
        'ytd-comment-replies-renderer #more-replies-sub-thread button,' +
        'ytd-comment-replies-renderer ytd-continuation-item-renderer button'
      ).filter((b) => b.offsetParent !== null && Date.now() - (clickedAt.get(b) || 0) > 4000);
      if (!targets.length) { idle++; await sleep(1000); continue; }
      idle = 0;
      for (const b of targets) {
        if (cancel) break;
        clickedAt.set(b, Date.now());
        b.scrollIntoView({ block: 'center' });
        b.click();
        await sleep(500);
      }
      const replies = $$('ytd-comment-replies-renderer ytd-comment-view-model').length;
      btn.textContent = `展开回复 ${replies}…(再点取消)`;
      await sleep(900);
    }
    window.scrollTo(0, 0);
  }

  /* ---------- DOM → Markdown ---------- */
  function cleanUrl(href) {
    try {
      const u = new URL(href, location.href);
      if (u.pathname === '/redirect' && u.searchParams.get('q')) return u.searchParams.get('q');
      return u.href;
    } catch { return href; }
  }

  function walk(n) {
    if (n.nodeType === 3) return n.textContent;
    if (n.nodeType !== 1) return '';
    const tag = n.tagName;
    if (tag === 'IMG') return n.getAttribute('alt') || '';
    if (tag === 'BR') return '\n';
    const inner = [...n.childNodes].map(walk).join('');
    if (tag === 'A' && n.getAttribute('href')) {
      const url = cleanUrl(n.href);
      const txt = inner.trim();
      if (!txt) return url;
      if (/^https?:\/\//.test(txt) || /^…?[\w.-]+\.[a-z]{2,}\//i.test(txt)) return url;
      return `[${txt}](${url})`;
    }
    return inner;
  }

  const textOf = (el) => (el ? walk(el).replace(/\u00a0/g, ' ').replace(/\n{3,}/g, '\n\n').trim() : '');
  const quote = (s, prefix = '> ') => s.split('\n').map((l) => prefix + l).join('\n');

  function parseComment(v) {
    const author = $('#author-text', v)?.textContent.trim() || '';
    const time = $('#published-time-text', v)?.textContent.trim() || '';
    const likes = $('#vote-count-middle', v)?.textContent.trim() || '';
    const heart = !!$('#creator-heart #creator-heart-button, #creator-heart ytd-creator-heart-renderer', v);
    const pinned = $('#pinned-comment-badge', v)?.children.length > 0;
    const isOwner = ($('#author-comment-badge', v)?.children.length || 0) > 0;
    const text = textOf($('#content-text', v));
    return { author, time, likes, heart, pinned, isOwner, text };
  }

  const header = (c, idx) => {
    const tags = [];
    if (c.pinned) tags.push('📌置顶');
    if (c.isOwner) tags.push('👑作者');
    if (c.heart) tags.push('❤️作者点赞');
    return `**${c.author}**${tags.length ? ' ' + tags.join(' ') : ''} · ${c.time}${c.likes ? ' · 👍 ' + c.likes : ''}`;
  };

  function parsePost() {
    const p = $('ytd-backstage-post-renderer');
    if (!p) return null;
    const authorEl = $('#author-text', p);
    const author = authorEl?.textContent.trim() || '';
    const authorUrl = authorEl?.href || '';
    const time = $('#published-time-text', p)?.textContent.trim() || '';
    const url = $('#published-time-text a', p)?.href || location.href;
    const text = textOf($('#content-text', p));
    const likes = $('#vote-count-middle', p)?.textContent.trim() || '';
    const images = $$('ytd-backstage-image-renderer img, #post-image img, #attachment img', p)
      .map((i) => i.src).filter((s) => s && !s.startsWith('data:'))
      .map((s) => s.replace(/=[sw]\d+[^/]*$/, '=s0'));
    const videos = $$('a[href*="/watch?v="]', p).map((a) => a.href);
    return { author, authorUrl, time, url, text, likes, images: [...new Set(images)], videos: [...new Set(videos)] };
  }

  function buildMarkdown() {
    const post = parsePost();
    const threads = $$('ytd-comment-thread-renderer');
    const lines = [];
    let name, title, total = 0;

    if (post) {
      const first = post.text.split('\n')[0].slice(0, 30);
      title = `${post.author} 的社区帖子${first ? ':' + first : ''}`;
      lines.push(
        '---',
        `title: "${title.replace(/"/g, '\\"')}"`,
        `source: ${post.url}`,
        `author: "${post.author}"`,
        `author_url: ${post.authorUrl}`,
        `published: "${post.time}"`,
        `likes: "${post.likes}"`,
        `exported: ${new Date().toISOString()}`,
        '---', '',
        `# ${title}`, '',
        post.text, ''
      );
      post.images.forEach((s, i) => lines.push(`![图${i + 1}](${s})`, ''));
      post.videos.forEach((s) => lines.push(`📺 附带视频:${s}`, ''));
    } else {
      const vt = $('h1.ytd-watch-metadata')?.textContent.trim() || document.title;
      title = vt;
      lines.push('---', `title: "${vt.replace(/"/g, '\\"')}"`, `source: ${location.href}`,
        `exported: ${new Date().toISOString()}`, '---', '', `# ${vt}`, '');
    }

    lines.push('---', '', `## 评论(顶层 ${threads.length} / 页面显示共 ${totalComments() || '?'})`, '');

    threads.forEach((th, i) => {
      const top = $('#comment > ytd-comment-view-model', th) || $('ytd-comment-view-model', th);
      if (!top) return;
      const c = parseComment(top);
      total++;
      lines.push(`### ${i + 1}. ${header(c)}`, '', c.text, '');
      const replies = $$('ytd-comment-replies-renderer ytd-comment-view-model', th);
      replies.forEach((rv) => {
        const r = parseComment(rv);
        total++;
        lines.push(quote(`${header(r)}\n\n${r.text}`), '');
      });
      const more = $('ytd-comment-replies-renderer #more-replies button', th);
      if (more && more.offsetParent !== null && !replies.length) {
        lines.push(`> _(${more.getAttribute('aria-label') || '回复'} 未展开)_`, '');
      }
    });

    name = (title || 'youtube-post').replace(/[\\/:*?"<>|\n\r]+/g, ' ').trim().slice(0, 80) + '.md';
    return { name, text: lines.join('\n').replace(/\n{3,}/g, '\n\n'), count: total };
  }

  function download(name, text) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
})();
