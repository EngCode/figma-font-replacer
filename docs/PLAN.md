# Font Swap — Agentic Development Plan

> **Status:** `plan.md` in the repo root was truncated after §2 (no phases, no contracts).
> This file reconstructs and completes it. Task ids (`P<phase>-T<n>`) match the Axiom
> task tracker (`[P0-T1] …` titles); the Axiom id column is the tracker's `TASK-###`.
> Canonical set: `TASK-101`–`TASK-136`. (`TASK-97`–`TASK-100` came from an aborted
> seed run and are marked `[superseded]`.)

> **How to use this document:** each phase is a self-contained, verifiable increment.
> Each task is sized for one agent session and must pass its acceptance checklist before
> the next task starts. Contracts (§4) are defined before implementation so parallel
> agents share vocabulary. Hard problems (mixed fonts, style links, variables, instances)
> are deliberately deferred to P6+.

---

## 1. Product Scope

### MVP (P0–P5) — shippable, useful, low-risk
- Read-only font inventory across selection / page / file.
- Single-font and multi-font consolidation replacement on **single-font text nodes**.
- Missing-font and mixed-node **detection** (not yet resolution).
- Preview / dry-run, audit report (copy + CSV), native undo.

### Deferred (P6–P11) — the hard parts
- Mixed-font segment replacement.
- Missing-font resolution workflow.
- Text Style definition updates (link preservation).
- Variable (per-mode) updates.
- Component-instance policy.
- Performance hardening on 1000+ node files.

**Explicit non-goals for MVP:** network font fetching, pairing recommendations,
pricing/paywall logic, multi-file batch runs.

---

## 2. Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Language | TypeScript `strict: true` | Agent-friendly; contracts enforce correctness |
| Plugin bundle | `esbuild` → single IIFE `dist/plugin.js` | Figma sandbox requires IIFE; fast rebuilds |
| UI bundle | `esbuild` → `dist/ui.js` + `dist/ui.html` | Keep one bundler; no Vite complexity |
| UI framework | React 18 + plain CSS | Ubiquitous patterns; agents write it well |
| Tests | `vitest` (Node env) | No Figma runtime needed thanks to gateway seam |
| Lint/format | `eslint` + `prettier` (optional, non-blocking) | Consistency only |
| Package manager | `pnpm` | Fast, lockfile-stable |

**Verification commands** (every task must pass these):

```bash
pnpm typecheck     # tsc --noEmit
pnpm test          # vitest run
pnpm build         # esbuild plugin + ui
```

---

## 3. Architecture & Layout

```
src/
  shared/                 pure TS, no figma.*, no DOM
    contracts.ts          domain types + Result envelope + defaults
    fontKey.ts            font key normalisation/parsing
    messages.ts           UI<->plugin protocol + runtime validators
    aggregate.ts          (P2) usage aggregation
    planner.ts            (P3) pure replacement planner
    report.ts             (P5) audit text/CSV renderers
  plugin/
    code.ts               entry: showUI + message routing
    router.ts             request -> response, never throws
    transport.ts          (P4) typed postMessage wrappers
    gateway/
      types.ts            FontGateway interface (the only seam)
      figmaGateway.ts     the only file allowed to touch figma.* document data
      fakeGateway.ts      in-memory tree for tests + browser harness
    services/
      settings.ts         validated settings merge + clamps
      inventory.ts        (P2) scan -> snapshots + groups
      apply.ts            (P3) preload-then-write, single undo step
  ui/
    main.tsx, App.tsx     React shell, tabs, status header
    transport.ts          parent.postMessage transport
    components/           Tabs, StatusHeader, FontPicker, Panel, tables…
    dev/mockTransport.ts  browser harness (same router, FakeGateway)
tests/                    vitest specs, no Figma runtime
```

**Rule that keeps the codebase testable:** `figma.*` may only be referenced inside
`src/plugin/gateway/figmaGateway.ts` (and `src/plugin/code.ts` for UI bootstrap).
Every service, planner and UI component depends on `FontGateway` or plain types.

