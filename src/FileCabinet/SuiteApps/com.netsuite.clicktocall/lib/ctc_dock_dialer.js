/**
 * Telephony Dock — dialer panel (browser script, NOT a SuiteScript module).
 *
 * Loads after ctc_dock_client.js and registers the full softphone panel that
 * opens out of the pill: Dial, Search, Recents, the in-call screen, and audio
 * settings. In the phone mode shell it drives the phone in this tab; in a
 * normal (outside) tab it is a remote control for the phone another tab
 * holds (the same requests; the audio plays in that tab). The panel sits on the left or right
 * screen edge at one fixed size for every view, capped by the screen; the
 * grip in the header drags it to the other side (placement and drag live in
 * the client). Data
 * comes from the ctc_rl_token RESTlet over same-session fetch (the same
 * actions the anchor uses). Call control and audio device changes go to the
 * anchor (the shell's hidden #ctc-phone-frame) over the dock bus: the anchor
 * is the only window with audio.
 *
 * Header voicemail button: its red badge counts unheard voicemails (rows of
 * softphoneVoicemails whose `at` is newer than localStorage
 * ctc-vm-seen-<employeeId>); it opens the Voicemail view, which marks them
 * all seen. The list refreshes when the panel opens and every 5 min while it
 * shows. Recordings are deleted after transcription: rows offer Call back
 * and Open record (the Phone Call), never Play.
 *
 * Dial view record (DESIGN.md §4, asset 33): a typed number is looked up
 * (lookupCaller; "Looking up…", then a chip that loads the record). A
 * loaded record shows a person icon, its name (the link to the record) and
 * an insight line from softphoneAccountSnapshot; under the number a target
 * pill names whose number it is and opens a list of the record's numbers
 * (softphoneContacts, with lastCalled for the default target).
 *
 * Call screen (DESIGN.md §4, asset 38): one screen for an outbound call and
 * an inbound call once answered (identity block, 40 px slot, account block
 * from softphoneCallContext through recordCache, Mute · End · Keypad). After
 * the call it stays as the wrap-up (WRAP_MS, or until the rep acts):
 * "Call ended · 03:12", Summary, Call back · Done; no after-call note.
 *
 * Add to NetSuite sheet (DESIGN.md §6, asset 31): opens from the Dial
 * slot (a typed number with no record), a Recents row with no record
 * (row.unknown; with its Phone Call), "No match in NetSuite" in the ring
 * view, the call screen and its wrap-up, and the after-call note of a call
 * with no record (the Phone Call id from lastLog.recordUrl). RESTlet actions:
 * softphoneSearch + softphoneContacts (pickers), softphoneFindDuplicates,
 * softphoneAddToNetSuite.
 */
