/** Sales Central: a small element builder and text formats. */

export const el = <K extends keyof HTMLElementTagNameMap>(
    tag: K, cls?: string, text?: string
): HTMLElementTagNameMap[K] => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
};

export const clear = (node: Element): void => {
    while (node.firstChild) node.removeChild(node.firstChild);
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** $12,400 (no cents); '—' for 0 or nothing. */
export const money = (n: number | null | undefined): string =>
    n ? '$' + Math.round(n).toLocaleString('en-US') : '—';

const isoDay = (iso: string): number => Date.parse(iso + 'T00:00:00Z');

/** 'Today', 'Yesterday', '3d ago', else 'Nov 2' (from YYYY-MM-DD). */
export const ago = (iso: string, todayIso: string): string => {
    if (!iso) return '—';
    const d = Math.round((isoDay(todayIso) - isoDay(iso)) / 86400000);
    if (d === 0) return 'Today';
    if (d === 1) return 'Yesterday';
    if (d > 1 && d < 7) return d + 'd ago';
    return shortDate(iso);
};

/** 'Nov 28' (from YYYY-MM-DD); '—' for nothing. */
export const shortDate = (iso: string): string => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    return m ? MONTHS[parseInt(m[2], 10) - 1] + ' ' + parseInt(m[3], 10) : '—';
};

/** m:ss from seconds. */
export const clock = (sec: number): string => {
    const s = Math.max(0, Math.round(sec || 0));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
};

/** YYYY-MM-DD of the browser's day. */
export const localToday = (now?: Date): string => {
    const d = now || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};

/** M/D/YYYY (NetSuite's US date) → YYYY-MM-DD; '' when it does not parse. */
export const nsDateToIso = (s: string): string => {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(s || '').trim());
    return m ? m[3] + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0') : '';
};
