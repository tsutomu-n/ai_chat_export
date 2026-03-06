javascript:(async()=>{'use strict';
/**
 * AIチャット書き出し（日本語UI）
 * - 対象: ChatGPT (chatgpt.com / chat.openai.com) / Google AI Studio (aistudio.google.com) / Grok (grok系 / x.com/i/grok) / フォールバック
 * - 形式: 標準Markdown（デフォルト）/ Obsidian向け / JSON（任意）
 * - 重要: サイトの表示や規約変更で壊れる可能性があります。壊れたら直す前提の個人ツールです。
 */

if (window.__AI_CHAT_EXPORT_RUNNING__) {
  try { alert('すでに実行中です。'); } catch {}
  return;
}
window.__AI_CHAT_EXPORT_RUNNING__ = true;

const APP_ID = 'ai-chat-export';
const APP_STORAGE_VER = 'v1';
const Z = 2147483647;

const THEME = {
  bg:'#0f1116', surface:'#141821', fg:'#f5f7fb', border:'#2a3140',
  accent:'#3b82f6', accentHover:'#5b9dff', accentLine:'#5fa2ff',
  ok:'#16a34a', warn:'#d97706', bad:'#dc2626',
  muted:'#c4ccda',
  font:'"Segoe UI Variable Text","Segoe UI","Yu Gothic UI",Meiryo,"Noto Sans JP",sans-serif',
  mono:'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace'
};

class Utils{
  static el(tag, props={}, children=null){
    const e=document.createElement(tag);
    for(const [k,v] of Object.entries(props||{})){
      if (k==='style') e.setAttribute('style', v);
      else if (k==='text') e.textContent = v;
      else if (k.startsWith('on') && typeof v==='function') e.addEventListener(k.slice(2), v);
      else if (v!==undefined && v!==null) e.setAttribute(k, String(v));
    }
    if (children!=null){
      const arr=Array.isArray(children)?children:[children];
      for(const c of arr){
        if (c==null) continue;
        e.appendChild(typeof c==='string'?document.createTextNode(c):c);
      }
    }
    return e;
  }
  static sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }
  static clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }
  static nowIso(){ return new Date().toISOString(); }
  static isVisible(el){
    if (!el || !(el instanceof Element)) return false;
    const r = el.getBoundingClientRect();
    if (r.width<2 || r.height<2) return false;
    if (r.bottom<0 || r.top>window.innerHeight) return false;
    const cs = getComputedStyle(el);
    if (cs.display==='none' || cs.visibility==='hidden' || cs.opacity==='0') return false;
    return true;
  }
  static toast(msg, kind='info', ms=2200){
    const colors = {info:THEME.accent, success:THEME.ok, warn:THEME.warn, error:THEME.bad};
    const box = Utils.el('div',{style:`position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:${Z};background:${THEME.surface};border:1px solid ${THEME.border};border-left:6px solid ${colors[kind]||THEME.accent};color:${THEME.fg};padding:10px 12px;border-radius:12px;box-shadow:0 8px 20px rgba(0,0,0,.35);max-width:min(92vw,760px);font:500 14px/1.65 ${THEME.font};`},[
      Utils.el('div',{text:msg,style:'white-space:pre-wrap;word-break:break-word;'})
    ]);
    document.body.appendChild(box);
    setTimeout(()=>{ try{box.remove();}catch{} }, ms);
  }
  static safeText(s){ return (s??'').toString().replace(/\u00a0/g,' '); }

  static djb2(str){
    let h=5381;
    for(let i=0;i<str.length;i++){
      h=((h<<5)+h) ^ str.charCodeAt(i);
      h=h>>>0;
    }
    return h.toString(16);
  }

  static normalizeTitle(s){
    s = (s||'').replace(/\s+/g,' ').trim();
    // よくあるサイト接尾語を落とす（壊れてもOKな“ゆるい”整形）
    s = s.replace(/\s*-\s*ChatGPT\s*$/i,'')
         .replace(/\s*\|\s*ChatGPT\s*$/i,'')
         .replace(/\s*-\s*Grok\s*$/i,'')
         .replace(/\s*\|\s*Grok\s*$/i,'');
    return s || '会話';
  }

  static formatDateJST(d){
    const pad=n=>String(n).padStart(2,'0');
    const yyyy=d.getFullYear();
    const mm=pad(d.getMonth()+1);
    const dd=pad(d.getDate());
    const hh=pad(d.getHours());
    const mi=pad(d.getMinutes());
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
  }

  static filenameSafe(s){
    return (s||'').replace(/[\\/:*?"<>|]+/g,'_').replace(/\s+/g,' ').trim().slice(0,120) || 'chat';
  }

  static domPath(el){
    try{
      if (!el || !(el instanceof Element)) return '';
      const parts = [];
      let cur = el;
      let depth = 0;
      while (cur && cur.nodeType === Node.ELEMENT_NODE && depth < 12){
        const tag = (cur.tagName || '').toLowerCase();
        if (!tag) break;
        if (cur.id){
          parts.push(`${tag}#${cur.id}`);
          break;
        }
        const parent = cur.parentElement;
        const siblings = parent ? Array.from(parent.children).filter(x => (x.tagName || '').toLowerCase() === tag) : [];
        const idx = parent ? Math.max(1, siblings.indexOf(cur) + 1) : 1;
        parts.push(`${tag}:nth-of-type(${idx})`);
        cur = parent;
        depth++;
      }
      return parts.reverse().join('>');
    }catch{
      return '';
    }
  }

  static maxFenceRun(text, ch){
    let max = 0;
    let cur = 0;
    const s = String(text || '');
    for (let i=0;i<s.length;i++){
      if (s[i] === ch){
        cur++;
        if (cur > max) max = cur;
      } else {
        cur = 0;
      }
    }
    return max;
  }

  static chooseCodeFence(text, lang=''){
    const body = String(text || '');
    const safeLang = String(lang || '').replace(/[`~\s]+/g,'').trim();
    const backtickLen = Math.max(3, this.maxFenceRun(body, '`') + 1);
    const tildeLen = Math.max(3, this.maxFenceRun(body, '~') + 1);
    const useTilde = safeLang.includes('`') || backtickLen > tildeLen;
    return {
      fence: (useTilde ? '~' : '`').repeat(useTilde ? tildeLen : backtickLen),
      lang: safeLang
    };
  }

  static escapeMarkdownLinkLabel(s){
    return String(s || '')
      .replace(/\\/g,'\\\\')
      .replace(/\[/g,'\\[')
      .replace(/\]/g,'\\]')
      .replace(/\r?\n/g,' ');
  }

  static normalizeExportUrl(raw){
    const s = String(raw || '').trim();
    if (!s) return '';
    if (s.startsWith('#')) return s;
    const low = s.toLowerCase();
    if (low.startsWith('javascript:')) return '';
    if (low.startsWith('data:') || low.startsWith('blob:') || low.startsWith('mailto:') || low.startsWith('tel:')) return s;
    try{
      return new URL(s, location.href).href;
    }catch{
      return s;
    }
  }

  static escapeMarkdownLinkDestination(raw){
    const url = this.normalizeExportUrl(raw);
    if (!url) return '';
    return url
      .replace(/\\/g,'%5C')
      .replace(/ /g,'%20')
      .replace(/\(/g,'%28')
      .replace(/\)/g,'%29')
      .replace(/\[/g,'%5B')
      .replace(/\]/g,'%5D');
  }
}

class MarkdownParser{
  static extract(root){
    const txt = this.parse(root, {listDepth:0});
    return this.clean(txt);
  }

  static parse(node, ctx){
    if (!node) return '';
    if (node.shadowRoot) return this.parse(node.shadowRoot, ctx);

    if (node.nodeType === Node.TEXT_NODE){
      return Utils.safeText(node.textContent);
    }
    if (node.nodeType !== Node.ELEMENT_NODE){
      return '';
    }

    const el = node;
    const tag = (el.tagName||'').toLowerCase();

    // 非表示は捨てる（クリック展開で現れる想定）
    const cs = getComputedStyle(el);
    if (cs.display==='none' || cs.visibility==='hidden') return '';

    // code block: なるべく <code> だけを見る
    if (tag === 'pre'){
      const code = el.querySelector('code');
      const raw = (code ? code.textContent : el.textContent) || '';
      const lang = code ? ((code.className.match(/language-([\w-]+)/)||[])[1]||'') : '';
      const body = Utils.safeText(raw).replace(/\n{3,}/g,'\n\n').trim();
      if (!body) return '';
      const {fence, lang: safeLang} = Utils.chooseCodeFence(body, lang);
      return `\n${fence}${safeLang}\n${body}\n${fence}\n\n`;
    }

    // 画像
    if (tag === 'img'){
      const alt = Utils.escapeMarkdownLinkLabel(el.getAttribute('alt') || '画像');
      const src = Utils.escapeMarkdownLinkDestination(el.getAttribute('src') || '');
      if (src) return `![${alt}](${src})`;
      return `![${alt}](画像)`;
    }

    // 子のMarkdown
    const childCtx = {...ctx};
    let children = '';
    if (tag === 'ul' || tag === 'ol'){
      childCtx.listDepth = (ctx.listDepth||0) + 1;
      // liだけに絞る（余計なdiv混入を避ける）
      const items = Array.from(el.children).filter(c=> (c.tagName||'').toLowerCase()==='li');
      children = items.map(li=> this.parse(li, childCtx)).join('');
      return `\n${children}\n`;
    } else {
      children = Array.from(el.childNodes).map(c=> this.parse(c, ctx)).join('');
    }

    switch(tag){
      case 'br': return '\n';
      case 'p': case 'div': case 'article': case 'section':
        return `\n${children}\n`;
      case 'h1': return `\n# ${children.trim()}\n`;
      case 'h2': return `\n## ${children.trim()}\n`;
      case 'h3': return `\n### ${children.trim()}\n`;
      case 'h4': return `\n#### ${children.trim()}\n`;
      case 'h5': return `\n##### ${children.trim()}\n`;
      case 'h6': return `\n###### ${children.trim()}\n`;
      case 'strong': case 'b': return `**${children.trim()}**`;
      case 'em': case 'i': return `*${children.trim()}*`;
      case 'code': {
        const t = children.trim();
        if (!t) return '';
        return `\`${t.replace(/`/g,'\\`')}\``;
      }
      case 'a': {
        const hrefRaw = el.getAttribute('href') || '';
        const href = Utils.escapeMarkdownLinkDestination(hrefRaw);
        const label = Utils.escapeMarkdownLinkLabel(children.trim() || hrefRaw || 'リンク');
        if (!href) return label;
        return `[${label}](${href})`;
      }
      case 'hr': return `\n---\n`;
      case 'blockquote': {
        const t = children.trim();
        if (!t) return '';
        return `\n> ${t.replace(/\n/g,'\n> ')}\n`;
      }
      case 'li': {
        const depth = ctx.listDepth||1;
        const indent = '  '.repeat(Math.max(0, depth-1));
        const parentTag = (el.parentElement?.tagName||'').toLowerCase();
        const t = children.trim().replace(/\n/g, '\n' + indent + '  ');
        if (!t) return '';
        if (parentTag === 'ol'){
          const siblings = Array.from(el.parentElement?.children||[]).filter(x=> (x.tagName||'').toLowerCase()==='li');
          const idx = siblings.indexOf(el) + 1;
          return `\n${indent}${idx}. ${t}`;
        }
        return `\n${indent}- ${t}`;
      }
      case 'table':
        return `\n${this.tableToMarkdown(el)}\n`;
      default:
        return children;
    }
  }

  static tableToMarkdown(table){
    try{
      const rows = Array.from(table.querySelectorAll('tr'));
      if (!rows.length) return '';
      const matrix = rows.map(r => Array.from(r.querySelectorAll('th,td')).map(c => (c.innerText||'').replace(/\s+/g,' ').trim()));
      const colN = Math.max(...matrix.map(r=>r.length));
      const norm = matrix.map(r => r.concat(Array(colN - r.length).fill('')));
      const headerLike = rows[0].querySelectorAll('th').length>0;
      const header = norm[0];
      const body = norm.slice(1);
      const esc = s => (s||'').replace(/\|/g,'\\|');
      const mkRow = r => `| ${r.map(esc).join(' | ')} |`;
      const sep = `| ${Array(colN).fill('---').join(' | ')} |`;
      if (headerLike){
        return [mkRow(header), sep, ...body.map(mkRow)].join('\n');
      }
      // headerが無い表は、先頭行をヘッダ扱いにせず、空ヘッダを作って崩れを防ぐ
      const emptyHeader = Array(colN).fill('');
      return [mkRow(emptyHeader), sep, ...norm.map(mkRow)].join('\n');
    }catch{
      return '';
    }
  }

  static clean(md){
    md = (md||'').replace(/\r/g,'');
    // UI由来の余計な連続改行を抑える
    md = md.replace(/[ \t]+\n/g,'\n');
    md = md.replace(/\n{4,}/g,'\n\n\n');
    md = md.replace(/\n{3,}$/g,'\n\n');
    return md.trim();
  }
}

// ---------------- Adapters ----------------
class BaseAdapter{
  constructor(){ this.id='generic'; this.label='汎用'; }
  matches(){ return true; }
  getConversationKey(){ return `${location.origin}${location.pathname}`; }
  getTitle(){
    return Utils.normalizeTitle(document.title || '会話');
  }
  getPreferredScrollContainerSelectors(){ return []; }
  extractMessages(){
    // 汎用フォールバックは fail-closed に寄せる。
    // “それっぽい”会話ログを作るより、未対応として止める方が安全。
    return [];
  }
  findExpandButtons(root){ return []; }
}

class ChatGPTAdapter extends BaseAdapter{
  constructor(){ super(); this.id='chatgpt'; this.label='ChatGPT'; }
  matches(){
    const h=location.hostname.toLowerCase();
    return h==='chatgpt.com' || h.endsWith('.chatgpt.com') || h==='chat.openai.com';
  }
  getConversationKey(){
    // /c/<id> 等があるならそれを使う
    const m = location.pathname.match(/\/c\/([a-z0-9-]+)/i);
    if (m) return `${location.origin}/c/${m[1]}`;
    return super.getConversationKey();
  }
  getTitle(){
    // ChatGPTはサイドバーや上部にタイトルがあることが多い
    const h = document.querySelector('main h1, header h1, [data-testid="conversation-title"]');
    const t = (h?.textContent||'').trim();
    return Utils.normalizeTitle(t || document.title || '会話');
  }
  getPreferredScrollContainerSelectors(){
    // だいたい main がスクロール
    return ['main', 'div[role="main"]', 'body'];
  }
  extractMessages(){
    const els = Array.from(document.querySelectorAll('[data-message-author-role]'));
    if (els.length){
      return els.map(el=>{
        const roleRaw = (el.getAttribute('data-message-author-role') || el.dataset.messageAuthorRole || '').toLowerCase();
        const role = roleRaw==='user' ? 'User' : (roleRaw==='assistant' ? 'Model' : (roleRaw||'').includes('tool') ? 'Tool' : 'Model');
        const content = MarkdownParser.extract(el);
        return {role, content, sig:this.nodeSig(el)};
      }).filter(m=>m.content && m.content.length>0);
    }
    // fallback: conversation-turn
    const turns = Array.from(document.querySelectorAll('article[data-testid^="conversation-turn-"], div[data-testid^="conversation-turn-"]'));
    if (!turns.length) return [];
    return turns.map((el,idx)=>{
      let role='Unknown';
      if (el.querySelector('[data-message-author-role="user"]')) role='User';
      else if (el.querySelector('[data-message-author-role="assistant"]')) role='Model';
      const content = MarkdownParser.extract(el);
      return {role, content, sig:this.nodeSig(el)};
    }).filter(m=>m.content && m.content.length>0);
  }
  nodeSig(el){
    // DOMの安定識別子があるなら使う
    const id = el.getAttribute('data-message-id') || el.id || '';
    if (id) return `id:${id}`;
    const path = Utils.domPath(el);
    if (path) return `p:${path}`;
    const txt = (el.innerText||'').replace(/\s+/g,' ').trim().slice(0,500);
    return `h:${Utils.djb2(txt)}`;
  }
  findExpandButtons(root){
    // ChatGPT内の「続きを読む」「Show more」など
    const candidates = Array.from(root.querySelectorAll('button, a[role="button"]'));
    return candidates.filter(b=>{
      const textRaw = (b.textContent||'').trim();
      const t = textRaw.replace(/\s+/g,'');
      if (!t) return false;
      if (!Utils.isVisible(b)) return false;
      // 肯定
      const ok = /^(続きを読む|もっと見る|続き(を)?表示|全文表示|展開|表示を増やす|Showmore|Readmore|Expand|Expandall)$/i.test(t)
        || /(続きを読む|もっと見る|Show more|Read more|Expand|Expand all)/i.test(textRaw);
      if (!ok) return false;
      // 否定（誤爆防止）
      const bad = /(削除|Delete|Remove|ログアウト|Log out|共有|Share|設定|Setting|新しいチャット|New chat|停止|Stop|再生成|Regenerate|Continue generating|Retry|再試行|やり直し)/i.test(textRaw);
      if (bad) return false;
      // リンクのaは危険なので、role=buttonのみ許す（外部遷移防止）
      if (b.tagName.toLowerCase()==='a'){
        const href=b.getAttribute('href')||'';
        if (href && !href.startsWith('#')) return false;
      }
      return true;
    });
  }
}

class AIStudioAdapter extends BaseAdapter{
  constructor(){ super(); this.id='aistudio'; this.label='Google AI Studio'; }
  matches(){
    const h = location.hostname.toLowerCase();
    return h === 'aistudio.google.com' || h.endsWith('.aistudio.google.com') || h.includes('aistudio');
  }
  getConversationKey(){
    return `${location.origin}${location.pathname}${location.search||''}`;
  }
  getTitle(){
    const h = document.querySelector('h1.mode-title, h1.actions, main h1, header h1');
    const t = (h?.textContent||'').trim();
    return Utils.normalizeTitle(t || document.title || '会話');
  }
  getPreferredScrollContainerSelectors(){
    return ['ms-chat-history', 'main', 'div[role="main"]', 'body'];
  }
  extractMessages(){
    const turns = Array.from(document.querySelectorAll('ms-chat-turn'));
    if (!turns.length) return [];
    const out = [];
    for (const t of turns){
      const container = t.querySelector('.chat-turn-container') || t.closest('.chat-turn-container');
      const className = (container?.className || '').toLowerCase();
      const role = container?.classList?.contains('user') || className.includes('user') ? 'User' : 'Model';
      const contentNode = t.querySelector('.turn-content') || t;
      let content = MarkdownParser.extract(contentNode);
      if (!content || content === 'more_vert'){
        const fallback = Utils.safeText(contentNode.textContent || '').trim();
        content = fallback === 'more_vert' ? '' : fallback;
      }
      if (!content) continue;
      out.push({role, content, sig:this.nodeSig(t)});
    }
    return out;
  }
  nodeSig(el){
    const id = el.getAttribute('data-turn-id') || el.getAttribute('data-message-id') || el.id || '';
    if (id) return `id:${id}`;
    const path = Utils.domPath(el);
    if (path) return `p:${path}`;
    const txt = (el.innerText||'').replace(/\s+/g,' ').trim().slice(0,500);
    return `h:${Utils.djb2(txt)}`;
  }
  findExpandButtons(root){
    const candidates = Array.from(root.querySelectorAll('button, a[role="button"]'));
    return candidates.filter(b=>{
      const text = (b.textContent||'').trim();
      if (!text) return false;
      if (!Utils.isVisible(b)) return false;
      const ok = /(続きを読む|もっと見る|続き|全文|展開|表示を増やす|Show more|Read more|Expand|Expand all)/i.test(text);
      if (!ok) return false;
      const bad = /(削除|Delete|Remove|ログアウト|Log out|共有|Share|設定|Setting|停止|Stop|再生成|Regenerate|Continue generating|Retry|再試行|やり直し)/i.test(text);
      if (bad) return false;
      if (b.tagName.toLowerCase()==='a'){
        const href = b.getAttribute('href')||'';
        if (href && !href.startsWith('#')) return false;
      }
      return true;
    });
  }
}

class GrokAdapter extends BaseAdapter{
  constructor(){ super(); this.id='grok'; this.label='Grok'; }
  matches(){
    const host=location.hostname.toLowerCase();
    const path=location.pathname.toLowerCase();
    if (host.includes('grok')) return true;
    if ((host==='x.com'||host.endsWith('.x.com')||host==='twitter.com'||host.endsWith('.twitter.com')) && path.startsWith('/i/grok')) return true;
    return false;
  }
  getConversationKey(){
    return `${location.origin}${location.pathname}${location.search||''}`;
  }
  getTitle(){
    // Grokのタイトルは安定しないので document.title を素直に使う
    return Utils.normalizeTitle(document.title || '会話');
  }
  getPreferredScrollContainerSelectors(){
    return ['main', 'div[role="main"]', 'section', 'body'];
  }
  extractMessages(){
    // GrokのDOMは変わりがちなので広めに拾う
    // まずは data-message-author-role が取れるケース
    const roleEls = Array.from(document.querySelectorAll('[data-message-author-role]'));
    if (roleEls.length){
      return roleEls.map(el=>{
        const r=(el.getAttribute('data-message-author-role')||el.dataset.messageAuthorRole||'').toLowerCase();
        const role = r==='user' ? 'User' : 'Model';
        const content = MarkdownParser.extract(el);
        return {role, content, sig:this.nodeSig(el)};
      }).filter(m=>m.content && m.content.length>0);
    }
    return [];
  }
  nodeSig(el){
    const stableId = el.getAttribute('data-id') || el.id || '';
    if (stableId) return `id:${stableId}`;
    const testId = el.getAttribute('data-testid') || '';
    if (testId) return `testid:${testId}`;
    const path = Utils.domPath(el);
    if (path) return `p:${path}`;
    const txt = (el.innerText||'').replace(/\s+/g,' ').trim().slice(0,500);
    return `h:${Utils.djb2(txt)}`;
  }
  findExpandButtons(root){
    const candidates = Array.from(root.querySelectorAll('button, a[role="button"]'));
    return candidates.filter(b=>{
      const text=(b.textContent||'').trim();
      if (!text) return false;
      if (!Utils.isVisible(b)) return false;
      const ok = /(続きを読む|もっと見る|続き|全文|展開|表示を増やす|Show more|Read more|Expand|Expand all)/i.test(text);
      if (!ok) return false;
      const bad = /(削除|Delete|Remove|ログアウト|Log out|共有|Share|設定|Setting|投稿|Post|返信|Reply|停止|Stop|再生成|Regenerate|Continue generating|Retry|再試行|やり直し)/i.test(text);
      if (bad) return false;
      if (b.tagName.toLowerCase()==='a'){
        const href=b.getAttribute('href')||'';
        if (href && !href.startsWith('#')) return false;
      }
      return true;
    });
  }
}

class AdapterFactory{
  static getAdapter(){
    const adapters = [new ChatGPTAdapter(), new AIStudioAdapter(), new GrokAdapter(), new BaseAdapter()];
    return adapters.find(a=>a.matches()) || new BaseAdapter();
  }
}

// ---------------- Expand Engine ----------------
class ExpandEngine{
  static async run(adapter, root, opt){
    const {
      enabled=true, maxClicks=200, delayMs=180,
      onProgress=null, abortSignal=null
    } = opt||{};
    if (!enabled) return {clicked:0, rounds:0};
    const isAborted = ()=>!!(abortSignal && abortSignal.aborted);
    const emit = (p)=>{ if (typeof onProgress==='function') { try{onProgress(p);}catch{} } };

    let clicked=0, rounds=0;
    for(;;){
      if (isAborted()) throw new Error('中断しました');
      const btns = adapter.findExpandButtons(root).slice(0, Math.max(0, maxClicks-clicked));
      if (!btns.length) break;
      rounds++;
      for (const b of btns){
        if (isAborted()) throw new Error('中断しました');
        try{
          b.click();
          clicked++;
          if (clicked>=maxClicks) break;
        }catch{}
        emit({stage:'expand', message:`本文を展開中…（${clicked}回）`});
        await Utils.sleep(delayMs);
      }
      if (clicked>=maxClicks) break;
      // 少し待ってDOMが落ち着く
      await Utils.sleep(120);
      // 変化が無いなら抜ける（無限ループ防止）
      const again = adapter.findExpandButtons(root).length;
      if (!again) break;
      // 変化があっても同じボタンが残る場合があるので、roundsで制限
      if (rounds>=12) break;
    }
    return {clicked, rounds};
  }
}

// ---------------- Scroll Engine ----------------
class ScrollEngine{
  static getDocumentScroller(){
    return document.scrollingElement || document.documentElement || document.body;
  }

  static getMessageSignalCount(el){
    if (!el || !el.querySelectorAll) return 0;
    const sels = ['[data-message-author-role]','[data-testid^="conversation-turn-"]','article','section','ms-chat-turn','.message-bubble'];
    let c=0;
    for(const s of sels){
      c += el.querySelectorAll(s).length;
      if (c>=80) break;
    }
    return c;
  }

  static findScrollContainer(adapter){
    const rootScroller = this.getDocumentScroller();
    const viewportArea = window.innerWidth*window.innerHeight;
    const candidates=[];

    const push=(el,boost=0)=>{
      if (!el) return;
      const isRoot = el===rootScroller;
      const scrollH = el.scrollHeight;
      const clientH = isRoot ? window.innerHeight : el.clientHeight;
      const range = scrollH-clientH;
      if (!Number.isFinite(range) || range<160) return;

      let score = range + boost;
      if (!isRoot){
        const r=el.getBoundingClientRect();
        const visH = Math.max(0, Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0));
        const visW = Math.max(0, Math.min(r.right, window.innerWidth) - Math.max(r.left, 0));
        const visA = visH*visW;
        if (visA < viewportArea*0.08) return;
        score += visA*0.02;
        if (visA > viewportArea*0.4) score += 1200;
      } else {
        score += viewportArea*0.02;
      }
      score += this.getMessageSignalCount(el)*900;
      candidates.push({el, score});
    };

    // adapterの優先候補
    for (const sel of (adapter.getPreferredScrollContainerSelectors?.()||[])){
      try{
        const el = document.querySelector(sel);
        if (el) push(el, 1600);
      }catch{}
    }

    // root
    push(rootScroller, 800);

    // overflow候補
    const all = Array.from(document.querySelectorAll('*'));
    for (const el of all){
      const cs = getComputedStyle(el);
      if (cs.overflowY==='auto' || cs.overflowY==='scroll' || cs.overflowY==='overlay'){
        push(el, 0);
      }
    }

    candidates.sort((a,b)=>b.score-a.score);
    return candidates[0]?.el || rootScroller;
  }

  static buildQuality(stats){
    const topConverged = stats.topReached && stats.topStableHits>=stats.stableTarget;
    const bottomConverged = stats.bottomReached && stats.bottomStableHits>=stats.stableTarget;
    const finalStable = stats.finalStableHits>=2 && stats.finalNewMessages===0;
    const identityStable = stats.weakIdentityMessages===0;
    const checks=[topConverged, bottomConverged, finalStable, identityStable];
    const failed=checks.filter(v=>!v).length;
    const status = failed===0?'PASS':(failed===1?'WARN':'FAIL');
    const score = Math.round(((checks.length-failed)/checks.length)*100);
    return {...stats, status, score, topConverged, bottomConverged, finalStable, identityStable};
  }

  static async harvest(adapter, cfg, onProgress, abortSignal){
    const emit = (p)=>{ if (typeof onProgress==='function'){ try{onProgress(p);}catch{} } };
    const isAborted = ()=>!!(abortSignal && abortSignal.aborted);
    const ensure=()=>{ if (isAborted()) throw new Error('中断しました'); };

    const container = this.findScrollContainer(adapter);
    const rootScroller = this.getDocumentScroller();
    const isRoot = container===rootScroller;

    const getViewportH = ()=> isRoot ? window.innerHeight : container.clientHeight;
    const getH = ()=> container.scrollHeight;
    const getY = ()=> container.scrollTop;
    const getMaxY = ()=> Math.max(0, getH()-getViewportH());

    const initialY = getY();
    const scrollToY = (y)=>{
      const clamped = Utils.clamp(y, 0, getMaxY());
      if (isRoot){
        window.scrollTo(0, clamped);
        container.scrollTop = clamped;
      } else {
        container.scrollTop = clamped;
      }
      return clamped;
    };

    const messageMap = new Map(); // key -> {role, content, sig, firstSeenCapture, firstSeenDomIndex}
    const orderEdges = new Map(); // key -> Set<nextKey>
    const stats = {
      captures:0,
      topIterations:0,
      topReached:false,
      topStableHits:0,
      downIterations:0,
      bottomReached:false,
      bottomStableHits:0,
      finalStableHits:0,
      finalNewMessages:0,
      expandClicks:0,
      stableTarget:3,
      mergedUpdates:0,
      unknownMessages:0,
      weakIdentityMessages:0,
      orderGraphCycles:0
    };
    let expandBudgetLeft = Math.max(0, Number(cfg.expandMaxClicks)||0);

    const classifySig = (sig)=>{
      const raw = typeof sig === 'string' ? sig.trim() : '';
      if (!raw) return {sig:'', strong:false, base:''};
      if (raw.startsWith('id:')) return {sig:raw, strong:true, base:raw};
      return {sig:raw, strong:false, base:raw};
    };
    const roleRank = (role)=>{
      if (role === 'User' || role === 'Model' || role === 'Tool') return 2;
      if (role) return 1;
      return 0;
    };
    const contentScore = (content)=>{
      const text = String(content || '').trim();
      return text.length;
    };
    const addEdge = (from, to)=>{
      if (!from || !to || from===to) return;
      if (!orderEdges.has(from)) orderEdges.set(from, new Set());
      orderEdges.get(from).add(to);
    };
    const keyForMessage = (m, weakOrdinalMap)=>{
      const sigInfo = classifySig(m?.sig);
      if (sigInfo.strong) return {key:`sig:${sigInfo.base}`, weak:false, sig:sigInfo.sig};
      const normalized = Utils.safeText(m?.content || '').replace(/\s+/g,' ').trim();
      const weakBase = sigInfo.base || `anon:${Utils.djb2(`${m?.role || 'Unknown'}\u0000${normalized}`)}`;
      const ordinal = (weakOrdinalMap.get(weakBase) || 0) + 1;
      weakOrdinalMap.set(weakBase, ordinal);
      return {key:`weak:${weakBase}#${ordinal}`, weak:true, sig:sigInfo.sig || weakBase};
    };
    const findPromotableWeakKey = (next)=>{
      for (const [existingKey, record] of messageMap.entries()){
        if (!record.weakIdentity) continue;
        if (record.role !== next.role) continue;
        const currentContent = String(record.content || '').trim();
        const nextContent = String(next.content || '').trim();
        if (!currentContent || !nextContent) continue;
        const sameContent = currentContent === nextContent || currentContent.includes(nextContent) || nextContent.includes(currentContent);
        if (!sameContent) continue;
        if (Math.abs((record.lastSeenDomIndex ?? next.domIndex) - next.domIndex) > 3) continue;
        return existingKey;
      }
      return null;
    };
    const mergeRecord = (record, next)=>{
      const nextContent = String(next.content || '').trim();
      const currentContent = String(record.content || '').trim();
      if (nextContent && nextContent !== currentContent){
        const shouldReplace = contentScore(nextContent) > contentScore(currentContent) || nextContent.includes(currentContent);
        if (shouldReplace){
          if (currentContent) stats.mergedUpdates++;
          record.content = nextContent;
        }
      }
      if (roleRank(next.role) > roleRank(record.role)){
        record.role = next.role;
      }
      if (!record.sig && next.sig) record.sig = next.sig;
      if (classifySig(next.sig).strong){
        record.weakIdentity = false;
        record.sig = next.sig;
      }
      record.lastSeenCapture = stats.captures;
      record.lastSeenDomIndex = next.domIndex;
      return record;
    };
    const topoOrderMessages = ()=>{
      const keys = Array.from(messageMap.keys());
      const indegree = new Map(keys.map(k=>[k,0]));
      for (const [from, tos] of orderEdges.entries()){
        if (!indegree.has(from)) continue;
        for (const to of tos){
          if (!indegree.has(to)) continue;
          indegree.set(to, indegree.get(to)+1);
        }
      }
      const compareKeys = (a,b)=>{
        const ra = messageMap.get(a);
        const rb = messageMap.get(b);
        return (ra.firstSeenCapture-rb.firstSeenCapture)
          || (ra.firstSeenDomIndex-rb.firstSeenDomIndex)
          || a.localeCompare(b);
      };
      const queue = keys.filter(k=>indegree.get(k)===0).sort(compareKeys);
      const ordered = [];
      while (queue.length){
        const key = queue.shift();
        ordered.push(key);
        for (const next of orderEdges.get(key) || []){
          if (!indegree.has(next)) continue;
          indegree.set(next, indegree.get(next)-1);
          if (indegree.get(next)===0){
            queue.push(next);
            queue.sort(compareKeys);
          }
        }
      }
      if (ordered.length !== keys.length){
        stats.orderGraphCycles++;
        const seen = new Set(ordered);
        ordered.push(...keys.filter(k=>!seen.has(k)).sort(compareKeys));
      }
      return ordered.map(k=>messageMap.get(k));
    };

    const capture = ()=>{
      stats.captures++;
      const msgs = adapter.extractMessages();
      const visibleKeys = [];
      const weakOrdinalMap = new Map();
      for (let i=0;i<msgs.length;i++){
        const m=msgs[i];
        if (!m || !m.content || m.content.length<2) continue;
        const {key, weak, sig} = keyForMessage(m, weakOrdinalMap);
        const next = {
          ...m,
          content: String(m.content || '').trim(),
          role: m.role || 'Unknown',
          domIndex: i,
          sig
        };
        let resolvedKey = key;
        if (!weak){
          const promoteFrom = findPromotableWeakKey(next);
          if (promoteFrom && promoteFrom !== resolvedKey && !messageMap.has(resolvedKey)){
            const promoted = messageMap.get(promoteFrom);
            promoted.weakIdentity = false;
            promoted.sig = next.sig;
            messageMap.delete(promoteFrom);
            messageMap.set(resolvedKey, promoted);
          }
        }
        visibleKeys.push(resolvedKey);
        if (!messageMap.has(resolvedKey)){
          messageMap.set(resolvedKey, {
            role: next.role,
            content: next.content,
            sig: next.sig || null,
            weakIdentity: weak,
            firstSeenCapture: stats.captures,
            firstSeenDomIndex: i,
            lastSeenCapture: stats.captures,
            lastSeenDomIndex: i
          });
        } else {
          mergeRecord(messageMap.get(resolvedKey), next);
        }
      }
      for (let i=0;i<visibleKeys.length-1;i++){
        if (visibleKeys[i] !== visibleKeys[i+1]){
          addEdge(visibleKeys[i], visibleKeys[i+1]);
        }
      }
      return messageMap.size;
    };

    const maybeExpand = async (stage)=>{
      if (!cfg.autoExpand) return;
      if (expandBudgetLeft<=0) return;
      // 負荷を抑えるため、ステージごとに間引く
      const interval = stage==='final' ? 1 : 3;
      const iter = (stage==='top') ? stats.topIterations : (stage==='down') ? stats.downIterations : 0;
      if (stage!=='final' && (iter%interval)!==0) return;
      const res = await ExpandEngine.run(adapter, container, {
        enabled: cfg.autoExpand,
        maxClicks: expandBudgetLeft,
        delayMs: cfg.expandClickDelay,
        onProgress: emit,
        abortSignal
      });
      stats.expandClicks += res.clicked;
      expandBudgetLeft = Math.max(0, expandBudgetLeft - res.clicked);
    };

    // stage: prepare
    emit({stage:'prepare', message:'会話の位置を確認しています…', count: capture()});
    await maybeExpand('final');
    emit({stage:'prepare', message:'会話を検出しました。読み込みを開始します…', count: capture()});
    await Utils.sleep(180);

    // stage: top
    let lastCount=-1;
    for (let i=0;i<cfg.scrollMax;i++){
      ensure();
      stats.topIterations++;
      emit({stage:'top', message:'古い会話を上まで読み込んでいます…', iter:i+1, max:cfg.scrollMax, count: messageMap.size});

      const y = getY();
      const step = getViewportH()*0.85;
      scrollToY(y - step);
      await Utils.sleep(cfg.scrollDelay);

      await maybeExpand('top');
      const c = capture();

      const atTop = getY()<=1;
      if (atTop) stats.topReached=true;

      if (c===lastCount && atTop) stats.topStableHits++;
      else if (atTop) stats.topStableHits = Math.max(0, stats.topStableHits-1);

      lastCount = c;

      if (stats.topReached && stats.topStableHits>=stats.stableTarget) break;
    }

    // stage: down
    lastCount=-1;
    for (let i=0;i<cfg.scrollMax;i++){
      ensure();
      stats.downIterations++;
      emit({stage:'down', message:'最新の会話まで読み込んでいます…', iter:i+1, max:cfg.scrollMax, count: messageMap.size});

      const y = getY();
      const step = getViewportH()*0.85;
      scrollToY(y + step);
      await Utils.sleep(cfg.scrollDelay);

      await maybeExpand('down');
      const c = capture();

      const atBottom = Math.abs(getH() - getViewportH() - getY()) <= 1;
      if (atBottom) stats.bottomReached=true;

      if (c===lastCount && atBottom) stats.bottomStableHits++;
      else if (atBottom) stats.bottomStableHits = Math.max(0, stats.bottomStableHits-1);

      lastCount = c;

      if (stats.bottomReached && stats.bottomStableHits>=stats.stableTarget) break;
    }

    // stage: final settle
    ensure();
    emit({stage:'final', message:'最終確認中…', count: messageMap.size});
    let finalStableHits = 0;
    let finalNewTotal = 0;
    for (let i=0;i<2;i++){
      const before = messageMap.size;
      await maybeExpand('final');
      capture();
      await Utils.sleep(140);
      capture();
      const after = messageMap.size;
      const delta = Math.max(0, after-before);
      finalNewTotal += delta;
      if (delta===0) finalStableHits++;
      else finalStableHits = 0;
    }
    stats.finalStableHits = finalStableHits;
    stats.finalNewMessages = finalNewTotal;

    // 元の位置に戻す（UX）
    try{
      scrollToY(initialY);
      if (isRoot) window.scrollTo(0, initialY);
    }catch{}

    const orderedRecords = topoOrderMessages();
    stats.unknownMessages = orderedRecords.filter(m => m.role === 'Unknown').length;
    stats.weakIdentityMessages = orderedRecords.filter(m => !!m.weakIdentity).length;
    const messages = orderedRecords.map(({firstSeenCapture, firstSeenDomIndex, lastSeenCapture, lastSeenDomIndex, weakIdentity, ...m})=>m);
    const quality = this.buildQuality(stats);
    return {messages, quality, containerIsRoot:isRoot};
  }
}

// ---------------- App ----------------
class App{
  constructor(){
    this.adapter = AdapterFactory.getAdapter();
    this.siteId = this.adapter.id;
    this.config = this.loadConfig();
    this.abortState = {aborted:false};
    this.busyOverlay = null;
  }

  storageKeys(){
    const scope = `${APP_ID}:${APP_STORAGE_VER}`;
    return {
      cfgKey: `${scope}_cfg_${this.siteId}`,
      runMetaKey: `${scope}_run_meta`,
      legacyCfgKey: `${APP_ID}_cfg_${this.siteId}`,
      legacyRunMetaKey: `${APP_ID}_run_meta`,
    };
  }

  safeJsonGet(key){
    try{
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const data = JSON.parse(raw);
      return data;
    }catch{
      return null;
    }
  }

  // ---- config ----
  getDefaultConfig(){
    const presets = {
      fast:    { scrollMax: 70,  scrollDelay: 260, autoExpand:false },
      normal:  { scrollMax: 105, scrollDelay: 380, autoExpand:true  },
      careful: { scrollMax: 170, scrollDelay: 650, autoExpand:true }
    };
    return {
      fmt:'std', // std|obs|json
      preset:'careful',
      presets,
      // 手動調整（詳細設定）
      scrollMax: presets.careful.scrollMax,
      scrollDelay: presets.careful.scrollDelay,
      autoExpand: presets.careful.autoExpand,
      expandMaxClicks: 200,
      expandClickDelay: 170
    };
  }

  loadConfig(){
    const {cfgKey, legacyCfgKey} = this.storageKeys();
    const def = this.getDefaultConfig();
    try{
      const cfgFromNew = this.safeJsonGet(cfgKey);
      const legacyCfg = this.safeJsonGet(legacyCfgKey);
      const cfg = cfgFromNew || legacyCfg;
      if (!cfg || typeof cfg !== 'object'){
        return def;
      }
      if (!cfgFromNew && legacyCfg){
        this.safeSet(cfgKey, cfg);
        this.safeDelete(legacyCfgKey);
      }
      const merged = {...def, ...cfg};
      // presetの値を反映（ユーザーが変えた場合は保持）
      if (!merged.scrollMax || !merged.scrollDelay){
        const p = merged.presets?.[merged.preset] || def.presets.normal;
        merged.scrollMax = p.scrollMax;
        merged.scrollDelay = p.scrollDelay;
        merged.autoExpand = p.autoExpand;
      }
      return merged;
    }catch{
      return def;
    }
  }

  saveConfig(){
    const {cfgKey} = this.storageKeys();
    this.safeSet(cfgKey, this.config);
  }

  safeSet(key, value){
    try{ localStorage.setItem(key, JSON.stringify(value)); }catch{}
  }

  safeDelete(key){
    try{ localStorage.removeItem(key); }catch{}
  }

  applyPreset(preset){
    const p = this.config.presets?.[preset];
    if (!p) return;
    this.config.preset = preset;
    this.config.scrollMax = p.scrollMax;
    this.config.scrollDelay = p.scrollDelay;
    this.config.autoExpand = p.autoExpand;
  }

  // ---- run meta (diff) ----
  loadRunMeta(){
    const {runMetaKey, legacyRunMetaKey} = this.storageKeys();
    const normalizedMeta = (() => {
      const current = this.safeJsonGet(runMetaKey);
      const legacy = this.safeJsonGet(legacyRunMetaKey);
      const merged = {
        ...(legacy && typeof legacy === 'object' ? legacy : {}),
        ...(current && typeof current === 'object' ? current : {})
      };
      if (legacy && typeof legacy === 'object' && Object.keys(legacy).length > 0 && (!current || (typeof current === 'object' && Object.keys(current).length === 0))){
        this.safeSet(runMetaKey, merged);
        this.safeDelete(legacyRunMetaKey);
      }
      return merged;
    })();
    const key = this.adapter.getConversationKey();
    const raw = normalizedMeta[key] || null;
    const entry = this.normalizeRunMeta(raw);
    return {storageKey: runMetaKey, key, previous: entry.latest_success || null, lastAttempt: entry.last_attempt || null, row: entry, meta: normalizedMeta};
  }

  normalizeRunMeta(raw){
    if (!raw || typeof raw !== 'object') return {latest_success:null, last_attempt:null};
    if (raw.latest_success || raw.last_attempt) return raw;
    if (Number.isFinite(raw.count) || Number.isFinite(raw.message_count) || raw.count === 0){
      return {
        latest_success:{
          count: raw.count ?? raw.message_count ?? 0,
          digest: raw.digest || null,
          at: raw.at || null,
          run_mode: raw.run_mode || null,
          saveState: raw.saveState || null,
          quality_status: raw.quality_status || 'WARN',
          quality_score: raw.quality_score ?? 0,
          message_count: raw.message_count ?? raw.count ?? 0
        },
        last_attempt: null
      };
    }
    return {latest_success:null, last_attempt:null};
  }

  setRunAttemptStatus(status, extra={}){
    const {storageKey, key, meta, row} = this.loadRunMeta();
    const next = row || {latest_success:null,last_attempt:null};
    next.last_attempt = Object.assign({}, next.last_attempt||{}, {
      status,
      ...extra,
      updated_at: Utils.nowIso()
    });
    meta[key] = next;
    try{ localStorage.setItem(storageKey, JSON.stringify(meta)); }catch{}
  }

  markRunAttemptStart(mode){
    const runId = `${Date.now()}_${Math.random().toString(36).slice(2,10)}`;
    this.setRunAttemptStatus('running', {
      run_id: runId,
      mode,
      started_at: Utils.nowIso()
    });
    return runId;
  }

  saveRunMeta(next){
    const {storageKey, key, meta, row} = this.loadRunMeta();
    const base = row || {latest_success:null,last_attempt:null};
    const saved = {
      ...next,
      run_status:'success',
      run_saved_at: Utils.nowIso()
    };
    base.latest_success = saved;
    base.last_attempt = Object.assign({}, base.last_attempt || {}, {
      status:'success',
      finished_at: Utils.nowIso()
    });
    meta[key] = base;
    try{ localStorage.setItem(storageKey, JSON.stringify(meta)); }catch{}
  }

  computeRunDigest(messages){
    const payload = messages
      .map(m=>`${m.role || 'Unknown'}\u0000${Utils.safeText(m.content || '').replace(/\s+/g,' ').trim()}`)
      .join('\u0001');
    return Utils.djb2(`${messages.length}\u0002${payload}`);
  }

  diffInfo(messages){
    const {previous, lastAttempt} = this.loadRunMeta();
    const nowCount = messages.length;
    const nowDigest = this.computeRunDigest(messages);
    if (!previous || !Number.isFinite(previous.count)) return {previous:null, now:{count:nowCount,digest:nowDigest}, lastAttempt};
    const diff = nowCount - previous.count;
    const diffAbs = Math.abs(diff);
    const rate = previous.count>0 ? diffAbs/previous.count : 0;
    const stable = diffAbs<=1 || rate<=0.01;
    const digestSame = previous.digest && previous.digest===nowDigest;
    return {previous, now:{count:nowCount,digest:nowDigest}, lastAttempt, diff, diffAbs, rate, stable, digestSame};
  }

  // ---- UI primitives ----
  overlay(){
    return Utils.el('div',{style:`position:fixed;inset:0;z-index:${Z};background:rgba(0,0,0,.82);display:flex;align-items:center;justify-content:center;padding:16px;font:${THEME.font};`});
  }

  btn(label, kind, onClick){
    const styles = {
      primary:`background:${THEME.accent};border:1px solid ${THEME.accent};color:#fff;`,
      secondary:`background:${THEME.surface};border:1px solid ${THEME.border};color:${THEME.fg};`,
      subtle:`background:transparent;border:1px solid ${THEME.border};color:${THEME.fg};`,
      danger:`background:${THEME.bad};border:1px solid ${THEME.bad};color:#fff;`
    };
    const base = `padding:10px 14px;border-radius:12px;font-weight:700;font-size:14px;line-height:1.45;cursor:pointer;transition:.12s;`;
    const b = Utils.el('button',{style:base + (styles[kind]||styles.secondary)});
    b.textContent = label;
    b.addEventListener('mouseenter', ()=>{
      if (kind==='primary') b.style.background = THEME.accentHover;
    });
    b.addEventListener('mouseleave', ()=>{
      if (kind==='primary') b.style.background = THEME.accent;
    });
    b.addEventListener('click', (e)=>{ e.preventDefault(); e.stopPropagation(); onClick?.(); });
    return b;
  }

  chip(title, value, color=THEME.fg){
    return Utils.el('div',{style:`padding:10px 12px;border-radius:12px;border:1px solid ${THEME.border};background:${THEME.bg};`},[
      Utils.el('div',{text:title,style:`font-size:14px;line-height:1.55;color:${THEME.muted};margin-bottom:4px;font-weight:600;`}),
      Utils.el('div',{text:value,style:`font-size:14px;line-height:1.5;font-weight:700;color:${color};word-break:break-word;`})
    ]);
  }

  sectionTitle(t){
    return Utils.el('div',{text:t,style:`font-size:14px;line-height:1.5;font-weight:700;color:${THEME.fg};margin:14px 0 10px;`});
  }

  // ---- dialogs ----
  async showConfigDialog(){
    return new Promise(resolve=>{
      const ov = this.overlay();
      const modal = Utils.el('div',{style:`width:min(640px, calc(100vw - 32px));background:${THEME.surface};border:1px solid ${THEME.border};border-radius:16px;overflow:hidden;box-shadow:0 10px 28px rgba(0,0,0,.4);color:${THEME.fg};`});

      const header = Utils.el('div',{style:`padding:20px 22px;background:${THEME.bg};border-bottom:1px solid ${THEME.border};`},[
        Utils.el('div',{text:'AIチャットを書き出す',style:'font-size:20px;line-height:1.35;font-weight:700;margin-bottom:6px;'}),
        Utils.el('div',{text:`サイト: ${this.adapter.label}`,style:`font-size:14px;line-height:1.6;color:${THEME.muted};font-weight:600;`})
      ]);

      const body = Utils.el('div',{style:'padding:18px 22px;'});
      body.appendChild(this.sectionTitle('速度プリセット'));
      const presetWrap = Utils.el('div',{style:'display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;'});
      const presetCard = (id, title, desc)=>{
        const active = this.config.preset===id;
        const card = Utils.el('button',{style:`text-align:left;padding:13px;border-radius:14px;border:1px solid ${active?THEME.accentLine:THEME.border};background:${active?'rgba(95,162,255,0.14)':THEME.bg};color:${THEME.fg};cursor:pointer;`});
        card.append(
          Utils.el('div',{text:title,style:'font-weight:700;font-size:14px;line-height:1.5;margin-bottom:4px;'}),
          Utils.el('div',{text:desc,style:`font-size:14px;line-height:1.65;color:${THEME.muted};font-weight:500;`})
        );
        card.addEventListener('click', ()=>{
          this.applyPreset(id);
          this.saveConfig();
          // 画面更新: 簡易にリロード
          ov.remove();
          this.showConfigDialog().then(resolve);
        });
        return card;
      };
      presetWrap.append(
        presetCard('fast','はやい','軽め。短い会話向き'),
        presetCard('normal','ふつう','普段使い（速度と精度の中間）'),
        presetCard('careful','ていねい','既定。長い会話・漏れ対策')
      );
      body.appendChild(presetWrap);

      // チェック：自動展開
      const expandRow = Utils.el('div',{style:`margin-top:14px;padding:12px;border-radius:14px;border:1px solid ${THEME.border};background:${THEME.bg};display:flex;gap:10px;align-items:flex-start;`});
      const cb = Utils.el('input',{type:'checkbox',style:'margin-top:3px;'});
      cb.checked = !!this.config.autoExpand;
      cb.addEventListener('change', ()=>{ this.config.autoExpand=cb.checked; this.saveConfig(); });
      expandRow.append(
        cb,
        Utils.el('div',{},[
          Utils.el('div',{text:'本文の「続きを読む」等を自動で開く',style:'font-weight:700;font-size:14px;line-height:1.5;margin-bottom:4px;'}),
          Utils.el('div',{text:'漏れ対策に効きます。誤爆しないよう安全側に制限しています。',style:`font-size:14px;line-height:1.65;color:${THEME.muted};font-weight:500;`})
        ])
      );
      body.appendChild(expandRow);

      // 形式
      body.appendChild(this.sectionTitle('保存形式'));
      const fmtWrap = Utils.el('div',{style:'display:flex;gap:10px;flex-wrap:wrap;'});
      const fmtBtn = (id, label, hint)=>{
        const active = this.config.fmt===id;
        const b = Utils.el('button',{style:`padding:11px 12px;border-radius:12px;border:1px solid ${active?THEME.accentLine:THEME.border};background:${active?'rgba(95,162,255,0.14)':THEME.bg};color:${THEME.fg};cursor:pointer;`});
        b.append(Utils.el('div',{text:label,style:'font-weight:700;font-size:14px;line-height:1.45;'}),
                 Utils.el('div',{text:hint,style:`margin-top:4px;font-size:14px;line-height:1.6;color:${THEME.muted};font-weight:500;`}));
        b.addEventListener('click', ()=>{ this.config.fmt=id; this.saveConfig(); ov.remove(); this.showConfigDialog().then(resolve); });
        return b;
      };
      fmtWrap.append(
        fmtBtn('std','標準Markdown','読みやすい普通の.md'),
        fmtBtn('obs','Obsidian向け','callout形式'),
        fmtBtn('json','JSON','機械処理向け')
      );
      body.appendChild(fmtWrap);

      // 詳細
      const details = Utils.el('details',{style:`margin-top:14px;border:1px solid ${THEME.border};border-radius:14px;background:${THEME.bg};overflow:hidden;`});
      const sum = Utils.el('summary',{text:'細かく調整する',style:`cursor:pointer;list-style:none;padding:12px 14px;font-weight:700;font-size:14px;line-height:1.5;`});
      const inner = Utils.el('div',{style:'padding:12px 14px;border-top:1px solid '+THEME.border+';display:grid;gap:10px;'});
      const slider = (label, key, min, max, step, unit)=>{
        const row = Utils.el('div',{style:'display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;'});
        const left = Utils.el('div',{},[
          Utils.el('div',{text:label,style:'font-weight:700;font-size:14px;line-height:1.5;'}),
          Utils.el('div',{text:`現在: ${this.config[key]}${unit}`,style:`font-size:14px;line-height:1.6;color:${THEME.muted};margin-top:2px;font-weight:500;`})
        ]);
        const input = Utils.el('input',{type:'range',min:String(min),max:String(max),step:String(step),value:String(this.config[key]),style:'width:220px;'});
        input.addEventListener('input', ()=>{
          this.config[key]=Number(input.value);
          this.saveConfig();
          left.querySelectorAll('div')[1].textContent = `現在: ${this.config[key]}${unit}`;
        });
        row.append(left, input);
        return row;
      };
      inner.append(
        slider('スクロール回数（上+下）','scrollMax', 30, 220, 5, '回'),
        slider('待ち時間','scrollDelay', 120, 1200, 20, 'ms'),
        slider('展開クリック上限','expandMaxClicks', 0, 600, 10, '回'),
        slider('展開クリック間隔','expandClickDelay', 80, 600, 10, 'ms'),
        Utils.el('div',{text:'※ プリセットを選ぶと、ここは上書きされます（必要なら再調整してください）。',style:`font-size:14px;line-height:1.65;color:${THEME.muted};font-weight:500;`})
      );
      details.append(sum, inner);
      body.appendChild(details);

      const footer = Utils.el('div',{style:`padding:16px 22px;background:${THEME.bg};border-top:1px solid ${THEME.border};display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;`});
      footer.append(
        this.btn('キャンセル','subtle', ()=>{ ov.remove(); resolve(false); }),
        this.btn('開始','primary', ()=>{ ov.remove(); resolve(true); })
      );

      modal.append(header, body, footer);
      ov.appendChild(modal);
      document.body.appendChild(ov);
    });
  }

  showBusyDialog(){
    const ov = this.overlay();
    const modal = Utils.el('div',{style:`width:min(520px, calc(100vw - 32px));background:${THEME.surface};border:1px solid ${THEME.border};border-radius:16px;overflow:hidden;box-shadow:0 10px 28px rgba(0,0,0,.4);color:${THEME.fg};`});
    const header = Utils.el('div',{style:`padding:18px 20px;background:${THEME.bg};border-bottom:1px solid ${THEME.border};`});
    const title = Utils.el('div',{text:'準備しています',style:'font-size:19px;line-height:1.4;font-weight:700;margin-bottom:6px;'});
    const desc = Utils.el('div',{text:'ページをスクロールして会話を集めています…',style:`font-size:14px;line-height:1.65;color:${THEME.muted};font-weight:500;`});
    header.append(title, desc);

    const body = Utils.el('div',{style:'padding:16px 20px;'});
    const barWrap = Utils.el('div',{style:`height:10px;border-radius:999px;background:${THEME.bg};border:1px solid ${THEME.border};overflow:hidden;`});
    const bar = Utils.el('div',{style:`height:100%;width:15%;background:${THEME.accent};border-radius:999px;transition:width .12s;`});
    barWrap.appendChild(bar);
    const info = Utils.el('div',{style:`margin-top:10px;font-size:14px;line-height:1.65;color:${THEME.muted};font-weight:500;`});
    body.append(barWrap, info);

    const footer = Utils.el('div',{style:`padding:14px 20px;background:${THEME.bg};border-top:1px solid ${THEME.border};display:flex;justify-content:flex-end;`});
    footer.append(this.btn('中断','danger', ()=>{ this.abortState.aborted=true; Utils.toast('中断しました。', 'warn'); }));

    modal.append(header, body, footer);
    ov.appendChild(modal);
    document.body.appendChild(ov);

    this.busyOverlay = ov;
    this.busyUI = {title, desc, bar, info};
  }

  updateBusyDialog(p){
    if (!this.busyUI) return;
    const stage = p?.stage || '';
    const stageTitle = stage==='prepare'?'準備しています'
      : stage==='top'?'古い会話を読み込んでいます'
      : stage==='down'?'最新の会話まで読み込んでいます'
      : stage==='expand'?'本文を展開しています'
      : stage==='final'?'最終確認中'
      : '処理中';
    this.busyUI.title.textContent = stageTitle;
    if (p?.message) this.busyUI.desc.textContent = p.message;

    const iter = Number.isFinite(p?.iter) ? p.iter : null;
    const max = Number.isFinite(p?.max) ? p.max : null;
    let pct = 18;
    if (iter!=null && max!=null && max>0){
      pct = Utils.clamp(Math.round((iter/max)*100), 5, 95);
      // top/down両方あるので、ざっくり段階を足す
      if (stage==='down') pct = Utils.clamp(50 + Math.round((iter/max)*50), 50, 98);
      if (stage==='top') pct = Utils.clamp(Math.round((iter/max)*50), 5, 50);
    } else if (stage==='final') pct = 99;
    this.busyUI.bar.style.width = `${pct}%`;

    const c = Number.isFinite(p?.count) ? p.count : null;
    const parts=[];
    if (c!=null) parts.push(`見つかった会話: ${c}件`);
    if (iter!=null && max!=null) parts.push(`進行: ${iter}/${max}`);
    this.busyUI.info.textContent = parts.join(' / ');
  }

  closeBusyDialog(){
    try{ this.busyOverlay?.remove(); }catch{}
    this.busyOverlay=null;
    this.busyUI=null;
  }

  qualitySummary(quality, diff){
    // qualityが無いケースもある
    const q = quality || {status:'WARN', score:0};
    const label = q.status==='PASS'?'良好' : q.status==='WARN'?'やや不安' : '要再実行';
    const color = q.status==='PASS'?THEME.ok : q.status==='WARN'?THEME.warn : THEME.bad;

    let hint = '';
    if (q.status==='PASS') hint = '概ね問題なさそうです。';
    else if (q.status==='WARN') hint = '会話が長い場合は、もう一度実行すると安定することがあります。';
    else hint = '取得漏れの可能性が高いです。もう一度実行を推奨します。';

    if ((q.weakIdentityMessages||0) > 0){
      hint = '一部メッセージの識別が弱く、重複や順序の精度が落ちる可能性があります。';
    } else if ((q.unknownMessages||0) > 0){
      hint = '一部メッセージの話者判定が不明です。DOM変更の影響を受けている可能性があります。';
    }

    // diffによる追加ヒント
    let diffLine = '';
    const abortedLast = diff?.lastAttempt?.status==='aborted' || diff?.lastAttempt?.status==='cancel';
    if (diff?.previous){
      const sign = diff.diff>0?'+':'';
      diffLine = `前回: ${diff.previous.count}件 / 今回: ${diff.now.count}件（差分 ${sign}${diff.diff}件）`;
      if (!diff.stable && diff.rate>=0.12){
        hint = '前回との差が大きいです。スクロールが途中で止まった可能性があります。';
      } else if (diff.digestSame){
        hint = '前回とほぼ同じ内容です（安定）。';
      }
    }

    if (!diff?.previous && abortedLast){
      diffLine = '前回: 保存なし（中断）。今回は新規再取得で比較基準はリセットされます。';
      hint = '前回は保存されていないため、今回は保存結果を基準に比較します。';
    }
    return {label, color, hint, diffLine, score:q.score, raw:q};
  }

  getPresetLabel(){
    return this.config.preset==='fast'?'はやい' : this.config.preset==='careful'?'ていねい' : 'ふつう';
  }
  getFormatLabel(){
    return this.config.fmt==='obs'?'Obsidian向け' : this.config.fmt==='json'?'JSON' : '標準Markdown';
  }

  roleLabel(role){
    if (role==='User') return 'あなた';
    if (role==='Model') return 'AI';
    if (role==='Tool') return 'ツール';
    return '不明';
  }

  yamlValue(v){
    if (typeof v==='number' || typeof v==='boolean') return String(v);
    const s = (v===undefined || v===null) ? '' : String(v);
    return `"${s.replace(/\\/g,'\\\\').replace(/\"/g,'\\\"').replace(/\r/g,'\\r').replace(/\n/g,'\\n').replace(/\t/g,'\\t')}"`;
  }

  buildExportMetadata(title, messages, quality, diff){
    const warning = this.warningSummary({quality, diff});
    return {
      title: title,
      site: this.adapter.label,
      conversation_url: location.href,
      saved_at: Utils.formatDateJST(new Date()),
      message_count: messages.length,
      preset: this.config.preset,
      format: this.config.fmt,
      quality_status: quality?.status || 'WARN',
      quality_score: quality?.score ?? 0,
      warning: warning.hasWarning,
      warning_text: warning.text,
      previous_count: diff?.previous?.count,
      merged_updates: quality?.mergedUpdates ?? 0,
      unknown_messages: quality?.unknownMessages ?? 0,
      weak_identity_messages: quality?.weakIdentityMessages ?? 0
    };
  }

  dumpYaml(obj){
    return ['---',
      ...Object.entries(obj).map(([k,v])=>`${k}: ${this.yamlValue(v)}`),
      '---',
      ''
    ].join('\n');
  }

  warningSummary({quality, diff}){
    const q = quality || {status:'WARN',score:0};
    const qWarn = q.status!=='PASS';
    const diffWarn = !!(diff?.previous && (!diff.stable && (diff.rate||0) >= 0.12));
    const hasWarning = qWarn || diffWarn;
    const parts = [];
    if (!diff?.previous && (diff?.lastAttempt?.status==='aborted' || diff?.lastAttempt?.status==='cancel')){
      parts.push('前回は保存されず中断');
    } else if (!diff?.previous){
      parts.push('前回データなし');
    }
    if (qWarn){
      parts.push(q.status==='WARN' ? 'やや不安' : '要再実行');
    }
    if (diffWarn){
      parts.push('前回との差が大きい');
    }
    const text = hasWarning ? Array.from(new Set(parts)).join(' / ') : 'なし';
    return {hasWarning, text};
  }

  compactSummaryLines(messages, quality, diff, savedState='未保存'){
    const qWarn = this.warningSummary({quality, diff});
    const warningTail = qWarn.hasWarning && qWarn.text ? `（${qWarn.text}）` : '';
    return [
      `抽出件数: ${messages.length}件`,
      `保存状態: ${savedState}`,
      `警告有無: ${qWarn.hasWarning?'あり':'なし'}${warningTail}`
    ];
  }

  lastAttemptStatusLabel(){
    const {previous, lastAttempt} = this.loadRunMeta();
    const status = lastAttempt?.status;
    const map = {
      success: '保存済み（成功）',
      failed: '保存せず失敗',
      aborted: '未保存で中断',
      cancel: '未保存で中止',
      rerun_requested: '再実行要求があった状態',
      running: '実行中（前回保存を参照）'
    };
    if (!status) return `最終保存: ${Number.isFinite(previous?.count) ? `${previous.count}件` : 'なし'}`;
    if (status === 'running') return `最終保存: ${Number.isFinite(previous?.count) ? `${previous.count}件` : 'なし'}`;
    const suffix = map[status] || `状態:${status}`;
    const c = Number.isFinite(lastAttempt.count) ? `（${lastAttempt.count}件）` : '';
    return `直近試行: ${suffix}${c}`;
  }

  comparisonBaseLabel(previous){
    return Number.isFinite(previous?.count) ? `比較ベース: ${previous.count}件` : '比較ベース: なし（保存済みなし）';
  }

  async confirmRerunDialog(mode='normal'){
    const modeLabel = mode==='careful' ? 'ていねい' : '通常';
    const title = mode==='careful' ? 'ていねいで再実行の確認' : '再実行の確認';
    const actionLabel = mode==='careful' ? 'ていねいで再実行する' : '再実行する';
    return new Promise(resolve=>{
      const ov = this.overlay();
      const modal = Utils.el('div',{style:`width:min(640px, calc(100vw - 32px));background:${THEME.surface};border:1px solid ${THEME.border};border-radius:16px;overflow:hidden;box-shadow:0 10px 28px rgba(0,0,0,.4);color:${THEME.fg};`});
      const header = Utils.el('div',{style:`padding:20px 22px;background:${THEME.bg};border-bottom:1px solid ${THEME.border};`},[
        Utils.el('div',{text:title,style:'font-size:20px;line-height:1.35;font-weight:700;margin-bottom:6px;'}),
        Utils.el('div',{text:'この操作は、今出ている抽出結果を破棄して先頭から再取得します。',style:`font-size:14px;line-height:1.6;color:${THEME.fg};font-weight:700;`}),
        Utils.el('div',{text:'保存は再取得後にしてください。',style:`margin-top:6px;font-size:13px;line-height:1.6;color:${THEME.muted};font-weight:500;`})
      ]);

      const body = Utils.el('div',{style:'padding:18px 22px;display:grid;gap:10px;font-size:14px;line-height:1.6;color:'+THEME.fg+';'});
      const attemptLine = this.lastAttemptStatusLabel();
      const lines = [
        attemptLine,
        `再実行モード: ${modeLabel}`,
        '件数・進捗は0件から再計測',
        '保存ファイルは残り、中間保存状態は上書きされます'
      ];
      for (const line of lines){
        body.appendChild(Utils.el('div',{text:line,style:'color:'+THEME.fg+';'}));
      }

      const footer = Utils.el('div',{style:`padding:14px 22px;background:${THEME.bg};border-top:1px solid ${THEME.border};display:flex;gap:10px;justify-content:flex-end;`});
      const done=(ok)=>{
        try{ ov.remove(); }catch{}
        document.removeEventListener('keydown', onKeydown);
        resolve(!!ok);
      };
      const confirmBtn = this.btn(actionLabel,'primary', ()=>done(true));
      const cancelBtn = this.btn('やめる','subtle', ()=>done(false));
      const onKeydown=(e)=>{
        if (e.key==='Escape'){
          e.preventDefault();
          done(false);
        }else if (e.key==='Enter'){
          e.preventDefault();
          done(true);
        }
      };
      document.addEventListener('keydown', onKeydown);
      footer.append(
        cancelBtn,
        confirmBtn
      );

      modal.append(header, body, footer);
      ov.appendChild(modal);
      document.body.appendChild(ov);
      confirmBtn.focus();
      confirmBtn.style.outline = '2px solid '+THEME.accent;
    });
  }

  makeFileName(title){
    const base = Utils.filenameSafe(title);
    const d = new Date();
    const pad=n=>String(n).padStart(2,'0');
    const stamp = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
    const ext = this.config.fmt==='json' ? 'json' : 'md';
    return `${stamp}_${base}.${ext}`;
  }

  formatOutput(messages, quality, diff){
    const title = this.adapter.getTitle();
    const savedAt = Utils.formatDateJST(new Date());
    const site = this.adapter.label;
    const url = location.href;
    const metadata = this.buildExportMetadata(title, messages, quality, diff);
    const yaml = this.dumpYaml(metadata);

    if (this.config.fmt==='json'){
      const payload = {
        metadata: {
          ...metadata,
          site,
          url,
          saved_at: savedAt
        },
        messages: messages.map(m=>({role:this.roleLabel(m.role), roleRaw:m.role, content:m.content}))
      };
      return {fileName:this.makeFileName(title), output: JSON.stringify(payload, null, 2)};
    }

    let out = '';
    if (this.config.fmt==='obs'){
      out += yaml;
      out += `# ${title}\n\n- サイト: ${site}\n- 保存日時: ${savedAt}\n- URL: ${url}\n\n---\n\n`;
      for (const m of messages){
        const callout = (m.role==='User') ? '[!NOTE] あなた' : (m.role==='Model' ? '[!TIP] AI' : '[!INFO] その他');
        const body = (m.content||'').replace(/\n/g,'\n> ');
        out += `> ${callout}\n> ${body}\n\n`;
      }
      return {fileName:this.makeFileName(title), output: out.trim()+'\n'};
    }

    // 標準Markdown（YAMLあり）
    out += yaml;
    out += `# ${title}\n\n`;
    out += `- サイト: ${site}\n- 保存日時: ${savedAt}\n- URL: ${url}\n- 会話数: ${messages.length}\n\n---\n\n`;
    for (let i=0;i<messages.length;i++){
      const m = messages[i];
      out += `## ${this.roleLabel(m.role)}\n\n${(m.content||'').trim()}\n\n`;
      if (i < messages.length-1) out += `---\n\n`;
    }
    return {fileName:this.makeFileName(title), output: out.trim()+'\n'};
  }

  downloadFile(fileName, content){
    try{
      const type = this.config.fmt==='json' ? 'application/json;charset=utf-8' : 'text/markdown;charset=utf-8';
      const blob = new Blob([content], {type});
      const url = URL.createObjectURL(blob);
      const a = Utils.el('a',{href:url,download:fileName});
      a.style.display='none';
      document.body.appendChild(a);
      a.click();
      // revokeは早すぎると失敗することがあるので余裕を置く
      setTimeout(()=>{ try{URL.revokeObjectURL(url);}catch{} try{a.remove();}catch{} }, 12000);
      return true;
    }catch{
      return false;
    }
  }

  async showResultDialog(messages, quality){
    return new Promise(resolve=>{
      const diff = this.diffInfo(messages);
      const summary = this.qualitySummary(quality, diff);
      const title = this.adapter.getTitle();
      const {fileName, output} = this.formatOutput(messages, quality, diff);

      const ov = this.overlay();
      const modal = Utils.el('div',{style:`width:min(720px, calc(100vw - 32px));background:${THEME.surface};border:1px solid ${THEME.border};border-radius:16px;overflow:hidden;box-shadow:0 10px 28px rgba(0,0,0,.4);color:${THEME.fg};`});

      const header = Utils.el('div',{style:`padding:20px 22px;background:${THEME.bg};border-bottom:1px solid ${THEME.border};`},[
        Utils.el('div',{text:'保存前の確認',style:'font-size:20px;line-height:1.35;font-weight:700;margin-bottom:6px;'}),
        Utils.el('div',{text:`判定: ${summary.label}（${summary.score}点）`,style:`font-size:14px;line-height:1.6;color:${summary.color};font-weight:700;`}),
        Utils.el('div',{text:summary.hint,style:`margin-top:6px;font-size:14px;line-height:1.65;color:${THEME.muted};font-weight:500;`}),
        summary.diffLine ? Utils.el('div',{text:summary.diffLine,style:`margin-top:6px;font-size:14px;line-height:1.65;color:${THEME.muted};font-weight:500;`}) : null
      ].filter(Boolean));

      const body = Utils.el('div',{style:'padding:18px 22px;'});
      const compact = Utils.el('div',{style:'display:grid;gap:6px;padding:12px;border-radius:12px;border:1px solid '+THEME.border+';background:'+THEME.bg+';margin-bottom:12px;font-size:14px;line-height:1.55;font-weight:500;'});
      let saveState = '未保存';
      const renderCompact = () => {
        compact.textContent = '';
        const lines = this.compactSummaryLines(messages, quality, diff, saveState);
        for(const line of lines){
          compact.appendChild(Utils.el('div',{text:line,style:'color:'+THEME.fg+';'}));
        }
      };
      const setSaveState = (state) => {
        saveState = `${state}`;
        renderCompact();
      };
      renderCompact();
      body.appendChild(compact);

      const grid = Utils.el('div',{style:'display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;'});
      const baseLabel = this.comparisonBaseLabel(diff.previous);
      const diffChip = (()=>{
        if (!diff.previous) return this.chip('前回', 'なし', THEME.muted);
        const sign = diff.diff>0?'+':'';
        const ratePct = Math.round((diff.rate||0)*100);
        const txt = `${sign}${diff.diff}件 (${ratePct}%)`;
        const col = diff.stable ? THEME.ok : (ratePct>=12 ? THEME.bad : THEME.warn);
        return this.chip('前回比', txt, col);
      })();

      grid.append(
        this.chip('会話数', `${messages.length}件`),
        this.chip('比較', baseLabel),
        this.chip('速度', this.getPresetLabel()),
        this.chip('形式', this.getFormatLabel()),
        diffChip
      );
      body.appendChild(grid);

      // プレビュー（末尾）
      const preview = Utils.el('details',{style:`margin-top:14px;border:1px solid ${THEME.border};border-radius:14px;background:${THEME.bg};overflow:hidden;`});
      preview.appendChild(Utils.el('summary',{text:'プレビュー（末尾5件）',style:`cursor:pointer;list-style:none;padding:12px 14px;font-weight:700;font-size:14px;line-height:1.5;`}));
      const pvInner = Utils.el('div',{style:'padding:12px 14px;border-top:1px solid '+THEME.border+';display:grid;gap:10px;'});
      const last = messages.slice(-5);
      for (const m of last){
        const snippet = (m.content||'').replace(/\s+/g,' ').trim().slice(0,160);
        pvInner.appendChild(Utils.el('div',{style:`padding:10px 12px;border-radius:12px;border:1px solid ${THEME.border};background:${THEME.surface};`},[
          Utils.el('div',{text:this.roleLabel(m.role),style:`font-size:14px;line-height:1.55;color:${THEME.muted};font-weight:700;margin-bottom:4px;`}),
          Utils.el('div',{text:snippet || '(空)',style:`font-size:14px;line-height:1.65;color:${THEME.fg};word-break:break-word;font-weight:500;`})
        ]));
      }
      preview.appendChild(pvInner);
      body.appendChild(preview);

      // 詳細（品質）
      if (quality){
        const detail = Utils.el('details',{style:`margin-top:12px;border:1px solid ${THEME.border};border-radius:14px;background:${THEME.bg};overflow:hidden;`});
        detail.appendChild(Utils.el('summary',{text:'くわしい判定を見る',style:`cursor:pointer;list-style:none;padding:12px 14px;font-weight:700;font-size:14px;line-height:1.5;`}));
        const txt = [
          `status: ${quality.status} / score: ${quality.score}`,
          `topReached: ${quality.topReached} / topStableHits: ${quality.topStableHits}`,
          `bottomReached: ${quality.bottomReached} / bottomStableHits: ${quality.bottomStableHits}`,
          `finalNewMessages: ${quality.finalNewMessages}`,
          `expandClicks: ${quality.expandClicks}`,
          `mergedUpdates: ${quality.mergedUpdates || 0}`,
          `unknownMessages: ${quality.unknownMessages || 0}`,
          `weakIdentityMessages: ${quality.weakIdentityMessages || 0}`,
          `orderGraphCycles: ${quality.orderGraphCycles || 0}`,
        ].join('\n');
        detail.appendChild(Utils.el('pre',{text:txt,style:`margin:0;padding:12px 14px;border-top:1px solid ${THEME.border};white-space:pre-wrap;word-break:break-word;font:12px/1.6 ${THEME.mono};color:${THEME.muted};`}));
        body.appendChild(detail);
      }

      // 保存予定ファイル名
      body.appendChild(Utils.el('div',{style:`margin-top:12px;padding:12px 14px;border-radius:14px;border:1px solid ${THEME.border};background:${THEME.bg};`},[
        Utils.el('div',{text:'保存されるファイル名',style:`font-size:14px;line-height:1.55;color:${THEME.muted};margin-bottom:4px;font-weight:700;`}),
        Utils.el('div',{text:fileName,style:`font-size:14px;line-height:1.65;color:${THEME.fg};word-break:break-all;font-weight:600;`})
      ]));

      // 手動コピー欄
      const manual = Utils.el('details',{style:`margin-top:12px;border:1px solid ${THEME.border};border-radius:14px;background:${THEME.bg};overflow:hidden;`});
      manual.appendChild(Utils.el('summary',{text:'手動コピー欄（コピーできない時用）',style:`cursor:pointer;list-style:none;padding:12px 14px;font-weight:700;font-size:14px;line-height:1.5;`}));
      const manInner = Utils.el('div',{style:'padding:12px 14px;border-top:1px solid '+THEME.border+';display:grid;gap:10px;'});
      const ta = Utils.el('textarea',{style:`width:100%;min-height:180px;border-radius:12px;border:1px solid ${THEME.border};background:${THEME.surface};color:${THEME.fg};padding:10px 12px;font:500 14px/1.65 ${THEME.mono};`, spellcheck:'false'});
      ta.value = output;
      const manBtns = Utils.el('div',{style:'display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end;'});
      const selectAll = ()=>{ ta.focus(); ta.select(); try{ ta.setSelectionRange(0, ta.value.length);}catch{} };
      manBtns.append(
        this.btn('全選択','secondary', ()=>{ selectAll(); Utils.toast('全選択しました。Ctrl/Cmd+Cでコピーできます。','info'); }),
        this.btn('コピー（可能なら）','secondary', async ()=>{
          selectAll();
          try{
            await navigator.clipboard.writeText(ta.value);
            Utils.toast('クリップボードにコピーしました。','success');
          }catch{
            Utils.toast('コピーできませんでした。全選択済みなので手動でコピーしてください。','warn', 3500);
          }
        })
      );
      manInner.append(ta, manBtns);
      manual.appendChild(manInner);
      body.appendChild(manual);

      const footer = Utils.el('div',{style:`padding:16px 22px;background:${THEME.bg};border-top:1px solid ${THEME.border};display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;`});

      const finish=(action)=>{
        try{ ov.remove(); }catch{}
        resolve(action);
      };

      const finalizeWithState = async (action, state, nextStateMs=220) => {
        setSaveState(state || '保存状態更新中');
        await Utils.sleep(nextStateMs);
        finish(action);
      };

      footer.append(
        this.btn('中止','subtle', ()=>finish({action:'cancel'})),
        this.btn('再実行','secondary', async ()=>{
          const ok = await this.confirmRerunDialog('normal');
          if (ok) finish({action:'rerun'});
        }),
        this.btn('ていねいで再実行','secondary', async ()=>{
          const ok = await this.confirmRerunDialog('careful');
          if (ok) finish({action:'rerun_careful'});
        }),
        this.btn('クリップボードにコピー','secondary', async ()=>{
          try{
            await navigator.clipboard.writeText(output);
            Utils.toast('クリップボードにコピーしました。','success');
            await finalizeWithState({action:'done_clipboard', saveState:'clipboard'}, 'クリップボード保存済み');
          }catch{
            Utils.toast('コピーできなかったため、ファイル保存に切り替えます。','warn', 3200);
            const ok = this.downloadFile(fileName, output);
            if (ok){
              await finalizeWithState({action:'done_file', saveState:'file'}, 'ファイル保存済み');
            }else{
              setSaveState('コピー/保存に失敗');
              Utils.toast('保存に失敗しました。', 'error', 2200);
              finish({action:'done_fail', saveState:'failed'});
            }
          }
        }),
        this.btn('保存（ファイル）','primary', ()=>{
          const ok = this.downloadFile(fileName, output);
          if (ok){
            finalizeWithState({action:'done_file', saveState:'file'}, 'ファイル保存済み');
          }else{
            setSaveState('保存失敗');
            finish({action:'done_fail', saveState:'failed'});
          }
        })
      );

      modal.append(header, body, footer);
      ov.appendChild(modal);
      document.body.appendChild(ov);
    });
  }

  async runOnce({skipConfig=false}={}){
    const proceed = skipConfig ? true : await this.showConfigDialog();
    if (!proceed) return {action:'cancel'};

    this.abortState = {aborted:false};
    const attemptId = this.markRunAttemptStart(this.config.preset);
    this.showBusyDialog();
    let res=null;
    try{
      res = await ScrollEngine.harvest(this.adapter, this.config, (p)=>this.updateBusyDialog(p), this.abortState);
    } finally {
      this.closeBusyDialog();
    }

    const messages = res?.messages || [];
    const quality = res?.quality || null;

    if (!messages.length){
      this.setRunAttemptStatus('failed', {
        attempt_id: attemptId,
        mode: this.config.preset,
        reason: 'no_messages'
      });
      Utils.toast('会話を見つけられませんでした。ページ表示が変わったか、未対応の可能性があります。', 'error', 4200);
      return {action:'cancel'};
    }

    // run meta 保存（保存/コピーの前に更新すると、失敗時にズレるので、結果ダイアログで確定後に保存）
    const diff = this.diffInfo(messages);
    const result = await this.showResultDialog(messages, quality);

    if (result?.action==='done_clipboard' || result?.action==='done_file'){
      this.saveRunMeta({
        count:messages.length,
        digest:diff.now.digest,
        at:Utils.nowIso(),
        saveState: result.saveState || result.action,
        run_mode: this.config.preset,
        run_id: attemptId,
        quality_status: quality?.status || 'WARN',
        quality_score: quality?.score ?? 0,
        message_count: messages.length
      });
      this.setRunAttemptStatus('success', {attempt_id: attemptId, count: messages.length, mode: this.config.preset});
    }else if (result?.action==='rerun' || result?.action==='rerun_careful'){
      this.setRunAttemptStatus('rerun_requested', {
        attempt_id: attemptId,
        count: messages.length,
        mode: this.config.preset,
        next_action: result.action
      });
    }else if (result?.action==='cancel'){
      this.setRunAttemptStatus('cancel', {
        attempt_id: attemptId,
        count: messages.length,
        mode: this.config.preset
      });
    }else{
      this.setRunAttemptStatus('aborted', {
        attempt_id: attemptId,
        count: messages.length,
        mode: this.config.preset,
        next_action: result?.action || 'unknown'
      });
    }
    return result;
  }

  async run(){
    try{
      let rerunOptions = {skipConfig:false};
      for(;;){
        const r = await this.runOnce(rerunOptions);
        rerunOptions = {skipConfig:true};
        if (!r || r.action==='cancel') break;
        if (r.action==='rerun'){
          continue;
        }
        if (r.action==='rerun_careful'){
          this.applyPreset('careful');
          this.saveConfig();
          continue;
        }
        break;
      }
    }catch(err){
      console.error('[AI Chat Export]', err);
      const msg = String(err?.message||err||'');
      if (msg.includes('中断しました')){
        Utils.toast('中断しました。','warn', 3200);
      } else {
        Utils.toast(`失敗しました: ${msg}`, 'error', 4200);
      }
    } finally {
window.__AI_CHAT_EXPORT_RUNNING__ = false;
    }
  }
}

await new App().run();

})();
