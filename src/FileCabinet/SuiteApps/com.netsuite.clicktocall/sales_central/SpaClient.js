define(['exports', '@uif-js/component'], (function (exports, component) { 'use strict';

    const el = (tag, cls, text) => {
        const e = document.createElement(tag);
        if (cls)
            e.className = cls;
        if (text != null)
            e.textContent = text;
        return e;
    };
    const clear = (node) => {
        while (node.firstChild)
            node.removeChild(node.firstChild);
    };
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const money = (n) => n ? '$' + Math.round(n).toLocaleString('en-US') : '—';
    const isoDay = (iso) => Date.parse(iso + 'T00:00:00Z');
    const ago = (iso, todayIso) => {
        if (!iso)
            return '—';
        const d = Math.round((isoDay(todayIso) - isoDay(iso)) / 86400000);
        if (d === 0)
            return 'Today';
        if (d === 1)
            return 'Yesterday';
        if (d > 1 && d < 7)
            return d + 'd ago';
        return shortDate(iso);
    };
    const shortDate = (iso) => {
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
        return m ? MONTHS[parseInt(m[2], 10) - 1] + ' ' + parseInt(m[3], 10) : '—';
    };
    const clock = (sec) => {
        const s = Math.max(0, Math.round(sec || 0));
        return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    };
    const localToday = (now) => {
        const d = now || new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    };
    const nsDateToIso = (s) => {
        const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(s || '').trim());
        return m ? m[3] + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0') : '';
    };

    const STYLES = [
        '.sc{position:relative;min-height:100%;background:#FFFFFF;color:#161513;font:400 13px/19px "Oracle Sans","Helvetica Neue",Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}',
        '.sc *{box-sizing:border-box}',
        '.sc [hidden]{display:none !important}',
        '.sc button{font:inherit;color:inherit}',
        '.sc a{color:#1F3550;text-decoration:none}.sc a:hover{text-decoration:underline}',
        '.sc .mut{color:#6F6B66}',
        '.sc .num{font-variant-numeric:tabular-nums;text-align:right}',
        '.sc .dot{width:6px;height:6px;border-radius:999px;flex:none;display:inline-block}',
        '.sc-head{height:56px;display:flex;align-items:center;gap:12px;padding:0 24px}',
        '.sc-head h1{margin:0;font-size:20px;line-height:26px;font-weight:600;letter-spacing:-0.01em}',
        '.sc-head .mut{font-size:12px}',
        '.sc-tabbar{display:flex;align-items:center;gap:24px;padding:0 24px;border-bottom:1px solid #ECEAE7}',
        '.sc-tabs{display:flex;gap:24px}',
        '.sc-tab{height:40px;padding:0;border:0;background:none;display:inline-flex;align-items:center;gap:6px;color:#4A4744;cursor:pointer;box-shadow:inset 0 -2px 0 transparent;transition:box-shadow 150ms ease,color 150ms ease}',
        '.sc-tab:hover{color:#161513}',
        '.sc-tab[aria-selected="true"]{color:#161513;font-weight:500;box-shadow:inset 0 -2px 0 #1F3550}',
        '.sc-tab[disabled]{color:#A8A39C;cursor:default}',
        '.sc-tab .cnt{font-weight:400;color:#6F6B66;font-variant-numeric:tabular-nums}',
        '.sc-tab:focus-visible,.sc-row:focus-visible,.sc-pin:focus-visible,.sc-btn:focus-visible,.sc-icon:focus-visible{outline:2px solid #1F3550;outline-offset:2px}',
        '.sc-filters{display:flex;align-items:center;gap:8px;margin-left:auto}',
        '.sc-chip{height:28px;padding:0 10px;border-radius:6px;box-shadow:inset 0 0 0 1px #DEDBD7;font-size:12px;color:#6F6B66;display:inline-flex;align-items:center;gap:4px}',
        '.sc-chip b{font-weight:500;color:#161513}',
        '.sc-label{padding:4px 24px 8px;font-size:12px;font-weight:500;color:#6F6B66}',
        '.sc-label .cnt{font-weight:400}',
        '.sc-pins{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;padding:0 24px 24px}',
        '.sc-pin{display:flex;flex-direction:column;gap:8px;padding:14px 16px;border:0;border-radius:10px;background:#FFFFFF;box-shadow:0 0 0 1px #ECEAE7;text-align:left;cursor:pointer;min-width:0;transition:box-shadow 150ms ease,transform 120ms cubic-bezier(0.23,1,0.32,1)}',
        '.sc-pin:hover{box-shadow:0 0 0 1px #C9C5BF,0 4px 12px rgba(22,21,19,0.05)}',
        '.sc-pin:active{transform:scale(0.99)}',
        '.sc-pin .top{display:flex;align-items:center;gap:8px;font-size:12px}',
        '.sc-pin .name{font-size:14px;font-weight:500}',
        '.sc-pin .why{color:#4A4744}',
        '.sc-pin .meta{font-size:12px;color:#6F6B66}',
        '.sc-thead,.sc-row{display:grid;align-items:center;column-gap:16px;padding:0 24px}',
        '.sc-thead{height:32px;border-bottom:1px solid #ECEAE7;font-size:12px;color:#6F6B66}',
        '.sc-row{width:100%;min-height:48px;border:0;border-bottom:1px solid #ECEAE7;background:#FFFFFF;text-align:left;cursor:pointer}',
        '.sc-row:hover{background:#FAFAF9}',
        '.sc-row[aria-current="true"]{background:#F5F4F2}',
        '.sc-needs .sc-thead,.sc-needs .sc-row{grid-template-columns:minmax(0,1fr) 140px 90px 100px 100px}',
        '.sc-calls .sc-thead,.sc-calls .sc-row{grid-template-columns:110px 200px minmax(0,1fr) 70px 70px}',
        '.sc-cell2{display:flex;flex-direction:column;min-width:0;padding:6px 0}',
        '.sc-cell2 .l1{display:flex;gap:8px;align-items:baseline}',
        '.sc-cell2 .name{font-size:14px;font-weight:500}',
        '.sc-cell2 .why{color:#4A4744;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
        '.sc-status{display:inline-flex;align-items:center;gap:6px}',
        '.sc-clip{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
        '.sc-strong{font-weight:500}',
        '.sc-tasks .sc-thead,.sc-tline{grid-template-columns:minmax(0,1.4fr) minmax(0,0.8fr) minmax(0,1fr) 72px 170px;column-gap:24px}',
        '.sc-sumline{display:flex;align-items:center;gap:20px;padding:0 24px;border-bottom:1px solid #ECEAE7}',
        '.sc-sum{height:40px;padding:0;border:0;background:none;display:inline-flex;align-items:center;gap:7px;font:inherit;font-size:12px;color:#4A4744;cursor:pointer;box-shadow:inset 0 -2px 0 transparent}',
        '.sc-sum b{font-weight:500;color:#161513;font-variant-numeric:tabular-nums}',
        '.sc-sum[aria-pressed="true"]{color:#161513;font-weight:500;box-shadow:inset 0 -2px 0 #161513}',
        '.sc-sum:focus-visible,.sc-more:focus-visible,.sc-toast-act:focus-visible{outline:2px solid #1F3550;outline-offset:2px}',
        '.sc-cd{width:8px;height:8px;border-radius:999px;flex:none}',
        '.sc-band{display:flex;align-items:center;gap:8px;height:32px;padding:0 24px;border-bottom:1px solid #ECEAE7;font-size:12px;font-weight:500;color:#4A4744;background:#FAFAF9}',
        '.sc-more{display:flex;align-items:center;width:100%;height:36px;padding:0 24px;border:0;border-bottom:1px solid #ECEAE7;background:#FFFFFF;font:inherit;font-size:12px;font-weight:500;color:#1F3550;cursor:pointer;text-align:left}',
        '.sc-more:hover{text-decoration:underline}',
        '.sc-band .cnt{font-weight:400}',
        '.sc-hint{margin-left:auto;font-weight:400;color:#6F6B66}',
        '.sc-trow{border-bottom:1px solid #ECEAE7}',
        '.sc-trow[data-open="true"]{background:#F5F4F2;border-bottom-color:#DEDBD7}',
        '.sc-trow{transition:background-color 600ms ease}',
        '.sc-trow.sc-flash{background:#E9EDF2;transition:none}',
        '.sc-tline{display:grid;align-items:center;min-height:48px;padding:0 24px}',
        '.sc-tbtn{padding:0;border:0;background:none;text-align:left;font:inherit;color:inherit;cursor:pointer}',
        '.sc-tbtn:hover{color:#1F3550}',
        '.sc-ttitle{font-weight:500;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
        '.sc-tline.tap{cursor:pointer}',
        '.sc-tline.tap:hover{background:#FAFAF9}',
        '.sc-trow[data-open="true"] .sc-tline.tap:hover{background:none}',
        '.sc-acct{display:flex;align-items:center;gap:2px;min-width:0}',
        '.sc-peek{width:28px;height:28px;padding:0;border:0;border-radius:6px;background:none;color:#A8A39C;display:inline-flex;align-items:center;justify-content:center;flex:none;cursor:pointer}',
        '.sc-peek:hover,.sc-peek[aria-current="true"]{color:#1F3550;background:#E9EDF2}',
        '.sc-peek:focus-visible{outline:2px solid #1F3550;outline-offset:2px}',
        '.sc-from{display:flex;align-items:center;gap:8px;font-size:12px;color:#4A4744;min-width:0}',
        '.sc-due{font-size:12px}',
        '.sc-verbs{display:flex;align-items:center;justify-content:flex-end;gap:6px;min-width:0}',
        '.sc-btn.sm{height:28px;padding:0 10px;font-size:12px}',
        '.sc-topen{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);padding:4px 24px 18px;animation:sc-rise 180ms cubic-bezier(0.23,1,0.32,1) both}',
        '.sc-lbl{font-size:12px;font-weight:500;color:#6F6B66}',
        '.sc-ctx{display:flex;flex-direction:column;gap:6px;padding-right:24px;color:#3B3935;min-width:0}',
        '.sc-ctxt{white-space:pre-line;display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical;overflow:hidden}',
        '.sc-ctx .sc-links{display:flex;gap:16px;margin-top:4px}',
        '.sc-lk{border:0;background:none;padding:0;font:inherit;font-weight:500;color:#1F3550;cursor:pointer;text-decoration:none}',
        '.sc-lk:hover{text-decoration:underline}',
        '.sc-act{display:flex;flex-direction:column;gap:10px;padding-left:24px;border-left:1px solid #DEDBD7;min-width:0}',
        '.sc-outs{display:inline-flex;align-self:flex-start;gap:2px;padding:2px;border-radius:7px;background:#E9E6E1}',
        '.sc-opt{height:28px;padding:0 12px;border:0;border-radius:5px;background:none;color:#4A4744;font:inherit;font-size:12px;cursor:pointer;white-space:nowrap}',
        '.sc-opt[aria-pressed="true"]{background:#FFFFFF;color:#161513;font-weight:500}',
        '.sc-field{width:100%;box-sizing:border-box;min-height:32px;padding:6px 10px;border:0;border-radius:6px;box-shadow:inset 0 0 0 1px #DEDBD7;font:inherit;color:#161513;background:#FFFFFF}',
        '.sc-field:focus{outline:2px solid #1F3550;outline-offset:0}',
        '.sc-next{display:grid;grid-template-columns:minmax(0,1fr) 150px;gap:8px}',
        '.sc-btn.pri{background:#1F3550;color:#FFFFFF}',
        '.sc-btn[disabled]{opacity:0.5;cursor:default}',
        '.sc-acts{display:flex;align-items:center;justify-content:flex-end;gap:8px}',
        '.sc-acts .sc-err{margin-right:auto}',
        '.sc-err{font-size:12px;color:#B3311F}',
        '.sc-toast{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);display:flex;align-items:center;height:40px;padding:0 16px;border-radius:10px;background:#161513;color:#FFFFFF;box-shadow:0 8px 24px rgba(22,21,19,0.18);z-index:30;gap:14px;animation:sc-fade 160ms ease-out both}',
        '.sc-toast-act{padding:0;border:0;background:none;font:inherit;font-weight:500;color:#9DB4CF;cursor:pointer}',
        '@keyframes sc-rise{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}',
        '.sc-msg{padding:48px 24px;text-align:center;color:#6F6B66}',
        '.sc-msg b{display:block;margin-bottom:4px;font-size:14px;font-weight:500;color:#161513}',
        '.sc-ph{height:48px;border-bottom:1px solid #ECEAE7;padding:0 24px;display:flex;align-items:center}',
        '.sc-ph span{height:10px;width:40%;border-radius:999px;background:#F5F4F2}',
        '.sc-note{margin:0 24px 12px;padding:8px 12px;border-radius:6px;background:#F5F4F2;font-size:12px;color:#4A4744}',
        '.sc-btn{height:30px;padding:0 12px;border:0;border-radius:6px;font-weight:500;cursor:pointer;white-space:nowrap;transition:transform 120ms cubic-bezier(0.23,1,0.32,1)}',
        '.sc-btn:active{transform:scale(0.98)}',
        '.sc-btn.go{background:#436B1D;color:#FFFFFF}',
        '.sc-btn.go[disabled]{opacity:0.45;cursor:default;transform:none}',
        '.sc-btn.gh{background:#FFFFFF;color:#161513;box-shadow:inset 0 0 0 1px #DEDBD7;display:inline-flex;align-items:center;text-decoration:none}',
        '.sc-btn.gh:hover{box-shadow:inset 0 0 0 1px #A8A39C;text-decoration:none}',
        '.sc-icon{width:30px;height:30px;padding:0;border:0;border-radius:6px;background:none;color:#4A4744;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}',
        '.sc-icon:hover{background:#F5F4F2}',
        '.sc-icon[disabled]{opacity:0.4;cursor:default}',
        '.sc-drawer{position:fixed;right:0;bottom:16px;width:440px;max-width:100vw;background:#FFFFFF;box-shadow:-1px 0 0 #ECEAE7,-16px 0 32px rgba(22,21,19,0.08);display:flex;flex-direction:column;z-index:20;animation:sc-in 260ms cubic-bezier(0.32,0.72,0,1) both}',
        '.sc-drawer.out{animation:sc-out 200ms cubic-bezier(0.32,0.72,0,1) both}',
        '.sc-dhead{display:flex;align-items:center;gap:4px;height:48px;padding:0 8px 0 20px;border-bottom:1px solid #ECEAE7}',
        '.sc-dhead .tools{margin-left:auto;display:flex;gap:2px}',
        '.sc-dbody{flex:1;overflow:auto;padding:20px;display:flex;flex-direction:column;gap:20px}',
        '.sc-dtitle{display:flex;flex-direction:column;gap:2px}',
        '.sc-dtitle b{font-size:20px;line-height:26px;font-weight:600}',
        '.sc-glance{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}',
        '.sc-glance div{display:flex;flex-direction:column;gap:2px;padding:10px 12px;border-radius:6px;background:#F5F4F2}',
        '.sc-glance b{font-size:16px;font-weight:600;font-variant-numeric:tabular-nums}',
        '.sc-glance span{font-size:12px;color:#6F6B66}',
        '.sc-sect{display:flex;flex-direction:column;gap:6px}',
        '.sc-sect>.mut:first-child{font-size:12px;font-weight:500}',
        '.sc-item{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:baseline}',
        '.sc-dfoot{display:flex;align-items:center;gap:8px;padding:12px 20px;border-top:1px solid #ECEAE7}',
        '.sc-dfoot .mut{margin-left:auto;font-size:12px}',
        '@keyframes sc-in{from{transform:translateX(100%)}to{transform:none}}',
        '@keyframes sc-out{from{transform:none}to{transform:translateX(100%)}}',
        '@keyframes sc-fade{from{opacity:0}to{opacity:1}}',
        '.sc-fade{animation:sc-fade 160ms ease-out both}',
        '@media (prefers-reduced-motion: reduce){.sc-drawer,.sc-drawer.out{animation:sc-fade 150ms linear both}.sc-tab,.sc-btn,.sc-pin{transition:none}.sc-topen{animation:none}.sc-trow{transition:none}}'
    ].join('\n');

    const LIVE_TABS = ['needs', 'tasks', 'calls'];
    const parseRoute = (hash) => {
        const parts = String(hash || '').replace(/^#\/?/, '').split('/');
        const tab = LIVE_TABS.indexOf(parts[0]) !== -1 ? parts[0] : 'needs';
        const account = parts[1] === 'a' && /^[0-9]{1,12}$/.test(parts[2] || '') ? parts[2] : '';
        return { tab, account };
    };
    const formatRoute = (r) => '#' + r.tab + (r.account ? '/a/' + r.account : '');

    const makePost = (restletUrl) => (body) => fetch(restletUrl, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    }).then((r) => {
        if (!r.ok)
            throw new Error('HTTP ' + r.status);
        return r.json();
    });

    const MOUNT_URL = '/app/site/hosting/scriptlet.nl?script=customscript_ctc_sl_shell&deploy=customdeploy_ctc_sl_shell&mount=1';
    const loadScript = (src, attrs) => new Promise((resolve, reject) => {
        const s = document.createElement('script');
        attrs.forEach(([k, v]) => s.setAttribute(k, v));
        s.src = src;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('Could not load the phone'));
        document.body.appendChild(s);
    });
    const mountDock = (win) => fetch(MOUNT_URL, { credentials: 'same-origin' })
        .then((r) => r.json())
        .then((m) => {
        if (!m || !m.ok || !m.assetUrl || !m.dialerUrl)
            throw new Error('The phone is not set up for this account');
        const attrs = m.attrs || [];
        const restlet = (attrs.find(([k]) => k === 'data-restlet-url') || ['', ''])[1];
        const ready = win.__ctcDock ? Promise.resolve()
            : loadScript(m.assetUrl, attrs).then(() => loadScript(m.dialerUrl, []));
        return { restlet, ready };
    });
    const setDockContext = (win, ctx) => {
        const d = win.__ctcDock;
        if (d && typeof d.setContext === 'function')
            d.setContext(ctx);
    };
    const callWithDock = (win, ctx) => {
        const d = win.__ctcDock;
        if (!d || typeof d.call !== 'function')
            return false;
        d.call(ctx);
        return true;
    };

    const TONE = { red: '#B3311F', amber: '#B8730A', grey: '#A8A39C' };
    const status = (r) => {
        const s = el('span', 'sc-status');
        const d = el('span', 'dot');
        d.style.background = TONE[r.tone] || TONE.grey;
        const t = el('span', '', r.status);
        if (r.tone === 'red')
            t.style.color = TONE.red;
        s.append(d, t);
        return s;
    };
    const whyText = (r) => r.why + (r.more ? ' · +' + r.more + ' more' : '');
    const renderNeeds = (host, v) => {
        clear(host);
        host.className = 'sc-needs sc-fade';
        const buttons = [];
        if (v.partial.length) {
            host.appendChild(el('div', 'sc-note', 'Some sources did not load (' + v.partial.join(', ') + '). The list may be short.'));
        }
        if (!v.rows.length) {
            const m = el('div', 'sc-msg');
            m.append(el('b', '', 'Nothing needs you right now'), el('span', '', 'Missed calls, overdue tasks, follow-ups and late invoices show here.'));
            host.appendChild(m);
            return buttons;
        }
        const pins = v.rows.slice(0, 3);
        const lab = el('div', 'sc-label', 'Do first ');
        lab.appendChild(el('span', 'cnt', String(pins.length)));
        host.appendChild(lab);
        const grid = el('div', 'sc-pins');
        pins.forEach((r) => {
            const b = el('button', 'sc-pin');
            b.type = 'button';
            const top = el('span', 'top');
            top.appendChild(status(r));
            const touch = el('span', 'mut', r.lastTouch ? 'Last touch ' + ago(r.lastTouch, v.todayIso) : '');
            touch.style.marginLeft = 'auto';
            top.appendChild(touch);
            b.append(top, el('span', 'name', r.name), el('span', 'why', whyText(r)), el('span', 'meta', (r.open ? money(r.open) + ' open' : 'Nothing open') + (r.next ? ' · next ' + shortDate(r.next) : '')));
            b.addEventListener('click', () => v.onOpen(r));
            grid.appendChild(b);
        });
        host.appendChild(grid);
        const all = el('div', 'sc-label', 'All ');
        all.appendChild(el('span', 'cnt', String(v.rows.length)));
        host.appendChild(all);
        const head = el('div', 'sc-thead');
        head.append(el('span', '', 'Account · why now'), el('span', '', 'Status'), el('span', 'num', 'Next'), el('span', 'num', 'Open'), el('span', 'num', 'Last touch'));
        host.appendChild(head);
        v.rows.forEach((r) => {
            const b = el('button', 'sc-row');
            b.type = 'button';
            b.setAttribute('data-id', r.companyId);
            if (r.companyId === v.selected)
                b.setAttribute('aria-current', 'true');
            const c = el('span', 'sc-cell2');
            const l1 = el('span', 'l1');
            l1.appendChild(el('span', 'name', r.name));
            c.append(l1, el('span', 'why', whyText(r)));
            const next = el('span', 'num', r.next ? shortDate(r.next) : '—');
            next.style.color = '#4A4744';
            b.append(c, status(r), next, el('span', 'num', money(r.open)), el('span', 'num mut', ago(r.lastTouch, v.todayIso)));
            b.addEventListener('click', () => v.onOpen(r));
            host.appendChild(b);
            buttons.push(b);
        });
        return buttons;
    };

    const when = (r, todayIso) => {
        const day = ago(nsDateToIso(r.date), todayIso).replace(/d ago$/, 'd');
        return (day === '—' ? '' : day + ' ') + (r.timeOfDay || '');
    };
    const summary = (r) => {
        if (r.brief)
            return r.brief;
        if (r.voicemail)
            return 'Voicemail';
        if (r.callStatus === 'Missed')
            return 'Missed call';
        if (r.callStatus === 'No answer')
            return 'No answer';
        return 'No summary yet';
    };
    const renderCalls = (host, v) => {
        clear(host);
        host.className = 'sc-calls sc-fade';
        const buttons = [];
        if (!v.rows.length) {
            const m = el('div', 'sc-msg');
            m.append(el('b', '', 'No calls this week'), el('span', '', 'Calls with your accounts show here.'));
            host.appendChild(m);
            return buttons;
        }
        const head = el('div', 'sc-thead');
        head.append(el('span', '', 'When'), el('span', '', 'Account'), el('span', '', 'AI summary'), el('span', 'num', 'Length'), el('span', 'num', 'Score'));
        host.appendChild(head);
        v.rows.forEach((r) => {
            const b = el('button', 'sc-row');
            b.type = 'button';
            b.setAttribute('data-id', r.companyId);
            if (!r.companyId) {
                b.disabled = true;
                b.style.cursor = 'default';
            }
            if (r.companyId && r.companyId === v.selected)
                b.setAttribute('aria-current', 'true');
            const score = el('span', 'num', r.satisfaction ? String(r.satisfaction) : '—');
            if (r.satisfaction && r.satisfaction <= 3)
                score.style.color = '#B3311F';
            const sum = el('span', 'sc-clip', summary(r));
            sum.style.color = '#4A4744';
            b.append(el('span', 'mut', when(r, v.todayIso)), el('span', 'sc-strong sc-clip', r.companyName || r.phone || 'Unknown caller'), sum, el('span', 'num', r.duration ? clock(r.duration) : '—'), score);
            b.addEventListener('click', () => { if (r.companyId)
                v.onOpen(r); });
            host.appendChild(b);
            if (r.companyId)
                buttons.push(b);
        });
        return buttons;
    };

    const BANDS = [['overdue', 'Overdue'], ['today', 'Today'], ['week', 'This week'], ['later', 'Later']];
    const GROUP_COLOR = {
        suggested: '#5F7590', overdue: '#B3311F', today: '#B8730A', week: '#A8A39C', later: '#DEDBD7'
    };
    const SUGGESTION_CAP = 3;
    const bandLabel = (band) => (BANDS.filter((b) => b[0] === band)[0] || ['', ''])[1];
    const OUTCOMES = [['done', 'Done'], ['next', 'Next step'], ['reach', 'Couldn’t reach'], ['no', 'Not needed']];
    const ACTION = {
        done: 'Complete', next: 'Complete and add next step', reach: 'Try again tomorrow', no: 'Close as not needed'
    };
    const nextBusinessDay = (iso) => {
        const d = new Date(iso + 'T12:00:00Z');
        do {
            d.setUTCDate(d.getUTCDate() + 1);
        } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
        return d.toISOString().slice(0, 10);
    };
    const dueText = (r) => (r.due ? shortDate(r.due) : 'No date');
    const dueColor = (r) => r.kind === 'suggestion' ? '#6F6B66' : r.band === 'overdue' ? '#B3311F' : r.band === 'today' ? '#B8730A' : '#6F6B66';
    const displayTitle = (title) => title.replace(/^AI:\s*/, '');
    const circle = (group) => {
        const c = el('span', 'sc-cd');
        c.style.background = GROUP_COLOR[group];
        return c;
    };
    const plainNote = (note) => note.split(/\n|<br\s*\/?>/i).map((l) => l.trim()).filter(Boolean).join('\n');
    const button = (cls, text, onClick) => {
        const b = el('button', cls, text);
        b.type = 'button';
        b.addEventListener('click', onClick);
        return b;
    };
    const link = (text, href) => {
        const a = el('a', 'sc-lk', text);
        a.href = href;
        a.target = '_top';
        return a;
    };
    const fromCell = (r) => {
        const c = el('span', 'sc-from sc-clip');
        if (!r.fromCall) {
            c.classList.add('mut');
            c.textContent = 'Added in NetSuite';
            return c;
        }
        c.textContent = (r.fromCall.title || 'A call') + (r.fromCall.date ? ' · ' + shortDate(r.fromCall.date) : '');
        return c;
    };
    const contextBlock = (r) => {
        const w = el('div', 'sc-ctx');
        const note = plainNote(r.note || '');
        w.appendChild(el('span', 'sc-lbl', r.fromCall ? 'From the call' : 'Notes'));
        w.appendChild(el('span', 'sc-ctxt' + (note ? '' : ' mut'), note || 'No notes on this task.'));
        const links = el('div', 'sc-links');
        if (r.fromCall)
            links.appendChild(link('Open call', '/app/crm/calendar/call.nl?id=' + encodeURIComponent(r.fromCall.id)));
        links.appendChild(link('Open in NetSuite', '/app/crm/calendar/task.nl?id=' + encodeURIComponent(r.id)));
        w.appendChild(links);
        return w;
    };
    const actionBlock = (r, v) => {
        const act = el('div', 'sc-act');
        let outcome = 'done';
        const outs = el('div', 'sc-outs');
        outs.setAttribute('role', 'group');
        outs.setAttribute('aria-label', 'Outcome');
        const note = el('input', 'sc-field');
        note.type = 'text';
        note.placeholder = 'Add a note (optional)';
        note.setAttribute('aria-label', 'Note');
        const next = el('div', 'sc-next');
        const nextTitle = el('input', 'sc-field');
        nextTitle.type = 'text';
        nextTitle.value = 'Follow up with ' + (r.companyName || 'the customer');
        nextTitle.setAttribute('aria-label', 'Next step');
        const nextDue = el('input', 'sc-field');
        nextDue.type = 'date';
        nextDue.value = nextBusinessDay(v.todayIso);
        nextDue.setAttribute('aria-label', 'Next step due');
        next.append(nextTitle, nextDue);
        const err = el('span', 'sc-err');
        err.setAttribute('role', 'alert');
        const go = button('sc-btn pri', ACTION.done, () => {
            const payload = { outcome: outcome, note: note.value.trim() };
            if (outcome === 'next')
                payload.next = { title: nextTitle.value.trim(), due: nextDue.value };
            go.disabled = true;
            err.textContent = '';
            v.onComplete(r, payload).then((problem) => {
                if (problem) {
                    err.textContent = problem;
                    go.disabled = false;
                }
            });
        });
        const paint = () => {
            Array.from(outs.children).forEach((b) => b.setAttribute('aria-pressed', String(b.getAttribute('data-o') === outcome)));
            next.hidden = outcome !== 'next';
            go.textContent = ACTION[outcome];
        };
        OUTCOMES.forEach(([o, label]) => {
            const b = button('sc-opt', label, () => { outcome = o; paint(); });
            b.setAttribute('data-o', o);
            outs.appendChild(b);
        });
        const acts = el('div', 'sc-acts');
        acts.append(err, button('sc-btn gh', 'Cancel', () => v.onToggle(r.id)), go);
        act.append(outs, note, next, acts);
        paint();
        return act;
    };
    const suggestionVerbs = (r, v) => {
        const cell = el('span', 'sc-verbs');
        const err = el('span', 'sc-err sc-clip');
        err.setAttribute('role', 'alert');
        const act = (approve) => () => {
            Array.from(cell.querySelectorAll('button')).forEach((b) => { b.disabled = true; });
            err.textContent = '';
            v.onSuggestion(r, approve).then((problem) => {
                if (!problem)
                    return;
                err.textContent = problem;
                err.title = problem;
                Array.from(cell.querySelectorAll('button')).forEach((b) => { b.disabled = false; });
            });
        };
        cell.append(err, button('sc-btn gh sm', 'Dismiss', act(false)), button('sc-btn pri sm', 'Approve', act(true)));
        return cell;
    };
    const renderRow = (r, v) => {
        const open = r.kind === 'task' && r.id === v.openId;
        const row = el('div', 'sc-trow');
        row.setAttribute('data-id', r.id);
        row.setAttribute('data-open', String(open));
        const line = el('div', 'sc-tline');
        const text = displayTitle(r.title);
        const title = r.kind === 'task' ? button('sc-tbtn sc-ttitle', text, () => v.onToggle(r.id)) : el('span', 'sc-ttitle', text);
        if (r.kind === 'task')
            title.setAttribute('aria-expanded', String(open));
        const due = el('span', 'num sc-due', dueText(r));
        due.style.color = dueColor(r);
        let verb;
        if (r.kind === 'suggestion')
            verb = suggestionVerbs(r, v);
        else if (open)
            verb = el('span');
        else
            verb = el('span', 'sc-verbs');
        if (r.kind === 'task' && !open)
            verb.appendChild(button('sc-btn gh sm', 'Complete', () => v.onToggle(r.id)));
        line.append(title, accountCell(r, v), fromCell(r), due, verb);
        if (r.kind === 'task') {
            line.classList.add('tap');
            line.addEventListener('click', (e) => {
                if (!e.target.closest('button, a, input, textarea'))
                    v.onToggle(r.id);
            });
        }
        row.appendChild(line);
        if (open) {
            const body = el('div', 'sc-topen');
            body.append(contextBlock(r), actionBlock(r, v));
            row.appendChild(body);
        }
        return row;
    };
    const accountCell = (r, v) => {
        if (!r.companyId)
            return el('span', 'sc-clip mut', '—');
        const cell = el('span', 'sc-acct');
        const peek = button('sc-peek', '', () => v.onOpenAccount(r));
        peek.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
        peek.setAttribute('data-id', r.companyId);
        peek.setAttribute('aria-label', 'Account details: ' + (r.companyName || 'account'));
        peek.title = 'Account details';
        if (v.selectedAccount === r.companyId)
            peek.setAttribute('aria-current', 'true');
        cell.append(el('span', 'sc-clip', r.companyName || 'Account'), peek);
        return cell;
    };
    const band = (group, label, count, hint) => {
        const b = el('div', 'sc-band');
        b.append(circle(group), el('span', '', label + ' '), el('span', 'cnt', String(count)));
        if (hint)
            b.appendChild(el('span', 'sc-hint', hint));
        return b;
    };
    const renderTasks = (host, v) => {
        clear(host);
        host.className = 'sc-tasks sc-fade';
        if (v.partial.length) {
            host.appendChild(el('div', 'sc-note', 'Some sources did not load (' + v.partial.join(', ') + '). The list may be short.'));
        }
        if (!v.rows.length) {
            const m = el('div', 'sc-msg');
            m.append(el('b', '', 'No open tasks'), el('span', '', 'Tasks assigned to you and follow-ups suggested from your calls show here.'));
            host.appendChild(m);
            return [];
        }
        const suggestions = v.rows.filter((r) => r.kind === 'suggestion');
        const inBand = (key) => v.rows.filter((r) => r.kind === 'task' && r.band === key);
        const groups = [['all', 'All', v.rows.length], ['suggested', 'Suggested', suggestions.length]];
        BANDS.forEach(([key, label]) => groups.push([key, label, inBand(key).length]));
        const shown = groups.some((g) => g[0] === v.group && g[2] > 0) ? v.group : 'all';
        const line = el('div', 'sc-sumline');
        line.setAttribute('role', 'group');
        line.setAttribute('aria-label', 'Show');
        groups.forEach(([g, label, count]) => {
            if (g !== 'all' && !count)
                return;
            const b = button('sc-sum', '', () => v.onGroup(g));
            b.setAttribute('data-g', g);
            b.setAttribute('aria-pressed', String(shown === g));
            if (g !== 'all')
                b.appendChild(circle(g));
            b.append(el('span', '', label + ' '), el('b', '', String(count)));
            line.appendChild(b);
        });
        host.appendChild(line);
        const head = el('div', 'sc-thead');
        head.append(el('span', '', 'Task'), el('span', '', 'Account'), el('span', '', 'From'), el('span', 'num', 'Due'), el('span'));
        host.appendChild(head);
        if (suggestions.length && (shown === 'all' || shown === 'suggested')) {
            const capped = shown === 'all' && !v.showAllSuggested && suggestions.length > SUGGESTION_CAP;
            host.appendChild(band('suggested', 'Suggested from your calls', suggestions.length, 'Approve adds it to your tasks'));
            (capped ? suggestions.slice(0, SUGGESTION_CAP) : suggestions).forEach((r) => host.appendChild(renderRow(r, v)));
            if (capped)
                host.appendChild(button('sc-more', 'Show all ' + suggestions.length, v.onShowAllSuggested));
        }
        BANDS.forEach(([key, label]) => {
            const items = inBand(key);
            if (!items.length || (shown !== 'all' && shown !== key))
                return;
            host.appendChild(band(key, label, items.length));
            items.forEach((r) => host.appendChild(renderRow(r, v)));
        });
        return Array.from(host.querySelectorAll('.sc-peek'));
    };

    const ICON = {
        up: 'M6 15l6-6 6 6', down: 'M6 9l6 6 6-6', close: 'M6 6l12 12M18 6L6 18'
    };
    const icon = (path, label, onClick) => {
        const b = el('button', 'sc-icon');
        b.type = 'button';
        b.setAttribute('aria-label', label);
        b.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + path + '"></path></svg>';
        b.addEventListener('click', onClick);
        return b;
    };
    const recordUrl = (a) => '/app/common/entity/custjob.nl?id=' + encodeURIComponent(a.companyId);
    const touchText = (days) => {
        if (days == null)
            return '—';
        if (days === 0)
            return 'Today';
        if (days === 1)
            return '1 day';
        return days + ' days';
    };
    const section = (label) => {
        const s = el('div', 'sc-sect');
        s.appendChild(el('span', 'mut', label));
        return s;
    };
    const fill = (body, a, ctx, contacts) => {
        clear(body);
        const title = el('div', 'sc-dtitle');
        title.append(el('b', '', a.name), el('span', 'mut', a.phone || 'Customer'));
        body.appendChild(title);
        if (ctx.error) {
            body.appendChild(el('span', 'mut', 'Could not load this account. ' + ctx.error));
            return;
        }
        const o = ctx.outstanding || { sum: 0, count: 0, overdueCount: 0, oldestDays: null };
        const g = el('div', 'sc-glance');
        const cell = (num, label, red) => {
            const c = el('div');
            const b = el('b', '', num);
            if (red)
                b.style.color = '#B3311F';
            c.append(b, el('span', '', label));
            return c;
        };
        g.append(cell(money(o.sum), 'open'), cell(String(o.overdueCount || 0), 'overdue invoices', (o.overdueCount || 0) > 0), cell(touchText(ctx.lastTouchDays), 'since last touch'));
        body.appendChild(g);
        const act = section('Recent activity');
        (ctx.activity || []).forEach((x) => {
            const i = el('div', 'sc-item');
            i.append(el('span', 'sc-clip', x.text), el('span', 'mut', x.ageDays === 0 ? 'Today' : x.ageDays + 'd'));
            act.appendChild(i);
        });
        if (!(ctx.activity || []).length)
            act.appendChild(el('span', 'mut', 'No activity in the last 90 days'));
        body.appendChild(act);
        const fu = section('Follow-ups');
        (ctx.followUps || []).forEach((f) => {
            const i = el('div', 'sc-item');
            i.append(el('span', '', f.title), el('span', 'mut', f.due ? 'Due ' + shortDate(f.due) : ''));
            fu.appendChild(i);
        });
        if (!(ctx.followUps || []).length)
            fu.appendChild(el('span', 'mut', 'No open follow-ups'));
        body.appendChild(fu);
        const people = section('People');
        contacts.filter((c) => c.contactId !== '__company_main__').slice(0, 4).forEach((c) => {
            const ph = (c.phones || [])[0];
            people.appendChild(el('span', '', c.name + (c.title ? ', ' + c.title : '') + (ph ? ' · ' + ph.number : '')));
        });
        if (people.childNodes.length === 1)
            people.appendChild(el('span', 'mut', 'No contacts'));
        body.appendChild(people);
    };
    const openDrawer = (host, a, h) => {
        clear(host);
        const d = el('aside', 'sc-drawer');
        d.setAttribute('aria-label', a.name);
        d.style.top = h.top() + 'px';
        const head = el('div', 'sc-dhead');
        const tools = el('span', 'tools');
        const up = icon(ICON.up, 'Previous', () => h.onStep(-1));
        const down = icon(ICON.down, 'Next', () => h.onStep(1));
        up.disabled = !h.canStep(-1);
        down.disabled = !h.canStep(1);
        tools.append(up, down, icon(ICON.close, 'Close (Esc)', h.onClose));
        head.append(el('span', 'mut', 'Account'), tools);
        const body = el('div', 'sc-dbody');
        const title = el('div', 'sc-dtitle');
        title.append(el('b', '', a.name), el('span', 'mut', 'Loading…'));
        body.appendChild(title);
        const foot = el('div', 'sc-dfoot');
        const call = el('button', 'sc-btn go', 'Call');
        call.type = 'button';
        call.addEventListener('click', () => h.onCall(a));
        const open = el('a', 'sc-btn gh', 'Open in NetSuite');
        open.href = recordUrl(a);
        open.target = '_top';
        foot.append(call, open, el('span', 'mut', 'Esc to close'));
        d.append(head, body, foot);
        host.appendChild(d);
        Promise.all([
            h.post({ action: 'softphoneCallContext', entityId: a.companyId })
                .catch((e) => ({ error: e.message })),
            h.post({ action: 'softphoneContacts', entityId: a.companyId })
                .then((r) => r.rows || []).catch(() => [])
        ]).then(([ctx, contacts]) => {
            if (d.isConnected)
                fill(body, a, ctx, contacts);
        });
        return d;
    };
    const closeDrawer = (host) => {
        const d = host.querySelector('.sc-drawer');
        if (!d)
            return;
        d.classList.add('out');
        window.setTimeout(() => { if (d.parentNode === host)
            clear(host); }, 200);
    };

    const TABS = [
        ['needs', 'Needs me'], ['pipeline', 'Pipeline'], ['tasks', 'Tasks'], ['calls', 'Calls'], ['money', 'Money']
    ];
    const PROBLEM = {
        forbidden: 'This task is not assigned to you.',
        already_actioned: 'Already done. The list is updated.',
        invalid_next_title: 'Give the next step a title.',
        invalid_next_due: 'Pick a due date for the next step.',
        invalid_note: 'The note is too long.'
    };
    const startApp = (root, win) => {
        const style = el('style', '', STYLES);
        root.className = 'sc';
        root.appendChild(style);
        const today = localToday();
        const head = el('header', 'sc-head');
        head.append(el('h1', '', 'Sales Central'), el('span', 'mut', new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })));
        const tabs = el('nav', 'sc-tabs');
        tabs.setAttribute('aria-label', 'Sales Central');
        tabs.setAttribute('role', 'tablist');
        const filters = el('div', 'sc-filters');
        const tabBar = el('div', 'sc-tabbar');
        tabBar.append(tabs, filters);
        const content = el('div');
        const drawerHost = el('div');
        root.append(head, tabBar, content, drawerHost);
        let route = parseRoute(win.location.hash);
        const data = { needs: null, needsPartial: [], calls: null, callsTotal: 0, tasks: null, tasksPartial: [], error: '' };
        let taskOpenId = '';
        let taskGroup = 'all';
        let showAllSuggested = false;
        let post = null;
        let listButtons = [];
        const accountsOf = (tab) => {
            if (tab === 'calls') {
                const seen = {};
                return (data.calls || []).filter((c) => c.companyId && !seen[c.companyId] && (seen[c.companyId] = true))
                    .map((c) => ({ companyId: c.companyId, name: c.companyName, entityType: 'customer', phone: c.phone }));
            }
            if (tab === 'tasks') {
                const seen = {};
                return (data.tasks || []).filter((t) => t.companyId && !seen[t.companyId] && (seen[t.companyId] = true))
                    .map((t) => ({ companyId: t.companyId, name: t.companyName, entityType: 'customer', phone: '' }));
            }
            return (data.needs || []).map((r) => ({ companyId: r.companyId, name: r.name, entityType: r.entityType, phone: r.phone }));
        };
        const current = () => accountsOf(route.tab).filter((a) => a.companyId === route.account)[0] || null;
        const writeHash = () => {
            const hash = formatRoute(route);
            if (win.location.hash !== hash)
                win.history.replaceState(null, '', hash);
            try {
                const shell = win.top.__ctcShell;
                if (shell && typeof shell.syncFramePath === 'function')
                    shell.syncFramePath();
            }
            catch (e) { }
        };
        const go = (next) => {
            const tabChanged = next.tab !== route.tab;
            route = next;
            writeHash();
            render(tabChanged);
        };
        const renderTabs = () => {
            clear(tabs);
            TABS.forEach(([id, label]) => {
                const live = LIVE_TABS.indexOf(id) !== -1;
                const b = el('button', 'sc-tab', label);
                b.type = 'button';
                b.setAttribute('role', 'tab');
                b.setAttribute('aria-selected', String(route.tab === id));
                if (!live) {
                    b.disabled = true;
                    b.title = 'Coming next';
                }
                const count = id === 'needs' && data.needs ? String(data.needs.length)
                    : id === 'tasks' && data.tasks ? String(data.tasks.length)
                        : id === 'calls' && data.calls ? String(data.callsTotal) : '';
                if (live && count)
                    b.appendChild(el('span', 'cnt', count));
                b.addEventListener('click', () => { if (live && route.tab !== id)
                    go({ tab: id, account: '' }); });
                tabs.appendChild(b);
            });
        };
        const renderFilters = () => {
            clear(filters);
            const chip = (k, v) => {
                const c = el('span', 'sc-chip', k + ' ');
                c.appendChild(el('b', '', v));
                return c;
            };
            filters.append(chip('Owner', 'Me'), chip('Range', route.tab === 'calls' ? 'This week' : route.tab === 'tasks' ? 'All open' : 'Last 14 days'));
        };
        const loading = () => {
            clear(content);
            for (let i = 0; i < 5; i++) {
                const p = el('div', 'sc-ph');
                p.appendChild(el('span'));
                content.appendChild(p);
            }
        };
        const failed = (msg) => {
            clear(content);
            const m = el('div', 'sc-msg');
            m.append(el('b', '', 'Sales Central could not load'), el('span', '', msg));
            content.appendChild(m);
        };
        const openAccount = (companyId) => go({ tab: route.tab, account: companyId });
        const renderContent = () => {
            if (data.error) {
                failed(data.error);
                return;
            }
            if (route.tab === 'tasks') {
                if (!data.tasks) {
                    loading();
                    return;
                }
                listButtons = renderTasks(content, { rows: data.tasks, openId: taskOpenId, selectedAccount: route.account,
                    group: taskGroup, showAllSuggested: showAllSuggested,
                    todayIso: today, partial: data.tasksPartial,
                    onToggle: (id) => { taskOpenId = taskOpenId === id ? '' : id; renderContent(); },
                    onGroup: (g) => { taskGroup = g; renderContent(); },
                    onShowAllSuggested: () => { showAllSuggested = true; renderContent(); },
                    onOpenAccount: (r) => openAccount(r.companyId),
                    onComplete: completeTask,
                    onSuggestion: actOnSuggestion });
                return;
            }
            if (route.tab === 'calls') {
                if (!data.calls) {
                    loading();
                    return;
                }
                listButtons = renderCalls(content, { rows: data.calls, selected: route.account, todayIso: today,
                    onOpen: (r) => openAccount(r.companyId) });
            }
            else {
                if (!data.needs) {
                    loading();
                    return;
                }
                listButtons = renderNeeds(content, { rows: data.needs, selected: route.account, todayIso: today,
                    partial: data.needsPartial, onOpen: (r) => openAccount(r.companyId) });
            }
        };
        const toast = (text, action) => {
            const old = root.querySelector('.sc-toast');
            if (old)
                old.remove();
            const t = el('div', 'sc-toast', text);
            t.setAttribute('role', 'status');
            if (action) {
                const b = el('button', 'sc-toast-act', action[0]);
                b.type = 'button';
                b.addEventListener('click', () => { t.remove(); action[1](); });
                t.appendChild(b);
            }
            root.appendChild(t);
            win.setTimeout(() => t.remove(), action ? 6000 : 3500);
        };
        const reveal = (id) => {
            taskGroup = 'all';
            renderContent();
            const row = content.querySelector('.sc-trow[data-id="' + id + '"]');
            if (!row)
                return;
            if (typeof row.scrollIntoView === 'function')
                row.scrollIntoView({ block: 'center' });
            row.classList.add('sc-flash');
            win.setTimeout(() => row.classList.remove('sc-flash'), 900);
        };
        const loadNeeds = () => post({ action: 'salesCentralNeeds' }).then((d) => {
            if (d.error)
                throw new Error(d.error);
            data.needs = d.rows || [];
            data.needsPartial = d.partial || [];
        }).catch((e) => {
            data.needs = [];
            data.needsPartial = ['all: ' + e.message];
        });
        const loadTasks = () => post({ action: 'salesCentralTasks' }).then((d) => {
            if (d.error)
                throw new Error(d.error);
            data.tasks = d.rows || [];
            data.tasksPartial = d.partial || [];
        }).catch((e) => {
            data.tasks = [];
            data.tasksPartial = ['all: ' + e.message];
        });
        const refreshAfterWrite = (message) => {
            taskOpenId = '';
            toast(message);
            Promise.all([loadTasks(), loadNeeds()]).then(() => render(true));
        };
        const completeTask = (r, p) => post({ action: 'salesCentralCompleteTask', taskId: r.id, outcome: p.outcome, note: p.note, next: p.next }).then((d) => {
            if (d.error) {
                if (d.error === 'already_actioned')
                    refreshAfterWrite(PROBLEM.already_actioned);
                return PROBLEM[d.error] || 'Could not save. Try again.';
            }
            refreshAfterWrite(p.outcome === 'reach' ? 'Kept open, due tomorrow · ' + r.title
                : p.outcome === 'next' ? 'Completed · next step added · ' + r.title
                    : p.outcome === 'no' ? 'Closed as not needed · ' + r.title : 'Completed · ' + r.title);
            return '';
        }).catch(() => 'Could not save. Try again.');
        const actOnSuggestion = (r, approve) => post(approve && r.assignTo
            ? { action: 'approveProposedTask', taskId: r.id, edits: { assigneeId: r.assignTo } }
            : { action: approve ? 'approveProposedTask' : 'rejectProposedTask', taskId: r.id }).then((d) => {
            if (d.error)
                return d.error === 'forbidden' ? 'Not allowed: this call is not yours or your team\u2019s.' : 'Could not save. Try again.';
            if (!approve) {
                refreshAfterWrite('Dismissed · ' + r.title);
                return '';
            }
            taskOpenId = '';
            const newId = String(d.nativeTaskId || '');
            Promise.all([loadTasks(), loadNeeds()]).then(() => {
                render(true);
                const made = (data.tasks || []).filter((t) => t.kind === 'task' && t.id === newId)[0];
                if (made)
                    toast('Approved · now in ' + bandLabel(made.band) + ' · ' + r.title, ['Show', () => reveal(newId)]);
                else
                    toast('Approved · ' + r.title);
            });
            return '';
        }).catch(() => 'Could not save. Try again.');
        const step = (dir) => {
            const list = accountsOf(route.tab);
            const i = list.findIndex((a) => a.companyId === route.account);
            const next = list[i + dir];
            return next ? next.companyId : '';
        };
        const drawerTop = () => Math.max(0, Math.round(tabs.getBoundingClientRect().bottom));
        let shownAccount = '';
        const renderDrawer = () => {
            const a = route.account && post ? current() : null;
            if (!a) {
                if (shownAccount)
                    closeDrawer(drawerHost);
                shownAccount = '';
                return;
            }
            if (a.companyId === shownAccount)
                return;
            shownAccount = a.companyId;
            setDockContext(win, { entityId: a.companyId, entityName: a.name, entityType: a.entityType, phone: a.phone });
            openDrawer(drawerHost, a, {
                post: post,
                top: drawerTop,
                onClose: () => go({ tab: route.tab, account: '' }),
                onStep: (dir) => { const id = step(dir); if (id)
                    go({ tab: route.tab, account: id }); },
                canStep: (dir) => !!step(dir),
                onCall: (acc) => {
                    callWithDock(win, { entityId: acc.companyId, entityName: acc.name, entityType: acc.entityType, phone: acc.phone });
                }
            });
        };
        const render = (full) => {
            renderTabs();
            if (full) {
                renderFilters();
                renderContent();
            }
            else
                listButtons.forEach((b) => {
                    if (b.getAttribute('data-id') === route.account)
                        b.setAttribute('aria-current', 'true');
                    else
                        b.removeAttribute('aria-current');
                });
            renderDrawer();
        };
        win.document.addEventListener('keydown', (e) => {
            if (!route.account || e.metaKey || e.ctrlKey || e.altKey)
                return;
            const t = e.target;
            if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))
                return;
            if (e.key === 'Escape') {
                go({ tab: route.tab, account: '' });
                e.preventDefault();
                return;
            }
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                const id = step(e.key === 'ArrowDown' ? 1 : -1);
                if (id) {
                    go({ tab: route.tab, account: id });
                    e.preventDefault();
                }
            }
        });
        win.addEventListener('hashchange', () => {
            const next = parseRoute(win.location.hash);
            if (next.tab !== route.tab || next.account !== route.account) {
                const tabChanged = next.tab !== route.tab;
                route = next;
                render(tabChanged);
            }
        });
        win.addEventListener('resize', () => {
            const d = drawerHost.querySelector('.sc-drawer');
            if (d)
                d.style.top = drawerTop() + 'px';
        });
        writeHash();
        render(true);
        mountDock(win).then(({ restlet, ready }) => {
            ready.catch(() => { });
            if (!restlet)
                throw new Error('No RESTlet URL from the phone set-up.');
            post = makePost(restlet);
            const p = post;
            loadNeeds().then(() => render(true));
            loadTasks().then(() => render(true));
            p({ action: 'getWorkspaceHistory', dateRange: 'thisweek', limit: 50, pastOnly: true, companyNames: true }).then((d) => {
                if (d.error)
                    throw new Error(d.error);
                data.calls = d.rows || [];
                data.callsTotal = typeof d.total === 'number' ? d.total : data.calls.length;
            }).catch(() => {
                data.calls = [];
            }).then(() => render(true));
        }).catch((e) => {
            data.error = e.message;
            render(true);
        });
    };

    const run = (context) => {
        const root = document.createElement('div');
        startApp(root, window);
        context.setContent(component.HtmlWrapper.ofElement(root));
    };

    exports.run = run;

}));
