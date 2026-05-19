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
        } catch (e) {
            console.error("[CTC Setup Wizard] run() threw:", e);
        }
    };

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

        // ── Step body placeholder ───────────────────────────────────────
        var bodyText = safeNew(d.T, {
            text: "Per-step UI ships in U3-U7. Real UIF API confirmed " +
                "via the @uif-js TypeScript definitions — no more " +
                "prop-name guessing."
        }, "Text(body)");

        var bodyBox = bodyText ? safeNew(d.CP, {
            content: bodyText,
            horizontalAlignment: d.CP_HAlign.STRETCH,
            outerGap: d.CP_Gap.L
        }, "ContentPanel(body)") || bodyText : null;

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

    function buildStepper(d) {
        if (!d.Stp || !d.SI) return null;

        // Per d.ts: StepperItem.Options.index is REQUIRED (no `?`) and
        // Stepper.Options uses `children`, not `items` (the `items`
        // property is class-level / writable, not in the constructor
        // Options interface).
        //
        // type: PRIMARY for the active step makes it visually distinct;
        // DEFAULT for others.
        var SIType = (d.SI && d.SI.Type) || {};
        var ACTIVE = SIType.PRIMARY != null ? SIType.PRIMARY :
                     (SIType.INFO != null ? SIType.INFO : SIType.DEFAULT);
        var DEFAULT = SIType.DEFAULT;

        var items = STEPS.map(function (s, i) {
            return safeNew(d.SI, {
                index: i,
                label: s.label,
                type: (s.num === CURRENT_STEP) ? ACTIVE : DEFAULT,
                selected: (s.num === CURRENT_STEP)
            }, "StepperItem(" + s.label + ")");
        }).filter(function (it) { return it != null; });

        if (items.length === 0) return null;

        var opts = {
            children: items,                 // d.ts: Options uses `children`
            selectedStepIndex: CURRENT_STEP - 1
        };
        if (d.Stp_Orient.HORIZONTAL !== undefined) {
            opts.orientation = d.Stp_Orient.HORIZONTAL;
        }

        // Per d.ts on Stepper namespace:
        //   descriptionGenerator: (index, options) => content
        opts.descriptionGenerator = function (index) {
            var s = STEPS[index];
            return s ? s.sub : '';
        };

        return safeNew(d.Stp, opts, "Stepper");
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
