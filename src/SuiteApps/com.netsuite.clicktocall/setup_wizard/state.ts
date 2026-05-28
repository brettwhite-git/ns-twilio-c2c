/**
 * Setup Wizard + Admin Console runtime state — legacy mutable singleton.
 *
 * Phase 1 (2026-05-28) — type interfaces moved to `app/InitialState.ts`
 * (single source of state-shape truth). This module now re-exports those
 * interfaces for back-compat with the 11 callers still importing
 * `{ STATE }` and mutating it directly:
 *
 *   - AppController.tsx
 *   - dispatch.ts
 *   - components/sections/{overview,phones,voice,credentials,health}.ts
 *   - components/steps/{step2,step3,step4,step5}.ts
 *   - orchestration/router.ts
 *
 * Phases 3-6 rewrite each caller to use store.getState() + store.dispatch
 * instead of mutating STATE; Phase 6 deletes this file entirely.
 *
 * Until then, the runtime STATE singleton coexists with the reducer's
 * immutable copy. They will diverge until callers migrate — that is
 * expected and accepted for the additive Phase 1 surface.
 */

import initialState from './app/InitialState';
import type {AppState as _WizardState} from './app/InitialState';

// Re-export interfaces so callers can keep `import type { Step2State } from '../../state'`
export type {
    Step2State,
    Step3State,
    Step4State,
    Step5State,
    ConsoleState,
    PrereqsState,
    AppState as WizardState
} from './app/InitialState';

/**
 * Runtime mutable singleton — same shape as the reducer's initial state,
 * but cloned so direct mutation in legacy callers doesn't poison the
 * Store's initial state reference.
 *
 * Deep clone via JSON round-trip is acceptable here because the state
 * tree contains only JSON-safe values (no functions, dates, or class
 * instances). If that changes in a future phase, swap to structuredClone.
 */
export const STATE: _WizardState = JSON.parse(JSON.stringify(initialState));
