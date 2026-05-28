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
//   directly in src/FileCabinet/SuiteApps/.../. Those
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
//   - filename matches one of these canonical SPA entry names
//   - file content contains @NScriptType JSDoc (server-side script
//     compiled from TS, when JSDoc preservation is on)
//
// JSDoc-based detection is a fallback for non-canonical filenames.
// Since tsconfig.build.json sets `removeComments: true` (so the
// banner injection isn't duplicated in the AMD output), JSDoc is
// stripped from the build files — the filename-based check is the
// primary path.
const ENTRY_POINT_FILENAMES = ['SpaClient.js', 'SpaServer.js'];
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

// Find SPA folders — defined as the directory that DIRECTLY CONTAINS
// a SpaServer.ts/tsx source file. Returns paths relative to
// srcSuiteAppDir so the FileCabinet output preserves identical nesting.
//
// This handles arbitrarily nested SPA folders. For our SuiteApp:
//   src/SuiteApps/com.netsuite.clicktocall/setup_wizard/SpaServer.ts
//   → relativePath = "com.netsuite.clicktocall/setup_wizard"
//   → cleanBundles deletes ONLY the setup_wizard/ output directory
//     (NOT the parent  which contains hand-written
//      CTC scripts that must never be touched by this pipeline).
const findSpaFolders = () => {
    if (!exists(srcSuiteAppDir)) return [];
    const serverFiles = walkSync(srcSuiteAppDir, (f) => /SpaServer\.tsx?$/i.test(f));
    return serverFiles.map((file) => {
        const spaPath = path.dirname(file);
        return {
            relativePath: path.relative(srcSuiteAppDir, spaPath),
            srcPath: spaPath
        };
    });
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

// Remove ONLY .js files in the SPA output directory that have a
// CORRESPONDING TS SOURCE under src/SuiteApps/. Hand-written .js
// files that haven't been migrated yet (e.g., SpaClient.js during
// the Path B.3-B.5 sequence) are left alone.
//
// This is critical during incremental migration — Path B.2 only
// migrates SpaServer.js but leaves SpaClient.js hand-written until
// B.5. A naive "wipe everything in the output dir" would destroy
// the still-hand-written SpaClient.js on every build.
const cleanBundles = async () => {
    const spaFolders = findSpaFolders();
    for (const { relativePath, srcPath } of spaFolders) {
        const outDir = path.join(fileCabinetSuiteAppDir, relativePath);
        if (!exists(outDir)) continue;
        const generatedJs = walkSync(outDir, (f) => f.endsWith('.js'));
        for (const f of generatedJs) {
            const rel = path.relative(outDir, f);
            const tsSource = path.join(srcPath, rel.replace(/\.js$/, '.ts'));
            const tsxSource = path.join(srcPath, rel.replace(/\.js$/, '.tsx'));
            if (exists(tsSource) || exists(tsxSource)) {
                await fsp.unlink(f);
            }
            // Else: hand-written .js with no TS source — leave alone.
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
    for (const { relativePath, srcPath } of spaFolders) {
        const outDir = path.join(fileCabinetSuiteAppDir, relativePath);
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