(function () {
    'use strict';

    var dock = window.__ctcDock;
    if (!dock || !dock.host || dock.host.dialer) return;
    var host = dock.host;
    var cfg = host.cfg;
    host.dialer = true;
    var formatPhone = dock.formatPhone;

    // answering: Answer sent, Twilio not connected yet (End works, Mute not).
    var ACTIVE = { dialing: true, ringing: true, answering: true, connected: true, reconnecting: true };
    var TALKING = { connected: true, reconnecting: true }; // Mute and the keypad work
    var PENDING_TIMEOUT_MS = 15000;
    var REFUSED_SHOW_MS = 4000;
    var SEARCH_DEBOUNCE_MS = 250;
    var NOTE_HIDE_MS = 10000; // 'saved' and 'skipped' notes hide by themselves
    var RECENTS_STALE_MS = 60000; // Recents reloads when opened after this long
    // A pending missed row goes once Recents has a Phone Call from the same
    // number that started no earlier than this before the miss was counted
    // (missedUnseen.at is when the ringing stopped; the record keeps the
    // time the ringing started).
    var PENDING_MATCH_MS = 120000;
    // Search row sub line: "Type · contact or phone".
    var TYPE_NAME = { customer: 'Customer', prospect: 'Prospect', lead: 'Lead', contact: 'Contact' };
    // Search filter icon menu: Show (type) and its labels.
    var FILTERS = [['', 'All'], ['customer', 'Customers'], ['prospect', 'Prospects'], ['lead', 'Leads']];
    // ... and Sort by (same menu), kept per browser.
    var SORTS = [['recent', 'Recent activity'], ['name', 'Name'], ['lastCalled', 'Last called']];
    var SORT_KEY = 'ctc-dock-sort';
    // Voicemail: unheard = row.at newer than localStorage VM_SEEN_PREFIX +
    // employee id (ISO). Refreshed when the panel opens (at most once per
    // VM_MIN_GAP_MS) and every VM_REFRESH_MS while it shows.
    var VM_SEEN_PREFIX = 'ctc-vm-seen-';
    var VM_REFRESH_MS = 5 * 60 * 1000;
    var VM_MIN_GAP_MS = 30000;
    var VM_LIMIT = 30;
    var LONG_PRESS_MS = 500; // a press on backspace this long clears the number; on 0 it types +
    // Match slot above the Dial number: after MATCH_DEBOUNCE_MS without a
    // keystroke, a typed number of MATCH_MIN_DIGITS or more is looked up
    // (RESTlet lookupCaller: the rep's book first) and a match shows as
    // "Name · Type"; a click loads that record.
    var MATCH_DEBOUNCE_MS = 300;
    var PREFETCH_HOVER_MS = 120; // a Search / Recents row under the pointer this long: prefetch
    var MATCH_MIN_DIGITS = 7;
    // A loaded record (DESIGN.md §4, asset 33): its numbers come from
    // softphoneContacts for these types (with lastCalled); the filter field
    // shows in the open list from TARGET_FILTER_MIN numbers.
    var CONTACT_TYPES = { customer: true, prospect: true, lead: true };
    var COMPANY_MAIN_ID = '__company_main__';
    var TARGET_FILTER_MIN = 7;
    // The sheet's four choices ([softphoneAddToNetSuite mode, label]); the
    // last shows only when there is a Phone Call to keep (phoneCallId).
    var AS_CHOICES = [
        ['existingContact', 'Add to a contact'],
        ['newContact', 'New contact at a company'],
        ['newCompany', 'New lead or prospect'],
        ['logOnly', 'Log without a record']
    ];
    // Choice 1 phone field: '' = the first empty one (the server picks).
    var AS_FIELDS = [['', 'Fill an empty field'], ['mobilephone', 'Mobile'], ['officephone', 'Office'], ['phone', 'Main']];
    // Phone colour tokens (DESIGN.md §1; the same values as the client's).
    // Buttons use go / stop; dots on the dark panel use goDot / stopDot.
    var T = {
        go: '#436B1D', goHover: '#385A18',
        stop: '#B3311F', stopHover: '#9A2A1B',
        goDot: '#8AC94F', stopDot: '#FF9D90',
        ring: '#6FB6D3', amber: '#F4C76A', wrap: '#B6A3D9', offline: '#8B8780'
    };
    // '#RRGGBB' + alpha -> 'rgba(r,g,b,a)'.
    function rgba(hex, a) {
        var n = parseInt(hex.slice(1), 16);
        return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')';
    }
    var PHASE_VIEW = {
        offline: { dot: T.offline, label: 'Phone offline' },
        starting: { dot: T.amber, label: 'Starting phone…' },
        error: { dot: T.stopDot, label: 'Phone error' },
        ready: { dot: T.goDot, label: 'Ready' },
        dialing: { dot: T.amber, label: 'Calling…' },
        ringing: { dot: T.amber, label: 'Calling…' },
        incoming: { dot: T.ring, label: 'Incoming call' }, // ring: ringing reads apart from talking
        answering: { dot: T.goDot, label: 'Connecting…' },
        connected: { dot: T.goDot, label: 'Connected' },
        reconnecting: { dot: T.amber, label: 'Reconnecting…' }
    };
    // Wrap-up: the chip says what the pill says (asset 42).
    var WRAP_VIEW = { dot: T.wrap, label: 'Call ended' };
    // Header badge for snap.error.kind between calls.
    var ERROR_VIEW = {
        mic: { dot: T.stopDot, label: 'Microphone blocked' },
        session: { dot: T.amber, label: 'Reconnecting…' }, // one name with the pill (asset 42)
        network: { dot: T.amber, label: 'Reconnecting…' },
        twilio: { dot: T.stopDot, label: 'Phone error' },
        paused: { dot: T.offline, label: 'Calling paused' },
        // Never "Ready · reconnecting" while signed out (asset 37).
        signed_out: { dot: T.amber, label: 'Signed out' }
    };
    // The first plain Ready after a sign-out, for SIGNED_IN_MS (asset 37).
    var SIGNED_IN_VIEW = { dot: T.goDot, label: 'Signed in \u00b7 Ready' };
    var SIGNED_IN_MS = 3000;
    // The Signed out card and the dimming leave with an opacity fade.
    var SO_LEAVE_MS = 160;
    var PAUSED_TEXT = 'Calling is paused by your administrator';
    // snap.callWarning (contract names, and the raw Twilio names) -> one line.
    var WARN_MIC = 'We can\'t hear your microphone';
    var WARN_NET = 'Weak connection';
    var CALL_WARNING_TEXT = {
        'low-mic': WARN_MIC, 'constant-audio-input-level': WARN_MIC,
        'no-audio': WARN_NET, 'packet-loss': WARN_NET, 'high-packet-loss': WARN_NET,
        'high-rtt': WARN_NET, 'high-jitter': WARN_NET, 'low-mos': WARN_NET, 'ice-connectivity-lost': WARN_NET
    };
    // snap.refused.reason -> a short muted line (shown once per nonce).
    var REFUSED_TEXT = {
        rate: 'Too many calls in a short time \u2014 wait a moment',
        'hourly-limit': 'Too many calls in a short time \u2014 wait a moment',
        'invalid-number': 'That number can\'t be dialled',
        busy: 'Finish the current call first',
        paused: PAUSED_TEXT
    };
    // Header badge when snap.canReceive === false in the ready phase.
    var READY_NOT_RECEIVING = { dot: T.amber, label: 'Ready · reconnecting' };
    var KEYS = [
        ['1', ''], ['2', 'ABC'], ['3', 'DEF'], ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'],
        ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ'], ['*', ''], ['0', '+'], ['#', '']
    ];

    var ICON_PHONE = '<path d="M2 5.5C2 3.6 3.6 2 5.5 2h1.3c.9 0 1.7.6 1.9 1.5l1 4c.2.8-.1 1.6-.8 2.1l-1.5 1.1a12 12 0 0 0 5.9 5.9l1.1-1.5c.5-.7 1.3-1 2.1-.8l4 1c.9.2 1.5 1 1.5 1.9v1.3c0 1.9-1.6 3.5-3.5 3.5A16.5 16.5 0 0 1 2 5.5z"></path>';
    var ICON_MIC = '<rect x="9" y="2" width="6" height="12" rx="3"></rect><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3"></path>';
    var ICON_MIC_OFF = '<path d="M2 2l20 20M9 9v3a3 3 0 0 0 5.1 2.1M15 9.3V5a3 3 0 0 0-5.9-.6M19 10v2a7 7 0 0 1-.6 2.8M5 10v2a7 7 0 0 0 12 5M12 19v3"></path>';
    var STROKE = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
    var STROKE2 = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
    // L3 03 Components icons (viewBox 0 0 24 24).
    var ICON_VM = '<circle cx="6.5" cy="12" r="3.5"></circle><circle cx="17.5" cy="12" r="3.5"></circle><path d="M6.5 15.5h11"></path>';
    var ICON_USER = '<circle cx="12" cy="8" r="4"></circle><path d="M4 21a8 8 0 0 1 16 0"></path>';
    var ICON_SEARCH = '<circle cx="11" cy="11" r="6"></circle><path d="M20 20l-4.5-4.5"></path>';
    var ICON_X = '<path d="M6 6l12 12M18 6L6 18"></path>';
    var ICON_CARET = '<path d="M6 9l6 6 6-6"></path>';
    var ICON_CHECK = '<path d="M4 12l5 5L20 6"></path>';
    // Filter: three dashes of decreasing length.
    var ICON_FILTER = '<path d="M4 7h16M7 12h10M10 17h4"></path>';
    // Open record: an arrow out of a box.
    var ICON_OPEN = '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"></path>';
    // Back chevron (Audio settings, Add to NetSuite, Voicemail).
    var ICON_BACK = '<svg width="18" height="18" viewBox="0 0 24 24" ' + STROKE2 + '><path d="M15 6l-6 6 6 6"></path></svg>';
    var USER_SVG = function (size) {
        return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" ' + STROKE2 + '>' + ICON_USER + '</svg>';
    };
    // Recents direction icons: bare arrows, down-left (in, missed), up-right (out).
    var DIR_VIEW = {
        'in': { label: 'Inbound call', path: 'M17 7L7 17M15 17H7V9' },
        out: { label: 'Outbound call', path: 'M7 17L17 7M9 7h8v8' },
        missed: { label: 'Missed call', path: 'M17 7L7 17M15 17H7V9' }
    };

    host.css([
        // Position, width and height come from the client (placePanel): one
        // size for every view. Header and footer stay; the body fills the
        // rest and scrolls. The panel is not inside .dock, so it restates the
        // dock's font and pointer rules.
        // --dl-cols / --dl-gap: the keypad's 3 columns (65 px, 24 px apart),
        // shared by the tabs, the keypad and the Dial footer, so Search, 0
        // and Call share one centre line (DESIGN.md §4, asset 32).
        '.dl{--dl-cols:repeat(3,65px);--dl-gap:24px;position:fixed;left:0;top:0;width:380px;display:flex;flex-direction:column;color:#FFFFFF;pointer-events:auto;font-family:"Oracle Sans","Helvetica Neue",Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}',
        // Open / close: fade + 12 px slide from the panel's edge (data-side
        // from the client: l, r, else the row's t or b).
        '.dl.closed{opacity:0;transform:translateX(12px);pointer-events:none}',
        '.dl[data-side="l"].closed{transform:translateX(-12px)}',
        '.dl[data-side="t"].closed{transform:translateY(-12px)}',
        '.dl[data-side="b"].closed{transform:translateY(12px)}',
        '.dl-head{position:relative;display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;padding:18px 14px 0;flex-shrink:0;cursor:grab;user-select:none;-webkit-user-select:none}',
        // Call alerts line under the header buttons (notify default / denied).
        '.dl-alerts{flex-basis:100%;display:flex;justify-content:center;min-height:24px;align-items:center}',
        '.dl-alerts .dl-text{font-size:12px;padding:4px 8px}',
        '.dl-alerts-off{font-size:12px;color:#6B7B95}',
        '.dl-head:active{cursor:grabbing}',
        '.dl-head button{cursor:pointer}',
        // The grip says the panel can be dragged (same dots as the pill grip).
        '.dl-grip{position:absolute;top:6px;left:50%;transform:translateX(-50%);display:grid;grid-template-columns:repeat(3,3px);gap:3px;pointer-events:none}',
        '.dl-grip i{width:3px;height:3px;border-radius:999px;background:rgba(255,255,255,0.32)}',
        // The status badge sits exactly in the middle of the header, level
        // with the header buttons (right). Two equal side columns (1fr) keep
        // it centred: the left one is empty, the right one is never narrower
        // than the buttons. A label too long to stay centred moves left,
        // then ends in an ellipsis; it never goes under the buttons.
        '.dl-head-row{flex:1 1 100%;min-width:0;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,auto) minmax(max-content,1fr);align-items:center}',
        '.dl-head-row .dl-icon{margin-left:8px}',
        '.dl-head-r{grid-column:3;display:flex;align-items:center;justify-content:flex-end}',
        '.dl-head .dl-status{grid-column:2;justify-self:center;max-width:100%;min-width:0;box-sizing:border-box;overflow:hidden;white-space:nowrap}',
        '.dl-status{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:999px;font-size:12px;color:var(--dl-dot,#94A6BF);background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08)}',
        '.dl-status .dot{position:relative;width:6px;height:6px;background:var(--dl-dot,#94A6BF)}',
        // Ring rule (DESIGN.md §3, asset 41): one signal per state, every
        // ring ends 6 px beyond its element, 1.6 s loop, transform and
        // opacity only. Incoming: the status dot rings (6 -> 18 px, ring
        // colour) and Answer pulses. Calling: the status dot breathes amber.
        // Nothing else moves; the caller's icon stays still.
        '.dl-status{isolation:isolate}',
        '.dl[data-phase="incoming"] .dl-status .dot::before{content:"";position:absolute;inset:0;border-radius:inherit;background:' + rgba(T.ring, 0.55) + ';opacity:0;z-index:-1;pointer-events:none;animation:ctc-ring-sm 1.6s cubic-bezier(0.23,1,0.32,1) infinite}',
        '.dl[data-phase="dialing"] .dl-status .dot::before,.dl[data-phase="ringing"] .dl-status .dot::before{content:"";position:absolute;inset:0;border-radius:inherit;background:' + rgba(T.amber, 0.45) + ';opacity:0;z-index:-1;pointer-events:none;animation:ctc-ring-sm 1.6s cubic-bezier(0.23,1,0.32,1) infinite}',
        '.dl-answer{position:relative}',
        // Call end (asset 42, DESIGN.md §3 call-end rule): End becomes Call
        // back in place. A red disc over the new go button fades out while
        // the glyph turns back from 135 deg (transform and opacity only).
        '.dl-wrap-call{position:relative}',
        '.dl-live-wrap.cs .dl-foot{position:relative}', // ghosts of Mute / Keypad sit here
        '.dl-wrap-call svg{position:relative}',
        '.dl-wrap-call.dl-morph::before{content:"";position:absolute;inset:0;border-radius:inherit;background:' + T.stop + ';pointer-events:none;animation:dl-endfade 300ms cubic-bezier(0.23,1,0.32,1) forwards}',
        '.dl-wrap-call.dl-morph svg{animation:dl-turn 300ms cubic-bezier(0.23,1,0.32,1)}',
        '@keyframes dl-endfade{from{opacity:1}to{opacity:0}}',
        '@keyframes dl-turn{from{transform:rotate(135deg)}to{transform:none}}',
        '.dl-ghost-fx{position:absolute;margin:0;pointer-events:none;box-sizing:border-box}',
        '.dl-ring-act{isolation:isolate}', // the orb draws over the footer, under the button
        '.dl-answer::after{content:"";position:absolute;inset:0;border-radius:inherit;z-index:-1;pointer-events:none;background:' + rgba(T.goDot, 0.55) + ';opacity:0;animation:dl-orb 1.6s cubic-bezier(0.23,1,0.32,1) infinite}',
        '.dl-answer:active::after{visibility:hidden}',
        '@keyframes dl-orb{0%{transform:scale(1);opacity:1}70%,100%{transform:scale(1.185);opacity:0}}',
        '@keyframes ctc-ring-sm{0%{transform:scale(1);opacity:1}70%,100%{transform:scale(3);opacity:0}}',
        '.dl-icon{position:relative;width:32px;height:32px;border-radius:10px;background:transparent;color:#94A6BF;display:inline-flex;align-items:center;justify-content:center}',
        '.dl-icon:hover{background:rgba(255,255,255,0.08);color:#FFFFFF}',
        '.dl-icon[aria-pressed="true"]{background:rgba(255,255,255,0.12);color:#FFFFFF}',
        // Voicemail: red badge with the unheard count (L3 06b-1 header).
        '.dl-vm-badge{position:absolute;top:-3px;right:-6px;min-width:16px;height:16px;padding:0 4px;border-radius:8px;background:' + T.stop + ';color:#FFFFFF;font-size:12px;font-weight:700;line-height:16px;text-align:center;pointer-events:none}',
        '.dl-status-label{min-width:0;overflow:hidden;text-overflow:ellipsis}',
        '.dl-note{flex-shrink:0;margin:10px 14px 0;padding:8px 10px;border-radius:14px;background:rgba(255,255,255,0.06);display:flex;align-items:center;gap:8px;font-size:12px}',
        '.dl-note-text{flex:1;min-width:0}',
        '.dl-note a{color:#B6DCFA;text-decoration:none}',
        '.dl-note a:hover{text-decoration:underline}',
        '.dl-note-x{width:24px;height:24px;flex-shrink:0;margin:-4px -4px -4px 0;border-radius:6px;background:transparent;color:#94A6BF;display:inline-flex;align-items:center;justify-content:center}',
        '.dl-note-x:hover{background:rgba(255,255,255,0.08);color:#FFFFFF}',
        '.dl-note .dl-text{flex-shrink:0;padding:4px 8px;font-size:12px}',
        // Missed call on Dial (asset 40): a compact note in the signed-out
        // card style between the pill row and the number. Line 1 "Missed
        // call" (coral) · age; line 2 the name as the record link (the
        // number in SF Mono when unknown); a 36 px go-green Call back and ×.
        // Voicemail coming (asset 48): one line under the note, the wrap-up
        // status line's voice (dot or check, bold state, grey detail).
        '.dl-miss-st{flex-basis:100%;display:flex;align-items:center;gap:8px;margin-top:2px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.08);font-size:13px;line-height:18px;color:#C9D3E1;min-width:0}',
        '.dl-miss-st b{font-weight:600;color:#FFFFFF;white-space:nowrap}',
        '.dl-miss-st .dl-st-rest{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#94A6BF;font-variant-numeric:tabular-nums}',
        '.dl-miss-st a{margin-left:auto;flex-shrink:0;font-weight:600;color:#8FC1D3;text-decoration:underline;text-underline-offset:2px}',
        '.dl-miss-sum{flex-basis:100%;margin-top:6px;font-size:13px;line-height:19px;color:#E4EBF2;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}',
        '.dl-miss{flex-shrink:0;flex-wrap:wrap;display:flex;align-items:center;gap:10px;padding:12px 12px 12px 14px;border-radius:14px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.10)}',
        '.dl-miss-text{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}',
        '.dl-miss-l1{font-size:12px;line-height:16px;color:#B2C0D3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
        '.dl-miss-k{font-weight:600;color:' + T.stopDot + '}',
        '.dl-miss-name{align-self:flex-start;max-width:100%;font-size:14px;font-weight:600;line-height:20px;color:#FFFFFF;text-decoration:none;border-radius:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
        '.dl-miss-name[href]{text-decoration:underline;text-decoration-color:rgba(255,255,255,0.45);text-underline-offset:3px}',
        '.dl-miss-name[href]:hover{text-decoration-color:#FFFFFF}',
        '.dl-miss-name:focus-visible{outline:2px solid ' + T.ring + ';outline-offset:2px}',
        '.dl-miss-name.mono{font-family:"SF Mono","JetBrains Mono",Menlo,Consolas,monospace;font-weight:400;font-variant-numeric:tabular-nums}',
        '.dl-miss-call{flex-shrink:0;height:36px;padding:0 12px;border-radius:10px;background:' + T.go + ';color:#FFFFFF;font-size:13px;font-weight:600;display:inline-flex;align-items:center;gap:6px}',
        '.dl-miss-call:hover{background:' + T.goHover + '}',
        '.dl-miss-call:active{transform:scale(0.97)}',
        '.dl-miss-call:focus-visible{outline:2px solid ' + T.ring + ';outline-offset:2px}',
        '.dl-miss-x{width:24px;height:24px;flex-shrink:0;margin-right:-4px;border-radius:6px;background:transparent;color:#94A6BF;display:inline-flex;align-items:center;justify-content:center}',
        '.dl-miss-x:hover{background:rgba(255,255,255,0.08);color:#FFFFFF}',
        // The fit rule (keys never shrink): hidden while the note shows and
        // the view would not fit (the insight line first, then an empty row).
        '.dl-fit-out{display:none !important}',
        // Error banner (snap.error.kind): what happened, what to do, one action.
        '.dl-alert{flex-shrink:0;margin:10px 14px 0;padding:10px 12px;border-radius:14px;background:' + rgba(T.stopDot, 0.12) + ';border:1px solid ' + rgba(T.stopDot, 0.30) + ';display:flex;flex-direction:column;align-items:flex-start;gap:4px;font-size:12px}',
        '.dl-alert[data-tone="amber"]{background:rgba(244,199,106,0.10);border-color:rgba(244,199,106,0.30)}',
        '.dl-alert-title{font-weight:600;line-height:1.4}',
        '.dl-alert-text{color:#C9D3E1;line-height:1.45;overflow-wrap:anywhere}',
        '.dl-alert-act{margin:2px 0 0 -8px}',
        // Refused request: one muted line, 4 s.
        '.dl-refused{flex-shrink:0;margin:8px 14px 0;font-size:12px;color:#94A6BF;text-align:center}',
        // Remote control (another tab holds the phone), settings view only:
        // where the audio is.
        '.dl-remote{font-size:13px;color:#B9CEDA}',
        '.dl-pane{display:flex;flex-direction:column;flex:1 1 auto;min-height:0}',
        '.dl-body{flex:1 1 auto;min-height:0;overflow:auto;padding:10px 14px 0;display:flex;flex-direction:column;gap:10px}',
        // Dial · Search · Recents on the keypad's 3 columns (--dl-cols), each
        // label centred in its column, full width under the header with a
        // bottom rule. The selected tab is underlined at the label's width
        // (2 px white, an inset shadow: no layout shift), not a filled pill.
        '.dl-tabs{display:grid;grid-template-columns:var(--dl-cols);column-gap:var(--dl-gap);justify-content:center;justify-items:center;flex-shrink:0;margin-top:8px;padding:0 16px;border-bottom:1px solid rgba(255,255,255,0.10)}',
        '.dl-tab{height:44px;padding:0 2px;border-radius:0;background:transparent;font-size:14px;font-weight:600;color:#94A6BF;white-space:nowrap}',
        '.dl-tab:hover{color:#FFFFFF}',
        '.dl-tab:active{transform:none}',
        '.dl-tab[aria-selected="true"]{color:#FFFFFF;box-shadow:inset 0 -2px 0 #FFFFFF}',
        '.dl-tab:focus-visible{outline-offset:-2px}',
        // Loaded record (DESIGN.md §4, asset 33): person icon, the name as
        // the link to the record, and the insight line under it (a faint
        // bar while it loads, left out when there is nothing to say).
        '.dl-rec{display:flex;align-items:center;gap:10px;flex-shrink:0;min-width:0}',
        '.dl-rec-icon{flex-shrink:0;display:inline-flex;color:#94A6BF}',
        '.dl-rec-who{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}',
        '.dl-rec-name{align-self:flex-start;max-width:100%;font-size:15px;font-weight:600;line-height:20px;color:#FFFFFF;text-decoration:none;border-radius:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
        '.dl-rec-name[href]:hover{text-decoration:underline;text-decoration-color:rgba(255,255,255,0.45);text-underline-offset:3px}',
        '.dl-rec-name:focus-visible{outline:2px solid ' + T.ring + ';outline-offset:2px}',
        '.dl-rec-insight{height:18px;font-size:13px;line-height:18px;color:#B2C0D3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
        '.dl-rec-insight.loading{display:flex;align-items:center}',
        '.dl-rec-ph{width:140px;max-width:100%;height:8px;border-radius:4px;background:rgba(255,255,255,0.08)}',
        // One fixed 34 px row between the record header and the number
        // (asset 39): the target pill while a record is loaded and the number
        // is not typed by hand, else the match slot. Never both; when neither
        // applies the row stays as empty space, so nothing jumps.
        '.dl-mrow{height:34px;flex-shrink:0;display:flex;align-items:center;justify-content:center;min-width:0}',
        '.dl-mrow>*{max-width:100%}',
        // Target pill above the number: who the number belongs to and
        // its type; a dot for the number last called; a caret when there is
        // more than one number (one number: flat, not a control).
        '.dl-trig{display:flex;justify-content:center;flex-shrink:0;min-width:0}',
        '.dl-trig[data-pending]{visibility:hidden}',
        '.dl-tpill{display:inline-flex;align-items:center;gap:6px;max-width:100%;height:34px;padding:0 10px 0 12px;border-radius:17px;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.10);box-sizing:border-box;font-size:13px;color:#FFFFFF;white-space:nowrap}',
        'button.dl-tpill:hover{background:rgba(255,255,255,0.12)}',
        'button.dl-tpill:active{transform:none}',
        '.dl-tpill:focus-visible{outline:2px solid ' + T.ring + ';outline-offset:2px}',
        '.dl-tpill.flat{background:transparent;border-color:transparent}',
        '.dl-tpill-i{display:inline-flex;flex-shrink:0;color:#94A6BF}',
        '.dl-tpill b{min-width:0;font-weight:600;overflow:hidden;text-overflow:ellipsis}',
        '.dl-tpill-type{flex-shrink:0;color:#B2C0D3}',
        '.dl-lcdot{width:6px;height:6px;margin-left:2px;border-radius:999px;background:#9FD0FA;flex-shrink:0}',
        '.dl-tpill-cv{display:inline-flex;flex-shrink:0;color:#B2C0D3;transition:transform 200ms cubic-bezier(0.23,1,0.32,1)}',
        '.dl-tpill[aria-expanded="true"] .dl-tpill-cv{transform:rotate(180deg)}',
        // The record's numbers: a sheet over the keypad from under the
        // number's rule to the footer (the number and Call stay in view). People are sticky headers with their
        // numbers under them; a one-number person is one two-line row. From
        // TARGET_FILTER_MIN numbers a filter field shows at the top.
        // Closed it sits 8 px lower with its bottom 8 px up, so it never
        // makes the body scroll.
        '.dl-tsheet{position:absolute;left:-14px;right:-14px;top:0;bottom:8px;z-index:4;display:flex;flex-direction:column;padding:8px 12px 0;background:#142638;border-top:1px solid rgba(255,255,255,0.08);opacity:0;transform:translateY(8px);pointer-events:none;transition:opacity 160ms cubic-bezier(0.23,1,0.32,1),transform 220ms cubic-bezier(0.23,1,0.32,1)}',
        '.dl-tsheet[data-open]{bottom:0;opacity:1;transform:none;pointer-events:auto}',
        '.dl-flt{display:flex;align-items:center;gap:8px;height:40px;flex-shrink:0;margin:0 0 6px;padding:0 12px;border-radius:10px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:#94A6BF}',
        '.dl-flt:focus-within{border-color:' + T.ring + '}',
        '.dl-flt input{flex:1;min-width:0;padding:0;background:none;border:0;outline:none;color:#FFFFFF;font:inherit;font-size:14px}',
        '.dl-flt input::placeholder{color:#94A6BF}',
        '.dl-flt-cnt{font-size:12px;color:#B2C0D3;white-space:nowrap;font-variant-numeric:tabular-nums}',
        '.dl-lst{position:relative;flex:1;min-height:0;overflow-y:auto;padding-bottom:8px;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,0.32) transparent}',
        '.dl-lh{position:sticky;top:0;z-index:1;display:flex;align-items:baseline;gap:8px;padding:10px 8px 4px;background:#142638;white-space:nowrap;overflow:hidden}',
        '.dl-ln{font-size:14px;font-weight:600;color:#FFFFFF}',
        '.dl-lt{font-size:12px;color:#B2C0D3;overflow:hidden;text-overflow:ellipsis}',
        '.dl-nr{width:100%;height:40px;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:0 8px 0 20px;border-radius:8px;background:transparent;color:#FFFFFF;font-size:14px;text-align:left}',
        '.dl-nr.solo{height:52px;padding-left:8px}',
        '.dl-nr:active{transform:none}',
        '.dl-nr.act,.dl-nr:focus-visible{background:rgba(255,255,255,0.08);outline:none}',
        '.dl-nr-l{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
        '.dl-nr.solo .dl-nr-l{display:flex;flex-direction:column;gap:2px}',
        '.dl-nr-r{display:inline-flex;align-items:center;gap:8px;flex-shrink:0}',
        '.dl-nr-n{font-family:"SF Mono","JetBrains Mono",Menlo,Consolas,monospace;font-size:13px;color:#C9D3E1}',
        '.dl-nr[aria-selected="true"] .dl-nr-n{color:#FFFFFF}',
        '.dl-nr-ck{width:16px;display:inline-flex}',
        '.dl-lc{font-size:12px;color:#9FD0FA}',
        '.dl-lempty{padding:24px 8px;font-size:13px;color:#B2C0D3;text-align:center}',
        '.dl-tsheet mark{background:none;color:#FFFFFF;text-decoration:underline;text-decoration-color:#9FD0FA;text-decoration-thickness:2px;text-underline-offset:3px}',
        // A number picked from the list rolls in (200 ms).
        '.dl-roll{animation:dl-roll 200ms cubic-bezier(0.23,1,0.32,1) both}',
        '@keyframes dl-roll{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}',
        '@keyframes dl-fade{from{opacity:0}to{opacity:1}}',
        '.dl-display{width:100%;height:40px;background:transparent;border:0;border-bottom:1px solid rgba(255,255,255,0.08);color:#FFFFFF;text-align:center;font-family:"SF Mono","JetBrains Mono",Menlo,Consolas,monospace;font-size:20px;font-weight:300;letter-spacing:0.02em}',
        '.dl-display::placeholder{color:#6B7B95}',
        '.dl-display:focus-visible{outline:none;border-bottom-color:' + T.ring + '}',
        // Quick clear: a 24 px x inside the number field, only when it holds a number.
        '.dl-display-wrap{position:relative}',
        '.dl-display-wrap .dl-display{padding:0 36px}',
        '.dl-clear{position:absolute;right:4px;top:50%;transform:translateY(-50%);width:24px;height:24px;padding:0;border-radius:999px;background:rgba(255,255,255,0.12);color:#FFFFFF;display:inline-flex;align-items:center;justify-content:center}',
        '.dl-clear:hover{background:rgba(255,255,255,0.20)}',
        '.dl-clear:active{transform:translateY(-50%) scale(0.97)}',
        // Match slot in the 34 px row above the number (no layout jump):
        // "Looking up…" while the lookup runs, then a record that owns the
        // typed number as a chip "Name · Type ›" (28 px: it overhangs the
        // slot by 4 px top and bottom, so nothing moves).
        '.dl-slot{height:20px;flex-shrink:0;display:flex;align-items:center;justify-content:center;min-width:0}',
        '.dl-looking{font-size:13px;color:#B2C0D3}',
        '.dl-match{max-width:100%;height:28px;margin:-4px 0;padding:0 10px 0 12px;border-radius:14px;background:rgba(255,255,255,0.08);display:inline-flex;align-items:center;gap:4px;font-size:14px;font-weight:600;color:#FFFFFF;white-space:nowrap;overflow:hidden}',
        '.dl-match:hover{background:rgba(255,255,255,0.14)}',
        '.dl-match:active{transform:none}',
        '.dl-match-name{min-width:0;overflow:hidden;text-overflow:ellipsis}',
        '.dl-match-type{flex-shrink:0;font-weight:400;color:#B2C0D3}',
        '.dl-match svg{flex-shrink:0;color:#B2C0D3}',
        '.dl-add{height:20px;padding:0 6px;border-radius:6px;background:transparent;font-size:14px;font-weight:600;line-height:20px;color:#9FD0FA;text-decoration:none}',
        '.dl-add:hover{text-decoration:underline}',
        '.dl-add:active{transform:none}',
        '.dl-pad{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px}',
        // Dial keypad (DESIGN.md §4): iPhone-style 65 px round keys on the
        // shared 3 columns (--dl-cols, centred); the rows spread to fill the
        // height between the number and the footer (never closer than 8 px;
        // the body scrolls when a record card takes the room). Fill .10,
        // pressed .22, no border.
        '.dl-pad.dl-dialpad{flex:1 1 auto;grid-template-columns:var(--dl-cols);grid-template-rows:repeat(4,65px);column-gap:var(--dl-gap);row-gap:8px;justify-content:center;align-content:space-evenly;min-height:284px}',
        // The in-call keypad (.dl-dtmf, asset 38) uses the same round keys.
    ].concat(['.dl-dialpad', '.dl-dtmf'].map(function (pad) {
        return [
            pad + ' .dl-key{width:65px;height:65px;padding:0;border-radius:999px;border:0;background:rgba(255,255,255,0.10);gap:3px;transition:transform 140ms ease-out}',
            pad + ' .dl-key:hover{background:rgba(255,255,255,0.10)}',
            pad + ' .dl-key:active{background:rgba(255,255,255,0.22)}',
            pad + ' .dl-key b{font-size:25px;font-weight:400;line-height:1;color:#FFFFFF}',
            pad + ' .dl-key i{font-size:12px;font-weight:600;letter-spacing:0.12em;color:#94A6BF;line-height:1;min-height:12px;padding-left:0.12em}'
        ].join('\n');
    }), [
        '.dl-key{height:44px;border-radius:10px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px}',
        '.dl-key:hover{background:rgba(255,255,255,0.10)}',
        '.dl-key b{font-size:15px;font-weight:500;line-height:1}',
        '.dl-key i{font-style:normal;font-size:12px;letter-spacing:0.14em;font-weight:600;color:#94A6BF;min-height:12px;line-height:1}',
        '.dl-foot{flex-shrink:0;margin-top:10px;padding:12px 14px 14px;border-top:1px solid rgba(255,255,255,0.06);background:rgba(0,0,0,0.12);display:flex;justify-content:center;align-items:flex-start;gap:28px}',
        '.dl-act{display:flex;flex-direction:column;align-items:center;gap:5px;font-family:"SF Mono","JetBrains Mono",Menlo,Consolas,monospace;font-size:12px;letter-spacing:0.08em;color:#94A6BF}',
        '.dl-btn{width:44px;height:44px;border-radius:14px;background:rgba(255,255,255,0.10);color:#FFFFFF;display:flex;align-items:center;justify-content:center}',
        '.dl-btn:hover{background:rgba(255,255,255,0.18)}',
        '.dl-btn.big{width:52px;height:52px;border-radius:16px}',
        '.dl-btn.call{background:' + T.go + ';box-shadow:0 5px 16px ' + rgba(T.go, 0.32) + '}',
        '.dl-btn.call:hover{background:' + T.goHover + '}',
        '.dl-btn.end{background:' + T.stop + ';box-shadow:0 5px 16px ' + rgba(T.stop, 0.32) + '}',
        '.dl-btn.end:hover{background:' + T.stopHover + '}',
        // Unmute: a glass amber tile (DESIGN.md §3): amber wash, 1 px inset
        // amber ring (no layout shift), amber icon (currentColor).
        '.dl-btn[aria-pressed="true"]{background:' + rgba(T.amber, 0.16) + ';color:' + T.amber + ';box-shadow:inset 0 0 0 1px ' + T.amber + '}',
        '.dl-keys[aria-pressed="true"]{background:rgba(255,255,255,0.24);color:#FFFFFF;box-shadow:none}',
        '.dl-btn[disabled]{opacity:0.4;cursor:default;box-shadow:none}',
        // Dial footer: the keypad's 3 columns (--dl-cols, same side
        // padding): empty · 64 px round Call under "0" · 48 px round ghost
        // Backspace under "#", centred on Call. No text labels (aria-label + title).
        '.dl-foot.dial{display:grid;grid-template-columns:var(--dl-cols);column-gap:var(--dl-gap);justify-content:center;align-items:center;justify-items:center}',
        '.dl-btn.go64{width:64px;height:64px;border-radius:999px}',
        '.dl-btn.ghost{width:48px;height:48px;border-radius:999px;background:transparent;color:#94A6BF}',
        '.dl-btn.ghost:hover{background:rgba(255,255,255,0.08);color:#FFFFFF}',
        // Search and Recents fields: glass box, search icon left; Search adds
        // x (clear) and the filter icon at the right end.
        '.dl-qbox{position:relative;flex-shrink:0;display:flex;align-items:center;gap:8px;height:40px;padding:0 6px 0 12px;border-radius:16px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);color:#94A6BF}',
        '.dl-qbox:has(.dl-q:focus){border-color:' + T.ring + '}',
        '.dl-qbox > svg{flex-shrink:0}',
        '.dl-q{flex:1;min-width:0;height:38px;padding:0;border:0;background:transparent;color:#FFFFFF;font:inherit;font-size:14px;outline:none;-webkit-appearance:none;appearance:none}',
        '.dl-q::placeholder{color:#94A6BF}',
        '.dl-q::-webkit-search-cancel-button{-webkit-appearance:none;appearance:none;display:none}',
        '.dl-qclear{position:static;transform:none;flex-shrink:0}',
        '.dl-qclear:active{transform:scale(0.97)}',
        // Filter icon (three dashes, 32 px): opens the Show + Sort by menu.
        // While Show is not All, a 6 px light-blue dot sits on its corner.
        '.dl-filter{position:relative;width:32px;height:32px;flex-shrink:0;padding:0;border-radius:8px;background:transparent;color:#94A6BF;display:inline-flex;align-items:center;justify-content:center}',
        '.dl-filter:hover,.dl-filter[aria-expanded="true"]{background:rgba(255,255,255,0.10);color:#FFFFFF}',
        '.dl-fdot{position:absolute;top:5px;right:5px;width:6px;height:6px;border-radius:999px;background:#9FD0FA;pointer-events:none}',
        // The menu: groups (a 12/600 uppercase label, a rule between); one
        // choice per group, a check marks it.
        '.dl-menu{position:absolute;top:calc(100% + 6px);left:0;z-index:3;width:208px;padding:4px;border-radius:12px;background:#1A2B47;box-shadow:inset 0 1px 0 rgba(255,255,255,0.06),0 10px 24px rgba(15,27,48,0.26);display:flex;flex-direction:column}',
        '.dl-menu.end{left:auto;right:0}',
        '.dl-mi{display:flex;align-items:center;gap:8px;width:100%;height:36px;padding:0 10px;border-radius:8px;background:transparent;color:#FFFFFF;font-size:13px;font-weight:500;text-align:left}',
        '.dl-mi:hover,.dl-mi:focus-visible{background:rgba(255,255,255,0.08)}',
        '.dl-mi:focus-visible{outline-offset:-2px}',
        '.dl-mi:active{transform:none}',
        '.dl-mi svg{flex-shrink:0;visibility:hidden}',
        '.dl-mi[aria-checked="true"] svg{visibility:visible}',
        '.dl-mi span{flex:1;min-width:0}',
        '.dl-mi em{font-style:normal;font-variant-numeric:tabular-nums;color:#C9D3E1}',
        '.dl-mgroup{display:flex;flex-direction:column}',
        '.dl-mlabel{padding:8px 10px 4px;font-size:12px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#94A6BF}',
        '.dl-menu .dl-rule{margin:4px 6px}',
        '.dl-sect{text-align:center;font-family:"SF Mono","JetBrains Mono",Menlo,Consolas,monospace;font-size:12px;letter-spacing:0.08em;color:#94A6BF;text-transform:uppercase}',
        '.dl-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px}',
        // Lists fill the rest of the body and scroll on their own.
        // The 3 px padding keeps the rows' focus rings inside the scroll box.
        '.dl-view{flex:1 1 auto;min-height:0}',
        '.dl-results,.dl-recent-list,.dl-vm-list{flex:1 1 auto;min-height:0;overflow:auto;padding:3px;margin:-3px}',
        '.dl-row{width:100%;padding:8px 10px;border-radius:10px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:10px;text-align:left}',
        '.dl-row:hover{background:rgba(255,255,255,0.08)}',
        '.dl-row-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}',
        '.dl-row-name{font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
        '.dl-row-name.mono{font-family:"SF Mono","JetBrains Mono",Menlo,Consolas,monospace;font-variant-numeric:tabular-nums}',
        '.dl-row-sub{font-size:12px;color:#94A6BF;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
        // Search rows: a card per row; the Call sits next to the row
        // button (no button inside a button).
        '.dl-card{display:flex;align-items:center;gap:4px;border-radius:10px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06)}',
        '.dl-card:hover{background:rgba(255,255,255,0.08)}',
        '.dl-card .dl-row,.dl-card .dl-row:hover,.dl-recent .dl-row,.dl-recent .dl-row:hover{flex:1;min-width:0;background:transparent;border:0}',
        '.dl-ricon{flex-shrink:0;display:inline-flex;color:#94A6BF}',
        // Recents (and Voicemail): flat rows with a bottom rule under day
        // group labels (Today / Yesterday / date).
        '.dl-day{padding:10px 2px 4px;font-size:12px;font-weight:600;color:#94A6BF}',
        '.dl-day:first-child{padding-top:2px}',
        '.dl-recent .dl-row{padding:0 4px 0 2px;border-radius:8px}',
        '.dl-recent{display:flex;align-items:center;gap:6px;min-height:58px;border-bottom:1px solid rgba(255,255,255,0.10)}',
        '.dl-recent:hover{background:rgba(255,255,255,0.04)}',
        '.dl-recent .dl-row-sub{display:flex;align-items:center;gap:6px;margin-top:2px}',
        '.dl-row-time{flex-shrink:0}',
        '.dl-recent-cb{flex-shrink:0}',
        // Missed / Voicemail in Recents: coral text (no outcome chips).
        '.dl-row-miss{flex-shrink:0;font-size:12px;font-weight:600;color:#FF9E8C}',
        // Each row with a number carries its own Call (go green).
        '.dl-row-call{flex-shrink:0;width:32px;height:32px;margin-right:6px;padding:0;border-radius:999px;background:' + T.go + ';display:inline-flex;align-items:center;justify-content:center}',
        '.dl-recent .dl-row-call{margin-right:0}',
        '.dl-row-call:hover{background:' + T.goHover + '}',
        '.dl-row-call:active{transform:scale(0.97)}',
        '.dl-row-call:focus-visible{outline:2px solid ' + T.ring + ';outline-offset:2px}',
        // Direction: a bare 16 px arrow; missed in the stop dot colour.
        '.dl-dir{flex-shrink:0;display:inline-flex;color:#94A6BF}',
        '.dl-dir-missed{color:' + T.stopDot + '}',
        '.dl-row-meta{font-family:"SF Mono","JetBrains Mono",Menlo,Consolas,monospace;font-size:12px;color:#94A6BF;flex-shrink:0;text-align:right;white-space:pre-line}',
        // Voicemail view rows (DESIGN.md §4, asset 32): two columns. Left
        // (flexible): the name (an 8 px coral dot before it while unheard)
        // and the AI brief under it, at most 2 lines. Right: time · length,
        // then Open record (32 px ghost circle) and Call back.
        '.dl-vm-item{padding:10px 2px 12px;border-bottom:1px solid rgba(255,255,255,0.10);display:flex;align-items:flex-start;gap:12px}',
        '.dl-vm-l{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px}',
        '.dl-vm-name{display:flex;align-items:center;gap:6px;min-width:0}',
        '.dl-vm-dot{width:8px;height:8px;border-radius:999px;background:#FF9D90;flex-shrink:0}',
        '.dl-vm-brief{margin:0;font-size:13px;line-height:1.45;color:#C9D3E1;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}',
        '.dl-vm-r{flex-shrink:0;display:flex;flex-direction:column;align-items:flex-end;gap:8px;text-align:right}',
        '.dl-vm-meta{font-size:12px;color:#94A6BF;font-variant-numeric:tabular-nums;white-space:nowrap}',
        '.dl-vm-acts{display:flex;align-items:center;gap:8px}',
        '.dl-vm-open{width:32px;height:32px;flex-shrink:0;border-radius:999px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);box-sizing:border-box;color:#C9D3E1;display:inline-flex;align-items:center;justify-content:center;text-decoration:none}',
        '.dl-vm-open:hover{background:rgba(255,255,255,0.14);color:#FFFFFF}',
        '.dl-vm-open:focus-visible{outline:2px solid ' + T.ring + ';outline-offset:2px}',
        '.dl-link{font-size:12px;font-weight:600;color:#B6DCFA;text-decoration:none;padding:4px 6px;border-radius:6px}',
        '.dl-link:hover{text-decoration:underline}',
        '.dl-link:focus-visible{outline:2px solid ' + T.ring + ';outline-offset:2px}',
        '.dl-msg{font-size:12px;color:#94A6BF;text-align:center;padding:12px 0}',
        '.dl-msg.err{color:#FCA5A5}',
        '.dl-live{position:relative;flex:1 1 auto;min-height:0;overflow:auto;padding:24px 14px 0;display:flex;flex-direction:column;align-items:center;gap:4px}',
        // The other side: the person icon, never initials (DESIGN.md §4, asset 33).
        '.dl-live-av{width:68px;height:68px;border-radius:999px;background:transparent;color:#94A6BF;display:flex;align-items:center;justify-content:center;margin-bottom:10px}',
        '.dl-live-name{font-size:20px;font-weight:600;letter-spacing:-0.01em;text-align:center}',
        '.dl-live-sub{font-size:12px;color:#94A6BF}',
        '.dl-live-time{font-family:"SF Mono","JetBrains Mono",Menlo,Consolas,monospace;font-variant-numeric:tabular-nums;font-size:26px;font-weight:300;letter-spacing:0.04em;margin-top:8px;min-height:32px}',
        '.dl-live-warn{font-size:12px;color:#F4C76A;margin-top:2px}',
        // Signed out during a call: one amber line under the timer (asset 37).
        '.dl-live-so{font-size:12px;color:#F4C76A;margin-top:2px}',
        // Signed out of NetSuite (DESIGN.md §3, asset 37): one card at the
        // top of the Dial view; the number field, keypad, Call and Backspace
        // dim to .4 and are disabled (Call and Backspace by .dl-btn[disabled]).
        '.dl-so{flex-shrink:0;padding:14px;border-radius:14px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.10);display:flex;flex-direction:column;gap:4px}',
        '.dl-so-title{font-size:14px;font-weight:600;line-height:1.35;color:#FFFFFF}',
        '.dl-so-text{font-size:13px;line-height:1.4;color:#B2C0D3}',
        '.dl-so-btn{margin-top:10px;width:100%;height:36px;padding:0 14px;border-radius:10px;background:#FFFFFF;color:#161513;font-size:14px;font-weight:600}',
        '.dl-so-btn:hover{background:#E9EEF5}',
        '.dl-so-btn:active{transform:scale(0.98)}',
        '.dl-so-btn:focus-visible{outline:2px solid ' + T.ring + ';outline-offset:2px}',
        '.dl-signedout .dl-display-wrap,.dl-signedout .dl-dialpad{opacity:0.4}',
        // The card takes room: the keypad rows close to 4 px (board 06b-5),
        // and the match slot goes (its lookups need the NetSuite session).
        '.dl-signedout .dl-pad.dl-dialpad{row-gap:4px;min-height:calc(4 * 65px + 3 * 4px)}',
        '.dl-signedout .dl-slot{display:none}',
        '.dl-display[disabled],.dl-dialpad .dl-key[disabled]{cursor:default}',
        '.dl-dialpad .dl-key[disabled]:active{transform:none;background:rgba(255,255,255,0.10)}',
        // Leaving (signed in again): the card fades out, the dimming fades up.
        '.dl-so-leaving .dl-so{opacity:0;transition:opacity ' + SO_LEAVE_MS + 'ms ease-out}',
        '.dl-so-leaving .dl-display-wrap,.dl-so-leaving .dl-dialpad,.dl-so-leaving .dl-foot.dial .dl-btn{transition:opacity ' + SO_LEAVE_MS + 'ms ease-out}',
        '.dl-live .dl-pad{width:100%;margin-top:14px}',
        '.dl-text{background:transparent;color:#B6DCFA;font-size:12.5px;padding:6px 8px;border-radius:8px}',
        '.dl-text:hover{background:rgba(255,255,255,0.06)}',
        // Call back (missed note, Recents): a small go-green button; Call is always go green.
        '.dl-go{flex-shrink:0;height:28px;padding:0 12px;border-radius:8px;background:' + T.go + ';color:#FFFFFF;font-size:12px;font-weight:600;display:inline-flex;align-items:center}',
        '.dl-go:hover{background:' + T.goHover + '}',
        '.dl-go:active{transform:scale(0.97)}',
        '.dl-go:focus-visible{outline:2px solid ' + T.ring + ';outline-offset:2px}',
        // Audio settings sheet (L3 06 / 06b-1): back chevron + "Audio
        // settings"; labelled full-width selects (48 px, radius 12, tinted,
        // chevron); a rule; Exit phone mode as a coral outline pill + caption.
        '.dl-sheet-top{display:flex;align-items:center;gap:8px;margin-left:-6px}',
        '.dl-back{width:32px;height:32px;padding:0;border-radius:999px;background:transparent;color:#FFFFFF;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0}',
        '.dl-back:hover{background:rgba(255,255,255,0.08)}',
        '.dl-sheet-title{font-size:16px;font-weight:700}',
        '.dl-afield{display:flex;flex-direction:column;gap:6px;font-size:12px;font-weight:600;color:#B9CEDA}',
        '.dl-sel{position:relative;display:block}',
        '.dl-afield select{width:100%;height:40px;padding:0 40px 0 14px;border-radius:10px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.06);color:#FFFFFF;font:inherit;font-size:14px;font-weight:400;cursor:pointer;-webkit-appearance:none;appearance:none;text-overflow:ellipsis}',
        '.dl-afield select option{color:#161513}',
        '.dl-afield select:focus-visible{outline:2px solid ' + T.ring + ';outline-offset:1px}',
        '.dl-afield select[disabled]{opacity:0.5;cursor:default}',
        '.dl-sel svg{position:absolute;right:14px;top:50%;margin-top:-8px;color:#B9CEDA;pointer-events:none}',
        '.dl-audio-msg{text-align:left;padding:0}',
        '.dl-rule{align-self:stretch;height:1px;margin:4px 0 6px;border:0;background:rgba(255,255,255,0.10);flex-shrink:0}',
        '.dl-exit-block{display:flex;flex-direction:column;align-items:flex-start;gap:6px}',
        '.dl-exit{height:36px;padding:0 16px;border-radius:999px;border:1px solid ' + rgba(T.stopDot, 0.55) + ';background:transparent;color:' + T.stopDot + ';font-size:14px;font-weight:600}',
        '.dl-exit:hover{background:' + rgba(T.stopDot, 0.10) + '}',
        '.dl-exit-note{font-size:12px;color:#B9CEDA}',
        // Add to NetSuite sheet (DESIGN.md §6, L3 06b-4): the audio sheet's
        // pattern (back chevron + title, labelled 40 px fields radius 10
        // fill .06, a rule) with the number under the title, a radio list
        // of the four choices, the board's Lead | Prospect segment, an
        // amber "Already in NetSuite" list, a coral error line and one
        // primary button (the board's 44 px #36677D pill).
        '.dl-as-num{margin-top:-6px;font-size:14px;color:#B9CEDA}',
        '.dl-radios{display:flex;flex-direction:column;gap:2px}',
        '.dl-radio{display:flex;align-items:center;gap:10px;min-height:36px;padding:0 10px;border-radius:10px;font-size:14px;color:#FFFFFF;cursor:pointer}',
        '.dl-radio:hover{background:rgba(255,255,255,0.06)}',
        '.dl-radio:has(input:checked){background:rgba(255,255,255,0.08)}',
        '.dl-radio input{-webkit-appearance:none;appearance:none;width:16px;height:16px;margin:0;flex-shrink:0;border-radius:999px;border:2px solid #B9CEDA;background:transparent;display:grid;place-content:center;cursor:pointer}',
        '.dl-radio input:checked{border-color:#FFFFFF}',
        '.dl-radio input:checked::before{content:"";width:8px;height:8px;border-radius:999px;background:#FFFFFF}',
        '.dl-radio input:focus-visible,.dl-check input:focus-visible{outline:2px solid ' + T.ring + ';outline-offset:2px}',
        '.dl-lbl{font-size:12px;font-weight:600;color:#B9CEDA}',
        '.dl-as-block{display:flex;flex-direction:column;gap:6px}',
        '.dl-afield input{width:100%;height:40px;padding:0 14px;border-radius:10px;border:1px solid rgba(255,255,255,0.12);background:rgba(255,255,255,0.06);color:#FFFFFF;font:inherit;font-size:14px;font-weight:400;outline:none}',
        '.dl-afield input::placeholder{color:#94A6BF}',
        '.dl-afield input:focus-visible{outline:2px solid ' + T.ring + ';outline-offset:1px}',
        '.dl-as-two{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px}',
        '.dl-check{display:flex;align-items:center;gap:10px;min-height:32px;font-size:14px;color:#FFFFFF;cursor:pointer}',
        '.dl-check input{width:16px;height:16px;margin:0;flex-shrink:0;accent-color:#FFFFFF;cursor:pointer}',
        '.dl-as-note{font-size:12px;line-height:1.45;color:#B9CEDA}',
        '.dl-as-picked .dl-row{cursor:default}',
        '.dl-as-picked .dl-text{flex-shrink:0;margin-right:4px}',
        '.dl-seg{display:flex;flex-shrink:0;padding:3px;border-radius:999px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.10)}',
        '.dl-seg button{flex:1;height:32px;padding:0;border-radius:999px;background:transparent;color:#B9CEDA;font-size:13px;font-weight:600}',
        '.dl-seg button[aria-pressed="true"]{background:#FFFFFF;color:#132337}',
        '.dl-seg button:active{transform:none}',
        '.dl-as-dups{margin:0}',
        '.dl-dup-list{list-style:none;margin:2px 0 0;padding:0;align-self:stretch;display:flex;flex-direction:column;gap:8px}',
        '.dl-dup{display:flex;align-items:center;gap:8px}',
        '.dl-dup .dl-row-sub{color:#C9D3E1}',
        // Small ghost button (the board's .xb): "Use this one", Recents "Add".
        '.dl-ghost{flex-shrink:0;height:28px;padding:0 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.16);background:rgba(255,255,255,0.08);color:#FFFFFF;font-size:12px;font-weight:600;display:inline-flex;align-items:center;white-space:nowrap}',
        '.dl-ghost:hover{background:rgba(255,255,255,0.16)}',
        '.dl-as-err{font-size:12px;line-height:1.45;color:' + T.stopDot + '}',
        '.dl-primary{flex-shrink:0;width:100%;height:44px;padding:0 20px;border-radius:999px;background:#36677D;color:#FFFFFF;font-size:14px;font-weight:600}',
        '.dl-primary:hover{box-shadow:inset 0 0 0 999px rgba(255,255,255,0.08)}',
        '.dl-primary[disabled]{opacity:0.4;cursor:default;box-shadow:none}',
        '.dl-primary[disabled]:active{transform:none}',
        // "Add to NetSuite" under "No match in NetSuite" (ring and inbound call).
        '.dl-live-add{margin-top:4px;background:transparent}',
        // Call screen (DESIGN.md §4, asset 38; board 06d A–E and K5): one
        // screen for an outbound call and for an inbound call once answered
        // (.cs on .dl-live-wrap); the inbound ring view keeps the rules
        // above. Identity block: person icon 32, name 22/600 (an unknown
        // number: the number in SF Mono), "contact · title" and the number
        // (13 px #B2C0D3), then one 40 px slot: "Calling…", the 32 px timer,
        // "Reconnecting…" (amber) or "Call ended · 03:12".
        '.dl-live-wrap.cs .dl-live{padding:16px 20px 12px;gap:0}',
        // Nothing shrinks to fit: the overflow rule drops activity rows.
        '.dl-live-wrap.cs .dl-live > *{flex-shrink:0}',
        '.dl-live-wrap.cs .dl-live-av{width:32px;height:32px;margin-bottom:8px}',
        '.dl-live-wrap.cs .dl-live-av svg{width:32px;height:32px}',
        '.dl-live-wrap.cs .dl-live-name{max-width:100%;font-size:22px;line-height:28px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
        '.dl-live-name.mono{font-family:"SF Mono","JetBrains Mono",Menlo,Consolas,monospace;font-variant-numeric:tabular-nums;letter-spacing:0}',
        '.dl-live-wrap.cs .dl-live-sub{max-width:100%;margin-top:2px;font-size:13px;line-height:18px;color:#B2C0D3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
        '.dl-live-num{font-family:"SF Mono","JetBrains Mono",Menlo,Consolas,monospace;font-variant-numeric:tabular-nums;font-size:13px;line-height:18px;color:#B2C0D3}',
        '.dl-live-wrap.cs .dl-live-add{margin-top:2px}',
        '.dl-live-wrap.cs .dl-live-time{flex-shrink:0;height:40px;min-height:0;margin-top:4px;display:flex;align-items:center;justify-content:center;font-size:32px;font-weight:500;letter-spacing:0.02em;line-height:40px}',
        '.dl-live-wrap.cs .dl-live-time:not([data-slot="timer"]){font-family:inherit;font-size:15px;font-weight:400;letter-spacing:0;color:#B2C0D3}',
        '.dl-live-wrap.cs .dl-live-time[data-slot="reconnecting"]{color:' + T.amber + '}',
        // Ringing, unknown caller (asset 40): "No history for this number".
        '.dl-live-wrap.cs .dl-live-none{margin-top:24px;font-size:13px;line-height:18px;color:#94A6BF;text-align:center}',
        // Account block (K5): a KPI grid over the content width (three equal
        // cells, two 1 px dividers 48 px tall, 16 px from any text; 24 px
        // above and below), Recent activity (32 px rows, hairlines), then
        // Follow-ups. Wrap-up: "Summary" takes the grid's place.
        '.dl-acc{align-self:stretch;display:flex;flex-direction:column;flex-shrink:0}',
        '.dl-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));margin:24px 0 12px}',
        '.dl-kpi{position:relative;min-width:0;padding:0 16px;display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center}',
        '.dl-kpi + .dl-kpi::before{content:"";position:absolute;left:0;top:50%;width:1px;height:48px;margin-top:-24px;background:rgba(255,255,255,0.10)}',
        '.dl-kpi-k{max-width:100%;display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:600;line-height:16px;color:#94A6BF;white-space:nowrap}',
        '.dl-kpi-dot{width:6px;height:6px;flex-shrink:0;border-radius:999px;background:' + T.stopDot + '}',
        '.dl-kpi-v{max-width:100%;height:26px;font-size:20px;font-weight:600;line-height:26px;color:#FFFFFF;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
        '.dl-kpi-v.none{color:#B2C0D3}',
        '.dl-acc-sec{margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.06)}',
        '.dl-acc-sum{margin:24px 0 12px;padding:0;border:0}',
        '.dl-acc-lbl{font-size:12px;font-weight:600;line-height:16px;color:#94A6BF;margin-bottom:4px}',
        '.dl-acc-list{list-style:none;margin:0;padding:0}',
        '.dl-acc-row{display:flex;align-items:center;gap:10px;height:32px;font-size:13px}',
        '.dl-acc-act .dl-acc-row + .dl-acc-row{border-top:1px solid rgba(255,255,255,0.06)}',
        '.dl-acc-fu .dl-acc-row{height:24px}',
        '.dl-acc-ic{flex-shrink:0;display:inline-flex;color:#94A6BF}',
        '.dl-acc-ring{width:12px;height:12px;flex-shrink:0;box-sizing:border-box;border-radius:999px;border:1.5px solid #94A6BF}',
        '.dl-acc-t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#C9D3E1}',
        '.dl-acc-age{flex-shrink:0;font-size:12px;color:#B2C0D3;font-variant-numeric:tabular-nums}',
        // Loading: faint bars where the values and rows go (no layout jump).
        '.dl-ph{display:inline-block;height:12px;border-radius:6px;background:rgba(255,255,255,0.08);vertical-align:middle}',
        '.dl-kpi-v .dl-ph{width:56px}',
        '.dl-acc-row .dl-ph{flex:1}',
        // Wrap-up status line and summary (asset 43, DESIGN.md §4).
        '.dl-stl{display:flex;align-items:center;gap:8px;min-height:20px;padding-bottom:14px;border-bottom:1px solid rgba(255,255,255,0.10);font-size:13px;line-height:18px;color:#C9D3E1}',
        '.dl-stl-text b{font-weight:600;color:#FFFFFF}',
        '.dl-stl-mark{width:14px;height:14px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center}',
        '.dl-stl-mark.is-dot::before{content:"";width:7px;height:7px;border-radius:999px;background:var(--stl,#94A6BF)}',
        '.dl-sum{padding-bottom:14px;border-bottom:1px solid rgba(255,255,255,0.10)}',
        '.dl-sum-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px}',
        '.dl-sum-link{font-size:12px;font-weight:600;color:#8FC1D3;text-decoration:underline;text-underline-offset:2px}',
        '.dl-sum-text{margin-top:6px;font-size:13px;line-height:19px;color:#E4EBF2;overflow-wrap:anywhere}',
        // In-call keypad: the Dial keys in the account block's place.
        '.dl-live-wrap .dl-pad.dl-dtmf{width:auto;margin-top:20px;grid-template-columns:var(--dl-cols);grid-template-rows:repeat(4,65px);column-gap:var(--dl-gap);row-gap:8px;justify-content:center;flex-shrink:0}',
        // Controls: 65 px circles on the keypad's 3 columns (--dl-cols),
        // sentence-case 12/600 labels on one baseline. Mute · End · Keypad;
        // wrap-up: Call back · Done as a centred pair (asset 47, two of the
        // same columns, .dl-two).
        '.dl-live-wrap.cs .dl-foot{display:grid;grid-template-columns:var(--dl-cols);column-gap:var(--dl-gap);justify-content:center;justify-items:center;align-items:start;padding:16px 14px 14px}',
        '.dl-live-wrap.cs .dl-foot.dl-two{grid-template-columns:repeat(2,65px)}',
        '.dl-live-wrap.cs .dl-act{gap:8px;font-family:inherit;font-size:12px;font-weight:600;line-height:16px;letter-spacing:0;color:#C9D3E1}',
        '.dl-live-wrap.cs .dl-act .dl-btn{width:65px;height:65px;border-radius:999px}',
        '.dl-live-wrap.cs .dl-act .dl-btn svg{width:22px;height:22px}',
        '.dl-btn.dl-done{background:rgba(255,255,255,0.08);box-shadow:inset 0 0 0 1px rgba(255,255,255,0.16);color:#FFFFFF}',
        '.dl-btn.dl-done:hover{background:rgba(255,255,255,0.16)}',
        '@media (prefers-reduced-motion: reduce){.dl *,.dl-dialpad .dl-key{transition:none}.dl-dialpad .dl-key:active{transform:none}.dl .dl-status .dot::before,.dl-answer::after{animation:none}.dl.closed,.dl[data-side].closed{transform:none}.dl .dl-tsheet{transform:none;transition:opacity 160ms ease-out}.dl-roll{animation:dl-fade 150ms ease-out both}}'
    ]).join('\n'));

    // --- Markup (static; data goes in with textContent) ---
    var keyHtml = KEYS.map(function (k) {
        return '<button type="button" class="dl-key" data-key="' + k[0] + '" aria-label="' + k[0] + '"><b>' + k[0] + '</b><i>' + k[1] + '</i></button>';
    }).join('');

    var CHEVRON_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" ' + STROKE2 + '><path d="M9 6l6 6-6 6"></path></svg>';
    var SEL_CARET = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON_CARET + '</svg>';

    var el = document.createElement('section');
    el.className = 'card navy dl';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Phone');
    el.innerHTML = ''
        + '<div class="dl-head" title="Drag to move the phone">'
        +   '<span class="dl-grip" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></span>'
        +   '<div class="dl-head-row">'
        +     '<span class="dl-status"><span class="dot"></span><span class="dl-status-label"></span></span>'
        +     '<div class="dl-head-r">'
        +     '<button type="button" class="dl-icon dl-vm" aria-label="Voicemail" title="Voicemail" aria-pressed="false" hidden><svg width="18" height="18" viewBox="0 0 24 24" ' + STROKE2 + '>' + ICON_VM + '</svg><span class="dl-vm-badge" aria-hidden="true" hidden></span></button>'
        +     '<button type="button" class="dl-icon dl-gear" aria-label="Audio settings" aria-pressed="false"><svg width="16" height="16" viewBox="0 0 24 24" ' + STROKE + '><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"></path></svg></button>'
        +     '<button type="button" class="dl-icon dl-close" aria-label="Collapse phone"><svg width="16" height="16" viewBox="0 0 24 24" ' + STROKE + '><path d="M6 9l6 6 6-6"></path></svg></button>'
        +     '</div>'
        +   '</div>'
        +   '<div class="dl-alerts" hidden><button type="button" class="dl-text dl-alerts-btn" hidden>Get call alerts</button><span class="dl-alerts-off" hidden>Call alerts are off in this browser</span></div>'
        + '</div>'
        // Idle tabs: a full-width row under the header (hidden with the idle views).
        + '<div class="dl-tabs" role="tablist" aria-label="Phone views">'
        +   '<button type="button" class="dl-tab" role="tab" data-tab="dial" aria-selected="true">Dial</button>'
        +   '<button type="button" class="dl-tab" role="tab" data-tab="search" aria-selected="false">Search</button>'
        +   '<button type="button" class="dl-tab" role="tab" data-tab="recents" aria-selected="false">Recents</button>'
        + '</div>'
        + '<div class="dl-note" role="status" hidden><span class="dl-note-text"></span>'
        +   '<button type="button" class="dl-text dl-note-add" hidden>Add to NetSuite</button>'
        +   '<a class="dl-note-link" href="#" target="_top">Open record →</a>'
        +   '<button type="button" class="dl-note-x" aria-label="Dismiss"><svg width="12" height="12" viewBox="0 0 24 24" ' + STROKE + '><path d="M6 6l12 12M18 6L6 18"></path></svg></button>'
        + '</div>'
        + '<div class="dl-alert" role="status" hidden><div class="dl-alert-title"></div><div class="dl-alert-text" hidden></div><button type="button" class="dl-text dl-alert-act" hidden></button></div>'
        + '<div class="dl-refused" role="status" hidden></div>'
        // Idle: the tab views
        + '<div class="dl-idle dl-pane">'
        +   '<div class="dl-body">'
        +     '<div class="dl-view" data-view="dial" role="tabpanel" style="display:flex;flex-direction:column;gap:10px;position:relative">'
        // Signed out of NetSuite: one card, one action (asset 37).
        +       '<div class="dl-so" role="status" hidden>'
        +         '<div class="dl-so-title">Signed out of NetSuite</div>'
        +         '<div class="dl-so-text">Calls won\'t ring until you sign in.</div>'
        +         '<button type="button" class="dl-so-btn">Sign in</button>'
        +       '</div>'
        // The loaded record: person icon, the name (the link to the record)
        // and the insight line.
        +       '<div class="dl-rec" hidden>'
        +         '<span class="dl-rec-icon" aria-hidden="true">' + USER_SVG(18) + '</span>'
        +         '<div class="dl-rec-who"><a class="dl-rec-name" target="_top" title="Open record in NetSuite"></a><div class="dl-rec-insight" hidden></div></div>'
        +       '</div>'
        // One 34 px row: the target pill (who the number belongs to; opens
        // the record's numbers) or the record that owns the typed number.
        +       '<div class="dl-mrow">'
        +       '<div class="dl-trig" hidden></div>'
        +       '<div class="dl-slot" aria-live="polite">'
        +         '<span class="dl-looking" hidden>Looking up\u2026</span>'
        +         '<button type="button" class="dl-match" hidden><span class="dl-match-name"></span><span class="dl-match-type"></span>' + CHEVRON_SVG + '</button>'
        +         '<button type="button" class="dl-add" aria-label="Add this number to NetSuite" hidden>Add to NetSuite</button>'
        +       '</div>'
        +       '</div>'
        // Missed call (asset 40): the compact note between the row and the number.
        +       '<div class="dl-miss" role="status" hidden>'
        +         '<div class="dl-miss-text">'
        +           '<div class="dl-miss-l1"><span class="dl-miss-k">Missed call</span><span class="dl-miss-ago"></span></div>'
        +           '<a class="dl-miss-name" target="_top"></a>'
        +         '</div>'
        +         '<button type="button" class="dl-miss-call"><svg width="14" height="14" viewBox="0 0 24 24" fill="#FFFFFF" aria-hidden="true">' + ICON_PHONE + '</svg>Call back</button>'
        +         '<button type="button" class="dl-miss-x" aria-label="Dismiss"><svg width="12" height="12" viewBox="0 0 24 24" ' + STROKE + '>' + ICON_X + '</svg></button>'
        +         '<div class="dl-miss-st" aria-live="polite" hidden></div>'
        +         '<div class="dl-miss-sum" hidden></div>'
        +       '</div>'
        +       '<div class="dl-display-wrap">'
        +         '<input type="tel" class="dl-display" aria-label="Number to call" placeholder="Enter a number" autocomplete="off">'
        +         '<button type="button" class="dl-clear" aria-label="Clear number" hidden><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg></button>'
        +       '</div>'
        +       '<div class="dl-pad dl-dialpad">' + keyHtml + '</div>'
        +       '<div class="dl-tsheet" inert>'
        +         '<div class="dl-flt" hidden><svg width="16" height="16" viewBox="0 0 24 24" ' + STROKE2 + '>' + ICON_SEARCH + '</svg>'
        +           '<input type="text" class="dl-tfilter" placeholder="Name, title or number" aria-label="Filter numbers" autocomplete="off"><span class="dl-flt-cnt" aria-live="polite"></span></div>'
        +         '<div class="dl-lst" role="listbox" aria-label="Numbers"></div>'
        +       '</div>'
        +     '</div>'
        +     '<div class="dl-view" data-view="search" role="tabpanel" hidden style="display:flex;flex-direction:column;gap:10px">'
        +       '<div class="dl-qbox">'
        +         '<svg width="16" height="16" viewBox="0 0 24 24" ' + STROKE2 + '>' + ICON_SEARCH + '</svg>'
        +         '<input type="search" class="dl-q" aria-label="Search your book" placeholder="Search company, contact, or phone" autocomplete="off">'
        +         '<button type="button" class="dl-clear dl-qclear" aria-label="Clear search" hidden><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON_X + '</svg></button>'
        +         '<button type="button" class="dl-filter" aria-label="Filter and sort" title="Filter and sort" aria-haspopup="menu" aria-expanded="false"><svg width="18" height="18" viewBox="0 0 24 24" ' + STROKE2 + '>' + ICON_FILTER + '</svg><span class="dl-fdot" aria-hidden="true" hidden></span></button>'
        +         '<div class="dl-menu end dl-filter-menu" role="menu" aria-label="Filter and sort" hidden></div>'
        +       '</div>'
        +       '<ul class="dl-list dl-results" aria-label="Results"></ul>'
        +       '<div class="dl-msg dl-search-msg" role="status"></div>'
        +     '</div>'
        +     '<div class="dl-view" data-view="recents" role="tabpanel" hidden style="display:flex;flex-direction:column;gap:10px">'
        +       '<div class="dl-qbox">'
        +         '<svg width="16" height="16" viewBox="0 0 24 24" ' + STROKE2 + '>' + ICON_SEARCH + '</svg>'
        +         '<input type="search" class="dl-q dl-rq" aria-label="Search contacts" placeholder="Name, company or number" autocomplete="off">'
        +       '</div>'
        +       '<div class="dl-recent-list"></div>'
        +       '<div class="dl-msg dl-recent-msg" role="status"></div>'
        +     '</div>'
        +   '</div>'
        +   '<div class="dl-foot dial">'
        +     '<span aria-hidden="true"></span>'
        +     '<button type="button" class="dl-btn go64 call dl-call" aria-label="Call" title="Call"><svg width="24" height="24" viewBox="0 0 24 24" fill="#FFFFFF" aria-hidden="true">' + ICON_PHONE + '</svg></button>'
        +     '<button type="button" class="dl-btn ghost dl-backspace" aria-label="Delete last digit" title="Delete last digit"><svg width="20" height="20" viewBox="0 0 24 24" ' + STROKE + '><path d="M21 5H9l-6 7 6 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1zM17 9l-6 6M11 9l6 6"></path></svg></button>'
        +   '</div>'
        + '</div>'
        // Live: in-call
        + '<div class="dl-live-wrap dl-pane" hidden>'
        +   '<div class="dl-live">'
        +     '<div class="dl-live-av" aria-hidden="true">' + USER_SVG(36) + '</div>'
        +     '<div class="dl-live-name"></div>'
        +     '<div class="dl-live-sub"></div>'
        +     '<button type="button" class="dl-link dl-live-add" hidden>Add to NetSuite</button>'
        +     '<div class="dl-live-num" hidden></div>'
        +     '<div class="dl-live-time" aria-label="Call time"></div>'
        +     '<div class="dl-live-so" role="status" hidden>Signed out \u2014 this call will still be logged.</div>'
        +     '<div class="dl-live-warn" role="status" hidden></div>'
        // Ringing, unknown caller: one quiet line in the account block's place.
        +     '<div class="dl-live-none" hidden>No history for this number</div>'
        // Account block (call screen; softphoneCallContext).
        +     '<div class="dl-acc" hidden>'
        // Wrap-up (asset 43): one true status line, then the real summary
        // once the transcript check returns it. No skeleton.
        +       '<div class="dl-acc-sum" hidden>'
        +         '<div class="dl-stl" role="status"><span class="dl-stl-mark" aria-hidden="true"></span><span class="dl-stl-text"></span></div>'
        +         '<div class="dl-sum" hidden><div class="dl-sum-head"><span class="dl-acc-lbl">Summary</span><a class="dl-sum-link" href="#" target="_top">Open call record</a></div><div class="dl-sum-text"></div></div>'
        +       '</div>'
        +       '<div class="dl-kpis">'
        +         '<div class="dl-kpi"><span class="dl-kpi-k">Outstanding<span class="dl-kpi-dot" hidden></span></span><span class="dl-kpi-v dl-kpi-out"></span></div>'
        +         '<div class="dl-kpi"><span class="dl-kpi-k">Last touch</span><span class="dl-kpi-v dl-kpi-touch"></span></div>'
        +         '<div class="dl-kpi"><span class="dl-kpi-k">90-day orders</span><span class="dl-kpi-v dl-kpi-orders"></span></div>'
        +       '</div>'
        +       '<div class="dl-acc-sec dl-acc-act"><div class="dl-acc-lbl">Recent activity</div><ul class="dl-acc-list dl-acc-acts" aria-label="Recent activity"></ul></div>'
        +       '<div class="dl-acc-sec dl-acc-fu"><div class="dl-acc-lbl dl-acc-fulbl"></div><ul class="dl-acc-list dl-acc-fus" aria-label="Follow-ups"></ul></div>'
        +     '</div>'
        +     '<div class="dl-pad dl-dtmf" hidden>' + keyHtml + '</div>'
        +   '</div>'
        +   '<div class="dl-foot">'
        +     '<span class="dl-act dl-ring-act" hidden><button type="button" class="dl-btn big end dl-decline" aria-label="Decline call"><svg width="22" height="22" viewBox="0 0 24 24" fill="#FFFFFF" aria-hidden="true" style="transform:rotate(135deg)">' + ICON_PHONE + '</svg></button>Decline</span>'
        +     '<span class="dl-ring-act" aria-hidden="true" hidden></span>'
        +     '<span class="dl-act dl-ring-act" hidden><button type="button" class="dl-btn big call dl-answer" aria-label="Answer call"><svg width="22" height="22" viewBox="0 0 24 24" fill="#FFFFFF" aria-hidden="true">' + ICON_PHONE + '</svg></button>Answer</span>'
        +     '<span class="dl-act dl-call-act"><button type="button" class="dl-btn dl-mute" aria-label="Mute" aria-pressed="false"><svg width="18" height="18" viewBox="0 0 24 24" ' + STROKE + '>' + ICON_MIC + '</svg></button><span class="dl-mute-label">Mute</span></span>'
        +     '<span class="dl-act dl-call-act"><button type="button" class="dl-btn big end dl-end" aria-label="End call"><svg width="22" height="22" viewBox="0 0 24 24" fill="#FFFFFF" aria-hidden="true" style="transform:rotate(135deg)">' + ICON_PHONE + '</svg></button>End</span>'
        +     '<span class="dl-act dl-call-act"><button type="button" class="dl-btn dl-keys" aria-label="Show keypad" aria-pressed="false"><svg width="18" height="18" viewBox="0 0 24 24" ' + STROKE + '><circle cx="6" cy="5" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="18" cy="5" r="1"></circle><circle cx="6" cy="11" r="1"></circle><circle cx="12" cy="11" r="1"></circle><circle cx="18" cy="11" r="1"></circle><circle cx="6" cy="17" r="1"></circle><circle cx="12" cy="17" r="1"></circle><circle cx="18" cy="17" r="1"></circle><circle cx="12" cy="22" r="1"></circle></svg></button>Keypad</span>'
        // Wrap-up: Call back and Done, centred as a pair (.dl-two).
        +     '<span class="dl-act dl-wrap-act" hidden><button type="button" class="dl-btn call dl-wrap-call" aria-label="Call back"><svg width="22" height="22" viewBox="0 0 24 24" fill="#FFFFFF" aria-hidden="true">' + ICON_PHONE + '</svg></button>Call back</span>'
        +     '<span class="dl-act dl-wrap-act" hidden><button type="button" class="dl-btn dl-done" aria-label="Done"><svg width="22" height="22" viewBox="0 0 24 24" ' + STROKE2 + '>' + ICON_CHECK + '</svg></button>Done</span>'
        +   '</div>'
        + '</div>'
        // Audio settings (gear)
        + '<div class="dl-audio-wrap dl-pane" hidden>'
        +   '<div class="dl-body" style="padding-bottom:14px">'
        +     '<div class="dl-sheet-top"><button type="button" class="dl-back dl-audio-back" aria-label="Back" title="Back">' + ICON_BACK + '</button><span class="dl-sheet-title">Audio settings</span></div>'
        +     '<div class="dl-msg dl-audio-msg" role="status"></div>'
        +     '<label class="dl-afield dl-in-row">Microphone<span class="dl-sel"><select class="dl-in"></select>' + SEL_CARET + '</span></label>'
        +     '<label class="dl-afield dl-out-row">Speaker<span class="dl-sel"><select class="dl-out"></select>' + SEL_CARET + '</span></label>'
        +     '<div class="dl-remote" hidden>Audio plays in your phone tab.</div>'
        +     '<div class="dl-exit-block">'
        +       '<hr class="dl-rule">'
        +       '<button type="button" class="dl-exit">Exit phone mode</button>'
        +       '<div class="dl-exit-note">Calls will not ring until you reopen phone mode.</div>'
        +     '</div>'
        +   '</div>'
        + '</div>'
        // Add to NetSuite (DESIGN.md §6): Dial slot, Recents "Add", the ring
        // view and the after-call note open it. Each block names the
        // choices it shows (data-modes).
        + '<div class="dl-as-wrap dl-pane" role="region" aria-labelledby="dl-as-title" hidden>'
        +   '<div class="dl-body" style="padding-bottom:14px">'
        +     '<div class="dl-sheet-top"><button type="button" class="dl-back dl-as-back" aria-label="Back" title="Back">' + ICON_BACK + '</button><span class="dl-sheet-title" id="dl-as-title">Add to NetSuite</span></div>'
        +     '<div class="dl-as-num mono"></div>'
        +     '<div class="dl-radios" role="radiogroup" aria-label="Where the number goes">'
        +       AS_CHOICES.map(function (c) {
                    return '<label class="dl-radio" data-mode="' + c[0] + '"><input type="radio" class="dl-as-radio" name="dl-as-mode" value="' + c[0] + '"><span>' + c[1] + '</span></label>';
                }).join('')
        +     '</div>'
        +     '<hr class="dl-rule">'
        // Contact (choice 1) or company (choice 2) picker: search the book
        // (softphoneSearch), then a company's contacts (softphoneContacts).
        +     '<div class="dl-as-block" data-modes="existingContact newContact">'
        +       '<div class="dl-lbl dl-as-picklbl">Contact</div>'
        +       '<div class="dl-qbox dl-as-qbox">'
        +         '<svg width="16" height="16" viewBox="0 0 24 24" ' + STROKE2 + '>' + ICON_SEARCH + '</svg>'
        +         '<input type="search" class="dl-q dl-as-q" aria-label="Search for a contact" placeholder="Search your book" autocomplete="off">'
        +       '</div>'
        +       '<div class="dl-sect dl-as-ctx" hidden></div>'
        +       '<ul class="dl-list dl-as-results" aria-label="Results"></ul>'
        +       '<div class="dl-msg dl-as-msg" role="status"></div>'
        +       '<div class="dl-card dl-as-picked" hidden>'
        +         '<span class="dl-row"><span class="dl-ricon">' + USER_SVG(16) + '</span><span class="dl-row-main"><span class="dl-row-name dl-as-pname"></span><span class="dl-row-sub dl-as-psub"></span></span></span>'
        +         '<button type="button" class="dl-text dl-as-change">Change</button>'
        +       '</div>'
        +     '</div>'
        +     '<label class="dl-afield" data-modes="newCompany">Company name<input type="text" class="dl-as-company" autocomplete="off"></label>'
        +     '<div class="dl-as-two" data-modes="newContact newCompany">'
        +       '<label class="dl-afield">First name<input type="text" class="dl-as-first" autocomplete="off"></label>'
        +       '<label class="dl-afield">Last name<input type="text" class="dl-as-last" autocomplete="off"></label>'
        +     '</div>'
        +     '<label class="dl-afield" data-modes="newContact">Role<input type="text" class="dl-as-role" autocomplete="off"></label>'
        +     '<label class="dl-afield" data-modes="existingContact">Phone field<span class="dl-sel"><select class="dl-as-field">'
        +       AS_FIELDS.map(function (f) { return '<option value="' + f[0] + '">' + f[1] + '</option>'; }).join('')
        +     '</select>' + SEL_CARET + '</span></label>'
        +     '<div class="dl-as-block" data-modes="newCompany"><span class="dl-lbl" id="dl-as-status-lbl">Status</span>'
        +       '<div class="dl-seg" role="group" aria-labelledby="dl-as-status-lbl"><button type="button" class="dl-as-status" data-status="lead" aria-pressed="true">Lead</button><button type="button" class="dl-as-status" data-status="prospect" aria-pressed="false">Prospect</button></div>'
        +     '</div>'
        +     '<label class="dl-check" data-modes="existingContact newContact"><input type="checkbox" class="dl-as-main">Make this the main phone</label>'
        +     '<div class="dl-as-note" data-modes="logOnly">The Phone Call stays as it is, linked to no record.</div>'
        +     '<div class="dl-alert dl-as-dups" data-tone="amber" role="status" hidden></div>'
        +     '<div class="dl-as-err" role="alert" hidden></div>'
        +     '<button type="button" class="dl-primary dl-as-save">Save</button>'
        +   '</div>'
        + '</div>'
        // Voicemail (header button)
        + '<div class="dl-vm-wrap dl-pane" hidden>'
        +   '<div class="dl-body" style="padding-bottom:14px">'
        +     '<div class="dl-sheet-top"><button type="button" class="dl-back dl-vm-back" aria-label="Back" title="Back">' + ICON_BACK + '</button><span class="dl-sheet-title">Voicemail</span></div>'
        +     '<div class="dl-vm-list"></div>'
        +     '<div class="dl-msg dl-vm-msg" role="status"></div>'
        +   '</div>'
        + '</div>';

    var q = function (sel) { return el.querySelector(sel); };
    var qa = function (sel) { return Array.prototype.slice.call(el.querySelectorAll(sel)); };
    var ui = {
        status: q('.dl-status'), statusLabel: q('.dl-status-label'),
        gear: q('.dl-gear'), close: q('.dl-close'),
        note: q('.dl-note'), noteText: q('.dl-note-text'), noteLink: q('.dl-note-link'), noteX: q('.dl-note-x'),
        idle: q('.dl-idle'), live: q('.dl-live-wrap'),
        tabs: qa('.dl-tab'), views: qa('.dl-view'),
        rec: q('.dl-rec'), recName: q('.dl-rec-name'), recInsight: q('.dl-rec-insight'),
        slot: q('.dl-slot'), looking: q('.dl-looking'), trig: q('.dl-trig'), mrow: q('.dl-mrow'),
        dialBody: q('.dl-idle .dl-body'), miss: q('.dl-miss'), missAgo: q('.dl-miss-ago'), missName: q('.dl-miss-name'),
        missCall: q('.dl-miss-call'), missX: q('.dl-miss-x'), missSt: q('.dl-miss-st'), missSum: q('.dl-miss-sum'), missK: q('.dl-miss-k'),
        tsheet: q('.dl-tsheet'), tflt: q('.dl-flt'), tfilter: q('.dl-tfilter'), tcount: q('.dl-flt-cnt'), tlist: q('.dl-lst'),
        displayWrap: q('.dl-display-wrap'), display: q('.dl-display'), clearBtn: q('.dl-display-wrap .dl-clear'), dialpad: q('.dl-dialpad'),
        match: q('.dl-match'), matchName: q('.dl-match-name'), matchType: q('.dl-match-type'), add: q('.dl-add'),
        call: q('.dl-call'), backspace: q('.dl-backspace'), dialFoot: q('.dl-foot.dial'), tabRow: q('.dl-tabs'),
        query: q('.dl-view[data-view="search"] .dl-q'), queryClear: q('.dl-qclear'),
        filter: q('.dl-filter'), filterDot: q('.dl-fdot'), filterMenu: q('.dl-filter-menu'),
        results: q('.dl-results'), searchMsg: q('.dl-search-msg'),
        recents: q('.dl-recent-list'), recentMsg: q('.dl-recent-msg'), recentQuery: q('.dl-rq'),
        vm: q('.dl-vm'), vmBadge: q('.dl-vm-badge'), vmPane: q('.dl-vm-wrap'), vmBack: q('.dl-vm-back'),
        vmList: q('.dl-vm-list'), vmMsg: q('.dl-vm-msg'),
        liveAv: q('.dl-live-av'), liveName: q('.dl-live-name'), liveSub: q('.dl-live-sub'), liveTime: q('.dl-live-time'),
        liveNone: q('.dl-live-none'),
        dtmf: q('.dl-dtmf'), mute: q('.dl-mute'), muteLabel: q('.dl-mute-label'), end: q('.dl-end'), keys: q('.dl-keys'),
        answer: q('.dl-answer'), decline: q('.dl-decline'), ringActs: qa('.dl-ring-act'), callActs: qa('.dl-call-act'),
        head: q('.dl-head'), audio: q('.dl-audio-wrap'), audioBack: q('.dl-audio-back'), audioMsg: q('.dl-audio-msg'),
        inRow: q('.dl-in-row'), inSel: q('.dl-in'), outRow: q('.dl-out-row'), outSel: q('.dl-out'), exit: q('.dl-exit'),
        exitBlock: q('.dl-exit-block'),
        remote: q('.dl-remote'),
        alert: q('.dl-alert'), alertTitle: q('.dl-alert-title'), alertText: q('.dl-alert-text'), alertAct: q('.dl-alert-act'),
        refused: q('.dl-refused'), liveWarn: q('.dl-live-warn'), liveSo: q('.dl-live-so'),
        so: q('.dl-so'), soBtn: q('.dl-so-btn'),
        alerts: q('.dl-alerts'), alertsBtn: q('.dl-alerts-btn'), alertsOff: q('.dl-alerts-off'),
        noteAdd: q('.dl-note-add'), liveAdd: q('.dl-live-add'),
        liveBody: q('.dl-live'), liveNum: q('.dl-live-num'), wrapActs: qa('.dl-wrap-act'),
        wrapCall: q('.dl-wrap-call'), done: q('.dl-done'),
        acc: q('.dl-acc'), accSum: q('.dl-acc-sum'), stl: q('.dl-stl'), stlMark: q('.dl-stl-mark'), stlText: q('.dl-stl-text'),
        sum: q('.dl-sum'), sumLink: q('.dl-sum-link'), sumText: q('.dl-sum-text'), kpis: q('.dl-kpis'), kpiOut: q('.dl-kpi-out'), kpiDot: q('.dl-kpi-dot'),
        kpiTouch: q('.dl-kpi-touch'), kpiOrders: q('.dl-kpi-orders'),
        accAct: q('.dl-acc-act'), accActs: q('.dl-acc-acts'), accFu: q('.dl-acc-fu'), accFuLbl: q('.dl-acc-fulbl'), accFus: q('.dl-acc-fus'),
        asPane: q('.dl-as-wrap'), asBack: q('.dl-as-back'), asNum: q('.dl-as-num'),
        asRadios: qa('.dl-as-radio'), asLogOpt: q('.dl-radio[data-mode="logOnly"]'), asBlocks: qa('.dl-as-wrap [data-modes]'),
        asPickLbl: q('.dl-as-picklbl'), asQbox: q('.dl-as-qbox'), asQ: q('.dl-as-q'), asCtx: q('.dl-as-ctx'),
        asResults: q('.dl-as-results'), asMsg: q('.dl-as-msg'),
        asPicked: q('.dl-as-picked'), asPName: q('.dl-as-pname'), asPSub: q('.dl-as-psub'), asChange: q('.dl-as-change'),
        asCompany: q('.dl-as-company'), asFirst: q('.dl-as-first'), asLast: q('.dl-as-last'), asRole: q('.dl-as-role'),
        asField: q('.dl-as-field'), asStatus: qa('.dl-as-status'), asMain: q('.dl-as-main'),
        asDups: q('.dl-as-dups'), asErr: q('.dl-as-err'), asSave: q('.dl-as-save')
    };

    // --- State ---
    var tab = 'dial';
    var target = null;      // { entityId, entityName, entityType, contacts: [] }
    var manual = false;     // display edited by hand since the last pick
    var pending = null;     // dial request kept until the anchor is ready
    var audioOpen = false;  // audio settings view in front of Dial / in-call
    var deferredCtx = null; // { ctx } the frame moved to during a call
    var wasActive = false;
    var snap = null;
    var liveTimer = null;
    // Record data (softphoneContacts + softphoneAccountSnapshot) per entity:
    // 'c:<id>' / 's:<id>' -> { at, p, done, data }. RECORD_TTL_MS after the
    // answer (or while it runs) the same entry is used again; a failure is
    // never kept. invalidateRecord drops both for an entity.
    var RECORD_TTL_MS = 60000;
    var recordCache = {};
    var recordLogKey = null;  // lastLog key last seen (null: no snapshot yet)
    var prefetchTimer = null;
    var searchType = '';
    var searchSort = readSort();
    var searchSeq = 0;
    var searchTimer = null;
    var suggested = null;
    var bookCounts = null;
    var shownRows = [];       // the rows the Search list draws from (suggested or results)
    var shownCounts = null;   // the counts the filter menu shows
    var openMenu = null;      // the open menu (Search filter and sort), or null
    var vmOpen = false;       // Voicemail view in front
    var vmRows = null;        // last softphoneVoicemails rows
    var vmEmployee = '';      // employee id from the response (seen key)
    var vmAt = 0;             // when Voicemail was last asked for
    var vmSeq = 0;
    var vmTimer = null;       // 5 min refresh while the panel shows
    var vmShownSeen = null;   // the seen mark when this visit to the view began (null: not in one)
    var panelShown = false;   // the panel is open (client: shown())
    var wasLive = false;
    var recentsLoaded = false;
    var recentsAt = 0;        // when Recents was last asked for
    var recentsSeq = 0;
    var recentRows = null;    // last softphoneRecents rows
    var pendingMissed = null; // { caller, at }: newest missed call not yet a Phone Call
    var noteKey = null;       // key of the lastLog the note shows (null: a local note)
    var noteDismissed = null; // key of the lastLog the rep closed (or that hid itself)
    var noteTimer = null;
    var noteRemain = 0;       // ms left on the note's auto-hide while paused
    var noteDeadline = 0;
    var noteHover = false;
    var noteFocus = false;
    var missedCaller = null;  // newest snap.missedUnseen.last (kept after markMissedSeen)
    var missedAt = 0;         // ... and when it was missed (snap.missedUnseen.at)
    // The missed note on Dial (asset 40): { key, name, number, entityId,
    // entityType, at }; key = the lastLog it shows. null = not shown.
    var miss = null;
    var missTimer = null;
    var ownNonces = {};       // nonces of requests this panel sent (refused lines)
    // Answer sent from this tab (panel ring view, pill or incoming card):
    // the live view shows the call controls at once, and End takes focus
    // when the phase goes live. Cleared then, or when the ring ends.
    var answerSent = false;
    var refusedTimer = null;
    var alertRun = null;
    var matchKey = '';        // last-10 digits the slot is for ('' = none)
    var matchShown = null;    // the match the slot shows, or null
    var matchTimer = null;
    var matchSeq = 0;
    var matchCache = {};      // key -> match or null (no record)
    var addOpen = false;      // Add to NetSuite sheet in front
    var as = null;            // the sheet's state (openAdd)
    var asSeq = 0;            // picker search / contacts requests
    var asTimer = null;
    var dupSeq = 0;
    var addedKeys = {};       // last-10 digits saved this session: no more "Add"
    var noteAdd = null;       // { phone, phoneCallId } the after-call note adds
    var liveAddNum = '';      // the number the ring view's link adds

    // --- Helpers ---
    // raw: answers with { error } come back as data (Add to NetSuite:
    // { ok: false, error, message }) instead of a rejection.
    // localStorage 'ctc-perf' = '1': api() logs each call's time (and the
    // server's _perf when it sends one). Read once; off: no extra work.
    var perfOn = false;
    try { perfOn = window.localStorage.getItem('ctc-perf') === '1'; } catch (e) { perfOn = false; }

    function api(action, body, raw) {
        if (!cfg.restletUrl) return Promise.reject(new Error('Phone data is not available on this page'));
        var payload = { action: action };
        if (body) for (var k in body) if (Object.prototype.hasOwnProperty.call(body, k)) payload[k] = body[k];
        if (perfOn) return timedApi(action, payload, raw);
        return post(payload, raw);
    }

    function timedApi(action, payload, raw) {
        payload.perf = true;
        var t0 = performance.now();
        var log = function (d) {
            var ms = Math.round(performance.now() - t0);
            var sp = d && d._perf;
            console.log('[ctc-dialer] ' + action + ' ' + ms + 'ms' + (sp ? ' server ' + sp.ms + 'ms ' + sp.units + 'u' : ''));
        };
        return post(payload, raw).then(function (d) { log(d); return d; }, function (err) { log(null); throw err; });
    }

    function post(payload, raw) {
        return fetch(cfg.restletUrl, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        }).then(function (d) {
            if (d && d.error && !raw) throw new Error(String(d.error));
            return d || {};
        });
    }

    // The cache entry for one record request (see recordCache). contactId
    // (call context only) is part of the key and of the request.
    function cachedRecord(prefix, action, entityId, contactId) {
        var withContact = contactId != null;
        var key = prefix + entityId + (withContact ? ':' + contactId : '');
        var e = recordCache[key];
        if (e && Date.now() - e.at < RECORD_TTL_MS) return e;
        e = { at: Date.now(), done: false, data: undefined, p: null };
        recordCache[key] = e;
        var body = { entityId: entityId };
        if (withContact) body.contactId = contactId;
        e.p = api(action, body).then(function (d) {
            e.done = true;
            e.data = d;
            e.at = Date.now();
            return d;
        }, function (err) {
            if (recordCache[key] === e) delete recordCache[key];
            throw err;
        });
        return e;
    }
    function recordContacts(entityId) { return cachedRecord('c:', 'softphoneContacts', entityId); }
    function recordSnapshot(entityId) { return cachedRecord('s:', 'softphoneAccountSnapshot', entityId); }
    // The call screen's account block (asset 38): 'x:<entity>:<contact>'.
    function callContext(entityId, contactId) { return cachedRecord('x:', 'softphoneCallContext', entityId, String(contactId || '')); }
    function invalidateRecord(entityId) {
        if (!entityId) return;
        delete recordCache['c:' + entityId];
        delete recordCache['s:' + entityId];
        Object.keys(recordCache).forEach(function (k) {
            if (k.indexOf('x:' + entityId + ':') === 0) delete recordCache[k];
        });
    }
    // Start the call context fetch for a record (no UI change).
    function prefetchCallContext(entityId, contactId) {
        if (!entityId || !cfg.restletUrl) return;
        callContext(String(entityId), contactId).p.catch(function () {});
    }
    // Start the fetches loadEntity makes for this record (no UI change).
    function prefetchRecord(entityId, entityType) {
        var id = String(entityId || '');
        var type = String(entityType || '').toLowerCase();
        if (!id || !cfg.restletUrl) return;
        var noop = function () {};
        if (CONTACT_TYPES[type]) recordContacts(id).p.catch(noop);
        if (type !== 'contact') recordSnapshot(id).p.catch(noop);
    }
    // Pointer rests on a Search / Recents row for PREFETCH_HOVER_MS.
    function prefetchOnHover(b, entityId, entityType) {
        if (!entityId) return;
        b.addEventListener('pointerenter', function () {
            window.clearTimeout(prefetchTimer);
            prefetchTimer = window.setTimeout(function () { prefetchTimer = null; prefetchRecord(entityId, entityType); }, PREFETCH_HOVER_MS);
        });
        b.addEventListener('pointerleave', function () {
            window.clearTimeout(prefetchTimer);
            prefetchTimer = null;
        });
    }

    function digitsOf(s) {
        var str = String(s || '');
        return (str.trim().charAt(0) === '+' ? '+' : '') + str.replace(/[^0-9]/g, '');
    }

    function dialable(input) {
        var d = digitsOf(input);
        if (!d) return '';
        if (d.charAt(0) === '+') return d;
        if (d.length === 10) return '+1' + d;
        if (d.length === 11 && d.charAt(0) === '1') return '+' + d;
        return d;
    }

    function money(n) {
        if (typeof n !== 'number' || isNaN(n)) return '—';
        return '$' + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
    }

    function recordUrl(type, id) {
        if (!id) return '';
        var path = type === 'contact' ? '/app/common/entity/contact.nl?id=' : '/app/common/entity/custjob.nl?id=';
        return path + encodeURIComponent(id);
    }

    function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

    function span(cls, text) {
        var s = document.createElement('span');
        s.className = cls;
        s.textContent = text == null ? '' : String(text);
        return s;
    }

    // localStorage, never fatal (blocked storage, private mode).
    function readLocal(key) {
        try { return window.localStorage.getItem(key); } catch (e) { return null; }
    }
    function writeLocal(key, value) {
        try { window.localStorage.setItem(key, value); } catch (e) { /* storage blocked */ }
    }

    function readSort() {
        var v = readLocal(SORT_KEY);
        return SORTS.some(function (s) { return s[0] === v; }) ? v : 'recent';
    }

    // --- Times (the browser's locale and time zone) ---
    function dayKey(d) { return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); }

    // "Today" / "Yesterday" / "Nov 6".
    function dayLabel(d) {
        var now = new Date(Date.now());
        if (dayKey(d) === dayKey(now)) return 'Today';
        var y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        if (dayKey(d) === dayKey(y)) return 'Yesterday';
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }

    // "2:14 PM".
    function timeLabel(d) {
        return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    }

    // 'HH:MM' (24 h, the RESTlet's timeOfDay) -> "2:14 PM".
    function clock12(hhmm) {
        var m = /^([0-9]{1,2}):([0-9]{2})/.exec(String(hhmm || ''));
        if (!m) return '';
        var h = Number(m[1]);
        return (h % 12 || 12) + ':' + m[2] + (h < 12 ? ' AM' : ' PM');
    }

    // A call's day group and time: from its ISO start, else the record's
    // date and time of day as the RESTlet sent them.
    function whenOf(iso, date, timeOfDay) {
        var t = Date.parse(iso || '');
        if (!isNaN(t)) {
            var d = new Date(t);
            return { key: dayKey(d), day: dayLabel(d), time: timeLabel(d) };
        }
        return { key: 'd:' + (date || ''), day: date || 'Earlier', time: clock12(timeOfDay) };
    }

    // Seconds -> "m:ss".
    function lengthLabel(sec) {
        var s = Math.max(0, Math.round(Number(sec) || 0));
        if (!s) return '';
        return Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60);
    }

    // Rows (newest first) into day groups: [{ label, rows }].
    function groupByDay(rows, whenFn) {
        var groups = [];
        rows.forEach(function (r) {
            var w = whenFn(r);
            var g = groups[groups.length - 1];
            if (!g || g.key !== w.key) {
                g = { key: w.key, label: w.day, rows: [] };
                groups.push(g);
            }
            g.rows.push({ r: r, time: w.time });
        });
        return groups;
    }

    // A group label followed by its list; returns the list.
    function dayGroup(parent, label) {
        var h = document.createElement('div');
        h.className = 'dl-day';
        h.setAttribute('role', 'heading');
        h.setAttribute('aria-level', '3');
        h.textContent = label;
        parent.appendChild(h);
        var ul = document.createElement('ul');
        ul.className = 'dl-list';
        ul.setAttribute('aria-label', label);
        parent.appendChild(ul);
        return ul;
    }

    // A go-green round Call for a list row.
    function rowCall(label, onClick) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'dl-row-call';
        b.setAttribute('aria-label', label);
        b.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="#FFFFFF" aria-hidden="true">' + ICON_PHONE + '</svg>';
        b.addEventListener('click', onClick);
        return b;
    }

    // The 28 px go-green "Call back" (missed rows, voicemail).
    function callBackButton(name, onClick) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'dl-go dl-recent-cb';
        b.textContent = 'Call back';
        b.setAttribute('aria-label', 'Call back ' + name);
        b.addEventListener('click', onClick);
        return b;
    }

    function isActive() { return !!(snap && ACTIVE[snap.phase]); }
    function isIncoming() { return !!(snap && snap.phase === 'incoming'); }
    function isRemote() { return !!(host.isRemote && host.isRemote()); }
    function errKind() { return snap && snap.error && typeof snap.error === 'object' ? String(snap.error.kind || '') : ''; }

    // Every request goes out with origin + nonce (client); keep the nonce so
    // a refusal of our own request can be shown once.
    function send(action, extra) {
        var nonce = host.send(action, extra);
        if (nonce) ownNonces[nonce] = true;
        return nonce;
    }

    // --- Tabs ---
    function setTab(next) {
        tab = next;
        ui.tabs.forEach(function (t) { t.setAttribute('aria-selected', t.getAttribute('data-tab') === next ? 'true' : 'false'); });
        ui.views.forEach(function (v) { v.hidden = v.getAttribute('data-view') !== next; });
        ui.dialFoot.hidden = next !== 'dial';
        closeMenu(false);
        closeTargets(false);
        if (next === 'search' && suggested === null) loadSuggested();
        if (next === 'recents' && (!recentsLoaded || Date.now() - recentsAt > RECENTS_STALE_MS)) loadRecents();
    }

    // A tab the user picks is shared with every tab (client: UI_KEY).
    ui.tabs.forEach(function (t) {
        t.addEventListener('click', function () {
            setTab(t.getAttribute('data-tab'));
            if (host.saveUi) host.saveUi();
        });
    });

    // The view in front: 'call' while the in-call (or ring) view shows,
    // else the tab.
    function currentView() {
        return isActive() || isIncoming() || wrapUp ? 'call' : tab;
    }

    // --- Dial tab: the loaded record and its numbers (DESIGN.md §4, asset 33) ---
    function setDisplay(value, isManual) {
        var v = formatPhone(value) || String(value || '');
        // A number typed, edited or cleared by hand is no longer the loaded
        // record's: the record lets go (finding #75).
        if (isManual && target) dropRecord();
        ui.display.value = v;
        // An empty field is not a hand-typed number: the Dial tab follows
        // the next page again (except the record the rep just let go).
        manual = !!isManual && !!v.trim();
        syncCallButton();
        syncMatch();
        syncDial();
    }

    // What the Dial view shows around the number: the record header while
    // a record is loaded; in the 34 px row above the number, the target
    // pill unless the rep typed a number by hand, else the match slot
    // unless a record's own number is in the field (never both).
    function syncDial() {
        var hasRec = !!(target && (target.entityId || target.entityName));
        // The missed note names this record (and links it): no header.
        ui.rec.hidden = !hasRec || !!(miss && miss.entityId && miss.entityId === target.entityId);
        ui.trig.hidden = manual || !selRow();
        ui.slot.hidden = !ui.trig.hidden || (hasRec && !manual);
        if (manual) closeTargets(false);
        fitDial();
    }

    // --- Match slot (above the number) ---
    // looking: the lookup for the typed number runs ("Looking up…").
    function showMatch(m, looking) {
        matchShown = m || null;
        ui.match.hidden = !m;
        ui.looking.hidden = !(looking && !m);
        if (m) {
            var type = TYPE_NAME[m.entityType] || '';
            ui.matchName.textContent = m.name;
            ui.matchType.textContent = type ? '· ' + type : '';
            var label = 'Load ' + m.name + (type ? ', ' + type : '');
            ui.match.setAttribute('aria-label', label);
            ui.match.title = label;
            prefetchRecord(m.entityId, m.entityType); // the click renders from the cache
        }
        // No record: "Add to NetSuite" (opens the sheet with the typed number).
        ui.add.hidden = !(!m && matchKey && matchCache[matchKey] === null);
    }

    // Look the typed number up once the rep stops typing. Only a number
    // typed by hand (a loaded record already says whose number it is).
    function syncMatch() {
        var key = manual && !isActive() ? lastTen(ui.display.value) : '';
        if (key.length < MATCH_MIN_DIGITS) key = '';
        if (key === matchKey) return;
        matchKey = key;
        window.clearTimeout(matchTimer);
        matchTimer = null;
        matchSeq++;
        if (!key || !cfg.restletUrl) { showMatch(null); return; }
        if (Object.prototype.hasOwnProperty.call(matchCache, key)) { showMatch(matchCache[key]); return; }
        showMatch(null, true);
        var seq = matchSeq;
        matchTimer = window.setTimeout(function () {
            matchTimer = null;
            api('lookupCaller', { phone: key }).then(function (d) {
                var m = d && d.match && d.match.entityId && d.match.name ? d.match : null;
                matchCache[key] = m;
                if (seq === matchSeq) showMatch(m);
            }).catch(function () {
                if (seq === matchSeq) showMatch(null); // the slot empties
            });
        }, MATCH_DEBOUNCE_MS);
    }

    // A click (or Enter / Space: it is a button) loads the record.
    ui.match.addEventListener('click', function () {
        var m = matchShown;
        if (!m) return;
        var number = digitsOf(ui.display.value);
        loadEntity({ entityId: m.entityId, entityName: m.name, entityType: m.entityType, phone: number });
        ui.display.focus();
    });
    ui.add.addEventListener('click', function () {
        openAdd({ phone: ui.display.value, phoneCallId: '', trigger: ui.add });
    });

    function syncCallButton() {
        ui.clearBtn.hidden = !ui.display.value;
        var hasNumber = !!digitsOf(ui.display.value).replace('+', '');
        ui.call.disabled = !hasNumber || isActive() || errKind() === 'paused' || dimmed;
    }

    // target: { entityId, entityName, entityType, parties, rows, sel,
    // lastKey, pending }. parties: the company main line first, then the
    // contacts with a number ({ id, name, title, isCompany, phones: [{ t,
    // n, key }] }; id '' = the company). rows: every number ({ p, ph }) in
    // list order; sel: the chosen number's key; lastKey: the number this
    // rep last called here ('' = none); pending: softphoneContacts runs.
    var contactsSeq = 0;
    function loadEntity(t) {
        dismissedId = ''; // an explicit load always wins
        closeTargets(false);
        target = {
            entityId: String(t.entityId || ''),
            entityName: String(t.entityName || ''),
            entityType: String(t.entityType || '').toLowerCase(),
            parties: [], rows: [], sel: '', lastKey: '', pending: false
        };
        var phone = t.phone ? String(t.phone) : '';
        ui.recName.textContent = target.entityName || 'Unknown';
        var url = recordUrl(target.entityType, target.entityId);
        if (url) ui.recName.href = url;
        else ui.recName.removeAttribute('href');

        // Until the record's numbers come (or when none can): the number it
        // was loaded with, as the company's main line or the contact's own.
        var own = [];
        if (phone && (target.entityId || target.entityName)) {
            own.push(target.entityType === 'contact'
                ? { contactId: '', name: target.entityName, phones: [{ number: phone, type: '' }] }
                : { contactId: COMPANY_MAIN_ID, name: target.entityName, phones: [{ number: phone, type: 'Main' }] });
        }
        target.pending = !!(target.entityId && CONTACT_TYPES[target.entityType] && cfg.restletUrl);
        setParties(own, null, phone);
        setDisplay(phone, false);

        if (target.pending) {
            var forId = target.entityId;
            var seq = ++contactsSeq;
            var done = function (d) {
                if (!target || seq !== contactsSeq || target.entityId !== forId) return;
                target.pending = false;
                var rows = (d && d.rows) || [];
                var hasPhones = rows.some(function (c) { return c && (c.phones || []).some(function (p) { return p && p.number; }); });
                if (hasPhones) {
                    // During a call keep the number that is being called.
                    var busy = isActive() || manual;
                    setParties(rows, d.lastCalled || null, busy ? ui.display.value : phone);
                    if (!busy && selRow()) setDisplay(selRow().ph.n, false);
                }
                renderTrig();
                syncDial();
                prefetchCallContext(forId, contextContact(target.entityType, forId, selRow()));
            };
            var ce = recordContacts(forId);
            if (ce.done) done(ce.data);
            else ce.p.then(done).catch(function () { done(null); });
        }
        if (!target.pending) prefetchCallContext(target.entityId, contextContact(target.entityType, target.entityId, selRow()));
        var snapId = target.entityId;
        renderInsight(undefined);
        if (snapId && target.entityType !== 'contact') {
            var se = recordSnapshot(snapId);
            if (se.done) renderInsight(se.data);
            else {
                se.p.then(function (d) {
                    if (target && target.entityId === snapId) renderInsight(d);
                }).catch(function () {
                    if (target && target.entityId === snapId) renderInsight(null);
                });
            }
        }
    }

    // The insight line: "Customer · $12,400 open · Called 3 days ago".
    // s: the account snapshot; undefined while it loads (a faint bar);
    // null when it failed (the type alone). Contacts get no line. Nothing
    // to say: the line is left out (never "—").
    function renderInsight(s) {
        paintInsight(s);
        fitDial();
    }

    function paintInsight(s) {
        var line = ui.recInsight;
        clear(line);
        line.classList.remove('loading');
        if (!target || !target.entityId || target.entityType === 'contact') { line.hidden = true; return; }
        if (s === undefined) {
            line.classList.add('loading');
            line.appendChild(span('dl-rec-ph', ''));
            line.hidden = false;
            return;
        }
        var text = insightText(target.entityType, s);
        line.textContent = text;
        line.title = text;
        line.hidden = !text;
    }

    function insightText(type, s) {
        var parts = [];
        if (TYPE_NAME[type]) parts.push(TYPE_NAME[type]);
        var sum = Number(s && s.outstanding && s.outstanding.sum);
        if (sum > 0) parts.push(money(sum) + ' open');
        var a = s && s.lastActivity;
        var age = a && a.ageDays != null && a.ageDays !== '' ? Number(a.ageDays) : NaN;
        if (a && !isNaN(age)) {
            var n = Math.max(0, Math.floor(age));
            var when = n === 0 ? 'today' : n === 1 ? '1 day ago' : n + ' days ago';
            parts.push((a.type === 'Phone call' ? 'Called' : String(a.type || 'Activity')) + ' ' + when);
        }
        return parts.join(' · ');
    }

    // contacts: softphoneContacts rows (or the own number); lc: lastCalled
    // { contactId, number, at } | null; prefer: the number to keep when
    // the rep has not called here.
    function setParties(contacts, lc, prefer) {
        var parties = [];
        (contacts || []).forEach(function (c) {
            if (!c) return;
            var phones = (c.phones || []).filter(function (p) { return p && p.number; });
            if (!phones.length) return;
            var isCompany = String(c.contactId || '') === COMPANY_MAIN_ID;
            parties.push({
                id: isCompany ? '' : String(c.contactId || ''),
                name: isCompany ? (target.entityName || String(c.name || '').replace(/ \(main line\)$/, '')) : String(c.name || ''),
                title: isCompany ? 'Main line' : String(c.title || ''),
                isCompany: isCompany,
                phones: phones.map(function (p) { return { t: String(p.type || ''), n: String(p.number) }; })
            });
        });
        // The company main line first.
        parties.sort(function (a, b) { return (b.isCompany ? 1 : 0) - (a.isCompany ? 1 : 0); });
        var rows = [];
        parties.forEach(function (p, pi) {
            p.phones.forEach(function (ph, i) { ph.key = pi + ':' + i; rows.push({ p: p, ph: ph }); });
        });
        target.parties = parties;
        target.rows = rows;
        target.lastKey = lastCalledKey(rows, lc);
        target.sel = defaultKey(rows, target.lastKey, prefer);
        renderTrig();
    }

    // The row of the number last called (last 10 digits); of two rows with
    // that number, the one of the contact called.
    function lastCalledKey(rows, lc) {
        var want = lc && lc.number ? lastTen(lc.number) : '';
        if (!want) return '';
        var hits = rows.filter(function (r) { return lastTen(r.ph.n) === want; });
        if (!hits.length) return '';
        var id = lc.contactId && String(lc.contactId) !== COMPANY_MAIN_ID ? String(lc.contactId) : '';
        var exact = hits.filter(function (r) { return r.p.id === id; })[0];
        return (exact || hits[0]).ph.key;
    }

    // Default target: the number last called here, else the number the
    // record was loaded with (if it is one of its numbers), else the main
    // line, else the first number.
    function defaultKey(rows, lastKey, prefer) {
        if (!rows.length) return '';
        if (lastKey) return lastKey;
        var want = prefer ? lastTen(prefer) : '';
        var hit = want && rows.filter(function (r) { return lastTen(r.ph.n) === want; })[0];
        if (hit) return hit.ph.key;
        var main = rows.filter(function (r) { return r.p.isCompany; })[0];
        return (main || rows[0]).ph.key;
    }

    function rowByKey(key) {
        if (!target || !key) return null;
        return target.rows.filter(function (r) { return r.ph.key === key; })[0] || null;
    }
    function selRow() { return target ? rowByKey(target.sel) : null; }

    // Who the selected number belongs to: "Main line", or the person + type.
    function whoOf(r) {
        return { name: r.p.isCompany ? 'Main line' : r.p.name, type: r.p.isCompany ? '' : r.ph.t };
    }

    // The target pill: a button when the record has more than one number;
    // flat (not a control) with one.
    function renderTrig() {
        clear(ui.trig);
        var r = selRow();
        if (target && target.pending) ui.trig.setAttribute('data-pending', '');
        else ui.trig.removeAttribute('data-pending');
        if (!r) { syncDial(); return; }
        var can = target.rows.length > 1;
        var w = whoOf(r);
        var isLast = !!target.lastKey && r.ph.key === target.lastKey;
        var node = document.createElement(can ? 'button' : 'span');
        node.className = 'dl-tpill' + (can ? '' : ' flat');
        var icon = span('dl-tpill-i', '');
        icon.innerHTML = USER_SVG(14);
        node.appendChild(icon);
        var b = document.createElement('b');
        b.textContent = w.name;
        node.appendChild(b);
        if (w.type) node.appendChild(span('dl-tpill-type', w.type));
        if (isLast) {
            var dot = span('dl-lcdot', '');
            dot.title = 'Last called';
            node.appendChild(dot);
        }
        if (can) {
            node.type = 'button';
            node.setAttribute('aria-haspopup', 'listbox');
            node.setAttribute('aria-expanded', 'false');
            node.setAttribute('aria-label', 'Number: ' + w.name + (w.type ? ', ' + w.type : '') + (isLast ? ', last called' : '') + '. Choose another number');
            var cv = span('dl-tpill-cv', '');
            cv.innerHTML = SEL_CARET.replace('width="16" height="16"', 'width="14" height="14"');
            node.appendChild(cv);
        }
        ui.trig.appendChild(node);
        syncDial();
    }

    // --- The record's numbers (the list over the keypad) ---
    var targetQ = '';
    function targetsOpen() { return ui.tsheet.hasAttribute('data-open'); }
    function targetButton() { return ui.trig.querySelector('button.dl-tpill'); }
    function listRows() { return Array.prototype.slice.call(ui.tlist.querySelectorAll('.dl-nr')); }

    function openTargets() {
        if (!target || target.rows.length < 2 || isActive() || manual) return;
        targetQ = '';
        ui.tfilter.value = '';
        ui.tflt.hidden = target.rows.length < TARGET_FILTER_MIN;
        ui.tlist.setAttribute('aria-label', 'Numbers for ' + (target.entityName || 'this record'));
        renderTargetList();
        // From just under the number's rule: the number stays in view.
        ui.tsheet.style.top = (ui.displayWrap.offsetTop + ui.displayWrap.offsetHeight + 8) + 'px';
        ui.tsheet.setAttribute('data-open', '');
        ui.tsheet.removeAttribute('inert');
        var btn = targetButton();
        if (btn) btn.setAttribute('aria-expanded', 'true');
        var cur = ui.tlist.querySelector('.dl-nr[aria-selected="true"]');
        setTargetActive(cur);
        if (!ui.tflt.hidden) ui.tfilter.focus();
        else if (cur) cur.focus();
    }

    function closeTargets(refocus) {
        if (!targetsOpen()) return;
        keyOpenAt = 0;
        ui.tsheet.removeAttribute('data-open');
        ui.tsheet.setAttribute('inert', ''); // closed: out of the tab order and the accessibility tree
        ui.tfilter.removeAttribute('aria-activedescendant');
        var btn = targetButton();
        if (btn) {
            btn.setAttribute('aria-expanded', 'false');
            if (refocus) btn.focus();
        }
    }

    // text with the first match of q (lower case) underlined.
    function marked(cls, text, q) {
        var s = document.createElement('span');
        s.className = cls;
        text = String(text || '');
        var i = q ? text.toLowerCase().indexOf(q) : -1;
        if (i < 0) { s.textContent = text; return s; }
        s.appendChild(document.createTextNode(text.slice(0, i)));
        var m = document.createElement('mark');
        m.textContent = text.slice(i, i + q.length);
        s.appendChild(m);
        s.appendChild(document.createTextNode(text.slice(i + q.length)));
        return s;
    }

    // The filter matches name, title, type (letters) and digits (3 or
    // more; spaces and dashes ignored). A name or title match shows all of
    // that person's numbers; a type or digit match only the matching ones.
    function renderTargetList() {
        clear(ui.tlist);
        var ql = targetQ.trim().toLowerCase();
        var qd = targetQ.replace(/[^0-9]/g, '');
        var letters = /[a-z]/i.test(targetQ) ? ql : '';
        var shown = 0;
        target.parties.forEach(function (p) {
            var who = (p.name + ' ' + p.title).toLowerCase();
            var nameHit = !ql || (letters && who.indexOf(letters) >= 0);
            var phones = p.phones.filter(function (ph) {
                if (nameHit) return true;
                if (letters && ph.t.toLowerCase().indexOf(letters) >= 0) return true;
                return qd.length >= 3 && digitsOf(ph.n).replace('+', '').indexOf(qd) >= 0;
            });
            if (!phones.length) return;
            shown += phones.length;
            if (p.phones.length === 1) {
                var ph = phones[0];
                var sub = p.isCompany ? 'Main line' : [p.title, ph.t].filter(Boolean).join(' · ');
                var l = span('dl-nr-l', '');
                l.appendChild(marked('dl-ln', p.name, letters));
                if (sub) l.appendChild(marked('dl-lt', sub, letters));
                ui.tlist.appendChild(numberRow(ph, l, true));
            } else {
                var head = document.createElement('div');
                head.className = 'dl-lh';
                head.setAttribute('role', 'presentation');
                head.appendChild(marked('dl-ln', p.name, letters));
                if (p.title) head.appendChild(marked('dl-lt', p.title, letters));
                ui.tlist.appendChild(head);
                phones.forEach(function (x) {
                    ui.tlist.appendChild(numberRow(x, marked('dl-nr-l', x.t || 'Phone', letters), false));
                });
            }
        });
        if (!shown) {
            var empty = document.createElement('div');
            empty.className = 'dl-lempty';
            empty.textContent = 'No match for “' + targetQ.trim() + '”';
            ui.tlist.appendChild(empty);
        }
        ui.tcount.textContent = ql ? shown + ' of ' + target.rows.length : target.rows.length + ' numbers';
    }

    function numberRow(ph, left, solo) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'dl-nr' + (solo ? ' solo' : '');
        b.id = 'dl-nr-' + ph.key.replace(':', '-');
        b.setAttribute('role', 'option');
        b.setAttribute('aria-selected', ph.key === target.sel ? 'true' : 'false');
        b.setAttribute('data-key', ph.key);
        b.appendChild(left);
        var r = span('dl-nr-r', '');
        if (ph.key === target.lastKey) r.appendChild(span('dl-lc', 'Last called'));
        r.appendChild(span('dl-nr-n', formatPhone(ph.n) || ph.n));
        var ck = span('dl-nr-ck', '');
        if (ph.key === target.sel) ck.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" ' + STROKE2 + '>' + ICON_CHECK + '</svg>';
        r.appendChild(ck);
        b.appendChild(r);
        return b;
    }

    // The row the keys act on (.act). With the filter field the focus
    // stays in the field (aria-activedescendant); without it the row takes
    // the focus.
    function setTargetActive(row, focus) {
        listRows().forEach(function (r) { r.classList.toggle('act', r === row); });
        if (!ui.tflt.hidden) {
            if (row) ui.tfilter.setAttribute('aria-activedescendant', row.id);
            else ui.tfilter.removeAttribute('aria-activedescendant');
        }
        if (!row) return;
        var top = row.offsetTop;
        var h = row.offsetHeight;
        var head = 32; // a sticky person header
        if (top - head < ui.tlist.scrollTop) ui.tlist.scrollTop = Math.max(0, top - head);
        else if (top + h > ui.tlist.scrollTop + ui.tlist.clientHeight) ui.tlist.scrollTop = top + h - ui.tlist.clientHeight;
        if (focus && ui.tflt.hidden) row.focus();
    }

    function rollNumber() {
        ui.display.classList.remove('dl-roll');
        ui.display.getBoundingClientRect(); // restart the animation
        ui.display.classList.add('dl-roll');
    }

    // A number picked: it goes in the Dial field, the pill follows, the
    // list closes (focus back on the pill when picked with the keys).
    function chooseTarget(key, byKey) {
        var r = rowByKey(key);
        if (!r) return;
        var changed = key !== target.sel;
        target.sel = key;
        closeTargets(false);
        renderTrig();
        setDisplay(r.ph.n, false);
        if (changed) rollNumber();
        if (byKey) {
            var btn = targetButton();
            if (btn) btn.focus();
        }
    }

    var keyOpenAt = 0; // a key opened the list: drop the click that may follow
    ui.trig.addEventListener('click', function (e) {
        if (!e.target.closest('button.dl-tpill')) return;
        if (e.detail === 0 && Date.now() - keyOpenAt < 500) return;
        if (targetsOpen()) closeTargets(false);
        else openTargets();
    });
    ui.trig.addEventListener('keydown', function (e) {
        if (!e.target.closest('button.dl-tpill') || targetsOpen()) return;
        if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            keyOpenAt = Date.now();
            openTargets();
        }
    });
    ui.tlist.addEventListener('click', function (e) {
        var b = e.target.closest('.dl-nr');
        if (b) chooseTarget(b.getAttribute('data-key'), e.detail === 0);
    });
    ui.tlist.addEventListener('mousemove', function (e) {
        var b = e.target.closest('.dl-nr');
        if (b && !b.classList.contains('act')) setTargetActive(b, false);
    });
    ui.tfilter.addEventListener('input', function () {
        targetQ = ui.tfilter.value;
        renderTargetList();
        setTargetActive(listRows()[0] || null, false);
    });
    ui.tsheet.addEventListener('keydown', function (e) {
        var rows = listRows();
        var i = rows.indexOf(ui.tlist.querySelector('.dl-nr.act'));
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setTargetActive(rows[Math.min(rows.length - 1, i + 1)] || null, true);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setTargetActive(rows[Math.max(0, i - 1)] || null, true);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            var a = ui.tlist.querySelector('.dl-nr.act');
            if (a) chooseTarget(a.getAttribute('data-key'), true);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation(); // the panel stays open
            closeTargets(true);
        }
    });
    // A press outside the list and the pill closes the list.
    document.addEventListener('pointerdown', function (e) {
        if (!targetsOpen()) return;
        var path = e.composedPath ? e.composedPath() : [];
        var btn = targetButton();
        if (path.indexOf(ui.tsheet) !== -1 || (btn && path.indexOf(btn) !== -1)) return;
        closeTargets(false);
    }, true);

    // --- Dialpad ---
    function typeDigit(d) {
        if (isActive() || dimmed) return;
        var cur = manual ? ui.display.value : '';
        setDisplay(cur + d, true);
    }

    // A press on 0 held LONG_PRESS_MS types + instead (as on the iPhone).
    var zeroHold = null;
    var zeroPlus = false;
    function endZeroHold() {
        if (zeroHold) { window.clearTimeout(zeroHold); zeroHold = null; }
    }
    ui.dialpad.addEventListener('pointerdown', function (e) {
        if (e.button !== undefined && e.button !== 0) return;
        var k = e.target.closest('.dl-key');
        zeroPlus = false;
        endZeroHold();
        if (!k || k.getAttribute('data-key') !== '0') return;
        zeroHold = window.setTimeout(function () {
            zeroHold = null;
            zeroPlus = true;
            typeDigit('+');
        }, LONG_PRESS_MS);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (type) {
        ui.dialpad.addEventListener(type, endZeroHold);
    });
    ui.dialpad.addEventListener('click', function (e) {
        var k = e.target.closest('.dl-key');
        if (!k) return;
        if (zeroPlus) { zeroPlus = false; return; } // the long press typed +
        typeDigit(k.getAttribute('data-key'));
    });
    ui.display.addEventListener('input', function () {
        if (target) dropRecord();
        manual = !!ui.display.value.trim();
        syncCallButton(); syncMatch(); syncDial();
    });
    ui.display.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !ui.call.disabled) { e.preventDefault(); placeCall(); }
        // Esc clears the number first; on an empty field it closes the
        // panel (the panel's own Escape handler).
        if (e.key === 'Escape' && ui.display.value) {
            e.preventDefault();
            e.stopPropagation();
            setDisplay('', true);
        }
    });
    ui.clearBtn.addEventListener('click', function () {
        setDisplay('', true);
        ui.display.focus();
    });
    // Backspace: a click deletes one digit; a press held LONG_PRESS_MS
    // clears the field (and its click then deletes nothing more).
    var backHold = null;
    var backCleared = false;
    function endBackHold() {
        if (backHold) { window.clearTimeout(backHold); backHold = null; }
    }
    ui.backspace.addEventListener('pointerdown', function (e) {
        if (e.button !== undefined && e.button !== 0) return;
        if (dimmed) return;
        backCleared = false;
        endBackHold();
        backHold = window.setTimeout(function () {
            backHold = null;
            backCleared = true;
            setDisplay('', true);
        }, LONG_PRESS_MS);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (type) {
        ui.backspace.addEventListener(type, endBackHold);
    });
    ui.backspace.addEventListener('click', function () {
        if (backCleared) { backCleared = false; return; }
        var d = digitsOf(ui.display.value);
        setDisplay(d.slice(0, -1), true);
    });

    // --- Placing a call ---
    function placeCall() {
        if (isActive()) return;
        var to = dialable(ui.display.value);
        if (!to) return;
        endWrap();
        var r = manual ? null : selRow();
        var person = r && r.p.id ? r.p : null; // the company main line names no contact
        var req = {
            to: to,
            entityId: target ? target.entityId : '',
            entityName: target ? target.entityName : '',
            entityType: target ? target.entityType : '',
            contactId: person ? person.id : '',
            contactName: person ? person.name : ''
        };
        // The call screen's contact title and account block (asset 38).
        callContact = { entityId: req.entityId, id: req.contactId, name: req.contactName, title: person ? person.title : '' };
        prefetchCallContext(req.entityId, req.entityType === 'contact' ? req.entityId : req.contactId);
        if (snap && snap.phase === 'ready') {
            send('dial', req);
            return;
        }
        // The phone frame is still starting: keep the request and send it
        // once the anchor reports ready.
        pending = { req: req, at: Date.now() };
        render(snap);
        window.setTimeout(function () {
            if (pending && Date.now() - pending.at >= PENDING_TIMEOUT_MS) {
                pending = null;
                showNote('error', 'The phone did not start. Reload the page, then try again.');
                render(snap);
            }
        }, PENDING_TIMEOUT_MS + 50);
    }

    ui.call.addEventListener('click', placeCall);

    // --- Menu (Search: filter and sort) ---
    // A menu button opens a role="menu": groups (role="group", a label, a
    // rule between) of menuitemradio items. Arrow keys, Home and End move
    // between items (across groups); Enter picks; Esc closes it and focus
    // goes back to its button; Tab, a click outside or a choice closes it.
    function menuItems(m) { return Array.prototype.slice.call(m.menu.querySelectorAll('.dl-mi')); }

    // groups: [{ key, label, active, items: [{ key, label, count }] }].
    function fillMenu(m, groups) {
        clear(m.menu);
        groups.forEach(function (g, gi) {
            if (gi) {
                var hr = document.createElement('hr');
                hr.className = 'dl-rule';
                hr.setAttribute('role', 'separator');
                m.menu.appendChild(hr);
            }
            var box = document.createElement('div');
            box.className = 'dl-mgroup';
            box.setAttribute('role', 'group');
            box.setAttribute('aria-label', g.label);
            var lbl = span('dl-mlabel', g.label);
            lbl.setAttribute('aria-hidden', 'true');
            box.appendChild(lbl);
            g.items.forEach(function (it) {
                var b = document.createElement('button');
                b.type = 'button';
                b.className = 'dl-mi';
                b.tabIndex = -1;
                b.setAttribute('role', 'menuitemradio');
                b.setAttribute('aria-checked', it.key === g.active ? 'true' : 'false');
                b.setAttribute('data-group', g.key);
                b.setAttribute('data-value', it.key);
                b.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON_CHECK + '</svg>';
                b.appendChild(span('', it.label));
                if (it.count != null) {
                    var em = document.createElement('em');
                    em.textContent = String(it.count);
                    b.appendChild(em);
                }
                box.appendChild(b);
            });
            m.menu.appendChild(box);
        });
    }

    function showMenu(m, focusLast) {
        if (openMenu && openMenu !== m) closeMenu(false);
        m.fill();
        m.menu.hidden = false;
        m.button.setAttribute('aria-expanded', 'true');
        openMenu = m;
        var items = menuItems(m);
        var checked = items.filter(function (b) { return b.getAttribute('aria-checked') === 'true'; })[0];
        var first = focusLast ? items[items.length - 1] : (checked || items[0]);
        if (first) first.focus();
    }

    function closeMenu(refocus) {
        var m = openMenu;
        if (!m) return;
        openMenu = null;
        m.menu.hidden = true;
        m.button.setAttribute('aria-expanded', 'false');
        if (refocus) m.button.focus();
    }

    function bindMenu(m) {
        m.button.addEventListener('click', function () {
            if (openMenu === m) closeMenu(true);
            else showMenu(m, false);
        });
        m.button.addEventListener('keydown', function (e) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                showMenu(m, e.key === 'ArrowUp');
            }
        });
        m.menu.addEventListener('click', function (e) {
            var b = e.target.closest('.dl-mi');
            if (!b) return;
            closeMenu(true);
            m.pick(b.getAttribute('data-group') || '', b.getAttribute('data-value') || '');
        });
        m.menu.addEventListener('keydown', function (e) {
            var items = menuItems(m);
            var i = items.indexOf(el.getRootNode().activeElement);
            var next = null;
            if (e.key === 'ArrowDown') next = items[(i + 1) % items.length];
            else if (e.key === 'ArrowUp') next = items[(i - 1 + items.length) % items.length];
            else if (e.key === 'Home') next = items[0];
            else if (e.key === 'End') next = items[items.length - 1];
            else if (e.key === 'Enter' && items[i]) {
                e.preventDefault();
                items[i].click();
                return;
            } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation(); // the menu closes, not the panel
                closeMenu(true);
                return;
            } else if (e.key === 'Tab') {
                closeMenu(false);
                return;
            }
            if (next) {
                e.preventDefault();
                next.focus();
            }
        });
    }

    // A press outside the open menu and its button closes it.
    document.addEventListener('pointerdown', function (e) {
        if (!openMenu) return;
        var path = e.composedPath ? e.composedPath() : [];
        if (path.indexOf(openMenu.menu) !== -1 || path.indexOf(openMenu.button) !== -1) return;
        closeMenu(false);
    }, true);

    // --- Search tab ---
    // One filter icon, one menu: Show (type, with counts) and Sort by.
    var filterMenu = {
        button: ui.filter,
        menu: ui.filterMenu,
        fill: function () {
            fillMenu(filterMenu, [
                { key: 'type', label: 'Show', active: searchType, items: FILTERS.map(function (f) {
                    return { key: f[0], label: f[1], count: countOf(f[0]) };
                }) },
                { key: 'sort', label: 'Sort by', active: searchSort, items: SORTS.map(function (x) {
                    return { key: x[0], label: x[1] };
                }) }
            ]);
        },
        pick: function (group, value) {
            if (group === 'sort') {
                searchSort = value;
                writeLocal(SORT_KEY, value);
            } else {
                searchType = value;
                renderFilter();
            }
            renderResults();
        }
    };
    bindMenu(filterMenu);

    // Counts: the whole book until the rep types, then the results.
    function countOf(type) {
        var c = shownCounts;
        if (!c) return null;
        var v = c[type || 'total'];
        return v == null ? null : v;
    }

    // The filter icon carries a dot while Show is not All.
    function renderFilter() {
        ui.filterDot.hidden = !searchType;
    }

    function setCounts(counts) {
        shownCounts = counts || null;
        if (openMenu === filterMenu) filterMenu.fill();
    }

    function countRows(rows) {
        var c = { total: rows.length, customer: 0, prospect: 0, lead: 0 };
        rows.forEach(function (r) { if (c[r.type] != null) c[r.type]++; });
        return c;
    }

    // Client-side sort: newest first by lastActivityAt / lastCalledAt (rows
    // without one go last), or by name. Ties keep the RESTlet's order.
    function sortRows(rows) {
        var field = searchSort === 'lastCalled' ? 'lastCalledAt' : searchSort === 'recent' ? 'lastActivityAt' : '';
        var keyed = rows.map(function (r, i) { return { r: r, i: i, t: field ? Date.parse(r[field] || '') : 0 }; });
        keyed.sort(function (a, b) {
            if (field) {
                var at = isNaN(a.t) ? -Infinity : a.t;
                var bt = isNaN(b.t) ? -Infinity : b.t;
                if (at !== bt) return bt - at;
            } else {
                var n = String(a.r.companyName || '').localeCompare(String(b.r.companyName || ''), undefined, { sensitivity: 'base' });
                if (n) return n;
            }
            return a.i - b.i;
        });
        return keyed.map(function (k) { return k.r; });
    }

    function searchItem(r) {
        var li = document.createElement('li');
        li.className = 'dl-card';
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'dl-row';
        var icon = document.createElement('span');
        icon.className = 'dl-ricon';
        icon.innerHTML = USER_SVG(16);
        var main = document.createElement('span');
        main.className = 'dl-row-main';
        main.appendChild(span('dl-row-name', r.companyName));
        var type = TYPE_NAME[r.type] || '';
        var detail = r.contactName || formatPhone(r.phone) || r.phone || 'No phone on file';
        main.appendChild(span('dl-row-sub', [type, detail].filter(Boolean).join(' · ')));
        b.appendChild(icon);
        b.appendChild(main);
        prefetchOnHover(b, r.id, r.type);
        b.addEventListener('click', function () {
            loadEntity({ entityId: r.id, entityName: r.companyName, entityType: r.type, phone: r.phone });
            setTab('dial');
            ui.display.focus();
        });
        li.appendChild(b);
        if (r.phone) {
            li.appendChild(rowCall('Call ' + r.companyName, function () {
                callBack({ name: r.companyName || '', number: r.phone, entityId: r.id, entityType: r.type });
            }));
        }
        return li;
    }

    // rows: the new list to draw from; left out = redraw the last one
    // (filter or sort changed).
    function renderResults(rows) {
        if (rows) shownRows = rows;
        clear(ui.results);
        var list = searchType ? shownRows.filter(function (r) { return r.type === searchType; }) : shownRows;
        sortRows(list).forEach(function (r) { ui.results.appendChild(searchItem(r)); });
        ui.searchMsg.className = 'dl-msg dl-search-msg';
        ui.searchMsg.textContent = list.length ? '' : 'No matches.';
    }

    function loadSuggested() {
        suggested = [];
        ui.searchMsg.textContent = 'Loading…';
        api('softphoneBookCounts').then(function (d) {
            bookCounts = d;
            if (!ui.query.value.trim()) setCounts(bookCounts);
        }).catch(function () { /* row counts below stand in */ });
        api('softphoneSuggested', { limit: 30 }).then(function (d) {
            suggested = d.rows || [];
            if (ui.query.value.trim()) return;
            if (!bookCounts) setCounts(countRows(suggested));
            renderResults(suggested);
        }).catch(function (err) {
            ui.searchMsg.className = 'dl-msg dl-search-msg err';
            ui.searchMsg.textContent = 'Could not load your book: ' + err.message;
        });
    }

    function runSearch() {
        var query = ui.query.value.trim();
        var seq = ++searchSeq;
        ui.queryClear.hidden = !ui.query.value;
        if (!query) {
            setCounts(bookCounts || countRows(suggested || []));
            renderResults(suggested || []);
            return;
        }
        ui.searchMsg.className = 'dl-msg dl-search-msg';
        ui.searchMsg.textContent = 'Searching…';
        api('softphoneSearch', { query: query, typeFilter: '', limit: 20 }).then(function (d) {
            if (seq !== searchSeq) return;
            var rows = d.rows || [];
            setCounts(countRows(rows));
            renderResults(rows);
        }).catch(function (err) {
            if (seq !== searchSeq) return;
            shownRows = [];
            clear(ui.results);
            ui.searchMsg.className = 'dl-msg dl-search-msg err';
            ui.searchMsg.textContent = 'Search failed: ' + err.message;
        });
    }

    ui.query.addEventListener('input', function () {
        ui.queryClear.hidden = !ui.query.value;
        window.clearTimeout(searchTimer);
        searchTimer = window.setTimeout(runSearch, SEARCH_DEBOUNCE_MS);
    });
    ui.queryClear.addEventListener('click', function () {
        ui.query.value = '';
        window.clearTimeout(searchTimer);
        runSearch();
        ui.query.focus();
    });
    // Esc in a search field clears it first; on an empty field it closes
    // the panel (the panel's own Escape handler).
    function escClears(input, onClear) {
        input.addEventListener('keydown', function (e) {
            if (e.key !== 'Escape' || !input.value) return;
            e.preventDefault();
            e.stopPropagation();
            input.value = '';
            onClear();
        });
    }
    escClears(ui.query, function () { window.clearTimeout(searchTimer); runSearch(); });
    renderFilter();

    // --- Recents tab ---
    // Missed = status 'Missed' or a voicemail (the portlet's isMissedCall
    // rule), or the RESTlet's outcome says so.
    function isMissedRow(r) {
        return r.callStatus === 'Missed' || r.voicemail === true || r.outcome === 'missed' || r.outcome === 'voicemail';
    }

    function lastTen(n) { return digitsOf(n).replace('+', '').slice(-10); }

    function dirIcon(kind) {
        var v = DIR_VIEW[kind];
        var i = document.createElement('span');
        i.className = 'dl-dir dl-dir-' + kind;
        i.setAttribute('role', 'img');
        i.setAttribute('aria-label', v.label);
        i.title = v.label;
        i.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" ' + STROKE2 + '><path d="' + v.path + '"></path></svg>';
        return i;
    }

    function ago(at) {
        var mins = Math.floor((Date.now() - at) / 60000);
        if (mins < 1) return 'just now';
        return mins < 60 ? mins + ' min ago' : Math.floor(mins / 60) + ' h ago';
    }

    // Load the call's number on Dial and dial it through the normal path.
    function callBack(c) {
        if (!c || !c.number) return;
        endWrap();
        if (c.entityId) {
            loadEntity({ entityId: c.entityId, entityName: c.name, entityType: c.entityType, phone: c.number });
        } else {
            clearEntity();
            setDisplay(c.number, true);
        }
        setTab('dial');
        placeCall();
        focusPanel('call');
    }

    // One flat Recents row: direction arrow, name (the number in mono when
    // no record), Missed / Voicemail in coral text (no outcome chips: summary
    // state lives on the Phone Call and in Call Central; 2026-11-13) and time; a green Call (missed: the
    // 28 px Call back) on every row with a number. A call with no record
    // (row.unknown, DESIGN.md §6): the number as the name, "Not in
    // NetSuite" under it, and a small "Add" (the sheet, with the Phone Call).
    function recentItem(r, time) {
        var missed = isMissedRow(r);
        var kind = missed ? 'missed' : (r.direction === 'inbound' ? 'in' : 'out');
        var number = formatPhone(r.phone) || r.phone || '';
        var unknown = r.unknown === true && !r.pending && !addedKeys[lastTen(r.phone)];
        var name = (unknown ? '' : r.companyName) || number || 'Unknown';
        var li = document.createElement('li');
        li.className = 'dl-recent';
        li.setAttribute('data-dir', kind);
        if (r.pending) li.setAttribute('data-pending', '1');
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'dl-row';
        var main = document.createElement('span');
        main.className = 'dl-row-main';
        main.appendChild(span('dl-row-name' + (r.companyName && !unknown ? '' : ' mono'), name));
        var sub = span('dl-row-sub', '');
        if (unknown) sub.appendChild(span('dl-row-unknown', 'Not in NetSuite'));
        else if (missed || r.pending) sub.appendChild(span('dl-row-miss', r.voicemail === true || r.outcome === 'voicemail' ? 'Voicemail' : 'Missed'));
        var when = r.pending ? ago(r.at) : time;
        if (when) sub.appendChild(span('dl-row-time', when));
        main.appendChild(sub);
        b.appendChild(dirIcon(kind));
        b.appendChild(main);
        prefetchOnHover(b, r.companyId, r.entityType || 'customer');
        b.addEventListener('click', function () {
            loadEntity({ entityId: r.companyId, entityName: r.companyName, entityType: r.entityType || 'customer', phone: r.phone });
            setTab('dial');
            ui.display.focus();
        });
        li.appendChild(b);
        if (unknown && cfg.restletUrl && r.phone) {
            var add = document.createElement('button');
            add.type = 'button';
            add.className = 'dl-ghost dl-recent-add';
            add.textContent = 'Add';
            add.setAttribute('aria-label', 'Add ' + number + ' to NetSuite');
            add.addEventListener('click', function () {
                openAdd({ phone: r.phone, phoneCallId: r.id || '', trigger: add });
            });
            li.appendChild(add);
        }
        if (r.phone) {
            var dial = function () {
                callBack({ name: r.companyName || '', number: r.phone, entityId: r.companyId || '', entityType: r.entityType || 'customer' });
            };
            li.appendChild(missed ? callBackButton(name, dial) : rowCall('Call ' + name, dial));
        }
        return li;
    }

    // Recents search: name, company, contact or number (client side).
    function recentMatches(r, query) {
        if (!query) return true;
        var text = [r.companyName, r.contactName].join(' ').toLowerCase();
        if (text.indexOf(query.toLowerCase()) !== -1) return true;
        var digits = query.replace(/[^0-9]/g, '');
        return digits.length >= 3 && digitsOf(r.phone).indexOf(digits) !== -1;
    }

    // The newest missed call (missedUnseen.last) stays on top as a pending
    // row until the reconciled Phone Call (same number, start no earlier
    // than PENDING_MATCH_MS before the miss) is in the list.
    function missedLogged(p, rows) {
        var want = lastTen(p.caller.number);
        return !!want && rows.some(function (r) {
            var t = Date.parse(r.startedAt || '');
            return lastTen(r.phone) === want && !isNaN(t) && t >= p.at - PENDING_MATCH_MS;
        });
    }

    // Day groups (Today / Yesterday / date), newest first; the pending
    // missed row heads Today.
    function renderRecents() {
        var rows = recentRows || [];
        if (pendingMissed && recentRows && missedLogged(pendingMissed, rows)) pendingMissed = null;
        var query = ui.recentQuery.value.trim();
        var list = rows.slice();
        if (pendingMissed) {
            var c = pendingMissed.caller;
            list.unshift({
                pending: true, at: pendingMissed.at, callStatus: 'Missed', direction: 'inbound', voicemail: false,
                startedAt: new Date(pendingMissed.at).toISOString(),
                companyId: c.entityId || '', companyName: c.name || '', entityType: c.entityType || '', phone: c.number || ''
            });
        }
        var shown = list.filter(function (r) { return recentMatches(r, query); });
        clear(ui.recents);
        groupByDay(shown, function (r) { return whenOf(r.startedAt, r.date, r.timeOfDay); }).forEach(function (g) {
            var ul = dayGroup(ui.recents, g.label);
            g.rows.forEach(function (x) { ul.appendChild(recentItem(x.r, x.time)); });
        });
        if (!recentRows) return;
        ui.recentMsg.className = 'dl-msg dl-recent-msg';
        ui.recentMsg.textContent = shown.length ? '' : (list.length ? 'No matches.' : 'No calls in the last 7 days.');
    }

    ui.recentQuery.addEventListener('input', renderRecents);
    escClears(ui.recentQuery, renderRecents);

    function loadRecents() {
        recentsLoaded = true;
        recentsAt = Date.now();
        var seq = ++recentsSeq;
        ui.recentMsg.className = 'dl-msg dl-recent-msg';
        if (!recentRows) ui.recentMsg.textContent = 'Loading…';
        api('softphoneRecents', { dateRange: 'last7days', limit: 50 }).then(function (d) {
            if (seq !== recentsSeq) return;
            recentRows = d.rows || [];
            renderRecents();
        }).catch(function (err) {
            if (seq !== recentsSeq) return;
            recentsLoaded = false;
            ui.recentMsg.className = 'dl-msg dl-recent-msg err';
            ui.recentMsg.textContent = 'Could not load recent calls: ' + err.message;
        });
    }

    // --- Voicemail (header button + view) ---
    // Unheard: `at` newer than the seen mark. The RESTlet may name the
    // employee (employeeId); without it the mark is per browser.
    function vmKey() { return VM_SEEN_PREFIX + (vmEmployee || 'me'); }

    function vmTime(r) { return Date.parse((r && r.at) || ''); }

    function vmSeenMark() { return Date.parse(readLocal(vmKey()) || ''); }

    // seen: a seen mark in ms (NaN = none yet: every voicemail is unheard).
    function isUnheard(r, seen) {
        var t = vmTime(r);
        return !isNaN(t) && (isNaN(seen) || t > seen);
    }

    function vmUnheard() {
        if (!vmRows) return 0;
        var seen = vmSeenMark();
        return vmRows.filter(function (r) { return isUnheard(r, seen); }).length;
    }

    function renderVmBadge() {
        var n = vmUnheard();
        ui.vmBadge.hidden = !n;
        ui.vmBadge.textContent = n ? String(n) : '';
        ui.vm.setAttribute('aria-label', n ? 'Voicemail, ' + n + ' new' : 'Voicemail');
    }

    // The view is open: every voicemail in it is heard (the mark is the
    // newest `at`, so one that arrives later still counts as new). The
    // first mark of a visit keeps the mark from before it (vmShownSeen):
    // rows that were unheard keep their dot until the view closes.
    function markVmSeen() {
        var best = NaN;
        var newest = '';
        (vmRows || []).forEach(function (r) {
            var t = vmTime(r);
            if (!isNaN(t) && (isNaN(best) || t > best)) { best = t; newest = String(r.at); }
        });
        var seen = vmSeenMark();
        if (vmRows && vmShownSeen === null) vmShownSeen = seen;
        if (newest && (isNaN(seen) || best > seen)) writeLocal(vmKey(), newest);
        renderVmBadge();
        if (vmRows) renderVm();
    }

    // One voicemail, two columns. Left: the name (a coral dot before it
    // while unheard) and the AI brief. Right: time · length, then Open
    // record (the Phone Call: the recording is deleted after
    // transcription, so there is nothing to play) and Call back.
    function vmItem(r, time, seen) {
        var number = formatPhone(r.phone) || r.phone || '';
        var known = !!(r.companyName || r.contactName);
        var name = r.companyName || r.contactName || number || 'Unknown caller';
        var li = document.createElement('li');
        li.className = 'dl-vm-item';
        var left = document.createElement('div');
        left.className = 'dl-vm-l';
        var who = document.createElement('div');
        who.className = 'dl-vm-name';
        if (isUnheard(r, seen)) {
            var dot = span('dl-vm-dot', '');
            dot.setAttribute('role', 'img');
            dot.setAttribute('aria-label', 'Unheard');
            who.appendChild(dot);
        }
        who.appendChild(span('dl-row-name' + (known ? '' : ' mono'), name));
        left.appendChild(who);
        if (r.brief) {
            var p = document.createElement('p');
            p.className = 'dl-vm-brief';
            p.textContent = String(r.brief);
            left.appendChild(p);
        }
        li.appendChild(left);
        var right = document.createElement('div');
        right.className = 'dl-vm-r';
        var meta = [time, lengthLabel(r.durationSec)].filter(Boolean).join(' · ');
        if (meta) right.appendChild(span('dl-vm-meta', meta));
        var acts = document.createElement('div');
        acts.className = 'dl-vm-acts';
        if (r.phoneCallId) {
            var a = document.createElement('a');
            a.className = 'dl-vm-open';
            a.href = '/app/crm/calendar/call.nl?id=' + encodeURIComponent(r.phoneCallId);
            a.target = '_top';
            a.title = 'Open record';
            a.setAttribute('aria-label', 'Open record for ' + name);
            a.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" ' + STROKE2 + '>' + ICON_OPEN + '</svg>';
            acts.appendChild(a);
        }
        if (r.phone) {
            acts.appendChild(callBackButton(name, function () {
                setVmOpen(false);
                callBack({ name: r.companyName || '', number: r.phone, entityId: r.companyId || '', entityType: r.entityType || 'customer' });
            }));
        }
        if (acts.firstChild) right.appendChild(acts);
        if (right.firstChild) li.appendChild(right);
        return li;
    }

    function renderVm() {
        clear(ui.vmList);
        var rows = vmRows || [];
        var seen = vmShownSeen !== null ? vmShownSeen : vmSeenMark();
        groupByDay(rows, function (r) { return whenOf(r.at); }).forEach(function (g) {
            var ul = dayGroup(ui.vmList, g.label);
            g.rows.forEach(function (x) { ul.appendChild(vmItem(x.r, x.time, seen)); });
        });
        if (!vmRows) return;
        ui.vmMsg.className = 'dl-msg dl-vm-msg';
        ui.vmMsg.textContent = rows.length ? '' : 'No voicemail in the last 30 days.';
    }

    function loadVoicemails() {
        if (!cfg.restletUrl) return;
        vmAt = Date.now();
        var seq = ++vmSeq;
        if (!vmRows) {
            ui.vmMsg.className = 'dl-msg dl-vm-msg';
            ui.vmMsg.textContent = 'Loading…';
        }
        api('softphoneVoicemails', { limit: VM_LIMIT, days: 30 }).then(function (d) {
            if (seq !== vmSeq) return;
            if (d.employeeId != null && String(d.employeeId) !== '') vmEmployee = String(d.employeeId);
            vmRows = Array.isArray(d.rows) ? d.rows : [];
            if (vmOpen && panelShown) markVmSeen();
            else {
                renderVm();
                renderVmBadge();
            }
        }).catch(function (err) {
            if (seq !== vmSeq) return;
            // The badge keeps its last count; the view says why.
            ui.vmMsg.className = 'dl-msg dl-vm-msg err';
            ui.vmMsg.textContent = 'Could not load voicemail: ' + err.message;
        });
    }

    function loadVoicemailsSoon() {
        if (!vmRows || Date.now() - vmAt >= VM_MIN_GAP_MS) loadVoicemails();
    }

    // Every VM_REFRESH_MS while the panel shows (not while the tab is hidden).
    function scheduleVm() {
        window.clearTimeout(vmTimer);
        vmTimer = window.setTimeout(function () {
            vmTimer = null;
            if (!panelShown) return;
            if (!document.hidden) loadVoicemails();
            scheduleVm();
        }, VM_REFRESH_MS);
    }

    function setVmOpen(open) {
        vmOpen = open;
        ui.vm.setAttribute('aria-pressed', open ? 'true' : 'false');
        if (open) {
            audioOpen = false;
            addOpen = false;
            ui.gear.setAttribute('aria-pressed', 'false');
            closeMenu(false);
            loadVoicemailsSoon();
            markVmSeen();
        }
        render(snap);
    }

    ui.vm.hidden = !cfg.restletUrl;
    ui.vm.addEventListener('click', function () {
        setVmOpen(!vmOpen);
        if (vmOpen) ui.vmBack.focus();
    });
    ui.vmBack.addEventListener('click', function () {
        setVmOpen(false);
        ui.vm.focus();
    });
    document.addEventListener('visibilitychange', function () {
        if (!document.hidden && panelShown && Date.now() - vmAt >= VM_REFRESH_MS) loadVoicemails();
    });
    // Another tab marked them heard.
    window.addEventListener('storage', function (e) {
        if (e.key === vmKey()) renderVmBadge();
    });

    // --- In-call ---
    function clockOf(s) {
        var m = Math.floor(s / 60);
        return (m < 10 ? '0' : '') + m + ':' + (s % 60 < 10 ? '0' : '') + (s % 60);
    }
    // The 40 px slot shows the timer only while it says 'timer'.
    function tickLive() {
        if (ui.liveTime.getAttribute('data-slot') !== 'timer') return;
        if (!snap || !snap.startedAt) { ui.liveTime.textContent = ''; return; }
        ui.liveTime.textContent = clockOf(Math.max(0, Math.floor((Date.now() - snap.startedAt) / 1000)));
    }

    // --- Call screen (DESIGN.md §4, asset 38; ringing asset 40) ---
    // One screen for an outbound call (dialing / ringing / connected /
    // reconnecting) and an inbound call, ringing (asset 40: "Ringing…",
    // Decline · — · Answer) and once answered. The account block of a
    // ringing caller loads as soon as the caller is matched (the same
    // recordCache key as the connected screen, so Answer shows it at once).
    // After a call it stays as the wrap-up for WRAP_MS (or until the rep
    // acts): "Call ended · 03:12", Summary, Call back and Done.
    var WRAP_MS = 8000;
    var SLOT_TEXT = { calling: 'Calling…', incoming: 'Ringing…', answering: 'Connecting…', reconnecting: 'Reconnecting…' };
    var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    // Recent activity icons (16 px stroke): call, email, order, task, event.
    var ACT_ICON = {
        call: ICON_PHONE,
        email: '<rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="M3 7l9 6 9-6"></path>',
        order: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"></path><path d="M14 3v5h5M9 13h6M9 17h6"></path>',
        task: '<circle cx="12" cy="12" r="9"></circle><path d="M8 12l3 3 5-6"></path>',
        event: '<rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M3 10h18M8 3v4M16 3v4"></path>'
    };
    var callContact = null; // { entityId, id, name, title }: the contact this panel dialled
    var lastInfo = null;    // the live call's screen (kept for the wrap-up)
    var wrapUp = null;      // { info, seconds, timed, touched, phoneCallId } while the wrap-up shows
    var wrapTimer = null;
    var wrapLogSkip = false; // the ended call's saved / skipped note does not show
    var accKey = null;      // 'entity:contact' the account block is for ('' = none)
    var accState = '';      // '' | 'loading' | 'ok' | 'error'
    var accData = null;

    // The contact the call context is for: a contact record is its own.
    function contextContact(type, id, row) {
        return type === 'contact' ? String(id || '') : (row && row.p.id) || '';
    }

    // "(281) 555-0142": the display form, without +1 for a NANP number.
    function callNumber(n) {
        var d = String(n || '').replace(/[^0-9]/g, '');
        if (d.length === 11 && d.charAt(0) === '1') return formatPhone(d.slice(1));
        return formatPhone(n) || String(n || '');
    }

    // The contact on the line (id, title), from the loaded record's
    // contacts or the contact this panel dialled.
    function callParty(entityId, contactName) {
        if (target && entityId && target.entityId === entityId && contactName) {
            var p = target.parties.filter(function (x) { return !x.isCompany && x.name === contactName; })[0];
            if (p) return { id: p.id, title: p.title };
        }
        var c = callContact;
        if (c && c.id && c.entityId === entityId && (!contactName || c.name === contactName)) return { id: c.id, title: c.title || '' };
        return { id: '', title: '' };
    }

    // What the call screen shows for the live call.
    function liveInfo() {
        var c = snap.caller || {};
        var inbound = snap.direction === 'inbound';
        var entityName = String(snap.entityName || (inbound ? c.name : '') || '');
        var contactName = String(snap.contactName || '');
        var entityId = String(snap.entityId || (inbound ? c.entityId : '') || '');
        var entityType = String(snap.entityType || (inbound ? c.entityType : '') || '').toLowerCase();
        var party = callParty(entityId, contactName);
        var name = entityName || contactName;
        return {
            known: !!name,
            name: name,
            contact: entityName && contactName && contactName !== entityName ? contactName : '',
            title: party.title,
            raw: String((inbound && c.number) || snap.number || ''),
            entityId: entityId,
            entityType: entityType,
            contactId: entityType === 'contact' ? entityId : party.id,
            inbound: inbound,
            startedAt: snap.startedAt || null
        };
    }

    function slotOf(phase) {
        if (phase === 'connected') return 'timer';
        if (phase === 'reconnecting' || phase === 'answering') return phase;
        // Incoming with Answer sent (not connected yet): "Connecting…".
        if (phase === 'incoming') return answerSent ? 'answering' : 'incoming';
        return 'calling';
    }

    function renderLive() {
        var incoming = isIncoming();
        // Ringing: the call screen with Decline · — · Answer. After Answer
        // the same screen goes on (Connecting…, then the timer).
        var ringing = incoming && !answerSent;
        ui.live.classList.add('cs');
        ui.ringActs.forEach(function (a) { a.hidden = !ringing; });
        ui.callActs.forEach(function (a) { a.hidden = ringing; });
        ui.wrapActs.forEach(function (a) { a.hidden = true; });
        ui.wrapCall.parentNode.parentNode.classList.remove('dl-two');
        lastInfo = liveInfo();
        paintCall(lastInfo, slotOf(snap.phase));
        if (ringing) {
            var who = lastInfo.known ? lastInfo.name : (callNumber(lastInfo.raw) || 'Unknown caller');
            ui.answer.setAttribute('aria-label', 'Answer call from ' + who);
            ui.decline.setAttribute('aria-label', 'Decline call from ' + who);
        }
        tickLive();
        if (snap.startedAt && !liveTimer) liveTimer = window.setInterval(tickLive, 1000);
        if (!snap.startedAt && liveTimer) { window.clearInterval(liveTimer); liveTimer = null; }

        // Call quality, one amber line under the timer ('' clears it). A
        // constant mic level is normal while muted.
        var warn = !incoming && snap.callWarning ? CALL_WARNING_TEXT[snap.callWarning] || '' : '';
        if (warn === WARN_MIC && snap.muted) warn = '';
        ui.liveWarn.textContent = warn;
        ui.liveWarn.hidden = !warn;

        ui.mute.disabled = !TALKING[snap.phase];
        ui.mute.setAttribute('aria-pressed', snap.muted ? 'true' : 'false');
        ui.mute.setAttribute('aria-label', snap.muted ? 'Unmute' : 'Mute');
        ui.mute.querySelector('svg').innerHTML = snap.muted ? ICON_MIC_OFF : ICON_MIC;
        ui.muteLabel.textContent = snap.muted ? 'Unmute' : 'Mute';
        ui.keys.disabled = !TALKING[snap.phase];
    }

    // The identity block, the slot and the account block. slot: 'calling'
    // | 'incoming' | 'answering' | 'timer' | 'reconnecting' | 'ended' (wrap-up).
    function paintCall(info, slot) {
        var number = callNumber(info.raw);
        ui.liveName.textContent = info.known ? info.name : (number || 'Unknown caller');
        ui.liveName.classList.toggle('mono', !info.known && !!number);
        var sub = info.known ? [info.contact, info.title].filter(function (x) { return x; }).join(' · ') : 'Not in NetSuite';
        ui.liveSub.textContent = sub;
        ui.liveSub.hidden = !sub;
        ui.liveNum.textContent = info.known ? number : '';
        ui.liveNum.hidden = !ui.liveNum.textContent;
        // An unknown number: "Add to NetSuite" (the existing sheet).
        liveAddNum = !info.known && canAdd(info.raw) ? info.raw : '';
        ui.liveAdd.hidden = !liveAddNum;
        if (liveAddNum) ui.liveAdd.setAttribute('aria-label', 'Add ' + (formatPhone(liveAddNum) || liveAddNum) + ' to NetSuite');
        ui.liveTime.setAttribute('data-slot', slot);
        if (slot === 'ended') {
            ui.liveTime.textContent = 'Call ended' + (wrapUp && wrapUp.timed ? ' · ' + clockOf(wrapUp.seconds) : '');
        } else if (slot !== 'timer') {
            ui.liveTime.textContent = SLOT_TEXT[slot] || '';
        }
        // A ringing unknown caller: one quiet line, no account block.
        ui.liveNone.hidden = !(slot === 'incoming' && !info.known);
        renderAccount(info);
    }

    // --- Account block (softphoneCallContext through recordCache) ---
    function renderAccount(info) {
        var key = info.known && info.entityId ? info.entityId + ':' + (info.contactId || '') : '';
        if (key !== accKey) {
            accKey = key;
            accData = null;
            accState = key ? 'loading' : '';
            if (key) {
                var e = callContext(info.entityId, info.contactId);
                if (e.done) {
                    accState = 'ok';
                    accData = e.data;
                } else {
                    e.p.then(function (d) {
                        if (accKey !== key) return;
                        accState = 'ok';
                        accData = d;
                        fillAcc();
                        syncAcc();
                        // The incoming card's hint (client) reads it too.
                        if (typeof host.contextChanged === 'function') host.contextChanged();
                    }, function () {
                        if (accKey !== key) return;
                        accState = 'error'; // the block hides quietly
                        syncAcc();
                    });
                }
            }
            fillAcc();
        }
        syncAcc();
    }

    // The ringing caller's account context once loaded (else null), for
    // the incoming card's hint line in the client (asset 40).
    host.ringContext = function () {
        return isIncoming() && accKey && accState === 'ok' ? accData : null;
    };

    // Which parts show: the keypad replaces the block; an error hides it;
    // the wrap-up puts Summary in the grid's place.
    function syncAcc() {
        var wrapping = !!wrapUp;
        var has = !!accKey && (accState === 'loading' || accState === 'ok');
        ui.acc.hidden = !ui.dtmf.hidden || !(has || wrapping);
        ui.accSum.hidden = !wrapping;
        ui.kpis.hidden = wrapping || !has;
        ui.accAct.hidden = !has || !ui.accActs.children.length;
        ui.accFu.hidden = !has || !ui.accFus.children.length;
        fitAcc();
    }

    // Everything stays above the controls (12 px clear: the body's bottom
    // padding): Recent activity rows go from the end first, never below 2.
    function fitAcc() {
        var rows = Array.prototype.slice.call(ui.accActs.children);
        rows.forEach(function (r) { r.hidden = false; });
        if (ui.live.hidden || ui.acc.hidden || ui.accAct.hidden) return;
        var body = ui.liveBody;
        var n = rows.length;
        while (n > 2 && body.scrollHeight > body.clientHeight) rows[--n].hidden = true;
    }

    // The body's height can change (the panel capped by the screen) and
    // the font can arrive after the first fit: fit again then.
    if (typeof window.ResizeObserver === 'function') {
        try { new window.ResizeObserver(function () { fitAcc(); }).observe(ui.liveBody); } catch (e) { /* no observer: fit on render */ }
    }
    try { if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitAcc, function () {}); } catch (e) { /* no font API */ }

    function setKpi(node, text, loading) {
        clear(node);
        node.classList.remove('none');
        node.removeAttribute('title');
        if (loading) { node.appendChild(span('dl-ph', '')); return; }
        // Nothing to say: "None" (never "—").
        node.textContent = text || 'None';
        node.classList.toggle('none', !text);
        if (text) node.title = text;
    }

    function num(v) { var n = Number(v); return v == null || v === '' || isNaN(n) ? null : n; }

    // "$21.6k" from $10,000 (one decimal), "$1.2M" from $1,000,000.
    function compactMoney(n) {
        if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
        if (n >= 1e4) return '$' + (n / 1e3).toFixed(1) + 'k';
        return money(n);
    }

    function daysText(n) { return n === 0 ? 'Today' : n === 1 ? '1 day' : n + ' days'; }

    // "Nov 15" from 'YYYY-MM-DD…' (the date as written, no time zone shift).
    function dueText(due) {
        var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(due || ''));
        if (m) return MONTHS[Number(m[2]) - 1] + ' ' + Number(m[3]);
        var t = Date.parse(String(due || ''));
        if (isNaN(t)) return '';
        var d = new Date(t);
        return MONTHS[d.getMonth()] + ' ' + d.getDate();
    }

    function accRow(icon, text, right) {
        var li = document.createElement('li');
        li.className = 'dl-acc-row';
        li.appendChild(icon);
        var t = span('dl-acc-t', text);
        if (text) t.title = text;
        li.appendChild(t);
        if (right) li.appendChild(span('dl-acc-age', right));
        return li;
    }

    function actIcon(kind) {
        var i = span('dl-acc-ic', '');
        i.setAttribute('aria-hidden', 'true');
        var path = ACT_ICON[kind];
        i.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" ' + STROKE + '>' + (path || '') + '</svg>';
        return i;
    }

    function fillAcc() {
        clear(ui.accActs);
        clear(ui.accFus);
        var loading = accState === 'loading';
        var d = accData || {};
        // Outstanding: full dollars; compact from $100,000 (the cell's width).
        var o = d.outstanding || {};
        var sum = num(o.sum);
        setKpi(ui.kpiOut, sum ? (sum >= 1e5 ? compactMoney(sum) : money(sum)) : '', loading);
        var overdue = loading ? 0 : num(o.overdueCount) || 0;
        ui.kpiDot.hidden = !(overdue > 0);
        if (overdue > 0) {
            var oldest = num(o.oldestDays);
            var why = overdue + (overdue === 1 ? ' invoice' : ' invoices') + ' overdue'
                + (oldest != null ? ', oldest ' + oldest + (oldest === 1 ? ' day' : ' days') : '');
            ui.kpiDot.title = why;
            ui.kpiDot.setAttribute('role', 'img');
            ui.kpiDot.setAttribute('aria-label', why);
        }
        var touch = num(d.lastTouchDays);
        setKpi(ui.kpiTouch, touch != null && touch >= 0 ? daysText(touch) : '', loading);
        var ord = d.orders90 || {};
        var count = num(ord.count) || 0;
        setKpi(ui.kpiOrders, count > 0 ? compactMoney(num(ord.total) || 0) : '', loading);

        if (loading) {
            for (var i = 0; i < 2; i++) {
                var ph = document.createElement('li');
                ph.className = 'dl-acc-row dl-acc-ph';
                ph.setAttribute('aria-hidden', 'true');
                ph.appendChild(span('dl-ph', ''));
                ui.accActs.appendChild(ph);
            }
            return;
        }
        (Array.isArray(d.activity) ? d.activity : []).forEach(function (a) {
            if (!a || !a.text) return;
            var age = num(a.ageDays);
            ui.accActs.appendChild(accRow(actIcon(String(a.kind || '')), String(a.text), age == null ? '' : age === 0 ? 'Today' : age + 'd'));
        });
        var fus = (Array.isArray(d.followUps) ? d.followUps : []).filter(function (f) { return f && f.title; });
        ui.accFuLbl.textContent = 'Follow-ups · ' + fus.length;
        fus.forEach(function (f) {
            var ring = span('dl-acc-ring', '');
            ring.setAttribute('aria-hidden', 'true');
            ui.accFus.appendChild(accRow(ring, String(f.title), dueText(f.due)));
        });
    }

    // --- Wrap-up ---
    // The call ended: stay on the call screen. Not for an inbound call that
    // never connected (a missed call keeps its note).
    function startWrap(info) {
        endWrap();
        if (!info || (info.inbound && !info.startedAt)) return false;
        wrapUp = {
            info: info,
            timed: !!info.startedAt,
            seconds: info.startedAt ? Math.max(0, Math.floor((Date.now() - info.startedAt) / 1000)) : 0,
            touched: false,
            phoneCallId: '',
            fresh: true
        };
        wrapLogSkip = true;
        wrapTimer = window.setTimeout(function () {
            wrapTimer = null;
            if (wrapUp && !wrapUp.touched) finishWrap();
        }, WRAP_MS);
        return true;
    }

    // Drop the wrap-up (a new call, Call back, a tab or record picked).
    function endWrap() {
        window.clearTimeout(wrapTimer);
        wrapTimer = null;
        stopStl();
        if (!wrapUp) return false;
        wrapUp = null;
        accKey = null;
        return true;
    }

    // Done (or WRAP_MS untouched): Dial with the record loaded.
    function finishWrap() {
        var w = wrapUp;
        if (!w) return;
        var hadFocus = ui.live.contains(el.getRootNode().activeElement);
        var log = snap && snap.lastLog;
        var carry = transcriptPending(log);
        endWrap();
        if (!target && w.info.known && w.info.entityId) {
            loadEntity({ entityId: w.info.entityId, entityName: w.info.name, entityType: w.info.entityType, phone: w.info.raw });
        }
        setTab('dial');
        render(snap);
        if (carry) {
            tNote = { key: logKey(log), name: w.info.known ? w.info.name : callNumber(w.info.raw), text: '' };
            paintTNote(log);
        }
        playToDial();
        if (hadFocus) focusPanel();
    }

    // --- Call end motion (asset 42) ---
    // One signal: End becomes Call back in place (the pill does the same).
    // Mute and Keypad shrink away (ghost copies, since the real ones hide at
    // once), Done rises in, the timer holds a beat then gives way to "Call
    // ended", the summary rises in. Done / 8 s: Dial rises in 8 px.
    // Reduced motion: 150 ms fades only. Transform and opacity only.
    var EASE_OUT = 'cubic-bezier(0.23,1,0.32,1)';
    var EASE_EXIT = 'cubic-bezier(0.4,0,0.2,1)';
    function canAnimate() { return typeof Element !== 'undefined' && typeof Element.prototype.animate === 'function'; }
    function fx(node, frames, ms, ease, delay) {
        if (!node || !canAnimate()) return null;
        try { return node.animate(frames, { duration: ms, easing: ease || EASE_OUT, delay: delay || 0, fill: 'backwards' }); } catch (e) { return null; }
    }
    // A still copy of a node at its place in the footer, for an exit.
    function ghostOf(node, box) {
        if (!node || node.hidden) return null;
        var r = node.getBoundingClientRect();
        if (!r.width || !r.height) return null;
        var g = node.cloneNode(true);
        g.classList.add('dl-ghost-fx');
        g.setAttribute('aria-hidden', 'true');
        g.removeAttribute('id');
        Array.prototype.forEach.call(g.querySelectorAll('button'), function (b) { b.disabled = true; b.tabIndex = -1; });
        g.style.left = (r.left - box.left) + 'px';
        g.style.top = (r.top - box.top) + 'px';
        g.style.width = r.width + 'px';
        g.style.height = r.height + 'px';
        return { node: g, rect: r };
    }
    function captureEnd() {
        if (!canAnimate() || ui.live.hidden) return null;
        var foot = ui.wrapCall.closest('.dl-foot');
        if (!foot) return null;
        var box = foot.getBoundingClientRect();
        var t = ui.liveTime.getBoundingClientRect();
        var live = ui.liveTime.parentNode.getBoundingClientRect();
        var timer = ui.liveTime.textContent ? ui.liveTime.cloneNode(true) : null;
        if (timer) {
            timer.classList.add('dl-ghost-fx');
            timer.setAttribute('aria-hidden', 'true');
            timer.style.left = (t.left - live.left) + 'px';
            timer.style.top = (t.top - live.top) + 'px';
            timer.style.width = t.width + 'px';
        }
        var er = ui.end && !ui.end.parentNode.hidden ? ui.end.getBoundingClientRect() : null;
        return {
            foot: foot,
            ghosts: [ghostOf(ui.mute.parentNode, box), ghostOf(ui.keys.parentNode, box)].filter(Boolean),
            timer: timer,
            endX: er && er.width ? er.left + er.width / 2 : null
        };
    }
    function playEnd(cap) {
        if (!cap) return;
        var reduced = reducedMotion();
        cap.ghosts.forEach(function (g) {
            cap.foot.appendChild(g.node);
            var a = fx(g.node, reduced ? [{ opacity: 1 }, { opacity: 0 }] : [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.8)' }], reduced ? 150 : 180, EASE_EXIT);
            var drop = function () { if (g.node.parentNode) g.node.parentNode.removeChild(g.node); };
            if (a) { a.onfinish = drop; a.oncancel = drop; } else drop();
            g.node.style.opacity = '0';
        });
        var done = ui.done.parentNode;
        if (reduced) {
            fx(done, [{ opacity: 0 }, { opacity: 1 }], 150);
            fx(ui.liveTime, [{ opacity: 0 }, { opacity: 1 }], 150);
            fx(ui.accSum, [{ opacity: 0 }, { opacity: 1 }], 150);
            return;
        }
        ui.wrapCall.classList.remove('dl-morph');
        void ui.wrapCall.offsetWidth; // restart the CSS animation
        ui.wrapCall.classList.add('dl-morph');
        fx(ui.wrapCall, [{ transform: 'scale(1)' }, { transform: 'scale(0.94)' }, { transform: 'scale(1)' }], 300);
        // End turns into Call back where End was, then slides into its place
        // in the centred pair as Done rises in beside it (asset 47).
        var cr = ui.wrapCall.getBoundingClientRect();
        var dx = cap.endX != null && cr.width ? Math.round(cap.endX - (cr.left + cr.width / 2)) : 0;
        // A delay, not a hold keyframe (the easing runs over the whole effect).
        if (dx) fx(ui.wrapCall.parentNode, [{ transform: 'translateX(' + dx + 'px)' }, { transform: 'none' }], 280, 'cubic-bezier(0.32,0.72,0,1)', 140);
        fx(done, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], 260, EASE_OUT, 140);
        if (cap.timer) {
            ui.liveTime.parentNode.appendChild(cap.timer);
            // The time holds 200 ms, then fades in 120 ms; "Call ended" rises
            // only once it is gone (delays, not hold keyframes: the easing
            // runs over the whole effect and would pull a hold early).
            var ta = fx(cap.timer, [{ opacity: 1 }, { opacity: 0 }], 120, EASE_EXIT, 200);
            var dropT = function () { if (cap.timer.parentNode) cap.timer.parentNode.removeChild(cap.timer); };
            if (ta) { ta.onfinish = dropT; ta.oncancel = dropT; } else dropT();
            cap.timer.style.opacity = '0';
        }
        fx(ui.liveTime, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], 260, EASE_OUT, 320);
        fx(ui.accSum, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], 260, EASE_OUT, 300);
    }
    function playToDial() {
        if (ui.idle.hidden) return;
        fx(ui.idle, reducedMotion() ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], reducedMotion() ? 150 : 240);
    }

    // --- Wrap-up status line (asset 43, DESIGN.md §4) ---
    // One true line in place of a summary skeleton: the stage of the call's
    // log and transcript (snap.lastLog.transcript, moved on by the phone's
    // transcript check), then the real AI summary once it exists. Plain
    // words, said once; the dot or check carries the tone.
    var STL_CHECK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="' + T.goDot + '" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10"></path></svg>';
    var stlKey = null;
    var stlTimer = null;
    function elapsedText(since) {
        var sec = Math.max(0, Math.floor((Date.now() - since) / 1000));
        var min = Math.floor(sec / 60);
        return min ? min + ' min ' + (sec % 60) + ' s' : sec + ' s';
    }
    // { mark: 'check' | 'dot', dot, bold, rest, tick } or { summary }.
    function transcriptView(log) {
        if (!log) return { mark: 'dot', dot: T.amber, bold: 'Logging call\u2026', rest: '' };
        if (log.status === 'skipped') return { mark: 'dot', dot: T.offline, bold: 'Call too brief to log', rest: '' };
        if (log.status === 'error') return { mark: 'dot', dot: T.stopDot, bold: 'Couldn\u2019t log the call', rest: '' };
        if (log.status !== 'saved') return { mark: 'dot', dot: T.offline, bold: 'Call ended', rest: '' };
        var t = log.transcript || {};
        if (t.stage === 'transcribing') return { mark: 'dot', dot: T.amber, bold: 'Transcribing\u2026', rest: t.since ? elapsedText(t.since) : '', tick: !!t.since };
        if (t.stage === 'done') return t.summary ? { summary: String(t.summary) } : { mark: 'check', bold: 'Summary ready', rest: '' };
        if (t.stage === 'none') return { mark: 'dot', dot: T.offline, bold: 'Call logged', rest: 'Too short to transcribe' };
        if (t.stage === 'later') return { mark: 'dot', dot: T.offline, bold: 'Call logged', rest: 'Summary on the record later' };
        return { mark: 'check', bold: 'Call logged', rest: 'Transcript in about 2 min' };
    }
    function stopStl() {
        if (stlTimer) { window.clearInterval(stlTimer); stlTimer = null; }
    }
    // animate: a stage change fades the new words in (150 ms, opacity only:
    // the old words go at once, so two never read together); the summary
    // rises 8 px (200 ms). The first paint rides the call-end motion.
    function paintStatus(animate) {
        var log = snap && snap.lastLog;
        var v = transcriptView(log);
        var key = v.summary ? 'summary' : v.mark + '|' + v.bold + '|' + (v.dot || '');
        var changed = stlKey !== null && key !== stlKey;
        stlKey = key;
        ui.stl.hidden = !!v.summary;
        ui.sum.hidden = !v.summary;
        if (v.summary) {
            ui.sumText.textContent = v.summary;
            fitAcc(); // the summary takes room: Recent activity gives rows back first
            ui.sumLink.hidden = !log.recordUrl;
            if (log.recordUrl) ui.sumLink.href = log.recordUrl;
            if (changed && animate) {
                fx(ui.sum, reducedMotion() ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], reducedMotion() ? 150 : 200);
            }
        } else {
            ui.stlMark.className = 'dl-stl-mark' + (v.mark === 'dot' ? ' is-dot' : '');
            ui.stlMark.innerHTML = v.mark === 'check' ? STL_CHECK : '';
            ui.stlMark.style.setProperty('--stl', v.dot || '#94A6BF');
            clear(ui.stlText);
            var b = document.createElement('b');
            b.textContent = v.bold;
            ui.stlText.appendChild(b);
            if (v.rest) ui.stlText.appendChild(document.createTextNode(' \u00b7 ' + v.rest));
            if (changed && animate) fx(ui.stl, [{ opacity: 0 }, { opacity: 1 }], 150);
        }
        // "Transcribing… · 1 min 40 s": the time counts while it shows.
        if (v.tick && !stlTimer) {
            stlTimer = window.setInterval(function () {
                if (!wrapUp) { stopStl(); return; }
                paintStatus(false);
            }, 1000);
        } else if (!v.tick) {
            stopStl();
        }
    }

    function renderWrap() {
        var cap = wrapUp.fresh ? captureEnd() : null;
        if (wrapUp.fresh) stlKey = null;
        wrapUp.fresh = false;
        ui.live.classList.add('cs');
        ui.ringActs.forEach(function (a) { a.hidden = true; });
        ui.callActs.forEach(function (a) { a.hidden = true; });
        ui.wrapActs.forEach(function (a) { a.hidden = false; });
        ui.wrapCall.parentNode.parentNode.classList.add('dl-two');
        ui.liveWarn.hidden = true;
        var info = wrapUp.info;
        ui.wrapCall.disabled = !dialable(info.raw);
        ui.wrapCall.setAttribute('aria-label', 'Call back ' + (info.known ? info.name : callNumber(info.raw)));
        paintCall(info, 'ended');
        paintStatus(!cap);
        playEnd(cap);
    }

    // A pointer or key in the wrap-up keeps it until the rep acts.
    ['pointerdown', 'keydown'].forEach(function (type) {
        ui.live.addEventListener(type, function () {
            if (!wrapUp || wrapUp.touched) return;
            wrapUp.touched = true;
            window.clearTimeout(wrapTimer);
            wrapTimer = null;
        });
    });
    ui.done.addEventListener('click', finishWrap);
    ui.wrapCall.addEventListener('click', function () {
        var w = wrapUp;
        if (!w) return;
        callBack({ number: w.info.raw, name: w.info.name, entityId: w.info.known ? w.info.entityId : '', entityType: w.info.entityType });
    });

    ui.mute.addEventListener('click', function () { send(snap && snap.muted ? 'unmute' : 'mute'); });
    ui.end.addEventListener('click', function () { send('hangup'); });
    ui.answer.addEventListener('click', function () {
        if (!isIncoming()) return;
        answerSent = true;
        send('answer');
        render(snap);
    });
    ui.decline.addEventListener('click', function () { send('decline'); });
    ui.liveAdd.addEventListener('click', function () {
        if (liveAddNum) openAdd({ phone: liveAddNum, phoneCallId: wrapUp ? wrapUp.phoneCallId : '', trigger: ui.liveAdd });
    });
    // Keypad: the Dial keys in the account block's place; pressed again,
    // the block comes back.
    ui.keys.addEventListener('click', function () {
        var show = ui.dtmf.hidden;
        ui.dtmf.hidden = !show;
        ui.keys.setAttribute('aria-pressed', show ? 'true' : 'false');
        ui.keys.setAttribute('aria-label', show ? 'Hide keypad' : 'Show keypad');
        syncAcc();
    });
    ui.dtmf.addEventListener('click', function (e) {
        var k = e.target.closest('.dl-key');
        if (k) send('digits', { d: k.getAttribute('data-key') });
    });

    // --- Header, note ---
    // key: the lastLog this note shows; leave it out for a local note.
    function showNote(kind, text, url, key) {
        stopNoteTimer();
        noteKey = key || null;
        ui.note.hidden = false;
        ui.noteText.textContent = text;
        ui.noteLink.hidden = !url;
        if (url) ui.noteLink.href = url;
        noteAdd = null;
        ui.noteAdd.hidden = true;
        ui.note.setAttribute('data-kind', kind);
    }

    function hideNote() {
        stopNoteTimer();
        tNote = null;
        noteKey = null;
        noteAdd = null;
        ui.noteAdd.hidden = true;
        ui.note.hidden = true;
    }

    // The after-call note offers "Add to NetSuite" when the call's other
    // side matched no record: the inbound caller had no name, or an
    // outbound call went to a number with no record. The Phone Call id
    // comes from lastLog.recordUrl (…call.nl?id=N). (A missed unknown
    // caller: the Dial slot's "Add to NetSuite", asset 40.)
    function noteAddFor(log) {
        if (!snap || log.status !== 'saved') return null;
        var number = '';
        if (snap.direction === 'inbound') {
            var c = snap.caller || {};
            if (c.name || c.entityId) return null;
            number = c.number || '';
        } else {
            if (snap.entityId || snap.entityName || snap.contactName) return null;
            number = snap.number || '';
        }
        if (!canAdd(number)) return null;
        var m = /[?&]id=([0-9]+)/.exec(String(log.recordUrl || ''));
        return { phone: number, phoneCallId: m ? m[1] : '' };
    }

    function showNoteAdd(a) {
        noteAdd = a || null;
        ui.noteAdd.hidden = !a;
        if (a) ui.noteAdd.setAttribute('aria-label', 'Add ' + (formatPhone(a.phone) || a.phone) + ' to NetSuite');
    }

    // The auto-hide pauses while the note is hovered or holds focus and
    // goes on with the time it had left.
    function stopNoteTimer() {
        window.clearTimeout(noteTimer);
        noteTimer = null;
        noteRemain = 0;
    }

    function runNoteTimer() {
        if (!noteRemain || noteTimer || noteHover || noteFocus) return;
        var key = noteKey;
        noteDeadline = Date.now() + noteRemain;
        noteTimer = window.setTimeout(function () {
            noteTimer = null;
            noteRemain = 0;
            if (noteKey !== key) return;
            noteDismissed = key;
            hideNote();
        }, noteRemain);
    }

    function pauseNoteTimer() {
        if (!noteTimer) return;
        window.clearTimeout(noteTimer);
        noteTimer = null;
        noteRemain = Math.max(1, noteDeadline - Date.now());
    }

    ui.note.addEventListener('mouseenter', function () { noteHover = true; pauseNoteTimer(); });
    ui.note.addEventListener('mouseleave', function () { noteHover = false; runNoteTimer(); });
    ui.note.addEventListener('focusin', function () { noteFocus = true; pauseNoteTimer(); });
    ui.note.addEventListener('focusout', function (e) {
        if (e.relatedTarget && ui.note.contains(e.relatedTarget)) return;
        noteFocus = false;
        runNoteTimer();
    });

    // The records the current / last call was with (and the Dial target).
    function invalidateCallRecords() {
        if (snap) {
            invalidateRecord(String(snap.entityId || ''));
            if (snap.caller) invalidateRecord(String(snap.caller.entityId || ''));
        }
        if (target) invalidateRecord(target.entityId);
    }

    function logKey(log) {
        return [log.status, log.message || '', log.recordUrl || ''].join('|');
    }

    // The after-call note. Each snapshot repeats lastLog, so the note and its
    // 10 s timer start only when a different lastLog arrives. A closed note
    // stays closed for that lastLog.
    // After the wrap-up (asset 43): the transcript stage carries on in the
    // after-call note ("Abbott Inc. · Transcribing…" + Open). It updates in
    // place and hides by itself (NOTE_HIDE_MS) once the stage is final.
    // Same key as the call's lastLog, so × or the timer close it for good.
    var tNote = null; // { key, name, text }
    var T_NOTE_WORD = { logged: 'Call logged', transcribing: 'Transcribing\u2026', done: 'Summary ready', none: 'Too short to transcribe', later: 'Summary on the record later' };
    function transcriptPending(log) {
        var st = log && log.status === 'saved' && log.transcript && log.transcript.stage;
        return st === 'logged' || st === 'transcribing';
    }
    function paintTNote(log) {
        var t = log.transcript || {};
        var text = tNote.name + ' \u00b7 ' + (T_NOTE_WORD[t.stage] || T_NOTE_WORD.logged);
        if (text === tNote.text && !ui.note.hidden) return;
        tNote.text = text;
        showNote('transcript', text, log.recordUrl, tNote.key);
        if (!transcriptPending(log)) {
            noteRemain = NOTE_HIDE_MS;
            runNoteTimer();
        }
    }

    function showLog(log) {
        var key = logKey(log);
        if (tNote && tNote.key === key) { paintTNote(log); return; }
        // A missed call: the note on Dial (asset 40), once per lastLog.
        if (log.status === 'missed') {
            hideNote();
            if (key !== noteDismissed && !(miss && miss.key === key)) showMissed(key, log.declined === true);
            return;
        }
        if (key === noteDismissed) { hideNote(); return; }
        if (key === noteKey && !ui.note.hidden) return;
        // The call that ended in a wrap-up: no "Call ended · Open record"
        // note (asset 38); its Phone Call id goes to the wrap-up's Add.
        if (wrapLogSkip && (log.status === 'saved' || log.status === 'skipped')) {
            wrapLogSkip = false;
            noteDismissed = key;
            hideNote();
            var id = /[?&]id=([0-9]+)/.exec(String(log.recordUrl || ''));
            if (wrapUp && id) wrapUp.phoneCallId = id[1];
            return;
        }
        showNote(log.status, log.message || 'Call ended', log.recordUrl, key);
        showNoteAdd(noteAddFor(log));
        if (log.status === 'saved' || log.status === 'skipped') {
            noteRemain = NOTE_HIDE_MS;
            runNoteTimer();
        }
    }

    // --- Missed call on Dial (DESIGN.md §4, asset 40) ---
    // The panel lands on Dial: the note (between the pill row and the
    // number) and the caller loaded under it (a record: its numbers with
    // the caller's selected; an unknown number: typed, so the slot offers
    // Add to NetSuite). The caller comes from snap.missedUnseen.last, kept
    // because opening the panel resets it (markMissedSeen); else the
    // call's caller. The note stays until ×, Call back or a new call.
    function showMissed(key, declined) {
        // A declined ring is not counted in missedUnseen: its caller is the
        // call's own (snap.caller), never an older missed caller.
        var c = (declined ? null : missedCaller) || (snap && snap.caller) || {};
        miss = {
            key: key,
            declined: !!declined,
            name: String(c.name || ''),
            number: String(c.number || ''),
            entityId: String(c.entityId || ''),
            entityType: String(c.entityType || ''),
            at: missedAt || Date.now()
        };
        if (miss.entityId) {
            loadEntity({ entityId: miss.entityId, entityName: miss.name, entityType: miss.entityType, phone: miss.number });
        } else if (miss.number) {
            clearEntity();
            setDisplay(miss.number, true);
        }
        setTab('dial');
        if (host.saveUi) host.saveUi();
        paintMiss();
    }

    // "Just now", "2 min ago", "3 h ago", else the date.
    function agoText(at) {
        var sec = Math.max(0, Math.floor((Date.now() - at) / 1000));
        if (sec < 60) return 'Just now';
        var min = Math.floor(sec / 60);
        if (min < 60) return min + ' min ago';
        if (min < 1440) return Math.floor(min / 60) + ' h ago';
        var d = new Date(at);
        return MONTHS[d.getMonth()] + ' ' + d.getDate();
    }

    function paintMissAgo() {
        if (miss) ui.missAgo.textContent = ' \u00b7 ' + agoText(miss.at);
    }

    // --- Voicemail coming (finding #91, asset 48, DESIGN.md §4) ---
    // snap.voicemail from the phone's checkVoicemail polling, painted as
    // one line under the missed note: Leaving a voicemail… (amber dot, a
    // timer from recAt), Voicemail saved · 0:11 · Summary in about 2 min ·
    // Open (check; the Voicemail list reloads), then the summary under it
    // when the phone's checkTranscript has it (asset 49), No voicemail left (grey),
    // Voicemail will show within 15 min (grey; the check ran out). Words
    // change with a 150 ms fade; nothing loops.
    var vmLineKey = '';
    var vmLineTimer = null;
    var vmSavedSid = '';
    var vmSummarySid = '';
    function vmClock(sec) { return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); }
    function vmLine(v) {
        if (!v || v.state === 'checking') return null;
        if (v.state === 'leaving') {
            var sec = v.recAt ? Math.max(0, Math.floor((Date.now() - v.recAt) / 1000)) : null;
            return { dot: T.amber, bold: 'Leaving a voicemail\u2026', rest: sec === null ? '' : vmClock(sec), live: !!v.recAt };
        }
        if (v.state === 'saved') {
            // The summary stage (asset 49): the phone asks checkTranscript.
            var sum = v.summary || {};
            var tail = sum.stage === 'done' ? (sum.text ? '' : ' \u00b7 Summary ready')
                : sum.stage === 'none' ? ' \u00b7 No summary'
                : sum.stage === 'later' ? ' \u00b7 Summary within 15 min'
                : ' \u00b7 Summary in about 2 min';
            return { check: true, bold: 'Voicemail saved', rest: (typeof v.seconds === 'number' ? ' \u00b7 ' + vmClock(v.seconds) : '') + tail,
                summary: sum.stage === 'done' ? String(sum.text || '') : '',
                url: v.recordId ? '/app/crm/calendar/call.nl?id=' + encodeURIComponent(v.recordId) : '' };
        }
        if (v.state === 'none') return { dot: T.offline, plain: 'No voicemail left' };
        return { dot: T.offline, plain: 'Voicemail will show within 15 min' };
    }
    function paintMissVm() {
        var v = snap && snap.voicemail;
        var line = miss ? vmLine(v) : null;
        window.clearInterval(vmLineTimer);
        vmLineTimer = null;
        if (!line) {
            ui.missSt.hidden = true;
            ui.missSt.textContent = '';
            ui.missSum.hidden = true;
            ui.missSum.textContent = '';
            vmLineKey = '';
            return;
        }
        var key = v.callSid + ':' + v.state + ':' + ((v.summary && v.summary.stage) || '');
        ui.missSt.textContent = '';
        var mark = document.createElement('span');
        if (line.check) {
            mark.style.cssText = 'display:inline-flex;flex-shrink:0';
            mark.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="' + T.goDot + '" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10"></path></svg>';
        } else {
            mark.style.cssText = 'width:6px;height:6px;border-radius:50%;flex-shrink:0;background:' + line.dot;
        }
        ui.missSt.appendChild(mark);
        if (line.plain) {
            var p = document.createElement('span');
            p.textContent = line.plain;
            ui.missSt.appendChild(p);
        } else {
            var bold = document.createElement('b');
            bold.textContent = line.bold;
            var rest = document.createElement('span');
            rest.className = 'dl-st-rest';
            rest.textContent = line.rest;
            ui.missSt.appendChild(bold);
            ui.missSt.appendChild(rest);
        }
        if (line.url) {
            var open = document.createElement('a');
            open.href = line.url;
            open.target = '_top';
            open.textContent = 'Open';
            ui.missSt.appendChild(open);
        }
        ui.missSt.hidden = false;
        ui.missSum.textContent = line.summary || '';
        ui.missSum.hidden = !line.summary;
        if (key !== vmLineKey) {
            vmLineKey = key;
            [ui.missSt, ui.missSum].forEach(function (n) {
                if (n.hidden || typeof n.animate !== 'function') return;
                try { n.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150, easing: 'ease-out' }); } catch (e) { /* no WAAPI */ }
            });
        }
        if (line.live) {
            vmLineTimer = window.setInterval(function () {
                var r = ui.missSt.querySelector('.dl-st-rest');
                var cur = snap && snap.voicemail;
                if (!r || !cur || cur.state !== 'leaving' || !cur.recAt) return;
                r.textContent = vmClock(Math.max(0, Math.floor((Date.now() - cur.recAt) / 1000)));
            }, 1000);
        }
    }

    function paintMiss() {
        ui.miss.hidden = !miss;
        window.clearInterval(missTimer);
        missTimer = null;
        if (miss) {
            var url = miss.entityId ? recordUrl(miss.entityType, miss.entityId) : '';
            var who = miss.name || callNumber(miss.number) || 'Unknown caller';
            ui.missName.textContent = who;
            ui.missName.classList.toggle('mono', !miss.name && !!miss.number);
            if (url) {
                ui.missName.href = url;
                ui.missName.title = 'Open record in NetSuite';
            } else {
                ui.missName.removeAttribute('href');
                ui.missName.removeAttribute('title');
            }
            ui.missCall.hidden = !miss.number;
            ui.missCall.setAttribute('aria-label', 'Call back ' + who);
            ui.missK.textContent = miss.declined ? 'Declined call' : 'Missed call';
            paintMissAgo();
            missTimer = window.setInterval(paintMissAgo, 30000);
        }
        paintMissVm();
        syncDial();
    }

    // drop: true = this lastLog's note stays closed (×, Call back).
    function hideMiss(drop) {
        if (!miss) return;
        if (drop) noteDismissed = miss.key;
        miss = null;
        paintMiss();
    }

    ui.missCall.addEventListener('click', function () {
        var c = miss;
        if (!c || !c.number) return;
        hideMiss(true);
        callBack(c);
    });

    ui.missX.addEventListener('click', function () {
        var hadFocus = el.getRootNode().activeElement === ui.missX;
        hideMiss(true);
        if (hadFocus) focusPanel();
    });

    // The fit rule (keys are sacred): while the missed note shows and the
    // Dial view does not fit above the footer, the record's insight line
    // goes first, then the 34 px row when it is empty; never the keys.
    function fitDial() {
        ui.recInsight.classList.remove('dl-fit-out');
        ui.mrow.classList.remove('dl-fit-out');
        if (!miss || tab !== 'dial' || ui.idle.hidden) return;
        var body = ui.dialBody;
        var over = function () { return body.scrollHeight > body.clientHeight; };
        if (!over()) return;
        if (!ui.rec.hidden && !ui.recInsight.hidden) ui.recInsight.classList.add('dl-fit-out');
        var empty = ui.trig.hidden && (ui.slot.hidden || (ui.looking.hidden && ui.match.hidden && ui.add.hidden));
        if (over() && empty) ui.mrow.classList.add('dl-fit-out');
    }
    if (typeof window.ResizeObserver === 'function') {
        try { new window.ResizeObserver(function () { fitDial(); }).observe(ui.dialBody); } catch (e) { /* no observer: fit on render */ }
    }

    ui.noteAdd.addEventListener('click', function () {
        if (noteAdd) openAdd({ phone: noteAdd.phone, phoneCallId: noteAdd.phoneCallId, trigger: ui.noteAdd });
    });

    ui.noteX.addEventListener('click', function () {
        var hadFocus = el.getRootNode().activeElement === ui.noteX;
        if (noteKey) noteDismissed = noteKey;
        ui.note.removeAttribute('data-kind');
        hideNote();
        if (hadFocus) focusPanel();
    });

    // --- Audio settings ---
    // Rebuild a select only when its options or value changed, so a snapshot
    // never closes a list the rep has open.
    function fillSelect(sel, items, value) {
        var key = JSON.stringify([items, value]);
        if (sel.getAttribute('data-key') === key) return;
        sel.setAttribute('data-key', key);
        clear(sel);
        (items || []).forEach(function (d) {
            var o = document.createElement('option');
            o.value = String(d.id);
            o.textContent = d.label || String(d.id);
            sel.appendChild(o);
        });
        if (value) sel.value = String(value);
    }

    function renderAudio() {
        var a = snap && snap.audio;
        // Live calls can switch device (finding #88, asset 46); only a ring
        // in progress waits for the answer.
        var ringing = isIncoming();
        var msg = !a ? 'Audio settings open after the phone starts.' : ringing ? 'Change audio after you answer.' : '';
        ui.audioMsg.textContent = msg;
        ui.audioMsg.hidden = !msg;
        ui.inRow.hidden = !a;
        ui.outRow.hidden = !a || !a.outputSupported;
        if (a) {
            fillSelect(ui.inSel, a.inputs, a.input);
            if (a.outputSupported) fillSelect(ui.outSel, a.outputs, a.output);
        }
        ui.inSel.disabled = !a || ringing;
        ui.outSel.disabled = !a || ringing;
        var shell = window.__ctcShell;
        var remote = isRemote();
        ui.exit.hidden = remote || !(shell && typeof shell.exit === 'function');
        ui.exitBlock.hidden = ui.exit.hidden; // the rule and the caption go with it
        // Remote control: says where the audio plays.
        ui.remote.hidden = !remote;
    }

    function setAudioOpen(open) {
        audioOpen = open;
        ui.gear.setAttribute('aria-pressed', open ? 'true' : 'false');
        if (open) {
            vmOpen = false;
            addOpen = false;
            ui.vm.setAttribute('aria-pressed', 'false');
            closeMenu(false);
        }
        render(snap);
    }

    ui.gear.addEventListener('click', function () {
        setAudioOpen(!audioOpen);
        if (audioOpen) ui.audioBack.focus();
    });
    ui.audioBack.addEventListener('click', function () {
        setAudioOpen(false);
        ui.gear.focus();
    });
    ui.inSel.addEventListener('change', function () { send('setInput', { id: ui.inSel.value }); });
    ui.outSel.addEventListener('change', function () { send('setOutput', { id: ui.outSel.value }); });
    ui.exit.addEventListener('click', function () {
        var shell = window.__ctcShell;
        if (shell && typeof shell.exit === 'function') shell.exit();
    });
    ui.alertsBtn.addEventListener('click', function () {
        if (host.unlockAudio) host.unlockAudio();
    });
    ui.alertAct.addEventListener('click', function () {
        if (alertRun) alertRun();
    });
    // The one Sign in action (client signIn: reloads the NetSuite frame here).
    ui.soBtn.addEventListener('click', function () {
        if (typeof host.signIn === 'function') host.signIn();
    });
    ui.close.addEventListener('click', function () { host.collapse(); });
    el.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { e.stopPropagation(); host.collapse(); }
    });

    // --- Add to NetSuite sheet (DESIGN.md §6) ---
    // A number with no record can go to an existing contact, a new contact
    // at a company, a new lead or prospect, or (with a Phone Call) stay
    // logged without a record. Choices 2 and 3 check for duplicates
    // (softphoneFindDuplicates) before they save; "Use this one" moves to
    // choice 1 or 2 with that record. Save: softphoneAddToNetSuite. Back
    // and Esc close it without saving.
    function canAdd(number) {
        return !!(cfg.restletUrl && dialable(number) && !addedKeys[lastTen(number)]);
    }

    // o: { phone, phoneCallId, trigger } (trigger gets focus back on close).
    function openAdd(o) {
        var phone = dialable(o && o.phone);
        if (!cfg.restletUrl || !phone) return;
        closeMenu(false);
        audioOpen = false;
        ui.gear.setAttribute('aria-pressed', 'false');
        vmOpen = false;
        ui.vm.setAttribute('aria-pressed', 'false');
        as = {
            phone: phone,
            phoneCallId: String((o && o.phoneCallId) || ''),
            trigger: (o && o.trigger) || null,
            live: isActive() || isIncoming(), // opened during a call: a new call does not close it
            mode: 'existingContact',
            pick: { existingContact: null, newContact: null },
            status: 'lead',
            dupKey: null,
            dups: null,
            saving: false
        };
        addOpen = true;
        ui.asNum.textContent = formatPhone(phone) || phone;
        ui.asLogOpt.hidden = !as.phoneCallId;
        [ui.asQ, ui.asCompany, ui.asFirst, ui.asLast, ui.asRole].forEach(function (i) { i.value = ''; });
        ui.asField.value = '';
        ui.asMain.checked = false;
        setAddStatus('lead');
        setAddMode('existingContact');
        render(snap);
        ui.asBack.focus();
    }

    function closeAdd(refocus) {
        if (!addOpen) return;
        var trigger = as && as.trigger;
        addOpen = false;
        asSeq++;
        dupSeq++;
        window.clearTimeout(asTimer);
        render(snap);
        if (!refocus) return;
        if (trigger && trigger.isConnected && !trigger.hidden && !trigger.closest('[hidden]')) trigger.focus();
        else focusPanel();
    }

    function setAddMode(mode) {
        as.mode = mode;
        ui.asRadios.forEach(function (r) { r.checked = r.value === mode; });
        ui.asBlocks.forEach(function (b) {
            b.hidden = b.getAttribute('data-modes').split(' ').indexOf(mode) === -1;
        });
        var contact = mode === 'existingContact';
        ui.asPickLbl.textContent = contact ? 'Contact' : 'Company';
        ui.asQ.setAttribute('aria-label', contact ? 'Search for a contact' : 'Search for a company');
        ui.asQ.value = '';
        asSeq++;
        window.clearTimeout(asTimer);
        clear(ui.asResults);
        ui.asCtx.hidden = true;
        setAddMsg('');
        as.dupKey = null; // a new choice checks again
        clearDups();
        setAddError('');
        renderPick();
    }

    function setAddStatus(status) {
        if (as) as.status = status;
        ui.asStatus.forEach(function (b) {
            b.setAttribute('aria-pressed', b.getAttribute('data-status') === status ? 'true' : 'false');
        });
    }

    function setAddMsg(text, err) {
        ui.asMsg.className = 'dl-msg dl-as-msg' + (err ? ' err' : '');
        ui.asMsg.textContent = text;
    }

    function setAddError(text) {
        ui.asErr.textContent = text;
        ui.asErr.hidden = !text;
    }

    // The picked contact (choice 1) or company (choice 2), else the search.
    function renderPick() {
        var p = as.pick[as.mode] || null;
        ui.asPicked.hidden = !p;
        ui.asQbox.hidden = !!p;
        ui.asResults.hidden = !!p;
        ui.asMsg.hidden = !!p;
        if (p) {
            ui.asCtx.hidden = true;
            ui.asPName.textContent = p.name;
            ui.asPSub.textContent = p.sub || '';
            ui.asChange.setAttribute('aria-label', 'Change ' + (as.mode === 'existingContact' ? 'contact' : 'company'));
        }
        syncAddSave();
    }

    function pickAdd(p) {
        as.pick[as.mode] = p;
        clearDups();
        setAddError('');
        renderPick();
        (as.mode === 'existingContact' ? ui.asField : ui.asFirst).focus();
    }

    function addRow(name, sub, onClick) {
        var li = document.createElement('li');
        li.className = 'dl-card';
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'dl-row';
        var icon = document.createElement('span');
        icon.className = 'dl-ricon';
        icon.innerHTML = USER_SVG(16);
        var main = document.createElement('span');
        main.className = 'dl-row-main';
        main.appendChild(span('dl-row-name', name));
        if (sub) main.appendChild(span('dl-row-sub', sub));
        b.appendChild(icon);
        b.appendChild(main);
        b.addEventListener('click', onClick);
        li.appendChild(b);
        return li;
    }

    // softphoneSearch rows are companies (customer / prospect / lead):
    // choice 2 picks one; choice 1 opens its contacts.
    function runAddSearch() {
        var query = ui.asQ.value.trim();
        var seq = ++asSeq;
        clear(ui.asResults);
        ui.asCtx.hidden = true;
        if (!query) { setAddMsg(''); return; }
        setAddMsg('Searching…');
        api('softphoneSearch', { query: query, typeFilter: '', limit: 20 }).then(function (d) {
            if (seq !== asSeq || !addOpen) return;
            var rows = d.rows || [];
            rows.forEach(function (r) {
                var type = TYPE_NAME[r.type] || '';
                ui.asResults.appendChild(addRow(r.companyName, [type, r.contactName].filter(Boolean).join(' · '), function () {
                    if (as.mode === 'newContact') pickAdd({ companyId: String(r.id), name: r.companyName, sub: type });
                    else showContacts(r);
                }));
            });
            setAddMsg(rows.length ? '' : 'No matches.');
        }).catch(function (err) {
            if (seq !== asSeq || !addOpen) return;
            setAddMsg('Search failed: ' + err.message, true);
        });
    }

    function showContacts(company) {
        var seq = ++asSeq;
        clear(ui.asResults);
        ui.asCtx.textContent = 'Contacts at ' + company.companyName;
        ui.asCtx.hidden = false;
        setAddMsg('Loading…');
        ui.asQ.focus();
        recordContacts(String(company.id)).p.then(function (d) {
            if (seq !== asSeq || !addOpen) return;
            var rows = (d.rows || []).filter(function (c) { return c.contactId && String(c.contactId) !== '__company_main__'; });
            rows.forEach(function (c) {
                ui.asResults.appendChild(addRow(c.name, [c.title, company.companyName].filter(Boolean).join(' · '), function () {
                    pickAdd({ contactId: String(c.contactId), name: c.name, sub: company.companyName });
                }));
            });
            setAddMsg(rows.length ? '' : 'No contacts at ' + company.companyName + '.');
        }).catch(function (err) {
            if (seq !== asSeq || !addOpen) return;
            setAddMsg('Could not load contacts: ' + err.message, true);
        });
    }

    // Duplicates: the same number (choices 2 and 3) or company name (3).
    function dupKeyOf() {
        return as.mode + '|' + (as.mode === 'newCompany' ? ui.asCompany.value.trim().toUpperCase() : '');
    }

    function clearDups() {
        if (as) as.dups = null;
        clear(ui.asDups);
        ui.asDups.hidden = true;
        if (as) syncAddSave();
    }

    function dupHits(d) {
        if (!d || d.ok === false) return [];
        var seen = {};
        var out = [];
        [[d.byPhone, 'Same number'], [d.byName, 'Same name']].forEach(function (g) {
            (g[0] || []).forEach(function (h) {
                if (!h || !h.entityId) return;
                var k = h.entityId + ':' + (h.contactId || '');
                if (seen[k]) return;
                seen[k] = true;
                out.push({ h: h, reason: g[1] });
            });
        });
        return out;
    }

    function showDups(hits) {
        clearDups();
        if (!hits.length) return;
        as.dups = hits;
        ui.asDups.appendChild(span('dl-alert-title', 'Already in NetSuite'));
        var ul = document.createElement('ul');
        ul.className = 'dl-dup-list';
        hits.forEach(function (x) {
            var h = x.h;
            var li = document.createElement('li');
            li.className = 'dl-dup';
            var main = document.createElement('span');
            main.className = 'dl-row-main';
            var name = h.contactId && h.contactName && h.entityType === 'contact' ? h.contactName : h.name;
            main.appendChild(span('dl-row-name', name));
            var type = h.entityType === 'contact' ? 'Contact' : TYPE_NAME[h.entityType] || '';
            var who = h.contactName && h.contactName !== name ? h.contactName : '';
            main.appendChild(span('dl-row-sub', [type, who, x.reason].filter(Boolean).join(' · ')));
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'dl-ghost dl-dup-use';
            b.textContent = 'Use this one';
            b.setAttribute('aria-label', 'Use ' + (who ? who + ', ' : '') + name);
            b.addEventListener('click', function () { useDup(h); });
            li.appendChild(main);
            li.appendChild(b);
            ul.appendChild(li);
        });
        ui.asDups.appendChild(ul);
        ui.asDups.hidden = false;
        syncAddSave();
    }

    // A contact hit: choice 1 with that contact. A company: choice 2.
    function useDup(h) {
        if (h.contactId) {
            setAddMode('existingContact');
            pickAdd({ contactId: String(h.contactId), name: h.contactName || h.name, sub: h.entityType === 'contact' ? '' : h.name });
        } else {
            setAddMode('newContact');
            pickAdd({ companyId: String(h.entityId), name: h.name, sub: TYPE_NAME[h.entityType] || '' });
        }
    }

    // Resolves true when it found records (the warning shows).
    function checkDups() {
        var key = dupKeyOf();
        var mode = as.mode;
        var body = { phone: as.phone };
        var company = ui.asCompany.value.trim();
        if (mode === 'newCompany' && company) body.companyName = company;
        var seq = ++dupSeq;
        return api('softphoneFindDuplicates', body, true).then(function (d) {
            if (seq !== dupSeq || !addOpen || as.mode !== mode) return null;
            as.dupKey = key;
            var hits = dupHits(d);
            showDups(hits);
            return hits.length > 0;
        }, function () {
            // The check is advice: a failed check does not block the save.
            if (seq !== dupSeq || !addOpen || as.mode !== mode) return null;
            as.dupKey = key;
            return false;
        });
    }

    function syncAddSave() {
        if (!as) return;
        var ready = as.mode === 'logOnly' ? !!as.phoneCallId
            : as.mode === 'newCompany' ? !!ui.asCompany.value.trim()
                : !!as.pick[as.mode];
        ui.asSave.disabled = as.saving || !ready;
        ui.asSave.textContent = as.saving ? 'Saving…' : as.dups ? 'Save anyway' : 'Save';
    }

    function addBody() {
        var mode = as.mode;
        if (mode === 'logOnly') return { mode: mode, phoneCallId: as.phoneCallId };
        var b = { mode: mode };
        var p = as.pick[mode];
        var first = ui.asFirst.value.trim();
        var last = ui.asLast.value.trim();
        if (mode === 'existingContact') {
            b.contactId = p.contactId;
            b.phone = as.phone;
            if (ui.asField.value) b.field = ui.asField.value;
            if (ui.asMain.checked) b.makeMain = true;
        } else if (mode === 'newContact') {
            b.companyId = p.companyId;
            b.firstName = first;
            b.lastName = last;
            if (ui.asRole.value.trim()) b.title = ui.asRole.value.trim();
            b.phone = as.phone;
            if (ui.asMain.checked) b.makeMain = true;
        } else {
            b.companyName = ui.asCompany.value.trim();
            if (first) b.firstName = first;
            if (last) b.lastName = last;
            b.phone = as.phone;
            b.status = as.status;
        }
        if (as.phoneCallId) b.phoneCallId = as.phoneCallId;
        return b;
    }

    function saveAdd() {
        if (!as || ui.asSave.disabled) return;
        setAddError('');
        var needsCheck = (as.mode === 'newContact' || as.mode === 'newCompany') && as.dupKey !== dupKeyOf();
        as.saving = true;
        syncAddSave();
        if (!needsCheck) { sendAdd(); return; }
        var mine = as;
        checkDups().then(function (found) {
            if (!addOpen || as !== mine) return;
            if (found === null) { as.saving = false; syncAddSave(); return; } // superseded
            if (found) { as.saving = false; syncAddSave(); ui.asDups.querySelector('.dl-dup-use').focus(); return; }
            sendAdd();
        });
    }

    function sendAdd() {
        var mine = as;
        var body = addBody();
        api('softphoneAddToNetSuite', body, true).then(function (d) {
            if (!addOpen || as !== mine) return;
            as.saving = false;
            if (!d || d.ok !== true) {
                setAddError((d && d.message) || 'Could not save. Try again.');
                syncAddSave();
                return;
            }
            addDone(d, body);
        }).catch(function (err) {
            if (!addOpen || as !== mine) return;
            as.saving = false;
            setAddError('Could not save: ' + err.message);
            syncAddSave();
        });
    }

    // Saved: close the sheet, load the record as the Dial target (between
    // calls), let the match slot know the number, and reload Recents so
    // the row loses "Add".
    function addDone(d, body) {
        var phone = as.phone;
        var p = as.pick[body.mode];
        var key = lastTen(phone);
        addedKeys[key] = true;
        if (noteAdd && lastTen(noteAdd.phone) === key) showNoteAdd(null);
        if (lastTen(liveAddNum) === key) { liveAddNum = ''; ui.liveAdd.hidden = true; }
        // The saved record and the company it sits under changed (an
        // existing contact's company is not known here): drop every entry.
        recordCache = {};
        var loaded = false;
        if (body.mode !== 'logOnly' && d.entityId) {
            var name = d.name || (p && p.name) || body.companyName || '';
            var type = String(d.entityType || '');
            matchCache[key] = { entityId: String(d.entityId), name: name, entityType: type };
            if (!isActive() && !isIncoming()) {
                loadEntity({ entityId: d.entityId, entityName: name, entityType: type, phone: phone });
                setTab('dial');
                loaded = true;
            }
        }
        closeAdd(!loaded);
        if (loaded) ui.display.focus();
        recentsLoaded = false;
        loadRecents();
        if (d.linkError) showQuiet('Saved. The call could not be linked to it.');
        else if (d.contactError) showQuiet('Saved. The contact could not be added.');
    }

    ui.asBack.addEventListener('click', function () { closeAdd(true); });
    ui.asPane.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        e.stopPropagation(); // the sheet closes, not the panel
        closeAdd(true);
    });
    ui.asRadios.forEach(function (r) {
        r.addEventListener('change', function () { if (r.checked && as) setAddMode(r.value); });
    });
    ui.asQ.addEventListener('input', function () {
        window.clearTimeout(asTimer);
        asTimer = window.setTimeout(runAddSearch, SEARCH_DEBOUNCE_MS);
    });
    ui.asChange.addEventListener('click', function () {
        as.pick[as.mode] = null;
        clearDups();
        renderPick();
        ui.asQ.focus();
    });
    ui.asCompany.addEventListener('input', function () {
        if (as.dups && as.dupKey !== dupKeyOf()) clearDups();
        syncAddSave();
    });
    // Choice 3: the duplicate check runs when the company name is left.
    ui.asCompany.addEventListener('blur', function () {
        if (!addOpen || as.mode !== 'newCompany' || !ui.asCompany.value.trim() || as.saving) return;
        if (as.dupKey !== dupKeyOf()) checkDups();
    });
    ui.asStatus.forEach(function (b) {
        b.addEventListener('click', function () { setAddStatus(b.getAttribute('data-status')); });
    });
    ui.asSave.addEventListener('click', saveAdd);

    // --- Render from the anchor's snapshot ---
    function render(next) {
        snap = next || snap;
        if (isActive() || isIncoming()) closeTargets(false);
        renderSignedOut();
        var phase = snap && PHASE_VIEW[snap.phase] ? snap.phase : 'offline';
        var view = PHASE_VIEW[phase];
        if (pending && phase !== 'ready' && !ACTIVE[phase]) view = PHASE_VIEW.starting;
        // Ready, but Twilio cannot ring this phone (anchor re-registering).
        if (phase === 'ready' && snap && snap.canReceive === false) view = READY_NOT_RECEIVING;
        // Between calls an error kind names the problem.
        if (!ACTIVE[phase] && phase !== 'incoming' && ERROR_VIEW[errKind()]) view = ERROR_VIEW[errKind()];
        // Signed in again: the first plain Ready reads "Signed in · Ready"
        // for SIGNED_IN_MS, then "Ready".
        if (view === PHASE_VIEW.ready) {
            if (signedInPending) {
                signedInPending = false;
                signedInUntil = Date.now() + SIGNED_IN_MS;
                window.clearTimeout(signedInTimer);
                signedInTimer = window.setTimeout(function () {
                    signedInTimer = null;
                    signedInUntil = 0;
                    render(snap);
                }, SIGNED_IN_MS);
            }
            if (signedInUntil > Date.now()) view = SIGNED_IN_VIEW;
        }
        el.style.setProperty('--dl-dot', view.dot);
        el.setAttribute('data-phase', phase);
        ui.statusLabel.textContent = view.label;
        ui.status.title = view.label; // the chip may end in … (long labels)

        // A kept dial request goes out as soon as the anchor is ready.
        if (pending && phase === 'ready') {
            var req = pending.req;
            pending = null;
            send('dial', req);
        }

        // Voicemail coming: repaint the line; a saved voicemail is in
        // NetSuite now, so the Voicemail list reloads once for it.
        var vmNow = snap && snap.voicemail;
        if (vmNow && vmNow.state === 'saved' && vmNow.callSid !== vmSavedSid) {
            vmSavedSid = vmNow.callSid;
            loadVoicemails();
        }
        // Its summary is in: once more, so the row shows the brief.
        if (vmNow && vmNow.state === 'saved' && vmNow.summary && vmNow.summary.stage === 'done' && vmNow.callSid !== vmSummarySid) {
            vmSummarySid = vmNow.callSid;
            loadVoicemails();
        }
        if (miss) paintMissVm();

        var m = snap && snap.missedUnseen;
        if (m && m.count > 0 && m.last) {
            missedCaller = m.last;
            missedAt = typeof m.at === 'number' && m.at ? m.at : (missedAt || Date.now());
            // A new miss: pending row on top of Recents (kept after markMissedSeen).
            var at = typeof m.at === 'number' ? m.at : 0;
            var p = pendingMissed;
            if (m.last.number && (!p || (at ? p.at !== at : lastTen(p.caller.number) !== lastTen(m.last.number)))) {
                pendingMissed = { caller: m.last, at: at || Date.now() };
                if (recentRows) renderRecents();
            }
        }
        renderAlert();
        renderRefused();
        renderAlerts();

        // Every snapshot sets all three views, so the panel can never stay on
        // Dial while the anchor is on a call.
        var active = isActive();
        // The call ended: the Dial tab catches up with the page the rep is on.
        if (wasActive && !active && deferredCtx) {
            var later = deferredCtx.ctx;
            deferredCtx = null;
            followContext(later);
        }
        // The call ended: Recents is stale (reloads now if it is in front).
        var focusDone = false;
        if (wasActive && !active) {
            invalidateCallRecords();
            recentsLoaded = false;
            if (tab === 'recents') loadRecents();
            // Wrap-up: the call screen stays (asset 38). Focus on End moves to Done.
            focusDone = !isIncoming() && !ui.live.hidden && ui.live.contains(el.getRootNode().activeElement);
            if (isIncoming() || !startWrap(lastInfo)) focusDone = false;
        }
        wasActive = active;
        // Incoming shows the live view too (caller + Answer / Decline).
        var live = active || isIncoming();
        // A new call (or ring) ends the wrap-up; its saved note may show.
        if (live) endWrap();
        if (live && !wasLive) { wrapLogSkip = false; accKey = null; }
        if (!live) lastInfo = null;
        var wrapping = !live && !!wrapUp;
        // The chip follows the wrap-up (a plain Ready only: an error wins).
        if (wrapping && view === PHASE_VIEW.ready) {
            el.style.setProperty('--dl-dot', WRAP_VIEW.dot);
            ui.statusLabel.textContent = WRAP_VIEW.label;
            ui.status.title = WRAP_VIEW.label;
        }
        // A call that starts (or rings) takes the place of the Voicemail view.
        if (live && !wasLive && vmOpen) {
            vmOpen = false;
            ui.vm.setAttribute('aria-pressed', 'false');
        }
        // ... and of an Add to NetSuite sheet opened between calls.
        if (live && !wasLive && addOpen && !as.live) addOpen = false;
        wasLive = live;
        ui.idle.hidden = audioOpen || vmOpen || addOpen || live || wrapping;
        ui.tabRow.hidden = ui.idle.hidden;
        if (ui.idle.hidden) closeMenu(false);
        ui.live.hidden = audioOpen || vmOpen || addOpen || !(live || wrapping);
        ui.audio.hidden = !audioOpen;
        ui.asPane.hidden = !addOpen;
        ui.vmPane.hidden = !vmOpen;
        if (!vmOpen) vmShownSeen = null;
        if (audioOpen) renderAudio();
        if (live) {
            renderLive();
            // A new call: its lastLog shows even if it reads like the last
            // one; the missed note goes.
            hideNote();
            hideMiss(false);
            noteDismissed = null;
        } else {
            if (liveTimer) { window.clearInterval(liveTimer); liveTimer = null; }
            ui.dtmf.hidden = true;
            ui.keys.setAttribute('aria-pressed', 'false');
            ui.keys.setAttribute('aria-label', 'Show keypad');
            var log = snap && snap.lastLog;
            // A new call log: that record's contacts / snapshot changed.
            var lk = log ? logKey(log) : '';
            if (recordLogKey !== null && lk && lk !== recordLogKey) invalidateCallRecords();
            recordLogKey = lk;
            var kind = ui.note.getAttribute('data-kind');
            if (kind !== 'error') {
                if (log) showLog(log);
                // (The missed note on Dial stays until the rep closes it,
                // also when the anchor restarts without a lastLog.)
                else hideNote();
            }
            if (wrapping) renderWrap();
            if (focusDone) ui.done.focus();
            fitDial();
        }
        syncCallButton();
        followAnswer();
    }

    // Answer sent: once the call is live, End takes focus (panel shown).
    function followAnswer() {
        if (!answerSent) return;
        if (isIncoming()) return;
        answerSent = false;
        if (!isActive() || audioOpen || addOpen || el.hidden || el.classList.contains('closed')) return;
        ui.end.focus();
    }

    // --- Signed out of NetSuite (DESIGN.md §3, asset 37) ---
    // Between calls: the card on top of Dial, the number field, keypad, Call
    // and Backspace dimmed and disabled. During a call: one amber line under
    // the timer (reconciliation logs the call, SPEC §7). When signed_out
    // clears, the card and the dimming fade out (instant with reduced
    // motion) and the next plain Ready chip reads "Signed in · Ready".
    var dimmed = false;          // the Dial view is signed out
    var wasSignedOut = false;    // the last snapshot said signed_out
    var signedInPending = false; // signed_out cleared, Ready not shown yet
    var signedInUntil = 0;
    var signedInTimer = null;
    var soLeaveTimer = null;
    function reducedMotion() {
        try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
    }
    function renderSignedOut() {
        var out = errKind() === 'signed_out';
        if (out) {
            signedInPending = false;
            signedInUntil = 0;
            window.clearTimeout(signedInTimer);
            signedInTimer = null;
        } else if (wasSignedOut) {
            signedInPending = true;
        }
        wasSignedOut = out;
        ui.liveSo.hidden = !(out && isActive());
        setDimmed(out && !isActive() && !isIncoming());
    }
    function setDimmed(on) {
        ui.display.disabled = on;
        ui.clearBtn.disabled = on;
        ui.backspace.disabled = on;
        Array.prototype.forEach.call(ui.dialpad.querySelectorAll('.dl-key'), function (k) { k.disabled = on; });
        if (on === dimmed) return;
        dimmed = on;
        window.clearTimeout(soLeaveTimer);
        soLeaveTimer = null;
        if (on) {
            el.classList.remove('dl-so-leaving');
            el.classList.add('dl-signedout');
            ui.so.hidden = false;
            return;
        }
        el.classList.remove('dl-signedout');
        if (reducedMotion()) { ui.so.hidden = true; return; }
        el.classList.add('dl-so-leaving');
        soLeaveTimer = window.setTimeout(function () {
            soLeaveTimer = null;
            el.classList.remove('dl-so-leaving');
            ui.so.hidden = true;
        }, SO_LEAVE_MS);
    }

    // Error banner (snap.error.kind): one action. In a remote tab the phone
    // cannot be reloaded from here, so Reload / Retry stay in the phone tab.
    // signed_out has no banner: the Dial view's card (renderSignedOut).
    function renderAlert() {
        var kind = errKind();
        var live = isActive() || isIncoming();
        var remote = isRemote();
        var a = null;
        if (kind === 'mic') {
            a = { tone: 'red', title: 'Microphone blocked', text: 'Click the lock icon in the address bar › Allow microphone › reload', act: 'Reload', run: host.reloadPhone, phone: true };
        } else if (kind === 'session') {
            a = null; // the header chip already says "Reconnecting…" (asset 42: say it once)
        } else if (kind === 'paused') {
            a = { tone: 'amber', title: PAUSED_TEXT, text: '', act: '', run: null };
        } else if (kind === 'twilio') {
            a = { tone: 'red', title: 'Phone error', text: String((snap.error && snap.error.message) || ''), act: 'Retry', run: host.reloadPhone, phone: true };
        }
        ui.alert.hidden = !a;
        alertRun = null;
        if (!a) return;
        ui.alert.setAttribute('data-tone', a.tone);
        ui.alertTitle.textContent = a.title;
        ui.alertText.textContent = a.text;
        ui.alertText.hidden = !a.text;
        var canRun = typeof a.run === 'function' && !(a.phone && (remote || live));
        ui.alertAct.hidden = !canRun;
        ui.alertAct.textContent = a.act;
        if (canRun) alertRun = a.run;
    }

    // A quiet line (client: a request that never reached the anchor), the
    // same muted line as a refusal, 4 s.
    function showQuiet(text) {
        ui.refused.textContent = text;
        ui.refused.hidden = false;
        window.clearTimeout(refusedTimer);
        refusedTimer = window.setTimeout(function () { ui.refused.hidden = true; }, REFUSED_SHOW_MS);
    }

    // A request of ours the anchor refused: one muted line for 4 s, once.
    function renderRefused() {
        var r = snap && snap.refused;
        if (!r || !r.nonce || !ownNonces[r.nonce]) return;
        delete ownNonces[r.nonce];
        var text = REFUSED_TEXT[r.reason];
        if (text) showQuiet(text);
    }

    // Call alerts (browser notifications) line under the header. The
    // button only in the shell tab: its click is the gesture the shell
    // needs to ask for permission.
    function renderAlerts() {
        var notify = snap && snap.notify;
        var ask = host.mode === 'shell' && notify === 'default';
        var off = notify === 'denied';
        ui.alertsBtn.hidden = !ask;
        ui.alertsOff.hidden = !off;
        ui.alerts.hidden = !ask && !off;
    }

    function focusPanel(what) {
        if (addOpen) { ui.asBack.focus(); return; }
        if (audioOpen) { ui.audioBack.focus(); return; }
        if (vmOpen) { ui.vmBack.focus(); return; }
        if (isIncoming() && !answerSent) { ui.answer.focus(); return; }
        if (isActive() || answerSent) { ui.end.focus(); return; }
        if (wrapUp) { ui.done.focus(); return; }
        if (what === 'call' && tab === 'dial' && !ui.call.disabled) { ui.call.focus(); return; }
        if (tab === 'dial' && dimmed) { ui.soBtn.focus(); return; }
        if (tab === 'search') ui.query.focus();
        else if (tab === 'recents') ui.tabs[2].focus();
        else ui.display.focus();
    }

    // Clear the Dial tab's record (the frame left the record page).
    // The record the rep let go by clearing or editing its number: the
    // page it came from does not load it again until the page changes.
    var dismissedId = '';
    function unloadRecord() {
        closeTargets(false);
        target = null;
        contactsSeq++;
        renderTrig();
        renderInsight(null);
    }
    function dropRecord() {
        if (!target) return;
        dismissedId = String(target.entityId || '');
        unloadRecord();
    }
    function clearEntity() {
        unloadRecord();
        setDisplay('', false);
    }

    function hasRecord(c) { return !!(c && (c.entityId || c.phone)); }

    // Follow the NetSuite frame's record, unless the rep typed a number.
    function followContext(c) {
        if (manual) return;
        if (hasRecord(c) && dismissedId && String(c.entityId || '') === dismissedId) return;
        dismissedId = '';
        if (hasRecord(c)) {
            loadEntity(c);
            if (el.hidden) setTab('dial');
        } else if (target) {
            clearEntity();
        }
    }

    // --- Initial state from the page ---
    var ctx = cfg.context || null;
    if (hasRecord(ctx)) {
        loadEntity(ctx);
        setTab('dial');
    } else {
        setTab(cfg.restletUrl ? 'search' : 'dial');
    }

    host.registerPanel({
        el: el,
        handle: ui.head,
        render: function (next) {
            if (ui.note.getAttribute('data-kind') === 'error' && next && next.phase === 'ready' && !pending) {
                ui.note.removeAttribute('data-kind');
            }
            render(next);
        },
        // From a Call click: load the record (if any) on Dial. Never dials.
        open: function (opts) {
            var c = opts && opts.ctx;
            audioOpen = false;
            ui.gear.setAttribute('aria-pressed', 'false');
            vmOpen = false;
            ui.vm.setAttribute('aria-pressed', 'false');
            addOpen = false;
            if (!isActive() && hasRecord(c)) {
                endWrap();
                loadEntity(c);
                setTab('dial');
            }
            render(snap);
        },
        // The NetSuite frame moved to another page. Follow it only between
        // calls (a page reached during a call applies when it ends) and only
        // when the rep has not typed a number by hand.
        setContext: function (c) {
            if (isActive()) { deferredCtx = { ctx: c }; return; }
            deferredCtx = null;
            followContext(c);
        },
        focus: function (what) { window.setTimeout(function () { focusPanel(what); }, 0); },
        // Answer went out from the pill or the incoming card (the client
        // opens the panel next): show the call view, focus End once live.
        answered: function () {
            if (!isIncoming()) return;
            answerSent = true;
            render(snap);
        },
        // Wrap-up pill Call back: dial the last call through the Dial tab.
        callBack: function (c) { callBack(c); },
        // The panel opened (true) or closed (false): Voicemail refreshes on
        // open (at most once per VM_MIN_GAP_MS) and every VM_REFRESH_MS
        // while it shows; menus close with it.
        shown: function (open) {
            panelShown = !!open;
            window.clearTimeout(vmTimer);
            vmTimer = null;
            if (!panelShown) { closeMenu(false); closeTargets(false); vmShownSeen = null; return; }
            fitAcc();
            loadVoicemailsSoon();
            if (vmOpen) markVmSeen();
            scheduleVm();
        },
        // Shared UI state (client): the view in front, and a view to show.
        // 'call' shows by itself while a call is live; nothing else to do.
        view: currentView,
        setView: function (v) {
            // During the wrap-up the tab changes under it (the shared state
            // applies on focus too, so it never ends the wrap-up).
            if ((v === 'dial' || v === 'search' || v === 'recents') && v !== tab) setTab(v);
        },
        // A quiet error from the client (a request dropped before the anchor
        // was ready, or lost in an anchor change).
        quiet: showQuiet
    });
})();
