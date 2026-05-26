// Path B (added 2026-05-26) — canonical Oracle SuiteCloud SPA build pipeline.
//
// Sources of truth:
//   - Oracle samples: github.com/oracle-samples/netsuite-suitecloud-samples/
//     tree/main/spa-suiteapp-samples (all 6 samples ship an identical
//     gulpfile.mjs — confirmed by ce-framework-docs-researcher)
//   - Practitioner reference: github.com/JustTanwa/basic-ns-spa
//   - Oracle Help Center: docs.oracle.com/en/cloud/saas/netsuite/
//     ns-online-help/subsect_0124095021.html (Build Process for SuiteApp
//     Projects with Single Page Applications)
//
// Pipeline:
//   src/SuiteApps/**/*.ts  →  tsc (gulp-typescript)  →  build/  (ESM)
//   build/**/*.js          →  rollup (format: amd)   →  src/FileCabinet/SuiteApps/**/*.js
//
// Hybrid SuiteApp safety:
//   This SuiteApp ALSO contains hand-written AMD modules (the softphone
//   Suitelet, RESTlet, scheduled script, UE scripts, libs) that live
//   directly in src/FileCabinet/SuiteApps/.../click_to_call/. Those
//   modules MUST NOT be touched by this pipeline.
//
//   The cleanBundles + bundleScripts tasks only descend into FileCabinet
//   subdirs that contain a SpaServer entry point (i.e., the setup_wizard
//   folder). All other subdirs are invisible to the pipeline. This is
//   the same protection mechanism the Oracle samples use to support
//   hybrid layouts (per docs: "The process ignores files inside
//   /src/SuiteApps/<ApplicationID> and outside
//   /src/SuiteApps/<ApplicationID>/<SpaFolder>").

import gulp from 'gulp';
import ts from 'gulp-typescript';
import { rollup } from 'rollup';
import terser from '@rollup/plugin-terser';
import path from 'path';
import fs from 'fs';
import fsp from 'fs/promises';

// ─────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────

const tsBuildDir = 'build';
const srcSuiteAppDir = path.join('src', 'SuiteApps');
const buildSuiteAppDir = path.join(tsBuildDir, 'src', 'SuiteApps');
const fileCabinetSuiteAppDir = path.join('src', 'FileCabinet', 'SuiteApps');

// Concatenate all of a SPA's modules into a single AMD file per entry
// point (matches the current hand-written SpaClient.js shape).
// Set to false for module-per-file output (preserves rollup tree).
const concatenateScripts = true;

// Minification disabled by default — keep AMD output readable for
// debugging / git-blame purposes. Set true for production-style
// builds if needed.
const minifyScripts = false;

// External module specifiers — these are resolved by NetSuite's hosted
// runtime, NOT by our bundler. Without the /^N$/ and /^N\// regexes,
// rollup tries to npm-resolve N/record etc. and fails.
const ROLLUP_EXTERNALS = [
    '@uif-js/core',
    '@uif-js/core/jsx-runtime',
    '@uif-js/component',
    /^N$/,
    /^N\//
];

// Entry-point detection: a built .js file is bundled as an AMD entry
// point if EITHER:
//   - filename matches SpaClient.js (the SPA boot file)
//   - file content contains @NScriptType JSDoc (server-side script,
//     e.g., SpaServer.js, RESTlets, scheduled scripts compiled from TS)
const ENTRY_POINT_FILENAMES = ['SpaClient.js'];
const ENTRY_POINT_JSDOC_PATTERN = /@NScriptType/;

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

const exists = (p) => fs.existsSync(p);

const walkSync = (dir, filter) => {
    if (!exists(dir)) return [];
    const out = [];
    const stack = [dir];
    while (stack.length) {
        const cur = stack.pop();
        const entries = fs.readdirSync(cur, { withFileTypes: true });
        for (const e of entries) {
            const full = path.join(cur, e.name);
            if (e.isDirectory()) stack.push(full);
            else if (!filter || filter(full)) out.push(full);
        }
    }
    return out;
};

const isEntryPoint = (filePath) => {
    if (!filePath.endsWith('.js')) return false;
    if (ENTRY_POINT_FILENAMES.includes(path.basename(filePath))) return true;
    try {
        // Read only the first 4 KiB — the JSDoc lives near the top.
        const fd = fs.openSync(filePath, 'r');
        const buf = Buffer.alloc(4096);
        const bytesRead = fs.readSync(fd, buf, 0, 4096, 0);
        fs.closeSync(fd);
        const head = buf.toString('utf8', 0, bytesRead);
        return ENTRY_POINT_JSDOC_PATTERN.test(head);
    } catch {
        return false;
    }
};

