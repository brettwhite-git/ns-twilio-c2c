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
 */
(function () {
    'use strict';

    var dock = window.__ctcDock;
    if (!dock || !dock.host || dock.host.dialer) return;
    var host = dock.host;
    var cfg = host.cfg;
    host.dialer = true;
    var formatPhone = dock.formatPhone;
    var initials = dock.initials;

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
    var TYPE_LABEL = { customer: 'CUSTOMER', prospect: 'PROSPECT', lead: 'LEAD', contact: 'CONTACT' };
    var LONG_PRESS_MS = 500; // a press on backspace this long clears the number
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
        ready: { dot: T.goDot, label: 'Ready to call' },
        dialing: { dot: T.amber, label: 'Calling…' },
        ringing: { dot: T.amber, label: 'Ringing…' },
        incoming: { dot: T.ring, label: 'Incoming call' }, // ring: ringing reads apart from talking
        answering: { dot: T.goDot, label: 'Connecting…' },
        connected: { dot: T.goDot, label: 'Connected' },
        reconnecting: { dot: T.amber, label: 'Reconnecting…' },
        moved: { dot: T.offline, label: 'Phone moved to another tab' }
    };
    // Header badge for snap.error.kind between calls.
    var ERROR_VIEW = {
        mic: { dot: T.stopDot, label: 'Microphone blocked' },
        session: { dot: T.amber, label: 'Signing in…' },
        network: { dot: T.amber, label: 'Reconnecting…' },
        twilio: { dot: T.stopDot, label: 'Phone error' },
        paused: { dot: T.offline, label: 'Calling paused' }
    };
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
    // Recents direction icons: arrow down-left (in, missed), up-right (out).
    var DIR_VIEW = {
        'in': { label: 'Inbound call', path: 'M17 7L7 17M7 9v8h8' },
        out: { label: 'Outbound call', path: 'M7 17L17 7M9 7h8v8' },
        missed: { label: 'Missed call', path: 'M17 7L7 17M7 9v8h8' }
    };

    host.css([
        // Position, width and height come from the client (placePanel): one
        // size for every view. Header and footer stay; the body fills the
        // rest and scrolls. The panel is not inside .dock, so it restates the
        // dock's font and pointer rules.
        '.dl{position:fixed;left:0;top:0;width:380px;display:flex;flex-direction:column;color:#FFFFFF;pointer-events:auto;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}',
        // Open / close: fade + 12 px slide from the panel's edge (data-side
        // from the client: l, r, else the row's t or b).
        '.dl.closed{opacity:0;transform:translateX(12px);pointer-events:none}',
        '.dl[data-side="l"].closed{transform:translateX(-12px)}',
        '.dl[data-side="t"].closed{transform:translateY(-12px)}',
        '.dl[data-side="b"].closed{transform:translateY(12px)}',
        '.dl-head{position:relative;display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;padding:18px 14px 0;flex-shrink:0;cursor:grab;user-select:none;-webkit-user-select:none}',
        // Call alerts line under the header buttons (notify default / denied).
        '.dl-alerts{flex-basis:100%;display:flex;justify-content:center;min-height:24px;align-items:center}',
        '.dl-alerts .dl-text{font-size:11.5px;padding:4px 8px}',
        '.dl-alerts-off{font-size:11px;color:#6B7B95}',
        '.dl-head:active{cursor:grabbing}',
        '.dl-head button{cursor:pointer}',
        // The grip says the panel can be dragged (same dots as the pill grip).
        '.dl-grip{position:absolute;top:6px;left:50%;transform:translateX(-50%);display:grid;grid-template-columns:repeat(3,3px);gap:3px;pointer-events:none}',
        '.dl-grip i{width:3px;height:3px;border-radius:999px;background:rgba(255,255,255,0.32)}',
        // The status badge sits in the middle of the header, level with the
        // gear and collapse buttons (head padding-top 18 + half of 32 px).
        '.dl-head .dl-status{position:absolute;left:50%;top:34px;transform:translate(-50%,-50%)}',
        '.dl-status{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:999px;font-size:11.5px;color:var(--dl-dot,#94A6BF);background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08)}',
        '.dl-status .dot{width:6px;height:6px;background:var(--dl-dot,#94A6BF)}',
        // incoming: the status dot rings like the pill dot (keyframes in the client CSS)
        '.dl[data-phase="incoming"] .dl-status .dot{animation:ctc-ring 1.6s cubic-bezier(0.23,1,0.32,1) infinite}',
        '.dl-icon{width:32px;height:32px;border-radius:10px;background:transparent;color:#94A6BF;display:inline-flex;align-items:center;justify-content:center}',
        '.dl-icon:hover{background:rgba(255,255,255,0.08);color:#FFFFFF}',
        '.dl-icon[aria-pressed="true"]{background:rgba(255,255,255,0.12);color:#FFFFFF}',
        '.dl-note{flex-shrink:0;margin:10px 14px 0;padding:8px 10px;border-radius:14px;background:rgba(255,255,255,0.06);display:flex;align-items:center;gap:8px;font-size:12px}',
        '.dl-note-text{flex:1;min-width:0}',
        '.dl-note a{color:#B6DCFA;text-decoration:none}',
        '.dl-note a:hover{text-decoration:underline}',
        '.dl-note-x{width:24px;height:24px;flex-shrink:0;margin:-4px -4px -4px 0;border-radius:6px;background:transparent;color:#94A6BF;display:inline-flex;align-items:center;justify-content:center}',
        '.dl-note-x:hover{background:rgba(255,255,255,0.08);color:#FFFFFF}',
        '.dl-note .dl-text{flex-shrink:0;padding:4px 8px;font-size:12px}',
        // Missed call: text + close on the first row, Call back + Open record under it.
        '.dl-note[data-kind="missed"]{flex-wrap:wrap;row-gap:4px}',
        '.dl-note[data-kind="missed"] .dl-note-text{order:-2;flex-basis:calc(100% - 32px)}',
        '.dl-note[data-kind="missed"] .dl-note-x{order:-1}',
        '.dl-note[data-kind="missed"] .dl-note-call{margin-left:-8px}',
        // Error banner (snap.error.kind): what happened, what to do, one action.
        '.dl-alert{flex-shrink:0;margin:10px 14px 0;padding:10px 12px;border-radius:14px;background:' + rgba(T.stopDot, 0.12) + ';border:1px solid ' + rgba(T.stopDot, 0.30) + ';display:flex;flex-direction:column;align-items:flex-start;gap:4px;font-size:12px}',
        '.dl-alert[data-tone="amber"]{background:rgba(244,199,106,0.10);border-color:rgba(244,199,106,0.30)}',
        '.dl-alert-title{font-weight:600;line-height:1.4}',
        '.dl-alert-text{color:#C9D3E1;line-height:1.45;overflow-wrap:anywhere}',
        '.dl-alert-act{margin:2px 0 0 -8px}',
        // Refused request: one muted line, 4 s.
        '.dl-refused{flex-shrink:0;margin:8px 14px 0;font-size:12px;color:#94A6BF;text-align:center}',
        // Remote control (outside tab): where the audio is.
        '.dl-remote{flex-shrink:0;padding:0 14px 12px;background:rgba(0,0,0,0.12);font-size:11px;color:#94A6BF;text-align:center}',
        '.dl-pane{display:flex;flex-direction:column;flex:1 1 auto;min-height:0}',
        '.dl-body{flex:1 1 auto;min-height:0;overflow:auto;padding:10px 14px 0;display:flex;flex-direction:column;gap:10px}',
        // Dial · Search · Recents: one centred row, 28 px apart.
        '.dl-tabs{display:flex;justify-content:center;gap:28px;padding:2px;border-radius:999px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08)}',
        '.dl-tab{padding:6px 12px;border-radius:999px;background:transparent;font-size:11.5px;font-weight:600;color:#94A6BF}',
        '.dl-tab[aria-selected="true"]{background:rgba(255,255,255,0.16);color:#FFFFFF}',
        '.dl-box{padding:10px 12px;border-radius:16px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);display:flex;flex-direction:column;gap:8px}',
        '.dl-entity-top{display:flex;align-items:center;gap:10px}',
        '.dl-av{width:26px;height:26px;border-radius:7px;background:linear-gradient(135deg,#38507A 0%,#1F2F4D 100%);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;flex-shrink:0}',
        '.dl-entity-name{flex:1;min-width:0;font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
        '.dl-badge{font-size:9px;letter-spacing:0.10em;color:#93C7AA;padding:1px 6px;border-radius:999px;border:1px solid ' + rgba(T.goDot, 0.30) + ';background:' + rgba(T.goDot, 0.08) + '}',
        '.dl-field{display:flex;align-items:center;gap:8px;padding:0 4px 0 9px;height:32px;border-radius:7px;border:1px solid rgba(255,255,255,0.08)}',
        '.dl-field span{font-family:"SF Mono","JetBrains Mono",Menlo,Consolas,monospace;font-size:9px;letter-spacing:0.08em;color:#94A6BF;width:52px;flex-shrink:0}',
        '.dl-field select{flex:1;min-width:0;height:30px;background:transparent;color:#FFFFFF;border:0;font:inherit;font-size:12px;cursor:pointer}',
        '.dl-field select option{color:#161513}',
        '.dl-field select:focus-visible{outline:2px solid ' + T.ring + ';outline-offset:1px;border-radius:4px}',
        '.dl-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px}',
        '.dl-tiles.two{grid-template-columns:repeat(2,minmax(0,1fr))}',
        '.dl-tile{padding:6px 8px;border-radius:8px;border:1px solid rgba(255,255,255,0.08);display:flex;flex-direction:column;gap:2px;min-width:0;color:#FFFFFF;text-decoration:none}',
        'a.dl-tile:hover{background:rgba(255,255,255,0.06)}',
        'a.dl-tile:focus-visible{outline:2px solid ' + T.ring + ';outline-offset:2px}',
        '.dl-k{font-family:"SF Mono","JetBrains Mono",Menlo,Consolas,monospace;font-size:8.5px;letter-spacing:0.10em;color:#94A6BF}',
        '.dl-v{font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
        '.dl-v.link{color:#B6DCFA}',
        '.dl-v.gold{color:#F4C76A;font-weight:600;font-size:13px}',
        '.dl-v.mint{color:#B5EFD0;font-weight:600;font-size:13px}',
        '.dl-display{width:100%;height:40px;background:transparent;border:0;border-bottom:1px solid rgba(255,255,255,0.08);color:#FFFFFF;text-align:center;font-family:"SF Mono","JetBrains Mono",Menlo,Consolas,monospace;font-size:20px;font-weight:300;letter-spacing:0.02em}',
        '.dl-display::placeholder{color:#6B7B95}',
        '.dl-display:focus-visible{outline:none;border-bottom-color:' + T.ring + '}',
        // Quick clear: a 24 px x inside the number field, only when it holds a number.
        '.dl-display-wrap{position:relative}',
        '.dl-display-wrap .dl-display{padding:0 36px}',
        '.dl-clear{position:absolute;right:4px;top:50%;transform:translateY(-50%);width:24px;height:24px;padding:0;border-radius:999px;background:rgba(255,255,255,0.12);color:#FFFFFF;display:inline-flex;align-items:center;justify-content:center}',
        '.dl-clear:hover{background:rgba(255,255,255,0.20)}',
        '.dl-clear:active{transform:translateY(-50%) scale(0.97)}',
        '.dl-pad{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px}',
        '.dl-key{height:44px;border-radius:10px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px}',
        '.dl-key:hover{background:rgba(255,255,255,0.10)}',
        '.dl-key b{font-size:15px;font-weight:500;line-height:1}',
        '.dl-key i{font-style:normal;font-size:7px;letter-spacing:0.14em;font-weight:600;color:#94A6BF;min-height:7px;line-height:1}',
        '.dl-foot{flex-shrink:0;margin-top:10px;padding:12px 14px 14px;border-top:1px solid rgba(255,255,255,0.06);background:rgba(0,0,0,0.12);display:flex;justify-content:center;align-items:flex-start;gap:28px}',
        '.dl-act{display:flex;flex-direction:column;align-items:center;gap:5px;font-family:"SF Mono","JetBrains Mono",Menlo,Consolas,monospace;font-size:9px;letter-spacing:0.08em;color:#94A6BF}',
        '.dl-btn{width:44px;height:44px;border-radius:14px;background:rgba(255,255,255,0.10);color:#FFFFFF;display:flex;align-items:center;justify-content:center}',
        '.dl-btn:hover{background:rgba(255,255,255,0.18)}',
        '.dl-btn.big{width:52px;height:52px;border-radius:16px}',
        '.dl-btn.call{background:' + T.go + ';box-shadow:0 5px 16px ' + rgba(T.go, 0.32) + '}',
        '.dl-btn.call:hover{background:' + T.goHover + '}',
        '.dl-btn.end{background:' + T.stop + ';box-shadow:0 5px 16px ' + rgba(T.stop, 0.32) + '}',
        '.dl-btn.end:hover{background:' + T.stopHover + '}',
        '.dl-btn[aria-pressed="true"]{background:#F4C76A;color:#1F2F4D;box-shadow:0 4px 12px rgba(244,199,106,0.4)}',
        '.dl-keys[aria-pressed="true"]{background:rgba(255,255,255,0.24);color:#FFFFFF;box-shadow:none}',
        '.dl-btn[disabled]{opacity:0.4;cursor:default;box-shadow:none}',
        '.dl-q{width:100%;height:44px;flex-shrink:0;padding:0 14px;border-radius:12px;border:1px solid rgba(255,255,255,0.10);background:rgba(255,255,255,0.06);color:#FFFFFF;font:inherit;font-size:13px}',
        '.dl-q::placeholder{color:#94A6BF}',
        '.dl-q:focus-visible{outline:2px solid ' + T.ring + ';outline-offset:1px}',
        '.dl-chips{display:flex;flex-wrap:wrap;gap:6px}',
        '.dl-chip{display:inline-flex;align-items:center;min-height:24px;padding:4px 10px;border-radius:999px;font-size:11px;color:#94A6BF;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08)}',
        '.dl-chip[aria-pressed="true"]{color:#FFFFFF;background:rgba(255,255,255,0.16)}',
        '.dl-chip em{font-style:normal;margin-left:4px;opacity:0.8}',
        '.dl-sect{text-align:center;font-family:"SF Mono","JetBrains Mono",Menlo,Consolas,monospace;font-size:9px;letter-spacing:0.08em;color:#94A6BF;text-transform:uppercase}',
        '.dl-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px}',
        // Lists fill the rest of the body and scroll on their own.
        // The 3 px padding keeps the rows' focus rings inside the scroll box.
        '.dl-view{flex:1 1 auto;min-height:0}',
        '.dl-results,.dl-recent-list{flex:1 1 auto;min-height:0;overflow:auto;padding:3px;margin:-3px}',
        '.dl-row{width:100%;padding:8px 10px;border-radius:10px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:10px;text-align:left}',
        '.dl-row:hover{background:rgba(255,255,255,0.08)}',
        '.dl-row-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}',
        '.dl-row-name{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
        '.dl-row-sub{font-size:11px;color:#94A6BF;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
        // Recents: the card is the list item, so a missed row can carry a
        // Call back button next to the row button (no button inside a button).
        '.dl-recent{display:flex;align-items:center;gap:4px;border-radius:10px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06)}',
        '.dl-recent:hover{background:rgba(255,255,255,0.08)}',
        '.dl-recent .dl-row,.dl-recent .dl-row:hover{flex:1;min-width:0;background:transparent;border:0}',
        '.dl-recent-cb{flex-shrink:0;margin-right:6px}',
        // Direction icon: 20 px circle, 12 px arrow (panel tints of the
        // portlet's In / Out / Missed colours; arrow vs circle >= 5:1).
        '.dl-dir{width:20px;height:20px;border-radius:999px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center}',
        '.dl-dir-in{background:' + rgba(T.ring, 0.18) + ';color:#9FD0FA}',
        '.dl-dir-out{background:rgba(255,255,255,0.10);color:#C9D3E1}',
        '.dl-dir-missed{background:' + rgba(T.stopDot, 0.20) + ';color:#FFA595}',
        '.dl-row-flag{color:#FF9E8C;font-weight:600}',
        '.dl-row-meta{font-family:"SF Mono","JetBrains Mono",Menlo,Consolas,monospace;font-size:10px;color:#94A6BF;flex-shrink:0;text-align:right;white-space:pre-line}',
        '.dl-empty,.dl-msg{font-size:12px;color:#94A6BF;text-align:center;padding:12px 0}',
        '.dl-msg.err{color:#FCA5A5}',
        '.dl-live{flex:1 1 auto;min-height:0;overflow:auto;padding:24px 14px 0;display:flex;flex-direction:column;align-items:center;gap:4px}',
        '.dl-live-av{width:68px;height:68px;border-radius:999px;background:linear-gradient(135deg,#38507A 0%,#1F2F4D 100%);border:2px solid rgba(255,255,255,0.08);box-shadow:0 3px 12px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:600;margin-bottom:10px}',
        '.dl-live-name{font-size:20px;font-weight:600;letter-spacing:-0.01em;text-align:center}',
        '.dl-live-sub{font-size:11.5px;color:#94A6BF}',
        '.dl-live-time{font-family:"SF Mono","JetBrains Mono",Menlo,Consolas,monospace;font-variant-numeric:tabular-nums;font-size:26px;font-weight:300;letter-spacing:0.04em;margin-top:8px;min-height:32px}',
        '.dl-live-warn{font-size:12px;color:#F4C76A;margin-top:2px}',
        '.dl-live .dl-tiles{width:100%;margin-top:18px}',
        '.dl-live .dl-pad{width:100%;margin-top:14px}',
        '.dl-audio-top{display:flex;align-items:center;gap:8px}',
        '.dl-audio-title{font-size:14px;font-weight:600}',
        '.dl-text{background:transparent;color:#B6DCFA;font-size:12.5px;padding:6px 8px;border-radius:8px}',
        '.dl-text:hover{background:rgba(255,255,255,0.06)}',
        '.dl-afield{display:flex;flex-direction:column;gap:6px;font-size:12px;color:#94A6BF}',
        '.dl-afield select{width:100%;height:36px;padding:0 10px;border-radius:10px;border:1px solid rgba(255,255,255,0.10);background:rgba(255,255,255,0.06);color:#FFFFFF;font:inherit;font-size:13px;cursor:pointer}',
        '.dl-afield select option{color:#161513}',
        '.dl-afield select:focus-visible{outline:2px solid ' + T.ring + ';outline-offset:1px}',
        '.dl-afield select[disabled]{opacity:0.5;cursor:default}',
        '.dl-audio-msg{text-align:left;padding:0}',
        '.dl-exit{align-self:flex-start;margin-top:8px}',
        '@media (prefers-reduced-motion: reduce){.dl *{transition:none}.dl[data-phase="incoming"] .dl-status .dot{animation:none}.dl.closed,.dl[data-side].closed{transform:none}}'
    ].join('\n'));

    // --- Markup (static; data goes in with textContent) ---
    var keyHtml = KEYS.map(function (k) {
        return '<button type="button" class="dl-key" data-key="' + k[0] + '" aria-label="' + k[0] + '"><b>' + k[0] + '</b><i>' + k[1] + '</i></button>';
    }).join('');

    var el = document.createElement('section');
    el.className = 'card navy dl';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Phone');
    el.innerHTML = ''
        + '<div class="dl-head" title="Drag to move the phone">'
        +   '<span class="dl-grip" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></span>'
        +   '<span class="dl-status"><span class="dot"></span><span class="dl-status-label"></span></span>'
        +   '<span class="spacer"></span>'
        +   '<button type="button" class="dl-icon dl-gear" aria-label="Audio settings" aria-pressed="false"><svg width="16" height="16" viewBox="0 0 24 24" ' + STROKE + '><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"></path></svg></button>'
        +   '<button type="button" class="dl-icon dl-close" aria-label="Collapse phone"><svg width="16" height="16" viewBox="0 0 24 24" ' + STROKE + '><path d="M6 9l6 6 6-6"></path></svg></button>'
        +   '<div class="dl-alerts" hidden><button type="button" class="dl-text dl-alerts-btn" hidden>Get call alerts</button><span class="dl-alerts-off" hidden>Call alerts are off in this browser</span></div>'
        + '</div>'
        + '<div class="dl-note" role="status" hidden><span class="dl-note-text"></span>'
        +   '<button type="button" class="dl-text dl-note-call" hidden>Call back</button>'
        +   '<a class="dl-note-link" href="#" target="_top">Open record →</a>'
        +   '<button type="button" class="dl-note-x" aria-label="Dismiss"><svg width="12" height="12" viewBox="0 0 24 24" ' + STROKE + '><path d="M6 6l12 12M18 6L6 18"></path></svg></button>'
        + '</div>'
        + '<div class="dl-alert" role="status" hidden><div class="dl-alert-title"></div><div class="dl-alert-text" hidden></div><button type="button" class="dl-text dl-alert-act" hidden></button></div>'
        + '<div class="dl-refused" role="status" hidden></div>'
        // Idle: tabs
        + '<div class="dl-idle dl-pane">'
        +   '<div class="dl-body">'
        +     '<div class="dl-tabs" role="tablist" aria-label="Phone views">'
        +       '<button type="button" class="dl-tab" role="tab" data-tab="dial" aria-selected="true">Dial</button>'
        +       '<button type="button" class="dl-tab" role="tab" data-tab="search" aria-selected="false">Search</button>'
        +       '<button type="button" class="dl-tab" role="tab" data-tab="recents" aria-selected="false">Recents</button>'
        +     '</div>'
        +     '<div class="dl-view" data-view="dial" role="tabpanel" style="display:flex;flex-direction:column;gap:10px">'
        +       '<div class="dl-box dl-entity" hidden>'
        +         '<div class="dl-entity-top"><span class="dl-av" aria-hidden="true"></span><span class="dl-entity-name"></span><span class="dl-badge"></span></div>'
        +         '<label class="dl-field dl-contact-row"><span>CONTACT</span><select class="dl-contact"></select></label>'
        +         '<label class="dl-field dl-number-row"><span>NUMBER</span><select class="dl-number"></select></label>'
        +       '</div>'
        +       '<div class="dl-tiles dl-entity-tiles" hidden>'
        +         '<a class="dl-tile dl-open" href="#" target="_top"><span class="dl-k">NS</span><span class="dl-v link">Open record →</span></a>'
        +         '<div class="dl-tile"><span class="dl-k">BALANCE</span><span class="dl-v dl-bal">—</span></div>'
        +         '<div class="dl-tile"><span class="dl-k">LAST ACTIVITY</span><span class="dl-v dl-last">—</span></div>'
        +       '</div>'
        +       '<div class="dl-display-wrap">'
        +         '<input type="tel" class="dl-display" aria-label="Number to call" placeholder="Enter a number" autocomplete="off">'
        +         '<button type="button" class="dl-clear" aria-label="Clear number" hidden><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg></button>'
        +       '</div>'
        +       '<div class="dl-pad dl-dialpad">' + keyHtml + '</div>'
        +     '</div>'
        +     '<div class="dl-view" data-view="search" role="tabpanel" hidden style="display:flex;flex-direction:column;gap:10px">'
        +       '<input type="search" class="dl-q" aria-label="Search your book" placeholder="Search company, contact, or phone">'
        +       '<div class="dl-chips" role="group" aria-label="Filter by type">'
        +         '<button type="button" class="dl-chip" data-type="" aria-pressed="true">All<em data-count=""></em></button>'
        +         '<button type="button" class="dl-chip" data-type="customer" aria-pressed="false">Customers<em data-count="customer"></em></button>'
        +         '<button type="button" class="dl-chip" data-type="prospect" aria-pressed="false">Prospects<em data-count="prospect"></em></button>'
        +         '<button type="button" class="dl-chip" data-type="lead" aria-pressed="false">Leads<em data-count="lead"></em></button>'
        +       '</div>'
        +       '<div class="dl-sect dl-search-label">Suggested · your book</div>'
        +       '<ul class="dl-list dl-results"></ul>'
        +       '<div class="dl-msg dl-search-msg" role="status"></div>'
        +     '</div>'
        +     '<div class="dl-view" data-view="recents" role="tabpanel" hidden style="display:flex;flex-direction:column;gap:10px">'
        +       '<div class="dl-sect">Last 7 days</div>'
        +       '<ul class="dl-list dl-recent-list"></ul>'
        +       '<div class="dl-msg dl-recent-msg" role="status"></div>'
        +     '</div>'
        +   '</div>'
        +   '<div class="dl-foot">'
        +     '<span class="dl-act"><button type="button" class="dl-btn big call dl-call" aria-label="Call"><svg width="22" height="22" viewBox="0 0 24 24" fill="#FFFFFF" aria-hidden="true">' + ICON_PHONE + '</svg></button>CALL</span>'
        +     '<span class="dl-act"><button type="button" class="dl-btn dl-backspace" aria-label="Delete last digit"><svg width="18" height="18" viewBox="0 0 24 24" ' + STROKE + '><path d="M21 5H9l-6 7 6 7h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1zM17 9l-6 6M11 9l6 6"></path></svg></button>BACK</span>'
        +   '</div>'
        + '</div>'
        // Live: in-call
        + '<div class="dl-live-wrap dl-pane" hidden>'
        +   '<div class="dl-live">'
        +     '<div class="dl-live-av" aria-hidden="true"></div>'
        +     '<div class="dl-live-name"></div>'
        +     '<div class="dl-live-sub"></div>'
        +     '<div class="dl-live-time" aria-label="Call time"></div>'
        +     '<div class="dl-live-warn" role="status" hidden></div>'
        +     '<div class="dl-tiles two dl-live-tiles" hidden>'
        +       '<div class="dl-tile"><span class="dl-k">BALANCE</span><span class="dl-v gold dl-live-bal">—</span></div>'
        +       '<div class="dl-tile"><span class="dl-k">OPEN OPPS</span><span class="dl-v mint dl-live-opps">—</span></div>'
        +     '</div>'
        +     '<div class="dl-pad dl-dtmf" hidden>' + keyHtml + '</div>'
        +   '</div>'
        +   '<div class="dl-foot">'
        +     '<span class="dl-act dl-ring-act" hidden><button type="button" class="dl-btn big end dl-decline" aria-label="Decline call"><svg width="22" height="22" viewBox="0 0 24 24" fill="#FFFFFF" aria-hidden="true" style="transform:rotate(135deg)">' + ICON_PHONE + '</svg></button>DECLINE</span>'
        +     '<span class="dl-act dl-ring-act" hidden><button type="button" class="dl-btn big call dl-answer" aria-label="Answer call"><svg width="22" height="22" viewBox="0 0 24 24" fill="#FFFFFF" aria-hidden="true">' + ICON_PHONE + '</svg></button>ANSWER</span>'
        +     '<span class="dl-act dl-call-act"><button type="button" class="dl-btn dl-mute" aria-label="Mute" aria-pressed="false"><svg width="18" height="18" viewBox="0 0 24 24" ' + STROKE + '>' + ICON_MIC + '</svg></button><span class="dl-mute-label">MUTE</span></span>'
        +     '<span class="dl-act dl-call-act"><button type="button" class="dl-btn big end dl-end" aria-label="End call"><svg width="22" height="22" viewBox="0 0 24 24" fill="#FFFFFF" aria-hidden="true" style="transform:rotate(135deg)">' + ICON_PHONE + '</svg></button>END</span>'
        +     '<span class="dl-act dl-call-act"><button type="button" class="dl-btn dl-keys" aria-label="Show keypad" aria-pressed="false"><svg width="18" height="18" viewBox="0 0 24 24" ' + STROKE + '><circle cx="6" cy="5" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="18" cy="5" r="1"></circle><circle cx="6" cy="11" r="1"></circle><circle cx="12" cy="11" r="1"></circle><circle cx="18" cy="11" r="1"></circle><circle cx="6" cy="17" r="1"></circle><circle cx="12" cy="17" r="1"></circle><circle cx="18" cy="17" r="1"></circle><circle cx="12" cy="22" r="1"></circle></svg></button>KEYPAD</span>'
        +   '</div>'
        + '</div>'
        // Audio settings (gear)
        + '<div class="dl-audio-wrap dl-pane" hidden>'
        +   '<div class="dl-body" style="padding-bottom:14px">'
        +     '<div class="dl-audio-top"><button type="button" class="dl-text dl-audio-back">Back</button><span class="dl-audio-title">Audio</span></div>'
        +     '<div class="dl-msg dl-audio-msg" role="status"></div>'
        +     '<label class="dl-afield dl-in-row">Microphone<select class="dl-in"></select></label>'
        +     '<label class="dl-afield dl-out-row">Speaker<select class="dl-out"></select></label>'
        +     '<button type="button" class="dl-text dl-exit">Exit phone mode</button>'
        +     '<button type="button" class="dl-text dl-exit dl-use-here" hidden>Use phone here</button>'
        +   '</div>'
        + '</div>'
        + '<div class="dl-remote" hidden>Audio plays in your phone tab.</div>';

    var q = function (sel) { return el.querySelector(sel); };
    var qa = function (sel) { return Array.prototype.slice.call(el.querySelectorAll(sel)); };
    var ui = {
        status: q('.dl-status'), statusLabel: q('.dl-status-label'),
        gear: q('.dl-gear'), close: q('.dl-close'),
        note: q('.dl-note'), noteText: q('.dl-note-text'), noteLink: q('.dl-note-link'), noteX: q('.dl-note-x'),
        idle: q('.dl-idle'), live: q('.dl-live-wrap'),
        tabs: qa('.dl-tab'), views: qa('.dl-view'),
        entity: q('.dl-entity'), av: q('.dl-av'), entityName: q('.dl-entity-name'), badge: q('.dl-badge'),
        contactRow: q('.dl-contact-row'), contact: q('.dl-contact'), numberRow: q('.dl-number-row'), number: q('.dl-number'),
        tiles: q('.dl-entity-tiles'), open: q('.dl-open'), bal: q('.dl-bal'), last: q('.dl-last'),
        display: q('.dl-display'), clearBtn: q('.dl-clear'), dialpad: q('.dl-dialpad'),
        call: q('.dl-call'), backspace: q('.dl-backspace'),
        query: q('.dl-q'), chips: qa('.dl-chip'), searchLabel: q('.dl-search-label'),
        results: q('.dl-results'), searchMsg: q('.dl-search-msg'),
        recents: q('.dl-recent-list'), recentMsg: q('.dl-recent-msg'),
        liveAv: q('.dl-live-av'), liveName: q('.dl-live-name'), liveSub: q('.dl-live-sub'), liveTime: q('.dl-live-time'),
        liveTiles: q('.dl-live-tiles'), liveBal: q('.dl-live-bal'), liveOpps: q('.dl-live-opps'),
        dtmf: q('.dl-dtmf'), mute: q('.dl-mute'), muteLabel: q('.dl-mute-label'), end: q('.dl-end'), keys: q('.dl-keys'),
        answer: q('.dl-answer'), decline: q('.dl-decline'), ringActs: qa('.dl-ring-act'), callActs: qa('.dl-call-act'),
        head: q('.dl-head'), audio: q('.dl-audio-wrap'), audioBack: q('.dl-audio-back'), audioMsg: q('.dl-audio-msg'),
        inRow: q('.dl-in-row'), inSel: q('.dl-in'), outRow: q('.dl-out-row'), outSel: q('.dl-out'), exit: q('.dl-exit:not(.dl-use-here)'),
        useHere: q('.dl-use-here'), remote: q('.dl-remote'), noteCall: q('.dl-note-call'),
        alert: q('.dl-alert'), alertTitle: q('.dl-alert-title'), alertText: q('.dl-alert-text'), alertAct: q('.dl-alert-act'),
        refused: q('.dl-refused'), liveWarn: q('.dl-live-warn'),
        alerts: q('.dl-alerts'), alertsBtn: q('.dl-alerts-btn'), alertsOff: q('.dl-alerts-off')
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
    var snapshotCache = {};
    var searchType = '';
    var searchSeq = 0;
    var searchTimer = null;
    var suggested = null;
    var bookCounts = null;
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
    var noteMissed = null;    // { name, number, entityId, entityType } the missed note calls back
    var missedCaller = null;  // newest snap.missedUnseen.last (kept after markMissedSeen)
    var ownNonces = {};       // nonces of requests this panel sent (refused lines)
    // Answer sent from this tab (panel ring view, pill or incoming card):
    // the live view shows the call controls at once, and End takes focus
    // when the phase goes live. Cleared then, or when the ring ends.
    var answerSent = false;
    var refusedTimer = null;
    var alertRun = null;

    // --- Helpers ---
    function api(action, body) {
        if (!cfg.restletUrl) return Promise.reject(new Error('Phone data is not available on this page'));
        var payload = { action: action };
        if (body) for (var k in body) if (Object.prototype.hasOwnProperty.call(body, k)) payload[k] = body[k];
        return fetch(cfg.restletUrl, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        }).then(function (d) {
            if (d && d.error) throw new Error(String(d.error));
            return d || {};
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
        ui.call.parentNode.hidden = next !== 'dial';
        ui.backspace.parentNode.hidden = next !== 'dial';
        if (next === 'search' && suggested === null) loadSuggested();
        if (next === 'recents' && (!recentsLoaded || Date.now() - recentsAt > RECENTS_STALE_MS)) loadRecents();
    }

    ui.tabs.forEach(function (t) {
        t.addEventListener('click', function () { setTab(t.getAttribute('data-tab')); });
    });

    // --- Dial tab: entity, contacts, numbers ---
    function setDisplay(value, isManual) {
        ui.display.value = formatPhone(value) || String(value || '');
        manual = !!isManual;
        syncCallButton();
    }

    function syncCallButton() {
        ui.clearBtn.hidden = !ui.display.value;
        var hasNumber = !!digitsOf(ui.display.value).replace('+', '');
        ui.call.disabled = !hasNumber || isActive() || errKind() === 'paused';
    }

    function loadEntity(t) {
        target = {
            entityId: String(t.entityId || ''),
            entityName: String(t.entityName || ''),
            entityType: String(t.entityType || '').toLowerCase(),
            contacts: []
        };
        ui.entity.hidden = !target.entityId && !target.entityName;
        ui.entityName.textContent = target.entityName || 'Unknown';
        ui.av.textContent = initials(target.entityName);
        ui.badge.textContent = TYPE_LABEL[target.entityType] || '';
        ui.badge.hidden = !TYPE_LABEL[target.entityType];
        ui.open.href = recordUrl(target.entityType, target.entityId) || '#';
        ui.tiles.hidden = !target.entityId;
        ui.bal.textContent = '—';
        ui.last.textContent = '—';

        // Company main line first, as the anchor's picker does.
        var contacts = [];
        if (t.phone) {
            contacts.push({ contactId: '', name: (target.entityName || 'Main') + ' (main line)', phones: [{ number: t.phone, type: 'Main', isPrimary: true }] });
        }
        renderContacts(contacts, t.phone);
        setDisplay(t.phone || '', false);

        if (target.entityId && (target.entityType === 'customer' || target.entityType === 'prospect')) {
            var forId = target.entityId;
            api('softphoneContacts', { entityId: forId }).then(function (d) {
                if (!target || target.entityId !== forId) return;
                renderContacts(contacts.concat(d.rows || []), t.phone);
            }).catch(function () { /* keep the main line */ });
        }
        if (target.entityId && target.entityType !== 'contact') {
            loadSnapshot(target.entityId).then(function (s) {
                if (!target || target.entityId !== s.forId) return;
                ui.bal.textContent = money(s.data.outstanding && s.data.outstanding.sum);
                ui.last.textContent = s.data.lastActivity
                    ? (s.data.lastActivity.type || 'Activity') + ' · ' + (s.data.lastActivity.ageDays != null ? s.data.lastActivity.ageDays + 'd' : '')
                    : '—';
            }).catch(function () { /* tiles keep their dashes */ });
        }
    }

    function renderContacts(contacts, preferNumber) {
        target.contacts = contacts;
        clear(ui.contact);
        contacts.forEach(function (c, i) {
            var o = document.createElement('option');
            o.value = String(i);
            o.textContent = c.name + (c.title ? ' · ' + c.title : '');
            ui.contact.appendChild(o);
        });
        ui.contactRow.hidden = !contacts.length;
        var idx = 0;
        if (preferNumber) {
            var want = digitsOf(preferNumber);
            contacts.forEach(function (c, i) {
                (c.phones || []).forEach(function (p) { if (digitsOf(p.number) === want && !idx) idx = i; });
            });
        }
        ui.contact.value = String(idx);
        renderNumbers(preferNumber);
    }

    function selectedContact() {
        return target && target.contacts[Number(ui.contact.value) || 0] || null;
    }

    function renderNumbers(preferNumber) {
        var c = selectedContact();
        var phones = (c && c.phones) || [];
        clear(ui.number);
        phones.forEach(function (p, i) {
            var o = document.createElement('option');
            o.value = String(i);
            o.textContent = formatPhone(p.number) + (p.type ? ' · ' + p.type : '');
            ui.number.appendChild(o);
        });
        ui.numberRow.hidden = !phones.length;
        var idx = 0;
        phones.forEach(function (p, i) {
            if (preferNumber ? digitsOf(p.number) === digitsOf(preferNumber) : p.isPrimary) idx = i;
        });
        ui.number.value = String(idx);
        if (phones[idx]) setDisplay(phones[idx].number, false);
    }

    ui.contact.addEventListener('change', function () { renderNumbers(''); });
    ui.number.addEventListener('change', function () {
        var c = selectedContact();
        var p = c && c.phones && c.phones[Number(ui.number.value) || 0];
        if (p) setDisplay(p.number, false);
    });

    function loadSnapshot(entityId) {
        if (snapshotCache[entityId]) return Promise.resolve({ forId: entityId, data: snapshotCache[entityId] });
        return api('softphoneAccountSnapshot', { entityId: entityId }).then(function (d) {
            snapshotCache[entityId] = d;
            return { forId: entityId, data: d };
        });
    }

    // --- Dialpad ---
    function typeDigit(d) {
        if (isActive()) return;
        var cur = manual ? ui.display.value : '';
        setDisplay(cur + d, true);
    }

    ui.dialpad.addEventListener('click', function (e) {
        var k = e.target.closest('.dl-key');
        if (k) typeDigit(k.getAttribute('data-key'));
    });
    ui.display.addEventListener('input', function () { manual = true; syncCallButton(); });
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
        var c = manual ? null : selectedContact();
        var req = {
            to: to,
            entityId: target ? target.entityId : '',
            entityName: target ? target.entityName : '',
            entityType: target ? target.entityType : '',
            contactId: c && c.contactId ? String(c.contactId) : '',
            contactName: c && c.contactId ? c.name : ''
        };
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

    // --- Search tab ---
    function setChipCounts(counts) {
        qa('.dl-chip em').forEach(function (em) {
            var key = em.getAttribute('data-count') || 'total';
            em.textContent = counts && counts[key] != null ? String(counts[key]) : '';
        });
    }

    function countRows(rows) {
        var c = { total: rows.length, customer: 0, prospect: 0, lead: 0 };
        rows.forEach(function (r) { if (c[r.type] != null) c[r.type]++; });
        return c;
    }

    function renderResults(rows) {
        clear(ui.results);
        var shown = searchType ? rows.filter(function (r) { return r.type === searchType; }) : rows;
        shown.forEach(function (r) {
            var li = document.createElement('li');
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'dl-row';
            var av = span('dl-av', initials(r.companyName));
            av.setAttribute('aria-hidden', 'true');
            var main = document.createElement('span');
            main.className = 'dl-row-main';
            main.appendChild(span('dl-row-name', r.companyName));
            main.appendChild(span('dl-row-sub', [r.contactName, formatPhone(r.phone) || 'No phone on file'].filter(Boolean).join(' · ')));
            b.appendChild(av);
            b.appendChild(main);
            b.appendChild(span('dl-row-meta', TYPE_LABEL[r.type] || ''));
            b.addEventListener('click', function () {
                loadEntity({ entityId: r.id, entityName: r.companyName, entityType: r.type, phone: r.phone });
                setTab('dial');
                ui.display.focus();
            });
            li.appendChild(b);
            ui.results.appendChild(li);
        });
        ui.searchMsg.className = 'dl-msg dl-search-msg';
        ui.searchMsg.textContent = shown.length ? '' : 'No matches.';
    }

    function loadSuggested() {
        suggested = [];
        ui.searchMsg.textContent = 'Loading…';
        api('softphoneBookCounts').then(function (d) {
            bookCounts = d;
            if (!ui.query.value.trim()) setChipCounts(bookCounts);
        }).catch(function () { /* row counts below stand in */ });
        api('softphoneSuggested', { limit: 30 }).then(function (d) {
            suggested = d.rows || [];
            if (ui.query.value.trim()) return;
            if (!bookCounts) setChipCounts(countRows(suggested));
            renderResults(suggested);
        }).catch(function (err) {
            ui.searchMsg.className = 'dl-msg dl-search-msg err';
            ui.searchMsg.textContent = 'Could not load your book: ' + err.message;
        });
    }

    function runSearch() {
        var query = ui.query.value.trim();
        var seq = ++searchSeq;
        if (!query) {
            ui.searchLabel.textContent = 'Suggested · your book';
            setChipCounts(bookCounts || countRows(suggested || []));
            renderResults(suggested || []);
            return;
        }
        ui.searchLabel.textContent = '“' + query + '” · your book';
        ui.searchMsg.className = 'dl-msg dl-search-msg';
        ui.searchMsg.textContent = 'Searching…';
        api('softphoneSearch', { query: query, typeFilter: '', limit: 20 }).then(function (d) {
            if (seq !== searchSeq) return;
            var rows = d.rows || [];
            setChipCounts(countRows(rows));
            renderResults(rows);
        }).catch(function (err) {
            if (seq !== searchSeq) return;
            clear(ui.results);
            ui.searchMsg.className = 'dl-msg dl-search-msg err';
            ui.searchMsg.textContent = 'Search failed: ' + err.message;
        });
    }

    ui.query.addEventListener('input', function () {
        window.clearTimeout(searchTimer);
        searchTimer = window.setTimeout(runSearch, SEARCH_DEBOUNCE_MS);
    });
    ui.chips.forEach(function (chip) {
        chip.addEventListener('click', function () {
            searchType = chip.getAttribute('data-type') || '';
            ui.chips.forEach(function (c) { c.setAttribute('aria-pressed', c === chip ? 'true' : 'false'); });
            runSearch();
        });
    });

    // --- Recents tab ---
    // Missed = status 'Missed' or a voicemail (the portlet's isMissedCall rule).
    function isMissedRow(r) { return r.callStatus === 'Missed' || r.voicemail === true; }

    function lastTen(n) { return digitsOf(n).replace('+', '').slice(-10); }

    function dirIcon(kind) {
        var v = DIR_VIEW[kind];
        var i = document.createElement('span');
        i.className = 'dl-dir dl-dir-' + kind;
        i.setAttribute('role', 'img');
        i.setAttribute('aria-label', v.label);
        i.title = v.label;
        i.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + v.path + '"></path></svg>';
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

    function recentItem(r) {
        var missed = isMissedRow(r);
        var kind = missed ? 'missed' : (r.direction === 'inbound' ? 'in' : 'out');
        var name = r.companyName || formatPhone(r.phone) || r.phone || 'Unknown';
        var li = document.createElement('li');
        li.className = 'dl-recent';
        li.setAttribute('data-dir', kind);
        if (r.pending) li.setAttribute('data-pending', '1');
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'dl-row';
        var main = document.createElement('span');
        main.className = 'dl-row-main';
        main.appendChild(span('dl-row-name', name));
        var rest = r.pending ? [ago(r.at)] : [r.contactName, formatPhone(r.phone)];
        rest = rest.filter(Boolean).join(' · ');
        var sub = span('dl-row-sub', '');
        if (missed) {
            sub.appendChild(span('dl-row-flag', r.voicemail ? 'Voicemail' : 'Missed'));
            if (rest) sub.appendChild(document.createTextNode(' · ' + rest));
        } else {
            sub.textContent = rest;
        }
        main.appendChild(sub);
        var mins = r.duration ? Math.max(1, Math.round(r.duration / 60)) + ' min' : '';
        b.appendChild(dirIcon(kind));
        b.appendChild(main);
        if (!r.pending) b.appendChild(span('dl-row-meta', [r.date, mins].filter(Boolean).join('\n')));
        b.addEventListener('click', function () {
            loadEntity({ entityId: r.companyId, entityName: r.companyName, entityType: r.entityType || 'customer', phone: r.phone });
            setTab('dial');
            ui.display.focus();
        });
        li.appendChild(b);
        if (missed && r.phone) {
            var cb = document.createElement('button');
            cb.type = 'button';
            cb.className = 'dl-text dl-recent-cb';
            cb.textContent = 'Call back';
            cb.setAttribute('aria-label', 'Call back ' + name);
            cb.addEventListener('click', function () {
                callBack({ name: r.companyName || '', number: r.phone, entityId: r.companyId || '', entityType: r.entityType || 'customer' });
            });
            li.appendChild(cb);
        }
        return li;
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

    function renderRecents() {
        var rows = recentRows || [];
        if (pendingMissed && recentRows && missedLogged(pendingMissed, rows)) pendingMissed = null;
        clear(ui.recents);
        if (pendingMissed) {
            var c = pendingMissed.caller;
            ui.recents.appendChild(recentItem({
                pending: true, at: pendingMissed.at, callStatus: 'Missed', direction: 'inbound', voicemail: false,
                companyId: c.entityId || '', companyName: c.name || '', entityType: c.entityType || '', phone: c.number || ''
            }));
        }
        rows.forEach(function (r) { ui.recents.appendChild(recentItem(r)); });
        if (recentRows) ui.recentMsg.textContent = rows.length || pendingMissed ? '' : 'No calls in the last 7 days.';
    }

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

    // --- In-call ---
    function tickLive() {
        if (!snap || !snap.startedAt) { ui.liveTime.textContent = ''; return; }
        var s = Math.max(0, Math.floor((Date.now() - snap.startedAt) / 1000));
        var m = Math.floor(s / 60);
        ui.liveTime.textContent = (m < 10 ? '0' : '') + m + ':' + (s % 60 < 10 ? '0' : '') + (s % 60);
    }

    var liveFor = null;
    function renderLive() {
        var incoming = isIncoming();
        var number = formatPhone(snap.number) || snap.number || '';
        var name = snap.entityName || snap.contactName || number || 'Call';
        var sub = [snap.entityName && snap.contactName ? snap.contactName : '', number].filter(function (x) { return x && x !== name; }).join(' · ');
        if (incoming) {
            // Ringing in: caller name (after lookup) or number, Answer / Decline.
            var c = snap.caller || {};
            number = formatPhone(c.number || snap.number) || c.number || number;
            name = c.name || number || 'Unknown caller';
            sub = ['Incoming call', number !== name ? number : ''].filter(function (x) { return x; }).join(' · ');
        }
        // After Answer the call controls show at once (the ring view is gone).
        var ringing = incoming && !answerSent;
        ui.ringActs.forEach(function (a) { a.hidden = !ringing; });
        ui.callActs.forEach(function (a) { a.hidden = ringing; });
        ui.answer.setAttribute('aria-label', 'Answer call from ' + name);
        ui.decline.setAttribute('aria-label', 'Decline call from ' + name);
        ui.liveAv.textContent = initials(name);
        ui.liveName.textContent = name;
        ui.liveSub.textContent = sub;
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
        ui.muteLabel.textContent = snap.muted ? 'MUTED' : 'MUTE';
        ui.keys.disabled = !TALKING[snap.phase];

        var key = snap.entityId && snap.entityType !== 'contact' ? snap.entityId : '';
        if (key !== liveFor) {
            liveFor = key;
            ui.liveTiles.hidden = !key;
            ui.liveBal.textContent = '—';
            ui.liveOpps.textContent = '—';
            if (key) {
                loadSnapshot(key).then(function (s) {
                    if (liveFor !== s.forId) return;
                    ui.liveBal.textContent = money(s.data.outstanding && s.data.outstanding.sum);
                    ui.liveOpps.textContent = s.data.openOpps ? String(s.data.openOpps.count || 0) : '—';
                }).catch(function () { /* keep dashes */ });
            }
        }
    }

    ui.mute.addEventListener('click', function () { send(snap && snap.muted ? 'unmute' : 'mute'); });
    ui.end.addEventListener('click', function () { send('hangup'); });
    ui.answer.addEventListener('click', function () {
        if (!isIncoming()) return;
        answerSent = true;
        send('answer');
        render(snap);
    });
    ui.decline.addEventListener('click', function () { send('decline'); });
    ui.keys.addEventListener('click', function () {
        var show = ui.dtmf.hidden;
        ui.dtmf.hidden = !show;
        ui.liveTiles.hidden = show || !liveFor;
        ui.keys.setAttribute('aria-pressed', show ? 'true' : 'false');
        ui.keys.setAttribute('aria-label', show ? 'Hide keypad' : 'Show keypad');
    });
    ui.dtmf.addEventListener('click', function (e) {
        var k = e.target.closest('.dl-key');
        if (k) send('digits', { d: k.getAttribute('data-key') });
    });

    // --- Header, note ---
    // key: the lastLog this note shows; leave it out for a local note.
    function showNote(kind, text, url, key, missed) {
        stopNoteTimer();
        noteKey = key || null;
        noteMissed = missed || null;
        ui.note.hidden = false;
        ui.noteText.textContent = text;
        ui.noteLink.hidden = !url;
        if (url) ui.noteLink.href = url;
        ui.noteCall.hidden = !(missed && missed.number);
        ui.note.setAttribute('data-kind', kind);
    }

    function hideNote() {
        stopNoteTimer();
        noteKey = null;
        noteMissed = null;
        ui.note.hidden = true;
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

    function logKey(log) {
        return [log.status, log.message || '', log.recordUrl || ''].join('|');
    }

    // The after-call note. Each snapshot repeats lastLog, so the note and its
    // 10 s timer start only when a different lastLog arrives. A closed note
    // stays closed for that lastLog.
    function showLog(log) {
        var key = logKey(log);
        if (key === noteDismissed) { hideNote(); return; }
        if (key === noteKey && !ui.note.hidden) return;
        if (log.status === 'missed') { showMissed(log, key); return; }
        showNote(log.status, log.message || 'Call ended', log.recordUrl, key);
        if (log.status === 'saved' || log.status === 'skipped') {
            noteRemain = NOTE_HIDE_MS;
            runNoteTimer();
        }
    }

    // "Missed call from <name or number>" with Call back (the normal dial
    // path) and Open record (when the caller matched a record). The caller
    // comes from snap.missedUnseen.last, kept here because opening the
    // panel resets it (markMissedSeen); else the call's caller.
    function showMissed(log, key) {
        var c = missedCaller || (snap && snap.caller) || {};
        var who = c.name || formatPhone(c.number) || c.number || '';
        var url = c.entityId ? recordUrl(c.entityType, c.entityId) : (log.recordUrl || '');
        showNote('missed', who ? 'Missed call from ' + who : (log.message || 'Missed call'), url, key, {
            name: String(c.name || ''),
            number: String(c.number || ''),
            entityId: String(c.entityId || ''),
            entityType: String(c.entityType || '')
        });
    }

    ui.noteCall.addEventListener('click', function () {
        var c = noteMissed;
        if (!c || !c.number) return;
        if (noteKey) noteDismissed = noteKey;
        hideNote();
        callBack(c);
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
        var active = isActive();
        var msg = !a ? 'Audio settings open after the phone starts.' : active ? 'Change audio between calls.' : '';
        ui.audioMsg.textContent = msg;
        ui.audioMsg.hidden = !msg;
        ui.inRow.hidden = !a;
        ui.outRow.hidden = !a || !a.outputSupported;
        if (a) {
            fillSelect(ui.inSel, a.inputs, a.input);
            if (a.outputSupported) fillSelect(ui.outSel, a.outputs, a.output);
        }
        ui.inSel.disabled = !a || active;
        ui.outSel.disabled = !a || active;
        var shell = window.__ctcShell;
        var remote = isRemote();
        ui.exit.hidden = remote || !(shell && typeof shell.exit === 'function');
        // Remote control: "Use phone here" instead of Exit, only between calls.
        ui.useHere.hidden = !remote || active || isIncoming();
    }

    function setAudioOpen(open) {
        audioOpen = open;
        ui.gear.setAttribute('aria-pressed', open ? 'true' : 'false');
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
    ui.useHere.addEventListener('click', function () {
        if (host.useHere) host.useHere();
    });
    ui.alertsBtn.addEventListener('click', function () {
        if (host.unlockAudio) host.unlockAudio();
    });
    ui.alertAct.addEventListener('click', function () {
        if (alertRun) alertRun();
    });
    ui.close.addEventListener('click', function () { host.collapse(); });
    el.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { e.stopPropagation(); host.collapse(); }
    });

    // --- Render from the anchor's snapshot ---
    function render(next) {
        snap = next || snap;
        var phase = snap && PHASE_VIEW[snap.phase] ? snap.phase : 'offline';
        var view = PHASE_VIEW[phase];
        if (pending && phase !== 'ready' && !ACTIVE[phase]) view = PHASE_VIEW.starting;
        // Ready, but Twilio cannot ring this phone (anchor re-registering).
        if (phase === 'ready' && snap && snap.canReceive === false) view = READY_NOT_RECEIVING;
        // Between calls an error kind names the problem.
        if (!ACTIVE[phase] && phase !== 'incoming' && ERROR_VIEW[errKind()]) view = ERROR_VIEW[errKind()];
        el.style.setProperty('--dl-dot', view.dot);
        el.setAttribute('data-phase', phase);
        ui.statusLabel.textContent = view.label;

        // A kept dial request goes out as soon as the anchor is ready.
        if (pending && phase === 'ready') {
            var req = pending.req;
            pending = null;
            send('dial', req);
        }

        var m = snap && snap.missedUnseen;
        if (m && m.count > 0 && m.last) {
            missedCaller = m.last;
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
        ui.remote.hidden = !isRemote();

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
        if (wasActive && !active) {
            recentsLoaded = false;
            if (tab === 'recents') loadRecents();
        }
        wasActive = active;
        // Incoming shows the live view too (caller + Answer / Decline).
        var live = active || isIncoming();
        ui.idle.hidden = audioOpen || live;
        ui.live.hidden = audioOpen || !live;
        ui.audio.hidden = !audioOpen;
        if (audioOpen) renderAudio();
        if (live) {
            renderLive();
            // A new call: its lastLog shows even if it reads like the last one.
            hideNote();
            noteDismissed = null;
        } else {
            if (liveTimer) { window.clearInterval(liveTimer); liveTimer = null; }
            liveFor = null;
            ui.dtmf.hidden = true;
            ui.keys.setAttribute('aria-pressed', 'false');
            var log = snap && snap.lastLog;
            var kind = ui.note.getAttribute('data-kind');
            if (kind !== 'error') {
                if (log) showLog(log);
                // A missed note stays until the rep closes it, also when the
                // anchor restarts without a lastLog.
                else if (kind !== 'missed' || ui.note.hidden) hideNote();
            }
        }
        syncCallButton();
        followAnswer();
    }

    // Answer sent: once the call is live, End takes focus (panel shown).
    function followAnswer() {
        if (!answerSent) return;
        if (isIncoming()) return;
        answerSent = false;
        if (!isActive() || audioOpen || el.hidden || el.classList.contains('closed')) return;
        ui.end.focus();
    }

    // Error banner (snap.error.kind): one action. In a remote tab the phone
    // cannot be reloaded from here, so Reload / Retry stay in the phone tab.
    function renderAlert() {
        var kind = errKind();
        var live = isActive() || isIncoming();
        var remote = isRemote();
        var a = null;
        if (kind === 'mic') {
            a = { tone: 'red', title: 'Microphone blocked', text: 'Click the lock icon in the address bar › Allow microphone › reload', act: 'Reload', run: host.reloadPhone, phone: true };
        } else if (kind === 'signed_out') {
            a = { tone: 'amber', title: 'Your NetSuite session ended. Sign in again in this tab.', text: '', act: 'Sign in', run: host.signIn };
        } else if (kind === 'session') {
            a = { tone: 'amber', title: 'Reconnecting the phone…', text: '', act: '', run: null };
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

    // A request of ours the anchor refused: one muted line for 4 s, once.
    function renderRefused() {
        var r = snap && snap.refused;
        if (!r || !r.nonce || !ownNonces[r.nonce]) return;
        delete ownNonces[r.nonce];
        var text = REFUSED_TEXT[r.reason];
        if (!text) return;
        ui.refused.textContent = text;
        ui.refused.hidden = false;
        window.clearTimeout(refusedTimer);
        refusedTimer = window.setTimeout(function () { ui.refused.hidden = true; }, REFUSED_SHOW_MS);
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
        if (audioOpen) { ui.audioBack.focus(); return; }
        if (isIncoming() && !answerSent) { ui.answer.focus(); return; }
        if (isActive() || answerSent) { ui.end.focus(); return; }
        if (what === 'call' && tab === 'dial' && !ui.call.disabled) { ui.call.focus(); return; }
        if (tab === 'search') ui.query.focus();
        else if (tab === 'recents') ui.tabs[2].focus();
        else ui.display.focus();
    }

    // Clear the Dial tab's record (the frame left the record page).
    function clearEntity() {
        target = null;
        ui.entity.hidden = true;
        ui.tiles.hidden = true;
        clear(ui.contact);
        clear(ui.number);
        setDisplay('', false);
    }

    function hasRecord(c) { return !!(c && (c.entityId || c.phone)); }

    // Follow the NetSuite frame's record, unless the rep typed a number.
    function followContext(c) {
        if (manual) return;
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
            if (!isActive() && hasRecord(c)) {
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
        callBack: function (c) { callBack(c); }
    });
})();
