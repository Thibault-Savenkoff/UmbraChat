# Review: Screenshot detection

- **Verdict**: approve
- **Diff**: `main...feat/screenshot-detection`
- **Axes run**: code, functional, relevancy
- **Date**: 2026_07_29
- **Findings**: 0 critical, 0 warning, 0 minor

## Phases

### Phase 1 — Web: disclosure notice

- [x] The conversation screen always shows the disclosure, present on load, not dismissible — `web/e2e-screenshot-detection.mjs`

## Findings

None. The issue's own acceptance criteria already scopes the web client into the "platform without screenshot-detection support" case - the only correct behavior for this repo's only shipped client is honest disclosure, which is what's built. No fake `blur`/`visibilitychange` heuristic (would false-positive constantly, undermining the disclosure's own point), no envelope type for a notification no client in this repo can send (speculative scaffolding for iOS/Android clients that don't exist yet - add when they do).

## Verification

| Metric        | Value                                             |
| ------------- | -------------------------------------------------- |
| Verified      | 100% (1/1 acceptance criteria)                     |
| Files checked | `web/src/screens/Conversation.tsx`, `web/e2e-screenshot-detection.mjs` |
| Unchecked     | none |
| Unplanned     | none |
