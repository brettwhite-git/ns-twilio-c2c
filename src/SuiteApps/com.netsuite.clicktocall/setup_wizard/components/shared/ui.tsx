/**
 * Console building blocks — thin wrappers over native UIF components so
 * every page builds the canvas containers the same way.
 *
 *   card()      UIF Card (contentGap padding) + canvas border/radius class
 *   vstack()    UIF StackPanel (vertical)    hstack()  StackPanel (horizontal)
 *   grid()      UIF GridPanel                divider() UIF Divider
 *   chip()      UIF Badge (SUBTLE, SMALL) + one tone class
 *   dotText()   UIF Text bullet (tone class) + UIF Text label
 *   field()     label Text + control + help Text (vertical StackPanel)
 *   pageHeader  UIF Heading (PAGE_TITLE, the page's focus target) + Text
 *
 * Every StackPanel / GridPanel child is wrapped in its own .Item and falsy
 * entries are dropped first (UIF rejects null children and empty lists).
 */

import * as core from '@uif-js/core';
import * as component from '@uif-js/component';
import type {Tone} from './consoleModel';

/** A VDom node, a UIF component instance, or nothing (dropped). */
export type Child = unknown;

const SP = component.StackPanel;
export const Gap = component.StackPanel.GapSize;

const present = (nodes: Child[]): Child[] => nodes.filter((n) => n !== null && n !== undefined && n !== false && n !== '');

/** A placeholder for a list that came out empty (UIF rejects empty panels). */
const empty = (): Child => new component.Text({ text: '' });

export function vstack(nodes: Child[], gap: unknown = Gap.SPACING3X, opts: {
    alignment?: unknown; classList?: string[];
} = {}): core.VDom.Node {
    const list = present(nodes);
    return (
        <component.StackPanel
            orientation={SP.Orientation.VERTICAL}
            itemGap={gap as never}
            alignment={(opts.alignment ?? SP.Alignment.STRETCH) as never}
            classList={(opts.classList || []) as never}
        >
            {(list.length ? list : [empty()]).map((n) => (
                <component.StackPanel.Item>{n as never}</component.StackPanel.Item>
            )) as never}
        </component.StackPanel>
    ) as core.VDom.Node;
}

export function hstack(nodes: Child[], gap: unknown = Gap.SPACING2X, opts: {
    alignment?: unknown; justification?: unknown; wrap?: boolean; growLast?: boolean; growFirst?: boolean;
} = {}): core.VDom.Node {
    const list = present(nodes);
    const items = list.length ? list : [empty()];
    return (
        <component.StackPanel
            orientation={SP.Orientation.HORIZONTAL}
            itemGap={gap as never}
            alignment={(opts.alignment ?? SP.Alignment.CENTER) as never}
            justification={(opts.justification ?? SP.Justification.START) as never}
            wrap={!!opts.wrap}
        >
            {items.map((n, i) => {
                const grow = (opts.growFirst && i === 0) || (opts.growLast && i === items.length - 1) ? 1 : 0;
                return <component.StackPanel.Item grow={grow}>{n as never}</component.StackPanel.Item>;
            }) as never}
        </component.StackPanel>
    ) as core.VDom.Node;
}

/** GridPanel; `cells` fill the columns row by row. */
export function grid(columns: string, cells: Child[], gap: unknown = Gap.SPACING3X, opts: {
    rowGap?: unknown; stretch?: boolean;
} = {}): core.VDom.Node {
    const list = present(cells);
    return (
        <component.GridPanel
            columns={columns}
            columnGap={gap as never}
            rowGap={(opts.rowGap ?? gap) as never}
        >
            {(list.length ? list : [empty()]).map((n) => (
                <component.GridPanel.Item
                    alignment={(opts.stretch ? component.GridPanel.Alignment.STRETCH
                        : component.GridPanel.Alignment.START) as never}
                >
                    {n as never}
                </component.GridPanel.Item>
            )) as never}
        </component.GridPanel>
    ) as core.VDom.Node;
}

export type CardVariant = 'default' | 'flush' | 'danger';

/**
 * A canvas card: UIF Card, padding from contentGap (canvas 16px 18px ≈
 * SPACING4X), border / radius / background from the console stylesheet.
 * `flush` has no padding (a table edge to edge); `fill` makes the card as
 * tall as its grid row.
 */
