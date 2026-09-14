# Local Development & Multi-Device Concurrency Testing

This guide explains how to develop, test, and debug SynapseTab's tab and workspace synchronization on a single workstation by running two independent Firefox client profile instances alongside the local backend service.

---

## 1. Prerequisites

- **Node.js**: v20+ (v22 or v24 recommended)
- **npm**: v10+
- **Docker & Docker Compose** (for running Redis in dev mode)
- **Mozilla Firefox**: Any modern version (Firefox 115+ ESR or standard release)

---

## 2. Initial Setup

Clone and install dependencies for the root workspace, extension, and server:

```bash
git clone https://github.com/your-org/SynapseTab.git
cd SynapseTab
npm install
```

Build the initial extension bundle:

```bash
npm run build:extension
```

---

## 3. Starting the Backend & Redis

You can start the backend service using Docker Compose:

```bash
docker compose -f docker-compose.dev.yml up -d
```

Verify that the health readiness probe returns `healthy`:

```bash
curl http://localhost:8080/api/v1/health
```

Expected JSON response:
```json
{
  "status": "healthy",
  "redis": "connected",
  "uptime": 2,
  "timestamp": 1773329000,
  "version": "1.0.0"
}
```

Alternatively, if you already have Redis running locally:
```bash
npm run dev:server
```

---

## 4. Multi-Profile Simulator (Client A & Client B)

To simulate two distinct workstations syncing across the same server, use the dual profile scripts. Each command initializes an isolated Firefox profile folder under `.firefox-profiles/` and loads the SynapseTab extension in live-reload mode.

### Step 4.1: Launch Client A

Open a terminal and run:

```bash
npm run dev:client-a
```

- Profile directory: `.firefox-profiles/client-a`
- When Firefox opens:
  1. Click the **SynapseTab** extension icon in the toolbar.
  2. Open the **Settings** drawer (gear icon).
  3. Verify the settings:
     - **Backend URL**: `http://localhost:8080`
     - **Sync Secret**: `synapse_dev_secret_123`
     - **Client ID**: `workstation-laptop`
  4. Click **Save Settings**.

### Step 4.2: Launch Client B

Open a second terminal window and run:

```bash
npm run dev:client-b
```

- Profile directory: `.firefox-profiles/client-b`
- When Firefox opens:
  1. Click the **SynapseTab** extension icon in the toolbar.
  2. Open the **Settings** drawer (gear icon).
  3. Set:
     - **Backend URL**: `http://localhost:8080`
     - **Sync Secret**: `synapse_dev_secret_123`
     - **Client ID**: `workstation-desktop`
  4. Click **Save Settings**.

---

## 5. Verifying Automated Synchronization

### Test Scenario 1: Tab Creation & Debounced Sync
1. In **Client A**, open three tabs (e.g., `https://wikipedia.org`, `https://github.com`, `https://news.ycombinator.com`).
2. Notice that the extension aggregates tab changes and waits for a **1000ms debounce** window before transmitting to `POST /api/v1/sync`.
3. In **Client B**, wait for the next polling cycle (or click **Sync Now** in the popup).
4. Notice that **Client B** materializes all three tabs immediately.
5. Inspect the newly created tabs in Client B: notice they are created with `{ discarded: true }` (suspended state), consuming **zero network requests and zero RAM** until you click on them.

### Test Scenario 2: Tab Removal
1. In **Client A**, close the `https://news.ycombinator.com` tab.
2. After 1000ms debounce, the state is persisted to Redis.
3. In **Client B**, the tab is automatically identified by the pure diff engine (`tabsToClose`) and closed without affecting other open tabs.

### Test Scenario 3: Workspace Switching & Tab Hiding
1. In **Client A**, click **+ New** in the popup and create a workspace named `Research`.
2. Switch to `Research` and open two research tabs.
3. Notice tabs from the `Main` workspace are hidden from the tab bar via `browser.tabs.hide()`.
4. In **Client B**, the `Research` workspace appears with its corresponding tabs. Switching workspaces smoothly hides and reveals tabs in the unified session.

---

## 6. Inspecting Logs & Debugging via `about:debugging`

To inspect background console logs, network events, and stored session values:

1. In either Firefox instance, navigate to `about:debugging`.
2. Click **This Firefox** on the left navigation bar.
3. Scroll down to **SynapseTab** under Temporary Extensions.
4. Click **Inspect** to open the Web Developer Tools dedicated to the background module.
5. In the Console tab, you will observe real-time log outputs:
   - `[SynapseTab] Background service initialized.`
   - `[SynapseTab] Local state pushed successfully.`
   - `[SynapseTab] Remote reconciliation applied successfully.`
6. You can evaluate the immutable session values on any tab in the console:
   ```javascript
   let [tab] = await browser.tabs.query({ active: true, currentWindow: true });
   console.log("Tab UUID:", await browser.sessions.getTabValue(tab.id, "tab_uuid"));
   console.log("Workspace ID:", await browser.sessions.getTabValue(tab.id, "workspace_id"));
   ```

---

## 7. Running the Test Suites

Execute all automated unit and integration tests across the monorepo:

```bash
# Run all tests
npm test

# Run extension reconciliation tests only
npm run test:extension

# Run server integration tests only
npm run test:server

# Run web-ext lint compliance check
npm run lint:web-ext
```
