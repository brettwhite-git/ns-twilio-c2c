// @ts-check
/**
 * @NApiVersion 2.1
 *
 * Setup Wizard v2 — SpaClient (proper props, no more guessing).
 *
 * Path B.3a (2026-05-27) — mechanical AMD → ESM TS conversion.
 * The middle 3,700+ lines of code were preserved IDENTICALLY; only
 * the AMD `define([...], function(...))` wrapper at the top and the
 * `exports.run = run; })` close at the bottom changed. This is the
 * skeleton conversion that unblocks subsequent extractions (B.3b+).
 *
 * `// @ts-nocheck` above is intentional during this skeleton commit
 * — the 3,700 lines were never type-checked (the original .js had no
 * `// @ts-check`), and turning on TS errors for 3,700 untyped lines
 * in one go would be unmanageable. Subsequent B.3 commits extract
 * code OUT of this file into properly-typed modules where the type
 * benefits accrue. The shrinking SpaClient.ts here keeps ts-nocheck
 * until B.5 minimizes it to the ~600-line entry-point shell.
 *
 * Rewrote against the actual @uif-js TypeScript definitions
 * (component.d.ts from the netsuite-uif-reference skill). Earlier
 * iterations were guessing prop names from JSX conventions. Real shapes:
 *
 *   Heading       — `content` (NOT `text`), `type: PAGE_TITLE|...`
 *   Text          — `text` (correct), `type/size/weight/color` enums
 *   StepperItem   — `label` only (description/done/disabled aren't in Options)
 *   Stepper       — `items, selectedStepIndex, orientation, descriptionGenerator`
 *                   step "done/active" is computed from selectedStepIndex
 *   ContentPanel  — `content, horizontalAlignment: STRETCH, outerGap`
 *   StackPanel    — `items, orientation, itemGap` (with own enums)
 *
 * The HTML reference at docs/architecture/setup-wizard-v2.html ships a
 * specific page layout (stepper across the top, content card below); the
 * UIF equivalent below uses StackPanel(VERTICAL) [ContentPanel-wrapped
 * Stepper, ContentPanel-wrapped step body ].
 */

import * as core from '@uif-js/core';
import * as component from '@uif-js/component';
import { wizardCall } from './services/wizardApi';
import {
    MODE, CURRENT_STEP, SELECTED_SECTION, RAIL_VISIBLE,
    setMode, setCurrentStep, setSelectedSection, setRailVisible
} from './dispatch';
import type { SectionName } from './dispatch';
import { STATE } from './state';
import { safeNew } from './components/shared/primitives';
import { buildErrorBox, buildPrereqsList } from './components/shared/shared';
import { wrapContent, buildPausedBanner } from './components/shared/shell';
import type { EnumsBag } from './components/shared/shell';
import { buildCredentialsSection } from './components/sections/credentials';
import { buildHealthSection } from './components/sections/health';
import { buildOverviewSection } from './components/sections/overview';
import { buildVoiceSection } from './components/sections/voice';
import { buildPhonesSection } from './components/sections/phones';
import { buildStep2Form } from './components/steps/step2';
import { buildStep3Form } from './components/steps/step3';
import { buildStep4Form } from './components/steps/step4';
import { buildStep5Activate } from './components/steps/step5';
import { createRouter } from './orchestration/router';
import type { Router } from './orchestration/router';
import { store } from './app/Store';

// ─────────────────────────────────────────────────────────────────────
// Local types — narrow shapes for the STATE.console payloads SpaClient
// reads. These mirror the same shapes the section + step modules cast
// to locally (sections/voice.ts VoiceSnapshot, sections/health.ts
// DriftSnapshot, etc.). State.ts itself keeps `unknown` for the loose
// server payloads so callers narrow at the boundary.
//
// Path B.5 (2026-05-27) — added when dropping `// @ts-nocheck` on
// SpaClient.ts. Each interface tracks ONE specific access pattern;
// don't expand them into "everything a snapshot could possibly hold."
// The right place for a canonical wizardSnapshot type is the server
// boundary in services/wizardApi.ts when that surface stabilizes.
// ─────────────────────────────────────────────────────────────────────

interface ConfigSnapshot {
    active?: boolean;
    accountSid?: string;
    apiKeySid?: string;
    apiSecretId?: string;
    twimlAppSid?: string;
    phoneNumber?: string;
    intelServiceSid?: string;
}

interface ServerAssignmentRow {
    phoneSid?: string;
    phoneNumber?: string;
    employeeId?: number | string;
    isPrimary?: boolean;
    label?: string;
}

interface GroupedPhoneRow {
    phoneSid: string;
    phoneNumber: string;
    employeeIds: number[];
    primaryEmployeeId: number | null;
}

interface EmployeeRow {
    id: number;
    name: string;
    email: string;
}

interface ListPayload {
    items?: unknown[];
    ok?: boolean;
    error?: string;
    errorMessage?: string;
}

interface SnapshotPayload {
    snapshot?: ConfigSnapshot;
}

interface PreflightPayload {
    checks?: unknown[];
}

interface SaveResponse {
    ok?: boolean;
    saved?: boolean;
    error?: string;
    activated?: boolean;
    failedChecks?: unknown[];
}