// Find SPA folder names (subdirs of src/SuiteApps/<appId>/ that contain
// a SpaServer source file). These are the only FileCabinet subdirs the
// cleanBundles task is allowed to wipe.
const findSpaFolders = () => {
    if (!exists(srcSuiteAppDir)) return [];
    const folders = [];
    const appDirs = fs.readdirSync(srcSuiteAppDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
    for (const appId of appDirs) {
        const appPath = path.join(srcSuiteAppDir, appId);
        const subdirs = fs.readdirSync(appPath, { withFileTypes: true })
            .filter((d) => d.isDirectory())
            .map((d) => d.name);
        for (const spa of subdirs) {
            const spaPath = path.join(appPath, spa);
            const files = walkSync(spaPath, (f) => /SpaServer\.tsx?$/i.test(f));
            if (files.length > 0) {
                folders.push({ appId, spa, srcPath: spaPath });
            }
        }
    }
    return folders;
};

// Critical: Rollup strips JSDoc comments during bundling, but NetSuite
// REQUIRES @NApiVersion + @NScriptType JSDoc on every server-side
// entry point. Without these, NetSuite's File Cabinet won't accept
// the file as a deployable script. Re-extract from the SOURCE and
// prepend to the bundled AMD output.
//
// Source: practitioner gotcha documented in JustTanwa/basic-ns-spa.
const extractJsDocBanner = (sourceFilePath) => {
    try {
        const src = fs.readFileSync(sourceFilePath, 'utf8');
        // Match the first /** ... */ comment block that contains
        // either @NApiVersion or @NScriptType.
        const match = src.match(/\/\*\*[\s\S]*?(?:@NApiVersion|@NScriptType)[\s\S]*?\*\//);
        return match ? match[0] + '\n' : '';
    } catch {
        return '';
    }
};

// ─────────────────────────────────────────────────────────────────────
// Tasks
// ─────────────────────────────────────────────────────────────────────

const cleanBuild = async () => {
    if (exists(tsBuildDir)) {
        await fsp.rm(tsBuildDir, { recursive: true, force: true });
    }
};

// Remove ONLY the FileCabinet subdirs that this pipeline produces
// (i.e., subdirs corresponding to a discovered SPA folder). Never
// touch other FileCabinet subdirs — those contain hand-written AMD
// modules outside the pipeline's scope.
const cleanBundles = async () => {
    const spaFolders = findSpaFolders();
    for (const { appId, spa } of spaFolders) {
        const outDir = path.join(fileCabinetSuiteAppDir, appId, spa);
        if (exists(outDir)) {
            // Only delete .js files generated by gulp. Other assets
            // (e.g., XML, images) might be hand-managed.
            const generatedJs = walkSync(outDir, (f) => f.endsWith('.js'));
            for (const f of generatedJs) {
                await fsp.unlink(f);
            }
        }
    }
};

const compileTs = () => {
    // Only run tsc if there are TS sources to compile (empty src/SuiteApps/
    // in Phase B.1 is intentional — first real TS source lands in B.2).
    if (!exists(srcSuiteAppDir) || findSpaFolders().length === 0) {
        return Promise.resolve();
    }
    const tsProject = ts.createProject('tsconfig.build.json');
    return new Promise((resolve, reject) => {
        const result = tsProject.src().pipe(tsProject());
        result.on('error', reject);
        result.js
            .pipe(gulp.dest(tsBuildDir))
            .on('end', resolve)
            .on('error', reject);
    });
};

const bundleScripts = async () => {
    if (!exists(buildSuiteAppDir)) {
        // Nothing built — Phase B.1 empty-state.
        return;
    }
    const entries = walkSync(buildSuiteAppDir, isEntryPoint);
    if (entries.length === 0) return;

    for (const entry of entries) {
        // Resolve the corresponding source file path for the JSDoc
        // banner extraction. build/src/SuiteApps/<app>/<spa>/X.js ↔
        // src/SuiteApps/<app>/<spa>/X.ts
        const relative = path.relative(buildSuiteAppDir, entry);
        const sourceTs = path.join(srcSuiteAppDir, relative.replace(/\.js$/, '.ts'));
        const banner = extractJsDocBanner(sourceTs);

        // Output to FileCabinet at the parallel path.
        const outputDir = path.join(fileCabinetSuiteAppDir, path.dirname(relative));
        await fsp.mkdir(outputDir, { recursive: true });
        const outputFile = path.join(outputDir, path.basename(entry));

        const bundle = await rollup({
            input: entry,
            external: ROLLUP_EXTERNALS,
            plugins: minifyScripts ? [terser()] : []
        });

        await bundle.write({
            file: outputFile,
            format: 'amd',
            banner: banner,
            // Avoid named-module conflicts in NetSuite's AMD loader.
            amd: { autoId: false },
            // Preserve readability; rollup default is concise.
            compact: minifyScripts,
            sourcemap: false
        });

        await bundle.close();
    }
};

// Copy non-source assets (e.g., XML, images) from src/SuiteApps/ to
// src/FileCabinet/SuiteApps/. SPA folders may include CSS or template
// files alongside the TS sources.
const bundleAssets = async () => {
    const spaFolders = findSpaFolders();
    for (const { appId, spa, srcPath } of spaFolders) {
        const outDir = path.join(fileCabinetSuiteAppDir, appId, spa);
        const assets = walkSync(srcPath, (f) => !/\.(ts|tsx|js|jsx)$/i.test(f));
        for (const asset of assets) {
            const rel = path.relative(srcPath, asset);
            const dest = path.join(outDir, rel);
            await fsp.mkdir(path.dirname(dest), { recursive: true });
            await fsp.copyFile(asset, dest);
        }
    }
};

// ─────────────────────────────────────────────────────────────────────
// Exports — gulp's public surface
// ─────────────────────────────────────────────────────────────────────

export const clean = gulp.series(cleanBuild, cleanBundles);
export const build = gulp.series(cleanBuild, compileTs);
export const bundle = gulp.series(build, cleanBundles, bundleScripts, bundleAssets);

// Default to bundle so `npx gulp` does the full pipeline.
export default bundle;
