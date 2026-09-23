# How Sync Works (Sync Logic & Diff Engine)

This document explains how SynapseTab handles syncing between multiple Firefox instances without losing data, triggering infinite loops, or freezing your browser.

---

## The Big Picture

At its core, SynapseTab uses a simple rule: **when you start a browser, the server wins; once you are up and running, your latest changes win (Last-Write-Wins).**

Here is what that looks like in practice:

1. **When Firefox starts**, it always pulls from the server first. Local pushes are strictly locked until that initial sync finishes so you don't accidentally wipe out your remote tabs with an empty browser window.
2. **When you do things locally** (open/close tabs, switch workspaces), the extension waits 1 second (1000ms debounce) for you to finish what you're doing, then pushes the whole workspace snapshot to Redis.
3. **Other connected browsers** poll the server every 15 seconds. When they see a newer snapshot from another machine, they run a diff and update their open tabs to match.

---

## What Happens When You Open Firefox (Time X vs Server X-1)

Imagine this common scenario: you worked on your desktop yesterday (Client A pushed state at `X-1`). Today, you boot up your laptop (Client B connects at `X`).

Here is the exact step-by-step of what happens under the hood:

### 1. Safety Lock on Startup (`hasCompletedInitialPull = false`)

When Firefox launches, it often starts with an empty "New Tab" or slowly restores tabs in the background.

If SynapseTab immediately pushed on startup, that single blank tab would overwrite and delete all 30 tabs you left on your desktop.

To prevent this nightmare, there is a simple boolean guard in [`background.ts`](file:///home/marco/Condivisi/Progetti/SynapseTab/extension/src/background.ts):
```typescript
if (isApplyingRemoteDiff || !hasCompletedInitialPull) {
  return; // Stop right here. No pushing allowed until we pulled from the server!
}
```

Until Client B downloads the remote state and finishes matching it, pushing is strictly disabled.

### 2. Fetching Remote State (`GET /api/v1/sync`)

Client B asks the server for the latest snapshot:
- **First time ever?** (Server is empty): Client B pushes its current tabs as the new baseline.
- **On startup (`isInitial = true`)**: Client B **always reconciles against the remote snapshot**, even if the snapshot has the same `client_id`. This is critical: if you restarted Firefox or opened a fresh window with only 1 blank tab, the diff engine immediately restores all your workspaces and tabs from the server instead of ignoring them.
- **During periodic background polling (every 15s)**: If `remoteState.client_id === myClientId`, the client skips reconciling since it was the one that pushed that snapshot and is already in sync.

### 3. The Diff Engine (`diff.ts`)

During a pull, **what's on the server is the single source of truth**. The engine compares local vs remote:

- **Tabs on the server that you don't have locally:**  
  They get opened in your browser. But here's the trick: they open with `discarded: true`. Firefox creates the tab visually in your tab bar, but **does not load the web page or consume RAM** until you actually click on it.
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

Once the initial pull is done, Client B is ready for normal everyday use:

### 1. The 1-Second Debounce Window
Every time you open, close, move a tab, or switch workspaces, SynapseTab starts a 1000ms timer. If you do something else within that second (like closing 5 tabs quickly), the timer resets. Once you stop for a full second, it captures the current state and pushes it.

This avoids spamming the backend with 10 HTTP requests when you simply rearrange your tab bar.

### 2. Last-Write-Wins on the Server
The server receives the snapshot with `POST /api/v1/sync` and writes it to Redis under `tabvortex:workspaces:{userId}`.

Whoever pushed last wins. If two machines push at almost the same second, the last request that hits Redis becomes the active state.

### 3. How Other Devices Find Out
- **Background polling:** every client has a timer that polls the server every **15 seconds** (`browser.alarms`).
- **Manual sync:** clicking the **Sync Now** button in the popup triggers `pullSync()` immediately.

---

## Concurrency & Conflict Cheatsheet

| Scenario | What Happens |
| :--- | :--- |
| **You open laptop (B) while desktop (A) has tabs open** | Laptop pulls desktop's tabs. Tabs open in suspended mode (`discarded: true`) so your laptop doesn't freeze or max out your RAM. |
| **You close a tab on desktop (A), laptop (B) is idle** | Next 15s check on the laptop sees the tab is gone from the server and closes it locally. |
| **You close tabs on A and open tabs on B at the same time** | Both wait 1s. Whichever machine sends its request a split-second later overwrites the server. The other machine will sync to that state on its next 15s poll. |
| **Someone accidentally closed all tabs or lost state** | Use the **Backups** tab in the popup. The server automatically takes snapshots on a schedule, and you can restore any previous snapshot with one click. |
