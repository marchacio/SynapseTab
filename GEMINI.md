# GEMINI.md - Project Directives & Coding Standards

## 1. Project Mission & Identity
- **Name:** SynapseTab
- **Nature:** 100% Free and Open-Source Software (FOSS).
- **Core Goal:** Ultra-lightweight, self-hosted workspace and tab state synchronization for Mozilla Firefox, engineered for multi-workstation setups without cloud reliance, telemetry, or account sign-ups.

## 2. Core Constraints & Performance Philosophy
- **Performance First:** The browser extension must introduce zero perceived latency and minimal memory impact.
  - Event listener aggregation via a strict **DEBOUNCE_DELAY_MS**.
  - Incoming remote tabs must be materialized in a suspended state (`discarded: true`) to prevent simultaneous network fetches and RAM exhaustion.
- **Shared Session Context:** Workspaces must **never** partition cookies or web storage. Tabs reside within a unified browsing context using `browser.tabs.hide()` and `browser.tabs.show()`.
- **Stateless/Idempotent Diff Engine:** The reconciliation algorithm must be a pure, deterministic function tested against complex edge cases (split, merge, move, remote delete).
- **Durable Persistence:** Storage layer runs on Redis with Append-Only File (`AOF`) logging enabled.

## 3. Engineering, Testing & CI/CD Standards
- **Language:** Strictly **English** for all code, types, comments, git commits, documentation, and interface strings.
- **Test-Driven Core:** 100% unit test coverage for the reconciliation and diff algorithms (`diff.ts`). Backend routes must include integration tests executed against a Redis instance.
- **Continuous Integration:** Every PR/push must pass linter checks, test suites, `web-ext lint` compliance, and multi-arch Docker builds (`linux/amd64`, `linux/arm64`).
- **Local Developer Experience (DX):** Must support hot-reloading for both backend and extension, with scripted commands to launch two independent Firefox profile instances for concurrent sync debugging.

## 4. Backup, Disaster Recovery & Data Integrity Standards
- **Always-Working Backup System:** The backup and restore functionality is a mission-critical core feature of SynapseTab and must remain 100% operational at all times without regression.
  - **Native SynapseTab JSON Format:** Must support full-fidelity export and import capturing all workspaces, tabs, ordering (`order`), dividers (`isDivider`), archived state (`isArchived`), custom badges/icons, and global pinned tabs.
  - **STG Interoperability:** Backward compatibility with Drive4ik Simple Tab Groups (STG v5.3.2) JSON exports must be maintained for seamless migration.
  - **Zero Data Loss Guarantee:** Any schema or storage changes must be verified against dedicated unit tests (`backup-format.test.ts`) to ensure flawless import/export round-trip fidelity.