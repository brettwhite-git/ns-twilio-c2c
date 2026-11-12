# DESIGN.md — Click-to-Call design system (v2)

Source of truth for how the product looks and behaves. Code follows this file; change a rule here in the same commit as the code that implements it. Last updated 2026-11-11.

## Canvases

| Level | What | Link |
|---|---|---|
| Home | Kanban of design work | https://claude.ai/artifact/8GzG24mpvRKMAxnCHoFb65 |
| L1 | Journeys | https://claude.ai/artifact/8vjGK5WwvbNe6Yh7RQZLsT |
| L2 | State model | https://claude.ai/artifact/YNGkUJDGG2GFQPDWFHR3ax |
| L3 | Design system (tokens, components, phone pill, dialer) | https://claude.ai/artifact/Jw98h4kH2Vk1m4NJgu9sy9 |
| L4 | Screens (wizard, console, rep, manager) | https://claude.ai/artifact/GYfzs3wQ7b7fDHqcjQoSxt |

## 0. Keeping design, canvas and code in sync

`DESIGN.md` holds the rules. The canvases show them. The code follows them. When two disagree, this file wins until a decision changes it.

**Testing loop (td3061543 or any live test):**
1. Save screenshots to `docs/testing/<YYYY-MM-DD>/` (gitignored). Name each file `<screen>-<state>.png`.
2. Write one line per finding in that folder's `findings.md`: screen, `DOCK_ASSET_VERSION`, what you saw, label.
3. Give each finding one label:

   | Label | Meaning | What changes, in one commit |
   |---|---|---|
   | **Bug** | The code does not match the design | Code only |
   | **Design change** | The live result is better, or the design was wrong | Code + this file (rule and §7 log line) + the canvas board |
   | **Gap** | The code shows something the design does not have | This file + a new board tagged *Shipped* |

4. A "Design change" or "Gap" sets the board tag to *Drift* until the board is fixed.

**Board tags** (end of each L3/L4 board title, after "  —  "): *Shipped · asset NN*, *Shipped* (not dock code), *Planned* or *Drift (reason)*. Maps and notes carry no tag.

**Version log:** each `DOCK_ASSET_VERSION` bump adds a §7 line that says what changed in the design (or "no design change").

**Guards:** a git pre-commit warning fires when dock or Call Central files change and this file does not. Claude Code hooks (`.claude/hooks/`) remind the agent of this loop when a prompt mentions testing or screenshots, and when it edits those files.

## 1. Foundations

- **Font:** `'Oracle Sans','Helvetica Neue',Helvetica,Arial,sans-serif`. Text is 12px minimum. Contrast is 4.5:1 minimum.
- **Page:** background `#F1EFED`, text `#161513`, secondary text `#5C5955`.
- **Primary:** `#36677D`. **Link:** `#00688C`.
- **Phone colours:**
  - Buttons: go `#436B1D`, stop `#B3311F`.
  - Dots on dark: go `#8AC94F`, stop `#FF9D90`.
  - Incoming ring: `#6FB6D3`. One amber: `#F4C76A`. Wrap-up: `#B6A3D9`. Offline: `#8B8780`.
  - Answer is always go green. It is never sky blue.
- **Chips:** 22px tall, radius 12, 12px/600, no dot inside.
  - `cs` `#EBF8DE`/`#436B1D`
  - `cw` `#FDF2E5`/`#8F520A`
  - `cd` `#FFF1EF`/`#B3311F`
  - `ci` `#EDF6F9`/`#00688C`
  - `cn` `#F1EFEA`/`#5C5955`
- **Handset glyph:** one SVG symbol (`#i-ph`, filled). Hang-up is the same glyph rotated 135°.

## 2. Page contract (all NetSuite pages we draw)

1. Frame 1440 wide. Content never sits below the NetSuite bottom bar.
2. **Bottom NetSuite bar:**
   - 56px tall, `#1A2F3F`.
   - Five icons (Home, Notifications, Menu, Favorites, Create).
   - A role chip, then search (360px) pushed to the right.
3. **Header:**
   - White, with a 1px `#E5E2DD` bottom border and 0 24px padding.
   - Height 60px. Use 76px on a record with an avatar, and 100px with a tab row.
   - Title is 20/700 and never stretches. Put a spacer before the right-side actions.
4. **Header and toolbar controls:**
   - 34px tall, radius 8, 1px `#D9D5CF` border.
   - The label sits inside the control (e.g. "Time · This week · Nov 1 – 7"). Never stack a label above it.
   - Primary is filled `#36677D`. Call is filled `#436B1D`.
   - Buttons in rows and cards are 28px tall, radius 8.
