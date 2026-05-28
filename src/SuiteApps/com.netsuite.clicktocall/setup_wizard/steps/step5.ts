// @ts-check
/**
 * Step 5 — Test & activate.
 *
 * The wizard's final step. Three branching render states:
 *   1. activated:        success message + "Go to Admin Console" button
 *   2. loading:          loader while preflight is running
 *   3. default (review): configuration review block + preflight rows +
 *                        Activate button (gated by allPassed) + Re-run
 *
 * loadStep5 fires three parallel server calls (wizardSnapshot,
 * wizardLoadAssignments, wizardRunPreflight) and rerenders ONCE when
 * all three settle — the U9 race-fix that the original commentary
 * documents in detail.
 *
 * onActivateClick fires wizardActivate, flips STATE.step5.activated
 * on success, surfaces { error, failedChecks } on failure.
 *
 * Path B.4-5 (2026-05-27) — final step extracted. Closes B.4. After
 * this commit the only step-related code in SpaClient.ts is the
 * onContinueClick dispatcher (per-step submit logic).
 */

import * as component from '@uif-js/component';
import { safeNew } from '../render/primitives';
import { STATE } from '../state';
import { wizardCall } from '../wizard_api_client';
import { buildCheckRow } from '../render/shared';
import type { EnumsBag } from '../render/shell';

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

export interface Step5Deps {
    /** Force a top-level re-render after STATE.step5 mutation. */
    rerender: () => void;
    /**
     * Navigate to the admin console. Wired to the post-activation
     * "Go to Admin Console" button. SpaClient's goToConsole flips
     * MODE='console', resets pending* flags, and triggers loadConsole.
     */
    goToConsole: () => void;
}

interface ConfigSnapshot {
    accountSid?: string;
    apiKeySid?: string;
    apiSecretId?: string;
    twimlAppSid?: string;
    phoneNumber?: string;
    intelServiceSid?: string;
}

interface PreflightCheck {
    id?: string;
    label?: string;
    status?: string;
    detail?: string;
    repairHint?: string;
}

interface AssignmentRow {
    phoneSid?: string;
}

// ─────────────────────────────────────────────────────────────────────
// buildStep5Activate — section root with 3 branching states
// ─────────────────────────────────────────────────────────────────────

export const buildStep5Activate = (d: EnumsBag, deps: Step5Deps): unknown => {
    const rows: unknown[] = [];

    rows.push(safeNew(d.H, {
        content: 'Test & activate',
        type: d.H_Type.MEDIUM_HEADING
    }, 'Heading(step5)'));

    // If activated, show success state with Continue button to
    // return to the Admin Console (otherwise the admin gets stranded
    // on Step 5 with no way back).
    if (STATE.step5.activated) {
        rows.push(safeNew(d.T, {
            text: '✓ Click-to-Call is active. Sales reps can now use ' +
                  'the phone icon on Customer, Lead, and Contact ' +
                  'records.',
            type: d.T_Type.STRONG
        }, 'Text(activated)'));

        const ButtonType = component.Button.Type;
        const consoleBtn = safeNew(component.Button, {
            label: 'Go to Admin Console',
            type: ButtonType.PRIMARY,
            action: deps.goToConsole
        }, 'Button(step5-to-console)');
        if (consoleBtn) rows.push(consoleBtn);

        return safeNew(d.SP, {
            items: rows.filter((r) => r != null),
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.M
        }, 'StackPanel(step5-activated)');
    }

    // Loading state (preflight running)
    if (STATE.step5.loading) {
        const loader = safeNew(component.Loader, {
            label: 'Running preflight checks…',
            indeterminate: true
        }, 'Loader(step5)');
        if (loader) rows.push(loader);
        return safeNew(d.SP, {
            items: rows.filter((r) => r != null),
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.M
        }, 'StackPanel(step5-loading)');
    }

    // ── Configuration review section ─────────────────────────────
    if (STATE.step5.snapshot) {
        rows.push(safeNew(d.H, {
            content: 'Configuration review',
            type: d.H_Type.SMALL_HEADING
        }, 'Heading(review)'));

        const snap = STATE.step5.snapshot as ConfigSnapshot;
        const assignments = (STATE.step5.assignments || []) as AssignmentRow[];
        const assignmentCount = assignments.length;
        const phoneNumbersWithReps: Record<string, boolean> = {};
        assignments.forEach((a) => {
            if (a.phoneSid) phoneNumbersWithReps[a.phoneSid] = true;
        });

        const lines = [
            'Account SID:        ' + (snap.accountSid || '(not set)'),
            'API Key SID:        ' + (snap.apiKeySid || '(not set)'),
            'API Key Secret:     ' + (snap.apiSecretId || '(not set)'),
            'TwiML Application:  ' + (snap.twimlAppSid || '(not set)'),
            'Default caller ID:  ' + (snap.phoneNumber || '(not set)'),
            'Intel Service:      ' + (snap.intelServiceSid || '(none)'),
            'Phone assignments:  ' + assignmentCount + ' rep(s) across ' +
                Object.keys(phoneNumbersWithReps).length + ' number(s)'
        ];
        lines.forEach((l) => {
            rows.push(safeNew(d.T, {
                text: l,
                type: d.T_Type.DEFAULT,
                size: d.T && d.T.Size ? d.T.Size.S : undefined
            }, 'Text(review-line)'));
        });
    }

    // ── Preflight checks section ─────────────────────────────────
    const preflight = (STATE.step5.preflight || null) as PreflightCheck[] | null;
    if (preflight) {
        rows.push(safeNew(d.H, {
            content: 'Preflight checks',
            type: d.H_Type.SMALL_HEADING
        }, 'Heading(preflight)'));

        preflight.forEach((check) => {
            rows.push(buildCheckRow(check as Parameters<typeof buildCheckRow>[0]));
        });
    }

    // ── Activate button ──────────────────────────────────────────
    const allPassed = preflight !== null &&
        preflight.every((c) => c.status === 'pass');

    const activateBtn = safeNew(component.Button, {
        label: allPassed ? 'Activate Click-to-Call'
                         : 'Activate Click-to-Call (fix preflight first)',
        type: component.Button.Type.PRIMARY,
        enabled: allPassed,
        action: (): void => { onActivateClick(deps); }
    }, 'Button(activate)');
    if (activateBtn) rows.push(activateBtn);

    if (STATE.step5.activateError) {
        rows.push(safeNew(d.T, {
            text: '✕ Activation failed: ' + STATE.step5.activateError,
            type: d.T_Type.STRONG
        }, 'Text(activate-error)'));
    }

    // Re-run preflight button (for transient failures)
    const rerunBtn = safeNew(component.Button, {
        label: 'Re-run preflight',
        type: component.Button.Type.DEFAULT,
        action: (): void => { loadStep5(deps); }
    }, 'Button(rerun-preflight)');
    if (rerunBtn) rows.push(rerunBtn);

    return safeNew(d.SP, {
        items: rows.filter((r) => r != null),
        orientation: d.SP_Orient.VERTICAL,
        itemGap: d.SP_Gap.M
    }, 'StackPanel(step5)');
};

