// @ts-nocheck
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
import { wizardCall, extractPayload, WIZARD_API_URL } from './wizard_api_client';
import {
    MODE, CURRENT_STEP, SELECTED_SECTION, RAIL_VISIBLE,
    setMode, setCurrentStep, setSelectedSection, setRailVisible
} from './dispatch';
import { STATE } from './state';

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
    // to ./wizard_api_client.ts. Still imported (top of file) so
    // existing in-file references stay valid.

    // Module-level mount state — scriptCtx / bodyContainer / enums
    // remain here for now. They're tightly coupled with run() + the
    // rerender helper (still in this file); will extract with the
    // render-shell module in B.3e.
    var scriptCtx = null;          // for re-render via setContent
    var bodyContainer = null;      // for swapping step body
    var enums = null;              // cached enum bag from run()

    // Path B.3d — STATE moved to ./state.ts (typed interfaces per
    // step + console). 235 `STATE.X` references in this file work
    // unchanged because the import is a `const` binding — we mutate
    // properties (STATE.console.foo = bar), never the binding itself.

    // Path B.3b — wizardCall moved to ./wizard_api_client.ts.

    var run = function (scriptContext) {
        try {
            console.log("[CTC Setup Wizard] === REAL API PASS ===");

            // Resolve enums from the actual classes (verified against d.ts).
            var SP    = component.StackPanel;
            var CP    = component.ContentPanel;
            var H     = component.Heading;
            var T     = component.Text;
            var Stp   = component.Stepper;
            var SI    = component.StepperItem;
            // U1 (Phase 3a) — console-specific components.
            var ND    = component.NavigationDrawer;
            var GP    = component.GridPanel;
            var Bn    = component.Banner;
            var Cd    = component.Card;
            var Tb    = component.ToolBar;
            // U1.5 — ScrollPanel for content-pane internal scrolling.
            var Sp    = component.ScrollPanel;
            // U3 (Phase 3b) — DataGrid + column types for inline editing.
            var DG    = component.DataGrid;
            var TC    = component.TemplatedColumn;
            var MDC   = component.MultiselectDropdownColumn;
            var Bdg   = component.Badge;
            // U3 — ArrayDataSource (from core) for DataGrid rows + dropdown items.
            var Ads   = core.ArrayDataSource;

            var SP_Orient = SP && SP.Orientation || {};
            var SP_Gap    = SP && SP.GapSize || {};
            var CP_Gap    = CP && CP.GapSize || {};
            var CP_HAlign = CP && CP.HorizontalAlignment || {};
            var H_Type    = H && H.Type || {};
            var T_Type    = T && T.Type || {};
            // Stepper.Orientation aliases StepperItem.Orientation per d.ts
            var Stp_Orient = (Stp && Stp.Orientation) ||
                             (SI && SI.Orientation) || {};
            var Bn_Color  = Bn && Bn.Color || {};
            var GP_Gap    = GP && GP.GapSize || {};

            // U1-polish: SystemIcon for NavigationDrawer item icons.
            // Without these, NavigationDrawer falls back to a first-
            // letter monogram per the catalog docs — works but ugly.
            var SysIcon = (core && core.SystemIcon) || {};

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
            scriptCtx = scriptContext;

            // U1.5: per the UIF catalog (Integration > SuiteApps >
            // Code tips > Layout), calling context.setLayout('application')
            // makes the SPA fill the entire viewport (vs the default
            // 'natural' which sizes the SPA to its content). This is
            // what enables the rail's `rows: '100%'` to actually fill
            // the visible area below NetSuite's chrome — without it,
            // 100% resolves to content height and the rail collapses.
            try {
                if (scriptContext && typeof scriptContext.setLayout === 'function') {
                    scriptContext.setLayout('application');
                }
            } catch (e) {
                console.warn("[CTC Setup Wizard] setLayout('application') " +
                    "failed; rail may not fill viewport:", e);
            }

            // U9 fix: previously CURRENT_STEP was always 1 on mount,
            // dropping returning admins back at the prereqs check.
            // Now we fetch the config snapshot and route to the right
            // step via lib/ctc_wizard_state.determineCurrentStep.
            //
            // While snapshot is in flight, render Step 1 with a loader
            // so the admin sees something immediately. When the
            // snapshot lands, goToStep navigates to the correct step
            // and fires its per-step loader.
            rerender();
            loadPrereqs(); // immediate Step 1 affordance during routing

            wizardCall('wizardSnapshot', {}).then(function (payload) {
                var snap = payload && payload.snapshot;
                if (!snap) return; // fresh install — stay on Step 1
                var target = determineLandingStep(snap);
                if (target === 'console') {
                    console.log("[CTC Setup Wizard] resumability — routing to Admin Console");
                    goToConsole();
                } else if (target !== CURRENT_STEP) {
                    console.log("[CTC Setup Wizard] resumability — routing to step " + target);
                    goToStep(target);
                }
            }).catch(function (e) {
                console.warn("[CTC Setup Wizard] resumability snapshot " +
                    "failed; staying on Step 1:", e);
            });
        } catch (e) {
            console.error("[CTC Setup Wizard] run() threw:", e);
        }
    };

    /**
     * U9 + U11: Determine the right landing step from a snapshot.
     * Mirrors `lib/ctc_wizard_state.js:determineCurrentStep`. Inlined
     * here because SPA Client runtime AMD require semantics for
     * cross-folder libs are uncertain in NetSuite UIF — safer to keep
     * the routing tiny and local.
     *
     * @param {Object} snap — masked snapshot from wizardSnapshot action
     * @returns {number|string} 1..5 or 'console'
     */
    function determineLandingStep(snap) {
        var has = function (v) { return !!(v && String(v).trim().length > 0); };
        if (!has(snap.accountSid) || !has(snap.apiKeySid)) return 2;
        if (!has(snap.apiSecretId)) return 2;
        if (!has(snap.twimlAppSid) || !has(snap.phoneNumber)) return 3;
        // Once voice config is set, the admin should land on the console
        // regardless of active state. Refresh-after-deactivate should
        // return to the console (where the Reactivate banner lives), NOT
        // the stepper. The active flag only controls rep call placement,
        // not admin console access.
        return 'console';
    }

    /**
     * Rebuild and mount the full root tree. Called on initial render
     * and on every step navigation. Keeps the stepper + title in sync
     * with CURRENT_STEP.
     */
    function rerender() {
        if (!scriptCtx || !enums) return;
        try {
            var root = buildRoot(enums);
            scriptCtx.setContent(root);
            console.log("[CTC Setup Wizard] rerender — step " + CURRENT_STEP);
        } catch (e) {
            console.error("[CTC Setup Wizard] rerender threw:", e);
        }
    }

    /**
     * Advance to the next step (or jump to a specific step). Re-renders.
     * Always flips MODE back to 'stepper' — used both for normal nav
     * AND for jumping out of the Admin Console into a specific step.
     */
    function goToStep(stepNum) {
        setMode('stepper');
        setCurrentStep(Math.max(1, Math.min(STEPS.length, stepNum)));
        rerender();
        if (CURRENT_STEP === 1) loadPrereqs();
        if (CURRENT_STEP === 3) loadStep3Lists();
        if (CURRENT_STEP === 4) loadStep4Lists();
        if (CURRENT_STEP === 5) loadStep5();
    }

    /**
     * U1 (Phase 3a): enter Admin Console mode. Lands admin on 'overview'
     * section by default and triggers the once-per-mount data load.
     * U1.5: also flips RAIL_VISIBLE so the left rail persists into
     * stepper mode if admin clicks "Re-run wizard."
     */
    function goToConsole() {
        setMode('console');
        setSelectedSection('overview');
        setRailVisible(true);
        STATE.console.pendingDeactivateConfirm = false;
        STATE.console.deactivateError = null;
        STATE.console.actionError = null;
        STATE.console.activeModal = null;
        loadConsole();
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
        STATE.console.drift = null;
        rerender();

        var settled = 0;
        // U3 fix: preload employees alongside snapshot/assignments/preflight
        // so the Phones DataGrid has them available on first render. Earlier
        // lazy-load on goToSection('phones') created a timing race where the
        // DataGrid's widgetOptions ran BEFORE employees resolved → chips
        // initialized with selectedItems=[] and never recovered on subsequent
        // renders.
        var TARGET = 4;
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
            .then(function (p) { STATE.console.snapshot = p && p.snapshot; })
            .catch(function () { STATE.console.snapshot = null; })
            .then(onSettled);

        wizardCall('wizardLoadAssignments', {})
            .then(function (p) {
                STATE.console.assignments = (p && p.items) || [];
                STATE.console.phonesByPhone =
                    groupAssignmentsByPhone(STATE.console.assignments);
            })
            .catch(function () {
                STATE.console.assignments = [];
                STATE.console.phonesByPhone = [];
            })
            .then(onSettled);

        wizardCall('wizardRunPreflight', {})
            .then(function (p) { STATE.console.preflight = (p && p.checks) || []; })
            .catch(function () { STATE.console.preflight = []; })
            .then(onSettled);

        wizardCall('wizardListEmployees', {})
            .then(function (p) {
                var items = (p && p.items) || [];
                STATE.console.phonesEmployees = items.map(function (e) {
                    return {
                        id: Number(e.id),
                        name: e.name || '(no name)',
                        email: e.email || ''
                    };
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
    function computeDrift(snapshot, assignments) {
        // Defensive default — if data is missing, no drift can be computed.
        if (!snapshot) return { phoneNumbers: 'unknown', voiceUrl: 'unknown',
                                intelService: 'unknown' };
        // Phone numbers: live comparison happens in U6 when Phones section
        // also fires wizardListPhoneNumbers. For now mark 'in-sync' so the
        // section can render; U6 swaps this in for the real check.
        return {
            phoneNumbers: 'in-sync',
            voiceUrl: 'in-sync',
            intelService: snapshot.intelServiceSid ? 'in-sync' : 'not-configured'
        };
    }

    /**
     * U1 / U6: section navigator. Called from NavigationDrawer's
     * onSelectedValueChanged. Switches SELECTED_SECTION and triggers
     * rerender — sections share STATE.console so no additional fetch
     * is needed unless the section has section-specific data.
     */
    function goToSection(sectionName) {
        setSelectedSection(sectionName);
        // U1.5: if entering console from stepper mode (Re-run → navigate),
        // also flip MODE back so the rail's onSelectedValueChanged sees
        // console state.
        if (MODE === 'stepper') {
            setMode('console');
        }
        STATE.console.pendingDeactivateConfirm = false; // cancel pending
        STATE.console.actionError = null;
        rerender();

        // U3 (Phase 3b): lazy-load Phones-section's Twilio phone list
        // when admin first navigates there. Employees are pre-loaded in
        // loadConsole so the DataGrid has them on first render (avoids
        // the chip-display timing race).
        if (sectionName === 'phones' &&
            STATE.console.phonesNumbers === null) {
            loadPhonesData();
        }
    }

    /**
     * U3 bugfix: backend wizardLoadAssignments returns FLAT rows — one
     * per (phone, employee) pair. The DataGrid needs ONE row per phone
     * with all employeeIds collected. This helper groups by phoneSid.
     *
     * Input:  [{phoneSid, phoneNumber, employeeId, isPrimary}, ...]
     * Output: [{phoneSid, phoneNumber, employeeIds: [...], primaryEmployeeId}]
     */
    function groupAssignmentsByPhone(flatRows) {
        var grouped = {};
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
                STATE.console.phonesNumbers = (p && p.items) || [];
            })
            .catch(function (e) {
                STATE.console.phonesNumbers = [];
                STATE.console.phonesError = 'Could not load phone numbers: ' +
                    (e && e.message ? e.message : String(e));
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
    function onPhonesRowSelectionChanged(phoneSid, newEmployeeIds) {
        STATE.console.phonesSaving[phoneSid] = true;
        STATE.console.phonesError = null;

        // Optimistic: mutate the grouped row in place.
        var grouped = STATE.console.phonesByPhone || [];
        for (var i = 0; i < grouped.length; i++) {
            if (grouped[i].phoneSid === phoneSid) {
                grouped[i].employeeIds = newEmployeeIds;
                if (!grouped[i].primaryEmployeeId ||
                    newEmployeeIds.indexOf(grouped[i].primaryEmployeeId) === -1) {
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
                STATE.console.phonesSaving[phoneSid] = false;
                if (!resp || resp.ok === false || resp.error) {
                    STATE.console.phonesError =
                        'Save failed: ' + ((resp && resp.error) || 'unknown');
                    // Revert via fresh load.
                    wizardCall('wizardLoadAssignments', {}).then(function (p2) {
                        STATE.console.assignments = (p2 && p2.items) || [];
                        STATE.console.phonesByPhone =
                            groupAssignmentsByPhone(STATE.console.assignments);
                        rerender();
                    });
                }
                rerender();
            })
            .catch(function (e) {
                STATE.console.phonesSaving[phoneSid] = false;
                STATE.console.phonesError = 'Network: ' +
                    (e && e.message ? e.message : String(e));
                rerender();
            });
    }

    /**
     * U6: deactivate handler. Two-click confirm pattern. Unlike U11's
     * original — does NOT bounce to stepper on success; stays on the
     * console with isPaused state per R7 (the plan).
     */
    function onDeactivateClick() {
        if (!STATE.console.pendingDeactivateConfirm) {
            STATE.console.pendingDeactivateConfirm = true;
            rerender();
            return;
        }
        STATE.console.deactivateError = null;
        wizardCall('wizardActivate', { deactivate: true })
            .then(function (payload) {
                if (payload && payload.deactivated) {
                    // R7: stay on console; flip snapshot.active so paused
                    // banner renders. Reload snapshot to confirm server state.
                    STATE.console.pendingDeactivateConfirm = false;
                    if (STATE.console.snapshot) {
                        STATE.console.snapshot.active = false;
                    }
                    rerender();
                } else {
                    STATE.console.deactivateError =
                        (payload && payload.error) || 'unknown_error';
                    rerender();
                }
            })
            .catch(function (e) {
                STATE.console.deactivateError = 'Network: ' +
                    (e && e.message ? e.message : String(e));
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
                if (payload && (payload.activated || payload.alreadyActive)) {
                    if (STATE.console.snapshot) {
                        STATE.console.snapshot.active = true;
                    }
                    rerender();
                } else {
                    STATE.console.actionError =
                        (payload && payload.error) || 'reactivate_failed';
                    if (payload && payload.failedChecks) {
                        STATE.console.preflight = payload.failedChecks;
                    }
                    rerender();
                }
            })
            .catch(function (e) {
                STATE.console.actionError = 'Network: ' +
                    (e && e.message ? e.message : String(e));
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
            var body;
            if (payload && payload.ok && payload.checks) {
                // Wrap prereqs list with the nav footer so Continue button
                // sits below the rows. Since loadPrereqs runs ONLY on
                // initial Step 1 mount, we re-render the whole tree to
                // pick up the new body.
                body = buildPrereqsList(payload.checks);
            } else if (payload && payload.error) {
                body = buildErrorBox(payload.error);
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

    function buildRoot(d) {
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
    // Path B.3b — extractPayload moved to ./wizard_api_client.ts.

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
    function buildRailContentPane(d) {
        if (STATE.console.loading && MODE === 'console') {
            var loader = safeNew(component.Loader, {
                label: "Loading console…",
                indeterminate: true
            }, "Loader(console)");
            return wrapContent(d, loader || safeNew(d.T, { text: "Loading…" }, "Text(loading)"));
        }

        var items = [];

        // ── Title ─────────────────────────────────────────────────────
        var titleText = MODE === 'console'
            ? "Click-to-Call Admin Console"
            : "Click-to-Call Setup Wizard";
        var title = safeNew(d.H, {
            content: titleText,
            type: d.H_Type.PAGE_TITLE
        }, "Heading(content-title)");
        if (title) items.push(title);

        // ── Paused banner (console mode only) ─────────────────────────
        if (MODE === 'console' && STATE.console.snapshot
            && STATE.console.snapshot.active === false) {
            var paused = buildPausedBanner(d);
            if (paused) items.push(paused);
        }

        // ── Mode-specific body ────────────────────────────────────────
        if (MODE === 'console') {
            var section = buildSectionContent(d);
            if (section) items.push(section);
        } else {
            // Stepper mode (re-run flow). Reuse the original stepper
            // rendering bits: subtitle, stepper widget, step body, nav footer.
            var subtitle = safeNew(d.T, {
                text: "Step " + CURRENT_STEP + " of " + STEPS.length + " — " +
                    STEPS[CURRENT_STEP - 1].label
            }, "Text(rail-subtitle)");
            if (subtitle) items.push(subtitle);

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
    function wrapContent(d, child) {
        if (!d.CP) return child;
        var Gap = d.CP_Gap || {};
        var padded = safeNew(d.CP, {
            content: child,
            horizontalAlignment: d.CP_HAlign.STRETCH,
            outerGap: {
                start: Gap.XXL,
                end: Gap.XXL,
                vertical: Gap.M
            }
        }, "ContentPanel(rail-wrapper)") || child;

        // Wrap in ScrollPanel(VERTICAL) so the content pane scrolls
        // internally — rail stays put in viewport even when content
        // exceeds the visible area.
        if (!d.Sp) return padded;
        var Sp_Orient = (d.Sp && d.Sp.Orientation) || {};
        return safeNew(d.Sp, {
            content: padded,
            orientation: Sp_Orient.VERTICAL
        }, "ScrollPanel(rail-content)") || padded;
    }

    /**
     * U1: NavigationDrawer with grouped items. Per d.ts (component.d.ts:13874+),
     * ItemOptions supports nested `items`, badges, separators, and a
     * per-item `action` callback. Our items use `value` for selection
     * tracking + `action` for the rare "fire-and-forget" item (Re-run
     * wizard); the section items rely on onSelectedValueChanged at the
     * drawer level.
     */
    function buildConsoleNavDrawer(d) {
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
              action: function () { goToStep(1); } }
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
            onSelectedValueChanged: function (args) {
                var value = args && args.value;
                if (!value) return;
                if (value === 're-run') {
                    // Re-run wizard click — fire the goToStep action.
                    goToStep(1);
                    return;
                }
                // Section click — flips MODE='console' and sets the
                // active section (works whether admin was in console
                // or stepper mode).
                goToSection(value);
            }
        }, "NavigationDrawer(console)");
    }

    /**
     * Fallback nav when NavigationDrawer isn't available — vertical
     * StackPanel of Buttons. Same routing semantics; ugly but functional.
     */
    function buildNavFallback(d) {
        var ButtonType = (component.Button && component.Button.Type) || {};
        var navSpecs = [
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
                    if (spec.value === 're-run') goToStep(1);
                    else goToSection(spec.value);
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
    function buildSectionContent(d) {
        switch (SELECTED_SECTION) {
            case 'overview':    return buildOverviewSection(d);
            case 'phones':      return buildPhonesSection(d);
            case 'voice':       return buildVoiceSection(d);
            case 'credentials': return buildCredentialsSection(d);
            case 'health':      return buildHealthSection(d);
            default:            return buildOverviewSection(d);
        }
    }

    /**
     * U1: placeholder section content for the not-yet-implemented sections.
     * Shows the section name + a "coming in Phase 3b/3c" note so admin
     * sees something useful instead of a blank pane.
     */
    function buildSectionStub(d, title, note) {
        var heading = safeNew(d.H, {
            content: title,
            type: d.H_Type.MEDIUM_HEADING
        }, "Heading(stub-" + title + ")");

        var body = safeNew(d.T, {
            text: note,
            type: d.T_Type.WEAK
        }, "Text(stub-body-" + title + ")");

        // Until the section ships, offer a stepper deep-link as a fallback
        // path so admin isn't stranded (this contradicts R3's "no deep
        // links" but is acceptable as a temporary affordance during the
        // phased rollout — removed when U3/U4/U5 land).
        var fallbackBtn = null;
        if (title === 'Phones & reps' || title === 'Voice config') {
            var stepTarget = title === 'Phones & reps' ? 4 : 3;
            fallbackBtn = safeNew(component.Button, {
                label: 'Open via wizard (temporary)',
                type: (component.Button && component.Button.Type
                    && component.Button.Type.DEFAULT) || undefined,
                action: function () { goToStep(stepTarget); }
            }, "Button(stub-deeplink-" + title + ")");
        } else if (title === 'Credentials') {
            fallbackBtn = safeNew(component.Button, {
                label: 'Open API Secrets',
                type: (component.Button && component.Button.Type
                    && component.Button.Type.DEFAULT) || undefined,
                action: function () {
                    try {
                        window.open('/app/common/scripting/secrets/settings.nl', '_blank');
                    } catch (e) { /* ignore */ }
                }
            }, "Button(stub-secrets)");
        }

        var items = [heading, body, fallbackBtn]
            .filter(function (c) { return c != null; });
        if (items.length === 0) {
            return safeNew(d.T, { text: title }, "Text(stub-fallback)");
        }
        return safeNew(d.SP, {
            items: items,
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.M
        }, "StackPanel(stub-" + title + ")");
    }

    /**
     * Configuration summary card — read-only view of the current config
     * snapshot, mirrored from Step 5's Configuration Review section so
     * admins can verify what's live without re-running the wizard.
     */
    function buildConsoleSummaryCard(d) {
        var snap = STATE.console.snapshot;
        if (!snap) return null;

        var assignments = STATE.console.assignments || [];
        var phoneNumbersWithReps = {};
        assignments.forEach(function (a) {
            if (a.phoneSid) phoneNumbersWithReps[a.phoneSid] = true;
        });

        var lines = [
            'Account SID:        ' + (snap.accountSid || '(not set)'),
            'API Key SID:        ' + (snap.apiKeySid || '(not set)'),
            'API Key Secret:     ' + (snap.apiSecretId || '(not set)'),
            'TwiML Application:  ' + (snap.twimlAppSid || '(not set)'),
            'Default caller ID:  ' + (snap.phoneNumber || '(not set)'),
            'Intel Service:      ' + (snap.intelServiceSid || '(none)'),
            'Phone assignments:  ' + assignments.length + ' rep(s) across ' +
                Object.keys(phoneNumbersWithReps).length + ' number(s)'
        ];

        var heading = safeNew(d.H, {
            content: "Current configuration",
            type: d.H_Type.SMALL_HEADING
        }, "Heading(console-summary)");

        var rows = [heading];
        lines.forEach(function (l) {
            var t = safeNew(d.T, {
                text: l,
                type: d.T_Type.DEFAULT,
                size: d.T && d.T.Size ? d.T.Size.S : undefined
            }, "Text(summary-line)");
            if (t) rows.push(t);
        });

        return safeNew(d.SP, {
            items: rows.filter(function (r) { return r != null; }),
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.XS
        }, "StackPanel(console-summary)");
    }

    /* ────────────────────────────────────────────────────────────────── */
    /* U7-ish (paused-state banner, single-section-only for now)          */
    /* ────────────────────────────────────────────────────────────────── */

    /**
     * U1 / U7 partial: when snapshot.active=false, render a persistent
     * orange Banner above section content with a Reactivate button. R7
     * says do NOT bounce admin to the stepper on deactivate — admin stays
     * here, banner-gated. Full U7 fans this across every section; U1
     * places it ONCE at the page root above the console shell, which
     * achieves the same visual outcome for less code.
     */
    function buildPausedBanner(d) {
        if (!d.Bn) {
            // Banner unavailable — fall back to a Text + Button row.
            var ButtonType = (component.Button && component.Button.Type) || {};
            return safeNew(d.SP, {
                items: [
                    safeNew(d.T, {
                        text: "⚠ Click-to-Call is paused. Reps cannot place calls.",
                        type: d.T_Type.STRONG
                    }, "Text(paused-fallback)"),
                    safeNew(component.Button, {
                        label: "Reactivate",
                        type: ButtonType.PRIMARY,
                        action: onReactivateClick
                    }, "Button(paused-reactivate-fallback)")
                ].filter(function (c) { return c != null; }),
                orientation: d.SP_Orient.HORIZONTAL,
                itemGap: d.SP_Gap.M
            }, "StackPanel(paused-fallback)");
        }
        var ButtonType = (component.Button && component.Button.Type) || {};

        // EMPIRICAL: Banner's `button` prop and `showControls` flag share
        // the same right-side controls region. `showControls: false`
        // hides BOTH the dontShowAgain checkbox AND the action button.
        // The catalog docs don't disclose this conflict (their example
        // shows showControls:false but has no button).
        //
        // Workaround: omit Banner.button entirely. Build a horizontal
        // StackPanel containing the body text and the Reactivate button,
        // and pass that as Banner.content. Banner.content accepts any
        // Component, so the button rides inside the content slot —
        // unaffected by showControls.
        var bodyText = safeNew(d.T, {
            text: "Reps cannot place calls until you reactivate. All " +
                  "config is preserved."
        }, "Text(paused-banner-body)");

        var reactivateBtn = safeNew(component.Button, {
            label: "Reactivate",
            type: ButtonType.PRIMARY,
            action: onReactivateClick
        }, "Button(paused-banner-reactivate)");

        var contentRow = safeNew(d.SP, {
            items: [bodyText, reactivateBtn].filter(function (c) { return c != null; }),
            orientation: d.SP_Orient.HORIZONTAL,
            itemGap: d.SP_Gap.L,
            justification: (d.SP.Justification && d.SP.Justification.SPACE_BETWEEN) || undefined,
            alignment: (d.SP.Alignment && d.SP.Alignment.CENTER) || undefined
        }, "StackPanel(paused-banner-content)") || bodyText;

        return safeNew(d.Bn, {
            title: "Click-to-Call is paused",
            content: contentRow,
            color: d.Bn_Color.ORANGE,
            showControls: false
        }, "Banner(paused)");
    }

    /* ────────────────────────────────────────────────────────────────── */
    /* U2 — Overview section (Phase 3a)                                   */
    /* ────────────────────────────────────────────────────────────────── */

    /**
     * U2: Overview section — landing page when admin enters console.
     * 4 stat cards + quick-actions row + recent-activity feed (mocked
     * until U8 / Phase 3c). Same data sources as the original U11
     * summary card, just shaped as a dashboard.
     */
    function buildOverviewSection(d) {
        var items = [];

        var heading = safeNew(d.H, {
            content: "Overview",
            type: d.H_Type.MEDIUM_HEADING
        }, "Heading(overview)");
        if (heading) items.push(heading);

        // Stat-card grid (4 cards).
        var stats = buildOverviewStatCards(d);
        if (stats) items.push(stats);

        // Quick-actions strip.
        var quick = buildOverviewQuickActions(d);
        if (quick) items.push(quick);

        // Recent-activity feed (mock until U8).
        var activity = buildOverviewActivityFeed(d);
        if (activity) items.push(activity);

        if (items.length === 0) return safeNew(d.T, { text: "Overview" });
        return safeNew(d.SP, {
            items: items,
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.L
        }, "StackPanel(overview)");
    }

    function buildOverviewStatCards(d) {
        var snap = STATE.console.snapshot || {};
        var assignments = STATE.console.assignments || [];
        var preflight = STATE.console.preflight || [];

        var phoneCount = {};
        assignments.forEach(function (a) {
            if (a.phoneSid) phoneCount[a.phoneSid] = true;
        });
        var phonesConfigured = Object.keys(phoneCount).length || (snap.phoneNumber ? 1 : 0);
        var repCount = assignments.length;
        var preflightPassed = preflight.filter(function (c) {
            return c.status === 'pass';
        }).length;
        var preflightTotal = preflight.length;
        var statusLabel = snap.active === false ? 'Paused' :
                          snap.active === true ? 'Active' : 'Unknown';

        var cards = [
            buildStatCard(d, {
                title: 'Status',
                metric: statusLabel,
                description: snap.active === false ? 'Reps cannot place calls'
                                                   : 'Reps can place calls'
            }),
            buildStatCard(d, {
                title: 'Phone numbers',
                metric: String(phonesConfigured),
                description: phonesConfigured === 0 ? 'No numbers configured'
                    : snap.phoneNumber || ''
            }),
            buildStatCard(d, {
                title: 'Assigned reps',
                metric: String(repCount),
                description: repCount === 0 ? 'No assignments'
                    : (repCount === 1 ? '1 rep' : repCount + ' reps')
            }),
            buildStatCard(d, {
                title: 'Preflight',
                metric: preflightTotal > 0
                    ? preflightPassed + ' of ' + preflightTotal
                    : '—',
                description: preflightTotal > 0 ? 'See Health for detail'
                                                : 'Not yet run'
            })
        ].filter(function (c) { return c != null; });

        if (cards.length === 0) return null;

        if (d.GP) {
            // CSS-grid track string — 4 equal flex columns. Equivalent to
            // 'repeat(4, 1fr)' but the literal version is more portable
            // across UIF versions per the catalog GridPanel docs.
            return safeNew(d.GP, {
                columns: '1fr 1fr 1fr 1fr',
                rows: 'auto',
                items: cards,
                columnGap: (d.GP_Gap && d.GP_Gap.M) || undefined
            }, "GridPanel(overview-stats)");
        }
        return safeNew(d.SP, {
            items: cards,
            orientation: d.SP_Orient.HORIZONTAL,
            itemGap: d.SP_Gap.M
        }, "StackPanel(overview-stats-fallback)");
    }

    /**
     * U2-polish: use Card.metric() — the static factory designed for
     * KPI/stat cards. Per component.d.ts:2478, it accepts
     * { title, metric, description, action } and returns a Card with the
     * proper internal layout. This replaces the manual Card+StackPanel
     * approach that rendered invisible cards.
     */
    function buildStatCard(d, spec) {
        if (d.Cd && typeof d.Cd.metric === 'function') {
            try {
                return d.Cd.metric({
                    title: spec.title,
                    metric: spec.metric,
                    description: spec.description
                });
            } catch (e) {
                console.warn("[CTC Setup Wizard] Card.metric threw, " +
                    "falling back to manual stack:", e);
            }
        }
        // Fallback: manual stack if Card.metric isn't available.
        var label = safeNew(d.T, {
            text: spec.title,
            type: d.T_Type.WEAK,
            size: d.T && d.T.Size ? d.T.Size.S : undefined
        }, "Text(stat-label)");
        var value = safeNew(d.H, {
            content: spec.metric,
            type: d.H_Type.SMALL_HEADING
        }, "Heading(stat-value)");
        var sub = spec.description ? safeNew(d.T, {
            text: spec.description,
            type: d.T_Type.WEAK,
            size: d.T && d.T.Size ? d.T.Size.S : undefined
        }, "Text(stat-sub)") : null;
        return safeNew(d.SP, {
            items: [label, value, sub].filter(function (c) { return c != null; }),
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.XXS
        }, "StackPanel(stat-card-" + spec.title + ")");
    }

    function buildOverviewQuickActions(d) {
        var ButtonType = (component.Button && component.Button.Type) || {};

        var heading = safeNew(d.H, {
            content: "Quick actions",
            type: d.H_Type.SMALL_HEADING
        }, "Heading(quick-actions)");

        var actions = [
            { label: "Add a phone number",      onClick: function () { goToSection('phones'); } },
            { label: "Reassign reps",           onClick: function () { goToSection('phones'); } },
            { label: "Update voice config",     onClick: function () { goToSection('voice'); } },
            { label: "Rotate API Key Secret",   onClick: function () { goToSection('credentials'); } },
            { label: "Run health check",        onClick: function () { goToSection('health'); } }
        ];

        var buttons = actions.map(function (a) {
            // PURE-type buttons read as text-only links — appropriate for
            // a row of 5 affordances where DEFAULT (filled outline) would
            // dominate the page. Per d.ts Button.Type enum.
            return safeNew(component.Button, {
                label: a.label,
                type: ButtonType.PURE || ButtonType.DEFAULT,
                action: a.onClick
            }, "Button(qa-" + a.label + ")");
        }).filter(function (b) { return b != null; });

        if (buttons.length === 0) return heading;

        var row = safeNew(d.SP, {
            items: buttons,
            orientation: d.SP_Orient.HORIZONTAL,
            itemGap: d.SP_Gap.S
        }, "StackPanel(quick-actions-row)");

        return safeNew(d.SP, {
            items: [heading, row].filter(function (c) { return c != null; }),
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.XS
        }, "StackPanel(quick-actions-block)");
    }

    function buildOverviewActivityFeed(d) {
        var heading = safeNew(d.H, {
            content: "Recent activity",
            type: d.H_Type.SMALL_HEADING
        }, "Heading(activity-feed)");

        // U8 (Phase 3c) wires this to wizardActivity. Until then, show
        // a stub note so admins know the feed is intentional, not missing.
        var activity = STATE.console.activity;
        var rows = [];

        if (!activity) {
            var stub = safeNew(d.T, {
                text: "Activity feed arrives in Phase 3c (U8 — wizardActivity). " +
                      "When live, it shows the last 50 audit-level wizard events.",
                type: d.T_Type.WEAK
            }, "Text(activity-stub)");
            if (stub) rows.push(stub);
        } else if (activity.length === 0) {
            var empty = safeNew(d.T, {
                text: "No recent activity.",
                type: d.T_Type.WEAK
            }, "Text(activity-empty)");
            if (empty) rows.push(empty);
        } else {
            activity.slice(0, 5).forEach(function (row) {
                var line = safeNew(d.T, {
                    text: row.timestamp + ' — ' + row.title +
                          (row.user ? ' (' + row.user + ')' : ''),
                    size: d.T && d.T.Size ? d.T.Size.S : undefined
                }, "Text(activity-row)");
                if (line) rows.push(line);
            });
        }

        return safeNew(d.SP, {
            items: [heading].concat(rows).filter(function (c) { return c != null; }),
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.XS
        }, "StackPanel(activity-feed)");
    }

    /* ────────────────────────────────────────────────────────────────── */
    /* U4 — Voice config section (Phase 3b)                               */
    /* ────────────────────────────────────────────────────────────────── */

    /**
     * Voice config: three fields — TwiML Application, default outbound
     * caller-ID number, optional Conversational Intelligence service.
     * Each renders as a VIEW row with a Change button; clicking Change
     * lazy-loads the option list (cached on first fetch) and swaps that
     * single row to EDIT mode with a Dropdown + Save / Cancel.
     *
     * Per-field editing (not all-at-once) matches the "fix one thing"
     * pattern admins expect from a management surface — avoids the
     * stepper-style all-or-nothing form.
     */
    function buildVoiceSection(d) {
        var snap = STATE.console.snapshot || {};
        var items = [];

        var heading = safeNew(d.H, {
            content: "Voice config",
            type: d.H_Type.MEDIUM_HEADING
        }, "Heading(voice)");
        if (heading) items.push(heading);

        var intro = safeNew(d.T, {
            text: "Manage TwiML application, default outbound caller-ID " +
                  "number, and optional Conversational Intelligence " +
                  "service. Changes save immediately and apply to the " +
                  "next call placed.",
            type: d.T_Type.WEAK
        }, "Text(voice-intro)");
        if (intro) items.push(intro);

        if (STATE.console.voiceError) {
            var err = safeNew(d.T, {
                text: "✕ " + STATE.console.voiceError,
                type: d.T_Type.STRONG
            }, "Text(voice-error)");
            if (err) items.push(err);
        }

        items.push(buildVoiceFieldRow(d, {
            field: 'twimlAppSid',
            label: 'TwiML Application',
            value: snap.twimlAppSid,
            helpText: 'Twilio application that handles outbound call routing.'
        }));

        items.push(buildVoiceFieldRow(d, {
            field: 'phoneNumber',
            label: 'Default outbound caller-ID',
            value: snap.phoneNumber,
            helpText: 'Number reps see as their outbound caller ID.'
        }));

        items.push(buildVoiceFieldRow(d, {
            field: 'intelServiceSid',
            label: 'Conversational Intelligence (optional)',
            value: snap.intelServiceSid,
            helpText: 'Twilio Conversational Intelligence service for AI ' +
                'call analysis. Leave unset to disable AI analysis.',
            allowEmpty: true
        }));

        if (items.length === 0) return safeNew(d.T, { text: "Voice config" });
        return safeNew(d.SP, {
            items: items.filter(function (c) { return c != null; }),
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.L
        }, "StackPanel(voice)");
    }

    /**
     * One field row — VIEW mode by default, swaps to EDIT when this
     * field is the active `voiceEditing` target. Uses a horizontal
     * StackPanel: label/value on left (grow:1), action button(s) right.
     */
    function buildVoiceFieldRow(d, spec) {
        var isEditing = STATE.console.voiceEditing === spec.field;
        var ButtonType = (component.Button && component.Button.Type) || {};
        var ButtonHierarchy = (component.Button && component.Button.Hierarchy) || {};

        var label = safeNew(d.T, {
            text: spec.label,
            type: d.T_Type.STRONG
        }, "Text(voice-label-" + spec.field + ")");

        // Help text — small weak text under the label, always visible.
        var help = safeNew(d.T, {
            text: spec.helpText,
            type: d.T_Type.WEAK,
            size: d.T.Size && d.T.Size.S
        }, "Text(voice-help-" + spec.field + ")");

        var labelStack = safeNew(d.SP, {
            items: [label, help].filter(function (c) { return c != null; }),
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.XXS
        }, "StackPanel(voice-label-" + spec.field + ")");

        var rightSide;
        if (isEditing) {
            rightSide = buildVoiceEditControls(d, spec);
        } else {
            rightSide = buildVoiceViewControls(d, spec, ButtonType, ButtonHierarchy);
        }

        // Card's Options has no `content` prop (only `children` for JSX,
        // plus title/text/image/tools). Wrapping in Card with `content`
        // renders an empty card. Use plain ContentPanel for padding and
        // let the parent StackPanel's itemGap provide row separation.
        var row = safeNew(d.SP, {
            items: [labelStack, rightSide].filter(function (c) { return c != null; }),
            orientation: d.SP_Orient.HORIZONTAL,
            itemGap: d.SP_Gap.L,
            justification: (d.SP.Justification && d.SP.Justification.SPACE_BETWEEN) || undefined
        }, "StackPanel(voice-row-" + spec.field + ")");

        if (d.CP) {
            return safeNew(d.CP, {
                content: row,
                outerGap: (d.CP_Gap && d.CP_Gap.M) || undefined,
                horizontalAlignment: d.CP_HAlign.STRETCH
            }, "ContentPanel(voice-row-pad-" + spec.field + ")") || row;
        }
        return row;
    }

    function buildVoiceViewControls(d, spec, ButtonType, ButtonHierarchy) {
        var valueText = spec.value
            ? safeNew(d.T, {
                text: spec.value,
                type: d.T_Type.DEFAULT
            }, "Text(voice-value-" + spec.field + ")")
            : safeNew(d.T, {
                text: '(not configured)',
                type: d.T_Type.WEAK
            }, "Text(voice-empty-" + spec.field + ")");

        var changeBtn = safeNew(component.Button, {
            label: 'Change',
            type: ButtonType.DEFAULT,
            action: function () { onVoiceChangeClick(spec.field, spec.allowEmpty); }
        }, "Button(voice-change-" + spec.field + ")");

        return safeNew(d.SP, {
            items: [valueText, changeBtn].filter(function (c) { return c != null; }),
            orientation: d.SP_Orient.HORIZONTAL,
            itemGap: d.SP_Gap.M
        }, "StackPanel(voice-view-" + spec.field + ")");
    }

    function buildVoiceEditControls(d, spec) {
        var ButtonType = (component.Button && component.Button.Type) || {};

        // Lists still loading? Show a placeholder.
        var listKey = voiceListKeyFor(spec.field);
        var list = STATE.console.voiceLists[listKey];
        if (list === null || STATE.console.voiceListsLoading) {
            var loader = safeNew(component.Loader, {
                label: "Loading from Twilio…",
                indeterminate: true
            }, "Loader(voice-list-" + spec.field + ")");
            return loader || safeNew(d.T, { text: "Loading from Twilio…" });
        }

        if (list.length === 0) {
            var emptyText = safeNew(d.T, {
                text: '(no items found in Twilio for this account)',
                type: d.T_Type.WEAK
            }, "Text(voice-empty-list-" + spec.field + ")");
            var cancelBtnE = safeNew(component.Button, {
                label: 'Cancel',
                type: ButtonType.DEFAULT,
                action: onVoiceCancelClick
            }, "Button(voice-cancel-empty-" + spec.field + ")");
            return safeNew(d.SP, {
                items: [emptyText, cancelBtnE].filter(function (c) { return c != null; }),
                orientation: d.SP_Orient.HORIZONTAL,
                itemGap: d.SP_Gap.M
            }, "StackPanel(voice-empty-edit-" + spec.field + ")");
        }

        // Normalize list items to { value, label } shape Dropdown expects.
        var normalized = list.map(function (it) {
            if (spec.field === 'phoneNumber') {
                return {
                    value: it.phoneNumber,
                    label: it.phoneNumber +
                        (it.friendlyName ? '  —  ' + it.friendlyName : '')
                };
            }
            // twimlApp / intelService — value=sid
            return {
                value: it.sid,
                label: (it.friendlyName || '(unnamed)') +
                    (it.sid ? '  [' + it.sid + ']' : '')
            };
        });

        var ds = new core.ArrayDataSource(normalized);
        var pending = STATE.console.voicePendingValue;

        var dropdown = safeNew(component.Dropdown, {
            dataSource: ds,
            valueMember: 'value',
            displayMember: 'label',
            selectedValue: pending || (spec.allowEmpty ? null : normalized[0].value),
            allowEmpty: !!spec.allowEmpty,
            placeholder: spec.allowEmpty ? '(none)' : 'Select…',
            onSelectionChanged: function (args) {
                STATE.console.voicePendingValue = (args && args.value) || null;
            }
        }, "Dropdown(voice-edit-" + spec.field + ")");

        var saving = !!STATE.console.voiceSaving;
        var saveBtn = safeNew(component.Button, {
            label: saving ? 'Saving…' : 'Save',
            type: ButtonType.PRIMARY,
            enabled: !saving,
            action: function () { onVoiceSaveClick(spec.field); }
        }, "Button(voice-save-" + spec.field + ")");

        var cancelBtn = safeNew(component.Button, {
            label: 'Cancel',
            type: ButtonType.DEFAULT,
            enabled: !saving,
            action: onVoiceCancelClick
        }, "Button(voice-cancel-" + spec.field + ")");

        return safeNew(d.SP, {
            items: [dropdown, saveBtn, cancelBtn].filter(function (c) { return c != null; }),
            orientation: d.SP_Orient.HORIZONTAL,
            itemGap: d.SP_Gap.S
        }, "StackPanel(voice-edit-" + spec.field + ")");
    }

    function voiceListKeyFor(field) {
        if (field === 'twimlAppSid')     return 'twimlApps';
        if (field === 'phoneNumber')     return 'phoneNumbers';
        if (field === 'intelServiceSid') return 'intelServices';
        return null;
    }

    function voiceActionFor(field) {
        if (field === 'twimlAppSid')     return 'wizardListTwiMLApps';
        if (field === 'phoneNumber')     return 'wizardListPhoneNumbers';
        if (field === 'intelServiceSid') return 'wizardListIntelServices';
        return null;
    }

    function onVoiceChangeClick(field, allowEmpty) {
        STATE.console.voiceEditing = field;
        STATE.console.voiceError = null;
        var snap = STATE.console.snapshot || {};
        STATE.console.voicePendingValue = snap[field] || null;

        var listKey = voiceListKeyFor(field);
        // Already cached? Just rerender — Dropdown picks it up immediately.
        if (STATE.console.voiceLists[listKey] !== null) {
            rerender();
            return;
        }

        STATE.console.voiceListsLoading = true;
        rerender();

        wizardCall(voiceActionFor(field), {})
            .then(function (p) {
                STATE.console.voiceLists[listKey] = (p && p.items) || [];
                STATE.console.voiceListsLoading = false;
                rerender();
            })
            .catch(function (e) {
                STATE.console.voiceListsLoading = false;
                STATE.console.voiceError = 'Could not load list: ' +
                    (e && e.message ? e.message : String(e));
                STATE.console.voiceEditing = null;
                rerender();
            });
    }

    function onVoiceCancelClick() {
        STATE.console.voiceEditing = null;
        STATE.console.voicePendingValue = null;
        STATE.console.voiceError = null;
        rerender();
    }

    function onVoiceSaveClick(field) {
        var snap = STATE.console.snapshot || {};
        var newValue = STATE.console.voicePendingValue;

        // No-op if value didn't change — just exit EDIT mode.
        if (newValue === snap[field]) {
            STATE.console.voiceEditing = null;
            STATE.console.voicePendingValue = null;
            rerender();
            return;
        }

        // wizardSaveVoice takes all three; pass the new value for the
        // active field and pass-through the snapshot's current values
        // for the other two so we don't accidentally clear them.
        var payload = {
            twimlAppSid:     snap.twimlAppSid     || '',
            phoneNumber:     snap.phoneNumber     || '',
            intelServiceSid: snap.intelServiceSid || ''
        };
        payload[field] = newValue || '';

        STATE.console.voiceSaving = true;
        STATE.console.voiceError = null;
        rerender();

        wizardCall('wizardSaveVoice', payload)
            .then(function (p) {
                STATE.console.voiceSaving = false;
                if (p && p.saved) {
                    // Refresh snapshot so the new value is reflected on the row.
                    snap[field] = newValue;
                    STATE.console.snapshot = snap;
                    STATE.console.voiceEditing = null;
                    STATE.console.voicePendingValue = null;
                    rerender();
                } else {
                    STATE.console.voiceError = 'Save failed: ' +
                        ((p && p.error) || 'unknown');
                    rerender();
                }
            })
            .catch(function (e) {
                STATE.console.voiceSaving = false;
                STATE.console.voiceError = 'Network error saving: ' +
                    (e && e.message ? e.message : String(e));
                rerender();
            });
    }

    /* ────────────────────────────────────────────────────────────────── */
    /* U5 — Credentials section (Phase 3c — view-only)                    */
    /* ────────────────────────────────────────────────────────────────── */

    /**
     * Credentials section: view-only display of Twilio public identifiers
     * (Account SID, API Key SID) + NetSuite secret pointer (script ID).
     *
     * Why view-only (no inline editing):
     *   - The API Key Secret VALUE is held in NetSuite API Secrets
     *     (Setup > Company > Preferences > API Secrets) and CANNOT be
     *     exposed to SuiteScript at runtime — N/https.createSecureString
     *     returns an opaque handle, not the plaintext. SuiteScript can't
     *     read it, so the SPA can't display or rotate it.
     *   - Rotating the secret requires generating a new API Key in the
     *     Twilio Console (external) AND updating the value at NetSuite
     *     API Secrets (external). Neither step is doable from this SPA.
     *
     * UX: list the values + give a one-click deep-link to the NetSuite
     * API Secrets page. Include rotation instructions inline so admins
     * have a clear runbook.
     */
    function buildCredentialsSection(d) {
        var snap = STATE.console.snapshot || {};
        var items = [];

        var heading = safeNew(d.H, {
            content: "Credentials",
            type: d.H_Type.MEDIUM_HEADING
        }, "Heading(credentials)");
        if (heading) items.push(heading);

        var intro = safeNew(d.T, {
            text: "Twilio public identifiers and NetSuite secret pointer. " +
                  "These values are safe to view; the API Key Secret value " +
                  "itself is held in NetSuite's encrypted vault and is " +
                  "never exposed to scripts.",
            type: d.T_Type.WEAK
        }, "Text(credentials-intro)");
        if (intro) items.push(intro);

        // The three credential rows.
        items.push(buildCredentialRow(d, {
            label: 'Account SID',
            value: snap.accountSid || '(not set)',
            help: 'Public identifier for your Twilio account. Safe to view; ' +
                  'used by SuiteScript to address the Twilio REST API.'
        }));

        items.push(buildCredentialRow(d, {
            label: 'API Key SID',
            value: snap.apiKeySid || '(not set)',
            help: 'Public identifier for the scoped API Key. Pairs with the ' +
                  'secret value to authenticate REST calls.'
        }));

        items.push(buildCredentialRow(d, {
            label: 'API Key Secret pointer',
            value: snap.apiSecretId || '(not set)',
            help: 'Script ID of the NetSuite API Secret holding the secret ' +
                  'value. The actual secret stays encrypted in NetSuite ' +
                  "and is never exposed to SuiteScript at runtime."
        }));

        // Manage button — deep-link to the NetSuite API Secrets page in a
        // new tab so the admin doesn't lose console context.
        var ButtonType = (component.Button && component.Button.Type) || {};
        var manageBtn = safeNew(component.Button, {
            label: 'Open NetSuite API Secrets ↗',
            type: ButtonType.DEFAULT,
            action: function () {
                try {
                    window.open('/app/common/scripting/secrets/settings.nl', '_blank');
                } catch (e) { /* ignore */ }
            }
        }, "Button(open-api-secrets)");
        if (manageBtn) items.push(manageBtn);

        // Rotation runbook callout — separate visual block so admins can
        // find it quickly during a rotation event.
        items.push(buildSecretRotationRunbook(d));

        return safeNew(d.SP, {
            items: items.filter(function (c) { return c != null; }),
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.L
        }, "StackPanel(credentials)");
    }

    function buildCredentialRow(d, spec) {
        var labelText = safeNew(d.T, {
            text: spec.label,
            type: d.T_Type.STRONG
        }, "Text(cred-label)");

        var valueText = safeNew(d.T, {
            text: spec.value,
            type: d.T_Type.DEFAULT
        }, "Text(cred-value)");

        var helpText = safeNew(d.T, {
            text: spec.help,
            type: d.T_Type.WEAK,
            size: d.T && d.T.Size ? d.T.Size.S : undefined
        }, "Text(cred-help)");

        var inner = safeNew(d.SP, {
            items: [labelText, valueText, helpText].filter(function (c) { return c != null; }),
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.XXS
        }, "StackPanel(cred-row-inner)");

        // Wrap each row in a ContentPanel for consistent padding with
        // the Voice section rows. (Card.content doesn't exist — recipe §21.)
        if (!d.CP) return inner;
        return safeNew(d.CP, {
            content: inner,
            outerGap: (d.CP_Gap && d.CP_Gap.M) || undefined,
            horizontalAlignment: d.CP_HAlign.STRETCH
        }, "ContentPanel(cred-row-" + spec.label + ")") || inner;
    }

    /**
     * Rotation runbook — orange-bordered callout block with the 3-step
     * procedure. Same callout-box pattern as the Health Danger zone
     * (recipe §21: ContentPanel + rootStyle border).
     */
    function buildSecretRotationRunbook(d) {
        var title = safeNew(d.H, {
            content: "Rotating the API Key Secret",
            type: d.H_Type.SMALL_HEADING
        }, "Heading(rotation-runbook)");

        var intro = safeNew(d.T, {
            text: "Twilio recommends rotating API Key Secrets every 90 days. " +
                  "The rotation happens in two external systems:",
            type: d.T_Type.WEAK
        }, "Text(rotation-intro)");

        var step1 = safeNew(d.T, {
            text: "1. In the Twilio Console, generate a new API Key Secret " +
                  "(Account > API keys & tokens > Create API key). Save the " +
                  "Secret value — Twilio shows it only once."
        }, "Text(rotation-step-1)");

        var step2 = safeNew(d.T, {
            text: "2. In NetSuite, navigate to Setup > Company > Preferences " +
                  "> API Secrets. Edit the secret with script ID matching " +
                  "the pointer above. Paste the new Twilio Secret value. Save."
        }, "Text(rotation-step-2)");

        var step3 = safeNew(d.T, {
            text: "3. Return to this console's Health section and click " +
                  "Re-run on Preflight to verify the new secret authenticates."
        }, "Text(rotation-step-3)");

        var inner = safeNew(d.SP, {
            items: [title, intro, step1, step2, step3].filter(function (c) { return c != null; }),
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.S
        }, "StackPanel(rotation-inner)");

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
        }, "ContentPanel(rotation-callout)") || inner;
    }

    /* ────────────────────────────────────────────────────────────────── */
    /* U6 — Health section (Phase 3a)                                     */
    /* ────────────────────────────────────────────────────────────────── */

    /**
     * U6: Health section — three sub-blocks:
     *   1. Preflight    — re-run button + 5 check rows
     *   2. Drift        — 3 detector rows (client-computed)
     *   3. Danger zone  — Deactivate with two-click confirm
     */
    function buildHealthSection(d) {
        var items = [];

        var heading = safeNew(d.H, {
            content: "Health",
            type: d.H_Type.MEDIUM_HEADING
        }, "Heading(health)");
        if (heading) items.push(heading);

        var preflightBlock = buildHealthPreflightBlock(d);
        if (preflightBlock) items.push(preflightBlock);

        var driftBlock = buildHealthDriftBlock(d);
        if (driftBlock) items.push(driftBlock);

        var dangerBlock = buildHealthDangerZone(d);
        if (dangerBlock) items.push(dangerBlock);

        if (STATE.console.actionError) {
            var err = safeNew(d.T, {
                text: "✕ " + STATE.console.actionError,
                type: d.T_Type.STRONG
            }, "Text(health-error)");
            if (err) items.push(err);
        }

        if (items.length === 0) return safeNew(d.T, { text: "Health" });
        return safeNew(d.SP, {
            items: items,
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.L
        }, "StackPanel(health)");
    }

    function buildHealthPreflightBlock(d) {
        var ButtonType = (component.Button && component.Button.Type) || {};

        var sectionHeader = safeNew(d.H, {
            content: "Preflight",
            type: d.H_Type.SMALL_HEADING
        }, "Heading(health-preflight)");

        var rerunBtn = safeNew(component.Button, {
            label: "↻ Re-run",
            type: ButtonType.DEFAULT,
            action: function () {
                wizardCall('wizardRunPreflight', {}).then(function (p) {
                    STATE.console.preflight = (p && p.checks) || [];
                    rerender();
                }).catch(function (e) {
                    STATE.console.actionError = 'Preflight failed: ' +
                        (e && e.message ? e.message : String(e));
                    rerender();
                });
            }
        }, "Button(rerun-preflight)");

        var headerRow = safeNew(d.SP, {
            items: [sectionHeader, rerunBtn].filter(function (c) { return c != null; }),
            orientation: d.SP_Orient.HORIZONTAL,
            itemGap: d.SP_Gap.S
        }, "StackPanel(preflight-header-row)");

        var preflight = STATE.console.preflight;
        var bodyContent;
        if (preflight === null || preflight === undefined) {
            bodyContent = safeNew(d.T, {
                text: "Preflight not yet run. Click Re-run to check.",
                type: d.T_Type.WEAK
            }, "Text(preflight-loading)");
        } else if (preflight.length === 0) {
            bodyContent = safeNew(d.T, {
                text: "No checks returned.",
                type: d.T_Type.WEAK
            }, "Text(preflight-empty)");
        } else {
            bodyContent = buildHealthChecksDataGrid(d, preflight, 'preflight');
        }

        return safeNew(d.SP, {
            items: [headerRow, bodyContent].filter(function (c) { return c != null; }),
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.M
        }, "StackPanel(preflight-block)");
    }

    function buildHealthDriftBlock(d) {
        var sectionHeader = safeNew(d.H, {
            content: "Drift detectors",
            type: d.H_Type.SMALL_HEADING
        }, "Heading(health-drift)");

        var drift = STATE.console.drift || {};
        var detectors = [
            { id: 'voiceUrl',     label: 'TwiML VoiceUrl',  status: drift.voiceUrl || 'unknown' },
            { id: 'phoneNumbers', label: 'Phone number list', status: drift.phoneNumbers || 'unknown' },
            { id: 'intelService', label: 'Intel Service',   status: drift.intelService || 'unknown' }
        ];
        // Map drift status → check-row status so the grid renderer can
        // reuse the same Badge logic as preflight checks.
        var statusMap = {
            'in-sync': { status: 'pass', detail: 'In sync with Twilio' },
            'drift':   { status: 'warn', detail: 'Drift detected — review section for details' },
            'not-configured': { status: 'info_disabled', detail: 'Not configured' },
            'unknown': { status: 'info_disabled', detail: 'Drift detection requires data load' }
        };

        var checks = detectors.map(function (det) {
            var mapped = statusMap[det.status] || statusMap.unknown;
            return {
                id: det.id,
                label: det.label,
                status: mapped.status,
                detail: mapped.detail
            };
        });

        var grid = buildHealthChecksDataGrid(d, checks, 'drift');

        return safeNew(d.SP, {
            items: [sectionHeader, grid].filter(function (c) { return c != null; }),
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.M
        }, "StackPanel(drift-block)");
    }

    /**
     * U6.5 (Phase 3b): shared DataGrid for both Preflight + Drift blocks
     * in the Health section. Same UIF DataGrid pattern as Phones — gives
     * consistent layout, column alignment, and visual treatment.
     *
     * Input `checks` shape per buildCheckRow: { id, label, status, detail }
     * where status is 'pass' | 'fail' | 'warn' | 'info_enabled' | 'info_disabled'
     *
     * Two columns:
     *   1. Status (TEMPLATED, 80px) — Badge with check/cross/warn glyph
     *   2. Check  (TEMPLATED, flex) — bold label + detail line below
     */
    function buildHealthChecksDataGrid(d, checks, gridName) {
        // Match Phones DataGrid guard: only check DataGrid itself. TC is a
        // namespace member, not a top-level class — we don't use it for
        // construction (columns are plain options objects per UIF recipe
        // §13-14). Earlier guard `!d.TC` forced every render into the
        // StackPanel fallback because component.TemplatedColumn resolves
        // to undefined at the top-level grab.
        if (!d.DG) {
            console.warn("[CTC] DataGrid component unavailable; health falling back to StackPanel");
            var fallbackRows = (checks || []).map(function (c) {
                return buildCheckRow(c);
            }).filter(function (r) { return r != null; });
            if (fallbackRows.length === 0) return null;
            return safeNew(d.SP, {
                items: fallbackRows,
                orientation: d.SP_Orient.VERTICAL,
                itemGap: d.SP_Gap.M
            }, "StackPanel(health-checks-fallback-" + gridName + ")");
        }

        if (!checks || checks.length === 0) return null;

        var rowsDs;
        try {
            rowsDs = new d.Ads(checks);
        } catch (e) {
            console.error("[CTC] Health checks ArrayDataSource failed:", e);
            return null;
        }

        var CT = (d.DG && d.DG.ColumnType) || {};

        var statusColDef = {
            type: CT.TEMPLATED,
            name: 'status',
            label: 'Status',
            // Per UIF catalog: stretchFactor is the proper proportional-
            // weight prop when columnStretch:true. width is fixed pixels.
            stretchFactor: 1,
            content: function (args) {
                try {
                    var row = args && args.cell && args.cell.row &&
                              args.cell.row.dataItem;
                    if (!row) return safeNew(d.T, { text: '—' });
                    return badgeFor(row.status) || safeNew(d.T, { text: row.status });
                } catch (e) {
                    console.error("[CTC] Health status column threw:", e);
                    return safeNew(d.T, { text: '?' });
                }
            }
        };

        var checkColDef = {
            type: CT.TEMPLATED,
            name: 'check',
            label: 'Check',
            stretchFactor: 3,  // proportional weight — label column
            content: function (args) {
                try {
                    var row = args && args.cell && args.cell.row &&
                              args.cell.row.dataItem;
                    if (!row) return safeNew(d.T, { text: '—' });
                    return safeNew(d.T, {
                        text: row.label || '',
                        type: d.T_Type.STRONG
                    }, "Text(check-label)");
                } catch (e) {
                    console.error("[CTC] Health check column threw:", e);
                    return safeNew(d.T, { text: '(error)' });
                }
            }
        };

        var detailColDef = {
            type: CT.TEMPLATED,
            name: 'detail',
            label: 'Detail',
            stretchFactor: 6,  // proportional weight — wider for prose
            content: function (args) {
                try {
                    var row = args && args.cell && args.cell.row &&
                              args.cell.row.dataItem;
                    if (!row || !row.detail) return safeNew(d.T, {
                        text: '—',
                        type: d.T_Type.WEAK
                    });
                    return safeNew(d.T, {
                        text: row.detail,
                        type: d.T_Type.WEAK
                    }, "Text(check-detail)");
                } catch (e) {
                    console.error("[CTC] Health detail column threw:", e);
                    return safeNew(d.T, { text: '(error)' });
                }
            }
        };

        var grid = safeNew(d.DG, {
            dataSource: rowsDs,
            columns: [statusColDef, checkColDef, detailColDef],
            columnStretch: true,
            highlightRowsOnHover: true,
            stripedRows: true,
            dataRowHeight: 48,
            headerRowHeight: 40,
            rootStyle: { width: '100%' }
        }, "DataGrid(health-" + gridName + ")");

        return grid;
    }

    function buildHealthDangerZone(d) {
        var snap = STATE.console.snapshot || {};
        var isPaused = snap.active === false;

        // Hide entire Danger zone when CTC is already paused — the top
        // banner already provides a Reactivate path, so duplicating it
        // here just adds noise. Render only when there's something to
        // do (deactivate a live install).
        if (isPaused) return null;

        var ButtonType = (component.Button && component.Button.Type) || {};

        var sectionHeader = safeNew(d.H, {
            content: "Danger zone",
            type: d.H_Type.SMALL_HEADING
        }, "Heading(danger-zone)");

        var description = safeNew(d.T, {
            text: "Deactivate Click-to-Call: reps lose phone-icon access " +
                  "across all roles. In-progress calls finish normally; new " +
                  "calls cannot be placed. Reactivate any time.",
            type: d.T_Type.WEAK,
            size: d.T && d.T.Size ? d.T.Size.S : undefined
        }, "Text(danger-desc)");

        var buttons = [];
        if (STATE.console.pendingDeactivateConfirm) {
            // Two-click confirm — show Cancel + Confirm
            var cancelBtn = safeNew(component.Button, {
                label: "Cancel",
                type: ButtonType.DEFAULT,
                action: function () {
                    STATE.console.pendingDeactivateConfirm = false;
                    rerender();
                }
            }, "Button(cancel-deactivate)");
            if (cancelBtn) buttons.push(cancelBtn);

            var confirmBtn = safeNew(component.Button, {
                label: "Confirm deactivate",
                type: ButtonType.DANGER || ButtonType.DEFAULT,
                action: onDeactivateClick
            }, "Button(confirm-deactivate)");
            if (confirmBtn) buttons.push(confirmBtn);
        } else {
            // Default state — just the Deactivate button
            var deactivateBtn = safeNew(component.Button, {
                label: "Deactivate",
                type: ButtonType.DANGER || ButtonType.DEFAULT,
                action: onDeactivateClick
            }, "Button(deactivate)");
            if (deactivateBtn) buttons.push(deactivateBtn);
        }

        var deactivateErrorText = STATE.console.deactivateError ? safeNew(d.T, {
            text: "✕ Deactivate failed: " + STATE.console.deactivateError,
            type: d.T_Type.STRONG
        }, "Text(deactivate-error)") : null;

        var buttonRow = buttons.length > 0 ? safeNew(d.SP, {
            items: buttons,
            orientation: d.SP_Orient.HORIZONTAL,
            itemGap: d.SP_Gap.S
        }, "StackPanel(danger-buttons)") : null;

        var inner = safeNew(d.SP, {
            items: [sectionHeader, description, buttonRow, deactivateErrorText]
                .filter(function (c) { return c != null; }),
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.S
        }, "StackPanel(danger-zone)");

        // Callout-style border (UIF has no dedicated "danger box" — wrap
        // in ContentPanel with rootStyle border + inset padding to match
        // the wireframe). Subtle red border + light tinted background
        // signals destructiveness without shouting.
        if (!d.CP) return inner;
        return safeNew(d.CP, {
            content: inner,
            outerGap: (d.CP_Gap && d.CP_Gap.M) || undefined,
            horizontalAlignment: d.CP_HAlign.STRETCH,
            rootStyle: {
                border: '1px solid #D33A2C',
                borderRadius: '8px',
                backgroundColor: '#FDF4F3',
                padding: '16px 20px'
            }
        }, "ContentPanel(danger-zone-callout)") || inner;
    }

    /* ────────────────────────────────────────────────────────────────── */
    /* U3 — Phones & reps section (Phase 3b)                              */
    /* ────────────────────────────────────────────────────────────────── */

    /**
     * U3: Phones & reps — DataGrid with inline MultiselectDropdown
     * editing. Per row: phone number + assigned reps (multi-select cell,
     * save-on-change) + status badge + (deferred to U3.b) row actions.
     *
     * Data sources:
     *   - rows: STATE.console.assignments (wizardLoadAssignments)
     *   - rep options: STATE.console.phonesEmployees (wizardListEmployees)
     */
    function buildPhonesSection(d) {
        var items = [];

        var heading = safeNew(d.H, {
            content: "Phones & reps",
            type: d.H_Type.MEDIUM_HEADING
        }, "Heading(phones)");
        if (heading) items.push(heading);

        // ── Loading state (initial fetch) ─────────────────────────────
        if (STATE.console.phonesLoading) {
            var loader = safeNew(component.Loader, {
                label: "Loading phones & reps…",
                indeterminate: true
            }, "Loader(phones)");
            if (loader) items.push(loader);
            return safeNew(d.SP, {
                items: items,
                orientation: d.SP_Orient.VERTICAL,
                itemGap: d.SP_Gap.L
            }, "StackPanel(phones-loading)") || heading;
        }

        // ── Toolbar (refresh + add) ───────────────────────────────────
        var toolbar = buildPhonesToolbar(d);
        if (toolbar) items.push(toolbar);

        // ── Error surface ─────────────────────────────────────────────
        if (STATE.console.phonesError) {
            var err = safeNew(d.T, {
                text: "✕ " + STATE.console.phonesError,
                type: d.T_Type.STRONG
            }, "Text(phones-error)");
            if (err) items.push(err);
        }

        // ── DataGrid ──────────────────────────────────────────────────
        var grid = buildPhonesDataGrid(d);
        if (grid) items.push(grid);

        // ── Empty-state hint ──────────────────────────────────────────
        var grouped = STATE.console.phonesByPhone || [];
        if (grouped.length === 0) {
            var emptyText = safeNew(d.T, {
                text: "No phone numbers configured yet. Click \"Add phone " +
                      "number\" above to claim a Twilio number and assign reps.",
                type: d.T_Type.WEAK
            }, "Text(phones-empty)");
            if (emptyText) items.push(emptyText);
        }

        if (items.length === 0) return safeNew(d.T, { text: "Phones & reps" });
        return safeNew(d.SP, {
            items: items,
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.XL  // bumped from L for more vertical breathing room
        }, "StackPanel(phones)");
    }

    /**
     * U3: ToolBar above the DataGrid — Refresh from Twilio + Add phone
     * number. "Add phone number" deep-links to Step 4 of the wizard
     * for now (temporary fallback — a dedicated Add Modal is a Phase 3b
     * stretch goal, tracked separately).
     */
    function buildPhonesToolbar(d) {
        var ButtonType = (component.Button && component.Button.Type) || {};

        var refreshBtn = safeNew(component.Button, {
            label: "Refresh from Twilio",
            type: ButtonType.DEFAULT,
            startIcon: d.SysIcon && d.SysIcon.REFRESH,
            action: function () { loadPhonesData(); }
        }, "Button(phones-refresh)");

        var addBtn = safeNew(component.Button, {
            label: "Add phone number",
            type: ButtonType.PRIMARY,
            startIcon: d.SysIcon && d.SysIcon.ADD,
            action: function () {
                // Temporary: deep-link to Step 4 for the full add flow.
                // A dedicated Add Modal lives in a follow-up unit.
                goToStep(4);
            }
        }, "Button(phones-add)");

        var buttons = [refreshBtn, addBtn].filter(function (b) { return b != null; });
        if (buttons.length === 0) return null;

        return safeNew(d.SP, {
            items: buttons,
            orientation: d.SP_Orient.HORIZONTAL,
            itemGap: d.SP_Gap.S
        }, "StackPanel(phones-toolbar)");
    }

    /**
     * U3: DataGrid with three columns:
     *   1. Phone number       (TEMPLATED — formatted number + PN-SID)
     *   2. Assigned reps      (MULTISELECT_DROPDOWN — inline edit)
     *   3. Status             (TEMPLATED — Badge: Live / No reps)
     *
     * Per UIF d.ts: MultiselectDropdownColumn accepts `dataSource`,
     * `displayMember`, `valueMember`, and `widgetOptions` (which can be
     * a callback returning per-row options). We use the callback to
     * wire the per-row `onSelectionChanged` to onPhonesRowSelectionChanged.
     *
     * `args.values` shape per the U9b learning — NOT `args.items`.
     */
    function buildPhonesDataGrid(d) {
        if (!d.DG) {
            console.warn("[CTC] DataGrid component unavailable; falling back to text");
            return buildPhonesFallback(d);
        }

        var grouped = STATE.console.phonesByPhone || [];
        var employees = STATE.console.phonesEmployees || [];

        if (grouped.length === 0) return null;

        // ArrayDataSource constructors. Per core.d.ts: new ArrayDataSource(array).
        var rowsDs, employeesDs;
        try {
            rowsDs = new d.Ads(grouped);
            employeesDs = new d.Ads(employees);
        } catch (e) {
            console.error("[CTC] ArrayDataSource construction failed:", e);
            return buildPhonesFallback(d);
        }

        // Per d.ts (component.d.ts:4571): DataGrid.columns expects an
        // ARRAY OF OPTIONS OBJECTS (ColumnDefinition = TemplatedColumn.Options
        // | MultiselectDropdownColumn.Options | ...), NOT an array of
        // constructed column instances. My U3-first-attempt wrapped each
        // column in safeNew() which built instances — DataGrid construction
        // silently failed because those aren't valid ColumnDefinitions.
        // Plain plain options objects work.
        //
        // GridColumn.Options required fields: `type` (ColumnType enum) +
        // `name` (string identifier). `valueMember` is NOT on the column
        // Options; it lives in widgetOptions (MultiselectDropdown.Options).
        var CT = (d.DG && d.DG.ColumnType) || {};
        var BdgType = (d.Bdg && d.Bdg.Type) || {};

        // Truncate the PN-SID so it fits the cell without wrapping over
        // the phone number text above it. Twilio SIDs are 34 chars; show
        // first 6 + last 4 with ellipsis (e.g., "PN4650…3988e").
        function truncSid(sid) {
            if (!sid) return '';
            if (sid.length <= 14) return sid;
            return sid.slice(0, 6) + '…' + sid.slice(-4);
        }

        // Per MEMORY.md DataGrid learning: with columnStretch: true,
        // `width` on each column acts as a PROPORTIONAL WEIGHT (not a
        // fixed pixel). Without width on a column, it collapses to
        // minimum width. So reps column NEEDS a width or it stays
        // narrow and chips can't render. Widths chosen so reps gets
        // the most space (it has the largest content — chip list).
        var phoneColDef = {
            type: CT.TEMPLATED,
            name: 'phone',
            label: 'Phone number',
            // Per UIF catalog (DataGrid > Columns > Column Sizing):
            // when columnStretch:true, use `stretchFactor` for the
            // fraction-of-available-width weight. `width` is a fixed
            // pixel size and CAPS the grid at sum-of-widths.
            stretchFactor: 2,
            content: function (args) {
                try {
                    var row = args && args.cell && args.cell.row &&
                              args.cell.row.dataItem;
                    if (!row) return safeNew(d.T, { text: '—' });
                    var top = safeNew(d.T, {
                        text: row.phoneNumber || '(unknown)',
                        type: d.T_Type.STRONG
                    }, "Text(phone-top)");
                    var sub = safeNew(d.T, {
                        text: truncSid(row.phoneSid),
                        type: d.T_Type.WEAK,
                        size: d.T.Size && d.T.Size.S
                    }, "Text(phone-sub)");
                    return safeNew(d.SP, {
                        items: [top, sub].filter(function (c) { return c != null; }),
                        orientation: d.SP_Orient.VERTICAL,
                        itemGap: d.SP_Gap.XXS
                    }, "StackPanel(phone-cell)") || top || safeNew(d.T, { text: row.phoneNumber || '' });
                } catch (e) {
                    console.error("[CTC] phone column template threw:", e);
                    return safeNew(d.T, { text: '(error)' });
                }
            }
        };

        // U3 fix #3: chips displayed "undefined" because bindToValue
        // didn't resolve displayMember from raw ID values — the cell
        // had selected IDs but couldn't look up the corresponding
        // employee names. Drop bindToValue + binding entirely; instead
        // resolve selectedItems to full employee OBJECTS per-row in
        // widgetOptions. The widget then has full objects to read
        // .name from for chip labels.
        var IM = (d.DG && d.DG.InputMode) || {};

        // U3 fix #5: chips display "undefined" because column-level
        // `displayMember: 'name'` (string) only works when bound values
        // are full objects (it does `value['name']`). With binding:
        // 'employeeIds', the cell receives Numbers like [120, 124, 131]
        // and tries `(120)['name']` → undefined. Per d.ts (DisplayMember
        // = string | DisplayMemberCallback), use a CALLBACK that does
        // the lookup explicitly: takes an ID, finds the matching
        // employee, returns the name.
        function repsDisplayMember(value) {
            // value is whatever the cell extracted from row.employeeIds —
            // could be Number, String, or full employee object depending
            // on how the widget passes it.
            if (value && typeof value === 'object') {
                return value.name || '';
            }
            var id = Number(value);
            var emp = (STATE.console.phonesEmployees || []).find(function (e) {
                return e.id === id;
            });
            return emp ? emp.name : '';
        }

        var repsColDef = {
            type: CT.MULTI_SELECT_DROPDOWN,
            name: 'reps',
            label: 'Assigned reps',
            // Largest fraction — reps chips need the most horizontal room.
            stretchFactor: 5,
            // binding: 'employeeIds' tells the column to read that row
            // property (without it, the column defaults to row[name] =
            // row.reps which doesn't exist).
            binding: 'employeeIds',
            inputMode: IM.EDIT_ONLY,
            dataSource: employeesDs,
            displayMember: repsDisplayMember,
            editable: true,
            widgetOptions: function (row) {
                var dataItem = (row && row.dataItem) || {};
                var phoneSid = dataItem.phoneSid;
                return {
                    dataSource: employeesDs,
                    valueMember: 'id',
                    displayMember: 'name',
                    placeholder: 'Pick reps',
                    onSelectionChanged: function (args) {
                        // args.values may be IDs (with valueMember) OR full
                        // objects depending on UIF version — handle both.
                        var newIds = ((args && args.values) || []).map(function (v) {
                            if (v && typeof v === 'object') return Number(v.id);
                            return Number(v);
                        });
                        if (phoneSid) {
                            onPhonesRowSelectionChanged(phoneSid, newIds);
                        }
                    }
                };
            }
        };

        var statusColDef = {
            type: CT.TEMPLATED,
            name: 'status',
            label: 'Status',
            stretchFactor: 1,
            content: function (args) {
                try {
                    var row = args && args.cell && args.cell.row &&
                              args.cell.row.dataItem;
                    if (!row) return safeNew(d.T, { text: '—' });
                    var saving = STATE.console.phonesSaving[row.phoneSid];
                    var hasReps = (row.employeeIds || []).length > 0;
                    if (saving) {
                        return safeNew(d.Bdg, {
                            content: 'Saving…',
                            type: BdgType.SUBTLE
                        }, "Badge(saving)") || safeNew(d.T, { text: 'Saving…' });
                    } else if (hasReps) {
                        return safeNew(d.Bdg, {
                            content: '✓ Live',
                            type: BdgType.SOLID
                        }, "Badge(live)") || safeNew(d.T, { text: '✓ Live' });
                    }
                    return safeNew(d.Bdg, {
                        content: 'No reps',
                        type: BdgType.SUBTLE
                    }, "Badge(no-reps)") || safeNew(d.T, { text: 'No reps' });
                } catch (e) {
                    console.error("[CTC] status column template threw:", e);
                    return safeNew(d.T, { text: '(error)' });
                }
            }
        };

        var columns = [phoneColDef, repsColDef, statusColDef];

        var grid = safeNew(d.DG, {
            dataSource: rowsDs,
            columns: columns,
            columnStretch: true,
            highlightRowsOnHover: true,
            stripedRows: true,
            dataRowHeight: 72,        // bumped from 64 for breathing room
            headerRowHeight: 44,      // taller header for readability
            editable: true,
            rootStyle: { width: '100%' }
        }, "DataGrid(phones)");
        if (!grid) {
            console.warn("[CTC] DataGrid construction returned null; using text fallback");
            return buildPhonesFallback(d);
        }
        // Horizontal margins are handled by section-level wrapContent
        // (single source of truth — see comments there). The section's
        // own StackPanel itemGap provides vertical breathing room
        // between toolbar / grid / empty-state hint.
        return grid;
    }

    /**
     * U3: text-only fallback when DataGrid or its column types aren't
     * available at runtime. Renders rows as a vertical stack of Text
     * lines so admin still sees the data.
     */
    function buildPhonesFallback(d) {
        var grouped = STATE.console.phonesByPhone || [];
        var rows = grouped.map(function (g) {
            var label = (g.phoneNumber || '(unknown)') + ' — ' +
                        (g.employeeIds || []).length + ' rep(s)';
            return safeNew(d.T, { text: label }, "Text(phone-row)");
        }).filter(function (r) { return r != null; });
        if (rows.length === 0) return null;
        return safeNew(d.SP, {
            items: rows,
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.XS
        }, "StackPanel(phones-fallback)");
    }

    /**
     * Step-router for the body content. Dispatches on CURRENT_STEP and
     * builds the appropriate per-step UI. Stash the outer container on
     * a module-level variable so async actions can swap its content.
     */
    function buildStepBodyContainer(d) {
        var initial;
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
            initial = buildStep5Activate(d);
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
    function buildNavFooter(d) {
        var ButtonType = (component.Button && component.Button.Type) || {};

        var backBtn = (CURRENT_STEP > 1) ? safeNew(component.Button, {
            label: "Back",
            type: ButtonType.DEFAULT,
            action: function () { goToStep(CURRENT_STEP - 1); }
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
            goToStep(2);
            return;
        }
        if (CURRENT_STEP === 2) {
            wizardCall('wizardSavePublicIds', {
                accountSid:   STATE.step2.accountSid,
                apiKeySid:    STATE.step2.apiKeySid,
                apiSecretId:  STATE.step2.apiSecretId
            }).then(function (payload) {
                if (payload && payload.saved) goToStep(3);
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
                if (payload && payload.saved) goToStep(4);
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
            var rows = [];
            var phoneNumbers = STATE.step4.phoneNumbers || [];
            for (var i = 0; i < phoneNumbers.length; i++) {
                var pn = phoneNumbers[i];
                var assignment = STATE.step4.assignments[pn.sid] || {};
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
                if (payload && payload.saved) goToStep(5);
                else alert("Save failed: " +
                    ((payload && payload.error) || 'unknown'));
            }).catch(function (e) {
                alert("Network error saving Step 4: " +
                    (e && e.message ? e.message : String(e)));
            });
            return;
        }
        goToStep(CURRENT_STEP + 1);
    }

    /* ────────────────────────────────────────────────────────────────── */
    /* Step 2 — Connect Twilio                                            */
    /* ────────────────────────────────────────────────────────────────── */

    function buildStep2Form(d) {
        var rows = [];

        rows.push(safeNew(d.H, {
            content: "Connect to your Twilio account",
            type: d.H_Type.MEDIUM_HEADING
        }, "Heading(step2)"));

        rows.push(safeNew(d.T, {
            text: "Enter your Twilio Account SID and API Key SID. " +
                  "The API Key Secret must already exist in NetSuite " +
                  "API Secrets (Setup > Company > API Secrets) — paste " +
                  "its script ID below. Live validation against Twilio " +
                  "runs at Step 6 (Test & activate) using the configured " +
                  "secret pointer — no need to paste the secret value here."
        }, "Text(step2-intro)"));

        rows.push(buildTextField('Account SID', 'AC...',
            STATE.step2.accountSid,
            function (v) { STATE.step2.accountSid = v; }));

        rows.push(buildTextField('API Key SID', 'SK...',
            STATE.step2.apiKeySid,
            function (v) { STATE.step2.apiKeySid = v; }));

        rows.push(buildTextField('API Key Secret script ID',
            'custsecret_...',
            STATE.step2.apiSecretId,
            function (v) { STATE.step2.apiSecretId = v; }));

        return safeNew(d.SP, {
            items: rows.filter(function (r) { return r != null; }),
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.M
        }, "StackPanel(step2)");
    }

    /* ────────────────────────────────────────────────────────────────── */
    /* Step 3 — Voice config                                              */
    /* ────────────────────────────────────────────────────────────────── */

    function buildStep3Form(d) {
        var rows = [];

        rows.push(safeNew(d.H, {
            content: "Voice configuration",
            type: d.H_Type.MEDIUM_HEADING
        }, "Heading(step3)"));

        rows.push(safeNew(d.T, {
            text: "Pick the TwiML application, default outbound caller " +
                  "ID, and (optional) Conversational Intelligence " +
                  "service from your Twilio account. These are fetched " +
                  "live from Twilio using the secure API Secret " +
                  "configured in Step 2 — the secret value never leaves " +
                  "NetSuite's vault."
        }, "Text(step3-intro)"));

        // Loading state — lists not yet fetched.
        if (STATE.step3.twimlApps === null ||
            STATE.step3.phoneNumbers === null ||
            STATE.step3.intelServices === null) {
            var loader = safeNew(component.Loader, {
                label: "Loading from Twilio…",
                indeterminate: true
            }, "Loader(step3-lists)");
            if (loader) rows.push(loader);
            else rows.push(safeNew(d.T, {
                text: "Loading from Twilio…"
            }, "Text(loading-fallback)"));

            return safeNew(d.SP, {
                items: rows.filter(function (r) { return r != null; }),
                orientation: d.SP_Orient.VERTICAL,
                itemGap: d.SP_Gap.M
            }, "StackPanel(step3-loading)");
        }

        // Error state — at least one list failed.
        if (STATE.step3.listLoadError) {
            rows.push(safeNew(d.T, {
                text: "✕ Could not load Twilio lists: " +
                    STATE.step3.listLoadError + ". Verify the API " +
                    "Secret value is set at Setup > Company > API " +
                    "Secrets, then go back to Step 2 and Continue " +
                    "again to retry.",
                type: d.T_Type.STRONG
            }, "Text(step3-error)"));

            return safeNew(d.SP, {
                items: rows.filter(function (r) { return r != null; }),
                orientation: d.SP_Orient.VERTICAL,
                itemGap: d.SP_Gap.M
            }, "StackPanel(step3-error)");
        }

        // Loaded — render dropdowns.
        rows.push(buildDropdownField(d, 'TwiML Application',
            STATE.step3.twimlApps,
            STATE.step3.twimlAppSid,
            function (sid) { STATE.step3.twimlAppSid = sid; }));

        rows.push(buildDropdownField(d, 'Default outbound caller ID',
            STATE.step3.phoneNumbers.map(function (n) {
                return { value: n.phoneNumber,
                         label: n.phoneNumber +
                                (n.friendlyName ? ' — ' + n.friendlyName : '') };
            }),
            STATE.step3.phoneNumber,
            function (val) { STATE.step3.phoneNumber = val; },
            { valueIsString: true }));

        rows.push(buildDropdownField(d,
            'Conversational Intelligence Service (optional)',
            STATE.step3.intelServices,
            STATE.step3.intelServiceSid,
            function (sid) { STATE.step3.intelServiceSid = sid; },
            { allowEmpty: true }));

        return safeNew(d.SP, {
            items: rows.filter(function (r) { return r != null; }),
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.M
        }, "StackPanel(step3)");
    }

    /**
     * Fire the three list-fetch actions in parallel. Populate STATE
     * and rerender when each resolves. Called from goToStep when
     * advancing INTO Step 3.
     */
    function loadStep3Lists() {
        // Reset to loading state
        STATE.step3.twimlApps = null;
        STATE.step3.phoneNumbers = null;
        STATE.step3.intelServices = null;
        STATE.step3.listLoadError = null;

        function handle(field, payload) {
            if (payload && payload.items) {
                STATE.step3[field] = payload.items;

                // Sync the first item's value to STATE so Continue sees
                // a valid selection even if the admin never touched the
                // dropdown. UIF's onSelectionChanged only fires on USER
                // interaction — not on the constructor's selectedValue
                // default — so STATE would otherwise stay empty when
                // the admin accepts the default.
                if (payload.items.length > 0) {
                    if (field === 'twimlApps' && !STATE.step3.twimlAppSid) {
                        STATE.step3.twimlAppSid = payload.items[0].sid;
                    }
                    if (field === 'phoneNumbers' && !STATE.step3.phoneNumber) {
                        STATE.step3.phoneNumber = payload.items[0].phoneNumber;
                    }
                    // intelServiceSid stays empty by default — that field
                    // is optional (allowEmpty: true on the dropdown)
                }
            } else {
                STATE.step3[field] = [];
                if (payload && payload.errorMessage) {
                    STATE.step3.listLoadError = payload.errorMessage;
                }
            }
            // Re-render once all three settle (or when the last one lands)
            if (STATE.step3.twimlApps !== null &&
                STATE.step3.phoneNumbers !== null &&
                STATE.step3.intelServices !== null) {
                rerender();
            }
        }

        wizardCall('wizardListTwiMLApps', {})
            .then(function (p) { handle('twimlApps', p); })
            .catch(function (e) {
                STATE.step3.listLoadError = 'TwiML apps: ' +
                    (e && e.message ? e.message : String(e));
                handle('twimlApps', null);
            });

        wizardCall('wizardListPhoneNumbers', {})
            .then(function (p) { handle('phoneNumbers', p); })
            .catch(function (e) {
                STATE.step3.listLoadError = 'Phone numbers: ' +
                    (e && e.message ? e.message : String(e));
                handle('phoneNumbers', null);
            });

        wizardCall('wizardListIntelServices', {})
            .then(function (p) { handle('intelServices', p); })
            .catch(function (e) {
                STATE.step3.listLoadError = 'Intel services: ' +
                    (e && e.message ? e.message : String(e));
                handle('intelServices', null);
            });
    }

    /**
     * Build a Field-like Dropdown row. Items can be either:
     *   - List of { sid, friendlyName, ... } (Twilio resource shape) — uses
     *     `sid` as value, "<friendlyName> — <sid>" as display
     *   - List of { value, label } (already-shaped) — uses as-is when
     *     opts.valueIsString = true
     */
    function buildDropdownField(d, label, items, currentValue, onChange, opts) {
        opts = opts || {};

        // Normalize items to { value, label }
        var normalized = (items || []).map(function (it) {
            if (opts.valueIsString) return it; // already { value, label }
            return {
                value: it.sid,
                label: (it.friendlyName || '(unnamed)') +
                    (it.sid ? '  [' + it.sid + ']' : '')
            };
        });

        if (normalized.length === 0) {
            return safeNew(component.StackPanel, {
                items: [
                    safeNew(component.Text, { text: label,
                        type: component.Text.Type.STRONG,
                        size: component.Text.Size.S
                    }, "Text(label-" + label + ")"),
                    safeNew(component.Text, {
                        text: "(no items found in Twilio for this account)",
                        type: component.Text.Type.WEAK,
                        size: component.Text.Size.S
                    }, "Text(empty-" + label + ")")
                ].filter(function (c) { return c != null; }),
                orientation: component.StackPanel.Orientation.VERTICAL,
                itemGap: component.StackPanel.GapSize.XXS
            }, "StackPanel(empty-" + label + ")");
        }

        var ds = new core.ArrayDataSource(normalized);

        var dropdown = safeNew(component.Dropdown, {
            dataSource: ds,
            valueMember: 'value',
            displayMember: 'label',
            selectedValue: currentValue || (opts.allowEmpty ? null : normalized[0].value),
            allowEmpty: !!opts.allowEmpty,
            placeholder: opts.allowEmpty ? '(none)' : 'Select…',
            onSelectionChanged: function (args) {
                onChange(args && args.value);
            }
        }, "Dropdown(" + label + ")");

        if (!dropdown) {
            // Fallback to TextBox if Dropdown construction fails (shouldn't,
            // but gives a usable form so admin can complete the wizard)
            return buildTextField(label, '', currentValue || '', onChange);
        }

        var lblText = safeNew(component.Text, {
            text: label,
            type: component.Text.Type.STRONG,
            size: component.Text.Size.S
        }, "Text(label-" + label + ")");

        return safeNew(component.StackPanel, {
            items: [lblText, dropdown].filter(function (c) { return c != null; }),
            orientation: component.StackPanel.Orientation.VERTICAL,
            itemGap: component.StackPanel.GapSize.XXS
        }, "StackPanel(field-" + label + ")") || dropdown;
    }

    /* ────────────────────────────────────────────────────────────────── */
    /* Step 4 — Phone numbers + rep assignments                           */
    /* ────────────────────────────────────────────────────────────────── */

    function buildStep4Form(d) {
        var rows = [];

        rows.push(safeNew(d.H, {
            content: "Phone numbers & rep assignments",
            type: d.H_Type.MEDIUM_HEADING
        }, "Heading(step4)"));

        rows.push(safeNew(d.T, {
            text: "Assign reps to your Twilio phone numbers. Each rep " +
                  "with a number assigned will use it as their outbound " +
                  "caller ID. Reps without an assignment fall back to " +
                  "the default caller ID set in Step 3."
        }, "Text(step4-intro)"));

        // Loading state
        if (STATE.step4.phoneNumbers === null ||
            STATE.step4.employees === null) {
            var loader = safeNew(component.Loader, {
                label: "Loading phone numbers and employees…",
                indeterminate: true
            }, "Loader(step4)");
            if (loader) rows.push(loader);
            return safeNew(d.SP, {
                items: rows.filter(function (r) { return r != null; }),
                orientation: d.SP_Orient.VERTICAL,
                itemGap: d.SP_Gap.M
            }, "StackPanel(step4-loading)");
        }

        // Error state
        if (STATE.step4.listLoadError) {
            rows.push(safeNew(d.T, {
                text: "✕ " + STATE.step4.listLoadError,
                type: d.T_Type.STRONG
            }, "Text(step4-error)"));
            return safeNew(d.SP, {
                items: rows.filter(function (r) { return r != null; }),
                orientation: d.SP_Orient.VERTICAL,
                itemGap: d.SP_Gap.M
            }, "StackPanel(step4-error)");
        }

        if (STATE.step4.phoneNumbers.length === 0) {
            rows.push(safeNew(d.T, {
                text: "(no phone numbers owned by this Twilio account — " +
                      "buy one in Twilio Console before continuing)",
                type: d.T_Type.WEAK
            }, "Text(step4-empty)"));
            return safeNew(d.SP, {
                items: rows.filter(function (r) { return r != null; }),
                orientation: d.SP_Orient.VERTICAL,
                itemGap: d.SP_Gap.M
            }, "StackPanel(step4-empty)");
        }

        // One row per phone number
        for (var i = 0; i < STATE.step4.phoneNumbers.length; i++) {
            var pn = STATE.step4.phoneNumbers[i];
            rows.push(buildStep4AssignmentRow(d, pn));
        }

        return safeNew(d.SP, {
            items: rows.filter(function (r) { return r != null; }),
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.L
        }, "StackPanel(step4)");
    }

    function buildStep4AssignmentRow(d, phoneNumber) {
        var current = STATE.step4.assignments[phoneNumber.sid] || {};
        var employees = STATE.step4.employees || [];

        var pnLabel = safeNew(d.T, {
            text: phoneNumber.phoneNumber +
                (phoneNumber.friendlyName ? '  —  ' + phoneNumber.friendlyName : ''),
            type: d.T_Type.STRONG
        }, "Text(step4-pn-" + phoneNumber.sid + ")");

        // Multi-select employee picker via MultiselectDropdown
        var dataItems = employees.map(function (e) {
            return { value: e.id, label: e.name +
                (e.email ? ' (' + e.email + ')' : '') };
        });

        var ds = new core.ArrayDataSource(dataItems);
        var selectedItems = (current.employeeIds || []).map(function (id) {
            return { value: id, label: lookupEmployeeName(id) };
        });

        var picker = safeNew(component.MultiselectDropdown, {
            dataSource: ds,
            valueMember: 'value',
            displayMember: 'label',
            selectedItems: selectedItems,
            placeholder: 'Assign reps…',
            // Per @uif-js/component d.ts, MultiselectDropdown's
            // SelectionChangedArgs is { values, previousValues, reason }
            // — NOT { items }. Earlier U5 commit read args.items (which
            // was undefined), causing the saved payload to always be
            // empty. `values` is already an array of the value-member
            // (the employee id) since valueMember is set above.
            onSelectionChanged: function (args) {
                var values = (args && args.values) || [];
                console.log("[CTC Setup Wizard] Step 4 picker — " +
                    "phoneSid=" + phoneNumber.sid +
                    " selected values:", values);

                if (!STATE.step4.assignments[phoneNumber.sid]) {
                    STATE.step4.assignments[phoneNumber.sid] = {};
                }
                STATE.step4.assignments[phoneNumber.sid].employeeIds = values;
                // Default primary to first selected if not already set
                var a = STATE.step4.assignments[phoneNumber.sid];
                if (!a.primaryEmployeeId || values.indexOf(a.primaryEmployeeId) === -1) {
                    a.primaryEmployeeId = values.length > 0 ? values[0] : null;
                }
            }
        }, "MultiselectDropdown(emp-" + phoneNumber.sid + ")");

        var children = [pnLabel, picker].filter(function (c) { return c != null; });
        return safeNew(d.SP, {
            items: children,
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.XS
        }, "StackPanel(step4-row-" + phoneNumber.sid + ")");
    }

    function lookupEmployeeName(id) {
        var employees = STATE.step4.employees || [];
        for (var i = 0; i < employees.length; i++) {
            if (Number(employees[i].id) === Number(id)) return employees[i].name;
        }
        return '(id ' + id + ')';
    }

    function loadStep4Lists() {
        // Reset
        STATE.step4.phoneNumbers = null;
        STATE.step4.employees = null;
        STATE.step4.assignments = {};
        STATE.step4.listLoadError = null;

        function rerenderIfReady() {
            if (STATE.step4.phoneNumbers !== null &&
                STATE.step4.employees !== null) {
                rerender();
            }
        }

        wizardCall('wizardListPhoneNumbers', {})
            .then(function (p) {
                STATE.step4.phoneNumbers = (p && p.items) || [];
                if (p && p.errorMessage) STATE.step4.listLoadError = p.errorMessage;
                rerenderIfReady();
            }).catch(function (e) {
                STATE.step4.phoneNumbers = [];
                STATE.step4.listLoadError = 'Phone numbers: ' +
                    (e && e.message ? e.message : String(e));
                rerenderIfReady();
            });

        wizardCall('wizardListEmployees', {})
            .then(function (p) {
                STATE.step4.employees = (p && p.items) || [];
                if (p && p.errorMessage) STATE.step4.listLoadError = p.errorMessage;
                rerenderIfReady();
            }).catch(function (e) {
                STATE.step4.employees = [];
                STATE.step4.listLoadError = 'Employees: ' +
                    (e && e.message ? e.message : String(e));
                rerenderIfReady();
            });

        // Load existing assignments so revisits show prior state
        wizardCall('wizardLoadAssignments', {})
            .then(function (p) {
                var items = (p && p.items) || [];
                var map = {};
                items.forEach(function (a) {
                    if (!map[a.phoneSid]) {
                        map[a.phoneSid] = {
                            employeeIds: [],
                            label: a.label || '',
                            primaryEmployeeId: null
                        };
                    }
                    var empId = Number(a.employeeId);
                    map[a.phoneSid].employeeIds.push(empId);
                    if (a.isPrimary) map[a.phoneSid].primaryEmployeeId = empId;
                });
                STATE.step4.assignments = map;
                // Don't rerender on this one — phoneNumbers/employees
                // arrival triggers the render and picks up assignments
                // synchronously since they're already in STATE.
            }).catch(function () { /* ignore — non-fatal */ });
    }

    /* ────────────────────────────────────────────────────────────────── */
    /* Step 5 — Test & activate (review + preflight + activate)           */
    /* ────────────────────────────────────────────────────────────────── */

    function buildStep5Activate(d) {
        var rows = [];

        rows.push(safeNew(d.H, {
            content: "Test & activate",
            type: d.H_Type.MEDIUM_HEADING
        }, "Heading(step5)"));

        // If activated, show success state with Continue button to
        // return to the Admin Console (otherwise the admin gets stranded
        // on Step 5 with no way back).
        if (STATE.step5.activated) {
            rows.push(safeNew(d.T, {
                text: "✓ Click-to-Call is active. Sales reps can now use " +
                      "the phone icon on Customer, Lead, and Contact " +
                      "records.",
                type: d.T_Type.STRONG
            }, "Text(activated)"));

            var ButtonType = (component.Button && component.Button.Type) || {};
            var consoleBtn = safeNew(component.Button, {
                label: "Go to Admin Console",
                type: ButtonType.PRIMARY,
                action: goToConsole
            }, "Button(step5-to-console)");
            if (consoleBtn) rows.push(consoleBtn);

            return safeNew(d.SP, {
                items: rows.filter(function (r) { return r != null; }),
                orientation: d.SP_Orient.VERTICAL,
                itemGap: d.SP_Gap.M
            }, "StackPanel(step5-activated)");
        }

        // Loading state (preflight running)
        if (STATE.step5.loading) {
            var loader = safeNew(component.Loader, {
                label: "Running preflight checks…",
                indeterminate: true
            }, "Loader(step5)");
            if (loader) rows.push(loader);
            return safeNew(d.SP, {
                items: rows.filter(function (r) { return r != null; }),
                orientation: d.SP_Orient.VERTICAL,
                itemGap: d.SP_Gap.M
            }, "StackPanel(step5-loading)");
        }

        // ── Configuration review section ─────────────────────────────
        if (STATE.step5.snapshot) {
            rows.push(safeNew(d.H, {
                content: "Configuration review",
                type: d.H_Type.SMALL_HEADING
            }, "Heading(review)"));

            var snap = STATE.step5.snapshot;
            var assignmentCount = (STATE.step5.assignments || []).length;
            var phoneNumbersWithReps = {};
            (STATE.step5.assignments || []).forEach(function (a) {
                if (a.phoneSid) phoneNumbersWithReps[a.phoneSid] = true;
            });

            var lines = [
                'Account SID:        ' + (snap.accountSid || '(not set)'),
                'API Key SID:        ' + (snap.apiKeySid || '(not set)'),
                'API Key Secret:     ' + (snap.apiSecretId || '(not set)'),
                'TwiML Application:  ' + (snap.twimlAppSid || '(not set)'),
                'Default caller ID:  ' + (snap.phoneNumber || '(not set)'),
                'Intel Service:      ' + (snap.intelServiceSid || '(none)'),
                'Phone assignments:  ' + assignmentCount + ' rep(s) across ' +
                    Object.keys(phoneNumbersWithReps).length + ' number(s)'
            ];
            lines.forEach(function (l) {
                rows.push(safeNew(d.T, {
                    text: l,
                    type: d.T_Type.DEFAULT,
                    size: d.T && d.T.Size ? d.T.Size.S : undefined
                }, "Text(review-line)"));
            });
        }

        // ── Preflight checks section ─────────────────────────────────
        if (STATE.step5.preflight) {
            rows.push(safeNew(d.H, {
                content: "Preflight checks",
                type: d.H_Type.SMALL_HEADING
            }, "Heading(preflight)"));

            STATE.step5.preflight.forEach(function (check) {
                rows.push(buildCheckRow(check));
            });
        }

        // ── Activate button ──────────────────────────────────────────
        var allPassed = STATE.step5.preflight &&
            STATE.step5.preflight.every(function (c) { return c.status === 'pass'; });

        var activateBtn = safeNew(component.Button, {
            label: allPassed ? "Activate Click-to-Call"
                             : "Activate Click-to-Call (fix preflight first)",
            type: (component.Button && component.Button.Type)
                ? component.Button.Type.PRIMARY : undefined,
            enabled: allPassed,
            action: function () { onActivateClick(); }
        }, "Button(activate)");
        if (activateBtn) rows.push(activateBtn);

        if (STATE.step5.activateError) {
            rows.push(safeNew(d.T, {
                text: "✕ Activation failed: " + STATE.step5.activateError,
                type: d.T_Type.STRONG
            }, "Text(activate-error)"));
        }

        // Re-run preflight button (for transient failures)
        var rerunBtn = safeNew(component.Button, {
            label: "Re-run preflight",
            type: (component.Button && component.Button.Type)
                ? component.Button.Type.DEFAULT : undefined,
            action: function () { loadStep5(); }
        }, "Button(rerun-preflight)");
        if (rerunBtn) rows.push(rerunBtn);

        return safeNew(d.SP, {
            items: rows.filter(function (r) { return r != null; }),
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.M
        }, "StackPanel(step5)");
    }

    function loadStep5() {
        STATE.step5.loading = true;
        STATE.step5.activateError = null;
        STATE.step5.snapshot = null;
        STATE.step5.assignments = null;
        STATE.step5.preflight = null;
        rerender();

        // U9 fix: previously these 3 calls fired in parallel and the
        // preflight callback was the sole rerender trigger. If
        // wizardLoadAssignments resolved AFTER wizardRunPreflight, the
        // Configuration Review rendered with `assignments === null`,
        // showing "0 rep(s) across 0 number(s)" even though saves
        // succeeded. Now: wait for ALL three to settle, then rerender
        // once with complete data.
        var settled = 0;
        function onSettled() {
            settled += 1;
            if (settled >= 3) {
                STATE.step5.loading = false;
                rerender();
            }
        }

        wizardCall('wizardSnapshot', {})
            .then(function (p) { STATE.step5.snapshot = p && p.snapshot; })
            .catch(function () { STATE.step5.snapshot = null; })
            .then(onSettled);

        wizardCall('wizardLoadAssignments', {})
            .then(function (p) { STATE.step5.assignments = (p && p.items) || []; })
            .catch(function () { STATE.step5.assignments = []; })
            .then(onSettled);

        wizardCall('wizardRunPreflight', {})
            .then(function (p) {
                STATE.step5.preflight = (p && p.checks) || [];
            }).catch(function (e) {
                STATE.step5.preflight = [{
                    id: 'network', label: 'Preflight call', status: 'fail',
                    detail: 'Network error: ' +
                        (e && e.message ? e.message : String(e))
                }];
            }).then(onSettled);
    }

    function onActivateClick() {
        wizardCall('wizardActivate', {})
        .then(function (payload) {
            if (payload && payload.activated) {
                STATE.step5.activated = true;
                STATE.step5.activateError = null;
            } else {
                STATE.step5.activateError =
                    (payload && payload.error) || 'unknown';
                if (payload && payload.failedChecks) {
                    STATE.step5.preflight = payload.failedChecks;
                }
            }
            rerender();
        }).catch(function (e) {
            STATE.step5.activateError = 'Network: ' +
                (e && e.message ? e.message : String(e));
            rerender();
        });
    }

    /* ────────────────────────────────────────────────────────────────── */
    /* Shared form helper                                                 */
    /* ────────────────────────────────────────────────────────────────── */

    function buildTextField(label, placeholder, currentValue, onChange) {
        var tb = safeNew(component.TextBox, {
            text: currentValue || '',
            placeholder: placeholder,
            onTextChanged: function (args) {
                onChange(args && args.text ? args.text : '');
            }
        }, "TextBox(" + label + ")");
        if (!tb) return null;

        var lbl = safeNew(component.Text, {
            text: label,
            type: component.Text.Type.STRONG,
            size: component.Text.Size ? component.Text.Size.S : undefined
        }, "Text(label-" + label + ")");

        return safeNew(component.StackPanel, {
            items: [lbl, tb].filter(function (c) { return c != null; }),
            orientation: component.StackPanel.Orientation.VERTICAL,
            itemGap: component.StackPanel.GapSize.XXS
        }, "StackPanel(field-" + label + ")") || tb;
    }


    /**
     * Render a vertical list of prerequisite check rows.
     * Each row: pass/fail icon + label + detail (+ repair hint if any).
     */
    function buildPrereqsList(checks) {
        var rows = checks.map(function (c) { return buildCheckRow(c); })
                         .filter(function (r) { return r != null; });

        if (rows.length === 0) {
            return safeNew(component.Text, {
                text: "No checks returned."
            }, "Text(empty-checks)");
        }

        return safeNew(component.StackPanel, {
            items: rows,
            orientation: component.StackPanel.Orientation.VERTICAL,
            itemGap: component.StackPanel.GapSize.M
        }, "StackPanel(prereqs)");
    }

    /**
     * One check row. Status icon comes from a Badge (SOLID green-ish
     * for pass, SUBTLE for warn/info, SOLID red-ish for fail — within
     * the limits of Badge.Type's two-value enum).
     */
    function buildCheckRow(check) {
        var icon = badgeFor(check.status);

        var labelText = safeNew(component.Text, {
            text: check.label,
            type: component.Text.Type.STRONG
        }, "Text(row-label)");

        var detailText = check.detail ? safeNew(component.Text, {
            text: check.detail,
            type: component.Text.Type.WEAK,
            size: component.Text.Size.S
        }, "Text(row-detail)") : null;

        var hintText = check.repairHint ? safeNew(component.Text, {
            text: "→ " + check.repairHint,
            type: component.Text.Type.DEFAULT,
            size: component.Text.Size.S
        }, "Text(row-hint)") : null;

        var rightStackItems = [labelText, detailText, hintText]
            .filter(function (c) { return c != null; });

        var rightStack = safeNew(component.StackPanel, {
            items: rightStackItems,
            orientation: component.StackPanel.Orientation.VERTICAL,
            itemGap: component.StackPanel.GapSize.XXS
        }, "StackPanel(row-right)");

        var rowItems = [icon, rightStack]
            .filter(function (c) { return c != null; });

        return safeNew(component.StackPanel, {
            items: rowItems,
            orientation: component.StackPanel.Orientation.HORIZONTAL,
            alignment: component.StackPanel.Alignment.START,
            itemGap: component.StackPanel.GapSize.M
        }, "StackPanel(row)");
    }

    /**
     * Status badge: pass=✓, fail=✕, warn=!, info_enabled=ⓘ, info_disabled=○
     */
    function badgeFor(status) {
        var content, type;
        switch (status) {
            case 'pass':
                content = '✓';
                type = component.Badge.Type.SOLID;
                break;
            case 'fail':
                content = '✕';
                type = component.Badge.Type.SOLID;
                break;
            case 'warn':
                content = '!';
                type = component.Badge.Type.SOLID;
                break;
            case 'info_enabled':
                content = 'ⓘ';
                type = component.Badge.Type.SUBTLE;
                break;
            case 'info_disabled':
                content = '○';
                type = component.Badge.Type.SUBTLE;
                break;
            default:
                content = '?';
                type = component.Badge.Type.SUBTLE;
        }
        return safeNew(component.Badge, {
            content: content,
            type: type,
            size: component.Badge.Size.DEFAULT
        }, "Badge(status-" + status + ")");
    }

    /**
     * Error-state body content when the Ajax call fails or the server
     * returns ok=false.
     */
    function buildErrorBox(errorMessage) {
        return safeNew(component.Text, {
            text: "Could not load prerequisite checks: " + errorMessage,
            type: component.Text.Type.STRONG
        }, "Text(error)");
    }

    function buildStepper(d) {
        if (!d.SP || !d.T || !d.SI) {
            // Note: d.SI here is just used as a presence check (StepperItem
            // class) — we still want the badge if the rest fail.
        }

        var Badge = component.Badge;
        var BadgeType = (Badge && Badge.Type) || {};
        var BadgeSize = (Badge && Badge.Size) || {};
        var TextType = (d.T && d.T.Type) || {};
        var TextSize = (d.T && d.T.Size) || {};

        var SPAlign = (d.SP && d.SP.Alignment) || {};
        var SPJust = (d.SP && d.SP.Justification) || {};

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

    function safeNew(Ctor, options, label) {
        if (!Ctor) {
            console.log("[CTC Setup Wizard] " + label + " constructor " +
                "missing — skipping");
            return null;
        }
        try {
            return new Ctor(options);
        } catch (e) {
            console.log("[CTC Setup Wizard] " + label + " construction " +
                "failed:", e && e.message ? e.message : e,
                "— options:", options);
            return null;
        }
    }

export { run };
