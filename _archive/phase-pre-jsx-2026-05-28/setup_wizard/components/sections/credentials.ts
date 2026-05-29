// @ts-check
/**
 * Credentials section — U5 (Phase 3a baseline, pre-modal).
 *
 * Renders the read-only display of Twilio credential identifiers
 * (Account SID + API Key SID + API Secret NetSuite-script-id pointer)
 * plus a deep-link to NetSuite's API Secrets management page and a
 * 3-step rotation runbook callout.
 *
 * Why no rotate-secret Modal here? The U5 modal flow (Phase 3c
 * STATE.console.activeModal === 'rotate-secret') is gated by UIF
 * `component.Modal` availability — which is NOT in @oracle/netsuite-
 * uif-types v9.0.0 (verified during B.3e planning). The full rotation
 * modal lands when the type catalog gains Modal support OR when the
 * UI framework alternative is decided (Phase C wireframes).
 *
 * Path B.3f (2026-05-27) — first section extracted from SpaClient.ts.
 * Self-contained: no event-handler coupling to SpaClient internals.
 * The "Open NetSuite API Secrets" button uses `window.open` directly.
 */

import * as core from '@uif-js/core';
import * as component from '@uif-js/component';
import { safeNew } from '../shared/primitives';
import { STATE } from '../../state';
import type { EnumsBag } from '../shared/shell';

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

/** Snapshot fields the credentials section reads from STATE.console. */
interface CredentialsSnapshot {
    accountSid?: string;
    apiKeySid?: string;
    apiSecretId?: string;
}

/** Spec for a single credential display row. */
interface CredentialRowSpec {
    label: string;
    value: string;
    help: string;
    /**
     * Optional Twilio docs URL for the field. When set, renders a
     * "Twilio docs ↗" Link next to the label, opening in a new tab.
     * Same pattern Voice config (Path C-5) uses on its 3 fields.
     */
    docUrl?: string;
}

/**
 * Path C-followup: Twilio docs URLs for each credential field.
 * Verified via WebFetch (200 OK) on 2026-05-27:
 *   - Account SID  → REST API: Accounts
 *   - API Key SID  → API keys overview (covers both SID + Secret)
 *   - API Secret   → same API keys page (Secret is a pair with the
 *                    SID; Twilio docs them together)
 */
const TWILIO_CREDS_DOCS = {
    accountSid: 'https://www.twilio.com/docs/iam/api/account',
    apiKeySid:  'https://www.twilio.com/docs/iam/api-keys',
    apiSecret:  'https://www.twilio.com/docs/iam/api-keys'
};

// ─────────────────────────────────────────────────────────────────────
// buildCredentialsSection — section root
// ─────────────────────────────────────────────────────────────────────

/**
 * Render the Credentials admin-console section.
 *
 * Layout (vertical StackPanel):
 *   1. "Credentials" heading
 *   2. Intro text (what's visible vs. what stays encrypted)
 *   3. Three credential rows (Account SID, API Key SID, Secret pointer)
 *   4. "Open NetSuite API Secrets ↗" deep-link button
 *   5. Rotation runbook callout
 */
export const buildCredentialsSection = (d: EnumsBag): unknown => {
    const snap = (STATE.console.snapshot || {}) as CredentialsSnapshot;
    const items: unknown[] = [];

    // Section-level "Credentials" Heading dropped — ApplicationHeader
    // subtitle shows the section name. The "Open NetSuite API Secrets ↗"
    // button now sits at the top of the section as a left-aligned
    // toolbar button (matching the Phones & reps toolbar pattern:
    // DEFAULT button with leading SystemIcon at section start).
    const ButtonType = component.Button.Type;
    const manageBtn = safeNew(component.Button, {
        label: 'Open NetSuite API Secrets',
        type: ButtonType.DEFAULT,
        startIcon: core.SystemIcon.LOCK,
        action: (): void => {
            try {
                window.open('/app/common/scripting/secrets/settings.nl', '_blank');
            } catch (e) { /* ignore */ }
        }
    }, 'Button(open-api-secrets)');

    const headerRow = safeNew(d.SP, {
        items: [manageBtn].filter((c) => c != null),
        orientation: d.SP_Orient.HORIZONTAL,
        itemGap: d.SP_Gap.S,
        alignment: (d.SP.Alignment && d.SP.Alignment.CENTER) || undefined
    }, 'StackPanel(credentials-header-row)');
    if (headerRow) items.push(headerRow);

    const intro = safeNew(d.T, {
        text: 'Twilio public identifiers and NetSuite secret pointer. ' +
              'These values are safe to view; the API Key Secret value ' +
              'itself is held in NetSuite\'s encrypted vault and is ' +
              'never exposed to scripts.',
        type: d.T_Type.WEAK
    }, 'Text(credentials-intro)');
    if (intro) items.push(intro);

    items.push(buildCredentialRow(d, {
        label: 'Account SID',
        value: snap.accountSid || '(not set)',
        help: 'Public identifier for your Twilio account. Safe to view; ' +
              'used by SuiteScript to address the Twilio REST API.',
        docUrl: TWILIO_CREDS_DOCS.accountSid
    }));

    items.push(buildCredentialRow(d, {
        label: 'API Key SID',
        value: snap.apiKeySid || '(not set)',
        help: 'Public identifier for the scoped API Key. Pairs with the ' +
              'secret value to authenticate REST calls.',
        docUrl: TWILIO_CREDS_DOCS.apiKeySid
    }));

    items.push(buildCredentialRow(d, {
        label: 'API Key Secret pointer',
        value: snap.apiSecretId || '(not set)',
        help: 'Script ID of the NetSuite API Secret holding the secret ' +
              'value. The actual secret stays encrypted in NetSuite ' +
              'and is never exposed to SuiteScript at runtime.',
        docUrl: TWILIO_CREDS_DOCS.apiSecret
    }));

    // Rotation runbook callout — separate visual block so admins can
    // find it quickly during a rotation event.
    items.push(buildSecretRotationRunbook(d));

    return safeNew(d.SP, {
        items: items.filter((c) => c != null),
        orientation: d.SP_Orient.VERTICAL,
        itemGap: d.SP_Gap.L
    }, 'StackPanel(credentials)');
};

