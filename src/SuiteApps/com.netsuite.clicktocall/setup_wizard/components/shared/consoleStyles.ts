/**
 * Console styles — the one scoped stylesheet of the Admin Console.
 *
 * UIF gives the structure (Card, GridPanel, StackPanel, Divider, Badge,
 * Button, DataGrid, Switch, Dropdown, TextArea, Field). UIF has no props
 * for the canvas's surface colours, card border and radius, chip colours,
 * numbered step circles or status-dot colours, so these few classes add
 * them. Values come from the approved canvas (Main/Phones/Inbound/
 * Transcripts/Account .dc.html). Every rule is scoped under .ctc-console
 * (the console's content panel) so nothing leaks into NetSuite or the
 * onboarding stepper. Classes go on UIF components through `classList`
 * (one class per component where UIF requires it, e.g. Badge).
 */

export const CONSOLE_CLASS = 'ctc-console';
/** The console's frame (GridPanel: rail + content) and its content ScrollPanel. */
export const CONSOLE_FRAME_CLASS = 'ctc-console-frame';
export const CONSOLE_SCROLL_CLASS = 'ctc-console-scroll';
/** The NavigationDrawer of the console, and its "Click-to-Call" title. */
export const RAIL_CLASS = 'ctc-rail';
export const RAIL_TITLE_CLASS = 'ctc-rail-title';

/** Canvas tokens. */
export const TOKENS = {
    surface: '#F6F5F2',
    card: '#FFFFFF',
    border: '#E5E2DD',
    divider: '#F1EFEA',
    text: '#161513',
    muted: '#5C5955',
    /** A zero count in a table. */
    faint: '#8B8780',
    headerBg: '#FAFAF8',
    radius: '12px',
    dangerBorder: '#E7C3BF',
    dangerText: '#9A2A23'
};

const S = '.' + CONSOLE_CLASS;
const T = TOKENS;

/** One type-scale class: size / weight / colour / line-height, on the Text and its inner nodes. */
const type = (cls: string, size: number, weight: number, color: string, lineHeight = '1.45'): string =>
    S + ' .' + cls + '{font-size:' + size + 'px !important;font-weight:' + weight + ' !important;color:' + color +
    ' !important;line-height:' + lineHeight + ' !important}' +
    S + ' .' + cls + ' *{font-size:inherit !important;font-weight:inherit !important;color:inherit !important;' +
    'line-height:inherit !important}';

