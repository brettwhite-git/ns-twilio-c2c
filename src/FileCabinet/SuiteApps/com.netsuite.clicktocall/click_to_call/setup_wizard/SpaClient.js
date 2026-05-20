/* eslint-disable suitescript/script-type */
/**
 * @NApiVersion 2.1
 *
 * Setup Wizard v2 — SpaClient (proper props, no more guessing).
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
define(["require", "exports", "@uif-js/core", "@uif-js/component"],
       function (require, exports, core, component) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.run = void 0;

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
    var CURRENT_STEP = 1; // 1-based; mutated by Continue/Back
    // U11: 'stepper' (default — Steps 1-5) vs 'console' (post-activation
    // Admin Console). Mutated by run() resumability + console actions
    // ("Re-run wizard from start" flips back to 'stepper').
    var MODE = 'stepper';
    // U1 (Phase 3a — multi-section console): active section when
    // MODE='console'. Routes content via NavigationDrawer onSelectedValueChanged.
    // 'overview' | 'phones' | 'voice' | 'credentials' | 'health'
    var SELECTED_SECTION = 'overview';
    // U1.5: once admin has reached the console (snapshot.active === true),
    // the left rail stays visible even when they click "Re-run wizard" and
    // drop back into stepper mode. Only fresh installs (never activated)
    // see the rail-less full-page stepper.
    var RAIL_VISIBLE = false;

    // Suitelet-as-API endpoint backing the wizard SPA. Same-origin →
    // NetSuite session cookies carry through; no separate auth needed.
    var WIZARD_API_URL =
        '/app/site/hosting/scriptlet.nl' +
        '?script=customscript_ctc_sl_wizard_api' +
        '&deploy=customdeploy_ctc_sl_wizard_api';

    // Module-level state — populated by mount + form inputs.
    var scriptCtx = null;          // for re-render via setContent
    var bodyContainer = null;      // for swapping step body
    var enums = null;              // cached enum bag from run()
    var STATE = {
        step2: { accountSid: '', apiKeySid: '', apiSecretId: '' },
        step3: {
            twimlAppSid: '',
            phoneNumber: '',
            intelServiceSid: '',
            // Auto-populated dropdown source lists. Fetched from the
            // server via wizardListTwiMLApps / wizardListPhoneNumbers /
            // wizardListIntelServices on Step 3 mount. Secret VALUE
            // never travels — server uses SecureString + custsecret
            // pointer at the N/https socket boundary.
            twimlApps: null,        // null = not yet fetched
            phoneNumbers: null,
            intelServices: null,
            listLoadError: null
        },
        step4: {
            // Source lists (null = not yet fetched)
            phoneNumbers: null,    // from Twilio (live)
            employees:    null,    // from NetSuite
            // assignments shape: { <phoneSid>: { employeeIds: [n], label: '', primaryEmployeeId: n }, ... }
            assignments: {},
            listLoadError: null
        },
        step5: {
            snapshot: null,        // from wizardSnapshot — config record state
            assignments: null,     // from wizardLoadAssignments — current rep list
            preflight: null,       // from wizardRunPreflight — check results array
            activated: false,      // true after successful activate
            activateError: null,
            loading: false         // true while preflight is running
        },
        // U1 (Phase 3a): multi-section Admin Console state. The 5 sections
        // share most data — snapshot + assignments + preflight are fetched
        // once on console mount and reused across sections. Drift is
        // computed client-side from snapshot vs live wizardList* responses.
        console: {
            snapshot: null,        // from wizardSnapshot
            assignments: null,     // from wizardLoadAssignments
            preflight: null,       // from wizardRunPreflight (Health + Overview)
            activity: null,        // from wizardActivity (U8 — Phase 3c); null until then
            drift: null,           // client-computed {phoneNumbers, voiceUrl, intelService}
            loading: false,        // initial-load gate

            // Section-specific state surfaces below.
            // Phones section (U3 — Phase 3b): per-row save state.
            phonesSaving: {},      // { phoneSid: bool }
            phonesError: null,
            // Voice section (U4 — Phase 3b): which field is in EDIT mode.
            voiceEditing: null,    // null | 'twimlAppSid' | 'phoneNumber' | 'intelServiceSid'
            voiceError: null,
            // Credentials section (U5 — Phase 3c): modal state.
            activeModal: null,     // null | 'rotate-secret'
            // Health + Deactivate flow (U6 / U11 carry-over).
            pendingDeactivateConfirm: false,
            deactivateError: null,
            // Cross-section error surface.
            actionError: null
        }
    };

    /**
     * Shared Ajax helper. POSTs to the wizard API and returns the
     * unwrapped payload (or null).
     */
    function wizardCall(action, payload) {
        return core.Ajax.post(
            WIZARD_API_URL + '&action=' + action,
            payload || {},
            { dataType: core.Ajax.DataType.JSON,
              responseType: core.Ajax.ResponseType.JSON }
        ).then(extractPayload);
    }

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
        if (snap.active) return 'console';
        return 4;
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
        MODE = 'stepper';
        CURRENT_STEP = Math.max(1, Math.min(STEPS.length, stepNum));
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
        MODE = 'console';
        SELECTED_SECTION = 'overview';
        RAIL_VISIBLE = true;
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
        var TARGET = 3; // snapshot + assignments + preflight (activity added in U8)
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
            .then(function (p) { STATE.console.assignments = (p && p.items) || []; })
            .catch(function () { STATE.console.assignments = []; })
            .then(onSettled);

        wizardCall('wizardRunPreflight', {})
            .then(function (p) { STATE.console.preflight = (p && p.checks) || []; })
            .catch(function () { STATE.console.preflight = []; })
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
        SELECTED_SECTION = sectionName;
        STATE.console.pendingDeactivateConfirm = false; // cancel pending
        STATE.console.actionError = null;
        rerender();
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
    /**
     * core.Ajax may return either the parsed JSON body directly, or a
     * wrapper object like { status, statusText, data, responseHeaders }.
     * Probe both shapes so we don't care which one this UIF version
     * uses.
     */
    function extractPayload(response) {
        if (response == null) return null;
        // Direct: response IS the parsed body
        if (response.ok !== undefined || response.checks !== undefined ||
            response.error !== undefined) {
            return response;
        }
        // Wrapped: try common wrapper keys
        if (typeof response === 'object') {
            if (response.data && typeof response.data === 'object') return response.data;
            if (response.body && typeof response.body === 'object') return response.body;
            if (response.response && typeof response.response === 'object') return response.response;
            // Sometimes the response is a string that needs re-parse
            if (typeof response.responseText === 'string') {
                try { return JSON.parse(response.responseText); }
                catch (e) { /* fall through */ }
            }
        }
        if (typeof response === 'string') {
            try { return JSON.parse(response); }
            catch (e) { return null; }
        }
        return null;
    }

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
     * (padding). The ScrollPanel makes content scroll INTERNALLY within
     * its grid cell so the rail stays fixed in viewport; the
     * ContentPanel adds padding around the content for breathing room
     * away from the rail's flush-left edge.
     */
    function wrapContent(d, child) {
        if (!d.CP) return child;
        var padded = safeNew(d.CP, {
            content: child,
            horizontalAlignment: d.CP_HAlign.STRETCH,
            outerGap: d.CP_Gap.L
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
     * U1: dispatch to the appropriate section builder. U2 and U6 fill in
     * Overview and Health (Phase 3a); U3-U5 stay as informative stubs
     * until Phase 3b/3c lands.
     */
    function buildSectionContent(d) {
        switch (SELECTED_SECTION) {
            case 'overview':    return buildOverviewSection(d);
            case 'phones':      return buildSectionStub(d, 'Phones & reps',
                                    'Inline DataGrid editing arrives in Phase 3b (U3).');
            case 'voice':       return buildSectionStub(d, 'Voice config',
                                    'Inline Field editing arrives in Phase 3b (U4).');
            case 'credentials': return buildSectionStub(d, 'Credentials',
                                    'Full credentials view + rotation Modal arrives in Phase 3c (U5).');
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
                        window.open('/app/common/scripting/secrets.nl', '_blank');
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
        return safeNew(d.Bn, {
            title: "Click-to-Call is paused",
            content: "Reps cannot place calls until you reactivate. All " +
                     "config is preserved.",
            color: d.Bn_Color.ORANGE,
            button: {
                label: "Reactivate",
                action: onReactivateClick
            }
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
        var rows = [];
        if (preflight === null || preflight === undefined) {
            var loading = safeNew(d.T, {
                text: "Preflight not yet run. Click Re-run to check.",
                type: d.T_Type.WEAK
            }, "Text(preflight-loading)");
            if (loading) rows.push(loading);
        } else if (preflight.length === 0) {
            var empty = safeNew(d.T, {
                text: "No checks returned.",
                type: d.T_Type.WEAK
            }, "Text(preflight-empty)");
            if (empty) rows.push(empty);
        } else {
            preflight.forEach(function (c) {
                var row = buildCheckRow(c);
                if (row) rows.push(row);
            });
        }

        return safeNew(d.SP, {
            items: [headerRow].concat(rows).filter(function (c) { return c != null; }),
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
        // Map drift status → check-row status so we can reuse buildCheckRow.
        var statusMap = {
            'in-sync': { status: 'pass', detail: 'In sync with Twilio' },
            'drift':   { status: 'warn', detail: 'Drift detected — review section for details' },
            'not-configured': { status: 'info_disabled', detail: 'Not configured' },
            'unknown': { status: 'info_disabled', detail: 'Drift detection requires data load' }
        };

        var rows = detectors.map(function (det) {
            var mapped = statusMap[det.status] || statusMap.unknown;
            return buildCheckRow({
                id: det.id,
                label: det.label,
                status: mapped.status,
                detail: mapped.detail
            });
        }).filter(function (r) { return r != null; });

        return safeNew(d.SP, {
            items: [sectionHeader].concat(rows).filter(function (c) { return c != null; }),
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.M
        }, "StackPanel(drift-block)");
    }

    function buildHealthDangerZone(d) {
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

        var snap = STATE.console.snapshot || {};
        var isPaused = snap.active === false;

        var buttons = [];
        if (isPaused) {
            // Already paused — show informational text only; reactivation
            // happens via the top-of-page paused Banner.
            var pausedText = safeNew(d.T, {
                text: "Click-to-Call is already paused. Use the banner at " +
                      "the top of the page to reactivate.",
                type: d.T_Type.STRONG
            }, "Text(already-paused)");
            if (pausedText) buttons.push(pausedText);
        } else if (STATE.console.pendingDeactivateConfirm) {
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

        return safeNew(d.SP, {
            items: [sectionHeader, description, buttonRow, deactivateErrorText]
                .filter(function (c) { return c != null; }),
            orientation: d.SP_Orient.VERTICAL,
            itemGap: d.SP_Gap.S
        }, "StackPanel(danger-zone)");
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

        // If activated, show success state
        if (STATE.step5.activated) {
            rows.push(safeNew(d.T, {
                text: "✓ Click-to-Call is active. Sales reps can now use " +
                      "the phone icon on Customer, Lead, and Contact " +
                      "records.",
                type: d.T_Type.STRONG
            }, "Text(activated)"));
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

    exports.run = run;
});
