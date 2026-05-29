/**
 * Route enum — canonical hash-based route paths for the wizard + console.
 *
 * Phase 1 (2026-05-28) — added in preparation for Phase 6's Router.Hash
 * + Router.Routes JSX shell. Mirrors item360 / airport360 sample
 * conventions: a flat dict of path strings, no enum class needed.
 *
 * Pattern reference: `oracle-samples/.../airport360/src/Route.tsx`.
 *
 * Usage (Phase 6 JSX shell): one Router.Route per path, with the matching
 * Page or Step component as the child. Programmatic navigation goes
 * through navigator.push(Route.STEP_TWILIO) etc.
 */

export const Route = {
    // Onboarding stepper (mode='stepper')
    STEP_PREREQS: '/step/1',
    STEP_TWILIO: '/step/2',
    STEP_VOICE: '/step/3',
    STEP_PHONES: '/step/4',
    STEP_ACTIVATE: '/step/5',

    // Admin console (mode='console')
    CONSOLE_OVERVIEW: '/console/overview',
    CONSOLE_PHONES: '/console/phones',
    CONSOLE_VOICE: '/console/voice',
    CONSOLE_CREDENTIALS: '/console/credentials',
    CONSOLE_HEALTH: '/console/health',

    // Default / catch-all
    ROOT: '/'
} as const;

export type RoutePath = typeof Route[keyof typeof Route];
