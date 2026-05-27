// @ts-check
/**
 * Shell render helpers — page-level scaffolding sitting one layer above
 * the cross-section widgets in shared.ts. The three helpers here form
 * the chrome around every console section + stepper step:
 *
 *   - wrapContent       — ScrollPanel + ContentPanel padding shell.
 *     ONE place defines the rail-to-content margin for the whole SPA.
 *   - buildPausedBanner — orange "Click-to-Call is paused" banner.
 *     Rendered above any console section when snapshot.active === false.
 *   - buildStatCard     — KPI card for the Overview dashboard.
 *
 * Path B.3e-3 (2026-05-27) — extracted from SpaClient.ts.
 *
 * UIF native-component swaps:
 *
 *   buildPausedBanner: the original carried a `if (!d.Bn)` fallback
 *   that rebuilt the banner as a hand-rolled StackPanel(HORIZONTAL)
 *   [Text(warning), Button(Reactivate)]. With @oracle/netsuite-uif-types
 *   v9.0.0 confirming `component.Banner` exists (component.d.ts line
 *   1154 — `export class Banner extends PackageCore.Component`), the
 *   fallback is dead code. Dropped.
 *
 *   buildStatCard: the original carried a `if (d.Cd && typeof
 *   d.Cd.metric === 'function')` availability gate around the native
 *   Card.metric() factory, with a manual Text+Heading+Text stack as
 *   fallback when absent. With @oracle/netsuite-uif-types v9.0.0
 *   confirming `Card.metric` exists (component.d.ts line 2500 —
 *   `static metric(options: {title, metric, metadata?, description?,
 *   toolbar?, action?, cardOptions?}): Self.Card`), the availability
 *   gate is dropped. The try/catch around the call survives because
 *   metric() can still throw on bad runtime options — a manual stack
 *   fallback inside catch is the runtime safety net.
 *
 * Dependency note (why this isn't `mount.ts`):
 *
 *   B.3e-3 was originally planned to also extract `rerender` plus the
 *   mount-time state vars (scriptCtx, enums, bodyContainer). Those are
 *   tightly coupled to SpaClient.ts's `run()` initialization and dozens
 *   of read sites scattered across step + section render functions. The
 *   value-add of B.3e-3 was the UIF swaps; rerender extraction would
 *   layer additional risk without proportional code-clarity benefit.
 *   Mount-state extraction is deferred to B.5 (final SpaClient.ts
 *   minimization) when the rest of the render tree has settled.
 */

import * as core from '@uif-js/core';
import * as component from '@uif-js/component';
import { safeNew } from './primitives';

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

/**
 * The enums-bundle object built by SpaClient.run(). Heterogeneous bag
 * of component class refs and enum constants pulled out of @uif-js/core
 * + @uif-js/component for the closure-scoped render helpers. Typed
 * loosely as `any` because each helper destructures different keys and
 * a precise interface would duplicate the entire UIF type surface.
 *
 * `unknown` would force every call site to cast; `any` is the
 * pragmatic compromise during the migration. B.5 minimization may
 * narrow this if the enums bag itself gets extracted to mount.ts.
 *
 * eslint-disable-next-line @typescript-eslint/no-explicit-any
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EnumsBag = any;

/**
 * Spec for one Overview stat card.
 *   - title:       small WEAK label above the metric
 *   - metric:      the big value (e.g., "Active", "5", "3 of 7")
 *   - description: subline detail (small, optional)
 *   - icon:        optional SystemIcon source rendered next to the metric.
 *                  When set, the card switches from Card.metric() (which
 *                  only takes string-typed metric values) to a custom
 *                  layout that puts the icon + metric in a horizontal
 *                  StackPanel. Other cards in the same row stay
 *                  Card.metric()-based — the visual hierarchy is consistent
 *                  enough that mixing the two doesn't read as a regression.
 *   - tone:        semantic color for the icon. Maps to Image.Color enum.
 *                  Currently used by the Status card to express
 *                  Active/Paused/Unknown. Other cards leave tone unset.
 */
