// @ts-check
/**
 * Wizard API client — thin Ajax helper for the Setup Wizard's
 * Suitelet-backed JSON endpoint.
 *
 * Path B.3b (2026-05-27) — extracted from SpaClient.ts as the first
 * real Path B section extraction. No state coupling: this module is
 * a pure function over `action: string` and an optional payload.
 * It's also the first SPA module written under full TypeScript
 * checking (no `// @ts-nocheck`).
 *
 * Wire-shape:
 *   POST /app/site/hosting/scriptlet.nl?script=<id>&deploy=<id>&action=<action>
 *   Body: JSON payload
 *   Response: JSON, possibly wrapped in { status, data, responseHeaders }
 *             — extractPayload() unwraps both shapes.
 *
 * Authorization: same-origin, NetSuite session cookies carry through.
 * The Suitelet (ctc_sl_wizard_api.js) enforces its own admin gate at
 * runtime (audienceroles ignored at the deployment level per the U13a
 * SDF gotcha documented in docs/solutions/).
 */

import * as core from '@uif-js/core';

// ─────────────────────────────────────────────────────────────────────
// Endpoint URL
// ─────────────────────────────────────────────────────────────────────

/**
 * Suitelet-as-API endpoint backing the wizard SPA. Same-origin → the
 * caller's NetSuite session cookies carry through; no separate auth
 * needed. The wizard's `?action=<name>` query param dispatches to the
 * matching handler inside ctc_sl_wizard_api.js.
 *
 * Script + deployment IDs are stable across accounts because the
 * SuiteApp owns them (SDF object scriptids).
 */
export const WIZARD_API_URL =
    '/app/site/hosting/scriptlet.nl' +
    '?script=customscript_ctc_sl_wizard_api' +
    '&deploy=customdeploy_ctc_sl_wizard_api';

// ─────────────────────────────────────────────────────────────────────
// Types — wizard responses are intentionally loose at this layer.
// The Suitelet may return either an unwrapped JSON body or a wrapped
// envelope; extractPayload() handles both shapes.
// ─────────────────────────────────────────────────────────────────────

/**
 * The unwrapped payload returned by extractPayload. Wizard actions
 * each have their own response schema (e.g. `wizardSnapshot` returns
 * { active, phones, voice, ... }; `wizardActivate` returns { ok }).
 * Callers narrow this shape at their call site rather than this
 * module exporting a discriminated union — the union would balloon
 * with every new action.
 */
export type WizardPayload = Record<string, unknown> | null;

/**
 * Wrapped Ajax envelope shape that core.Ajax MIGHT return depending
 * on UIF version. The fields are all optional because not every
 * version uses every wrapper key.
 */
interface AjaxEnvelope {
    data?: unknown;
    body?: unknown;
    response?: unknown;
    responseText?: string;
    ok?: unknown;
    checks?: unknown;
    error?: unknown;
}

// ─────────────────────────────────────────────────────────────────────
// extractPayload — defensively unwrap the various shapes core.Ajax
// might return across UIF versions
// ─────────────────────────────────────────────────────────────────────

/**
 * core.Ajax may return either the parsed JSON body directly, or a
 * wrapper object like { status, statusText, data, responseHeaders }.
 * Probe both shapes so we don't care which one this UIF version uses.
 */
export const extractPayload = (response: unknown): WizardPayload => {
    if (response == null) return null;

    // Direct: response IS the parsed body. Detect by presence of
    // any of the wizard's well-known top-level keys.
    if (typeof response === 'object') {
        const env = response as AjaxEnvelope;
        if (env.ok !== undefined || env.checks !== undefined ||
            env.error !== undefined) {
            return response as WizardPayload;
        }
        // Wrapped: try common wrapper keys
        if (env.data && typeof env.data === 'object') return env.data as WizardPayload;
        if (env.body && typeof env.body === 'object') return env.body as WizardPayload;
        if (env.response && typeof env.response === 'object') return env.response as WizardPayload;
        // Sometimes the response is a string that needs re-parse
        if (typeof env.responseText === 'string') {
            try { return JSON.parse(env.responseText) as WizardPayload; }
            catch (e) { /* fall through */ }
        }
    }

    if (typeof response === 'string') {
        try { return JSON.parse(response) as WizardPayload; }
        catch (e) { return null; }
    }

    return null;
};

// ─────────────────────────────────────────────────────────────────────
// wizardCall — the canonical entry point for every wizard server-side
// action. Returns a Promise resolving to the unwrapped payload.
// ─────────────────────────────────────────────────────────────────────

/**
 * Shared Ajax helper. POSTs to the wizard API and returns the
 * unwrapped payload (or null).
 *
 * @param action  The action name routed inside ctc_sl_wizard_api.js
 *                (e.g. 'wizardSnapshot', 'wizardActivate',
 *                'wizardSaveAssignments').
 * @param payload Optional JSON body. Empty object if omitted.
 *
 * @returns Promise<WizardPayload> — the unwrapped JSON or null.
 */
export const wizardCall = (
    action: string,
    payload?: Record<string, unknown>
): Promise<WizardPayload> => {
    return core.Ajax.post(
        WIZARD_API_URL + '&action=' + action,
        payload || {},
        {
            dataType: core.Ajax.DataType.JSON,
            responseType: core.Ajax.ResponseType.JSON
        }
    ).then(extractPayload);
};
