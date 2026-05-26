// Ambient declarations for NetSuite SuiteScript / UIF SPA globals.
// Path A scaffolding (2026-05-21) — pulled out of @types/requirejs to
// keep the dependency surface minimal. Only declares what our code
// actually uses.
//
// NetSuite runtime provides `define()` and `require()` via its AMD
// module loader at script execution time. They're not in any imported
// module, so without these ambients tsc emits `Cannot find name`.

declare function define(
    dependencies: string[],
    factory: (...modules: any[]) => any
): void;
declare function define(
    name: string,
    dependencies: string[],
    factory: (...modules: any[]) => any
): void;

declare function require(dependencies: string[], callback: (...modules: any[]) => any): void;
