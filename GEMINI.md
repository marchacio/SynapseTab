# GEMINI.md - Project Directives & Coding Standards

## 1. Project Mission & Identity
- **Name:** SynapseTab
- **Nature:** 100% Free and Open-Source Software (FOSS).
- **Core Goal:** Ultra-lightweight, self-hosted workspace and tab state synchronization for Mozilla Firefox, engineered for multi-workstation setups without cloud reliance, telemetry, or account sign-ups.

## 2. Core Constraints & Performance Philosophy
- **Performance First:** The browser extension must introduce zero perceived latency and minimal memory impact.
  - Event listener aggregation via a strict **1000ms debounce**.
  - Incoming remote tabs must be materialized in a suspended state (`discarded: true`) to prevent simultaneous network fetches and RAM exhaustion.
- **Shared Session Context:** Workspaces must **never** partition cookies or web storage. Tabs reside within a unified browsing context using `browser.tabs.hide()` and `browser.tabs.show()`.
- **Stateless/Idempotent Diff Engine:** The reconciliation algorithm must be a pure, deterministic function tested against complex edge cases (split, merge, move, remote delete).
- **Durable Persistence:** Storage layer runs on Redis with Append-Only File (`AOF`) logging enabled.

## 3. Engineering, Testing & CI/CD Standards
- **Language:** Strictly **English** for all code, types, comments, git commits, documentation, and interface strings.
- **Test-Driven Core:** 100% unit test coverage for the reconciliation and diff algorithms (`diff.ts`). Backend routes must include integration tests executed against a Redis instance.
- **Continuous Integration:** Every PR/push must pass linter checks, test suites, `web-ext lint` compliance, and multi-arch Docker builds (`linux/amd64`, `linux/arm64`).
- **Local Developer Experience (DX):** Must support hot-reloading for both backend and extension, with scripted commands to launch two independent Firefox profile instances for concurrent sync debugging.