export function card(nodes: Child[], opts: {
    variant?: CardVariant; gap?: unknown; fill?: boolean; label?: string;
} = {}): core.VDom.Node {
    const variant = opts.variant || 'default';
    const cls = variant === 'flush' ? 'ctc-card-flush' : variant === 'danger' ? 'ctc-card-danger' : 'ctc-card';
    const classList = opts.fill ? [cls, 'ctc-fill'] : [cls];
    const pad = variant === 'flush'
        ? component.Card.GapSize.NONE
        : { vertical: component.Card.GapSize.SPACING4X, horizontal: component.Card.GapSize.SPACING4X };
    return (
        <component.Card
            classList={classList as never}
            contentGap={pad as never}
            ariaLabel={opts.label}
        >
            {vstack(nodes, opts.gap ?? Gap.SPACING3X)}
        </component.Card>
    ) as core.VDom.Node;
}

export function text(t: string, opts: { weak?: boolean; strong?: boolean; small?: boolean; classList?: string[] } = {}): Child {
    return new component.Text({
        text: t,
        type: opts.strong ? component.Text.Type.STRONG : opts.weak ? component.Text.Type.WEAK : component.Text.Type.DEFAULT,
        size: opts.small ? component.Text.Size.S : component.Text.Size.M,
        classList: opts.classList || []
    } as never);
}

/** Muted help line (canvas .help: 12px muted). */
export const help = (t: string): Child => text(t, { weak: true, small: true });

/** Card title (canvas .h2: 15px bold). */
export function cardTitle(t: string, opts: { danger?: boolean } = {}): Child {
    return new component.Heading({
        content: t,
        level: 2,
        type: component.Heading.Type.SMALL_HEADING,
        classList: opts.danger ? ['ctc-danger-title'] : []
    } as never);
}

/** Big tabular number (canvas KPI value: 28px bold). */
export function metric(value: string, unit?: string): core.VDom.Node {
    return hstack([
        new component.Text({ text: value, size: component.Text.Size.XXL, weight: component.Text.Weight.BOLD } as never),
        unit ? text(unit, { weak: true }) : null
    ], Gap.SPACING1X, { alignment: SP.Alignment.BASELINE });
}

const CHIP_TONE: Record<Tone | 'neutral', string> = {
    ok: 'ctc-chip-ok', warn: 'ctc-chip-warn', problem: 'ctc-chip-problem',
    off: 'ctc-chip-neutral', neutral: 'ctc-chip-neutral', info: 'ctc-chip-info'
};

/** Status chip: UIF Badge with one canvas tone class. */
export function chip(label: string, tone: Tone | 'neutral'): Child {
    return new component.Badge({
        content: label,
        type: component.Badge.Type.SUBTLE,
        size: component.Badge.Size.SMALL,
        classList: [CHIP_TONE[tone]]
    } as never);
}

/** Numbered step circle (Inbound steps 1-4): UIF Badge + ctc-step. */
export function stepBadge(n: number): Child {
    return new component.Badge({
        content: String(n),
        type: component.Badge.Type.SUBTLE,
        classList: ['ctc-step']
    } as never);
}

/** Coloured status dot. */
export function dot(tone: Tone): Child {
    return new component.Text({
        text: '●',
        classList: ['ctc-dot-' + tone],
        rootAttributes: { 'aria-hidden': 'true' }
    } as never);
}

/** Dot + label (+ muted extra), the canvas `.st` status line. */
export function dotText(tone: Tone, label: string, extra?: string, opts: { small?: boolean } = {}): core.VDom.Node {
    return hstack([
        dot(tone),
        text(label, { small: opts.small }),
        extra ? text(extra, { weak: true, small: opts.small }) : null
    ], Gap.SPACING1X);
}

export function divider(): Child {
    return new component.Divider({ orientation: component.Divider.Orientation.HORIZONTAL } as never);
}

export interface ButtonOpts {
    primary?: boolean;
    danger?: boolean;
    enabled?: boolean;
    icon?: unknown;
    small?: boolean;
    link?: boolean;
}

