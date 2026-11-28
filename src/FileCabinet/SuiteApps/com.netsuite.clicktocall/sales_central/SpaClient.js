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
    const factGroup = (slots) => {
        const g = el('span', 'sc-grp');
        slots.forEach(([content, cls]) => {
            const s = el('span', 'sc-g ' + cls);
            if (typeof content === 'string')
                s.textContent = content;
            else
                s.appendChild(content);
            g.appendChild(s);
        });
        return g;
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
        '.sc{position:relative;box-sizing:border-box;min-height:100vh;padding:28px 32px 32px;background:#F5F4F2;color:#161513;font:400 13px/19px "Oracle Sans","Helvetica Neue",Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}',
        '.sc *{box-sizing:border-box}',
        '.sc [hidden]{display:none !important}',
        '.sc button{font:inherit;color:inherit}',
        '.sc a{color:#1F3550;text-decoration:none}.sc a:hover{text-decoration:underline}',
        '.sc .mut{color:#6F6B66}',
        '.sc .num{font-variant-numeric:tabular-nums;text-align:right}',
        '.sc .dot{width:6px;height:6px;border-radius:999px;flex:none;display:inline-block}',
        '.sc-title{margin:0;font-size:17px;line-height:22px;font-weight:600;letter-spacing:-0.01em;white-space:nowrap}',
        '.sc-tsep{width:1px;height:22px;background:#DEDBD7;flex:none}',
        '.sc-frame{background:#FFFFFF;border:1px solid #E5E2DD;border-radius:8px;box-shadow:0 1px 2px rgba(26,24,22,0.04);overflow:hidden}',
        '.sc>.sc-frame{max-width:1900px;margin-left:auto;margin-right:auto}',
        '.sc-wcard{margin-top:16px}',
        '.sc-tabbar{display:flex;align-items:center;gap:20px;padding:0 20px 0 12px}',
        '.sc-fold{width:28px;height:28px;padding:0;border:0;border-radius:6px;background:none;color:#5E5952;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;flex:none;margin-right:-12px}',
        '.sc-fold:hover{background:#F1EEE9}',
        '.sc-fold:focus-visible{outline:2px solid #1F3550;outline-offset:2px}',
        '.sc-fold svg{transition:transform 180ms cubic-bezier(0.23,1,0.32,1);transform:rotate(90deg)}',
        '.sc-hcard.folded .sc-fold svg{transform:none}',
        '.sc-hcard.folded .sc-lens{display:none}',
        '.sc-lens{display:flex;background:#FAF9F7;border-top:1px solid #E5E2DD}',
        '.sc-lens:empty{display:none}',
        '.sc-lgrp{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:16px;padding:24px 24px 32px;border-left:1px solid #E5E2DD}',
        '.sc-lgrp:first-child{border-left:0}',
        '.sc-lgh{align-self:flex-start;padding-bottom:4px;border-bottom:1px solid #D4D0C9;font-size:12px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#5E5952}',
        '.sc-lkv{width:100%;display:grid;grid-template-columns:repeat(3,minmax(0,1fr))}',
        '.sc-lkv>div+div{border-left:1px solid #E8E5E0}',
        '.sc-lkv>div{display:flex;flex-direction:column;align-items:center;gap:2px;min-width:0;text-align:center}',
        '.sc-lkv span{font-size:12px;color:#5E5952}',
        '.sc-lkv b{font-size:18px;line-height:24px;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}',
        '.sc-tabs{display:flex;gap:24px}',
        '.sc-tab{height:48px;padding:0;border:0;background:none;display:inline-flex;align-items:center;gap:6px;font-size:14px;color:#4A4744;cursor:pointer;box-shadow:inset 0 -2px 0 transparent;transition:box-shadow 150ms ease,color 150ms ease}',
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
        '.sc-pins{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;padding:20px 24px 24px}',
        '.sc-pin{display:flex;flex-direction:column;border-radius:10px;background:#FFFFFF;box-shadow:0 0 0 1px #E5E2DD;min-width:0;overflow:hidden}',
        '.sc-pin .top{display:flex;align-items:center;gap:8px;padding:14px 16px 0;font-size:12px}',
        '.sc-pin .top .mut{margin-left:auto}',
        '.sc-pin .name{display:block;margin:6px 16px 0;padding:0;border:0;background:none;font:inherit;font-size:15px;font-weight:600;color:#161513;text-align:left;cursor:pointer}',
        '.sc-pin .name:hover{text-decoration:underline;text-decoration-color:#9DB4CF}',
        '.sc-pin .why{padding:2px 16px 0;color:#4A4744}',
        '.sc-pstats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));margin-top:12px;border-top:1px solid #F1EFEA}',
        '.sc-pstats>div{display:flex;flex-direction:column;min-width:0;padding:10px 16px}',
        '.sc-pstats>div+div{border-left:1px solid #F1EFEA}',
        '.sc-pstats span{font-size:12px;color:#6F6B66}',
        '.sc-pstats b{font-size:15px;font-weight:600;font-variant-numeric:tabular-nums}',
        '.sc-pstats b.sm{font-size:13px;font-weight:500}',
        '.sc-pacts{display:flex;align-items:center;gap:8px;margin-top:auto;padding:10px 16px;background:#FAF9F7;border-top:1px solid #F1EFEA}',
        '.sc-snz{margin-left:auto;display:inline-flex;align-items:center;gap:5px;height:30px;padding:0 8px;border:0;border-radius:6px;background:none;font:inherit;font-size:12px;font-weight:500;color:#6F6B66;cursor:pointer}',
        '.sc-snz:hover{color:#161513;background:#F1EFEA}',
        '.sc-snz:focus-visible,.sc-snzt:focus-visible{outline:2px solid #1F3550;outline-offset:2px}',
        '.sc-snzt{margin-left:12px;padding:0;border:0;background:none;font:inherit;font-size:12px;font-weight:500;color:#1F3550;cursor:pointer}',
        '.sc-snzt:hover{text-decoration:underline}',
        '.sc-snzlist{border-bottom:1px solid #ECEAE7;background:#FCFBFA}',
        '.sc-snzrow{display:grid;grid-template-columns:minmax(0,1fr) 120px auto;gap:16px;align-items:center;height:40px;padding:0 24px;border-top:1px solid #F1EFEA}',
        '.sc-snzrow .sc-cancel{margin-right:0;height:28px;padding:0 8px}',
        '.sc-pill.amb{color:#8A5A12;background:#FBF3E4;box-shadow:inset 0 0 0 1px #EBD7B1}',
        '.sc-pill.slate{color:#3D5470;background:#EEF2F7;box-shadow:inset 0 0 0 1px #D3DCE8}',
        '.sc-rline{position:relative;border-bottom:1px solid #ECEAE7}',
        '.sc-rline .sc-row{border-bottom:0}',
        '.sc-rline:hover{background:#FAFAF9}',
        '.sc-rline:has(.sc-row[aria-current="true"]){background:#F5F4F2}',
        '.sc-callb{width:30px;height:30px;border:0;border-radius:999px;background:#EAF4EC;color:#2F7D32;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:background-color 150ms ease,color 150ms ease}',
        '.sc-callb:hover{background:#2F7D32;color:#FFFFFF}',
        '.sc-callb:disabled{background:#F1EFEA;color:#C9C5BF;cursor:default}',
        '.sc-callb:focus-visible{outline:2px solid #1F3550;outline-offset:2px}',
        '.sc-two{display:flex;flex-direction:column;min-width:0;line-height:18px}',
        '.sc-two small{font-size:12px;color:#6F6B66}',
        '.sc-two.strong .m{font-weight:500}',
        '.sc-two.num{align-items:flex-end}',
        '.sc-thead,.sc-row{display:grid;align-items:center;column-gap:16px;padding:0 24px}',
        '.sc-grid{display:grid;column-gap:36px;justify-content:space-between}',
        '.sc-grid>*{grid-column:1/-1}',
        '.sc-grid>.sc-thead,.sc-grid>.sc-row,.sc-grid>.sc-rline,.sc-grid>.sc-trow,.sc-rline>.sc-row,.sc-trow>.sc-tline{display:grid;grid-column:1/-1;grid-template-columns:subgrid;column-gap:normal}',
        '.sc-grid>.sc-rline,.sc-trow>.sc-tline{padding:0}',
        '.sc-trow>.sc-tline{padding:0 24px}',
        '.sc-trow>.sc-topen{grid-column:1/-1}',
        '.sc-calls .sc-grid{grid-template-columns:max-content minmax(0,max-content) max-content minmax(320px,520px) max-content max-content max-content}',
        '.sc-needs .sc-grid{grid-template-columns:minmax(240px,420px) max-content minmax(0,max-content) max-content max-content max-content max-content}',
        '.sc-tasks .sc-grid{grid-template-columns:minmax(240px,420px) minmax(0,max-content) minmax(0,320px) max-content max-content}',
        '.sc-plist.sc-grid{grid-template-columns:minmax(240px,420px) minmax(0,max-content) max-content max-content max-content}',
        '.sc-calls .sc-row,.sc-needs .sc-row{min-height:56px;padding-top:8px;padding-bottom:8px}',
        '.sc-grp{display:contents}',
        '.sc-g{display:flex;align-items:center;flex:none;min-width:0}',
        '.sc-g.num{justify-content:flex-end;font-variant-numeric:tabular-nums}',
        '.sc-g.g-len{width:52px}',
        '.sc-g.g-score{width:52px;justify-content:center}',
        '.sc-g.g-money{width:88px}',
        '.sc-g.g-date{width:64px}',
        '.sc-g.g-pct{width:72px}',
        '.sc-g.g-verb{width:156px;justify-content:flex-end}',
        '.sc-g.g-act{width:30px}',
        '.sc-rline>.sc-callb{position:absolute;right:24px;top:50%;margin-top:-15px}',
        '.sc-band .sc-bcount{margin-left:auto;font-weight:400;color:#6F6B66}',
        '.sc-thead{height:40px;border-bottom:1px solid #ECEAE7;font-size:13px;font-weight:500;color:#5E5952}',
        '.sc-row{width:100%;min-height:48px;border:0;border-bottom:1px solid #ECEAE7;background:#FFFFFF;text-align:left;cursor:pointer}',
        '.sc-row:hover{background:#FAFAF9}',
        '.sc-row[aria-current="true"]{background:#F5F4F2}',
        '.sc-ksum{line-height:19px;color:#2E2C29;padding:2px 0}',
        '.sc-kday{display:flex;align-items:center;height:32px;padding:0 24px;background:#FAFAF9;border-bottom:1px solid #ECEAE7;font-size:12px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#5E5952}',
        '.sc-kday i{margin-left:auto;font-style:normal;font-weight:400;letter-spacing:0;text-transform:none;color:#6F6B66}',
        '.sc-pill.good{color:#2F6B34;background:#EAF4EC;box-shadow:inset 0 0 0 1px #C9E3CD}',
        '.sc-cell2{display:flex;flex-direction:column;min-width:0;padding:6px 0}',
        '.sc-cell2 .l1{display:flex;gap:8px;align-items:baseline}',
        '.sc-cell2 .name{font-size:14px;font-weight:500}',
        '.sc-cell2 .why{color:#4A4744;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
        '.sc-status{display:inline-flex;align-items:center;gap:6px}',
        '.sc-clip{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
        '.sc-strong{font-weight:500}',
        '.sc-sumbar{padding:10px 20px;background:#FCFBFA;border-bottom:1px solid #EFEDE9}',
        '.sc-sumline{display:inline-flex;gap:2px;padding:3px;border-radius:8px;background:#F1EFEA}',
        '.sc-sum{height:28px;padding:0 12px;border:0;border-radius:6px;background:none;display:inline-flex;align-items:center;gap:7px;font:inherit;font-size:12px;color:#4A4744;cursor:pointer}',
        '.sc-sum:hover{color:#161513}',
        '.sc-sum b{font-weight:500;color:#161513;font-variant-numeric:tabular-nums}',
        '.sc-sum[aria-pressed="true"]{background:#FFFFFF;color:#161513;font-weight:500;box-shadow:0 1px 2px rgba(22,21,19,0.08)}',
        '.sc-rec{color:#1F3550;font-weight:500;text-decoration:underline;text-decoration-color:#9DB4CF;text-underline-offset:3px}',
        '.sc-rec:hover{text-decoration-color:#1F3550}',
        '.sc-ctx .sc-links{gap:4px}',
        '.sc-sum:focus-visible,.sc-more:focus-visible,.sc-toast-act:focus-visible{outline:2px solid #1F3550;outline-offset:2px}',
        '.sc-gi{display:inline-flex;flex:none}',
        '.sc-sum .sc-gi{margin-left:-2px}',
        '.sc-tint{font-weight:500}',
        '.sc-tint .cnt{opacity:0.8}',
        '.sc-tint.g-suggested{background:#EEF2F6;border-bottom-color:#DCE3EB;color:#4E637C}',
        '.sc-tint.g-overdue{background:#FBEFEC;border-bottom-color:#F1D3CC;color:#9A2A1B}',
        '.sc-tint.g-today{background:#FBF3E4;border-bottom-color:#EFDDBD;color:#7E5310}',
        '.sc-tint.g-week{background:#F4F3F0;border-bottom-color:#E7E4DF;color:#5E5952}',
        '.sc-tint.g-later{background:#F8F7F5;border-bottom-color:#EEECE8;color:#6F6B66}',
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
        '.sc-ctxt{white-space:pre-line;max-height:152px;overflow:auto}',
        '.sc-cancel{margin-right:auto;height:30px;padding:0;border:0;background:none;font:inherit;font-weight:500;color:#6F6B66;cursor:pointer}',
        '.sc-cancel:hover{color:#161513}',
        '.sc-cancel:focus-visible{outline:2px solid #1F3550;outline-offset:2px}',
        '.sc-ctx .sc-links{display:flex;gap:16px;margin-top:4px}',
        '.sc-lk{border:0;background:none;padding:0;font:inherit;font-weight:500;color:#1F3550;cursor:pointer;text-decoration:none}',
        '.sc-lk:hover{text-decoration:underline}',
        '.sc-act{display:flex;flex-direction:column;gap:10px;padding-left:24px;border-left:1px solid #DEDBD7;min-width:0}',
        '.sc-outs{display:inline-flex;align-self:flex-start;gap:2px;padding:2px;border-radius:7px;background:#E9E6E1}',
        '.sc-opt{height:28px;padding:0 12px;border:0;border-radius:5px;background:none;color:#4A4744;font:inherit;font-size:12px;cursor:pointer;white-space:nowrap}',
        '.sc-opt[aria-pressed="true"]{background:#FFFFFF;color:#161513;font-weight:500}',
        '.sc-field{width:100%;box-sizing:border-box;min-height:32px;padding:6px 10px;border:0;border-radius:6px;box-shadow:inset 0 0 0 1px #DEDBD7;font:inherit;color:#161513;background:#FFFFFF}',
        "select.sc-field{-webkit-appearance:none;appearance:none;padding-right:32px;background-image:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236F6B66' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\");background-repeat:no-repeat;background-position:right 10px center}",
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
        '.sc-vsep{width:1px;height:20px;background:#DEDBD7;margin:0 4px}',
        '.sc-cols{display:grid;gap:12px;padding:16px 24px 24px;align-items:stretch}',
        '@media (max-width:1100px){.sc-cols{overflow-x:auto}}',
        '.sc-wcard:has(.sc-cols){overflow:visible}',
        '.sc-col{border-radius:10px;background:#FAFAF9;box-shadow:inset 0 0 0 1px #ECEAE7;padding:8px;display:flex;flex-direction:column;gap:8px;min-height:320px;transition:background-color 120ms ease}',
        '.sc-col.drop{background:#F1F4F8;box-shadow:inset 0 0 0 1.5px #5F7590}',
        '.sc-colh{position:sticky;top:0;z-index:2;display:flex;align-items:baseline;gap:6px;margin:-8px -8px 0;padding:12px 14px 8px;border-radius:10px 10px 0 0;background:#FAFAF9}',
        '.sc-colh b{font-weight:500}',
        '.sc-ccards{display:flex;flex-direction:column;gap:8px}',
        '.sc-cmw{position:relative;align-self:center;margin:-4px -6px -4px 2px}',
        '.sc-cmb{width:26px;height:26px;padding:0;border:0;border-radius:6px;background:none;color:#8A857F;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}',
        '.sc-cmb:hover,.sc-cmb[aria-expanded="true"]{color:#161513;background:#EFEDE9}',
        '.sc-cmb:focus-visible{outline:2px solid #1F3550;outline-offset:1px}',
        '.sc-cmenu{position:absolute;top:calc(100% + 6px);right:0;z-index:10;min-width:180px;padding:6px;background:#FFFFFF;border-radius:10px;box-shadow:0 0 0 1px #E5E2DD,0 8px 24px rgba(22,21,19,0.12);display:flex;flex-direction:column;transform-origin:top right;animation:sc-pop 160ms cubic-bezier(0.23,1,0.32,1) both}',
        '@keyframes sc-pop{from{opacity:0;transform:scale(0.96)}}',
        '@media (prefers-reduced-motion:reduce){.sc-cmenu{animation:none}}',
        '.sc-cmh{padding:4px 8px 6px;font-size:12px;color:#6F6B66}',
        '.sc-cmi{display:flex;align-items:center;height:32px;padding:0 8px;border:0;border-radius:6px;background:none;font:inherit;color:#161513;text-align:left;cursor:pointer}',
        '.sc-cmi:hover,.sc-cmi:focus-visible{background:#F5F4F2;outline:none}',
        '.sc-cmi[aria-checked="true"]{font-weight:500}',
        '.sc-cmi[aria-checked="true"]::after{content:"";margin-left:auto;width:8px;height:5px;border-left:1.6px solid #1F3550;border-bottom:1.6px solid #1F3550;transform:rotate(-45deg) translateY(-2px)}',
        '.sc-colh .cnt{font-size:12px;color:#6F6B66}',
        '.sc-colh .amt{margin-left:auto;font-size:12px;font-weight:500;font-variant-numeric:tabular-nums}',
        '.sc-card{background:#FFFFFF;border-radius:8px;box-shadow:0 0 0 1px #E1DDD8;padding:10px 12px;display:flex;flex-direction:column;gap:3px;cursor:grab;min-width:0}',
        '.sc-card:hover{box-shadow:0 0 0 1px #DEDBD7,0 4px 12px rgba(22,21,19,0.08)}',
        '.sc-card.dragging{opacity:0.35}',
        '.sc-ca{display:flex;align-items:center;gap:4px;font-weight:500;min-width:0}',
        '.sc-cd2{font-size:12px;color:#4A4744}',
        '.sc-cm{display:flex;gap:8px;font-size:12px;color:#6F6B66}',
        '.sc-pcard{padding:0;gap:0}',
        '.sc-ctop{display:flex;align-items:flex-start;gap:8px;padding:10px 10px 10px 12px}',
        '.sc-wheel{flex:none;display:inline-flex;margin-top:2px}',
        '.sc-ctext{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}',
        '.sc-pcard .sc-ca{font-weight:500}',
        '.sc-pills{display:flex;flex-wrap:wrap;gap:6px;padding:8px 12px 10px;border-top:1px solid #ECEAE7}',
        '.sc-pill{display:inline-flex;align-items:center;gap:5px;height:24px;padding:0 8px;border-radius:999px;box-shadow:inset 0 0 0 1px #E5E2DD;font-size:12px;color:#3E3B37;white-space:nowrap}',
        '.sc-pill svg{color:#8A857F}',
        '.sc-pill.late{color:#B3311F;background:#FDF4F2;box-shadow:inset 0 0 0 1px #F0C8C2}',
        '.sc-pill.late svg{color:#B3311F}',
        '.sc-pen{margin-left:auto;width:24px;height:24px;padding:0;border:0;border-radius:6px;background:none;color:#A8A39C;display:inline-flex;align-items:center;justify-content:center;flex:none;cursor:pointer}',
        '.sc-pen:hover{color:#1F3550;background:#E9EDF2}',
        '.sc-pen:focus-visible{outline:2px solid #1F3550;outline-offset:2px}',
        '.sc-dsub{font-size:12px;color:#6F6B66}',
        '.sc-fl{display:flex;flex-direction:column;gap:4px}',
        '.sc-fl>span:first-child{font-size:12px;font-weight:500;color:#6F6B66}',
        '.sc-fgrid{display:grid;grid-template-columns:1fr 1fr;gap:12px}',
        '.sc-ro{height:32px;display:flex;align-items:center;font-variant-numeric:tabular-nums}',
        '.sc-dmore{display:flex;flex-direction:column;gap:12px}',
        '.sc-cfacts{display:flex;flex-wrap:wrap;gap:6px}',
        '.sc-cfu{display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:12px;align-items:center;padding:8px 0;border-bottom:1px solid #F1EFEA}',
        '.sc-cfu small{display:block;font-size:12px;color:#6F6B66}',
        '.sc-cfu .acts{display:flex;gap:8px;align-items:center}',
        '.sc-cfu .sc-err{grid-column:1 / -1}',
        '.sc-cfu .sc-cancel{margin-right:0;height:30px;padding:0 8px}',
        '.sc-player{display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;box-shadow:inset 0 0 0 1px #E5E2DD}',
        '.sc-player audio{display:none}',
        '.sc-player .sc-err{flex-basis:100%}',
        '.sc-pplay{width:32px;height:32px;flex:none;border:0;border-radius:999px;background:#1F3550;color:#FFFFFF;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:transform 120ms cubic-bezier(0.23,1,0.32,1)}',
        '.sc-pplay:active{transform:scale(0.96)}',
        '.sc-pplay:disabled{background:#C9C5BF;cursor:default}',
        '.sc-pplay:focus-visible,.sc-pspeed:focus-visible{outline:2px solid #1F3550;outline-offset:2px}',
        '.sc-pseek{flex:1;min-width:0;height:4px;margin:0;-webkit-appearance:none;appearance:none;border-radius:2px;background:linear-gradient(to right,#1F3550 var(--p,0%),#E5E2DD var(--p,0%));cursor:pointer}',
        '.sc-pseek::-webkit-slider-thumb{-webkit-appearance:none;width:12px;height:12px;border-radius:999px;background:#1F3550;border:2px solid #FFFFFF;box-shadow:0 0 0 1px #1F3550}',
        '.sc-pseek::-moz-range-thumb{width:10px;height:10px;border-radius:999px;background:#1F3550;border:2px solid #FFFFFF}',
        '.sc-ptime{font-size:12px;color:#6F6B66;font-variant-numeric:tabular-nums;white-space:nowrap}',
        '.sc-pspeed{height:26px;min-width:40px;padding:0 8px;border:0;border-radius:6px;background:#F1EFEA;font:inherit;font-size:12px;font-weight:500;color:#3E3B37;cursor:pointer}',
        '.sc-talk{display:flex;flex-direction:column;gap:8px}',
        '.sc-talk .bar{display:flex;gap:3px;height:6px}',
        '.sc-talk .bar span{border-radius:3px}',
        '.sc-talk .leg{display:flex;gap:18px;font-size:12px;color:#4A4744}',
        '.sc-talk .leg span{display:inline-flex;align-items:center;gap:6px}',
        '.sc-talk .leg i{width:8px;height:8px;border-radius:2px}',
        '.sc-talk .leg b{font-weight:600;color:#161513}',
        '.sc-turns{display:flex;flex-direction:column;gap:10px}',
        '.sc-tlist{display:flex;flex-direction:column;gap:2px}',
        '.sc-turn{display:grid;grid-template-columns:24px minmax(0,1fr);gap:10px;padding:8px;border-radius:8px;transition:background-color 150ms ease-out}',
        '.sc-turn.now{background:#F3F6FA}',
        '.sc-turn .dot{width:24px;height:24px;border-radius:999px;color:#FFFFFF;font-size:10px;font-weight:600;display:flex;align-items:center;justify-content:center}',
        '.sc-turn .h{display:flex;align-items:baseline;gap:8px;font-size:12px}',
        '.sc-turn .h b{font-size:13px;font-weight:600}',
        '.sc-turn .at{margin-left:auto;padding:0;border:0;background:none;font:inherit;font-size:12px;color:#6F6B66;font-variant-numeric:tabular-nums;cursor:pointer}',
        '.sc-turn .at:hover:not(:disabled){color:#1F3550;text-decoration:underline}',
        '.sc-turn .at:disabled{cursor:default}',
        '.sc-turn p{margin:2px 0 0;line-height:20px;color:#2E2C29}',
        '.sc-turn mark{background:#FDF0C4;color:inherit;border-radius:2px}',
        '.sc-ctr{display:flex;flex-direction:column;gap:6px;font-size:12px;line-height:18px}',
        '.sc-ctr p{margin:0}',
        '.sc-ctr b{font-weight:600;color:#5E5952;margin-right:6px}',
        '.sc-dsec{display:flex;align-items:baseline;gap:8px;padding-top:16px;border-top:1px solid #ECEAE7;font-size:12px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#5E5952}',
        '.sc-dsec i{margin-left:auto;font-style:normal;font-weight:400;letter-spacing:0;text-transform:none;color:#6F6B66}',
        '.sc-dkv{display:grid;grid-template-columns:120px 1fr;row-gap:8px;column-gap:12px;margin:0}',
        '.sc-dkv dt{color:#6F6B66}',
        '.sc-dkv dd{margin:0}',
        '.sc-dmemo{background:#FAF9F7;border-radius:6px;padding:10px 12px;white-space:pre-wrap}',
        '.sc-ditems{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}',
        '.sc-ditems th{font-size:12px;font-weight:500;color:#6F6B66;text-align:left;padding:0 0 6px;border-bottom:1px solid #ECEAE7}',
        '.sc-ditems td{padding:8px 0;border-bottom:1px solid #F1EFEA;vertical-align:top}',
        '.sc-ditems .num{text-align:right;padding-left:12px}',
        '.sc-ditems .tot td{border-bottom:0;font-weight:600}',
        '.sc-dact{display:grid;grid-template-columns:18px 1fr auto;gap:10px;align-items:start;padding:6px 0;border-bottom:1px solid #F1EFEA}',
        '.sc-dact .ic{color:#6F6B66;padding-top:1px}',
        '.sc-dact .mut{font-size:12px;white-space:nowrap}',
        '.sc-dload{display:flex;flex-direction:column;gap:8px}',
        '.sc-dload span{height:12px;border-radius:4px;background:#F1EFEA}',
        '.sc-dfoot .sc-err{margin-right:auto}',
        '.sc-dfoot .sc-cancel{margin-right:0;height:30px;padding:0 12px;border-radius:6px}',
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
        '.sc-drawer{position:fixed;right:0;bottom:16px;width:506px;max-width:100vw;background:#FFFFFF;box-shadow:-1px 0 0 #ECEAE7,-16px 0 32px rgba(22,21,19,0.08);display:flex;flex-direction:column;z-index:20;animation:sc-in 260ms cubic-bezier(0.32,0.72,0,1) both}',
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

    const LIVE_TABS = ['needs', 'pipeline', 'tasks', 'calls'];
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

    const SNOOZE = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="13" r="8"></circle><path d="M12 9v4l2.5 1.5M9 2h6"></path></svg>';
    const PHONE$1 = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"></path></svg>';
    const button$3 = (cls, text, onClick) => {
        const b = el('button', cls, text);
        b.type = 'button';
        b.addEventListener('click', onClick);
        return b;
    };
    const status = (r) => el('span', 'sc-pill ' + (r.tone === 'red' ? 'late' : r.tone === 'amber' ? 'amb' : ''), r.status);
    const whyText = (r) => r.why + (r.more ? ' · +' + r.more + ' more' : '');
    const firstName$1 = (s) => (s || '').split(' ')[0];
    const touchText$1 = (r, todayIso) => (r.lastTouch ? ago(r.lastTouch, todayIso) : '—');
    const stat = (label, value, cls) => {
        const d = el('div');
        d.append(el('span', '', label), el('b', cls || '', value));
        return d;
    };
    const card$1 = (r, v) => {
        const c = el('div', 'sc-pin');
        c.setAttribute('data-id', r.companyId);
        const top = el('div', 'top');
        top.append(status(r), el('span', 'mut', r.lastTouch ? 'Last touch ' + ago(r.lastTouch, v.todayIso) : 'No touch logged'));
        const name = button$3('name sc-clip', r.name, () => v.onOpen(r));
        name.title = 'Account details';
        const stats = el('div', 'sc-pstats');
        stats.append(stat('Open', r.open ? money(r.open) : '$0'), stat('Contact', r.contact || '—', 'sm sc-clip'), stat('Needs', r.needs || r.status, 'sm'));
        const acts = el('div', 'sc-pacts');
        if (r.phone)
            acts.appendChild(button$3('sc-btn go', 'Call ' + (firstName$1(r.contact) || r.name), () => v.onCall(r)));
        acts.appendChild(button$3('sc-btn gh', 'Account details', () => v.onOpen(r)));
        const snz = button$3('sc-snz', '', () => v.onSnooze(r, c));
        snz.innerHTML = SNOOZE;
        snz.appendChild(document.createTextNode('Snooze'));
        snz.title = 'Hide until tomorrow. It comes back sooner if something new happens.';
        acts.appendChild(snz);
        c.append(top, name, el('div', 'why sc-clip', whyText(r)), stats, acts);
        return c;
    };
    const two = (main, sub, cls) => {
        const s = el('span', 'sc-two ' + (cls || ''));
        s.append(el('span', 'm sc-clip', main), el('small', 'sc-clip', sub));
        return s;
    };
    const renderNeeds = (host, v) => {
        clear(host);
        host.className = 'sc-needs sc-fade';
        const buttons = [];
        if (v.partial.length) {
            host.appendChild(el('div', 'sc-note', 'Some sources did not load (' + v.partial.join(', ') + '). The list may be short.'));
        }
        if (!v.rows.length) {
            const m = el('div', 'sc-msg');
            m.append(el('b', '', 'Nothing needs you right now'), el('span', '', v.snoozed.length
                ? v.snoozed.length + (v.snoozed.length === 1 ? ' account is' : ' accounts are') + ' snoozed until tomorrow.'
                : 'Missed calls, overdue tasks, follow-ups and late invoices show here.'));
            host.appendChild(m);
            if (v.snoozed.length)
                m.appendChild(button$3('sc-snzt', 'Show snoozed', v.onToggleSnoozed));
            return buttons;
        }
        const grid = el('div', 'sc-pins');
        v.rows.slice(0, 3).forEach((r) => grid.appendChild(card$1(r, v)));
        host.appendChild(grid);
        const table = el('div', 'sc-grid');
        const band = el('div', 'sc-band');
        band.append(el('span', '', 'Everything that needs you '), el('span', 'cnt', String(v.rows.length)));
        if (v.snoozed.length) {
            const t = button$3('sc-snzt', v.snoozed.length + ' snoozed', v.onToggleSnoozed);
            t.setAttribute('aria-expanded', String(v.showSnoozed));
            band.appendChild(t);
        }
        band.appendChild(el('span', 'sc-bcount', 'Most urgent first'));
        host.appendChild(table);
        table.appendChild(band);
        if (v.showSnoozed && v.snoozed.length) {
            const list = el('div', 'sc-snzlist');
            v.snoozed.forEach((s) => {
                const row = el('div', 'sc-snzrow');
                row.append(el('span', 'sc-clip', s.name), el('span', 'mut', 'until ' + shortDate(s.until)), button$3('sc-cancel', 'Unsnooze', () => v.onUnsnooze(s.companyId)));
                list.appendChild(row);
            });
            table.appendChild(list);
        }
        const head = el('div', 'sc-thead');
        head.append(el('span', '', 'Account · why now'), el('span', '', 'Status'), el('span', '', 'Contact'), factGroup([['Open', 'num g-money'], ['Last touch', 'num g-date'], ['Next', 'num g-date'], ['', 'g-act']]));
        table.appendChild(head);
        v.rows.forEach((r) => {
            const line = el('div', 'sc-rline');
            line.setAttribute('data-id', r.companyId);
            const b = el('button', 'sc-row');
            b.type = 'button';
            b.setAttribute('data-id', r.companyId);
            if (r.companyId === v.selected)
                b.setAttribute('aria-current', 'true');
            b.append(two(r.name, whyText(r), 'strong'), el('span', '', ''), two(r.contact || '—', r.phone || ''), factGroup([[r.open ? money(r.open) : '$0', 'num g-money'], [touchText$1(r, v.todayIso), 'num g-date'],
                [r.next ? shortDate(r.next) : '—', 'num g-date'], ['', 'g-act']]));
            b.children[1].appendChild(status(r));
            b.addEventListener('click', () => v.onOpen(r));
            const call = button$3('sc-callb', '', () => v.onCall(r));
            call.innerHTML = PHONE$1;
            call.setAttribute('aria-label', 'Call ' + (r.contact || r.name));
            call.disabled = !r.phone;
            line.append(b, call);
            table.appendChild(line);
            buttons.push(b);
        });
        return buttons;
    };

    const PHONE = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"></path></svg>';
    const DIR_ICON = {
        in: '<path d="M9.75 4.25l-5.5 5.5"></path><path d="M8.75 9.75h-4.5v-4.5"></path>',
        out: '<path d="M4.25 9.75l5.5-5.5"></path><path d="M5.25 4.25h4.5v4.5"></path>',
        missed: '<path d="M2.25 4.25l4.75 4.75 4.75-4.75"></path><path d="M8.25 4.25h3.5v3.5"></path>',
        noans: '<path d="M2.25 7h7"></path><path d="M6.75 4.5 9.25 7l-2.5 2.5"></path><path d="M11.75 3.75v6.5"></path>',
        vm: '<circle cx="4" cy="7.25" r="2.25"></circle><circle cx="10" cy="7.25" r="2.25"></circle><path d="M4 9.5h6"></path>'
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
        if (r.callStatus === 'No transcript')
            return 'No transcript for this call';
        return 'No summary yet';
    };
    const kindPill = (r) => {
        const [label, icon, tone] = r.voicemail ? ['Voicemail', 'vm', 'amb']
            : r.callStatus === 'Missed' ? ['Missed', 'missed', 'late']
                : r.callStatus === 'No answer' ? ['No answer', 'noans', 'slate']
                    : r.direction === 'inbound' ? ['Inbound', 'in', ''] : ['Outbound', 'out', ''];
        const p = el('span', 'sc-pill ' + tone);
        p.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + DIR_ICON[icon] + '</svg>';
        p.appendChild(document.createTextNode(label));
        return p;
    };
    const scorePill = (n) => n ? el('span', 'sc-pill ' + (n <= 3 ? 'late' : n >= 7 ? 'good' : ''), n + ' / 10') : el('span', 'mut', '—');
    const dayLabel = (iso, todayIso) => {
        if (!iso)
            return 'Undated';
        const d = Math.round((Date.parse(todayIso) - Date.parse(iso)) / 86400000);
        return (d === 0 ? 'Today · ' : d === 1 ? 'Yesterday · ' : '') + shortDate(iso);
    };
    const renderCalls = (host, v) => {
        clear(host);
        host.className = 'sc-calls sc-fade';
        if (!v.rows.length) {
            const m = el('div', 'sc-msg');
            m.append(el('b', '', 'No calls this week'), el('span', '', 'Calls with your accounts show here.'));
            host.appendChild(m);
            return [];
        }
        const grid = el('div', 'sc-grid');
        host.appendChild(grid);
        const head = el('div', 'sc-thead');
        head.append(el('span', '', 'Time'), el('span', '', 'Account'), el('span', '', 'Call'), el('span', '', 'AI summary'), factGroup([['Length', 'num g-len'], ['Score', 'g-score'], ['', 'g-act']]));
        grid.appendChild(head);
        let day = '';
        v.rows.forEach((r) => {
            const iso = nsDateToIso(r.date);
            if (iso !== day) {
                day = iso;
                const n = v.rows.filter((x) => nsDateToIso(x.date) === iso).length;
                const g = el('div', 'sc-band');
                g.append(el('span', '', dayLabel(iso, v.todayIso)), el('span', 'sc-bcount', n + (n === 1 ? ' call' : ' calls')));
                grid.appendChild(g);
            }
            const line = el('div', 'sc-rline');
            const b = el('button', 'sc-row');
            b.type = 'button';
            b.setAttribute('data-call', r.id);
            if (r.id === v.selected)
                b.setAttribute('aria-current', 'true');
            const who = el('span', 'sc-two strong');
            who.append(el('span', 'm sc-clip', r.companyName || r.phone || 'Unknown caller'), el('small', 'sc-clip', r.contactName || r.phone || ''));
            const kind = el('span');
            kind.appendChild(kindPill(r));
            const score = el('span');
            score.appendChild(scorePill(r.voicemail ? null : r.satisfaction));
            b.append(el('span', 'num', r.timeOfDay || ''), who, kind, el('span', 'sc-ksum', summary(r)), factGroup([[r.duration ? clock(r.duration) : '—', 'num g-len'], [score, 'g-score'], ['', 'g-act']]));
            b.addEventListener('click', () => v.onOpen(r));
            const call = el('button', 'sc-callb');
            call.type = 'button';
            call.innerHTML = PHONE;
            call.setAttribute('aria-label', 'Call back ' + (r.contactName || r.companyName || r.phone));
            call.disabled = !r.phone;
            call.addEventListener('click', () => v.onCall(r));
            line.append(b, call);
            grid.appendChild(line);
        });
        return [];
    };

    const button$2 = (cls, text, onClick) => {
        const b = el('button', cls, text);
        b.type = 'button';
        b.addEventListener('click', onClick);
        return b;
    };
    const section$2 = (title, aside) => {
        const h = el('div', 'sc-dsec');
        h.append(el('span', '', title), el('i', '', aside));
        return h;
    };
    const firstName = (name) => (name || '').split(' ')[0];
    const recordUrl$1 = (id) => '/app/crm/calendar/call.nl?id=' + encodeURIComponent(id);
    const unanswered = (c) => c.status === 'Missed' || c.status === 'No answer';
    const pillsOf = (row, c) => {
        const facts = el('div', 'sc-cfacts');
        const pill = (text, cls) => { facts.appendChild(el('span', 'sc-pill' + (cls ? ' ' + cls : ''), text)); };
        pill(c.direction === 'inbound' ? 'Inbound' : 'Outbound');
        const day = nsDateToIso(row.date);
        pill((day ? shortDate(day) + ' ' : '') + (row.timeOfDay || ''));
        if (c.voicemail)
            pill('Voicemail');
        else if (unanswered(c))
            pill(c.status, 'late');
        if (c.duration)
            pill(clock(c.duration));
        if (c.satisfaction)
            pill('Score ' + c.satisfaction + ' / 10', c.satisfaction <= 3 ? 'late' : '');
        if (c.ownerName)
            pill(firstName(c.ownerName));
        return facts;
    };
    const followUps = (host, d, h) => {
        if (!d.tasks.length && !d.tasksError)
            return;
        host.appendChild(section$2('Follow-ups', d.tasksError ? 'Could not load' : d.tasks.length + ' to review'));
        d.tasks.forEach((t) => {
            const row = el('div', 'sc-cfu');
            const text = el('span', '', t.text);
            if (t.proposedDue)
                text.appendChild(el('small', '', 'Proposed due ' + shortDate(nsDateToIso(t.proposedDue) || t.proposedDue)));
            const err = el('span', 'sc-err');
            const act = (approve) => {
                row.querySelectorAll('button').forEach((b) => { b.disabled = true; });
                err.textContent = '';
                h.onFollowUp(t.id, approve, t.text).then((problem) => {
                    if (problem) {
                        err.textContent = problem;
                        row.querySelectorAll('button').forEach((b) => { b.disabled = false; });
                    }
                    else
                        row.remove();
                });
            };
            const acts = el('span', 'acts');
            acts.append(button$2('sc-cancel', 'Dismiss', () => act(false)), button$2('sc-btn pri', 'Approve', () => act(true)));
            row.append(text, acts, err);
            host.appendChild(row);
        });
    };
    const PLAY = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5z"></path></svg>';
    const PAUSE = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 4h4v16H6zM14 4h4v16h-4z"></path></svg>';
    const SPEEDS = [1, 1.5, 2];
    const player = (src, knownSeconds) => {
        const wrap = el('div', 'sc-player');
        const audio = el('audio');
        audio.preload = 'metadata';
        audio.src = src;
        const play = el('button', 'sc-pplay');
        play.type = 'button';
        play.innerHTML = PLAY;
        play.setAttribute('aria-label', 'Play recording');
        const seek = el('input', 'sc-pseek');
        seek.type = 'range';
        seek.min = '0';
        seek.step = '0.1';
        seek.value = '0';
        seek.setAttribute('aria-label', 'Position');
        const time = el('span', 'sc-ptime');
        const speed = el('button', 'sc-pspeed', '1×');
        speed.type = 'button';
        speed.setAttribute('aria-label', 'Playback speed');
        const err = el('span', 'sc-err');
        const total = () => (isFinite(audio.duration) && audio.duration > 0 ? audio.duration : knownSeconds);
        const paint = () => {
            seek.max = String(total() || 0);
            if (document.activeElement !== seek)
                seek.value = String(audio.currentTime);
            seek.style.setProperty('--p', (total() ? (audio.currentTime / total()) * 100 : 0) + '%');
            time.textContent = clock(audio.currentTime) + ' / ' + clock(total());
            play.innerHTML = audio.paused ? PLAY : PAUSE;
            play.setAttribute('aria-label', audio.paused ? 'Play recording' : 'Pause recording');
        };
        play.addEventListener('click', () => {
            err.textContent = '';
            if (audio.paused)
                audio.play().catch(() => { err.textContent = 'The recording could not play.'; });
            else
                audio.pause();
        });
        seek.addEventListener('input', () => { audio.currentTime = Number(seek.value); paint(); });
        speed.addEventListener('click', () => {
            const next = SPEEDS[(SPEEDS.indexOf(audio.playbackRate) + 1) % SPEEDS.length];
            audio.playbackRate = next;
            speed.textContent = next + '×';
        });
        ['timeupdate', 'loadedmetadata', 'play', 'pause', 'ended'].forEach((ev) => audio.addEventListener(ev, paint));
        audio.addEventListener('error', () => { err.textContent = 'The recording is not available.'; play.disabled = true; });
        paint();
        wrap.append(play, seek, time, speed, audio, err);
        return wrap;
    };
    const REP_COLOR = '#1F3550';
    const CUST_COLOR = '#C27A1A';
    const whoOf = (c, speaker) => speaker === 'rep' ? firstName(c.ownerName) || 'Rep' : speaker === 'customer' ? firstName(c.contactName) || 'Customer' : '';
    const fullWho = (c, speaker) => speaker === 'rep' ? c.ownerName || 'Rep' : speaker === 'customer' ? c.contactName || c.companyName || 'Customer' : '';
    const initials = (name) => name.split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
    const talkBlock = (c, talk) => {
        const total = talk.rep + talk.customer;
        if (!total)
            return null;
        const repPct = Math.round((talk.rep / total) * 100);
        const wrap = el('div', 'sc-talk');
        const bar = el('div', 'bar');
        const r = el('span');
        r.style.flex = String(repPct);
        r.style.background = REP_COLOR;
        const k = el('span');
        k.style.flex = String(100 - repPct);
        k.style.background = CUST_COLOR;
        bar.append(r, k);
        const leg = el('div', 'leg');
        [[fullWho(c, 'rep'), repPct, REP_COLOR], [fullWho(c, 'customer'), 100 - repPct, CUST_COLOR]].forEach(([n, p, col]) => {
            const it = el('span');
            const sq = el('i');
            sq.style.background = col;
            it.append(sq, document.createTextNode(n + ' '), el('b', '', p + '%'));
            leg.appendChild(it);
        });
        wrap.append(bar, leg);
        return wrap;
    };
    const transcriptBlock = (c, turns, audio) => {
        const box = el('div', 'sc-turns');
        const timed = turns.some((t) => t.start !== null);
        box.appendChild(section$2('Transcript', turns.length + (turns.length === 1 ? ' turn' : ' turns') + (timed && audio ? ' · follows the recording' : '')));
        const find = el('input', 'sc-field sc-tfind');
        find.type = 'search';
        find.placeholder = 'Search the transcript';
        find.setAttribute('aria-label', 'Search the transcript');
        box.appendChild(find);
        const list = el('div', 'sc-tlist');
        box.appendChild(list);
        const rows = [];
        const draw = (q) => {
            clear(list);
            rows.length = 0;
            turns.forEach((t) => {
                if (q && !t.lines.some((l) => l.toLowerCase().indexOf(q) !== -1))
                    return;
                const row = el('div', 'sc-turn');
                const dot = el('span', 'dot', initials(fullWho(c, t.speaker)) || '·');
                dot.style.background = t.speaker === 'rep' ? REP_COLOR : t.speaker === 'customer' ? CUST_COLOR : '#A8A39C';
                const body = el('div');
                const h = el('div', 'h');
                h.appendChild(el('b', '', fullWho(c, t.speaker) || 'Speaker'));
                if (t.start !== null) {
                    const at = el('button', 'at', clock(Math.floor(t.start)));
                    at.type = 'button';
                    at.setAttribute('aria-label', 'Play from ' + clock(Math.floor(t.start)));
                    at.disabled = !audio;
                    at.addEventListener('click', () => { if (audio) {
                        audio.currentTime = t.start;
                        audio.play().catch(() => undefined);
                    } });
                    h.appendChild(at);
                }
                body.appendChild(h);
                t.lines.forEach((l) => {
                    const p = el('p');
                    if (q) {
                        const i = l.toLowerCase().indexOf(q);
                        if (i !== -1) {
                            p.append(document.createTextNode(l.slice(0, i)), el('mark', '', l.slice(i, i + q.length)), document.createTextNode(l.slice(i + q.length)));
                        }
                        else
                            p.textContent = l;
                    }
                    else
                        p.textContent = l;
                    body.appendChild(p);
                });
                row.append(dot, body);
                list.appendChild(row);
                rows.push({ el: row, start: t.start, end: t.end });
            });
            if (!rows.length)
                list.appendChild(el('div', 'mut', 'No turn matches.'));
        };
        draw('');
        find.addEventListener('input', () => draw(find.value.trim().toLowerCase()));
        if (audio && timed) {
            audio.addEventListener('timeupdate', () => {
                const now = audio.currentTime;
                rows.forEach((r) => r.el.classList.toggle('now', r.start !== null && r.end !== null && now >= r.start && now < r.end));
            });
        }
        return box;
    };
    const renderCallDetail = (host, row, d, h) => {
        clear(host);
        const c = d.call;
        host.appendChild(pillsOf(row, c));
        if (c.summary && !c.voicemail) {
            host.appendChild(section$2('AI summary', c.toneKeywords.split(',').map((s) => s.trim()).filter(Boolean).join(' · ')));
            host.appendChild(el('div', 'sc-dmemo', c.summary));
        }
        else if (!c.voicemail && !unanswered(c)) {
            const final = c.status === 'No transcript' || c.status === 'Failed';
            host.appendChild(section$2('AI summary', c.status));
            host.appendChild(el('div', 'mut', final ? 'No summary for this call: there was no transcript to summarise.'
                : 'The summary is on its way. It is written after the transcript is ready.'));
        }
        if (c.talk && !c.voicemail) {
            const t = talkBlock(c, c.talk);
            if (t) {
                const pct = (x) => Math.round((x / (c.talk.rep + c.talk.customer)) * 100);
                host.appendChild(section$2('Talk time', firstName(c.ownerName) + ' ' + pct(c.talk.rep) + '% · ' +
                    (firstName(c.contactName) || 'Customer') + ' ' + pct(c.talk.customer) + '%' + (c.talk.basis === 'words' ? ' · by words' : '')));
                host.appendChild(t);
            }
        }
        if (c.audioUrl) {
            host.appendChild(section$2('Recording', ''));
            host.appendChild(player(c.audioUrl, c.duration));
        }
        followUps(host, d, h);
        const audio = host.querySelector('.sc-player audio');
        if (c.turns && c.turns.length)
            host.appendChild(transcriptBlock(c, c.turns, audio));
        else if (c.transcriptLines.length) {
            const shown = c.transcriptLines.length;
            host.appendChild(section$2('Transcript', shown < c.transcriptLineCount ? 'First ' + shown + ' of ' + c.transcriptLineCount + ' lines' : shown + ' lines'));
            const tr = el('div', 'sc-ctr');
            c.transcriptLines.forEach((l) => {
                const p = el('p');
                if (whoOf(c, l.speaker))
                    p.appendChild(el('b', '', whoOf(c, l.speaker)));
                p.appendChild(document.createTextNode(l.text));
                tr.appendChild(p);
            });
            host.appendChild(tr);
        }
        if (c.turns && c.turns.length || c.transcriptLines.length) {
            const all = el('a', 'sc-rec', 'Full transcript in NetSuite');
            all.href = recordUrl$1(c.id);
            all.target = '_top';
            host.appendChild(all);
        }
    };
    const loading = (host) => {
        clear(host);
        ['AI summary', 'Transcript'].forEach((t) => {
            host.appendChild(section$2(t, ''));
            const bars = el('div', 'sc-dload');
            [80, 64, 72].forEach((w) => { const b = el('span'); b.style.width = w + '%'; bars.appendChild(b); });
            host.appendChild(bars);
        });
    };
    const openCallDrawer = (host, row, h) => {
        closeCallDrawer(host);
        const dw = el('aside', 'sc-drawer sc-calld');
        dw.setAttribute('aria-label', 'Call · ' + (row.companyName || row.phone || 'Unknown caller'));
        dw.style.top = h.top() + 'px';
        const bar = el('div', 'sc-dhead');
        const tools = el('span', 'tools');
        const x = button$2('sc-icon', '✕', h.onClose);
        x.setAttribute('aria-label', 'Close');
        tools.appendChild(x);
        bar.append(el('span', 'sc-lbl', 'Call'), tools);
        const title = el('div', 'sc-dtitle');
        const sub = el('div', 'sc-dsub');
        if (row.companyId) {
            const acct = button$2('sc-lk', 'Account', () => h.onAccount(row));
            acct.title = 'Account details';
            sub.append(acct, el('span', 'mut', ' · '));
        }
        if (row.contactName)
            sub.append(el('span', 'mut', row.contactName + ' · '));
        const rec = el('a', 'sc-rec', 'Phone call');
        rec.href = recordUrl$1(row.id);
        rec.target = '_top';
        rec.title = 'Open in NetSuite';
        sub.appendChild(rec);
        title.append(el('b', '', row.companyName || row.phone || 'Unknown caller'), sub);
        const more = el('div', 'sc-dmore');
        loading(more);
        const body = el('div', 'sc-dbody');
        body.append(title, more);
        const foot = el('div', 'sc-dfoot');
        if (row.phone)
            foot.appendChild(button$2('sc-btn go', 'Call back', () => h.onCallBack(row)));
        const open = el('a', 'sc-btn gh', 'Open in NetSuite');
        open.href = recordUrl$1(row.id);
        open.target = '_top';
        foot.append(open, el('span', 'mut', 'Esc to close'));
        dw.append(bar, body, foot);
        host.appendChild(dw);
        h.post({ action: 'getCallDetail', callId: row.id })
            .then((d) => {
            if (!dw.isConnected)
                return;
            if (d.error || !d.call) {
                clear(more);
                more.appendChild(el('div', 'mut', 'Could not load this call'));
                return;
            }
            renderCallDetail(more, row, d, h);
        })
            .catch(() => { if (dw.isConnected) {
            clear(more);
            more.appendChild(el('div', 'mut', 'Could not load this call'));
        } });
        return dw;
    };
    const closeCallDrawer = (host) => {
        const d = host.querySelector('.sc-calld');
        if (d)
            d.remove();
    };

    const BANDS = [['overdue', 'Overdue'], ['today', 'Today'], ['week', 'This week'], ['later', 'Later']];
    const GROUP_COLOR = {
        suggested: '#5F7590', overdue: '#B3311F', today: '#B8730A', week: '#8A857F', later: '#A8A39C'
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
    const GROUP_ICON = {
        all: '<path d="M8 6h12M8 12h12M8 18h12"></path><path d="M4 6h.01M4 12h.01M4 18h.01"></path>',
        suggested: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"></path><path d="M16 3v5M13.5 5.5h5"></path>',
        overdue: '<circle cx="12" cy="13" r="8"></circle><path d="M12 9v4M12 16.5h.01M5 3 2 6M19 3l3 3"></path>',
        today: '<rect x="4" y="5" width="16" height="16" rx="2"></rect><path d="M4 10h16M8 3v4M16 3v4"></path><circle cx="12" cy="15.5" r="1.5"></circle>',
        week: '<rect x="4" y="5" width="16" height="16" rx="2"></rect><path d="M4 10h16M8 3v4M16 3v4M8 14h3"></path>',
        later: '<circle cx="12" cy="12" r="8"></circle><path d="M12 8v4l3 2"></path>'
    };
    const groupIcon = (group) => {
        const c = el('span', 'sc-gi');
        if (group !== 'all')
            c.style.color = GROUP_COLOR[group];
        c.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + GROUP_ICON[group] + '</svg>';
        return c;
    };
    const plainNote = (note) => note.split(/\n|<br\s*\/?>/i).map((l) => l.trim()).filter(Boolean).join('\n');
    const button$1 = (cls, text, onClick) => {
        const b = el('button', cls, text);
        b.type = 'button';
        b.addEventListener('click', onClick);
        return b;
    };
    const recordLink = (text, href) => {
        const a = el('a', 'sc-rec', text);
        a.href = href;
        a.target = '_top';
        a.title = 'Open in NetSuite';
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
        w.appendChild(el('span', 'sc-lbl', 'Notes'));
        w.appendChild(el('span', 'sc-ctxt' + (note ? '' : ' mut'), note || 'No notes on this task.'));
        if (r.fromCall) {
            const links = el('div', 'sc-links');
            links.append(el('span', 'mut', 'From '), recordLink(r.fromCall.title || 'the call', '/app/crm/calendar/call.nl?id=' + encodeURIComponent(r.fromCall.id)));
            w.appendChild(links);
        }
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
        note.placeholder = 'Add a note';
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
        const go = button$1('sc-btn pri', ACTION.done, () => {
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
        const save = button$1('sc-btn gh', 'Save note', () => {
            const text = note.value.trim();
            if (!text) {
                note.focus();
                return;
            }
            save.disabled = true;
            err.textContent = '';
            v.onAddNote(r, text).then((problem) => {
                if (problem) {
                    err.textContent = problem;
                    save.disabled = false;
                }
            });
        });
        const paint = () => {
            Array.from(outs.children).forEach((b) => b.setAttribute('aria-pressed', String(b.getAttribute('data-o') === outcome)));
            next.hidden = outcome !== 'next';
            go.textContent = ACTION[outcome];
        };
        OUTCOMES.forEach(([o, label]) => {
            const b = button$1('sc-opt', label, () => { outcome = o; paint(); });
            b.setAttribute('data-o', o);
            outs.appendChild(b);
        });
        const acts = el('div', 'sc-acts');
        acts.append(button$1('sc-cancel', 'Cancel', () => v.onToggle(r.id)), save, go);
        act.append(outs, note, next, acts, err);
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
        cell.append(err, button$1('sc-btn gh sm', 'Dismiss', act(false)), button$1('sc-btn pri sm', 'Approve', act(true)));
        return cell;
    };
    const renderRow = (r, v) => {
        const open = r.kind === 'task' && r.id === v.openId;
        const row = el('div', 'sc-trow');
        row.setAttribute('data-id', r.id);
        row.setAttribute('data-open', String(open));
        const line = el('div', 'sc-tline');
        const text = displayTitle(r.title);
        const title = r.kind === 'task' ? button$1('sc-tbtn sc-ttitle', text, () => v.onToggle(r.id)) : el('span', 'sc-ttitle', text);
        if (r.kind === 'task')
            title.setAttribute('aria-expanded', String(open));
        const due = el('span', 'num sc-due', dueText(r));
        due.style.color = dueColor(r);
        let verb;
        if (r.kind === 'suggestion')
            verb = suggestionVerbs(r, v);
        else if (open) {
            verb = el('span', 'sc-verbs');
            verb.appendChild(recordLink('Task ' + r.id, '/app/crm/calendar/task.nl?id=' + encodeURIComponent(r.id)));
        }
        else
            verb = el('span', 'sc-verbs');
        if (r.kind === 'task' && !open)
            verb.appendChild(button$1('sc-btn gh sm', 'Complete', () => v.onToggle(r.id)));
        line.append(title, accountCell(r, v), fromCell(r), factGroup([[due, 'num g-date'], [verb, 'g-verb']]));
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
        const peek = button$1('sc-peek', '', () => v.onOpenAccount(r));
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
        const b = el('div', 'sc-band sc-tint g-' + group);
        b.append(groupIcon(group), el('span', '', label + ' '), el('span', 'cnt', String(count)));
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
            const b = button$1('sc-sum', '', () => v.onGroup(g));
            b.setAttribute('data-g', g);
            b.setAttribute('aria-pressed', String(shown === g));
            b.appendChild(groupIcon(g));
            b.append(el('span', '', label + ' '), el('b', '', String(count)));
            line.appendChild(b);
        });
        const bar = el('div', 'sc-sumbar');
        bar.appendChild(line);
        host.appendChild(bar);
        const head = el('div', 'sc-thead');
        head.append(el('span', '', 'Task'), el('span', '', 'Account'), el('span', '', 'From'), factGroup([['Due', 'num g-date'], ['', 'g-verb']]));
        const grid = el('div', 'sc-grid');
        host.appendChild(grid);
        grid.appendChild(head);
        host = grid;
        if (suggestions.length && (shown === 'all' || shown === 'suggested')) {
            const capped = shown === 'all' && !v.showAllSuggested && suggestions.length > SUGGESTION_CAP;
            host.appendChild(band('suggested', 'Suggested from your calls', suggestions.length, 'Approve adds it to your tasks'));
            (capped ? suggestions.slice(0, SUGGESTION_CAP) : suggestions).forEach((r) => host.appendChild(renderRow(r, v)));
            if (capped)
                host.appendChild(button$1('sc-more', 'Show all ' + suggestions.length, v.onShowAllSuggested));
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

    const PEN = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"></path><path d="M14 6l4 4"></path></svg>';
    const button = (cls, text, onClick) => {
        const b = el('button', cls, text);
        b.type = 'button';
        b.addEventListener('click', onClick);
        return b;
    };
    const late = (d, todayIso) => !!d.close && d.close < todayIso;
    const sum$1 = (deals) => deals.reduce((n, d) => n + d.amount, 0);
    const viewToggle = (view, onView) => {
        const seg = el('div', 'sc-sumline');
        seg.setAttribute('role', 'group');
        seg.setAttribute('aria-label', 'View');
        ['board', 'list'].forEach((v) => {
            const b = button('sc-sum', v === 'board' ? 'Board' : 'List', () => onView(v));
            b.setAttribute('aria-pressed', String(view === v));
            seg.appendChild(b);
        });
        return seg;
    };
    const STAGE_COLORS = ['#7C8794', '#2A8C8C', '#3166B0', '#C27A1A', '#3B7D3A', '#7A5AA6'];
    const svg = (inner, size) => '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
    const PILL_ICON = {
        bars: '<path d="M6 20v-4M12 20v-9M18 20V5"></path>',
        user: '<circle cx="12" cy="8" r="4"></circle><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"></path>',
        cal: '<rect x="4" y="5" width="16" height="16" rx="2"></rect><path d="M4 10h16M8 3v4M16 3v4"></path>'
    };
    const wheel = (probability, color) => {
        const w = el('span', 'sc-wheel');
        const c = 2 * Math.PI * 6;
        const filled = (c * Math.max(0, Math.min(100, probability))) / 100;
        w.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="#E5E2DD" stroke-width="2.5"></circle>' +
            '<circle cx="8" cy="8" r="6" fill="none" stroke="' + color + '" stroke-width="2.5" stroke-dasharray="' + filled.toFixed(2) + ' ' + c.toFixed(2) + '" transform="rotate(-90 8 8)"></circle></svg>';
        return w;
    };
    const pill = (icon, text, cls) => {
        const p = el('span', 'sc-pill' + (cls ? ' ' + cls : ''));
        p.innerHTML = svg(icon, 13);
        p.appendChild(document.createTextNode(text));
        return p;
    };
    const card = (d, h, color) => {
        const c = el('div', 'sc-card sc-pcard');
        c.setAttribute('data-id', d.id);
        c.draggable = true;
        c.addEventListener('dragstart', (e) => {
            if (e.dataTransfer) {
                e.dataTransfer.setData('text/plain', d.id);
                e.dataTransfer.effectAllowed = 'move';
            }
            c.classList.add('dragging');
        });
        c.addEventListener('dragend', () => c.classList.remove('dragging'));
        const pen = button('sc-pen', '', () => h.onEdit(d));
        pen.innerHTML = PEN;
        pen.setAttribute('aria-label', 'Edit ' + (d.title || 'deal'));
        pen.title = 'Edit deal';
        const text = el('span', 'sc-ctext');
        text.append(el('span', 'sc-ca sc-clip', d.companyName || 'No customer'), el('span', 'sc-cd2 sc-clip', (d.title || 'Untitled') + ' · ' + money(d.amount)));
        if (d.created)
            text.appendChild(el('span', 'sc-cm sc-clip', 'Created ' + shortDate(d.created)));
        const top = el('div', 'sc-ctop');
        top.append(wheel(d.probability, color), text, pen);
        const pills = el('div', 'sc-pills');
        pills.appendChild(pill(PILL_ICON.bars, d.probability + '%'));
        if (d.rep)
            pills.appendChild(pill(PILL_ICON.user, d.rep.split(' ')[0]));
        if (!d.close)
            pills.appendChild(pill(PILL_ICON.cal, 'No close date'));
        else if (late(d, h.todayIso))
            pills.appendChild(pill(PILL_ICON.cal, 'Overdue · ' + shortDate(d.close), 'late'));
        else
            pills.appendChild(pill(PILL_ICON.cal, shortDate(d.close)));
        c.append(top, pills);
        return c;
    };
    const SORTS = [['close', 'Close date'], ['amount', 'Amount'], ['probability', 'Probability'], ['account', 'Account']];
    const columnSort = {};
    const sortDeals = (deals, by) => {
        if (by === 'close')
            return deals;
        const copy = deals.slice();
        if (by === 'amount')
            copy.sort((a, b) => b.amount - a.amount);
        else if (by === 'probability')
            copy.sort((a, b) => b.probability - a.probability);
        else
            copy.sort((a, b) => a.companyName.localeCompare(b.companyName));
        return copy;
    };
    const DOTS = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.6"></circle><circle cx="12" cy="12" r="1.6"></circle><circle cx="19" cy="12" r="1.6"></circle></svg>';
    const columnMenu = (statusName, current, onPick) => {
        const wrap = el('span', 'sc-cmw');
        const btn = el('button', 'sc-cmb');
        btn.type = 'button';
        btn.innerHTML = DOTS;
        btn.setAttribute('aria-label', 'Sort ' + statusName);
        btn.setAttribute('aria-haspopup', 'menu');
        btn.setAttribute('aria-expanded', 'false');
        let menu = null;
        const close = () => {
            if (!menu)
                return;
            menu.remove();
            menu = null;
            btn.setAttribute('aria-expanded', 'false');
            document.removeEventListener('mousedown', outside, true);
            document.removeEventListener('keydown', onKey, true);
        };
        const outside = (e) => { if (!wrap.contains(e.target))
            close(); };
        const onKey = (e) => { if (e.key === 'Escape') {
            e.stopPropagation();
            close();
            btn.focus();
        } };
        btn.addEventListener('click', () => {
            if (menu) {
                close();
                return;
            }
            menu = el('div', 'sc-cmenu');
            menu.setAttribute('role', 'menu');
            menu.appendChild(el('div', 'sc-cmh', 'Sort by'));
            SORTS.forEach(([key, label]) => {
                const it = el('button', 'sc-cmi', label);
                it.type = 'button';
                it.setAttribute('role', 'menuitemradio');
                it.setAttribute('aria-checked', String(current() === key));
                it.addEventListener('click', () => { close(); onPick(key); });
                menu.appendChild(it);
            });
            wrap.appendChild(menu);
            btn.setAttribute('aria-expanded', 'true');
            document.addEventListener('mousedown', outside, true);
            document.addEventListener('keydown', onKey, true);
            menu.querySelector('[aria-checked="true"]')?.focus();
        });
        wrap.appendChild(btn);
        return wrap;
    };
    const board = (p, h) => {
        const cols = el('div', 'sc-cols');
        cols.style.gridTemplateColumns = 'repeat(' + Math.max(1, p.statuses.length) + ', minmax(190px, 1fr))';
        p.statuses.forEach((s, i) => {
            const items = p.deals.filter((d) => d.statusId === s.id);
            const color = STAGE_COLORS[i % STAGE_COLORS.length];
            const col = el('div', 'sc-col');
            col.setAttribute('data-status', s.id);
            const head = el('div', 'sc-colh');
            const cards = el('div', 'sc-ccards');
            const fill = () => {
                clear(cards);
                sortDeals(items, columnSort[s.id] || 'close').forEach((d) => cards.appendChild(card(d, h, color)));
            };
            head.append(el('b', '', s.name), el('span', 'cnt', String(items.length)), el('span', 'amt', items.length ? money(sum$1(items)) : ''), columnMenu(s.name, () => columnSort[s.id] || 'close', (by) => { columnSort[s.id] = by; fill(); }));
            fill();
            col.append(head, cards);
            col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('drop'); });
            col.addEventListener('dragleave', () => col.classList.remove('drop'));
            col.addEventListener('drop', (e) => {
                e.preventDefault();
                col.classList.remove('drop');
                const id = e.dataTransfer ? e.dataTransfer.getData('text/plain') : '';
                const d = p.deals.filter((x) => x.id === id)[0];
                if (d && d.statusId !== s.id)
                    h.onMove(d, s.id);
            });
            cols.appendChild(col);
        });
        return cols;
    };
    const list = (p, h) => {
        const wrap = el('div', 'sc-plist sc-grid');
        const head = el('div', 'sc-thead');
        head.append(el('span', '', 'Deal'), el('span', '', 'Account'), factGroup([['Close', 'num g-date'], ['Probability', 'num g-pct'], ['Amount', 'num g-money']]));
        wrap.appendChild(head);
        p.statuses.forEach((s) => {
            const items = p.deals.filter((d) => d.statusId === s.id);
            if (!items.length)
                return;
            const b = el('div', 'sc-band', s.name + ' ');
            b.appendChild(el('span', 'cnt', String(items.length)));
            b.appendChild(el('span', 'sc-bcount', money(sum$1(items))));
            wrap.appendChild(b);
            items.forEach((d) => {
                const r = button('sc-row', '', () => h.onEdit(d));
                r.setAttribute('data-id', d.id);
                const close = el('span', 'num', d.close ? shortDate(d.close) : '—');
                if (late(d, h.todayIso))
                    close.style.color = '#B3311F';
                r.append(el('span', 'sc-strong', d.title || 'Untitled'), el('span', 'sc-clip', d.companyName), factGroup([[close, 'num g-date'], [d.probability + '%', 'num mut g-pct'], [money(d.amount), 'num g-money']]));
                wrap.appendChild(r);
            });
        });
        return wrap;
    };
    const renderPipeline = (host, p, h) => {
        clear(host);
        host.className = 'sc-pipe sc-fade';
        if (p.partial.length)
            host.appendChild(el('div', 'sc-note', 'Some sources did not load (' + p.partial.join(', ') + '). The numbers may be short.'));
        if (!p.deals.length) {
            const m = el('div', 'sc-msg');
            m.append(el('b', '', 'No open deals'), el('span', '', 'Open opportunities for customers in your book show here.'));
            host.appendChild(m);
            return;
        }
        host.appendChild(h.view === 'list' ? list(p, h) : board(p, h));
    };
    const ACT_ICON = {
        call: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2',
        task: 'M4 4h16v16H4z M9 12l2 2 4-4',
        event: 'M4 6h16v14H4z M4 10h16 M8 3v4 M16 3v4'
    };
    const ACT_WORD = { call: 'Call', task: 'Task', event: 'Event' };
    const section$1 = (title, aside) => {
        const h = el('div', 'sc-dsec');
        h.append(el('span', '', title), el('i', '', aside));
        return h;
    };
    const daysBetween = (fromIso, toIso) => Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86400000);
    const renderDealDetail = (host, d, x) => {
        clear(host);
        const det = x.details;
        const age = det.created && det.created <= x.todayIso ? 'Open ' + daysBetween(det.created, x.todayIso) + ' days · ' : '';
        host.appendChild(section$1('Details', det.created ? age + (age ? 'created ' : 'Created ') + shortDate(det.created) : ''));
        const kv = el('dl', 'sc-dkv');
        const range = det.rangeLow || det.rangeHigh ? money(det.rangeLow) + ' – ' + money(det.rangeHigh) : '';
        [['Sales rep', det.salesRep], ['Lead source', det.leadSource], ['Partner', det.partner],
            ['Forecast type', det.forecastType], ['Range', range]].forEach(([k, v]) => {
            kv.append(el('dt', '', k), el('dd', v ? '' : 'mut', v || 'None'));
        });
        host.appendChild(kv);
        if (det.memo)
            host.appendChild(el('div', 'sc-dmemo', det.memo));
        host.appendChild(section$1('Items', x.partial.indexOf('items') !== -1 ? 'Could not load' : x.items.length + (x.items.length === 1 ? ' line' : ' lines')));
        if (x.items.length) {
            const t = el('table', 'sc-ditems');
            const head = el('tr');
            head.append(el('th', '', 'Item'), el('th', 'num', 'Qty'), el('th', 'num', 'Amount'));
            t.appendChild(head);
            x.items.forEach((it) => {
                const r = el('tr');
                r.append(el('td', '', it.item), el('td', 'num', it.quantity.toLocaleString('en-US')), el('td', 'num', money(it.amount)));
                t.appendChild(r);
            });
            const tot = el('tr', 'tot');
            tot.append(el('td', '', 'Total'), el('td'), el('td', 'num', money(x.items.reduce((s, it) => s + it.amount, 0))));
            t.appendChild(tot);
            host.appendChild(t);
        }
        host.appendChild(section$1('Activity', x.activity.length ? 'Last ' + x.activity.length : ''));
        if (!x.activity.length)
            host.appendChild(el('div', 'mut', 'No calls, tasks or events on this deal yet.'));
        x.activity.forEach((a) => {
            const row = el('div', 'sc-dact');
            const ic = el('span', 'ic');
            ic.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + ACT_ICON[a.kind] + '"></path></svg>';
            row.append(ic, el('span', '', ACT_WORD[a.kind] + ' · ' + (a.title || 'Untitled')), el('span', 'mut', a.date ? shortDate(a.date) : ''));
            host.appendChild(row);
        });
        const all = el('a', 'sc-rec', 'All activity in NetSuite');
        all.href = '/app/accounting/transactions/opprtnty.nl?id=' + encodeURIComponent(d.id);
        all.target = '_top';
        host.appendChild(all);
    };
    const loadingDetail = (host) => {
        clear(host);
        ['Details', 'Items'].forEach((t) => {
            host.appendChild(section$1(t, ''));
            const bars = el('div', 'sc-dload');
            [70, 55, 62].forEach((w) => { const b = el('span'); b.style.width = w + '%'; bars.appendChild(b); });
            host.appendChild(bars);
        });
    };
    const field = (label, input) => {
        const f = el('label', 'sc-fl');
        f.append(el('span', '', label), input);
        return f;
    };
    const openDealDrawer = (host, d, h) => {
        const old = host.querySelector('.sc-deal');
        if (old)
            old.remove();
        const dw = el('aside', 'sc-drawer sc-deal');
        dw.setAttribute('aria-label', 'Deal ' + (d.title || ''));
        dw.style.top = h.top() + 'px';
        const bar = el('div', 'sc-dhead');
        const tools = el('span', 'tools');
        const x = button('sc-icon', '✕', h.onClose);
        x.setAttribute('aria-label', 'Close');
        tools.appendChild(x);
        bar.append(el('span', 'sc-lbl', 'Deal'), tools);
        const title = el('div', 'sc-dtitle');
        const sub = el('div', 'sc-dsub');
        const rec = el('a', 'sc-rec', 'Opportunity ' + (d.number || d.id));
        rec.href = '/app/accounting/transactions/opprtnty.nl?id=' + encodeURIComponent(d.id);
        rec.target = '_top';
        rec.title = 'Open in NetSuite';
        const acct = button('sc-lk', d.companyName || 'Customer', () => h.onAccount(d));
        acct.title = 'Account details';
        sub.append(acct, el('span', 'mut', ' · '), rec);
        title.append(el('b', '', d.title || 'Untitled'), sub);
        const tIn = el('input', 'sc-field');
        tIn.type = 'text';
        tIn.value = d.title;
        const sIn = el('select', 'sc-field');
        h.statuses.forEach((s) => {
            const o = el('option', '', s.name);
            o.value = s.id;
            o.selected = s.id === d.statusId;
            sIn.appendChild(o);
        });
        const cIn = el('input', 'sc-field');
        cIn.type = 'date';
        cIn.value = d.close;
        const pIn = el('input', 'sc-field');
        pIn.type = 'number';
        pIn.min = '0';
        pIn.max = '99';
        pIn.value = String(d.probability);
        const grid = el('div', 'sc-fgrid');
        grid.append(field('Status', sIn), field('Expected close', cIn), field('Probability %', pIn), field('Amount', el('span', 'sc-ro', money(d.amount))));
        const err = el('span', 'sc-err');
        err.setAttribute('role', 'alert');
        const save = button('sc-btn pri', 'Save', () => {
            const edit = {};
            if (tIn.value.trim() !== d.title)
                edit.title = tIn.value.trim();
            if (sIn.value !== d.statusId)
                edit.statusId = sIn.value;
            if (cIn.value && cIn.value !== d.close)
                edit.close = cIn.value;
            if (pIn.value !== '' && Number(pIn.value) !== d.probability)
                edit.probability = Number(pIn.value);
            if (!Object.keys(edit).length) {
                h.onClose();
                return;
            }
            save.disabled = true;
            err.textContent = '';
            h.onSave(d, edit).then((problem) => { if (problem) {
                err.textContent = problem;
                save.disabled = false;
            } });
        });
        const foot = el('div', 'sc-dfoot');
        foot.append(err, button('sc-cancel', 'Cancel', h.onClose), save);
        const body = el('div', 'sc-dbody');
        const more = el('div', 'sc-dmore');
        loadingDetail(more);
        h.detail.then((x) => {
            if (x)
                renderDealDetail(more, d, x);
            else {
                clear(more);
                more.appendChild(el('div', 'mut', 'Could not load details'));
            }
        });
        body.append(title, field('Title', tIn), grid, more);
        dw.append(bar, body, foot);
        host.appendChild(dw);
        return dw;
    };
    const closeDealDrawer = (host) => {
        const d = host.querySelector('.sc-deal');
        if (d)
            d.remove();
    };

    const n = (x) => x.toLocaleString('en-US');
    const amount = (x) => (x ? money(x) : '$0');
    const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) + '%' : '—');
    const avgMoney = (sum, count) => (count ? money(sum / count) : '—');
    const sum = (rows, f) => rows.reduce((s, r) => s + (f(r) || 0), 0);
    const clockOf = (secs) => Math.floor(secs / 60) + ':' + String(Math.round(secs % 60)).padStart(2, '0');
    const tasksLens = (rows) => {
        const tasks = rows.filter((r) => r.kind === 'task');
        const count = (band) => tasks.filter((r) => r.band === band).length;
        const overdue = tasks.filter((r) => r.band === 'overdue').map((r) => r.due).filter(Boolean).sort();
        const sugg = rows.filter((r) => r.kind === 'suggestion');
        const dates = sugg.map((r) => (r.fromCall ? r.fromCall.date : '')).filter(Boolean).sort();
        const accounts = new Set(sugg.map((r) => r.companyId).filter(Boolean)).size;
        return [
            { title: 'Today', items: [{ label: 'Overdue', value: n(count('overdue')), red: count('overdue') > 0 }, { label: 'Due today', value: n(count('today')) },
                    { label: 'Oldest overdue', value: overdue.length ? shortDate(overdue[0]) : '—' }] },
            { title: 'Suggestions', items: [{ label: 'To review', value: n(sugg.length) }, { label: 'Oldest', value: dates.length ? shortDate(dates[0]) : '—' },
                    { label: 'Accounts', value: n(accounts) }] },
            { title: 'Later', items: [{ label: 'This week', value: n(count('week')) }, { label: 'Later', value: n(count('later')) }, { label: 'All open', value: n(tasks.length) }] }
        ];
    };
    const pipelineLens = (p) => {
        const k = p.kpis;
        return [
            { title: 'Open', items: [{ label: 'Amount', value: amount(k.open) }, { label: 'Weighted', value: amount(k.weighted) }, { label: 'Deals', value: n(k.openCount) }] },
            { title: 'Won this quarter', items: [{ label: 'Amount', value: amount(k.won) }, { label: 'Sales orders', value: n(k.wonCount) }, { label: 'Average order', value: avgMoney(k.won, k.wonCount) }] },
            { title: 'Past close date', items: [{ label: 'Deals', value: n(k.lateCount), red: k.lateCount > 0 }, { label: 'Amount', value: amount(k.late) },
                    { label: 'Share of open', value: pct(k.lateCount, k.openCount) }] }
        ];
    };
    const needsLens = (rows) => {
        const red = rows.filter((r) => r.tone === 'red');
        const amber = rows.filter((r) => r.tone === 'amber');
        const open = (rs) => amount(sum(rs, (r) => r.open));
        return [
            { title: 'Act now', items: [{ label: 'Accounts', value: n(red.length), red: red.length > 0 },
                    { label: 'Call backs', value: n(red.filter((r) => r.kind === 'callback').length) }, { label: 'Open', value: open(red) }] },
            { title: 'Soon', items: [{ label: 'Accounts', value: n(amber.length) }, { label: 'To review', value: n(amber.filter((r) => r.kind === 'review').length) },
                    { label: 'Open', value: open(amber) }] },
            { title: 'Accounts', items: [{ label: 'Total', value: n(rows.length) }, { label: 'Open', value: open(rows) },
                    { label: 'No touch logged', value: n(rows.filter((r) => !r.lastTouch).length) }] }
        ];
    };
    const callsLens = (rows, total) => {
        const timed = rows.filter((r) => r.duration > 0);
        const secs = sum(timed, (r) => r.duration);
        const scored = rows.filter((r) => typeof r.satisfaction === 'number' && r.satisfaction > 0);
        const scores = scored.map((r) => r.satisfaction);
        const avg = scores.length ? scores.reduce((s, x) => s + x, 0) / scores.length : 0;
        const voicemails = rows.filter((r) => r.voicemail).length;
        const missed = rows.filter((r) => r.callStatus === 'No answer' || r.callStatus === 'Missed').length;
        return [
            { title: 'This week', items: [{ label: 'Calls', value: n(total) }, { label: 'Minutes', value: n(Math.round(secs / 60)) },
                    { label: 'Average length', value: timed.length ? clockOf(secs / timed.length) : '—' }] },
            { title: 'Missed', items: [{ label: 'Voicemails', value: n(voicemails) }, { label: 'No answer', value: n(missed) },
                    { label: 'Share of calls', value: pct(voicemails + missed, rows.length) }] },
            { title: 'Mood', items: [{ label: 'Average', value: scores.length ? avg.toFixed(1) + ' / 10' : '—', red: scores.length > 0 && avg <= 5 },
                    { label: 'Scored calls', value: n(scores.length) }, { label: 'Lowest', value: scores.length ? Math.min(...scores) + ' / 10' : '—' }] }
        ];
    };
    const renderLens = (host, groups) => {
        clear(host);
        groups.forEach((g) => {
            const grp = el('div', 'sc-lgrp');
            grp.appendChild(el('span', 'sc-lgh', g.title));
            const kv = el('div', 'sc-lkv');
            g.items.forEach((it) => {
                const cell = el('div');
                const v = el('b', '', it.value);
                if (it.red)
                    v.style.color = '#B3311F';
                cell.append(el('span', '', it.label), v);
                kv.appendChild(cell);
            });
            grp.appendChild(kv);
            host.appendChild(grp);
        });
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
        invalid_note: 'The note is too long.',
        invalid_title: 'Give the deal a title.',
        invalid_status: 'That status cannot be set here.',
        invalid_close: 'Pick an expected close date.',
        invalid_probability: 'Probability is 0 to 99.',
        closed: 'This deal is closed. The list is updated.'
    };
    const startApp = (root, win) => {
        const style = el('style', '', STYLES);
        root.className = 'sc';
        root.appendChild(style);
        const today = localToday();
        const FOLD_KEY = 'ctc-sc-lens-folded';
        let lensFolded = false;
        try {
            lensFolded = win.localStorage.getItem(FOLD_KEY) === '1';
        }
        catch (e) { }
        const fold = el('button', 'sc-fold');
        fold.type = 'button';
        fold.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"></path></svg>';
        const title = el('h1', 'sc-title', 'Sales Central');
        const tabs = el('nav', 'sc-tabs');
        tabs.setAttribute('aria-label', 'Sales Central');
        tabs.setAttribute('role', 'tablist');
        const filters = el('div', 'sc-filters');
        const tabBar = el('div', 'sc-tabbar');
        tabBar.append(fold, title, el('span', 'sc-tsep'), tabs, filters);
        const lens = el('div', 'sc-lens');
        const hcard = el('div', 'sc-frame sc-hcard');
        hcard.append(tabBar, lens);
        const content = el('div');
        const wcard = el('div', 'sc-frame sc-wcard');
        wcard.appendChild(content);
        const drawerHost = el('div');
        root.append(hcard, wcard, drawerHost);
        const paintFold = () => {
            fold.setAttribute('aria-expanded', String(!lensFolded));
            fold.setAttribute('aria-label', lensFolded ? 'Show summary' : 'Hide summary');
            fold.title = lensFolded ? 'Show summary' : 'Hide summary';
            hcard.classList.toggle('folded', lensFolded);
        };
        fold.addEventListener('click', () => {
            lensFolded = !lensFolded;
            try {
                win.localStorage.setItem(FOLD_KEY, lensFolded ? '1' : '0');
            }
            catch (e) { }
            paintFold();
        });
        paintFold();
        let route = parseRoute(win.location.hash);
        const data = { needs: null, needsPartial: [], needsSnoozed: [], calls: null, callsTotal: 0, tasks: null, tasksPartial: [], pipeline: null, error: '' };
        let taskOpenId = '';
        let taskGroup = 'all';
        let showAllSuggested = false;
        let pipelineView = 'board';
        let dealOpenId = '';
        let callOpenId = '';
        let showSnoozed = false;
        let post = null;
        let listButtons = [];
        const accountsOf = (tab) => {
            if (tab === 'calls') {
                const seen = {};
                return (data.calls || []).filter((c) => c.companyId && !seen[c.companyId] && (seen[c.companyId] = true))
                    .map((c) => ({ companyId: c.companyId, name: c.companyName, entityType: 'customer', phone: c.phone }));
            }
            if (tab === 'pipeline') {
                const seen = {};
                return (data.pipeline ? data.pipeline.deals : []).filter((d) => d.companyId && !seen[d.companyId] && (seen[d.companyId] = true))
                    .map((d) => ({ companyId: d.companyId, name: d.companyName, entityType: 'customer', phone: '' }));
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
                        : id === 'pipeline' && data.pipeline ? String(data.pipeline.deals.length)
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
            if (route.tab === 'pipeline')
                filters.append(viewToggle(pipelineView, (v) => { pipelineView = v; render(true); }), el('span', 'sc-vsep'));
            const chip = (k, v) => {
                const c = el('span', 'sc-chip', k + ' ');
                c.appendChild(el('b', '', v));
                return c;
            };
            filters.append(chip('Owner', 'Me'), chip('Range', route.tab === 'calls' ? 'This week' : route.tab === 'tasks' ? 'All open' : route.tab === 'pipeline' ? 'Open deals' : 'Last 14 days'));
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
            if (route.tab === 'pipeline') {
                if (!data.pipeline) {
                    loading();
                    return;
                }
                listButtons = [];
                renderPipeline(content, data.pipeline, { view: pipelineView, todayIso: today,
                    onMove: moveDeal,
                    onEdit: (d) => openDeal(d.id) });
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
                    onAddNote: addTaskNote,
                    onSuggestion: actOnSuggestion });
                return;
            }
            if (route.tab === 'calls') {
                if (!data.calls) {
                    loading();
                    return;
                }
                listButtons = renderCalls(content, { rows: data.calls, selected: callOpenId, todayIso: today,
                    onOpen: (r) => openCall(r),
                    onCall: (r) => { callWithDock(win, { entityId: r.companyId, entityName: r.companyName || r.phone, entityType: 'customer', phone: r.phone }); } });
            }
            else {
                if (!data.needs) {
                    loading();
                    return;
                }
                listButtons = renderNeeds(content, { rows: data.needs, selected: route.account, todayIso: today,
                    onCall: (r) => { callWithDock(win, { entityId: r.companyId, entityName: r.name, entityType: r.entityType, phone: r.phone }); },
                    partial: data.needsPartial, onOpen: (r) => openAccount(r.companyId),
                    snoozed: data.needsSnoozed, showSnoozed: showSnoozed,
                    onSnooze: snooze, onUnsnooze: unsnooze,
                    onToggleSnoozed: () => { showSnoozed = !showSnoozed; renderContent(); } });
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
            data.needsSnoozed = d.snoozed || [];
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
        const loadPipeline = () => post({ action: 'salesCentralPipeline' }).then((d) => {
            if (d.error)
                throw new Error(d.error);
            data.pipeline = { statuses: d.statuses || [], deals: d.deals || [], kpis: d.kpis, partial: d.partial || [] };
        }).catch((e) => {
            data.pipeline = { statuses: [], deals: [], partial: ['all: ' + e.message],
                kpis: { open: 0, openCount: 0, weighted: 0, won: 0, wonCount: 0, late: 0, lateCount: 0 } };
        });
        const statusName = (id) => ((data.pipeline ? data.pipeline.statuses : []).filter((s) => s.id === id)[0] || { name: '' }).name;
        const saveDeal = (d, edit) => post({ action: 'salesCentralUpdateDeal', id: d.id, ...edit }).then((r) => {
            if (r.error) {
                if (r.error === 'closed')
                    loadPipeline().then(() => render(true));
                return r.error === 'forbidden' ? 'This customer is not in your book.' : PROBLEM[r.error] || 'Could not save. Try again.';
            }
            return '';
        }).catch(() => 'Could not save. Try again.');
        const moveDeal = (d, statusId) => {
            const from = d.statusId;
            d.statusId = statusId;
            renderContent();
            saveDeal(d, { statusId: statusId }).then((problem) => {
                if (problem) {
                    d.statusId = from;
                    renderContent();
                    toast(problem + ' · ' + (d.title || d.companyName));
                    return;
                }
                toast('Moved to ' + statusName(statusId) + ' · ' + d.companyName + ' · ' + d.title, ['Undo', () => {
                        d.statusId = from;
                        renderContent();
                        saveDeal(d, { statusId: from }).then(() => loadPipeline().then(() => render(true)));
                    }]);
                loadPipeline().then(() => render(true));
            });
        };
        const openDeal = (id) => {
            dealOpenId = id;
            const d = (data.pipeline ? data.pipeline.deals : []).filter((x) => x.id === id)[0];
            if (!d) {
                closeDealDrawer(drawerHost);
                dealOpenId = '';
                return;
            }
            openDealDrawer(drawerHost, d, {
                statuses: data.pipeline ? data.pipeline.statuses : [],
                top: drawerTop,
                onClose: () => { dealOpenId = ''; closeDealDrawer(drawerHost); },
                onAccount: (deal) => { dealOpenId = ''; closeDealDrawer(drawerHost); go({ tab: route.tab, account: deal.companyId }); },
                detail: post({ action: 'salesCentralDeal', id: d.id })
                    .then((x) => (x.error ? null : x)).catch(() => null),
                onSave: (deal, edit) => saveDeal(deal, edit).then((problem) => {
                    if (problem)
                        return problem;
                    dealOpenId = '';
                    closeDealDrawer(drawerHost);
                    toast('Saved · ' + (edit.title || deal.title));
                    loadPipeline().then(() => render(true));
                    return '';
                })
            });
        };
        const EASE = 'cubic-bezier(0.23, 1, 0.32, 1)';
        const still = () => !!(win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches);
        const measure = () => {
            const at = {};
            content.querySelectorAll('.sc-rline[data-id]').forEach((n) => { at['r' + n.getAttribute('data-id')] = n.getBoundingClientRect(); });
            content.querySelectorAll('.sc-pin[data-id]').forEach((n) => { at['c' + n.getAttribute('data-id')] = n.getBoundingClientRect(); });
            return at;
        };
        const settle = (before) => {
            if (still())
                return;
            content.querySelectorAll('.sc-pin[data-id]').forEach((n) => {
                const id = n.getAttribute('data-id');
                const was = before['c' + id] || before['r' + id];
                if (!was || typeof n.animate !== 'function')
                    return;
                const now = n.getBoundingClientRect();
                const dx = was.left - now.left;
                const dy = was.top - now.top;
                if (!dx && !dy)
                    return;
                const risen = !before['c' + id];
                n.animate([
                    { transform: 'translate(' + dx + 'px,' + dy + 'px)', opacity: risen ? 0.4 : 1 },
                    { transform: 'none', opacity: 1 }
                ], { duration: 250, easing: EASE });
            });
        };
        const redrawNeeds = (before) => { renderContent(); settle(before); };
        const leave = (card) => new Promise((done) => {
            if (still() || typeof card.animate !== 'function') {
                done();
                return;
            }
            const a = card.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.96)' }], { duration: 200, easing: EASE, fill: 'forwards' });
            a.onfinish = () => done();
        });
        const unsnooze = (companyId) => {
            post({ action: 'salesCentralUnsnooze', companyId: companyId }).then((d) => {
                if (d.error) {
                    toast('Could not unsnooze. Try again.');
                    return;
                }
                const before = measure();
                return loadNeeds().then(() => { if (route.tab === 'needs')
                    redrawNeeds(before);
                else
                    render(true); });
            }).catch(() => toast('Could not unsnooze. Try again.'));
        };
        const snooze = (r, card) => {
            const saved = post({ action: 'salesCentralSnooze', companyId: r.companyId, sig: r.needs });
            Promise.all([saved, leave(card)]).then(([d]) => {
                if (d.error) {
                    toast(d.error === 'forbidden' ? 'This customer is not in your book.' : 'Could not snooze. Try again.');
                    renderContent();
                    return;
                }
                const before = measure();
                data.needs = (data.needs || []).filter((x) => x.companyId !== r.companyId);
                data.needsSnoozed = data.needsSnoozed.filter((s) => s.companyId !== r.companyId)
                    .concat([{ companyId: r.companyId, name: r.name, until: d.until || '' }]);
                redrawNeeds(before);
                renderLens(lens, lensGroups());
                toast('Snoozed until tomorrow · ' + r.name, ['Undo', () => unsnooze(r.companyId)]);
            }).catch(() => { toast('Could not snooze. Try again.'); renderContent(); });
        };
        const markCall = () => {
            content.querySelectorAll('.sc-calls .sc-row').forEach((b) => {
                if (callOpenId && b.getAttribute('data-call') === callOpenId)
                    b.setAttribute('aria-current', 'true');
                else
                    b.removeAttribute('aria-current');
            });
        };
        const closeCall = () => { callOpenId = ''; closeCallDrawer(drawerHost); markCall(); };
        const openCall = (r) => {
            if (route.account)
                go({ tab: route.tab, account: '' });
            callOpenId = r.id;
            markCall();
            if (r.companyId)
                setDockContext(win, { entityId: r.companyId, entityName: r.companyName, entityType: 'customer', phone: r.phone });
            openCallDrawer(drawerHost, r, {
                post: post,
                top: drawerTop,
                onClose: closeCall,
                onAccount: (row) => { closeCall(); openAccount(row.companyId); },
                onCallBack: (row) => {
                    callWithDock(win, { entityId: row.companyId, entityName: row.companyName || row.phone, entityType: 'customer', phone: row.phone });
                },
                onFollowUp: (taskId, approve, title) => post({ action: approve ? 'approveProposedTask' : 'rejectProposedTask', taskId: taskId }).then((d) => {
                    if (d.error)
                        return PROBLEM[d.error] || 'Could not save. Try again.';
                    toast((approve ? 'Approved · ' : 'Dismissed · ') + title);
                    Promise.all([loadTasks(), loadNeeds()]).then(() => render(true));
                    return '';
                }).catch(() => 'Could not save. Try again.')
            });
        };
        const addTaskNote = (r, note) => post({ action: 'salesCentralAddTaskNote', taskId: r.id, note: note }).then((d) => {
            if (d.error)
                return PROBLEM[d.error] || 'Could not save. Try again.';
            r.note = r.note ? r.note + '\n\n' + (d.line || note) : (d.line || note);
            renderContent();
            toast('Note added · ' + r.title.replace(/^AI:\s*/, ''));
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
        const drawerTop = () => Math.max(0, Math.round(tabBar.getBoundingClientRect().bottom));
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
        const lensGroups = () => {
            if (route.tab === 'tasks')
                return data.tasks ? tasksLens(data.tasks) : [];
            if (route.tab === 'pipeline')
                return data.pipeline ? pipelineLens(data.pipeline) : [];
            if (route.tab === 'calls')
                return data.calls ? callsLens(data.calls, data.callsTotal) : [];
            return data.needs ? needsLens(data.needs) : [];
        };
        const render = (full) => {
            renderTabs();
            if (full) {
                renderFilters();
                renderLens(lens, lensGroups());
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
            if (dealOpenId && e.key === 'Escape') {
                dealOpenId = '';
                closeDealDrawer(drawerHost);
                e.preventDefault();
                return;
            }
            if (callOpenId && e.key === 'Escape') {
                closeCall();
                e.preventDefault();
                return;
            }
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
            drawerHost.querySelectorAll('.sc-drawer').forEach((d) => { d.style.top = drawerTop() + 'px'; });
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
            loadPipeline().then(() => render(true));
            const loadCalls = () => p({ action: 'getWorkspaceHistory', dateRange: 'thisweek', limit: 50, pastOnly: true, companyNames: true }).then((d) => {
                if (d.error)
                    throw new Error(d.error);
                data.calls = d.rows || [];
                data.callsTotal = typeof d.total === 'number' ? d.total : data.calls.length;
            }).catch(() => {
                data.calls = [];
            });
            loadCalls().then(() => render(true));
            try {
                const bus = new win.BroadcastChannel('ctc-bus');
                let seen = null;
                let timer = 0;
                bus.onmessage = (ev) => {
                    const m = ev.data;
                    const log = m && m.type === 'snapshot' && m.snap ? m.snap.lastLog : null;
                    if (!log || (log.status !== 'saved' && log.status !== 'missed'))
                        return;
                    const key = log.status + '|' + (log.recordUrl || (log.transcript && log.transcript.recordId) || '') + '|' + (log.message || '');
                    if (seen === null) {
                        seen = key;
                        return;
                    }
                    if (key === seen)
                        return;
                    seen = key;
                    win.clearTimeout(timer);
                    timer = win.setTimeout(() => { Promise.all([loadNeeds(), loadCalls()]).then(() => render(true)); }, 1500);
                };
            }
            catch (e) { }
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
