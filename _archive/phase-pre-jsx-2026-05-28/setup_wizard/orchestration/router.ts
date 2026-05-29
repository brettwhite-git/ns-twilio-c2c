// @ts-check
/**
 * Router — view-mode + step + section navigation.
 *
 * Path D-1 (2026-05-27) — extracted from SpaClient.ts.
 *
 * Responsibilities:
 *   - determineLandingStep: snapshot → routing decision (1..5 | 'console')
 *   - goToStep: switch to stepper mode, set step, fire per-step loader
 *   - goToConsole: switch to console mode, land on Overview, fire loadConsole
 *   - goToSection: change console section, lazy-load Phones data on first visit
 *
 * Why a factory (createRouter) instead of a free module?
 *
 *   The router calls back into orchestration concerns that SpaClient.ts
 *   wires at run() time — rerender() (paints whatever the current
 *   dispatch state implies), loadConsole / loadPhonesData (parallel
 *   server fetches), loadPrereqs (Step 1 boot). Those depend on enums +
 *   scriptCtx + bodyContainer that don't exist until run() executes.
 *   Injecting them via deps keeps the router pure of mount-time state.
 *
 *   Per-step lazy loaders (loadStep3Lists / loadStep4Lists / loadStep5)
 *   are imported directly because they're pure functions on STATE.step* —
 *   no scriptCtx dependency. loadStep5 takes a `goToConsole` callback,
 *   which the router supplies from its own closure.
 *
 * Live-binding semantics:
 *
 *   MODE / CURRENT_STEP / SELECTED_SECTION are imported from ../dispatch
 *   as `export let` bindings. Rollup preserves the live-binding contract
 *   even after bundling, so reads here see the current value rather than
 *   a frozen import-time snapshot. Mutations route through the setter
 *   exports (setMode etc.) — never assign to the imported bindings
 *   directly.
 */

import {
    MODE, CURRENT_STEP,
    setMode, setCurrentStep, setSelectedSection, setRailVisible
} from '../dispatch';
import type { SectionName } from '../dispatch';
import { STATE } from '../state';
import { loadStep3Lists } from '../components/steps/step3';
import { loadStep4Lists } from '../components/steps/step4';
import { loadStep5 } from '../components/steps/step5';

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

/**
 * Subset of the wizardSnapshot.snapshot payload the router consults to
 * decide a returning admin's landing surface. Mirrors the same fields
 * `lib/ctc_wizard_state.js:determineCurrentStep` checks; kept narrow on
 * purpose — the router shouldn't grow opinions about other snapshot
 * fields.
 */
export interface SnapshotForRouting {
    accountSid?: string;
    apiKeySid?: string;
    apiSecretId?: string;
    twimlAppSid?: string;
    phoneNumber?: string;
}

export interface RouterDeps {
    /** Force a top-level re-render after dispatch state mutation. */
    rerender: () => void;
    /** Fire the console's parallel-fetch on entering console mode. */
    loadConsole: () => void;
    /** Fire the Phones-section lazy load on first navigation there. */
    loadPhonesData: () => void;
    /** Fire the Step 1 prereqs RESTlet call. */
    loadPrereqs: () => void;
    /**
     * Upper bound for goToStep's clamp. Currently 5 — passed via deps
     * so the router doesn't need to import the STEPS catalog (which
     * still lives in SpaClient.ts because shell-builders use it too).
     */
    totalSteps: number;
}

export interface Router {
    determineLandingStep(snap: SnapshotForRouting): number | 'console';
    goToStep(stepNum: number): void;
    goToConsole(): void;
    goToSection(sectionName: SectionName): void;
}

// ─────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────

export function createRouter(deps: RouterDeps): Router {

    /**
     * U9 + U11: Determine the right landing step from a snapshot.
     * Mirrors `lib/ctc_wizard_state.js:determineCurrentStep`. Inlined
     * here because SPA Client runtime AMD require semantics for
     * cross-folder libs are uncertain in NetSuite UIF — safer to keep
     * the routing tiny and local.
     *
     * Returns 1..5 (step index) or 'console' (post-activation).
     */
    function determineLandingStep(snap: SnapshotForRouting): number | 'console' {
        const has = function (v: string | undefined | null): boolean {
            return !!(v && String(v).trim().length > 0);
        };
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
     * Advance to the next step (or jump to a specific step). Re-renders.
     * Always flips MODE back to 'stepper' — used both for normal nav
     * AND for jumping out of the Admin Console into a specific step.
     */
    function goToStep(stepNum: number): void {
        setMode('stepper');
        setCurrentStep(Math.max(1, Math.min(deps.totalSteps, stepNum)));
        deps.rerender();
        if (CURRENT_STEP === 1) deps.loadPrereqs();
        if (CURRENT_STEP === 3) loadStep3Lists({ rerender: deps.rerender });
        if (CURRENT_STEP === 4) loadStep4Lists({ rerender: deps.rerender });
        if (CURRENT_STEP === 5) loadStep5({
            rerender: deps.rerender,
            goToConsole: goToConsole
        });
    }

    /**
     * U1 (Phase 3a): enter Admin Console mode. Lands admin on 'overview'
     * section by default and triggers the once-per-mount data load.
     * U1.5: also flips RAIL_VISIBLE so the left rail persists into
     * stepper mode if admin clicks "Re-run wizard."
     */
    function goToConsole(): void {
        setMode('console');
        setSelectedSection('overview');
        setRailVisible(true);
        STATE.console.pendingDeactivateConfirm = false;
        STATE.console.deactivateError = null;
        STATE.console.actionError = null;
        STATE.console.activeModal = null;
        deps.loadConsole();
    }

    /**
     * U1 / U6: section navigator. Called from NavigationDrawer's
     * onSelectedValueChanged. Switches SELECTED_SECTION and triggers
     * rerender — sections share STATE.console so no additional fetch
     * is needed unless the section has section-specific data.
     */
    function goToSection(sectionName: SectionName): void {
        setSelectedSection(sectionName);
        // U1.5: if entering console from stepper mode (Re-run → navigate),
        // also flip MODE back so the rail's onSelectedValueChanged sees
        // console state.
        if (MODE === 'stepper') {
            setMode('console');
        }
        STATE.console.pendingDeactivateConfirm = false; // cancel pending
        STATE.console.actionError = null;
        deps.rerender();

        // U3 (Phase 3b): lazy-load Phones-section's Twilio phone list
        // when admin first navigates there. Employees are pre-loaded in
        // loadConsole so the DataGrid has them on first render (avoids
        // the chip-display timing race).
        if (sectionName === 'phones' &&
            STATE.console.phonesNumbers === null) {
            deps.loadPhonesData();
        }
    }

    return { determineLandingStep, goToStep, goToConsole, goToSection };
}