const CSS = [
    // Page surface behind the cards, the full height of every page. The
    // content panel is only as tall as its cards, so the surface is also
    // on the ScrollPanel around it and on the console frame (GridPanel,
    // rail + content; the rail draws its own dark background). Colour
    // only: no heights, so no second scrollbar.
    S + '{background:' + T.surface + ';min-height:100%}',
    '.' + CONSOLE_FRAME_CLASS + ',.' + CONSOLE_SCROLL_CLASS + '{background:' + T.surface + '}',
    'div:has(> div > ' + S + '){background:' + T.surface + '}',

    // ── Type scale (ui.tsx typeClass / label / cardTitle) ──
    type('ctc-t-body', 13, 400, T.text),
    type('ctc-t-strong', 13, 600, T.text),
    type('ctc-t-muted', 13, 400, T.muted),
    type('ctc-t-small', 12, 400, T.text),
    type('ctc-t-strong-small', 12, 600, T.text),
    type('ctc-t-help', 12, 400, T.muted),
    type('ctc-t-label', 12, 600, T.muted),
    type('ctc-h2', 15, 700, T.text, '1.35'),
    // Overview status headline ("Active" / "Paused").
    type('ctc-t-status', 17, 700, T.text, '1.2'),
    S + ' .ctc-h2{margin:0 !important}',
    S + ' .ctc-num{font-variant-numeric:tabular-nums}',
    S + ' .ctc-t-zero,' + S + ' .ctc-t-zero *{color:' + T.faint + ' !important}',
    // Quoted notice text ("Live in Twilio").
    S + ' .ctc-quote{border-left:3px solid ' + T.border + ';padding-left:10px}',

    // ── Tables: every DataGrid (ui.table) ──
    S + ' .ctc-table .ctc-th{background:' + T.headerBg + ' !important;border-bottom:1px solid ' + T.border + ' !important}',
    S + ' .ctc-table .ctc-th,' + S + ' .ctc-table .ctc-th *{font-size:12px !important;font-weight:600 !important;' +
        'color:' + T.muted + ' !important}',
    S + ' .ctc-table .ctc-td-first .ctc-t-body{font-weight:600 !important}',
    S + ' .ctc-table .ctc-td-num,' + S + ' .ctc-table .ctc-th-num{text-align:right;font-variant-numeric:tabular-nums}',
    // ── Tables whose rows grow with the text (ui.listTable) ──
    S + ' .ctc-lth,' + S + ' .ctc-ltd{box-sizing:border-box;height:100%;justify-content:center !important}',
    S + ' .ctc-lth{background:' + T.headerBg + ';border-bottom:1px solid ' + T.border + ';padding:9px 12px}',
    S + ' .ctc-ltd{border-bottom:1px solid ' + T.divider + ';padding:10px 12px}',
    S + ' .ctc-ltd .ctc-t-body,' + S + ' .ctc-ltd .ctc-t-help{overflow-wrap:anywhere}',

    // Card: white, 1px warm border, 12px radius, no shadow.
    S + ' .ctc-card{background:' + TOKENS.card + ' !important;border:1px solid ' + TOKENS.border +
        ' !important;border-radius:' + TOKENS.radius + ' !important;box-shadow:none !important;box-sizing:border-box}',
    // Card that holds a table edge to edge.
    S + ' .ctc-card-flush{background:' + TOKENS.card + ' !important;border:1px solid ' + TOKENS.border +
        ' !important;border-radius:' + TOKENS.radius + ' !important;box-shadow:none !important;overflow:hidden}',
    // Danger zone card.
    S + ' .ctc-card-danger{background:' + TOKENS.card + ' !important;border:1px solid ' + TOKENS.dangerBorder +
        ' !important;border-radius:' + TOKENS.radius + ' !important;box-shadow:none !important}',
    S + ' .ctc-danger-title{color:' + TOKENS.dangerText + ' !important}',
    // Cards in one grid row share the row height (rotate-key card = connection card).
    S + ' .ctc-fill{height:100%}',
    // Status chips (UIF Badge): pill, 12px semibold, canvas colours per tone.
    S + ' .ctc-chip-neutral,' + S + ' .ctc-chip-info,' + S + ' .ctc-chip-warn,' + S + ' .ctc-chip-problem,' +
        S + ' .ctc-chip-ok{border:0 !important;border-radius:999px !important;font-size:12px !important;' +
        'font-weight:600 !important;white-space:nowrap}',
    S + ' [class*="ctc-chip-"] *{font-size:12px !important;font-weight:600 !important;color:inherit !important}',
    S + ' .ctc-chip-neutral{background:#F1EFEA !important;color:#5C5955 !important}',
    S + ' .ctc-chip-info{background:#E8F0F8 !important;color:#1F3550 !important}',
    S + ' .ctc-chip-warn{background:#FFF3D6 !important;color:#8A5A00 !important}',
    S + ' .ctc-chip-problem{background:#FCE9E7 !important;color:#9A2A23 !important}',
    S + ' .ctc-chip-ok{background:#E4F3EB !important;color:#1F6B49 !important}',
    // Numbered step circle (UIF Text) on Inbound "What a caller experiences".
    S + ' .ctc-step{width:24px;height:24px;min-width:24px;box-sizing:border-box;border-radius:999px;' +
        'background:#1F3550;color:#FFFFFF !important;font-size:12px !important;font-weight:700 !important;' +
        'line-height:24px !important;text-align:center;display:inline-block !important;' +
        'font-variant-numeric:tabular-nums;margin-top:1px}',
    // Quiet danger button (opens a destructive action): red text, red-tint border.
    S + ' .ctc-btn-danger{color:#9A2A23 !important;border-color:#E7C3BF !important;background:#FFFFFF !important}',
    S + ' .ctc-btn-danger:hover{background:#FCF1EF !important}',
    // Icon tile (Call Central): 36px rounded, pale blue.
    S + ' .ctc-icon-tile{width:36px;height:36px;border-radius:10px;background:#E8F0F8;' +
        'display:inline-flex !important;align-items:center;justify-content:center}',
    // Status dots (UIF Text holding a bullet).
    S + ' .ctc-dot-ok{color:#2E9E6B !important}',
    S + ' .ctc-dot-warn{color:#E9A62A !important}',
    S + ' .ctc-dot-problem{color:#B4432F !important}',
    S + ' .ctc-dot-off{color:#B9B5AE !important}',
    S + ' .ctc-dot-info{color:#9DB4CF !important}',
    // SIDs and secret ids.
    S + ' .ctc-mono{font-family:"SF Mono",Menlo,monospace !important;font-size:12px !important}',

    // ── Rail title (NavRail): the rail sits outside .ctc-console, so the
    // rule is scoped to the console's own drawer class. Hidden when the
    // rail is collapsed (narrow container).
    '.' + RAIL_CLASS + ' .ctc-rail-head{container-type:inline-size;width:100%}',
    '.' + RAIL_CLASS + ' .' + RAIL_TITLE_CLASS + '{display:block;font-size:11px !important;font-weight:700 !important;' +
        'letter-spacing:0.06em;text-transform:uppercase;color:#9FB3C8 !important;padding:6px 10px 8px;' +
        'white-space:nowrap;overflow:hidden;cursor:default;user-select:none;pointer-events:none}',
    '@container (max-width: 120px){.' + RAIL_CLASS + ' .' + RAIL_TITLE_CLASS + '{display:none !important}}'
].join('\n');

const STYLE_ID = 'ctc-console-styles';

/** Add the stylesheet once (ConsoleShell and NavRail call it on every render). */
export function ensureConsoleStyles(): void {
    try {
        if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
        const el = document.createElement('style');
        el.id = STYLE_ID;
        el.textContent = CSS;
        (document.head || document.documentElement).appendChild(el);
    } catch (e) {
        // Without the sheet the console still works with UIF's own look.
    }
}
