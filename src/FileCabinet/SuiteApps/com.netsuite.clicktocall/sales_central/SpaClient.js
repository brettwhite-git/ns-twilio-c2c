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
        '.sc button{font:inherit;color:inherit}',
        '.sc a{color:#1F3550;text-decoration:none}.sc a:hover{text-decoration:underline}',
        '.sc .mut{color:#6F6B66}',
        '.sc .num{font-variant-numeric:tabular-nums;text-align:right}',
        '.sc .dot{width:6px;height:6px;border-radius:999px;flex:none;display:inline-block}',
        '.sc-head{height:56px;display:flex;align-items:center;gap:12px;padding:0 24px}',
        '.sc-head h1{margin:0;font-size:20px;line-height:26px;font-weight:600;letter-spacing:-0.01em}',
        '.sc-head .mut{font-size:12px}',
        '.sc-tabs{display:flex;gap:24px;padding:0 24px;border-bottom:1px solid #ECEAE7}',
        '.sc-tab{height:40px;padding:0;border:0;background:none;display:inline-flex;align-items:center;gap:6px;color:#4A4744;cursor:pointer;box-shadow:inset 0 -2px 0 transparent;transition:box-shadow 150ms ease,color 150ms ease}',
        '.sc-tab:hover{color:#161513}',
        '.sc-tab[aria-selected="true"]{color:#161513;font-weight:500;box-shadow:inset 0 -2px 0 #1F3550}',
        '.sc-tab[disabled]{color:#A8A39C;cursor:default}',
        '.sc-tab .cnt{font-weight:400;color:#6F6B66;font-variant-numeric:tabular-nums}',
        '.sc-tab:focus-visible,.sc-row:focus-visible,.sc-pin:focus-visible,.sc-btn:focus-visible,.sc-icon:focus-visible{outline:2px solid #1F3550;outline-offset:2px}',
        '.sc-filters{display:flex;align-items:center;gap:8px;height:48px;padding:0 24px}',
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
        '@media (prefers-reduced-motion: reduce){.sc-drawer,.sc-drawer.out{animation:sc-fade 150ms linear both}.sc-tab,.sc-btn,.sc-pin{transition:none}}'
    ].join('\n');

    const LIVE_TABS = ['needs', 'calls'];
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
        const content = el('div');
        const drawerHost = el('div');
        root.append(head, tabs, filters, content, drawerHost);
        let route = parseRoute(win.location.hash);
        const data = { needs: null, needsPartial: [], calls: null, callsTotal: 0, error: '' };
        let post = null;
        let listButtons = [];
        const accountsOf = (tab) => {
            if (tab === 'calls') {
                const seen = {};
                return (data.calls || []).filter((c) => c.companyId && !seen[c.companyId] && (seen[c.companyId] = true))
                    .map((c) => ({ companyId: c.companyId, name: c.companyName, entityType: 'customer', phone: c.phone }));
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
            filters.append(chip('Owner', 'Me'), chip('Range', route.tab === 'calls' ? 'This week' : 'Last 14 days'));
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
            p({ action: 'salesCentralNeeds' }).then((d) => {
                if (d.error)
                    throw new Error(d.error);
                data.needs = d.rows || [];
                data.needsPartial = d.partial || [];
            }).catch((e) => {
                data.needs = [];
                data.needsPartial = ['all: ' + e.message];
            }).then(() => render(true));
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