5. **Main area:** padding 16px 24px, gap 16px.
6. **Card:** `#FBF9F8`, radius 10.5, padding 16, title 17.5/700. Detail panes and drawers are white.
7. **Tables:** header row 12px/600, 34px tall. Body rows 14px, 44px tall, `#ECE9E4` rule. Numbers are right-aligned and tabular.
8. **Words:** Company, When, Follow-up suggested, Due today / Due tomorrow / Due Nov 6 / Overdue, Play recording, Summarizing (not Processing / Transcribing), Phones & reps, More actions.
9. **Anti-slop rules:**
   - No gradient washes on cards and no glass cards.
   - No row of look-alike KPI tiles. The Home portlet keeps its four tiles by decision.
   - No sparkle or "magic" AI icons. Label AI output plainly: "AI summary".
   - No emoji and no left-border accent cards.
   - Every chart answers a named question and filters the list.

## 3. Phone pill — R standard (L3 boards 05, 05m, 05i)

- **Anatomy, in fixed order:** grip → status dot → words (flat only) → time → second action → main action.
- **Flat pill:** 52px tall, radius 26, padding 0 6px 0 14px, gap 10.
- **Rail:** 52px wide, used on the left- and right-middle snap points. It shows no words (tooltip and aria-label instead), and the time stacks as mm over ss.
- **Grip:** 2×2 dots of 3px.
- **Dot:** 8px. It shows a 3px halo at .20 alpha only while live: calling, ringing, connected, muted, incoming.
- **Words:** title 13/600, sub 12px `#94A6BF`, max 168px, ellipsis.
- **Buttons:**
  - Second action: 36px, radius 12, `rgba(255,255,255,.10)`.
  - Main action: a 40px circle, always last, with a coloured shadow.
- **Disabled slot:** a stage with no action (Starting, Calling paused) still shows the 40px main slot, so the pill never collapses into a "nub".
  - Dark surface: `rgba(255,255,255,.10)` with the icon at 45% opacity.
  - Light surface: `#F1EFED` with a `#8B8780` icon.
- **Ready:** no word, a `#8AC94F` dot with no halo, and a green Call button.
- **Unmute:** a glass amber tile (`rgba(244,199,106,.16)` with an amber ring and amber icon), not a solid amber tile.
- **Dark surface v2.1 ("phone CSS"):** a grain layer, a coral bloom at bottom right, teal glows and a navy gradient `#1C3344 → #15283A → #11203A`, with a 1px `rgba(255,255,255,.07)` border. The light surface (offline, error, paused) is white with a `#E5E2DD` border.
- **Motion:**

  | Token | Value |
  |---|---|
  | dur-2 | 150ms |
  | dur-3 | 200ms |
  | dur-5 | 500ms |
  | Enter easing | `cubic-bezier(0,0,.2,1)` |
  | Exit easing | `cubic-bezier(.4,0,.2,1)` |

  - Allowed loops: the starting breathe, the calling halo, the ringing/incoming ring and the recording dot.
  - **Performance:** every animation runs at 60 fps, also at 5× slow. Animate only `transform` and `opacity`; no `clip-path`, `box-shadow`, width or height animation (use FLIP scaling and opacity on a pre-rendered shadow layer).
  - Starting ↔ Ready changes in place: the slot turns into Call with a 150ms colour change.
  - Reduced motion: opacity only, ≤150ms, with no loops, shake or rotation.

## 4. Dialer panel (L3 boards 06, 06b-1 … 06b-5)

- **Size and shape:** `.pnl` 380 × 620, radius 28, on the dark v2.1 surface. It opens on the pill's snap point, and the pill hides while it is open.
- **Header:** the grip centred at top, a status chip centred under it, and on the right the voicemail button (badge), the gear and close.
- **Tabs:** Dial · Search · Recents, centred, with a 28px gap.
- **Dial view:**
  - An × inside the number field clears it.
  - Backspace deletes one digit. A long press clears the field.
  - Esc clears first, then closes.
- **Search view:** your book first, then everyone. Each row has its own Call.
- **States, grouped:** idle views (06b-1), outbound and in call (06b-2), call quality (06b-3), inbound and after call (06b-4), recover and blocked (06b-5).
- **Answer opens the panel straight into the in-call view.** The card's exit and the panel open start together. Shipped in asset 25.
- **Incoming card (panel closed):** 320px wide, radius 16, a FLIP scale morph out of the pill (nine-piece window, shadow on its own opacity layer; no clip-path), with Answer in go green. Shipped in asset 25.
- **Gear (Settings view):** mic and speaker, "Audio plays in your phone tab.", "Move phone here" (disabled during a call), Exit phone mode. Shipped; not yet drawn on 06b-1.
- **Search view chips:** All · Customers · Prospects · Leads with counts. Shipped; not yet drawn on 06b-1. Sort (Recent activity · Name · Last called) is Planned.

## 4a. One phone, every tab (decided 2026-11-11)