**Undo guarantee:** all target fonts are loaded *before* the first mutation; mutations
then run in a single event-loop tick so Figma records one undo step.

---

## 4. Contracts

All of these live in `src/shared/contracts.ts` (source of truth) and must stay
structured-clone friendly (no `Error`, no functions, no class instances).

```ts
type FontRef = { family: string; style: string };
type FontKey = string;                    // "family::style", normalised
type ScanScope = 'selection' | 'page' | 'file';
type PlanMode = 'pairwise' | 'consolidate';

type Result<T> = { ok: true; data: T } | { ok: false; error: PluginError };

type PluginError = { code: PluginErrorCode; message: string; detail?: string };
type PluginErrorCode =
  | 'unknown-request' | 'invalid-payload' | 'scan-failed' | 'plan-failed'
  | 'apply-failed' | 'font-not-found' | 'font-load-failed' | 'node-locked'
  | 'node-deleted' | 'instance-text' | 'not-implemented' | 'cancelled'
  | 'invalid-settings' | 'internal';

type TextNodeSnapshot = {
  nodeId; name; pageName; characterCount;
  fonts: FontRef[];            // >1 => mixed
  isMixed; hasMissingFont;
  textStyleId: string | null;
  isInstanceText; isHidden; isLocked;
  sample;
};

type FontUsageGroup = {
  key: FontKey; font: FontRef; count; nodeIds;
  mixedNodeIds; styleLinkedNodeIds; instanceNodeIds; missing;
};

type Mapping = { fromKey: FontKey; to: FontRef };

type ReplacementPlanEntry = {
  nodeId; nodeName;
  from: FontRef[]; to: FontRef | null;
  action: 'replace' | 'skip';
  reason?: SkipReason;
  ranges: { start: number; end: number }[];
};

type ReplacementPlan = {
  mode; scope; entries; totals: { total; replace; skip };
  mappings; generatedAt;
};
```

Protocol (`src/shared/messages.ts`):

| Direction | Variants |
|---|---|
| UI → plugin | `ready`, `scan`, `cancel`, `plan`, `preview`, `apply`, `locate`, `exportAudit`, `listStyles`, `getSettings`, `setSettings`, `resize` |
| plugin → UI | `ready`, `scanProgress`, `scanResult`, `planResult`, `previewResult`, `applyResult`, `exportResult`, `stylesResult`, `settingsResult`, `notify`, `error` |

`parseUiRequest` / `parsePluginResponse` validate every inbound payload; malformed
input becomes `invalid-payload`, never an exception.

---

## 5. Phases & Tasks

Legend: **Axiom** = tracker id (`node "$HOME/.config/opencode/skills/axiom-tasks/scripts/axiom.mjs" get <id>`).

### P0 — Scaffold & contracts

| Task | Axiom | Deliverable | Done when |
|---|---|---|---|
| P0-T1 | TASK-101 | pnpm + tsc strict + esbuild + vitest + lint configs | `typecheck`, `test`, `build` green |
| P0-T2 | TASK-102 | `manifest.json` + UI HTML inlining pipeline | `dist/{plugin.js,ui.js,ui.html}` emitted |
| P0-T3 | TASK-103 | Domain contracts + font-key utils | round-trip/normalisation tests pass |
| P0-T4 | TASK-104 | Typed protocol + validators | valid/invalid payload tests pass |
| P0-T5 | TASK-105 | `FontGateway` seam + `FakeGateway` | tree/instance/mixed/locked tests pass |
| P0-T6 | TASK-106 | React shell + browser harness | harness renders, `typecheck/build` green |

### P1 — Bridge & Figma gateway

| Task | Axiom | Deliverable | Done when |
|---|---|---|---|
| P1-T1 | TASK-107 | Bootstrap + router (never throws) | every request variant routed + tested |
| P1-T2 | TASK-108 | Real `FigmaGateway` | selection/page/file scopes, font-load cache |
| P1-T3 | TASK-109 | Connected shell: status + font picker | counts correct, picker keyboard navigable |

### P2 — Inventory