export type StatCardTone = 'success' | 'warning' | 'info' | 'neutral';

export interface StatCardSpec {
    title: string;
    metric: string;
    description?: string;
    icon?: unknown;       // Image.Source from core.SystemIcon.STATUS_*_FILLED
    tone?: StatCardTone;
}

/** Click handler for buildPausedBanner's Reactivate button. */
export type ReactivateHandler = () => void;

// ─────────────────────────────────────────────────────────────────────
// wrapContent — ScrollPanel + ContentPanel padding shell
// ─────────────────────────────────────────────────────────────────────

/**
 * U1.5: wrap content in a ScrollPanel(VERTICAL) + ContentPanel
 * (padding).
 *
 * ── LAYOUT-WIDE MARGIN RULE (single source of truth) ───────────
 * Every section's content flows through this function. The
 * `outerGap` GapSizeObject is the ONE place that defines the
 * margin between:
 *   - rail edge ←→ content start  (outerGap.start)
 *   - content end ←→ browser right (outerGap.end)
 *   - top / bottom breathing room  (outerGap.vertical)
 *
 * Update these values to change layout spacing across EVERY
 * section uniformly (Overview, Phones, Voice, Credentials,
 * Health, and stepper re-run mode).
 *
 * Per ContentPanel.GapSizeObject (component.d.ts:4069):
 *   start / end accept any GapSize (M=24px, L=32px, XL=40px).
 *
 * Current values:
 *   start: XXL (48px) — generous inset from rail's flush-left edge
 *   end:   XXL (48px) — symmetric inset from browser right
 *   vertical: M (24px) — top + bottom inset
 */
export const wrapContent = (d: EnumsBag, child: unknown): unknown => {
    // UIF v9.0.0 guarantees ContentPanel + ScrollPanel + their enums.
    const padded = safeNew(d.CP, {
        content: child,
        horizontalAlignment: d.CP_HAlign.STRETCH,
        outerGap: {
            start: d.CP_Gap.XXL,
            end: d.CP_Gap.XXL,
            vertical: d.CP_Gap.M
        }
    }, 'ContentPanel(rail-wrapper)') || child;

    // Wrap in ScrollPanel(VERTICAL) so the content pane scrolls
    // internally — rail stays put in viewport even when content
    // exceeds the visible area.
    return safeNew(d.Sp, {
        content: padded,
        orientation: d.Sp.Orientation.VERTICAL
    }, 'ScrollPanel(rail-content)') || padded;
};

// ─────────────────────────────────────────────────────────────────────
// buildPausedBanner — orange Banner with body text + Reactivate button
// ─────────────────────────────────────────────────────────────────────

/**
 * U7 + U1: when snapshot.active === false, render a top-of-page
 * warning banner with a Reactivate button. R7 (originally) said do
 * NOT bounce admin to the stepper on deactivate — admin stays
 * here, banner-gated. U1 places this banner ONCE at the page root
 * above the console shell.
 *
 * Path C polish (2026-05-27) — swapped from `component.Banner`
 * (a decorative banner with COLOR.ORANGE) to `component.BannerMessage`
 * (a SEMANTIC notification with Type.WARNING). BannerMessage is the
 * Oracle-canonical component for status messaging: it renders the
 * standard warning triangle icon natively and uses the system's
 * warning-color palette rather than a custom rootStyle.
 *
 * The Reactivate button still rides inside `content` as a horizontal
 * StackPanel — BannerMessage has no built-in action slot (the closest
 * is `showCloseButton`, which fires CLOSED rather than a custom
 * action). Putting the button in `content` keeps both action paths
 * (dismiss + reactivate) clean: we set `showCloseButton: false` so
 * admins can't dismiss the paused state itself, only reactivate.
 *
 * @param d            UIF enums bundle (unused for BannerMessage —
 *                     kept in the signature for symmetry with other
 *                     shell helpers and forward compatibility).
 * @param onReactivate Click handler for the Reactivate button. Wires
 *                     back to SpaClient's onReactivateClick (which
 *                     fires wizardActivate then rerender).
 */