- **Every NetSuite tab gets the full phone.** That covers phone-mode tabs and ordinary NetSuite tabs, including ones opened earlier. Each shows the real pill and panel, and can dial, answer, mute, hold and end.
- **The device stays put.** The Twilio device and the audio live in ONE anchor tab, which holds the Web Lock. Other tabs send commands over the `ctc-bus` BroadcastChannel and draw from the anchor's snapshot.
- **Shared UI state follows the user:**
  - panel open or minimized
  - the current view (Dial / Search / Recents / in call)
  - the snap position

  These are written to shared storage. A tab applies them on load, and again when it becomes visible. A tab you open or return to shows the phone exactly as you left it. A live call shows in every tab.
- **No hand-over gap:** the phone never moves on its own while the anchor is alive.
- **When the anchor tab closes**, a waiting phone-mode tab takes the lock automatically. This is existing behaviour.
- **"Move phone here"** is a quiet item in the gear menu, for when the user wants the audio device in this tab. It is refused while a call is live.
- **No page banner** for "phone in another tab". The pill states "In another tab" on L3 05 cover only the case where an anchor exists but this tab cannot control it (no bus).
- **Reliable commands:**
  - **Sequence numbers.** Every command (Dial, Answer, Mute, End and so on) carries the anchor id and a per-tab sequence number. The anchor runs each command once and acknowledges it. A double-click on Call places one call. A command sent during a hand-over is never doubled.
  - **Readiness handshake.** A newly opened tab shows the Starting pill (disabled slot) until it hears a compatible anchor. That is usually under a second. Commands sent before then are held for up to 2 s, then dropped with a quiet error.
- **Risks to verify:** commands from many tabs (one source of truth: the anchor's snapshot); the mic permission lives only in the anchor tab; audio plays from a background tab.

## 5. Call Central — direction B, NetSuite Next native (L4 rows 5 and 6)

- **Manager:**
  - **Overview (M1):** one labelled stacked chart of calls by day and outcome (click to filter), a "Needs attention" list, and a rep table with a team total.
  - **Lists:** Calls and Follow-ups are saved-search-style lists with column filters. There are no segmented sub-tabs.
  - **Record drawer:** one 720px drawer, used from both Calls and Follow-ups. It contains:
    - a header with Play recording and Call back
    - a facts strip
    - collapsible sections: AI summary, Transcript key lines, Follow-ups (Approve / Dismiss), Related records
    - "Open full record"
  - **Follow-up opened:** its row is highlighted, with a pinned decision bar: Due, Owner, Approve, Dismiss.
  - **Editing:** reps and managers can edit due dates, and Phone Call fields where needed, from Call Central.
- **Rep:**
  - The same pages, scoped to "My calls", plus a Tasks tab.
  - The drawer adds "Tasks from this call" (status, Mark complete).
  - A task opened shows a pinned bar: Due, Status, Mark complete, Call, Open task in NetSuite.
- **Home portlet (gold standard, R17):** a header with a Period control and "Open Call Central", four KPI tiles scoped to the viewer, then:
  - tabs Calls · Missed · Follow-ups · Tasks
  - a calls table with Call buttons
  - Recommended actions (Approve / Dismiss)
- **Narrow screens (<1280px):** the legacy slide-over (M4) stays until B has a full-page drawer fallback.

## 6. Add to NetSuite (unknown numbers) — designed, needs approval to build

- **Entry points:** an incoming unknown caller, wrap-up for an unknown number, and a Recents row with no record.
- **The sheet asks where the number goes:**
  1. **Add to an existing contact:** search for the contact. The number fills an empty phone field, or is added as Mobile / Office / Other (the user picks). The Phone Call is linked to that contact and its company.
  2. **New contact at an existing company:** search for the company, then enter name and role. Phone Call → contact + company.
  3. **New lead or prospect (new company):** company name, contact name and status (Lead or Prospect; the default comes from config). Phone Call → the new record.
  4. **Log without a record:** the call stays unlinked and owned by the rep.
- **Option:** "Make this the main phone".
- Duplicate check before create: same number, or same company name.

## 7. Decisions log

| Date | Decision |
|---|---|
| 2026-11-11 | v2 phone colours kept (R1 colours rejected). Ready #8AC94F everywhere. |
| 2026-11-11 | The R pill is the gold standard; the nub is removed; Unmute is a glass amber tile. |
| 2026-11-11 | L3 lives on one canvas page (rows, no pages). 06b is split into five like-state boards. |
| 2026-11-11 | Rep journey starts on Home. Setup wizard uses a horizontal stepper. |
| 2026-11-11 | Header controls are 34px with the label inside; the title never stretches. |
| 2026-11-11 | Call Central direction B chosen; A and C were removed. The portlet with Tasks is the gold standard. |
| 2026-11-11 | Answer opens the panel. Add quick clear, voicemail link and "Add to NetSuite" (the last two are gated). |
| 2026-11-12 | Asset 25 deployed (Phase 1). Sync loop §0 added; L3/L4 boards tagged Shipped / Planned / Drift. §4 corrected to the shipped FLIP morph, Settings view and search chips. |