// ─────────────────────────────────────────────────────────────────────
// buildCredentialRow — single label/value/help row
// ─────────────────────────────────────────────────────────────────────

const buildCredentialRow = (d: EnumsBag, spec: CredentialRowSpec): unknown => {
    const labelText = safeNew(d.T, {
        text: spec.label,
        type: d.T_Type.STRONG
    }, 'Text(cred-label)');

    // Path C-followup: Twilio docs link rendered as native component.Link
    // (inherits NetSuite blue from UIF theme), sits inline next to the
    // label. Same pattern Voice config uses for its per-field doc links.
    const docLink = spec.docUrl ? safeNew(component.Link, {
        content: 'Twilio docs ↗',
        url: spec.docUrl,
        target: component.Link.Target.BLANK
    }, 'Link(cred-doc-' + spec.label + ')') : null;

    const labelRow = docLink ? safeNew(d.SP, {
        items: [labelText, docLink].filter((c) => c != null),
        orientation: d.SP_Orient.HORIZONTAL,
        itemGap: d.SP_Gap.M,
        alignment: (d.SP.Alignment && d.SP.Alignment.CENTER) || undefined
    }, 'StackPanel(cred-label-row-' + spec.label + ')') : labelText;

    const valueText = safeNew(d.T, {
        text: spec.value,
        type: d.T_Type.DEFAULT
    }, 'Text(cred-value)');

    const helpText = safeNew(d.T, {
        text: spec.help,
        type: d.T_Type.WEAK,
        size: d.T && d.T.Size ? d.T.Size.S : undefined
    }, 'Text(cred-help)');

    const inner = safeNew(d.SP, {
        items: [labelRow, valueText, helpText].filter((c) => c != null),
        orientation: d.SP_Orient.VERTICAL,
        itemGap: d.SP_Gap.XXS
    }, 'StackPanel(cred-row-inner)');

    // Wrap each row in a ContentPanel for consistent padding with
    // the Voice section rows. (Card.content doesn't exist — recipe §21.)
    if (!d.CP) return inner;
    return safeNew(d.CP, {
        content: inner,
        outerGap: (d.CP_Gap && d.CP_Gap.M) || undefined,
        horizontalAlignment: d.CP_HAlign.STRETCH
    }, 'ContentPanel(cred-row-' + spec.label + ')') || inner;
};

// ─────────────────────────────────────────────────────────────────────
// buildSecretRotationRunbook — orange callout block, 3-step procedure
// ─────────────────────────────────────────────────────────────────────

/**
 * Rotation runbook — orange-bordered callout block with the 3-step
 * procedure. Same callout-box pattern as the Health Danger zone
 * (recipe §21: ContentPanel + rootStyle border).
 */
const buildSecretRotationRunbook = (d: EnumsBag): unknown => {
    const title = safeNew(d.H, {
        content: 'Rotating the API Key Secret',
        type: d.H_Type.SMALL_HEADING
    }, 'Heading(rotation-runbook)');

    const intro = safeNew(d.T, {
        text: 'Twilio recommends rotating API Key Secrets every 90 days. ' +
              'The rotation happens in two external systems:',
        type: d.T_Type.WEAK
    }, 'Text(rotation-intro)');

    const step1 = safeNew(d.T, {
        text: '1. In the Twilio Console, generate a new API Key Secret ' +
              '(Account > API keys & tokens > Create API key). Save the ' +
              'Secret value — Twilio shows it only once.'
    }, 'Text(rotation-step-1)');

    const step2 = safeNew(d.T, {
        text: '2. In NetSuite, navigate to Setup > Company > Preferences ' +
              '> API Secrets. Edit the secret with script ID matching ' +
              'the pointer above. Paste the new Twilio Secret value. Save.'
    }, 'Text(rotation-step-2)');

    const step3 = safeNew(d.T, {
        text: '3. Return to this console\'s Health section and click ' +
              'Re-run on Preflight to verify the new secret authenticates.'
    }, 'Text(rotation-step-3)');

    const inner = safeNew(d.SP, {
        items: [title, intro, step1, step2, step3].filter((c) => c != null),
        orientation: d.SP_Orient.VERTICAL,
        itemGap: d.SP_Gap.S
    }, 'StackPanel(rotation-inner)');

    if (!d.CP) return inner;
    return safeNew(d.CP, {
        content: inner,
        outerGap: (d.CP_Gap && d.CP_Gap.M) || undefined,
        horizontalAlignment: d.CP_HAlign.STRETCH,
        rootStyle: {
            border: '1px solid #E89C2B',
            borderRadius: '8px',
            backgroundColor: '#FDF8EE',
            padding: '16px 20px'
        }
    }, 'ContentPanel(rotation-callout)') || inner;
};
