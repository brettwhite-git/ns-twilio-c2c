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
| L5 | Demo callers (ElevenLabs agents on a Twilio number) | https://claude.ai/artifact/DuRKbSv33K4oyJVEoS5r1v |

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

**Status badges** (every board on L1–L5, and every step on a flow map). Each board shows its badge twice: at the end of its title (after "  —  ") and as a coloured badge note above the board. Map steps carry the same chip.

| Badge | Colour (chip / sticky) | Means |
|---|---|---|
| **Shipped · asset NN** (or *Shipped* for non-dock code) | green `#EBF8DE`/`#436B1D` | The code does what the board shows |
| **Pending build · Phase N** | blue `#EDF6F9`/`#00688C` | Approved and in `tasks/todo.md`, not built yet |
| **Design only** | grey `#F1EFEA`/`#5C5955` | Designed, not approved to build (gated) |
| **Drift (reason)** | amber `#FDF2E5`/`#8F520A` | Board and code differ: fix one, then re-badge |
| **Legacy · remove** | red `#FFF1EF`/`#B3311F` | Superseded or contradicts a decision; delete after the user confirms |

Maps, notes and thesis boards are *Reference* and carry no badge. A part of a board can carry its own small chip (e.g. a *Design only* sort control on a *Shipped* board). Inventory: `docs/testing/<date>/board-inventory.md`.