export const buildPausedBanner = (
    d: EnumsBag,
    onReactivate: ReactivateHandler
): unknown => {
    // component.Button.Type guaranteed by @oracle/netsuite-uif-types v9.0.0.
    const ButtonType = component.Button.Type;

    const bodyText = safeNew(d.T, {
        text: 'Reps cannot place calls until you reactivate. All ' +
              'config is preserved.'
    }, 'Text(paused-banner-body)');

    const reactivateBtn = safeNew(component.Button, {
        label: 'Reactivate',
        type: ButtonType.PRIMARY,
        action: onReactivate
    }, 'Button(paused-banner-reactivate)');

    const contentRow = safeNew(d.SP, {
        items: [bodyText, reactivateBtn].filter((c) => c != null),
        orientation: d.SP_Orient.HORIZONTAL,
        itemGap: d.SP_Gap.L,
        justification: (d.SP.Justification && d.SP.Justification.SPACE_BETWEEN) || undefined,
        alignment: (d.SP.Alignment && d.SP.Alignment.CENTER) || undefined
    }, 'StackPanel(paused-banner-content)') || bodyText;

    return safeNew(component.BannerMessage, {
        title: 'Click-to-Call is paused',
        content: contentRow,
        type: component.BannerMessage.Type.WARNING,
        showCloseButton: false
    }, 'BannerMessage(paused)');
};

// ─────────────────────────────────────────────────────────────────────
// buildStatCard — KPI card via native Card.metric()
// ─────────────────────────────────────────────────────────────────────

/**
 * U2-polish: use Card.metric() — the static factory designed for
 * KPI/stat cards. Per component.d.ts:2500, it accepts { title,
 * metric, description, ... } and returns a Card with the proper
 * internal layout. Replaces the manual Card+StackPanel approach
 * that rendered invisible cards in early iterations.
 *
 * Card.metric() availability is now guaranteed by the UIF type
 * catalog (v9.0.0). The catch block survives because metric() can
 * still throw on runtime option mismatches — falls back to a
 * hand-rolled Heading+Text stack so the dashboard never renders
 * with empty grid cells.
 */
export const buildStatCard = (d: EnumsBag, spec: StatCardSpec): unknown => {
    // Icon-bearing cards (Path C-2) skip Card.metric() entirely because
    // Card.metric.metric only accepts string-typed values — the icon
    // can't ride next to the metric in that slot. Use the manual stack
    // pattern with an extra horizontal row [Image, Heading].
    if (spec.icon) {
        return buildStatCardWithIcon(d, spec);
    }

    try {
        return d.Cd.metric({
            title: spec.title,
            metric: spec.metric,
            description: spec.description
        });
    } catch (e) {
        console.warn('[CTC Setup Wizard] Card.metric threw, ' +
            'falling back to manual stack:', e);
    }

    // Runtime fallback: hand-rolled stack if Card.metric() threw above.
    return buildStatCardManualStack(d, spec);
};

/**
 * Manual stack used both as the Card.metric() fallback and as the
 * base layout for icon-bearing cards.
 */
const buildStatCardManualStack = (d: EnumsBag, spec: StatCardSpec): unknown => {
    const label = safeNew(d.T, {
        text: spec.title,
        type: d.T_Type.WEAK,
        size: d.T && d.T.Size ? d.T.Size.S : undefined
    }, 'Text(stat-label)');
    const value = safeNew(d.H, {
        content: spec.metric,
        type: d.H_Type.SMALL_HEADING
    }, 'Heading(stat-value)');
    const sub = spec.description ? safeNew(d.T, {
        text: spec.description,
        type: d.T_Type.WEAK,
        size: d.T && d.T.Size ? d.T.Size.S : undefined
    }, 'Text(stat-sub)') : null;
    return safeNew(d.SP, {
        items: [label, value, sub].filter((c) => c != null),
        orientation: d.SP_Orient.VERTICAL,
        itemGap: d.SP_Gap.XXS
    }, 'StackPanel(stat-card-' + spec.title + ')');
};

