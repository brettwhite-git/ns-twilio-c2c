/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * Setup Wizard v2 — 6-step admin onboarding for the CTC SuiteApp.
 *
 * Implements the Suitelet-as-API pattern (plan §"Key Technical Decisions" #3):
 * the same Suitelet renders the 6-step HTML page for GET requests AND serves
 * JSON for AJAX-style action calls via `?action=wizardX`. Avoids the
 * Web Services Concurrent User Limit that would constrain a RESTlet-based
 * design (SDF Pitfall #29: Standard tier = 5 concurrent users; one admin's
 * wizard session could exhaust it).
 *
 * Security posture (plan §"Key Technical Decisions" #4 — defense in depth):
 *   - Deployment XML: <permittedrole>ADMINISTRATOR</permittedrole>,
 *     <isonline>F</isonline> (require login), no <runasrole> (run as the
 *     calling admin, not as an escalated proxy), no <allroles>.
 *   - Runtime layer 1: first line of onRequest re-checks admin role; the
 *     XML role gate is enforced by NetSuite but never relied upon alone.
 *   - Runtime layer 2: every action handler re-checks admin (defense in
 *     depth across action boundaries). Wired in U3-U7.
 *
 * U2 scope: shell only — admin gate, step navigation, HTML render path,
 * action dispatcher skeleton (no per-step business logic). Steps 1-6 each
 * show a placeholder "coming soon in U3-U7" pane.
 */
// eslint-disable-next-line suitescript/no-log-module
define(['N/runtime', 'N/log', 'N/record', './lib/ctc_html', './lib/ctc_config', './lib/ctc_wizard_state'],
       (runtime, log, record, ctcHtml, ctcConfig, wizardState) => {

    const escapeHtml = ctcHtml.escapeHtml;
    const escapeJs   = ctcHtml.escapeJs;

    // Administrator role ID is 3 across every NetSuite account (standard
    // roles have fixed IDs; only custom roles vary per install). Named
    // constant + portability comment per the plan's replicability section.
    const ADMIN_ROLE_ID = 3;

    /**
     * Entry point. Dispatches by `?action=<name>` query parameter:
     *   - no action (or 'render') → returns the 6-step HTML shell
     *   - action handler → returns JSON
     * Every path begins with an admin role check.
     */
    const onRequest = (context) => {
        try {
            // ── Layer 1: runtime admin gate ─────────────────────────────
            const currentRole = Number(runtime.getCurrentUser().role);
            if (currentRole !== ADMIN_ROLE_ID) {
                return renderAccessDenied(context);
            }

            const action = (context.request.parameters.action || '').trim();
            if (!action || action === 'render') {
                return renderWizardHtml(context);
            }
            return dispatchAction(context, action);
        } catch (e) {
            log.error({
                title: 'CTC Setup Wizard — onRequest failed',
                details: 'action=' + (context.request.parameters.action || '(none)') +
                         ' name=' + (e && e.name) +
                         ' message=' + (e && e.message) +
                         ' stack=' + (e && e.stack)
            });
            // Never leak internals in the response — opaque error to the client.
            return writeJsonResponse(context, { ok: false, error: 'internal-error' }, 500);
        }
    };

    // ─────────────────────────────────────────────────────────────────────
    // Action dispatcher
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Action registry. U2 ships an empty surface — U3 adds wizardPrereqs,
     * U4 adds wizardValidateTwilio + wizardSavePublicIds etc., U5 adds the
     * phone-numbers/rep-assignment actions, U6 adds the reps/roles ones,
     * U7 adds wizardRunPreflight + wizardActivate.
     *
     * Each handler is admin-gated again at its top line (defense in depth).
     * Each returns JSON `{ ok: boolean, ...payload }`.
     */
    const ACTIONS = {
        // Wired in U3-U7 — placeholder entries return a structured error
        // so the client can render "this action is not available yet"
        // during dev without crashing.
    };

    const dispatchAction = (context, action) => {
        const handler = ACTIONS[action];
        if (!handler) {
            log.audit({ title: 'CTC Setup Wizard — unknown action', details: action });
            return writeJsonResponse(context, { ok: false, error: 'unknown-action', action: action }, 400);
        }
        const payload = readJsonBody(context.request);
        const result = handler(payload, context);
        return writeJsonResponse(context, result, result && result.ok === false ? 400 : 200);
    };

    const readJsonBody = (request) => {
        try {
            const body = request.body;
            if (!body) return {};
            return JSON.parse(body);
        } catch (e) {
            // Malformed JSON — treat as empty so handlers can validate
            // and emit a clean error envelope.
            return {};
        }
    };

    const writeJsonResponse = (context, obj, status) => {
        context.response.setHeader({ name: 'Content-Type', value: 'application/json' });
        if (status && status !== 200) {
            // NetSuite SuiteScript 2.1 doesn't expose response.setStatus directly
            // in all contexts; the body's ok=false is the authoritative signal.
            // Status code is best-effort.
            try { context.response.setStatusCode && context.response.setStatusCode(status); } catch (e) { /* ignore */ }
        }
        context.response.write(JSON.stringify(obj || {}));
    };

    // ─────────────────────────────────────────────────────────────────────
    // HTML render path
    // ─────────────────────────────────────────────────────────────────────

    const renderWizardHtml = (context) => {
        // Tolerate a missing config record on fresh installs — Step 1
        // prereqs (U3) is responsible for creating the singleton. Until
        // that lands, treat "no config" as "land on Step 2" with an
        // empty snapshot.
        let config = null;
        try {
            config = ctcConfig.loadConfig();
        } catch (e) {
            log.audit({
                title: 'CTC Setup Wizard — no config record yet (fresh install)',
                details: 'will land on Step 2 with empty snapshot; U3 prereqs will create the singleton'
            });
        }

        const snapshot = wizardState.snapshotFromConfig(config || {});
        const stepFromUrl = parseInt(context.request.parameters.step, 10);
        const stepFromState = wizardState.determineCurrentStep(snapshot);
        const currentStep = (stepFromUrl >= 1 && stepFromUrl <= 6) ? stepFromUrl : stepFromState;

        const accountId = runtime.accountId || '';
        const isSandbox = String(accountId).indexOf('_SB') !== -1;

        const html = buildHtml({
            currentStep: currentStep,
            snapshot: snapshot,
            accountId: accountId,
            isSandbox: isSandbox
        });

        context.response.setHeader({ name: 'Content-Type', value: 'text/html; charset=utf-8' });
        context.response.write(html);
    };

    const renderAccessDenied = (context) => {
        context.response.setHeader({ name: 'Content-Type', value: 'text/html; charset=utf-8' });
        context.response.write(
            '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Access denied</title>' +
            '<style>body{font-family:system-ui,sans-serif;padding:40px;color:#1F2F4D;background:#F5F7FA;}' +
            'h1{font-size:18px;font-weight:600;margin:0 0 12px;}' +
            'p{font-size:13px;color:#5A6B85;max-width:480px;line-height:1.5;}</style></head><body>' +
            '<h1>Access denied</h1>' +
            '<p>The CTC Setup Wizard requires the Administrator role. ' +
            'If you are a sales rep, your administrator runs this once during setup; ' +
            'you do not need to access this page.</p>' +
            '</body></html>'
        );
    };

    // ─────────────────────────────────────────────────────────────────────
    // HTML body — single template literal
    //
    // Template-literal gotchas (docs/solutions/runtime-errors/
    // suitelet-template-literal-gotchas.md):
    //   - Every backtick character inside the HTML body must be escaped
    //     or substituted. Comments are NOT immune — the parser does not
    //     know HTML.
    //   - Undefined backslash escapes (\D, \d, \s, \w, ...) collapse
    //     silently. Use explicit char classes ([^0-9], [A-Z0-9]) in any
    //     embedded regex.
    // ─────────────────────────────────────────────────────────────────────

    const buildHtml = (opts) => {
        const currentStep = opts.currentStep;
        const snapshot = opts.snapshot;
        const sandboxBanner = opts.isSandbox
            ? '<div class="env-banner">SANDBOX &middot; ' + escapeHtml(opts.accountId) + '</div>'
            : '';

        return '<!DOCTYPE html>\n' +
'<html lang="en">\n' +
'<head>\n' +
'    <meta charset="UTF-8">\n' +
'    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
'    <title>Click-to-Call &mdash; Setup Wizard</title>\n' +
'    <style>' + buildCss() + '</style>\n' +
'</head>\n' +
'<body>\n' +
sandboxBanner +
'    <header class="page-header">\n' +
'        <h1>Click-to-Call &mdash; Setup Wizard</h1>\n' +
'        <p class="page-sub">Six steps to a working softphone install. Each step validates against Twilio live before you can move on.</p>\n' +
'    </header>\n' +
'    <main class="wizard">\n' +
'        <div class="stepper">' + buildStepper(currentStep, snapshot) + '</div>\n' +
'        <section class="wizard-body">' + buildStepPane(currentStep, snapshot) + '</section>\n' +
'        <footer class="wizard-footer">' + buildFooter(currentStep) + '</footer>\n' +
'    </main>\n' +
'    <script>' + buildClientJs() + '</script>\n' +
'</body>\n' +
'</html>';
    };

    const buildStepper = (currentStep, snapshot) => {
        // Step 1 is implicitly "passes when admin can load this page" — mark
        // done as soon as we render. Other steps' done-state is derived from
        // the snapshot's stage flags so the stepper reflects reality, not
        // just URL position.
        const done = {
            1: true, // we're rendering => prereqs pass for the gating layers we control
            2: snapshot.hasCredentials,
            3: snapshot.hasVoiceConfig,
            4: false, // refined in U5 — needs rep_assignment row count
            5: false, // refined in U6
            6: snapshot.isActive
        };
        return wizardState.STEPS.map((step) => {
            const isDone   = !!done[step.num] && step.num < currentStep;
            const isActive = step.num === currentStep;
            const cls = 'step' + (isActive ? ' active' : '') + (isDone ? ' done' : '');
            const num = isDone ? '&check;' : String(step.num);
            return '<div class="' + cls + '">' +
                '<div class="num">' + num + '</div>' +
                '<div class="label">' + escapeHtml(step.label) + '</div>' +
                '<div class="sub">' + escapeHtml(step.sub) + '</div>' +
            '</div>';
        }).join('');
    };

    const buildStepPane = (currentStep, snapshot) => {
        // U2 ships placeholder panes — U3-U7 fill these with real forms.
        const stepLabels = wizardState.STEPS.map((s) => s.label);
        const label = stepLabels[currentStep - 1] || 'Setup';
        return '<p class="eyebrow">Step ' + currentStep + ' &mdash; ' + escapeHtml(label) + '</p>' +
            '<h2 class="step-title">' + escapeHtml(label) + '</h2>' +
            '<p class="step-body">This step ships in implementation unit U' + (currentStep + 2) + '. ' +
            'The wizard shell is in place; each step plugs in next.</p>' +
            '<div class="placeholder-card">' +
                '<div class="placeholder-card-title">Snapshot summary</div>' +
                '<div class="placeholder-card-row"><span>Public IDs configured</span><span>' + (snapshot.hasPublicIds ? 'yes' : 'no') + '</span></div>' +
                '<div class="placeholder-card-row"><span>Auth credential reachable</span><span>' + (snapshot.hasAuthCredential ? 'yes' : 'no') + '</span></div>' +
                '<div class="placeholder-card-row"><span>API Key Secret configured</span><span>' + (snapshot.hasApiKeySecret ? 'yes' : 'no') + '</span></div>' +
                '<div class="placeholder-card-row"><span>Voice config saved</span><span>' + (snapshot.hasVoiceConfig ? 'yes' : 'no') + '</span></div>' +
                '<div class="placeholder-card-row"><span>Activated</span><span>' + (snapshot.isActive ? 'yes' : 'no') + '</span></div>' +
            '</div>';
    };

    const buildFooter = (currentStep) => {
        const prevDisabled = currentStep <= 1 ? ' disabled' : '';
        const nextDisabled = currentStep >= 6 ? ' disabled' : '';
        return '<button type="button" class="btn-secondary" data-nav="prev"' + prevDisabled + '>&larr; Back</button>' +
            '<span class="progress">Step <strong>' + currentStep + '</strong> of 6</span>' +
            '<button type="button" class="btn-primary" data-nav="next"' + nextDisabled + '>Continue &rarr;</button>';
    };

    // ─────────────────────────────────────────────────────────────────────
    // CSS — kept minimal in U2; the wireframe at
    // docs/architecture/setup-wizard-v2.html shows the full design
    // language. U3-U7 will introduce the per-step component CSS.
    // ─────────────────────────────────────────────────────────────────────

    const buildCss = () => {
        return ''
        + 'html,body{margin:0;padding:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1F2F4D;background:#F5F7FA;}'
        + '.env-banner{background:#FBE9D2;color:#80572B;font-size:11px;font-weight:600;letter-spacing:0.06em;text-align:center;padding:6px 0;text-transform:uppercase;}'
        + '.page-header{max-width:880px;margin:32px auto 16px;padding:0 24px;}'
        + '.page-header h1{font-size:20px;font-weight:600;margin:0 0 4px;}'
        + '.page-sub{font-size:13px;color:#5A6B85;margin:0;max-width:640px;line-height:1.5;}'
        + '.wizard{max-width:880px;margin:0 auto 48px;background:#FFFFFF;border:1px solid #E2E7EF;border-radius:8px;overflow:hidden;}'
        + '.stepper{display:flex;border-bottom:1px solid #E2E7EF;background:#FAFBFD;padding:12px 16px;}'
        + '.step{flex:1;display:flex;flex-direction:column;align-items:flex-start;padding:4px 8px;border-right:1px solid #E2E7EF;}'
        + '.step:last-child{border-right:none;}'
        + '.step .num{width:24px;height:24px;border-radius:50%;background:#E2E7EF;color:#5A6B85;font-size:12px;font-weight:600;display:flex;align-items:center;justify-content:center;margin-bottom:6px;}'
        + '.step.active .num{background:#1F4A8E;color:#FFFFFF;}'
        + '.step.done .num{background:#14B981;color:#FFFFFF;}'
        + '.step .label{font-size:12px;font-weight:600;color:#1F2F4D;}'
        + '.step.active .label{color:#1F4A8E;}'
        + '.step .sub{font-size:10.5px;color:#94A6BF;letter-spacing:0.02em;text-transform:uppercase;margin-top:2px;}'
        + '.wizard-body{padding:32px;min-height:240px;}'
        + '.eyebrow{font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#94A6BF;margin:0 0 8px;}'
        + '.step-title{font-size:18px;font-weight:600;margin:0 0 12px;color:#1F2F4D;}'
        + '.step-body{font-size:13.5px;color:#5A6B85;margin:0 0 20px;line-height:1.55;}'
        + '.placeholder-card{border:1px solid #E2E7EF;border-radius:6px;padding:14px 16px;background:#FAFBFD;}'
        + '.placeholder-card-title{font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#94A6BF;margin-bottom:8px;}'
        + '.placeholder-card-row{display:flex;justify-content:space-between;font-size:12.5px;padding:4px 0;color:#1F2F4D;}'
        + '.placeholder-card-row span:last-child{color:#5A6B85;font-variant-numeric:tabular-nums;}'
        + '.wizard-footer{display:flex;align-items:center;justify-content:space-between;border-top:1px solid #E2E7EF;padding:14px 24px;background:#FAFBFD;}'
        + '.wizard-footer .progress{font-size:11px;color:#5A6B85;letter-spacing:0.04em;}'
        + '.wizard-footer .progress strong{color:#1F2F4D;font-weight:600;}'
        + '.btn-primary,.btn-secondary{font:inherit;font-size:13px;font-weight:600;padding:8px 14px;border-radius:6px;cursor:pointer;letter-spacing:0.02em;}'
        + '.btn-primary{background:#1F4A8E;color:#FFFFFF;border:1px solid #1F4A8E;}'
        + '.btn-primary:hover:not(:disabled){background:#2A5BA8;}'
        + '.btn-secondary{background:#FFFFFF;color:#1F2F4D;border:1px solid #C8D2DF;}'
        + '.btn-secondary:hover:not(:disabled){background:#F5F7FA;}'
        + '.btn-primary:disabled,.btn-secondary:disabled{opacity:0.4;cursor:not-allowed;}'
        + '';
    };

    // ─────────────────────────────────────────────────────────────────────
    // Embedded client JS — step navigation only in U2.
    //
    // Hardening rules (see template-literal gotchas doc):
    //   - All regex uses explicit char classes, NOT \\D / \\d / \\s
    //   - No literal backticks anywhere in this string
    // ─────────────────────────────────────────────────────────────────────

    const buildClientJs = () => {
        return ''
        + '(function(){'
        + '  function getStepFromUrl(){'
        + '    var match = window.location.search.match(/[?&]step=([0-9]+)/);'
        + '    return match ? parseInt(match[1], 10) : 1;'
        + '  }'
        + '  function navigate(deltaOrAbsolute, opts){'
        + '    var current = getStepFromUrl();'
        + '    var target = (opts && opts.absolute) ? deltaOrAbsolute : current + deltaOrAbsolute;'
        + '    if (target < 1 || target > 6) return;'
        + '    var url = new URL(window.location.href);'
        + '    url.searchParams.set("step", String(target));'
        + '    url.searchParams.delete("action");'
        + '    window.location.href = url.toString();'
        + '  }'
        + '  document.addEventListener("click", function(e){'
        + '    var nav = e.target.closest && e.target.closest("[data-nav]");'
        + '    if (!nav || nav.disabled) return;'
        + '    if (nav.dataset.nav === "next") navigate(1);'
        + '    else if (nav.dataset.nav === "prev") navigate(-1);'
        + '  });'
        + '  document.addEventListener("click", function(e){'
        + '    var step = e.target.closest && e.target.closest(".step");'
        + '    if (!step) return;'
        + '    var stepNum = step.querySelector(".num");'
        + '    if (!stepNum) return;'
        + '    var n = parseInt(stepNum.textContent.replace(/[^0-9]/g, ""), 10);'
        + '    if (n >= 1 && n <= 6) navigate(n, { absolute: true });'
        + '  });'
        + '  // Exposed for U3-U7 action handlers to share the fetch shape.'
        + '  window.ctcWizardCall = function(action, payload){'
        + '    var url = new URL(window.location.href);'
        + '    url.searchParams.set("action", action);'
        + '    url.searchParams.delete("step");'
        + '    return fetch(url.toString(), {'
        + '      method: "POST",'
        + '      headers: { "Content-Type": "application/json" },'
        + '      body: JSON.stringify(payload || {})'
        + '    }).then(function(r){ return r.json(); });'
        + '  };'
        + '})();';
    };

    return { onRequest: onRequest };
});