**Gate:** a change is not done until every affected board's badge is right. A code change that ships what a *Pending build* or *Design only* board shows moves it to *Shipped · asset NN*; a decision that a board contradicts makes it *Drift* or *Legacy · remove*.

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
- **Outbound dialing and ringing:** one stage: the contact name over "Calling…", amber dot, red End. No ring timer; the timer starts when the call connects.
- **Wrap-up:** "Call ended" over the name, the final length, and a green Call back. Never "Phone Call saved" (the record and AI summary finish later).
- **Unmute:** a glass amber tile (`rgba(244,199,106,.16)` with an amber ring and amber icon), not a solid amber tile.
- **Dark surface v2.1 ("phone CSS"):** a grain layer, a coral bloom at bottom right, teal glows and a navy gradient `#1C3344 → #15283A → #11203A`, with a 1px `rgba(255,255,255,.07)` border. The light surface (offline, error, paused) is white with a `#E5E2DD` border.
- **Which surface:** light = blocked or stopped (offline, mic blocked, phone error, calling paused). Dark with an amber dot = recoverable and in progress (signed out → "Sign in to NetSuite", reconnecting, calls won't ring).
- **Motion:**

  | Token | Value |
  |---|---|
  | dur-2 | 150ms |
  | dur-3 | 200ms |
  | dur-5 | 500ms (general; not used by the phone) |
  | Incoming card in / out | 1280ms / 880ms (FLIP) |
  | Panel open / close | 200ms opacity + 12px slide |
  | Phone enter easing | `cubic-bezier(.23,1,.32,1)` |
  | Enter easing (pages) | `cubic-bezier(0,0,.2,1)` |
  | Exit easing | `cubic-bezier(.4,0,.2,1)` |

  - Allowed loops: the starting breathe, the calling halo, the ringing/incoming ring and the recording dot.
  - **Performance:** every animation runs at 60 fps, also at 5× slow. Animate only `transform` and `opacity`; no `clip-path`, `box-shadow`, width or height animation (use FLIP scaling and opacity on a pre-rendered shadow layer).
  - Starting ↔ Ready changes in place: the slot turns into Call with a 150ms colour change.
  - Reduced motion: opacity only, ≤150ms, with no loops, shake or rotation.

## 4. Dialer panel (L3 boards 06, 06b-1 … 06b-5)

- **Size and shape:** `.pnl` 380 × 620, radius 28, on the dark v2.1 surface. It opens on the pill's snap point, and the pill hides while it is open.
- **Header:** the grip centred at top, a status chip centred under it, and on the right the voicemail button (badge; Planned, gated), the gear and a down chevron, "Collapse phone" (never ×: the phone collapses to the pill, it does not close).
- **Call back** (missed note, Recents missed row): a 28px go-green button, radius 8, 12px/600 white text. Shipped in asset 27.
- **Tabs:** Dial · Search · Recents, centred, with a 28px gap.
- **Dial view:**
  - An × inside the number field clears it.
  - Backspace deletes one digit. A long press clears the field.
  - Esc clears first, then closes.
- **Search view:** type chips All · Customers · Prospects · Leads with counts filter the rep's book (no "Everyone" section). Each row with a number has its own 32px go-green Call (calls at once); a click on the row loads it into Dial. Shipped in asset 26. Sort is Planned.
- **States, grouped:** idle views (06b-1), outbound and in call (06b-2), call quality (06b-3), inbound and after call (06b-4), recover and blocked (06b-5).
- **Answer opens the panel straight into the in-call view.** The card's exit and the panel open start together. Shipped in asset 25.
- **Incoming card (panel closed):** 320px wide, radius 16, a FLIP scale morph out of the pill (nine-piece window, shadow on its own opacity layer; no clip-path), with Answer in go green. Shipped in asset 25.
- **Gear (Settings view):** mic and speaker, "Audio plays in your phone tab.", Exit phone mode. No "Move phone here" in the design (see §4a).
- **Search view chips:** see Search view above. Sort (Recent activity · Name · Last called) is Planned.

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
- **No "pass to another tab" design.** The phone is present in every tab, so the design has no hand-over control, no "Move phone here" item and no "In another tab" pill.
- **No page banner** for "phone in another tab".
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
| 2026-11-12 | Stages 1–2 catch-up: L3 06b-1, 06, 03 icons, 05i and L4 R1–R5, R10–R18 and the rep map redrawn to asset 25. 19 code-vs-design findings logged in docs/testing/2026-11-12/findings.md; open items await decision. |
| 2026-11-13 | State diagrams use §8b: owner tier on the frame, state-kind colour on each state (idle, active, waiting, error, done). |
| 2026-11-13 | Diagram colour variant chosen: B "SaaS tiers" (§8a) for multi-owner architecture and data-flow diagrams; statecharts stay Mono. |
| 2026-11-13 | User journeys (L1) adopt the "Swimlane journey" contract (§9): stage columns, Interactions and Descriptions lanes, numbered cards and step diamonds. |
| 2026-11-13 | Architecture and flow diagrams adopt the "Mono blueprint" contract (§8): monochrome, dashed connectors, black pills and numbered step markers. |
| 2026-11-13 | Deleted 4 Legacy boards (user OK): L2 Phone ownership statechart and Multi-tab scenarios, L3 03b v1 Controls, L4 M5 report placeholder. |
| 2026-11-13 | Asset 28: Move phone here removed from code (gear item, takeover request, step-aside steal, Use phone here, moved and other-tab pill copy). A tab that stands down shows Starting, then becomes a full remote. Status badges added to every board (§0). |
| 2026-11-13 | Removed all "pass to another tab" design work: Move phone here, the "In another tab" pills, the R15 fallback inset. The phone is present in every tab. |
| 2026-11-12 | Motion tokens follow the code: phone enter easing (.23,1,.32,1); incoming card 1280/880ms; panel 200ms (findings #21, #22). Asset 27 bug batch: text ≥12px, Oracle Sans stack, reduced motion 150ms, missed dot #FF9D90, retry 40px circle, glass amber Unmute, calling halo loop, portlet Call go green. |
| 2026-11-12 | Decided: ringing = "Calling…" (no ring timer); wrap-up = "Call ended"; Call back is go green (asset 27); signed out stays dark + amber (light = blocked/paused only); panel close is the "Collapse phone" chevron. Findings #6, #7, #11, #12, #16/#42. |
| 2026-11-12 | Asset 26: Search rows get their own go-green Call; type chips stay; no "Everyone" section (Design change, findings #3). |
| 2026-11-12 | Asset 25 deployed (Phase 1). Sync loop §0 added; L3/L4 boards tagged Shipped / Planned / Drift. §4 corrected to the shipped FLIP morph, Settings view and search chips. |

## 8. Architecture and flow diagrams — "Mono blueprint" contract (decided 2026-11-13)

Applies to every architecture, sequence and data-flow diagram: `docs/architecture/system-architecture.html`, the L2.3 boards, and new diagrams on any canvas. Product screens keep §1–§6. Reference: `docs/architecture/reference/diagram-style-reference.jpg`. Kit board: L2 "Diagram kit".

**Look:** monochrome on white. Black ink, white boxes, dashed connectors, black pill labels and black numbered step markers. No colour fills, no gradients, no shadows other than the node lift below. Status colour appears only in §0 badges, never inside a diagram.

**Tokens**

| Token | Value |
|---|---|
| Canvas | `#FFFFFF` |
| Ink (text, strokes, fills of pills/markers) | `#161513` |
| Muted ink (secondary labels) | `#5C5955` |
| Font | `'Oracle Sans','Helvetica Neue',Helvetica,Arial,sans-serif` |
| Diagram title | 48–56px / 700, letter-spacing −0.02em, centred |
| Node label | 16px / 400 |
| Group label | 18px / 400, bottom centre of the group |
| Pill / marker text | 12px / 600, white |
| Line weight | nodes 1px, groups 1px, sections 2px, connectors 1.25px |
| Dash | `4 4` |

**Parts** (each is one reusable shape; build from separate placed elements on a canvas, inline SVG in an HTML file)

1. **Section** — a big rounded panel, radius 28, 2px ink stroke, with a **tab** on its top-left edge: ink fill, white 20/600 text, padding 10×16, top corners radius 14, bottom edge sitting on the panel stroke. One section per view (e.g. "Phone mode", "Call record and AI").
2. **Group** — a boundary for a runtime or system (e.g. "Shell tab", "NetSuite", "Twilio"): white, radius 16, 1px stroke, label at bottom centre.
3. **Node** — a component: white, radius 10, 1px stroke, padding 12×22, min height 48, centred label, lift = `0 2px 0 rgba(22,21,19,.18)`.
4. **Actor node** — a person: a 40px ink circle with a white stroke icon above the label (Rep, Manager, Admin, Caller).
5. **Service node** — an external API or store: a 28px ink circle with a white stroke icon to the left of the label (Twilio Voice, Studio, Conversational Intelligence, N/llm).
6. **Pill** — a label on or beside a connector (message, payload, request): ink fill, radius 6, padding 4×10, white 12/600. Short nouns or verbs, 1–3 words.
7. **Callout** — an example value or utterance: ink fill, radius 10, white 13px text, padding 12×16, max width 200, with an 8px triangle pointing at its node.
8. **Step marker** — order of a flow: 20px ink circle, white 12/700 numeral, placed on the connector at its start. Numbers follow time order across the whole diagram; a step that repeats keeps its number.
9. **Connector** — dashed 1.25px ink, orthogonal routing with 10px rounded elbows, solid ink triangle arrowhead (8px). Two-way traffic is two connectors, never a double-headed arrow. Never cross a node; cross another connector only at right angles.

**Composition rules**
- Read left to right, top to bottom; the actor starts on the left.
- One idea per section. Split a diagram that needs more than ~12 nodes or ~9 steps.
- Every connector that carries a message has a pill or a step marker (or both); unlabeled connectors mean "contains" or "hosts".
- Spacing: 24px between nodes inside a group, 48px between groups, 40px section padding.
- Text ≥12px, contrast ≥4.5:1 (ink on white, white on ink).
- A legend is a single row under the title only when a diagram uses a part the reader may not know (callout, marker).
- Status of a diagram (Shipped / Design only) is its board badge (§0), not a colour in the drawing.

### 8a. Colour variant — "SaaS tiers" (decided 2026-11-13)

Architecture and data-flow diagrams with more than one owner use the SaaS tiers colours on top of the §8 shapes. Statecharts, sequence diagrams and single-owner diagrams stay plain Mono blueprint. Sample: L2 board "L2.3g · Diagram colour options", option B.

**Colour means owner only.** Connectors, pills, step markers and callouts stay ink. Nodes stay white with a 1px ink stroke; a node may carry a 4px top rule in its tier border colour, and a service node's icon chip takes the tier tab colour.

| Tier | What belongs | Tab fill / text | Group tint | Group border (1.5px) |
|---|---|---|---|---|
| Client | browser tabs, the dock, the softphone page, the Setup Wizard UI | `#2761C8` / white | `#F0F4FB` | `#2761C8` |
| NetSuite | SuiteScripts (Suitelets, RESTlet, Scheduled Script, UserEvent, portlet), config | `#1E998C` / ink | `#EEF5F4` | `#0F7369` |
| Twilio | Voice SDK, Functions, Studio, Conversational Intelligence, PSTN | `#F29862` / ink | `#FAF3EF` | `#B8501A` |
| AI | N/llm and the analysis step | `#412079` / white | `#F4F0F9` | `#5B2DA8` |
| Data | records (Phone Call, Task, config record), recordings, transcripts | `#B9E0A8` / ink | `#F1F6F0` | `#3C7F2A` |
| People | Rep, Manager, Admin, Caller | actor circle `#6B6661`, white icon | — | — |

- Contrast (measured): every tab text pair ≥5.2:1, ink on every tint ≥16:1, every border ≥4.9:1 on white.
- Colour-blind safe: the tab fills sit on a lightness ladder (L* 22 / 43 / 57 / 71 / 85); the closest simulated pair is ΔE 21. Never tell tiers apart by hue alone in text either: each group keeps its name on its tab.
- A legend row (tier chip + name) sits under the title of every coloured diagram.
- Generic hues only: no vendor brand colours or logos.

### 8b. State diagrams — owner tier + state kind (decided 2026-11-13)

Applies to state machines and statecharts (L2.0, L2.1). Two layers of colour, each with one meaning:

1. **Owner tier on the frame.** The section tab and the machine's group use its owner's §8a tier: Browser phone (L2.0a, SC1) = Client · Call record and AI (L2.0b, SC2) and Follow-up (SC3) = Data · Telephony publish (L2.0c, SC4) = Twilio · Admin console and setup (L2.0d, SC6) = NetSuite. A board that holds machines of several owners colours each section separately.
2. **State kind on each state node.** A white node with a 4px top rule and a small kind chip (22px, radius 12, 12px/600), using the §1 chip colours:

| Kind | Rule / chip | Examples |
|---|---|---|
| Idle / ready | `#5C5955` on `#F1EFEA` | ready, offline, not published |
| Active / live | `#436B1D` on `#EBF8DE` | calling, connected, live |
| Waiting / in progress | `#8F520A` on `#FDF2E5` | starting, summarizing, reconnecting, pending |
| Error / failed | `#B3311F` on `#FFF1EF` | error, failed, mic blocked |
| Done / final | `#00688C` on `#EDF6F9` | call ended, summary ready, completed |

- Initial state = 12px ink dot; final state = ink ring — they stay ink.
- Transitions, event pills, guards and step markers stay ink.
- Composite states are groups in the owner tier's tint.
- The kind is also written in the chip, so colour is never the only cue.
- A legend row under each board title: the owner tier(s) used and the five kinds.

## 9. User journeys — "Swimlane journey" contract (decided 2026-11-13)

Applies to every user journey and service blueprint (L1 canvas). Reference: `docs/architecture/reference/journey-style-reference.jpg`. Kit board: L1 "Journey kit". Architecture and data flow stay §8.

**Layout:** one board = one journey, read left to right.
- **Stage columns** across the top: a white header row, 56px tall, stage names in UPPERCASE 12px/600 with letter-spacing 0.2em, centred; a small ink arrow glyph in the top-left corner cell. Columns are divided by 1px dashed `#C9C6C1` lines (dash `4 4`) running the full height.
- **Lanes** down the left: a 32px coloured band with the lane name rotated 90° (UPPERCASE 12px/600, letter-spacing 0.2em, ink text). Two lanes per journey:
  - **Interactions** (band `#7FCFCF`, body `#F5F5F6`): who touches what, as cards and connectors.
  - **Descriptions** (band `#FFC97F`, body white): the numbered notes that explain the cards and steps.
  - A blueprint may add **Frontstage / Backstage** lanes (band `#B8C4F0` and `#D4D0CA`).
- **Scenario band** (optional, inside a lane): a full-width 24px strip of 45° hatching (`#E4E2DE` on `#F5F5F6`, 12px stripes) with its label UPPERCASE 12px/600, letter-spacing 0.2em, muted ink, centred. Use it to split a lane into alternative paths (e.g. "Outbound from Home" / "From a record").

**Parts**
1. **Card** — a touchpoint (a person, screen, record or system): white, radius 4, no border, shadow `0 2px 6px rgba(22,21,19,.10)`, padding 14, label UPPERCASE 12px/600 letter-spacing 0.08em ink, centred; min 96 × 64. Badges sit under the label.
2. **Card badge** — a 20px circle `#4A4845` with a white 12px/700 numeral = the card's note number in Descriptions. Two badges join with "&".
3. **Connector** — 1.25px solid `#5C5955`, orthogonal with 8px rounded elbows, a 6px hollow circle at its start and an 8px solid arrowhead at its end. Fan-outs merge with rounded joins.
4. **Step diamond** — a 22px white diamond with a 1px ink border and a 12px/600 numeral, sitting on a connector: the step's note number in Descriptions. Cards are numbered with circles, steps with diamonds; the two number series are separate.
5. **Note (Descriptions lane)** — one per badge or diamond, in the column where it happens: the badge or diamond, then a title UPPERCASE 12px/700 letter-spacing 0.08em, then body 12px/400 `#5C5955`, line-height 1.5, max width 200. Two notes in a column stack with 20px between; related notes share a thin vertical guide line.
6. **Pain / opportunity marker** (our addition) — a note may end with a chip: "Pain" (`#FFF1EF`/`#B3311F`) or "Opportunity" (`#EBF8DE`/`#436B1D`), 22px, radius 12, 12px/600.

**Rules**
- Board background `#FFFFFF`, lane bodies as above; no gradients, no drop shadow other than the card shadow, no decoration outside the board.
- Text ≥12px everywhere (the reference uses smaller; we do not). Contrast ≥4.5:1: lane labels are ink on the band colour, never white.
- 4–6 stage columns per journey (a service blueprint, e.g. L1.5, may use up to 8); split a journey that needs more.
- Every card and step that appears in the Interactions lane has a note; every note has its marker.
- Copy follows §2.8 words and the shipped behaviour (e.g. "Calling…", "Call ended", one phone in every tab).
- Status of a journey is its board badge (§0) — journeys are Reference, so they carry none; a step that is not built yet gets a grey "Design only" chip on its card.