// ─────────────────────────────────────────────────────────────────────
// loadStep5 — fire snapshot + assignments + preflight in parallel
// ─────────────────────────────────────────────────────────────────────

/**
 * U9 fix: previously these 3 calls fired in parallel and the
 * preflight callback was the sole rerender trigger. If
 * wizardLoadAssignments resolved AFTER wizardRunPreflight, the
 * Configuration Review rendered with `assignments === null`,
 * showing "0 rep(s) across 0 number(s)" even though saves
 * succeeded. Now: wait for ALL three to settle, then rerender
 * once with complete data.
 */
export const loadStep5 = (deps: Step5Deps): void => {
    STATE.step5.loading = true;
    STATE.step5.activateError = null;
    STATE.step5.snapshot = null;
    STATE.step5.assignments = null;
    STATE.step5.preflight = null;
    deps.rerender();

    let settled = 0;
    const onSettled = (): void => {
        settled += 1;
        if (settled >= 3) {
            STATE.step5.loading = false;
            deps.rerender();
        }
    };

    wizardCall('wizardSnapshot', {})
        .then((p) => { STATE.step5.snapshot = p && (p as { snapshot?: unknown }).snapshot; })
        .catch(() => { STATE.step5.snapshot = null; })
        .then(onSettled);

    wizardCall('wizardLoadAssignments', {})
        .then((p) => {
            const resp = p as { items?: unknown[] } | null;
            STATE.step5.assignments = (resp && resp.items) || [];
        })
        .catch(() => { STATE.step5.assignments = []; })
        .then(onSettled);

    wizardCall('wizardRunPreflight', {})
        .then((p) => {
            const resp = p as { checks?: PreflightCheck[] } | null;
            STATE.step5.preflight = (resp && resp.checks) || [];
        }).catch((e: unknown) => {
            const err = e as { message?: string };
            STATE.step5.preflight = [{
                id: 'network', label: 'Preflight call', status: 'fail',
                detail: 'Network error: ' +
                    (err && err.message ? err.message : String(e))
            }] as unknown[];
        }).then(onSettled);
};

// ─────────────────────────────────────────────────────────────────────
// onActivateClick — fire wizardActivate + handle response
// ─────────────────────────────────────────────────────────────────────

const onActivateClick = (deps: Step5Deps): void => {
    wizardCall('wizardActivate', {})
    .then((payload) => {
        const resp = payload as {
            activated?: boolean;
            error?: string;
            failedChecks?: PreflightCheck[];
        } | null;
        if (resp && resp.activated) {
            STATE.step5.activated = true;
            STATE.step5.activateError = null;
        } else {
            STATE.step5.activateError = (resp && resp.error) || 'unknown';
            if (resp && resp.failedChecks) {
                STATE.step5.preflight = resp.failedChecks as unknown[];
            }
        }
        deps.rerender();
    }).catch((e: unknown) => {
        const err = e as { message?: string };
        STATE.step5.activateError = 'Network: ' +
            (err && err.message ? err.message : String(e));
        deps.rerender();
    });
};
