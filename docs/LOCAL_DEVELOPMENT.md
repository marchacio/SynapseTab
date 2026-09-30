# Local Development & Multi-Device Concurrency Testing

This guide explains how to develop, test, and debug SynapseTab's tab and workspace synchronization on a single workstation by running two independent Firefox client profile instances alongside the local backend service.

Please note that this guide **will not affect** your default standard Firefox session – the one you use every day – but will create ‘temporary sessions’ solely for the purpose of running tests and checking the functionality of the software.

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

Build the extension (use this commando also to rebuild after changes):

```bash
npm run build
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
  "version": "1.2.0"
}
```

Alternatively, if you already have Redis running locally:
```bash
npm run dev:server
```

---

## 4. Multi-Profile simulator (Client A & Client B)

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
     - **User ID**: `default`
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
     - **User ID**: `default`
     - **Client ID**: `workstation-desktop`
  4. Click **Save Settings**.

---

## 5. Running the Test Suites

Execute all automated unit and integration tests across the repo:

```bash
# Run all tests
npm test
```
