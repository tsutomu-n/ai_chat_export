javascript:(async () => {
    'use strict';

    // ==========================================
    // MODULE 1: CONFIG & THEME
    // ==========================================
    const APP_ID = 'polymath-omni-exporter-v3';
    const THEME = {
        bg: '#18181b',
        surface: '#27272a',
        fg: '#e4e4e7',
        border: '#3f3f46',
        accent: '#2563eb',
        accentHover: '#1d4ed8',
        success: '#16a34a',
        error: '#dc2626',
        font: 'system-ui, -apple-system, sans-serif'
    };

    // ==========================================
    // MODULE 2: UTILITIES
    // ==========================================
    class Utils {
        static el(tag, attrs = {}, children = []) {
            const element = document.createElement(tag);
            for (const [key, value] of Object.entries(attrs)) {
                if (value === undefined || value === null) continue;
                if (key === 'style') {
                    element.style.cssText = value;
                    continue;
                }
                if (key === 'text') {
                    element.textContent = value;
                    continue;
                }
                if (key.startsWith('on') && typeof value === 'function') {
                    element.addEventListener(key.slice(2).toLowerCase(), value);
                    continue;
                }
                if (typeof value === 'boolean') {
                    if (key in element) element[key] = value;
                    if (value) element.setAttribute(key, '');
                    continue;
                }
                if (key in element && (key === 'value' || key === 'checked' || key === 'selected')) {
                    element[key] = value;
                    continue;
                }
                element.setAttribute(key, String(value));
            }
            children.forEach(child => child && element.appendChild(child));
            return element;
        }

        static sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        static toast(message, type = 'info') {
            const bg = type === 'success' ? THEME.success : type === 'error' ? THEME.error : THEME.accent;
            const t = Utils.el('div', {
                style: `position:fixed;bottom:24px;right:24px;background:${bg};color:#fff;padding:12px 20px;border-radius:6px;z-index:2147483647;font-family:${THEME.font};font-size:14px;box-shadow:0 10px 15px -3px rgba(0,0,0,0.3);opacity:0;transition:opacity 0.3s;pointer-events:none;`,
                text: message
            });
            document.body.appendChild(t);
            requestAnimationFrame(() => t.style.opacity = '1');
            setTimeout(() => {
                t.style.opacity = '0';
                setTimeout(() => t.remove(), 300);
            }, 3000);
        }
    }

    // ==========================================
    // MODULE 3: ROBUST MARKDOWN PARSER (AST-like)
    // ==========================================
    class MarkdownParser {
        static parse(node) {
            if (!node) return '';
            if (node.shadowRoot) return this.parse(node.shadowRoot);
            
            if (node.nodeType === Node.ELEMENT_NODE) {
                const style = window.getComputedStyle(node);
                if (style.display === 'none' || style.visibility === 'hidden') return '';
            }

            if (node.nodeType === Node.TEXT_NODE) {
                return node.textContent.replace(/\u00a0/g, ' ');
            }

            const tag = (node.tagName || '').toLowerCase();

            // Guard for code blocks to prevent recursive parsing destruction
            if (tag === 'pre') {
                const codeNode = node.querySelector('code');
                const lang = codeNode ? (codeNode.className.match(/language-([\w-]+)/) || [])[1] || '' : '';
                return `\n\`\`\`${lang}\n${node.textContent.trim()}\n\`\`\`\n\n`;
            }

            let childrenMarkdown = Array.from(node.childNodes).map(c => this.parse(c)).join('');
            let md = '';

            switch (tag) {
                case 'p': case 'div': case 'article': case 'section':
                    md = `\n${childrenMarkdown}\n`;
                    break;
                case 'br':
                    md = `\n`;
                    break;
                case 'h1': md = `\n# ${childrenMarkdown}\n`; break;
                case 'h2': md = `\n## ${childrenMarkdown}\n`; break;
                case 'h3': md = `\n### ${childrenMarkdown}\n`; break;
                case 'h4': md = `\n#### ${childrenMarkdown}\n`; break;
                case 'h5': md = `\n##### ${childrenMarkdown}\n`; break;
                case 'h6': md = `\n###### ${childrenMarkdown}\n`; break;
                case 'li':
                    md = `\n- ${childrenMarkdown.trim()}`;
                    break;
                case 'ul': case 'ol':
                    md = `\n${childrenMarkdown}\n`;
                    break;
                case 'strong': case 'b':
                    md = `**${childrenMarkdown.trim()}**`;
                    break;
                case 'em': case 'i':
                    md = `*${childrenMarkdown.trim()}*`;
                    break;
                case 'code':
                    md = `\`${childrenMarkdown.trim()}\``;
                    break;
                case 'img':
                    md = `[Image: ${node.alt || 'img'}]`;
                    break;
                case 'a':
                    const href = node.getAttribute('href') || '';
                    md = `[${childrenMarkdown.trim()}](${href})`;
                    break;
                default:
                    md = childrenMarkdown;
            }
            return md;
        }

        static clean(markdown) {
            return markdown
                .replace(/\n{3,}/g, '\n\n') // Remove excessive newlines
                .replace(/\]\n\(/g, '](')   // Fix broken link structures
                .trim();
        }

        static extract(node) {
            return this.clean(this.parse(node));
        }
    }

    // ==========================================
    // MODULE 4: PLATFORM EXTRACTORS
    // ==========================================
    class ExtractorFactory {
        static getHostContext() {
            const host = location.hostname.toLowerCase();
            const path = location.pathname.toLowerCase();
            if (this.isAIStudioHost(host)) return this.extractAIStudio;
            if (this.isGrokHost(host, path)) return this.extractGrok;
            if (host.includes('claude')) return this.extractClaude;
            if (this.isChatGPTHost(host)) return this.extractChatGPT;
            if (host.includes('gemini')) return this.extractGemini;
            if (host.includes('deepseek')) return this.extractDeepSeek;
            throw new Error(`Unsupported platform: ${host}`);
        }

        static isAIStudioHost(host) {
            return host === 'aistudio.google.com' || host.endsWith('.aistudio.google.com') || host.includes('aistudio');
        }

        static isChatGPTHost(host) {
            return host === 'chatgpt.com' || host.endsWith('.chatgpt.com') || host === 'chat.openai.com';
        }

        static isGrokHost(host, path) {
            if (host.includes('grok')) return true;
            if (host === 'x.com' || host.endsWith('.x.com') || host === 'twitter.com' || host.endsWith('.twitter.com')) {
                return path.startsWith('/i/grok');
            }
            return false;
        }

        static getDeep(root, selector, acc = []) {
            if (!root) return acc;
            if (root.matches && root.matches(selector)) acc.push(root);
            if (root.shadowRoot) this.getDeep(root.shadowRoot, selector, acc);
            Array.from(root.children || []).forEach(c => this.getDeep(c, selector, acc));
            return acc;
        }

        static nodeSignature(el) {
            if (!el || !el.nodeType || el.nodeType !== Node.ELEMENT_NODE) return '';
            const attrs = ['data-message-id', 'data-turn-id', 'data-testid', 'id', 'data-node-id'];
            for (const name of attrs) {
                const value = el.getAttribute?.(name);
                if (value) return `${name}:${value}`;
            }
            const parts = [];
            let cur = el;
            let depth = 0;
            while (cur && cur.nodeType === Node.ELEMENT_NODE && cur !== document.body && depth < 8) {
                const tag = (cur.tagName || '').toLowerCase();
                let index = 1;
                let prev = cur.previousElementSibling;
                while (prev) {
                    if (prev.tagName === cur.tagName) index++;
                    prev = prev.previousElementSibling;
                }
                parts.push(`${tag}:${index}`);
                cur = cur.parentElement;
                depth++;
            }
            return parts.reverse().join('>');
        }

        static extractAIStudio() {
            const turns = Array.from(document.querySelectorAll('ms-chat-turn'));
            const msgs = [];
            turns.forEach(t => {
                const container = t.querySelector('.chat-turn-container') || t.closest('.chat-turn-container');
                const role = container?.classList.contains('user') ? 'User' : 'Model';
                const contentNode = t.querySelector('.turn-content') || t;
                let content = MarkdownParser.extract(contentNode);
                if (!content || content === 'more_vert') {
                    content = (contentNode.textContent || '').replace(/\u00a0/g, ' ').trim();
                }
                if (content && content !== 'more_vert') {
                    msgs.push({ role, content, sig: ExtractorFactory.nodeSignature(t) });
                }
            });
            return msgs;
        }

        static extractChatGPT() {
            const elements = Array.from(document.querySelectorAll('[data-message-author-role]'));
            if (elements.length) {
                return elements.map(el => ({
                    role: el.dataset.messageAuthorRole === 'user' ? 'User' : 'Model',
                    content: MarkdownParser.extract(el),
                    sig: ExtractorFactory.nodeSignature(el)
                }));
            }

            // Narrow fallback: only turn-like blocks instead of broad "main div".
            const turns = Array.from(
                document.querySelectorAll(
                    'article[data-testid^="conversation-turn-"], div[data-testid^="conversation-turn-"]'
                )
            );
            if (!turns.length) return [];

            return turns
                .map((el, idx) => {
                    let role = null;
                    const selfRole = el.getAttribute('data-message-author-role');
                    if (selfRole === 'user') role = 'User';
                    else if (selfRole === 'assistant') role = 'Model';
                    else if (el.querySelector('[data-message-author-role="user"]')) role = 'User';
                    else if (el.querySelector('[data-message-author-role="assistant"]')) role = 'Model';
                    else role = idx % 2 === 0 ? 'User' : 'Model';
                    return {
                        role,
                        content: MarkdownParser.extract(el),
                        sig: ExtractorFactory.nodeSignature(el)
                    };
                })
                .filter(m => m.content.length > 0);
        }

        static extractClaude() {
            const messages = [];
            document.querySelectorAll('.font-user-message, [data-testid="user-message"]').forEach(el => messages.push({ role: 'User', el }));
            document.querySelectorAll('.font-claude-response').forEach(el => messages.push({ role: 'Model', el }));
            return messages
                .sort((a, b) => a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_PRECEDING ? 1 : -1)
                .map(m => ({
                    role: m.role,
                    content: MarkdownParser.extract(m.el),
                    sig: ExtractorFactory.nodeSignature(m.el)
                }));
        }

        static extractDeepSeek() {
            const primary = Array.from(document.querySelectorAll('.ds-chat-message'));
            const elements = primary.length ? primary : Array.from(document.querySelectorAll('.ds-message'));
            let lastRole = 'Model';
            return elements.map(el => {
                const contentRoot = el.querySelector('.ds-markdown')?.cloneNode(true) || el.cloneNode(true);
                const reasoning = contentRoot.querySelector?.('.ds-markdown--reasoning');
                if (reasoning) reasoning.remove(); // Drop thinking process
                const cls = el.className || '';
                const role = cls.includes('user')
                    ? 'User'
                    : (cls.includes('assistant') || cls.includes('model'))
                        ? 'Model'
                        : (lastRole === 'Model' ? 'User' : 'Model');
                lastRole = role;
                return {
                    role,
                    content: MarkdownParser.extract(contentRoot),
                    sig: ExtractorFactory.nodeSignature(el)
                };
            }).filter(m => m.content.length > 0);
        }

        static extractGemini() {
            const elements = ExtractorFactory.getDeep(document.body, 'user-query-content, message-content');
            return elements.map(el => ({
                role: (el.tagName || '').toLowerCase().includes('user') ? 'User' : 'Model',
                content: MarkdownParser.extract(el),
                sig: ExtractorFactory.nodeSignature(el)
            }));
        }

        static extractGrok() {
            let elements = Array.from(document.querySelectorAll('div.message-bubble'));
            if (!elements.length) {
                const hashes = Array.from(
                    document.querySelectorAll('div[class*="css-"],span[class*="css-"]')
                )
                    .map(n => n.closest('div[class*="css-"]'))
                    .filter(Boolean);
                const ltr = Array.from(document.querySelectorAll('div[dir="ltr"]'));
                elements = [...new Set([...hashes, ...ltr])];
            }
            let lastRole = 'Model';
            return elements
                .filter(el => {
                    const t = (el.textContent || '').trim();
                    return t.length > 10 && t.length < 50000;
                })
                .map(el => {
                    const cls = el.classList || [];
                    const byClass =
                        cls.contains('message-bubble') && (cls.contains('w-full') || cls.contains('max-w-none'))
                            ? 'Model'
                            : cls.contains('message-bubble')
                                ? 'User'
                                : null;
                    const isModel = !!el.querySelector('pre, code, ul, ol, h1, h2, table');
                    const role = byClass || (isModel ? 'Model' : (lastRole === 'Model' ? 'User' : 'Model'));
                    lastRole = role;
                    return {
                        role,
                        content: MarkdownParser.extract(el),
                        sig: ExtractorFactory.nodeSignature(el)
                    };
                })
                .filter(m => m.content.length > 0);
        }
    }

    // ==========================================
    // MODULE 5: INCREMENTAL HARVESTER (Virtual Scroll Fix)
    // ==========================================
    class ScrollEngine {
        static buildQuality(messages, stats) {
            const topConverged = stats.topReached && stats.topStableHits >= 2;
            const bottomConverged = stats.bottomReached && stats.bottomStableHits >= 2;
            const finalPassStable = stats.finalNewMessages === 0;
            const checks = [topConverged, bottomConverged, finalPassStable];
            const failed = checks.filter(v => !v).length;
            const status = failed === 0 ? 'PASS' : (failed === 1 ? 'WARN' : 'FAIL');
            const score = Math.round(((checks.length - failed) / checks.length) * 100);

            return {
                status,
                score,
                totalMessages: messages.length,
                topReached: stats.topReached,
                bottomReached: stats.bottomReached,
                topStableHits: stats.topStableHits,
                bottomStableHits: stats.bottomStableHits,
                finalNewMessages: stats.finalNewMessages,
                topConverged,
                bottomConverged,
                finalPassStable,
            };
        }

        static getDocumentScroller() {
            return document.scrollingElement || document.documentElement || document.body;
        }

        static getMessageSignalCount(el) {
            if (!el || !el.querySelectorAll) return 0;
            const selectors = [
                '[data-message-author-role]',
                '[data-testid^="conversation-turn-"]',
                'ms-chat-turn',
                'div.message-bubble',
                '.ds-chat-message',
                '.ds-message',
                '.font-claude-response',
            ];
            let count = 0;
            for (const sel of selectors) {
                count += el.querySelectorAll(sel).length;
                if (count >= 60) break;
            }
            return count;
        }

        static findScrollContainer() {
            const viewportArea = window.innerWidth * window.innerHeight;
            const candidates = [];
            const rootScroller = this.getDocumentScroller();
            const pushCandidate = (el, scoreBoost = 0) => {
                if (!el) return;
                const isRoot = el === rootScroller;
                const scrollHeight = isRoot ? rootScroller.scrollHeight : el.scrollHeight;
                const clientHeight = isRoot ? window.innerHeight : el.clientHeight;
                const scrollableRange = scrollHeight - clientHeight;
                if (!Number.isFinite(scrollableRange) || scrollableRange < 160) return;

                let score = scrollableRange + scoreBoost;
                if (isRoot) {
                    score += viewportArea * 0.02;
                } else {
                    const rect = el.getBoundingClientRect();
                    const visibleH = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
                    const visibleW = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
                    const visibleArea = visibleH * visibleW;
                    if (visibleArea < viewportArea * 0.08) return;
                    score += visibleArea * 0.02;
                    if (visibleArea > viewportArea * 0.4) score += 1200;
                }
                score += this.getMessageSignalCount(el) * 800;
                candidates.push({ el, score });
            };

            pushCandidate(rootScroller, 500);
            for (const el of Array.from(document.querySelectorAll('*'))) {
                const style = window.getComputedStyle(el);
                if (style.overflowY === 'auto' || style.overflowY === 'scroll' || style.overflowY === 'overlay') {
                    pushCandidate(el);
                }
            }

            candidates.sort((a, b) => b.score - a.score);
            return candidates[0]?.el || rootScroller;
        }

        static async harvest(maxScrolls, delayMs, extractorFn) {
            const container = this.findScrollContainer();
            const rootScroller = this.getDocumentScroller();
            const isRoot = container === rootScroller;
            const getViewportH = () => isRoot ? window.innerHeight : container.clientHeight;
            const getH = () => container.scrollHeight;
            const getY = () => container.scrollTop;
            const getMaxY = () => Math.max(0, getH() - getViewportH());
            const scroll = (y) => {
                const clamped = Math.max(0, Math.min(y, getMaxY()));
                if (isRoot) {
                    window.scrollTo(0, clamped);
                    container.scrollTop = clamped;
                } else {
                    container.scrollTop = clamped;
                }
                return clamped;
            };

            const messageMap = new Map();
            const stats = {
                captures: 0,
                topIterations: 0,
                topReached: false,
                topStableHits: 0,
                topSettleIterations: 0,
                downIterations: 0,
                bottomReached: false,
                bottomStableHits: 0,
                finalNewMessages: 0,
            };

            const capture = () => {
                stats.captures++;
                const msgs = extractorFn();
                msgs.forEach((m, idx) => {
                    if (!m || !m.content || m.content.length < 2) return;
                    const sig = typeof m.sig === 'string' ? m.sig : '';
                    const key = sig
                        ? `${sig}\u0000${m.role}\u0000${m.content}`
                        : `${m.role}\u0000${m.content}\u0000${idx}`;
                    if (!messageMap.has(key)) {
                        messageMap.set(key, { ...m, _order: messageMap.size });
                    }
                });
                return messageMap.size;
            };

            Utils.toast('Loading history (Scrolling to top)...', 'info');

            // Phase 1: Sweep upward to force lazy loading of old messages.
            const step = Math.max(120, Math.floor(getViewportH() * 0.8));
            let topTries = 0;
            let topStill = 0;
            while (topTries++ < maxScrolls) {
                stats.topIterations++;
                const beforeCount = capture();
                const beforeY = getY();
                scroll(beforeY - step);
                await Utils.sleep(delayMs);
                const afterY = getY();
                const afterCount = capture();
                if (afterY <= 1) stats.topReached = true;
                const progressed = Math.abs(afterY - beforeY) > 1;
                const loaded = afterCount > beforeCount;
                if (!progressed && !loaded) {
                    if (++topStill >= 4) break;
                } else {
                    topStill = 0;
                }
            }

            // Some UIs keep loading older chunks while pinned at top.
            let settleIters = 0;
            let stableTop = 0;
            const settleMax = Math.max(6, Math.floor(maxScrolls / 4));
            while (settleIters++ < settleMax) {
                stats.topSettleIterations++;
                const beforeCount = capture();
                scroll(0);
                await Utils.sleep(delayMs);
                const afterCount = capture();
                if (afterCount === beforeCount) {
                    if (++stableTop >= 3) break;
                } else {
                    stableTop = 0;
                }
            }
            stats.topStableHits = stableTop;
            if (getY() <= 1) stats.topReached = true;

            Utils.toast('Harvesting data (Scrolling down)...', 'info');

            // Phase 2: Scroll DOWN incrementally and capture
            let currentY = getY();
            let downTries = 0;
            let downStill = 0;
            while (downTries++ < maxScrolls) {
                stats.downIterations++;
                const beforeCount = capture();
                const maxY = getMaxY();
                currentY += step;
                scroll(currentY);
                await Utils.sleep(delayMs);
                currentY = getY();
                const afterCount = capture();
                const reachedBottom = currentY >= Math.max(0, maxY - 1);
                if (reachedBottom) stats.bottomReached = true;
                if (reachedBottom && afterCount === beforeCount) {
                    if (++downStill >= 3) break;
                } else {
                    downStill = 0;
                }
            }
            stats.bottomStableHits = downStill;
            
            // Final capture at the bottom
            const beforeFinal = capture();
            await Utils.sleep(Math.max(80, Math.min(300, Math.floor(delayMs / 2))));
            const afterFinal = capture();
            stats.finalNewMessages = Math.max(0, afterFinal - beforeFinal);

            const messages = Array.from(messageMap.values()).sort((a, b) => a._order - b._order);
            const quality = this.buildQuality(messages, stats);
            return { messages, quality };
        }
    }

    // ==========================================
    // MODULE 6: UI & STATE MANAGEMENT
    // ==========================================
    class App {
        constructor() {
            this.siteId = this.getSiteId();
            this.siteDefaults = this.getSiteDefaults();
            this.config = this.loadPref();
        }

        getSiteId() {
            const host = location.hostname.toLowerCase();
            const path = location.pathname.toLowerCase();
            const isGrok = host.includes('grok') || (
                (host === 'x.com' || host.endsWith('.x.com') || host === 'twitter.com' || host.endsWith('.twitter.com')) &&
                path.startsWith('/i/grok')
            );
            if (isGrok) return 'grok';
            if (host === 'chatgpt.com' || host.endsWith('.chatgpt.com') || host === 'chat.openai.com') return 'chatgpt';
            if (host === 'aistudio.google.com' || host.endsWith('.aistudio.google.com') || host.includes('aistudio')) return 'aistudio';
            return 'generic';
        }

        getSiteDefaults() {
            if (this.siteId === 'grok') return { fmt: 'obs', scrollMax: 110, scrollDelay: 450 };
            if (this.siteId === 'chatgpt') return { fmt: 'obs', scrollMax: 106, scrollDelay: 500 };
            if (this.siteId === 'aistudio') return { fmt: 'obs', scrollMax: 96, scrollDelay: 550 };
            return { fmt: 'obs', scrollMax: 105, scrollDelay: 500 };
        }

        getPrefStorageKey() {
            return `${APP_ID}_prefs_${this.siteId}`;
        }

        clampNumber(value, fallback, min, max) {
            const parsed = Number.parseInt(String(value), 10);
            if (!Number.isFinite(parsed)) return fallback;
            return Math.max(min, Math.min(max, parsed));
        }

        loadPref() {
            const base = this.siteDefaults;
            try {
                const raw = JSON.parse(localStorage.getItem(this.getPrefStorageKey()) || '{}');
                return {
                    fmt: raw.fmt === 'std' ? 'std' : base.fmt,
                    scrollMax: this.clampNumber(raw.scrollMax, base.scrollMax, 20, 500),
                    scrollDelay: this.clampNumber(raw.scrollDelay, base.scrollDelay, 100, 4000),
                };
            } catch {
                return { ...base };
            }
        }

        savePref() {
            localStorage.setItem(this.getPrefStorageKey(), JSON.stringify(this.config));
        }

        trackRunConsistency(messageCount) {
            const key = `${location.origin}${location.pathname}`;
            const storageKey = `${APP_ID}_run_history`;
            let history = {};
            try {
                history = JSON.parse(localStorage.getItem(storageKey) || '{}');
            } catch {
                history = {};
            }
            const previous = history[key];
            history[key] = { count: messageCount, at: new Date().toISOString() };
            try {
                localStorage.setItem(storageKey, JSON.stringify(history));
            } catch {}
            if (!previous || !Number.isFinite(previous.count)) return null;
            const diff = Math.abs(previous.count - messageCount);
            const diffRate = previous.count > 0 ? diff / previous.count : 0;
            return {
                previousCount: previous.count,
                diff,
                diffRate,
                stable: diff <= 1 || diffRate <= 0.01
            };
        }

        createOverlay() {
            return Utils.el('div', {
                style: `position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:2147483647;display:flex;justify-content:center;align-items:center;backdrop-filter:blur(4px);font-family:${THEME.font};`
            });
        }

        async showConfigDialog() {
            return new Promise(resolve => {
                const overlay = this.createOverlay();
                const modal = Utils.el('div', {
                    style: `background:${THEME.surface};width:420px;border-radius:12px;border:1px solid ${THEME.border};box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);overflow:hidden;`
                });

                const header = Utils.el('div', {
                    style: `padding:16px 24px;border-bottom:1px solid ${THEME.border};background:${THEME.bg};display:flex;justify-content:space-between;align-items:center;`
                }, [
                    Utils.el('h2', { text: 'Polymath Core V3', style: `margin:0;color:${THEME.fg};font-size:16px;font-weight:600;` }),
                    Utils.el('button', { 
                        text: '✕', 
                        style: `background:none;border:none;color:#a1a1aa;cursor:pointer;font-size:16px;`, 
                        onclick: () => close(false) 
                    })
                ]);

                const createRow = (label, el) => {
                    const row = Utils.el('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;' });
                    row.appendChild(Utils.el('label', { text: label, style: 'color:#a1a1aa;font-size:14px;' }));
                    row.appendChild(el);
                    return row;
                };

                const selectFmt = Utils.el('select', {
                    style: `background:${THEME.bg};color:${THEME.fg};border:1px solid ${THEME.border};padding:8px 12px;border-radius:6px;outline:none;width:180px;`,
                    onchange: e => this.config.fmt = e.target.value
                }, [
                    Utils.el('option', { value: 'obs', text: 'Obsidian (Callouts)' }),
                    Utils.el('option', { value: 'std', text: 'Standard Markdown' })
                ]);
                selectFmt.value = this.config.fmt === 'std' ? 'std' : 'obs';
                const inputBaseStyle = `background:${THEME.bg};color:${THEME.fg};border:1px solid ${THEME.border};padding:8px 12px;border-radius:6px;outline:none;width:180px;`;
                const inputScrollMax = Utils.el('input', {
                    type: 'number',
                    min: '20',
                    max: '500',
                    value: String(this.config.scrollMax || this.siteDefaults.scrollMax),
                    style: inputBaseStyle
                });
                const inputScrollDelay = Utils.el('input', {
                    type: 'number',
                    min: '100',
                    max: '4000',
                    step: '50',
                    value: String(this.config.scrollDelay || this.siteDefaults.scrollDelay),
                    style: inputBaseStyle
                });

                const body = Utils.el('div', { style: 'padding:24px;' }, [
                    createRow('Format', selectFmt),
                    createRow('Scroll Max', inputScrollMax),
                    createRow('Delay (ms)', inputScrollDelay)
                ]);

                const footer = Utils.el('div', { style: `padding:16px 24px;border-top:1px solid ${THEME.border};background:${THEME.bg};display:flex;justify-content:flex-end;gap:12px;` });
                
                const close = (proceed) => {
                    if (proceed) {
                        this.config.scrollMax = this.clampNumber(
                            inputScrollMax.value,
                            this.siteDefaults.scrollMax,
                            20,
                            500
                        );
                        this.config.scrollDelay = this.clampNumber(
                            inputScrollDelay.value,
                            this.siteDefaults.scrollDelay,
                            100,
                            4000
                        );
                    }
                    overlay.remove();
                    if (proceed) this.savePref();
                    resolve(proceed);
                };

                const btnStart = Utils.el('button', {
                    text: 'Start Extraction',
                    style: `padding:8px 16px;background:${THEME.accent};color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:600;transition:background 0.2s;`,
                    onclick: () => close(true)
                });
                
                btnStart.onmouseover = () => btnStart.style.background = THEME.accentHover;
                btnStart.onmouseout = () => btnStart.style.background = THEME.accent;

                footer.appendChild(btnStart);
                modal.append(header, body, footer);
                overlay.appendChild(modal);
                document.body.appendChild(overlay);
            });
        }

        async showResultDialog(title, output, messageCount, quality, consistency) {
            return new Promise(resolve => {
                const overlay = this.createOverlay();
                const modal = Utils.el('div', {
                    style: `background:${THEME.surface};width:420px;border-radius:12px;border:1px solid ${THEME.border};box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);overflow:hidden;text-align:center;padding:32px 24px;`
                });

                const icon = Utils.el('div', { text: '✓', style: `font-size:48px;color:${THEME.success};margin-bottom:16px;` });
                const heading = Utils.el('h2', { text: `Extracted ${messageCount} Messages`, style: `margin:0 0 8px 0;color:${THEME.fg};font-size:20px;font-weight:600;` });
                const sub = Utils.el('p', { text: 'Data has been successfully harvested.', style: `margin:0 0 32px 0;color:#a1a1aa;font-size:14px;` });
                const checks = [];
                if (quality) {
                    checks.push({
                        label: 'Top stable',
                        pass: quality.topConverged,
                        detail: `(reached=${quality.topReached ? 'Yes' : 'No'}, stableHits=${quality.topStableHits})`,
                    });
                    checks.push({
                        label: 'Bottom stable',
                        pass: quality.bottomConverged,
                        detail: `(reached=${quality.bottomReached ? 'Yes' : 'No'}, stableHits=${quality.bottomStableHits})`,
                    });
                    checks.push({
                        label: 'Final pass stable',
                        pass: quality.finalPassStable,
                        detail: `(newMessages=${quality.finalNewMessages})`,
                    });
                }
                if (consistency) {
                    checks.push({
                        label: 'Consistency vs prev',
                        pass: consistency.stable,
                        detail: `(diff=${consistency.diff}, ${(consistency.diffRate * 100).toFixed(1)}%)`,
                    });
                }

                const failedChecks = checks.filter(c => !c.pass).length;
                const status = failedChecks === 0 ? 'PASS' : (failedChecks === 1 ? 'WARN' : 'FAIL');
                const consistencyLine = consistency
                    ? null
                    : 'Consistency vs prev: N/A (first run)';
                const metricsLines = [
                    `Status: ${status}`,
                    quality ? `Convergence score: ${quality.score}/100` : null,
                    quality ? `Captured messages: ${quality.totalMessages}` : `Captured messages: ${messageCount}`,
                    ...checks.map(c => `${c.label}: ${c.pass ? 'OK' : 'NG'} ${c.detail}`),
                    consistencyLine,
                ].filter(Boolean);
                const metricsText = metricsLines.join('\n');
                const metrics = Utils.el('pre', {
                    text: metricsText,
                    style: `text-align:left;white-space:pre-wrap;margin:0 0 24px 0;padding:10px 12px;border:1px solid ${THEME.border};border-radius:8px;background:${THEME.bg};color:#a1a1aa;font-size:12px;line-height:1.5;`
                });

                const btnGroup = Utils.el('div', { style: 'display:flex;gap:12px;justify-content:center;' });

                const btnCopy = Utils.el('button', {
                    text: 'Copy to Clipboard',
                    style: `flex:1;padding:12px;background:${THEME.accent};color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:600;transition:background 0.2s;`,
                    onclick: async () => {
                        try {
                            // Synchronous user click -> Clipboard API allowed
                            await navigator.clipboard.writeText(output);
                            Utils.toast('Copied to Clipboard!', 'success');
                        } catch (e) {
                            Utils.toast('Clipboard failed. Downloading instead.', 'error');
                            this.downloadFile(title, output);
                        }
                        overlay.remove();
                        resolve();
                    }
                });
                btnCopy.onmouseover = () => btnCopy.style.background = THEME.accentHover;
                btnCopy.onmouseout = () => btnCopy.style.background = THEME.accent;

                const btnDl = Utils.el('button', {
                    text: 'Download .md',
                    style: `flex:1;padding:12px;background:#3f3f46;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:600;transition:background 0.2s;`,
                    onclick: () => {
                        this.downloadFile(title, output);
                        overlay.remove();
                        resolve();
                    }
                });
                btnDl.onmouseover = () => btnDl.style.background = '#52525b';
                btnDl.onmouseout = () => btnDl.style.background = '#3f3f46';

                btnGroup.append(btnCopy, btnDl);
                modal.append(icon, heading, sub, metrics, btnGroup);
                overlay.appendChild(modal);
                document.body.appendChild(overlay);
            });
        }

        formatOutput(messages) {
            let safeTitle = (document.title || 'Chat_Log').replace(/[<>:"/\\|?*]/g, '_').substring(0, 50);
            
            // AI Studio Title override fix
            if (location.hostname.toLowerCase().includes('aistudio')) {
                const h1 = document.querySelector('h1.mode-title, h1.actions');
                if (h1 && h1.innerText.trim()) safeTitle = h1.innerText.trim().replace(/[<>:"/\\|?*]/g, '_');
            }

            const dateStr = new Date().toISOString();
            let output = `---\ntitle: ${safeTitle}\nurl: ${location.href}\ndate: ${dateStr}\n---\n\n`;

            messages.forEach(m => {
                if (this.config.fmt === 'obs') {
                    const callout = m.role === 'User' ? '[!INFO] User' : '[!EXAMPLE] Model';
                    output += `> ${callout}\n> ${m.content.replace(/\n/g, '\n> ')}\n\n`;
                } else {
                    output += `### ${m.role}\n\n${m.content}\n\n`;
                }
            });

            return { title: safeTitle, output };
        }

        downloadFile(title, content) {
            const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = Utils.el('a', { href: url, download: `${title}_${Date.now()}.md` });
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        }

        async run() {
            try {
                const proceed = await this.showConfigDialog();
                if (!proceed) return;

                const extractorFn = ExtractorFactory.getHostContext();
                const harvestResult = await ScrollEngine.harvest(this.config.scrollMax, this.config.scrollDelay, extractorFn);
                const messages = Array.isArray(harvestResult) ? harvestResult : (harvestResult.messages || []);
                const quality = Array.isArray(harvestResult) ? null : (harvestResult.quality || null);

                if (!messages || messages.length === 0) {
                    Utils.toast('Extraction failed. DOM structure may be unsupported.', 'error');
                    return;
                }

                const { title, output } = this.formatOutput(messages);
                const consistency = this.trackRunConsistency(messages.length);
                
                // Show Result UI to handle Transient Activation for Clipboard
                await this.showResultDialog(title, output, messages.length, quality, consistency);

            } catch (err) {
                console.error('[Polymath Error]', err);
                Utils.toast(`Fatal Error: ${err.message}`, 'error');
            }
        }
    }

    // ==========================================
    // EXECUTION
    // ==========================================
    new App().run();

})();
