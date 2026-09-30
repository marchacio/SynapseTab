# How Sync Works (Sync Logic & Diff Engine)

This document explains how SynapseTab handles syncing between multiple Firefox instances without losing data, triggering infinite loops, or freezing your browser.

---

## The Big Picture

At its core, SynapseTab uses clear and deterministic rules:
- **On browser startup**, the extension compares local version/timestamp against the server:
  - If the server has a **newer version** (e.g. another Firefox instance was used and updated the server), it **pulls** the remote changes and reconciles tabs.
  - If the local instance is **newer** (e.g. you worked outside/offline and couldn't push), it **pushes** the local changes to bring the server up to date.
  - If the local instance is the **same** as the server, it **does nothing** (zero redundant reloading or tab churn).
- **On fresh installation / initial configuration**, the extension detects it has not completed an initial sync yet. If a server snapshot exists, it **always pulls** first so an empty/fresh profile never overwrites your existing server state.
- **While browsing**, the extension **only pushes** changes to the server (debounced by 1000ms). It does **not** poll or pull in the background during active usage.

---

## What Happens When You Open Firefox (Startup Evaluation)

Imagine this common scenario: you worked on your desktop yesterday (Client A pushed state at `v5`). Today, you boot up your laptop (Client B).

Here is the exact step-by-step of what happens under the hood:

### 1. Safety Lock on Startup (`hasCompletedInitialPull = false`)

When Firefox launches, it often starts with an empty "New Tab" or slowly restores tabs in the background.

If SynapseTab immediately pushed on startup, that single blank tab could overwrite and delete all 30 tabs you left on your desktop.

To prevent this, there is a boolean guard in [`background.ts`](file:///home/marco/Condivisi/Progetti/SynapseTab/extension/src/background.ts):
```typescript
if (isApplyingRemoteDiff || !hasCompletedInitialPull) {
  return; // Stop right here. No pushing allowed until startup evaluation finishes!
}
```

Until Client B completes its startup evaluation and any required reconciliation, automatic pushing is strictly disabled.

### 2. Fetching Remote State & 3-Way Decision (`determineSyncAction`)

Client B contacts the server (`GET /api/v1/sync`):
- **Server is empty?** Client B pushes its initial state to establish the server baseline.
- **Fresh extension install / newly configured?** (`initialSyncCompleted === false`): Client B **pulls** the remote snapshot from the server first, adopting your workspaces and tabs.
- **Server is newer?** (`remoteVersion > localVersion`): Another computer updated the server. Client B **pulls** the changes and reconciles.
- **Local instance is newer?** (`localVersion === remoteVersion && hasLocalChanges` or `localVersion > remoteVersion`): Client B accumulated unpushed changes (e.g. working offline outside). Client B **pushes** to update the server.
- **Local instance is identical?** (`localVersion === remoteVersion && !hasLocalChanges`): Local and server are in sync. Client B **does nothing**.
- **Offline on startup?** If the client previously completed an initial sync, it continues in offline mode and tracks subsequent local tab edits so they can be pushed when reconnected.

### 3. The Diff Engine (`diff.ts`)

During a pull, **what's on the server is the single source of truth**. The engine compares local vs remote:

- **Tabs on the server that you don't have locally:**  
  They get opened in your browser with `discarded: true`. Firefox creates the tab visually in your tab bar, but **does not load the web page or consume RAM** until you actually click on it.
- **Tabs you had locally that don't exist on the server:**  
  They get closed.
- **Tabs that exist in both places (matched by their unique tab UUID):**  
  If the URL, title, workspace, or pinned status changed on the server, the local tab updates to match. If the order changed, the tab moves to the right index.
- **Workspaces:**  
  Any workspaces created, renamed, recolored, or deleted on the server are mirrored locally.

### 4. Preventing Event Loops (`isApplyingRemoteDiff`)

When the diff engine opens or closes tabs to match the server, Firefox fires its usual events (`tabs.onCreated`, `tabs.onRemoved`, etc.).

Normally, those events tell SynapseTab to push changes to the server. If we let that happen, we'd get stuck in an endless loop: pull $\to$ create tab $\to$ push $\to$ server updates $\to$ pull again.

To stop this, we flip a lock:
```typescript
isApplyingRemoteDiff = true;
try {
  await WorkspaceManager.applyExecutionPlan(plan);
} finally {
  setTimeout(() => { isApplyingRemoteDiff = false; }, 600);
}
```
All event listeners ignore events while `isApplyingRemoteDiff` is true. Once the tabs settle, the lock releases and `hasCompletedInitialPull` becomes `true`.

---

## What Happens When You're Browsing (Steady State)

Once startup evaluation is complete, the extension enters normal browsing mode:

### 1. The 1-Second Debounce Window
Every time you open, close, move a tab, or switch workspaces, SynapseTab starts a 1000ms timer. If you do something else within that second (like closing 5 tabs quickly), the timer resets. Once you stop for a full second, it captures the current state and pushes it.

This avoids spamming the backend with HTTP requests when you simply rearrange your tab bar.

### 2. Push-Only Operation During Usage
While Firefox is running and in use, the extension **only pushes** local changes to the server. It does **not** perform background pulling or polling, ensuring that your active browsing session is never unexpectedly interrupted or modified by remote machines.

### 3. Last-Write-Wins on the Server
The server receives the snapshot with `POST /api/v1/sync` and writes it to Redis under `tabvortex:workspaces:{userId}`.

Whoever pushed last wins. If two machines push, the last request that hits Redis becomes the active state.

---

## Concurrency & Conflict Cheatsheet

| Scenario | What Happens |
| :--- | :--- |
| **Fresh install on a new PC** | Detects uninitialized local state and pulls existing tabs/workspaces from server first; prevents blank browser from overwriting server. |
| **You open laptop (B) after desktop (A) pushed changes** | Startup check detects server is newer (`remoteVersion > localVersion`) and pulls. Tabs open suspended (`discarded: true`). |
| **You open laptop (B) after working offline outside** | Startup check detects laptop has unpushed local changes (`hasLocalChanges: true`) and pushes to update the server. |
| **You open laptop (B) and nothing changed anywhere** | Startup check detects versions are identical and does nothing. Zero tab churn or network diffing. |
| **You are actively browsing** | All tab events debounce (1000ms) and push to the server. No background pulls happen while using Firefox. |
| **Someone accidentally closed all tabs or lost state** | Use the **Backups** tab in the popup. The server automatically takes snapshots on a schedule, and you can restore any previous snapshot with one click. |
