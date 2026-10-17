# AGENTS.md — Rules for coding agents working on DropZone

## Source of truth
1. `docs/PRD.md` (what), `docs/TRD.md` (how), `docs/WORKING.md` (behavior + phased plan).
2. If docs conflict with code, fix whichever is wrong and note it in `docs/DECISIONS.md`.
3. All cross-boundary messages (signaling, control channel, binary frame) are defined **only** in `packages/protocol`. Never redeclare them elsewhere.

## Workflow
- Work phase by phase (`WORKING.md §4`). Do not start a phase until the previous gate passes.
- Before finishing any task run: `pnpm lint && pnpm typecheck && pnpm test`. For transfer/signaling changes also run `pnpm e2e`.
- Commit per phase with Conventional Commits (`feat(phase-3): room presence`).
- Write the test first for bugs; add tests with every feature.
- Ask the user only if blocked by something unresolvable. Otherwise pick the safest option and log it in `docs/DECISIONS.md`.

## Conventions
- TypeScript strict, no `any` (use `unknown` + zod parsing at boundaries).
- Small modules with single responsibility; no file over ~300 lines.
- UI: Tailwind, accessible by default (labels, focus states, `aria-live` for progress, reduced motion).
- Heavy work (hashing, OPFS writes) runs in Web Workers; never block the main thread.
- Throttle UI updates from transfer progress (≤ 4/s per transfer).
- Constants live in `packages/protocol/constants.ts` (chunk size, thresholds, limits).

## Must never
- Send file bytes, names, or sizes to any server API or log them.
- Write to disk before the receiver clicks Accept.
- Auto-open received files.
- Trust client-provided room membership: the server checks same-room before relaying `signal`.
- Load a whole file into memory (no `file.arrayBuffer()` on the full file; no unbounded buffers).
- Use `localStorage` for transfer state (use IndexedDB); `sessionStorage` only for per-tab `deviceId`.
- Add analytics/trackers or third-party scripts.
- Commit secrets; use `.env` + `.env.example`.
- Promise direct connections in UI copy. Always disclose relayed state.

## Commands
```
pnpm install
pnpm dev          # web + signaling
pnpm build
pnpm lint
pnpm typecheck
pnpm test         # unit + integration
pnpm e2e          # Playwright (chromium, firefox, webkit)
```

## Definition of done for any change
Tests added/updated and passing, docs updated if behavior or protocol changed, no new lint/type errors, no secrets, no PII in logs.
