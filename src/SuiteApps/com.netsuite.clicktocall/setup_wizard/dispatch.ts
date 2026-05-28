// @ts-check
/**
 * Dispatch state — the four top-level navigation flags that control
 * which view the Setup Wizard / Admin Console renders.
 *
 * Path B.3c (2026-05-27) — extracted from SpaClient.ts. The goToStep /
 * goToConsole / goToSection mutator functions still live in
 * SpaClient.ts for now (they have heavy dependencies on STATE +
 * rerender + load* helpers that haven't been extracted yet). Those
 * functions now call setMode/setCurrentStep/etc. to mutate this
 * module's state.
 *
 * Why use `export let` + setters instead of a state object?
 *   ESM imports are read-only from the importer's perspective.
 *   Importers see the LIVE value via the binding (Rollup preserves
 *   this in concatenated bundles), but can only ASSIGN through the
 *   exported setter. This keeps mutations explicit + grep-able while
 *   reads stay direct (no `dispatch.mode` boilerplate at 50+ sites).
 */

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

/**
 * Top-level view mode:
 *   - 'stepper': the 5-step onboarding wizard (Steps 1-5)
 *   - 'console': the post-activation Admin Console
 * Mutated by run() resumability + console actions (e.g., "Re-run wizard
 * from start" flips back to 'stepper').
 */
export type Mode = 'stepper' | 'console';

/**
 * Active section within MODE='console'. Routes content via
 * NavigationDrawer.onSelectedValueChanged. Mirrors the section files
 * under sections/ (to be extracted in B.3f-j).
 */
export type SectionName = 'overview' | 'phones' | 'voice' | 'credentials' | 'health';

// ─────────────────────────────────────────────────────────────────────
// Mutable state — exported as live bindings. Importers read directly;
// mutations route through the setters below.
// ─────────────────────────────────────────────────────────────────────

/** Top-level view mode (stepper vs console). */
export let MODE: Mode = 'stepper';

/** 1-based step index within MODE='stepper'. Range: 1..5. */
export let CURRENT_STEP: number = 1;

/** Active section within MODE='console'. */
export let SELECTED_SECTION: SectionName = 'overview';

/**
 * U1.5: once admin reaches the console (snapshot.active === true), the
 * left rail stays visible even when they click "Re-run wizard" and
 * drop back into stepper mode. Only fresh installs (never activated)
 * see the rail-less full-page stepper.
 */
export let RAIL_VISIBLE: boolean = false;

// ─────────────────────────────────────────────────────────────────────
// Setters — the ONLY way to mutate dispatch state from outside this
// module. Centralizes assignments so a future grep for "setMode(" or
// "setCurrentStep(" finds every transition site.
// ─────────────────────────────────────────────────────────────────────

export const setMode = (m: Mode): void => { MODE = m; };
export const setCurrentStep = (n: number): void => { CURRENT_STEP = n; };
export const setSelectedSection = (s: SectionName): void => { SELECTED_SECTION = s; };
export const setRailVisible = (v: boolean): void => { RAIL_VISIBLE = v; };
