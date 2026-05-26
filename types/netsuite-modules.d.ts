// Path B (added 2026-05-26) — minimal ambient declarations for the
// NetSuite SuiteScript N/* modules that our Path B TypeScript source
// files import via ESM. tsc needs these for ESM `import x from 'N/x'`
// to resolve.
//
// Path A's hand-written AMD modules don't need these — they use
// `define([...], (runtime, log, ...) => ...)` where the factory
// params are typed as `any[]` by the ambient `define()` in
// netsuite-globals.d.ts.
//
// Scope is narrow on purpose: only declare modules ACTUALLY imported
// by a TypeScript source file. Grow this file as new modules are
// imported during Path B section extractions. If the list crosses
// ~10 modules with non-trivial surfaces, switch to the community
// package @hitc/netsuite-types (used by Oracle's airport360 sample
// for the same purpose).
//
// At NetSuite runtime, the gulpfile's rollup config marks /^N$/ and
// /^N\// as `external` — these imports are resolved by NetSuite's
// host environment, NOT bundled.

declare module 'N/runtime' {
    interface User {
        id: number;
        name: string;
        email: string;
        location: number;
        department: number;
        role: number;
        roleId: string;
        roleCenter: string;
        contact: number;
        subsidiary: number;
        getPreference(options: { name: string }): string;
    }

    interface Script {
        id: string;
        deploymentId: string;
        getRemainingUsage(): number;
        getParameter(options: { name: string }): string | number | boolean | null;
    }

    const accountId: string;
    const envType: string;
    const version: string;

    function getCurrentUser(): User;
    function getCurrentScript(): Script;

    const runtime: {
        accountId: string;
        envType: string;
        version: string;
        getCurrentUser(): User;
        getCurrentScript(): Script;
    };

    export default runtime;
    export { getCurrentUser, getCurrentScript, accountId, envType, version };
}

declare module 'N/log' {
    interface LogEntry {
        title: string;
        details?: string | object;
    }

    function debug(entry: LogEntry): void;
    function audit(entry: LogEntry): void;
    function error(entry: LogEntry): void;
    function emergency(entry: LogEntry): void;

    const log: {
        debug(entry: LogEntry): void;
        audit(entry: LogEntry): void;
        error(entry: LogEntry): void;
        emergency(entry: LogEntry): void;
    };

    export default log;
    export { debug, audit, error, emergency };
}
