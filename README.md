<p align="center">
  <img src="extension/icons/icon-128.png" alt="SynapseTab Logo" width="96" height="96">
</p>

<h1 align="center">SynapseTab</h1>

<p align="center">
  <strong>Ultra-lightweight, self-hosted workspace and tab state synchronization for Mozilla Firefox.</strong>
</p>

<p align="center">
  <a href="https://github.com/marchacio/SynapseTab/actions/workflows/ci.yml"><img src="https://github.com/marchacio/SynapseTab/actions/workflows/ci.yml/badge.svg" alt="Continuous Integration"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
  <a href="https://addons.mozilla.org"><img src="https://img.shields.io/badge/Firefox-Manifest%20V3-FF7139.svg" alt="Firefox Manifest V3"></a>
  <a href="https://ghcr.io"><img src="https://img.shields.io/badge/Docker-amd64%20%7C%20arm64-blue" alt="Docker Multi-Arch"></a>
</p>

---

> Note: This project is currently under development. You’re welcome to try it out, modify it, improve it and report any bugs on the dedicated Issues page, or open a Pull Request – thank you very much for your help!
This project was created to meet my own needs, but as I’m a strong believer in the open-source community, I thought it would be useful and helpful to make it public and available to everyone 😄


## 1. Project goals

SynapseTab is an Open-Source tab and workspace synchronization system engineered for multi-workstation setups. It replaces proprietary cloud synchronization with a self-hosted solution that requires:
- **Zero cloud reliance**
- **Zero user accounts or telemetry**
- **Zero perceived latency**


TODO add gif showing a cool demo of SynapseTab


---

## 2. Core Architecture

### 1. Workspaces
Workspaces in SynapseTab **never** partition cookies, LocalStorage, or session tokens. All tabs live in the same window under a unified browsing context:
- Inactive workspace tabs are tucked away using `browser.tabs.hide()`.
- Active workspace tabs are made visible with `browser.tabs.show()`.
- Transitions safely activate destination tabs before hiding origin tabs, adhering to Mozilla's tab-hiding rules.

### 2. Stable Tab Identity
Because Firefox internal `tabId`s are volatile across browser restarts, SynapseTab assigns an immutable UUIDv4 upon tab creation and persists it across sessions using `browser.sessions.setTabValue(tabId, "tab_uuid", uuid)`.

### 3. Aggregation & Debounce
Local tab operations (`tabs.onCreated`, `tabs.onUpdated`, `tabs.onRemoved`, `tabs.onMoved`, `tabs.onActivated`) are aggregated in memory. State sync payloads are dispatched to the backend only after a strict **1000ms debounce** window of user inactivity.

### 4. Lazy Tab Materialization
Incoming remote tabs are materialized in a suspended state using:
```typescript
browser.tabs.create({ url: remoteTab.url, discarded: true, active: false })
```
This guarantees **zero network requests** and **zero RAM consumption** until a tab is explicitly brought to focus by the user.

### 5. Reconciliation algorithm
State reconciliation is computed via a `diff` algorithm that produces a plan of actions to apply to the local state to match the remote state.


### 6. Durable Persistence Layer
State is stored in Redis 7+ with Append-Only file (`appendonly yes`) logging enabled, keyed under `tabvortex:workspaces:<user_id>`.

### 7. Automated Server Backups & Retention Policy
Historical workspace snapshots are backed up directly on the server without client-side storage overhead:
- **Periodic Snapshot Scheduler**: Automated background snapshots configurable to run `hourly`, `daily`, `weekly`, or `monthly`.
- **Intelligent Retention Pruning**: Configurable retention limits (`maxCopies`, default 10) automatically prune older copies upon new snapshot creation.
- **Visual Management UI**: Dedicated popup panel with direct controls to explore snapshot workspaces/tabs, restore past states with immediate client reconciliation, or delete backups.

---

---

## 3. Local development

See [docs/LOCAL_DEVELOPMENT.md](docs/LOCAL_DEVELOPMENT.md) for full concurrency testing scenarios and backup simulation.

---

## 4. Production Deployment

### Docker Compose
Deploy SynapseTab on a home server (in my case Proxmox, but works also with Portainer, Rancher or just Docker) behind a WireGuard VPN or reverse proxy:

```bash
# 1. Create production environment configuration
cp .env.example .env
# Edit .env to set your SYNC_SECRET, BACKUP_INTERVAL, and BACKUP_RETENTION_COPIES

# 2. Start the production stack
docker compose -f deploy/docker-compose.prod.yml up -d
```

### Backend Endpoints
- `POST /api/v1/sync`: Persists workspace snapshot (Requires `Authorization: Bearer <SYNC_SECRET>`).
- `GET /api/v1/sync`: Returns latest workspace snapshot (Requires `Authorization: Bearer <SYNC_SECRET>`).
- `GET /api/v1/health`: Readiness probe returning 200 OK and Redis connection status.
- `GET /api/v1/backups`: Lists stored backup metadata and active retention policy.
- `POST /api/v1/backups`: Triggers an immediate manual snapshot backup.
- `GET /api/v1/backups/:id`: Returns detailed snapshot contents for preview and exploration.
- `POST /api/v1/backups/:id/restore`: Restores a snapshot into the active workspace state.
- `DELETE /api/v1/backups/:id`: Deletes a specific backup snapshot.
- `GET /api/v1/backups/config`: Fetches user backup schedule and retention policy.
- `POST /api/v1/backups/config`: Updates backup schedule and retention policy.


---

## 5. Automated testing suite

The codebase enforces strict test-driven development:

```bash
# Run all unit and integration tests
npm test

# Run pure reconciliation tests (diff.test.ts)
npm run test:extension

# Run Fastify & Redis integration tests (server.test.ts)
npm run test:server

# Validate Firefox MV3 compliance
npm run lint:web-ext
```

---

## 6. License

Released under the **MIT License**. 100% Free and Open-Source Software (FOSS).

## 7. AI usage

The entire project was developed using the Antigravity agent-based IDE (as you can see from the GEMINI.md file), in accordance with all best practices for software development and the use of AI.