/** UIF Button; the action gets the Button (Modal owner for confirms). */
export function button(label: string, action: (sender: unknown) => void, opts: ButtonOpts = {}): Child {
    const type = opts.link ? component.Button.Type.LINK
        : opts.danger ? component.Button.Type.DANGER
        : opts.primary ? component.Button.Type.PRIMARY
        : component.Button.Type.DEFAULT;
    return new component.Button({
        label,
        type,
        size: opts.small ? component.Button.Size.SMALL : component.Button.Size.MEDIUM,
        enabled: opts.enabled !== false,
        startIcon: opts.icon,
        action: (_args: unknown, sender: unknown): void => { action(sender); }
    } as never);
}

/** Link to a NetSuite page in a new tab. */
export function extLink(label: string, url: string): Child {
    return new component.Link({
        content: label + ' ↗',
        url,
        target: component.Link.Target.BLANK
    } as never);
}

/**
 * Label above the control, full width, with an optional help line.
 * Not UIF Field's `control` prop: a control passed there as JSX mounts
 * on the first render and is dropped on later re-renders (seen live
 * 2026-11-03: Account SID, API Key SID and the notice text boxes went
 * missing). The control is a normal StackPanel child instead.
 */
export function field(label: string, control: Child, helpText?: string | Child): core.VDom.Node {
    return vstack([
        new component.Text({ text: label, type: component.Text.Type.STRONG, size: component.Text.Size.S } as never),
        control,
        helpText ? (typeof helpText === 'string' ? help(helpText) : helpText) : null
    ], Gap.SPACING1X);
}

export function loader(label: string): Child {
    return new component.Loader({ label, indeterminate: true } as never);
}

interface SkeletonApi {
    lines(o: { count: number }): unknown;
    table(o: { rows: number; columns: number }): unknown;
    kpi(): unknown;
}

/**
 * Loading placeholder in the final layout (canvas States: skeleton blocks,
 * no shimmer): UIF Skeleton factories; a Loader if this UIF build has none.
 */
export function skeleton(kind: 'lines' | 'table' | 'kpi', size = 3, label = 'Loading…'): Child {
    try {
        const S = component.Skeleton as unknown as SkeletonApi;
        if (kind === 'table') return S.table({ rows: size, columns: 4 });
        if (kind === 'kpi') return S.kpi();
        return S.lines({ count: size });
    } catch (e) {
        return loader(label);
    }
}

/**
 * Error card (canvas States "Error"): red dot, what failed, what is
 * unchanged, and the way out (Retry, a link). Shown next to the content,
 * never instead of saved data.
 */
export function problemCard(title: string, detail: string, actions: Child[] = []): core.VDom.Node {
    return card([
        grid('auto minmax(0, 1fr)', [
            dot('problem'),
            vstack([
                text(title, { strong: true }),
                detail ? help(detail) : null,
                present(actions).length ? hstack(actions, Gap.SPACING2X, { wrap: true }) : null
            ], Gap.SPACING1X)
        ], Gap.SPACING3X)
    ]);
}

/** Empty card (canvas States "Empty"): what is missing and where it comes from. */
export function emptyCard(title: string, detail: string, actions: Child[] = []): core.VDom.Node {
    return card([
        text(title, { strong: true }),
        help(detail),
        present(actions).length ? hstack(actions, Gap.SPACING2X, { wrap: true }) : null
    ], { gap: Gap.SPACING2X });
}

/** Error line (✕ + strong text), as ErrorText. */
export const errorLine = (msg: string): Child => text('✕ ' + msg, { strong: true });

/**
 * Page header: title (the focus target after navigation), subtitle, and
 * items on the right (status text, buttons).
 */
export function pageHeader(title: string, subtitle: string, aside: Child[] = []): core.VDom.Node {
    const heading = new component.Heading({
        content: title,
        level: 1,
        type: component.Heading.Type.PAGE_TITLE,
        rootAttributes: { 'data-ctc-page-heading': '' }
    } as never);
    const left = vstack([heading, subtitle ? text(subtitle, { weak: true }) : null], Gap.SPACING1X);
    const right = present(aside);
    if (!right.length) return left;
    return hstack([left, hstack(right, Gap.SPACING3X, { wrap: true })], Gap.SPACING4X, {
        alignment: SP.Alignment.END, justification: SP.Justification.SPACE_BETWEEN, wrap: true, growFirst: true
    });
}