/**
 * Icon-bearing stat card. Replaces the metric Heading with a horizontal
 * [Image(icon), Heading(metric)] row so the icon sits next to the metric
 * value at equal visual weight. Used by the Status card on the Overview
 * dashboard to convey Active/Paused/Unknown semantically.
 */
const buildStatCardWithIcon = (d: EnumsBag, spec: StatCardSpec): unknown => {
    const label = safeNew(d.T, {
        text: spec.title,
        type: d.T_Type.WEAK,
        size: d.T && d.T.Size ? d.T.Size.S : undefined
    }, 'Text(stat-label-' + spec.title + ')');

    const iconColor = toneToImageColor(spec.tone);
    // component.Image's constructor accepts `Options | string | ImageMetadata`,
    // which is broader than safeNew's AnyCtor (options-object only). The
    // cast narrows it to the AnyCtor shape so safeNew accepts it; we
    // always pass an Options object here.
    const ImageCtor = component.Image as unknown as new (options?: object) => unknown;
    const icon = safeNew(ImageCtor, {
        image: spec.icon,
        size: component.Image.Size.M,
        color: iconColor,
        presentation: true
    }, 'Image(stat-icon-' + spec.title + ')');

    const value = safeNew(d.H, {
        content: spec.metric,
        type: d.H_Type.SMALL_HEADING
    }, 'Heading(stat-value-' + spec.title + ')');

    const valueRow = safeNew(d.SP, {
        items: [icon, value].filter((c) => c != null),
        orientation: d.SP_Orient.HORIZONTAL,
        itemGap: d.SP_Gap.S,
        alignment: (d.SP.Alignment && d.SP.Alignment.CENTER) || undefined
    }, 'StackPanel(stat-value-row-' + spec.title + ')') || value;

    const sub = spec.description ? safeNew(d.T, {
        text: spec.description,
        type: d.T_Type.WEAK,
        size: d.T && d.T.Size ? d.T.Size.S : undefined
    }, 'Text(stat-sub-' + spec.title + ')') : null;

    // Two-stack composition to match Card.metric's spacing:
    //   - inner stack: [label, valueRow] with XXS gap (label sits tight
    //     above the metric)
    //   - outer stack: [innerStack, sub] with M gap (description sits
    //     with breathing room below the metric, same as Card.metric's
    //     internal layout)
    const titleAndValue = safeNew(d.SP, {
        items: [label, valueRow].filter((c) => c != null),
        orientation: d.SP_Orient.VERTICAL,
        itemGap: d.SP_Gap.XXS
    }, 'StackPanel(stat-title-value-' + spec.title + ')');

    const innerStack = safeNew(d.SP, {
        items: [titleAndValue, sub].filter((c) => c != null),
        orientation: d.SP_Orient.VERTICAL,
        itemGap: d.SP_Gap.M
    }, 'StackPanel(stat-card-icon-inner-' + spec.title + ')');

    // Wrap in a ContentPanel with rootStyle that mimics Card.metric's
    // visual chrome (white background + subtle border + rounded corners
    // + interior padding) so the icon-bearing card sits visually flush
    // with the Card.metric()-based siblings in the same grid row. Same
    // pattern as Health's danger-zone + Credentials' rotation-runbook
    // callout boxes.
    if (!d.CP) return innerStack;
    return safeNew(d.CP, {
        content: innerStack,
        horizontalAlignment: d.CP_HAlign.STRETCH,
        rootStyle: {
            border: '1px solid #DBDDE2',
            borderRadius: '4px',
            backgroundColor: '#FFFFFF',
            padding: '16px 20px'
        }
    }, 'ContentPanel(stat-card-icon-' + spec.title + ')') || innerStack;
};

const toneToImageColor = (tone: StatCardTone | undefined): unknown => {
    if (!tone) return undefined;
    switch (tone) {
        case 'success': return core.ImageConstant.Color.SUCCESS;
        case 'warning': return core.ImageConstant.Color.WARNING;
        case 'info':    return core.ImageConstant.Color.INFO;
        case 'neutral': return core.ImageConstant.Color.NEUTRAL;
        default: return undefined;
    }
};
