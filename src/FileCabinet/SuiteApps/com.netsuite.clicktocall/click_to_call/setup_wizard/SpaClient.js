/**
 * @NApiVersion 2.1
 *
 * Setup Wizard v2 — client-side UIF app (browser-side).
 *
 * U2-rev shell: lays down the Stepper + step-pane shell with placeholder
 * content for Steps 1-6. U3-U7 fill in each step's form, validation, and
 * server-action calls.
 *
 * UIF authoring constraints (SDF Pitfall #98):
 *   - No raw DOM access — `document.getElementById`, jQuery, innerHTML
 *     are forbidden. Use UIF components only.
 *   - All UI built via @uif-js/core (StackPanel, FlexLayout, etc.) and
 *     @uif-js/component (Button, Form, Stepper, etc.).
 *
 * The wizard's state-machine logic (which step to land on, snapshot
 * derivation) is shared with the retired Suitelet via lib/ctc_wizard_state.js
 * — pure functions that don't depend on the rendering layer.
 */
define(["require", "exports", "@uif-js/core", "@uif-js/component"],
       function (require, exports, core, component) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.run = void 0;

    // Step catalog mirrors lib/ctc_wizard_state.STEPS (kept in sync
    // manually until U3 wires the server snapshot fetch). Once the
    // first server action ships, this comes from the snapshot payload.
    var STEPS = [
        { num: 1, label: "Prerequisites",   sub: "Setup checks" },
        { num: 2, label: "Connect Twilio",  sub: "SIDs & secrets" },
        { num: 3, label: "Voice config",    sub: "TwiML & caller ID" },
        { num: 4, label: "Phone numbers",   sub: "Claim & assign" },
        { num: 5, label: "Reps & roles",    sub: "Permissions" },
        { num: 6, label: "Test & activate", sub: "Go live" }
    ];

    /**
     * Required SpaClientScript entry point.
     * @param {Object} scriptContext — UIF SPA framework context;
     *                                 scriptContext.rootContainer is
     *                                 where we mount the wizard UI.
     */
    var run = function (scriptContext) {
        // Current step is held in a tiny client-side observable.
        // U3+ will hydrate from a server snapshot fetch on mount.
        var state = {
            currentStep: 1
        };

        // Build the wizard root: a vertical StackPanel holding
        // [page header] → [stepper] → [step content area] → [footer]
        var rootPanel = component.StackPanel.create({
            orientation: core.StackOrientation.VERTICAL,
            gap: core.Spacing.SPACE_16
        });

        rootPanel.addItem({ item: buildHeader() });
        var stepperWrapper = buildStepper(state);
        rootPanel.addItem({ item: stepperWrapper.container });

        var stepContentHost = component.StackPanel.create({
            orientation: core.StackOrientation.VERTICAL,
            gap: core.Spacing.SPACE_12
        });
        rootPanel.addItem({ item: stepContentHost });

        rootPanel.addItem({
            item: buildFooter(state, function (nextStep) {
                state.currentStep = nextStep;
                renderStepContent(stepContentHost, state);
                stepperWrapper.refresh(state);
            })
        });

        // Initial render
        renderStepContent(stepContentHost, state);

        scriptContext.rootContainer.addItem({ item: rootPanel });
    };

    // ─── Header ──────────────────────────────────────────────────────

    function buildHeader() {
        var stack = component.StackPanel.create({
            orientation: core.StackOrientation.VERTICAL,
            gap: core.Spacing.SPACE_4
        });
        stack.addItem({
            item: component.Label.create({
                text: "Click-to-Call — Setup Wizard",
                heading: component.LabelHeading.H1
            })
        });
        stack.addItem({
            item: component.Label.create({
                text: "Six steps to a working softphone install. Each step validates against Twilio live before you can move on."
            })
        });
        return stack;
    }

    // ─── Stepper ─────────────────────────────────────────────────────

    function buildStepper(state) {
        // UIF doesn't ship a vertical-stepper component out of the box
        // in every release — compose one from horizontal labels.
        // U3+ may swap for component.Stepper if the framework version
        // exposes it; the shell shape stays the same.
        var container = component.StackPanel.create({
            orientation: core.StackOrientation.HORIZONTAL,
            gap: core.Spacing.SPACE_8
        });

        var labels = STEPS.map(function (step) {
            var stepLabel = component.Label.create({
                text: step.num + ". " + step.label
            });
            container.addItem({ item: stepLabel });
            return { stepLabel: stepLabel, num: step.num };
        });

        function refresh(updatedState) {
            // U3+ will style active/done states once we wire UIF style hooks.
            // The shell renders text-only step labels for now.
            labels.forEach(function (entry) {
                var prefix = entry.num === updatedState.currentStep ? "▶ " : "  ";
                var stepDef = STEPS[entry.num - 1];
                entry.stepLabel.text = prefix + entry.num + ". " + stepDef.label;
            });
        }

        refresh(state); // initial state
        return { container: container, refresh: refresh };
    }

    // ─── Step content ────────────────────────────────────────────────

    function renderStepContent(host, state) {
        // Clear any existing content (UIF: remove all items from the host).
        // Defensive — some UIF versions throw when called with no children.
        try { host.removeAllItems && host.removeAllItems(); } catch (e) { /* ignore */ }

        var stepDef = STEPS[state.currentStep - 1];

        var eyebrow = component.Label.create({
            text: "Step " + state.currentStep + " — " + stepDef.label
        });
        host.addItem({ item: eyebrow });

        var title = component.Label.create({
            text: stepDef.label,
            heading: component.LabelHeading.H2
        });
        host.addItem({ item: title });

        var body = component.Label.create({
            text: "This step ships in implementation unit U" + (state.currentStep + 2) +
                  ". The SPA shell is in place; each step's form, validation, and " +
                  "server-action wiring plugs in next."
        });
        host.addItem({ item: body });
    }

    // ─── Footer (Back / Continue) ────────────────────────────────────

    function buildFooter(state, onStepChange) {
        var footer = component.StackPanel.create({
            orientation: core.StackOrientation.HORIZONTAL,
            gap: core.Spacing.SPACE_8
        });

        var backBtn = component.Button.create({
            label: "← Back",
            type: component.ButtonType.SECONDARY,
            onClick: function () {
                if (state.currentStep > 1) onStepChange(state.currentStep - 1);
            }
        });

        var continueBtn = component.Button.create({
            label: "Continue →",
            type: component.ButtonType.PRIMARY,
            onClick: function () {
                if (state.currentStep < STEPS.length) onStepChange(state.currentStep + 1);
            }
        });

        footer.addItem({ item: backBtn });
        footer.addItem({ item: continueBtn });
        return footer;
    }

    exports.run = run;
});