| Task | Axiom | Deliverable | Done when |
|---|---|---|---|
| P2-T1 | TASK-110 | Scan service + pure aggregation | nested/instance/hidden/mixed fixtures covered |
| P2-T2 | TASK-111 | Chunked scan, progress, cancel | progress monotonic; partial cancel result |
| P2-T3 | TASK-112 | Inventory table, search, node locator | badges render; select+zoom works |

### P3 — Replacement

| Task | Axiom | Deliverable | Done when |
|---|---|---|---|
| P3-T1 | TASK-113 | Pure planner (pairwise + consolidate) | all skip reasons tested; totals reconcile |
| P3-T2 | TASK-114 | Apply: preload-then-write, one undo step | zero writes before loads resolve |
| P3-T3 | TASK-115 | Partial failure + per-node errors | changed+skipped+failed == planned |
| P3-T4 | TASK-116 | Mapping editor + result UI | apply disabled with no mappings |

### P4 — Detection

| Task | Axiom | Deliverable | Done when |
|---|---|---|---|
| P4-T1 | TASK-117 | Missing-font detection | partial-overlap fixtures; never a target |
| P4-T2 | TASK-118 | Mixed-node breakdown + popover | contiguous runs, offsets 0..length |

### P5 — Preview, audit, MVP release

| Task | Axiom | Deliverable | Done when |
|---|---|---|---|
| P5-T1 | TASK-119 | Dry-run preview (no writes) | write-spy proves zero mutations |
| P5-T2 | TASK-120 | Report model + clipboard + CSV | RFC4180 escaping snapshots |
| P5-T3 | TASK-121 | Settings persistence | corrupt payload falls back to defaults |
| P5-T4 | TASK-122 | QA matrix, README, release checklist | smoke matrix recorded in docs/QA.md |

### P6 — Mixed-font segments

| Task | Axiom | Deliverable | Done when |
|---|---|---|---|
| P6-T1 | TASK-123 | Segment resolution service | segments cover full string, no gaps |
| P6-T2 | TASK-124 | Per-range apply | 3-font node → single font, one undo step |
| P6-T3 | TASK-125 | Segment review UI | excluded segments untouched |

### P7 — Missing-font resolution

| Task | Axiom | Deliverable | Done when |
|---|---|---|---|
| P7-T1 | TASK-126 | Substitute scorer | weight/italic/alias cases tested |
| P7-T2 | TASK-127 | Resolution wizard | reuses planner/apply; unresolved blocks apply |
| P7-T3 | TASK-128 | Persistent ignore list | ignore/unignore round-trip |

### P8 — Text styles

| Task | Axiom | Deliverable | Done when |
|---|---|---|---|
| P8-T1 | TASK-129 | Update style definitions, keep links | `textStyleId` preserved after update |
| P8-T2 | TASK-130 | Styles tab | library styles marked read-only |

### P9 — Variables

| Task | Axiom | Deliverable | Done when |
|---|---|---|---|
| P9-T1 | TASK-131 | Font variable enumeration + per-mode update | bindings preserved across modes |
| P9-T2 | TASK-132 | Variables tab | modes × values matrix |

### P10 — Component instances

| Task | Axiom | Deliverable | Done when |
|---|---|---|---|
| P10-T1 | TASK-133 | Policy engine (skip/overrides/push/all) | policy × node-kind matrix tested |
| P10-T2 | TASK-134 | Instance-aware apply + selector | overrides-only leaves master text |

### P11 — Performance & v1.0

| Task | Axiom | Deliverable | Done when |
|---|---|---|---|
| P11-T1 | TASK-135 | 1k/5k node benchmark + hardening | budgets in docs/PERF.md |
| P11-T2 | TASK-136 | v1.0 docs, changelog, release build | clean-clone verification green |

---

## 6. Working agreement

1. Read the Axiom task before starting; `start` it.
2. Write the tests that encode the acceptance checklist first when the task is pure logic.
3. Keep `figma.*` inside the gateway. If a service needs new data, extend `FontGateway`.
4. `done` only after `pnpm typecheck && pnpm test && pnpm build` pass, with a note
   listing files touched and anything deferred.
5. Never silently widen scope: new work becomes a new Axiom task.