// 5-step flow. Mirrors lib/ctc_wizard_state.js STEPS — original
    // 6-step plan collapsed "Reps & roles" into the final "Test &
    // activate" page (which now combines review + preflight + activate
    // in one surface — see U7-collapse commit).
    var STEPS = [
        { num: 1, label: 'Prerequisites',   sub: 'Setup checks' },
        { num: 2, label: 'Connect Twilio',  sub: 'SIDs & secrets' },
        { num: 3, label: 'Voice config',    sub: 'TwiML & caller ID' },
        { num: 4, label: 'Phone numbers',   sub: 'Claim & assign' },
        { num: 5, label: 'Test & activate', sub: 'Review & go live' }
    ];
    // Path B.3c — CURRENT_STEP / MODE / SELECTED_SECTION / RAIL_VISIBLE
    // moved to ./dispatch.ts. Imported (top of file). Mutations route
    // through setMode/setCurrentStep/setSelectedSection/setRailVisible.

    // Path B.3b — WIZARD_API_URL, wizardCall, extractPayload moved
    // to ./services/wizardApi.ts. Still imported (top of file) so
    // existing in-file references stay valid.

    // Module-level mount state — scriptCtx / bodyContainer / enums
    // remain here for now. They're tightly coupled with run() + the
    // rerender helper (still in this file); will extract with the
    // render-shell module in B.3e.
    // Path D-Store-3a (2026-05-27) — scriptCtx removed. App.tsx now
    // owns the mounting model: rerenders flow through App.setState
    // (triggered via the rerenderHook callback below) rather than
    // scriptContext.setContent. This eliminates full-tree teardown on
    // every state change — UIF's PureComponent diff updates only the
    // subtrees that actually changed.
    var bodyContainer = null;      // for swapping step body
    var enums = null;              // cached enum bag from initializeApp()

    // Path D-Store-3a — rerender hook. App.tsx registers a setState
    // callback via setRerenderHook() in componentDidMount. The internal
    // rerender() function (called by loaders, handlers, etc.) invokes
    // this hook to trigger a React-like re-render. Until App mounts,
    // the hook is a no-op (state mutations are batched until the first
    // render).
    var rerenderHook: () => void = function () { /* no-op until App mounts */ };

    // Path D-1: router wired at run() time. All goToStep/goToConsole/
    // goToSection/determineLandingStep callsites read through `router!.x`
    // — the non-null assertion is sound because nothing reads router
    // until rerender() paints something, which never happens before
    // run() initializes the router.
    var router: Router | null = null;

    // Path C-9 (U8): true between mount and snapshot-routing decision.
    // While true, rerender() paints a centered Loader instead of the
    // full root tree — prevents the Step 1 stepper from flashing
    // onscreen for returning admins (whose snapshot will route them to
    // the console once the wizardSnapshot Promise resolves).
    var mountRouting = true;

    // Path B.3d — STATE moved to ./state.ts (typed interfaces per
    // step + console). 235 `STATE.X` references in this file work
    // unchanged because the import is a `const` binding — we mutate
    // properties (STATE.console.foo = bar), never the binding itself.

    // Path B.3b — wizardCall moved to ./services/wizardApi.ts.

    /**
     * Path D-Store-3a — register App's setState-driven rerender callback.
     * Called from App.componentDidMount. Until this fires, the internal
     * rerender() function below is a no-op (which is fine since App
     * isn't mounted yet — there's nothing to re-render).
     */
    export function setRerenderHook(fn: () => void): void {
        rerenderHook = fn;
    }

    /**
     * Path D-Store-3a — formerly `run(scriptContext)`. App.componentDidMount
     * calls this to kick off the wizardSnapshot + resumability routing
     * flow. The setLayout/setContent calls moved to SpaClient.tsx (the
     * 5-line entry point); App.render() returns whatever renderRoot()
     * produces, which UIF diffs and mounts.
     */
    export function initializeApp(): void {
        try {
            // Resolve enums from the actual classes (verified against d.ts).
            // UIF v9.0.0 type catalog guarantees all of these — the
            // pre-catalog `&& || {}` defensive pattern is dead defense.
            var SP    = component.StackPanel;
            var CP    = component.ContentPanel;
            var H     = component.Heading;
            var T     = component.Text;
            var Stp   = component.Stepper;
            var SI    = component.StepperItem;
            var ND    = component.NavigationDrawer;
            var GP    = component.GridPanel;
            var Bn    = component.Banner;
            var Cd    = component.Card;
            var Tb    = component.ToolBar;
            var Sp    = component.ScrollPanel;
            var DG    = component.DataGrid;
            var TC    = component.TemplatedColumn;
            var MDC   = component.MultiselectDropdownColumn;
            var Bdg   = component.Badge;
            var Ads   = core.ArrayDataSource;

            var SP_Orient = SP.Orientation;
            var SP_Gap    = SP.GapSize;
            var CP_Gap    = CP.GapSize;
            var CP_HAlign = CP.HorizontalAlignment;
            var H_Type    = H.Type;
            var T_Type    = T.Type;
            // Stepper.Orientation aliases StepperItem.Orientation per d.ts.
            var Stp_Orient = Stp.Orientation;
            var Bn_Color  = Bn.Color;
            var GP_Gap    = GP.GapSize;
            // SystemIcon for NavigationDrawer item icons. Without these
            // the drawer falls back to a first-letter monogram.
            var SysIcon = core.SystemIcon;

            enums = {
                SP: SP, CP: CP, H: H, T: T, Stp: Stp, SI: SI,
                ND: ND, GP: GP, Bn: Bn, Cd: Cd, Tb: Tb,
                Sp: Sp,
                DG: DG, TC: TC, MDC: MDC, Bdg: Bdg, Ads: Ads,
                SP_Orient: SP_Orient,
                SP_Gap: SP_Gap,
                CP_Gap: CP_Gap,
                CP_HAlign: CP_HAlign,
                H_Type: H_Type,
                T_Type: T_Type,
                Stp_Orient: Stp_Orient,
                Bn_Color: Bn_Color,
                GP_Gap: GP_Gap,
                SysIcon: SysIcon
            };
            // Path D-1: wire the router. Deps point at the still-local
            // loadConsole / loadPhonesData / loadPrereqs (to be extracted
            // in D-2 / D-3); STEPS.length supplies the clamp upper bound
            // for goToStep so router.ts doesn't need to import the
            // STEPS catalog (which still lives here for shell-builders).
            router = createRouter({
                rerender: rerender,
                loadConsole: loadConsole,
                loadPhonesData: loadPhonesData,
                loadPrereqs: loadPrereqs,
                totalSteps: STEPS.length
            });

            // Path D-Store-2: subscribe rerender to the Store. Every
            // dispatched action (setMode / setCurrentStep / etc) now
            // triggers a reducer update, which fires this callback. The
            // dispatch.ts adapter's own subscribe callback runs first
            // (registered at module-import time, before this one) to
            // update the export-let bindings; this one runs after to
            // paint the new tree.
            //
            // Note: until D-Store-3 migrates STATE.console into the Store,
            // STATE-mutation paths (loadConsole, onPhonesRowSelectionChanged,
            // etc.) still call rerender() explicitly. Those callsites are
            // unchanged here — the Store-driven rerender is additive and
            // harmless (worst case: one extra setContent on a setX call
            // that was already followed by an explicit rerender).
            store.subscribe(() => rerender());

            // Path D-Store-3a — setLayout('application') call moved to
            // SpaClient.tsx (the 5-line entry point), where it has
            // access to the scriptContext object that this function
            // no longer receives.

            // Path C-9 (U8) fix: previously this called rerender() +
            // loadPrereqs() immediately, which painted Step 1 stepper
            // onscreen BEFORE the snapshot resolved. For returning
            // admins (snapshot.active === true), Step 1 would briefly
            // flash before goToConsole() flipped MODE='console' and
            // re-rendered. Visual regression for the most common case.
            //
            // New mount flow:
            //   1. rerender() paints a centered Loader (mountRouting=true
            //      bypasses buildRoot inside rerender)
            //   2. Fire wizardSnapshot
            //   3. On resolve: route via determineLandingStep
            //      - 'console' → goToConsole (sets mountRouting=false)
            //      - 1..5      → goToStep + loadPrereqs if Step 1
            //   4. On reject (or no snapshot — fresh install):
            //      stay at Step 1 → fire loadPrereqs() + clear flag
            rerender();  // paints Loader because mountRouting=true

            wizardCall('wizardSnapshot', {}).then(function (payload) {
                var resp = payload as SnapshotPayload | null;
                var snap = (resp && resp.snapshot) as ConfigSnapshot | null;
                if (!snap) {
                    // Fresh install — fall through to Step 1.
                    mountRouting = false;
                    rerender();
                    loadPrereqs();
                    return;
                }
                var target = router!.determineLandingStep(snap);
                mountRouting = false;
                if (target === 'console') {
                    console.log('[CTC Setup Wizard] resumability — routing to Admin Console');
                    router!.goToConsole();
                } else {
                    console.log('[CTC Setup Wizard] resumability — routing to step ' + target);
                    router!.goToStep(target);  // fires per-step loader internally
                }
            }).catch(function (e) {
                console.warn('[CTC Setup Wizard] resumability snapshot ' +
                    'failed; falling back to Step 1:', e);
                mountRouting = false;
                rerender();
                loadPrereqs();
            });
        } catch (e) {
            console.error("[CTC Setup Wizard] initializeApp() threw:", e);
        }
    }

    // Path D-1: determineLandingStep / goToStep / goToConsole / goToSection
    // moved to ./orchestration/router.ts. Wired in run() and called
    // through `router!.x`.

    /**
     * Path D-Store-3a — trigger a re-render via App's setState.
     * Internal callers (loaders, handlers, router) call this after
     * mutating state. The actual render tree is computed by
     * renderRoot() below, called from App.render().
     *
     * Previously this function called scriptCtx.setContent(buildRoot())
     * directly — full-tree teardown on every state change. Now it just
     * notifies App, which calls setState and re-evaluates render().
     * UIF's PureComponent diff updates only subtrees that actually
     * changed, preserving focus / scroll / input transients.
     */
    function rerender() {
        try {
            rerenderHook();
        } catch (e) {
            console.error("[CTC Setup Wizard] rerender hook threw:", e);
        }
    }

    /**
     * Path D-Store-3a — compute what App should render right now.
     * Called from App.render() on every store-triggered or
     * hook-triggered re-render. Returns either a Loader (during
     * mount-routing) or the full root tree.
     *
     * Path C-9 (U8): while the snapshot is still resolving on mount,
     * paint a centered Loader instead of the full root tree. Without
     * this, the default CURRENT_STEP=1 causes Step 1 stepper to flash
     * onscreen before goToConsole / goToStep redirects returning admins.
     */
    export function renderRoot(): unknown {
        if (!enums) {
            // Should not happen — initializeApp populates enums before
            // App mounts — but defensive return prevents crashes.
            return null;
        }
        try {
            if (mountRouting) {
                var loader = safeNew(component.Loader, {
                    label: 'Loading…',
                    indeterminate: true
                }, 'Loader(mount-routing)');
                var loaderRoot = safeNew(enums.CP, {
                    content: loader,
                    horizontalAlignment: enums.CP_HAlign.CENTER,
                    outerGap: enums.CP_Gap.XL
                }, 'ContentPanel(mount-routing)') || loader;
                return loaderRoot;
            }
            console.log("[CTC Setup Wizard] renderRoot — step " + CURRENT_STEP);
            return buildRoot(enums);
        } catch (e) {
            console.error("[CTC Setup Wizard] renderRoot threw:", e);
            return null;
        }
    }

    /**
     * U1 (Phase 3a): once-per-mount data load for the console. Fetches
     * snapshot + assignments + preflight in parallel; activity feed is
     * Phase 3c (U8) so it stays null until that lands.
     *
     * Settled-counter pattern (mirrors loadStep5 per U9 race-fix) so
     * sections never render with half-loaded data.
     */
    function loadConsole() {
        STATE.console.loading = true;
        STATE.console.snapshot = null;
        STATE.console.assignments = null;
        STATE.console.preflight = null;
        STATE.console.recentCalls = null;
        STATE.console.drift = null;
        rerender();

        var settled = 0;
        // U3 fix: preload employees alongside snapshot/assignments/preflight
        // so the Phones DataGrid has them available on first render. Earlier
        // lazy-load on goToSection('phones') created a timing race where the
        // DataGrid's widgetOptions ran BEFORE employees resolved → chips
        // initialized with selectedItems=[] and never recovered on subsequent
        // renders.
        // Path C-3 (revised) — TARGET bumped from 4 → 5 to include the new
        // wizardListRecentCalls fetch powering the Overview "Recent calls"
        // DataGrid. Same settled-counter pattern; no race risk.
        var TARGET = 5;
        function onSettled() {
            settled += 1;
            if (settled >= TARGET) {
                STATE.console.drift = computeDrift(STATE.console.snapshot,
                                                   STATE.console.assignments);
                STATE.console.loading = false;
                rerender();
            }
        }

        wizardCall('wizardSnapshot', {})
            .then(function (p) {
                var resp = p as SnapshotPayload | null;
                STATE.console.snapshot = (resp && resp.snapshot) || null;
            })
            .catch(function () { STATE.console.snapshot = null; })
            .then(onSettled);

        wizardCall('wizardLoadAssignments', {})
            .then(function (p) {
                var resp = p as ListPayload | null;
                STATE.console.assignments = (resp && resp.items) || [];
                STATE.console.phonesByPhone =
                    groupAssignmentsByPhone(STATE.console.assignments as ServerAssignmentRow[]);
            })
            .catch(function () {
                STATE.console.assignments = [];
                STATE.console.phonesByPhone = [];
            })
            .then(onSettled);

        wizardCall('wizardRunPreflight', {})
            .then(function (p) {
                var resp = p as PreflightPayload | null;
                STATE.console.preflight = (resp && resp.checks) || [];
            })
            .catch(function () { STATE.console.preflight = []; })
            .then(onSettled);

        // Path C-3 (revised) — Overview Recent calls feed. Fetched in
        // parallel with the other 4 loads; settled-counter waits for all 5.
        wizardCall('wizardListRecentCalls', { limit: 10 })
            .then(function (p) {
                var resp = p as ListPayload | null;
                STATE.console.recentCalls = (resp && resp.items) || [];
            })
            .catch(function () { STATE.console.recentCalls = []; })
            .then(onSettled);

        wizardCall('wizardListEmployees', {})
            .then(function (p) {
                var resp = p as ListPayload | null;
                var items = (resp && resp.items) || [];
                STATE.console.phonesEmployees = items.map(function (e) {
                    var emp = e as { id?: number | string; name?: string; email?: string };
                    return {
                        id: Number(emp.id),
                        name: emp.name || '(no name)',
                        email: emp.email || ''
                    } as EmployeeRow;
                });
            })
            .catch(function () { STATE.console.phonesEmployees = []; })
            .then(onSettled);
    }

    /**
     * U1 (Phase 3a): client-side drift detection. Placeholder for U6 —
     * full live-Twilio comparison requires snapshot to include voiceUrl,
     * which is a Phase 3b enhancement to wizardSaveVoice. For now this
     * returns a coarse shape that the Health section can render against.
     */
    function computeDrift(snapshot: ConfigSnapshot | null | unknown,
                          _assignments: unknown[] | null): {
        phoneNumbers: string; voiceUrl: string; intelService: string;
    } {
        // Defensive default — if data is missing, no drift can be computed.
        if (!snapshot) return { phoneNumbers: 'unknown', voiceUrl: 'unknown',
                                intelService: 'unknown' };
        var snap = snapshot as ConfigSnapshot;
        // Phone numbers: live comparison happens in U6 when Phones section
        // also fires wizardListPhoneNumbers. For now mark 'in-sync' so the
        // section can render; U6 swaps this in for the real check.
        return {
            phoneNumbers: 'in-sync',
            voiceUrl: 'in-sync',
            intelService: snap.intelServiceSid ? 'in-sync' : 'not-configured'
        };
    }

    /**
     * U3 bugfix: backend wizardLoadAssignments returns FLAT rows — one
     * per (phone, employee) pair. The DataGrid needs ONE row per phone
     * with all employeeIds collected. This helper groups by phoneSid.
     *
     * Input:  [{phoneSid, phoneNumber, employeeId, isPrimary}, ...]
     * Output: [{phoneSid, phoneNumber, employeeIds: [...], primaryEmployeeId}]
     */
    function groupAssignmentsByPhone(flatRows: ServerAssignmentRow[] | null): GroupedPhoneRow[] {
        var grouped: Record<string, GroupedPhoneRow> = {};
        (flatRows || []).forEach(function (r) {
            if (!r.phoneSid) return;
            if (!grouped[r.phoneSid]) {
                grouped[r.phoneSid] = {
                    phoneSid: r.phoneSid,
                    phoneNumber: r.phoneNumber || '',
                    employeeIds: [],
                    primaryEmployeeId: null
                };
            }
            var bucket = grouped[r.phoneSid];
            // Normalize: server may return ID as string OR number; persist
            // as Number for stable comparison + dedupe.
            var empId = Number(r.employeeId);
            if (empId && bucket.employeeIds.indexOf(empId) === -1) {
                bucket.employeeIds.push(empId);
            }
            if (r.isPrimary && !bucket.primaryEmployeeId) {
                bucket.primaryEmployeeId = empId;
            }
        });
        // Ensure primaryEmployeeId always points at the first employee if
        // server didn't flag one (defensive — should be set per save).
        Object.keys(grouped).forEach(function (sid) {
            var b = grouped[sid];
            if (!b.primaryEmployeeId && b.employeeIds.length > 0) {
                b.primaryEmployeeId = b.employeeIds[0];
            }
        });
        return Object.keys(grouped).map(function (sid) { return grouped[sid]; });
    }

    /**
     * U3: lazy-load Phones-section's Twilio phone list (used by the
     * "Add phone number" Modal for unassigned-picker). Employees are
     * pre-loaded in loadConsole so they're available for the DataGrid
     * widgetOptions on first render.
     */
    function loadPhonesData() {
        STATE.console.phonesLoading = true;
        STATE.console.phonesError = null;
        rerender();

        wizardCall('wizardListPhoneNumbers', {})
            .then(function (p) {
                var resp = p as ListPayload | null;
                STATE.console.phonesNumbers = (resp && resp.items) || [];
            })
            .catch(function (e: unknown) {
                var err = e as { message?: string };
                STATE.console.phonesNumbers = [];
                STATE.console.phonesError = 'Could not load phone numbers: ' +
                    (err && err.message ? err.message : String(e));
            })
            .then(function () {
                STATE.console.phonesLoading = false;
                rerender();
            });
    }

    /**
     * U3: persist a single row's rep-assignment change. Operates on the
     * grouped STATE.console.phonesByPhone (one row per phone). Optimistic
     * UI update happens before this fires; we send all rows to the
     * server (which reconciles by deleting + recreating per phoneSid).
     *
     * On failure, reload assignments and re-group to revert.
     */
    function onPhonesRowSelectionChanged(phoneSid: string, newEmployeeIds: number[]) {
        STATE.console.phonesSaving[phoneSid] = true;
        STATE.console.phonesError = null;

        // Optimistic: mutate the grouped row in place.
        var grouped = (STATE.console.phonesByPhone || []) as GroupedPhoneRow[];
        for (var i = 0; i < grouped.length; i++) {
            if (grouped[i].phoneSid === phoneSid) {
                grouped[i].employeeIds = newEmployeeIds;
                var current = grouped[i].primaryEmployeeId;
                if (!current || newEmployeeIds.indexOf(current) === -1) {
                    grouped[i].primaryEmployeeId = newEmployeeIds.length > 0
                        ? newEmployeeIds[0] : null;
                }
                break;
            }
        }
        rerender();

        var payload = {
            assignments: grouped.map(function (g) {
                return {
                    phoneSid: g.phoneSid,
                    phoneNumber: g.phoneNumber || '',
                    employeeIds: g.employeeIds || [],
                    primaryEmployeeId: g.primaryEmployeeId || null
                };
            })
        };

        wizardCall('wizardSaveAssignments', payload)
            .then(function (resp) {
                var r = resp as SaveResponse | null;
                STATE.console.phonesSaving[phoneSid] = false;
                if (!r || r.ok === false || r.error) {
                    STATE.console.phonesError =
                        'Save failed: ' + ((r && r.error) || 'unknown');
                    // Revert via fresh load.
                    wizardCall('wizardLoadAssignments', {}).then(function (p2) {
                        var r2 = p2 as ListPayload | null;
                        STATE.console.assignments = (r2 && r2.items) || [];
                        STATE.console.phonesByPhone =
                            groupAssignmentsByPhone(STATE.console.assignments as ServerAssignmentRow[]);
                        rerender();
                    });
                }
                rerender();
            })
            .catch(function (e: unknown) {
                var err = e as { message?: string };
                STATE.console.phonesSaving[phoneSid] = false;
                STATE.console.phonesError = 'Network: ' +
                    (err && err.message ? err.message : String(e));
                rerender();
            });
    }

    /**
     * U6: deactivate handler. Two-click confirm pattern. Unlike U11's
     * original — does NOT bounce to stepper on success; stays on the
     * console with isPaused state per R7 (the plan).
     *
     * Path C-4 fix: when priming the confirm flag for the first time,
     * navigate to Health section so the Cancel/Confirm buttons in the
     * danger zone are visible. Without this, callers from other
     * sections (Overview's Quick action) hit the priming branch
     * silently — the flag flips but the user can't see the resulting
     * UI change, so the button appears to require two clicks before
     * "doing anything."
     *
     * Cannot just call goToSection('health') — that explicitly RESETS
     * pendingDeactivateConfirm to false as its standard "cancel pending
     * on nav" behavior. Inline the nav steps in the right order: set
     * the flag, then setSelectedSection + setMode + rerender (without
     * touching pendingDeactivateConfirm).
     */
    function onDeactivateClick() {
        if (!STATE.console.pendingDeactivateConfirm) {
            STATE.console.pendingDeactivateConfirm = true;
            STATE.console.actionError = null;
            if (SELECTED_SECTION !== 'health') {
                setSelectedSection('health');
                if (MODE === 'stepper') setMode('console');
            }
            rerender();
            return;
        }
        STATE.console.deactivateError = null;
        wizardCall('wizardActivate', { deactivate: true })
            .then(function (payload) {
                var resp = payload as { deactivated?: boolean; error?: string } | null;
                if (resp && resp.deactivated) {
                    // R7: stay on console; flip snapshot.active so paused
                    // banner renders. Reload snapshot to confirm server state.
                    STATE.console.pendingDeactivateConfirm = false;
                    if (STATE.console.snapshot) {
                        (STATE.console.snapshot as ConfigSnapshot).active = false;
                    }
                    rerender();
                } else {
                    STATE.console.deactivateError =
                        (resp && resp.error) || 'unknown_error';
                    rerender();
                }
            })
            .catch(function (e: unknown) {
                var err = e as { message?: string };
                STATE.console.deactivateError = 'Network: ' +
                    (err && err.message ? err.message : String(e));
                rerender();
            });
    }

    /**
     * U7 (Phase 3b — implemented in U6 stub for now): reactivate from the
     * paused banner. Same handler runs on first click — no confirm needed
     * since reactivation is non-destructive.
     */
    function onReactivateClick() {
        STATE.console.actionError = null;
        wizardCall('wizardActivate', {})
            .then(function (payload) {
                var resp = payload as {
                    activated?: boolean;
                    alreadyActive?: boolean;
                    error?: string;
                    failedChecks?: unknown[];
                } | null;
                if (resp && (resp.activated || resp.alreadyActive)) {
                    if (STATE.console.snapshot) {
                        (STATE.console.snapshot as ConfigSnapshot).active = true;
                    }
                    rerender();
                } else {
                    STATE.console.actionError =
                        (resp && resp.error) || 'reactivate_failed';
                    if (resp && resp.failedChecks) {
                        STATE.console.preflight = resp.failedChecks;
                    }
                    rerender();
                }
            })
            .catch(function (e: unknown) {
                var err = e as { message?: string };
                STATE.console.actionError = 'Network: ' +
                    (err && err.message ? err.message : String(e));
                rerender();
            });
    }

    /**
     * Call the wizardPrereqs action and swap the body content with
     * the rendered check rows when the response arrives.
     */
    function loadPrereqs() {
        if (!bodyContainer) {
            console.warn("[CTC Setup Wizard] bodyContainer missing — " +
                "cannot render prereqs");
            return;
        }
        console.log("[CTC Setup Wizard] Calling wizardPrereqs...");
        wizardCall('wizardPrereqs', {}).then(function (payload) {
            var resp = payload as {
                ok?: boolean;
                checks?: unknown[];
                error?: string;
            } | null;
            var body: unknown;
            if (resp && resp.ok && resp.checks) {
                // Wrap prereqs list with the nav footer so Continue button
                // sits below the rows. Since loadPrereqs runs ONLY on
                // initial Step 1 mount, we re-render the whole tree to
                // pick up the new body.
                body = buildPrereqsList(resp.checks as Parameters<typeof buildPrereqsList>[0]);
            } else if (resp && resp.error) {
                body = buildErrorBox(resp.error);
            } else {
                body = buildErrorBox('unexpected response shape — see console');
            }

            // Compose body + nav footer so the Continue button is visible.
            var stack = safeNew(component.StackPanel, {
                items: [body, buildNavFooter(enums)]
                    .filter(function (c) { return c != null; }),
                orientation: component.StackPanel.Orientation.VERTICAL,
                itemGap: component.StackPanel.GapSize.L
            }, "StackPanel(prereqs+footer)") || body;

            try { bodyContainer.setContent(stack); }
            catch (e) {
                console.error("[CTC Setup Wizard] bodyContainer.setContent " +
                    "failed:", e);
            }
        }).catch(function (err) {
            console.error("[CTC Setup Wizard] wizardPrereqs Ajax failed:", err);
            try {
                bodyContainer.setContent(buildErrorBox(
                    'Network or server error calling wizardPrereqs — ' +
                    'check browser DevTools Network tab and the NetSuite ' +
                    'Script Execution Log for details.'));
            } catch (e) { /* ignore */ }
        });
    }

    function buildRoot(d: EnumsBag) {
        // U1.5: rail-visible layout when MODE='console' OR when admin
        // has previously reached the console and is now in re-run-wizard
        // stepper mode. Fresh install (never activated) drops the rail
        // and renders the original full-page stepper.
        var railVisible = MODE === 'console' ||
                          (MODE === 'stepper' && RAIL_VISIBLE);

        if (railVisible) {
            var drawer = buildConsoleNavDrawer(d);
            var contentPane = buildRailContentPane(d);
            var rootChildren = [drawer, contentPane]
                .filter(function (c) { return c != null; });

            if (d.GP && rootChildren.length === 2) {
                // CSS-grid:
                //   columns: 'auto 1fr' — rail column auto-sizes to the
                //     NavigationDrawer's actual rendered width.
                //   rows: '100%' — fill the SPA's outer container
                //     completely. Works because we called
                //     scriptContext.setLayout('application') in run()
                //     (UIF catalog Integration > SuiteApps > Code tips
                //     > Layout) — that flips the SPA from default
                //     'natural' (content-sized) to 'application'
                //     (viewport-bounded). Without setLayout the SPA
                //     container is auto-height and 100% collapses to
                //     content height.
                //   columnGap: NONE — drawer flush against content.
                var GP_Gap = d.GP_Gap || (d.GP && d.GP.GapSize) || {};
                var rootGrid = safeNew(d.GP, {
                    columns: 'auto 1fr',
                    rows: '100%',
                    items: rootChildren,
                    columnGap: GP_Gap.NONE
                }, "GridPanel(root-rail)");
                if (rootGrid) return rootGrid;
            }
            // Fallback: vertical stack of [drawer, content] (loses rail
            // alignment but stays functional).
            return safeNew(d.SP, {
                items: rootChildren,
                orientation: d.SP_Orient.VERTICAL,
                itemGap: d.SP_Gap.M
            }, "StackPanel(root-rail-fallback)") || rootChildren[0];
        }

        // ── Page title (Heading uses `content`, not `text`) ─────────────
        var title = safeNew(d.H, {
            content: "Click-to-Call Setup Wizard",
            type: d.H_Type.PAGE_TITLE
        }, "Heading(title)");

        var subtitle = safeNew(d.T, {
            text: "Step " + CURRENT_STEP + " of " + STEPS.length + " — " +
                STEPS[CURRENT_STEP - 1].label
        }, "Text(subtitle)");

        // ── Stepper (full-width, horizontal) ────────────────────────────
        var stepper = buildStepper(d);

        // Wrap stepper in a STRETCH-aligned ContentPanel so it fills the
        // page width (fix for the overlapping-labels issue: items got
        // tiny widths because the Stepper container itself was narrow).
        var stepperBox = null;
        if (stepper) {
            stepperBox = safeNew(d.CP, {
                content: stepper,
                horizontalAlignment: d.CP_HAlign.STRETCH,
                outerGap: d.CP_Gap.M
            }, "ContentPanel(stepper, STRETCH)") || stepper;
        }

        // ── Step body — buildStepBody is async (Ajax call) ──────────────
        //   Initial render shows a Loader; the Ajax response replaces it
        //   via the body container's setContent post-mount.
        var bodyBox = buildStepBodyContainer(d);

        // ── Outer vertical stack ────────────────────────────────────────
        var children = [title, subtitle, stepperBox, bodyBox]
            .filter(function (c) { return c != null; });

        var stack = safeNew(d.SP, {
            items: children,
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.L
        }, "StackPanel(outer)");

        if (!stack) return title || subtitle;

        // Wrap outer stack in a top-level ContentPanel for page padding +
        // STRETCH so it fills the available width.
        var page = safeNew(d.CP, {
            content: stack,
            horizontalAlignment: d.CP_HAlign.STRETCH,
            outerGap: d.CP_Gap.L
        }, "ContentPanel(page)");

        return page || stack;
    }

    /**
     * Custom step indicator built from primitives (Badge + Text +
     * StackPanel) rather than the UIF Stepper component.
     *
     * Background: 3 separate attempts to use component.Stepper produced
     * a silent-invisible result — no console errors, no exception, no
     * pixels. The Stepper.Options API (with `children`, `index`,
     * `descriptionGenerator`) appeared to construct cleanly but the
     * component never appeared in the DOM. Rather than spend more
     * cycles debugging an opaque component, we build the step strip
     * from documented primitives that demonstrably render.
     *
     * Structure per step:
     *   StackPanel(VERTICAL, alignment=CENTER, gap=XS) [
     *     Badge(content="1"|"2"|...|"✓", type=SOLID|SUBTLE),
     *     Text(label, type=STRONG when current, else DEFAULT),
     *     Text(sublabel, type=WEAK, size=S)
     *   ]
     *
     * Outer container:
     *   StackPanel(HORIZONTAL, justification=SPACE_BETWEEN, gap=M)
     */
    // Path B.3b — extractPayload moved to ./services/wizardApi.ts.

    /* ────────────────────────────────────────────────────────────────── */
    /* U11 — Admin Console (post-activation surface)                      */
    /* ────────────────────────────────────────────────────────────────── */

    /**
     * U1.5: rail-mode content pane. Renders the right side of the
     * GridPanel(root-rail) — title + mode-specific content (console
     * sections OR stepper). Wrapped in a ContentPanel with padding so
     * content is offset from the drawer's flush-left edge.
     *
     * Mode-driven content:
     *   - MODE='console':  title + paused banner + section content
     *   - MODE='stepper':  title + subtitle + stepper + step body + nav footer
     */
    function buildRailContentPane(d: EnumsBag) {
        if (STATE.console.loading && MODE === 'console') {
            var loader = safeNew(component.Loader, {
                label: "Loading console…",
                indeterminate: true
            }, "Loader(console)");
            return wrapContent(d, loader || safeNew(d.T, { text: "Loading…" }, "Text(loading)"));
        }

        var items = [];

        // ── Title (Path C-8: native ApplicationHeader) ────────────────
        // Replaces the previous single Heading.PAGE_TITLE block with
        // component.ApplicationHeader, which natively supports a title
        // + subtitle pair plus future-proof slots (actions, tools, badge).
        // The subtitle reflects the active console section OR stepper
        // step so every screen carries a "where am I" label without
        // each section having to ship its own header.
        //
        // Stepper mode's previous "Text(rail-subtitle)" Text block is
        // dropped — the same content now rides in ApplicationHeader's
        // subtitle slot.
        var titleText = MODE === 'console'
            ? "Click-to-Call Admin Console"
            : "Click-to-Call Setup Wizard";

        var subtitleText: string;
        if (MODE === 'console') {
            subtitleText =
                SELECTED_SECTION === 'phones'      ? 'Phones & reps' :
                SELECTED_SECTION === 'voice'       ? 'Voice config' :
                SELECTED_SECTION === 'credentials' ? 'Credentials' :
                SELECTED_SECTION === 'health'      ? 'Health' :
                                                     'Overview';
        } else {
            subtitleText = 'Step ' + CURRENT_STEP + ' of ' + STEPS.length +
                ' — ' + STEPS[CURRENT_STEP - 1].label;
        }

        var appHeader = safeNew(component.ApplicationHeader, {
            title: titleText,
            subtitle: subtitleText
        }, 'ApplicationHeader(page-root)') || safeNew(d.H, {
            content: titleText,
            type: d.H_Type.PAGE_TITLE
        }, 'Heading(content-title-fallback)');
        if (appHeader) items.push(appHeader);

        // ── Paused banner (console mode only) ─────────────────────────
        if (MODE === 'console' && STATE.console.snapshot
            && (STATE.console.snapshot as ConfigSnapshot).active === false) {
            var paused = buildPausedBanner(d, onReactivateClick);
            if (paused) items.push(paused);
        }

        // ── Mode-specific body ────────────────────────────────────────
        if (MODE === 'console') {
            var section = buildSectionContent(d);
            if (section) items.push(section);
        } else {
            // Stepper mode (re-run flow). The "Step N of 5 — …"
            // subtitle is now in ApplicationHeader; render the stepper
            // widget + step body without re-stating it.
            var stepperWidget = buildStepper(d);
            if (stepperWidget) {
                var stepperBox = safeNew(d.CP, {
                    content: stepperWidget,
                    horizontalAlignment: d.CP_HAlign.STRETCH,
                    outerGap: d.CP_Gap.M
                }, "ContentPanel(rail-stepper)") || stepperWidget;
                items.push(stepperBox);
            }

            var stepBody = buildStepBodyContainer(d);
            if (stepBody) items.push(stepBody);
        }

        if (items.length === 0) {
            return wrapContent(d, safeNew(d.T, {
                text: "Admin Console — no content rendered."
            }, "Text(console-empty)"));
        }

        var stack = safeNew(d.SP, {
            items: items,
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.L
        }, "StackPanel(rail-content)");

        return wrapContent(d, stack || items[0]);
    }

    /**
     * U1: NavigationDrawer with grouped items. Per d.ts (component.d.ts:13874+),
     * ItemOptions supports nested `items`, badges, separators, and a
     * per-item `action` callback. Our items use `value` for selection
     * tracking + `action` for the rare "fire-and-forget" item (Re-run
     * wizard); the section items rely on onSelectedValueChanged at the
     * drawer level.
     */
    function buildConsoleNavDrawer(d: EnumsBag) {
        if (!d.ND) {
            // No NavigationDrawer — fall back to a vertical button list.
            return buildNavFallback(d);
        }

        var assignmentBadge = STATE.console.assignments
            ? String(STATE.console.assignments.length)
            : null;

        var SysIcon = d.SysIcon || {};
        var navItems = [
            { value: 'overview',    label: 'Overview',          icon: SysIcon.HOME },
            { value: 'phones',      label: 'Phones & reps',     icon: SysIcon.CALL,
              badge: assignmentBadge || undefined },
            { value: 'voice',       label: 'Voice config',      icon: SysIcon.SETTINGS },
            { value: 'credentials', label: 'Credentials',       icon: SysIcon.LOCK },
            { value: 'health',      label: 'Health',            icon: SysIcon.HEART_FILLED },
            { value: 're-run',      label: 'Re-run wizard',     icon: SysIcon.REFRESH,
              separatorTop: true,
              action: function () { router!.goToStep(1); } }
        ];

        // U1.5: in stepper mode (re-run flow), highlight the "Re-run
        // wizard" item; in console mode, highlight the active section.
        var selectedVal = MODE === 'stepper' ? 're-run' : SELECTED_SECTION;

        // U1.5-polish: NavigationDrawer's `visualStyle` prop accepts
        // .DARK to render the rail in NetSuite's classic navy theme
        // (matches the dark top-bar visual language). Per the catalog's
        // /navigationdrawer/Background example. The enum lives on
        // NavigationDrawer.VisualStyle: DEFAULT | LIGHT | DARK.
        var VisualStyle = (d.ND && d.ND.VisualStyle) || {};

        return safeNew(d.ND, {
            items: navItems,
            selectedValue: selectedVal,
            width: 240,
            visualStyle: VisualStyle.DARK,
            onSelectedValueChanged: function (args: { value?: string }) {
                var value = args && args.value;
                if (!value) return;
                if (value === 're-run') {
                    // Re-run wizard click — fire the goToStep action.
                    router!.goToStep(1);
                    return;
                }
                // Section click — flips MODE='console' and sets the
                // active section (works whether admin was in console
                // or stepper mode). NavigationDrawer items are owned by
                // buildConsoleNavDrawer with a constrained value-space
                // (the SectionName union); the cast is safe.
                router!.goToSection(value as SectionName);
            }
        }, "NavigationDrawer(console)");
    }

    /**
     * Fallback nav when NavigationDrawer isn't available — vertical
     * StackPanel of Buttons. Same routing semantics; ugly but functional.
     */
    function buildNavFallback(d: EnumsBag) {
        // component.Button.Type guaranteed by UIF v9.0.0 type catalog.
        var ButtonType = component.Button.Type;
        var navSpecs: { value: SectionName | 're-run'; label: string }[] = [
            { value: 'overview',    label: 'Overview' },
            { value: 'phones',      label: 'Phones & reps' },
            { value: 'voice',       label: 'Voice config' },
            { value: 'credentials', label: 'Credentials' },
            { value: 'health',      label: 'Health' },
            { value: 're-run',      label: '↻ Re-run wizard' }
        ];
        var buttons = navSpecs.map(function (spec) {
            return safeNew(component.Button, {
                label: spec.label,
                type: spec.value === SELECTED_SECTION
                    ? ButtonType.PRIMARY
                    : ButtonType.DEFAULT,
                action: function () {
                    if (spec.value === 're-run') router!.goToStep(1);
                    else router!.goToSection(spec.value);
                }
            }, "Button(nav-" + spec.value + ")");
        }).filter(function (b) { return b != null; });
        if (buttons.length === 0) return null;
        return safeNew(d.SP, {
            items: buttons,
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.XS
        }, "StackPanel(nav-fallback)");
    }

    /**
     * U1: dispatch to the appropriate section builder. The paused-state
     * banner is rendered once at the page-shell level (above the title),
     * NOT here — keeps the banner above every section without per-
     * section code.
     */
    function buildSectionContent(d: EnumsBag) {
        switch (SELECTED_SECTION) {
            case 'overview':    return buildOverviewSection(d, {
                goToSection: router!.goToSection,
                onDeactivateClick: onDeactivateClick
            });
            case 'phones':      return buildPhonesSection(d, {
                loadPhonesData: loadPhonesData,
                goToStep: router!.goToStep,
                onPhonesRowSelectionChanged: onPhonesRowSelectionChanged
            });
            case 'voice':       return buildVoiceSection(d, { rerender: rerender });
            case 'credentials': return buildCredentialsSection(d);
            case 'health':      return buildHealthSection(d, {
                rerender: rerender,
                onDeactivateClick: onDeactivateClick
            });
            default:            return buildOverviewSection(d, {
                goToSection: router!.goToSection,
                onDeactivateClick: onDeactivateClick
            });
        }
    }



    /**
     * Step-router for the body content. Dispatches on CURRENT_STEP and
     * builds the appropriate per-step UI. Stash the outer container on
     * a module-level variable so async actions can swap its content.
     */
    function buildStepBodyContainer(d: EnumsBag) {
        var initial: unknown;
        if (CURRENT_STEP === 1) {
            initial = safeNew(component.Loader, {
                label: "Running prerequisite checks…",
                indeterminate: true
            }, "Loader(prereqs)") || safeNew(d.T, {
                text: "Loading prerequisite checks…"
            }, "Text(loading-fallback)");
        } else if (CURRENT_STEP === 2) {
            initial = buildStep2Form(d);
        } else if (CURRENT_STEP === 3) {
            initial = buildStep3Form(d);
        } else if (CURRENT_STEP === 4) {
            initial = buildStep4Form(d);
        } else if (CURRENT_STEP === 5) {
            initial = buildStep5Activate(d, {
                rerender: rerender,
                goToConsole: router!.goToConsole
            });
        } else {
            initial = safeNew(d.T, {
                text: "Step " + CURRENT_STEP + " not implemented.",
                type: d.T_Type.WEAK
            }, "Text(stub-step-" + CURRENT_STEP + ")");
        }

        // Wrap content + navigation footer (Back/Continue) in a vertical
        // StackPanel so the footer sits below whatever the step renders.
        var stack = safeNew(d.SP, {
            items: [initial, buildNavFooter(d)]
                .filter(function (c) { return c != null; }),
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.L
        }, "StackPanel(body+footer)");

        var box = safeNew(d.CP, {
            content: stack || initial,
            horizontalAlignment: d.CP_HAlign.STRETCH,
            outerGap: d.CP_Gap.L
        }, "ContentPanel(body)");

        bodyContainer = box;
        return box;
    }

    /**
     * Back / Continue button row at the bottom of every step.
     * Step 1: no Back; Step N>1: Back goes to N-1; Continue advances
     * (with per-step validation/save in onContinueClick).
     */
    function buildNavFooter(d: EnumsBag) {
        var ButtonType = component.Button.Type;

        var backBtn = (CURRENT_STEP > 1) ? safeNew(component.Button, {
            label: "Back",
            type: ButtonType.DEFAULT,
            action: function () { router!.goToStep(CURRENT_STEP - 1); }
        }, "Button(back)") : null;

        var nextBtn = (CURRENT_STEP < STEPS.length) ? safeNew(component.Button, {
            label: "Continue",
            type: ButtonType.PRIMARY,
            action: function () { onContinueClick(); }
        }, "Button(continue)") : null;

        var items = [backBtn, nextBtn]
            .filter(function (c) { return c != null; });
        if (items.length === 0) return null;

        return safeNew(d.SP, {
            items: items,
            orientation: d.SP_Orient.HORIZONTAL,
            itemGap: d.SP_Gap.M
        }, "StackPanel(nav-footer)");
    }

    /**
     * Per-step Continue logic. Step 1 has no validation server-side
     * (the prereqs were already loaded; admin chose to advance). Steps
     * 2 + 3 dispatch the Save action; if it returns ok, advance.
     */
    function onContinueClick() {
        if (CURRENT_STEP === 1) {
            router!.goToStep(2);
            return;
        }
        if (CURRENT_STEP === 2) {
            wizardCall('wizardSavePublicIds', {
                accountSid:   STATE.step2.accountSid,
                apiKeySid:    STATE.step2.apiKeySid,
                apiSecretId:  STATE.step2.apiSecretId
            }).then(function (payload) {
                if (payload && payload.saved) router!.goToStep(3);
                else alert("Save failed: " +
                    ((payload && payload.error) || 'unknown'));
            }).catch(function (e) {
                alert("Network error saving Step 2: " +
                    (e && e.message ? e.message : String(e)));
            });
            return;
        }
        if (CURRENT_STEP === 3) {
            wizardCall('wizardSaveVoice', {
                twimlAppSid:     STATE.step3.twimlAppSid,
                phoneNumber:     STATE.step3.phoneNumber,
                intelServiceSid: STATE.step3.intelServiceSid
            }).then(function (payload) {
                if (payload && payload.saved) router!.goToStep(4);
                else alert("Save failed: " +
                    ((payload && payload.error) || 'unknown'));
            }).catch(function (e) {
                alert("Network error saving Step 3: " +
                    (e && e.message ? e.message : String(e)));
            });
            return;
        }
        if (CURRENT_STEP === 4) {
            // Translate STATE.step4.assignments map → API payload shape
            interface Step4PhoneNumber {
                sid: string;
                phoneNumber?: string;
                friendlyName?: string;
            }
            interface Step4Assignment {
                employeeIds?: number[];
                label?: string;
                primaryEmployeeId?: number | null;
            }
            var rows: unknown[] = [];
            var phoneNumbers = (STATE.step4.phoneNumbers || []) as Step4PhoneNumber[];
            var assignmentsMap = STATE.step4.assignments as Record<string, Step4Assignment>;
            for (var i = 0; i < phoneNumbers.length; i++) {
                var pn = phoneNumbers[i];
                var assignment: Step4Assignment = assignmentsMap[pn.sid] || {};
                var employeeIds = assignment.employeeIds || [];
                // Only include rows where at least one employee is assigned;
                // empty rows shouldn't generate noise in the rep_assignment table
                if (employeeIds.length === 0) continue;
                rows.push({
                    phoneSid: pn.sid,
                    phoneNumber: pn.phoneNumber,
                    label: assignment.label || pn.friendlyName || '',
                    employeeIds: employeeIds,
                    primaryEmployeeId: assignment.primaryEmployeeId || employeeIds[0]
                });
            }
            // U9b diagnostic: log the assignment state + outgoing payload
            // so the browser console shows whether MultiselectDropdown's
            // onSelectionChanged actually captured the picked employees.
            // If `rows` is [] here but the UI shows tags in the dropdown,
            // the bug is in the picker → STATE plumbing. If `rows` is
            // populated but the server returns 0 on load (next preflight),
            // the bug is in the save/load field-ID alignment.
            console.log("[CTC Setup Wizard] Step 4 Continue — STATE.step4.assignments:",
                STATE.step4.assignments);
            console.log("[CTC Setup Wizard] Step 4 Continue — payload rows (" +
                rows.length + "):", rows);
            wizardCall('wizardSaveAssignments', { assignments: rows })
            .then(function (payload) {
                console.log("[CTC Setup Wizard] saveAssignments response:", payload);
                if (payload && payload.saved) router!.goToStep(5);
                else alert("Save failed: " +
                    ((payload && payload.error) || 'unknown'));
            }).catch(function (e) {
                alert("Network error saving Step 4: " +
                    (e && e.message ? e.message : String(e)));
            });
            return;
        }
        router!.goToStep(CURRENT_STEP + 1);
    }
    function buildStepper(d: EnumsBag) {
        // UIF v9.0.0 type catalog guarantees these classes + nested
        // enums exist; the pre-catalog `|| {}` fallbacks have been
        // removed. Pull enums directly from the typed catalog.
        var Badge = component.Badge;
        var BadgeType = Badge.Type;
        var BadgeSize = Badge.Size;
        var TextType = d.T.Type;
        var TextSize = d.T.Size;

        var SPAlign = d.SP.Alignment;
        var SPJust = d.SP.Justification;

        var pills = STEPS.map(function (s) {
            var isCurrent = (s.num === CURRENT_STEP);
            var isDone    = (s.num < CURRENT_STEP);

            var badge = safeNew(Badge, {
                content: isDone ? "✓" : String(s.num), // ✓ for done
                type: isCurrent || isDone
                    ? BadgeType.SOLID
                    : BadgeType.SUBTLE,
                size: BadgeSize.DEFAULT
            }, "Badge(" + s.num + ")");

            var label = safeNew(d.T, {
                text: s.label,
                type: isCurrent ? TextType.STRONG : TextType.DEFAULT
            }, "Text(label-" + s.num + ")");

            var sublabel = safeNew(d.T, {
                text: s.sub,
                type: TextType.WEAK,
                size: TextSize.S
            }, "Text(sub-" + s.num + ")");

            var pillItems = [badge, label, sublabel]
                .filter(function (c) { return c != null; });

            return safeNew(d.SP, {
                items: pillItems,
                orientation: d.SP_Orient.VERTICAL,
                alignment: SPAlign.CENTER,
                itemGap: d.SP_Gap.XS
            }, "StackPanel(pill-" + s.num + ")");
        }).filter(function (p) { return p != null; });

        if (pills.length === 0) return null;

        return safeNew(d.SP, {
            items: pills,
            orientation: d.SP_Orient.HORIZONTAL,
            justification: SPJust.SPACE_BETWEEN,
            itemGap: d.SP_Gap.M
        }, "StackPanel(stepper-strip)");
    }

    // Path B.3e-1 — safeNew moved to ./render/primitives.ts.

// Path D-Store-3a — exports are now declared inline at each function:
//   setRerenderHook  — App.componentDidMount registers its setState callback
//   initializeApp    — App.componentDidMount calls this to fire wizardSnapshot resumability
//   renderRoot       — App.render() calls this to get the current tree
