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

    var STEPS = [
        { num: 1, label: 'Prerequisites',   sub: 'Setup checks' },
        { num: 2, label: 'Connect Twilio',  sub: 'SIDs & secrets' },
        { num: 3, label: 'Voice config',    sub: 'TwiML & caller ID' },
        { num: 4, label: 'Phone numbers',   sub: 'Claim & assign' },
        { num: 5, label: 'Reps & roles',    sub: 'Permissions' },
        { num: 6, label: 'Test & activate', sub: 'Go live' }
    ];
    var CURRENT_STEP = 1; // 1-based

    // Suitelet-as-API endpoint backing the wizard SPA. Same-origin →
    // NetSuite session cookies carry through; no separate auth needed.
    var WIZARD_API_URL =
        '/app/site/hosting/scriptlet.nl' +
        '?script=customscript_ctc_sl_wizard_api' +
        '&deploy=customdeploy_ctc_sl_wizard_api';

    // Module-level handle to the step body container so the async
    // wizardPrereqs response can swap its content post-mount.
    var bodyContainer = null;

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

            var SP_Orient = SP && SP.Orientation || {};
            var SP_Gap    = SP && SP.GapSize || {};
            var CP_Gap    = CP && CP.GapSize || {};
            var CP_HAlign = CP && CP.HorizontalAlignment || {};
            var H_Type    = H && H.Type || {};
            var T_Type    = T && T.Type || {};
            // Stepper.Orientation aliases StepperItem.Orientation per d.ts
            var Stp_Orient = (Stp && Stp.Orientation) ||
                             (SI && SI.Orientation) || {};

            var root = buildRoot({
                SP: SP, CP: CP, H: H, T: T, Stp: Stp, SI: SI,
                SP_Orient: SP_Orient,
                SP_Gap: SP_Gap,
                CP_Gap: CP_Gap,
                CP_HAlign: CP_HAlign,
                H_Type: H_Type,
                T_Type: T_Type,
                Stp_Orient: Stp_Orient
            });

            console.log("[CTC Setup Wizard] Mounting root:", root);
            scriptContext.setContent(root);
            console.log("[CTC Setup Wizard] setContent OK");

            // Fire the Step 1 prereqs Ajax call now that the shell is
            // mounted. The body container shows a Loader until the
            // response arrives and replaces it with the check rows.
            loadPrereqs();
        } catch (e) {
            console.error("[CTC Setup Wizard] run() threw:", e);
        }
    };

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
        core.Ajax.post(
            WIZARD_API_URL + '&action=wizardPrereqs',
            {},
            { dataType: core.Ajax.DataType.JSON,
              responseType: core.Ajax.ResponseType.JSON }
        ).then(function (response) {
            console.log("[CTC Setup Wizard] wizardPrereqs response:", response);
            console.log("[CTC Setup Wizard]   typeof:", typeof response,
                "keys:", response && typeof response === 'object'
                    ? Object.keys(response) : "(n/a)");
            // core.Ajax may return the parsed body directly OR a wrapper
            // like { status, data, ... }. Try both shapes.
            var payload = extractPayload(response);
            console.log("[CTC Setup Wizard]   extracted payload:", payload);

            var body;
            if (payload && payload.ok && payload.checks) {
                body = buildPrereqsList(payload.checks);
            } else if (payload && payload.error) {
                body = buildErrorBox(payload.error);
            } else {
                body = buildErrorBox('unexpected response shape — see console');
            }
            try { bodyContainer.setContent(body); }
            catch (e) {
                console.error("[CTC Setup Wizard] bodyContainer.setContent " +
                    "failed:", e);
            }
        }).catch(function (err) {
            console.error("[CTC Setup Wizard] wizardPrereqs Ajax failed:", err);
            try {
                bodyContainer.setContent(buildErrorBox(
                    'Network or server error calling wizardPrereqs — ' +
                    'check browser DevTools Network tab for details.'));
            } catch (e) { /* ignore */ }
        });
    }

    function buildRoot(d) {
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

    /**
     * Build the step body's outer container with a Loader inside.
     * Stash the container on a module-level variable so loadPrereqs()
     * can call setContent() on it once the Ajax response lands.
     */
    function buildStepBodyContainer(d) {
        var loader = safeNew(component.Loader, {
            label: "Running prerequisite checks…",
            indeterminate: true
        }, "Loader(prereqs)");

        var initial = loader || safeNew(d.T, {
            text: "Loading prerequisite checks…"
        }, "Text(loading-fallback)");

        var box = safeNew(d.CP, {
            content: initial,
            horizontalAlignment: d.CP_HAlign.STRETCH,
            outerGap: d.CP_Gap.L
        }, "ContentPanel(body)");

        bodyContainer = box; // module-level for setContent swap later
        return box;
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
