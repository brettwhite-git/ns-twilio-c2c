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

/** Canvas tokens. */
export const TOKENS = {
    surface: '#F6F5F2',
    card: '#FFFFFF',
    border: '#E5E2DD',
    divider: '#F1EFEA',
    text: '#161513',
    muted: '#5C5955',
    radius: '12px',
    dangerBorder: '#E7C3BF',
    dangerText: '#9A2A23'
};

const S = '.' + CONSOLE_CLASS;

const CSS = [
    // Page surface behind the cards.
    // The content panel is only as tall as its cards; the surface fills
    // the scroll area behind it.
    S + '{background:' + TOKENS.surface + ';min-height:100%}',
    'div:has(> div > ' + S + '){background:' + TOKENS.surface + '}',
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
        S + ' .ctc-chip-ok{border:0 !important;border-radius:999px !important;font-weight:600 !important}',
    S + ' .ctc-chip-neutral{background:#F1EFEA !important;color:#5C5955 !important}',
    S + ' .ctc-chip-info{background:#E8F0F8 !important;color:#1F3550 !important}',
    S + ' .ctc-chip-warn{background:#FFF3D6 !important;color:#8A5A00 !important}',
    S + ' .ctc-chip-problem{background:#FCE9E7 !important;color:#9A2A23 !important}',
    S + ' .ctc-chip-ok{background:#E4F3EB !important;color:#1F6B49 !important}',
    // Numbered step circle (UIF Badge) on Inbound "What a caller experiences".
    S + ' .ctc-step{width:22px;height:22px;min-width:22px;padding:0 !important;border:0 !important;' +
        'border-radius:999px !important;background:#E8F0F8 !important;color:#1F3550 !important;' +
        'font-weight:700 !important;display:inline-flex !important;align-items:center;justify-content:center}',
    // Status dots (UIF Text holding a bullet).
    S + ' .ctc-dot-ok{color:#2E9E6B !important}',
    S + ' .ctc-dot-warn{color:#E9A62A !important}',
    S + ' .ctc-dot-problem{color:#B4432F !important}',
    S + ' .ctc-dot-off{color:#B9B5AE !important}',
    S + ' .ctc-dot-info{color:#9DB4CF !important}',
    // SIDs and secret ids.
    S + ' .ctc-mono{font-family:"SF Mono",Menlo,monospace !important;font-size:12px !important}'
].join('\n');

const STYLE_ID = 'ctc-console-styles';

/** Add the stylesheet once (ConsoleShell calls it on every render). */
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
