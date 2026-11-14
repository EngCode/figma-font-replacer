# Font Swap

A Figma plugin to **audit and replace fonts** across text nodes — safely, with preview,
an audit trail, and native undo. No network access.

See `docs/PLAN.md` for the phased development plan and task contracts.

## Status

| Phase | Scope | State |
|---|---|---|
| P0 | Scaffold, contracts, gateway seam, UI shell | ✅ |
| P1 | Plugin bootstrap, real Figma gateway, connected shell | ✅ |
| P2 | Font inventory | ✅ |
| P3 | Replacement on single-font nodes | ✅ |
| P4 | Missing/mixed detection | 🚧 (missing done, mixed breakdown next) |
| P5 | Preview, audit, MVP release | ⏳ |
| P6–P11 | Mixed segments, missing resolution, styles, variables, instances, perf | ⏳ |

## Requirements

- Node 20+ and pnpm 9+ (developed on Node 24 / pnpm 12)
- Figma desktop app for manual testing

## Setup

```bash
pnpm install
pnpm typecheck   # tsc --noEmit
pnpm test        # vitest run
pnpm build       # esbuild -> dist/
```

`pnpm install` may print an "ignored build scripts" warning on pnpm 12; `pnpm-workspace.yaml`
already allows the `esbuild` build.

## Load the plugin in Figma

1. `pnpm build` (or `pnpm watch` while developing).
2. Figma desktop → **Menu → Plugins → Development → Import plugin from manifest…**
3. Pick `manifest.json` from this repo.
4. Run **Font Swap** from the Development plugins menu.

`dist/` is generated; the manifest points at `dist/plugin.js` and `dist/ui.html`
(UI script and CSS are inlined into a single HTML file).

## Browser UI harness

The UI runs outside Figma against an in-memory gateway — same contracts, same router:

```bash
pnpm build
pnpm dev:ui        # serves dist/ui.html on http://127.0.0.1:5175
```

Useful for layout work, empty/loading/error states and keyboard testing.

## Architecture in one minute

- `src/shared/*` — pure TypeScript contracts, protocol + validators, planners/renderers.
  Never imports `figma.*`.
- `src/plugin/gateway/*` — the **only** place that touches the Figma document.
  `FakeGateway` mirrors it for tests and the browser harness.
- `src/plugin/services/*` — inventory, apply, settings: testable in Node.
- `src/plugin/router.ts` — maps each UI request to exactly one response and converts
  failures into `PluginError` envelopes; nothing throws across `postMessage`.
- `src/ui/*` — React 18 + plain CSS, Figma theme variables, keyboard-navigable.

Safety model:

- Reads are side-effect free; the UI never writes until you press **Apply**.
- All target fonts are loaded **before** the first mutation; mutations then run in one
  tick so Figma records a single undo step.
- Component-instance text is skipped by default.

## MVP limits

- Mixed-font nodes are detected and reported, not yet rewritten (P6).
- Missing fonts are detected, not yet resolved (P7).
- Text Style definitions and font variables are read-only in the MVP (P8/P9).
- Component instance policy is `skip` by default (P10).

## Troubleshooting

| Symptom | Fix |
|---|---|
| `dist/ui.html is missing` | run `pnpm build` first |
| Plugin shows "not implemented yet" | that phase hasn't landed; check `docs/PLAN.md` |
| Fonts list looks short | Figma returns fonts available to the current editor; missing fonts are reported separately |
