# Architecture, Synchronization & Security Q&A

This document breaks down how SynapseTab transmits data, handles offline scenarios, and guarantees privacy and security across your workstations.

---

### 1. Does the extension send just changes (deltas) or the entire configuration?

**SynapseTab transmits an atomic, full state snapshot.**

When you create, close, or reorganize tabs, the extension waits for a short debounce window (`DEBOUNCE_DELAY_MS`) and captures a complete snapshot of all workspaces and their tabs:

- **Workspaces:** IDs, names, custom icons, emojis, and color tokens.
- **Tabs:** UUIDs, URLs, titles, favicon URLs, indexes, and pinned states.
- **Metadata:** Monotonically increasing version counter (`version`), active workspace ID, and client timestamp.

#### Why snapshots instead of event-stream deltas?
- **Fault Tolerance:** Delta streams corrupt if network drops, packets arrive out of order, or the browser exits unexpectedly. Snapshots guarantee that the server always holds an unequivocal ground truth.
- **Pure Client Diffing ([`diff.ts`](../extension/src/diff.ts)):** The client engine executes the diffing locally. When pulling from the server, it deterministically computes the minimal browser actions (`tabsToCreate`, `tabsToClose`, `tabsToMove`, `tabsToUpdate`).
- **Payload Size:** Even with 100+ tabs across 10 workspaces, the full JSON snapshot is only ~15–35 KB (under 5 KB compressed over the wire).

---

### 2. Is data encrypted during transit?

**Yes, via standard Transport Layer Security (TLS / HTTPS).**

When your extension points to an `https://` endpoint (e.g. via Caddy, Nginx, Cloudflare Tunnel, or Traefik):
- The entire HTTP request body (tab URLs, workspace names, tab titles) is encrypted end-to-end.
- All HTTP headers, including the `Authorization: Bearer <secret>` authentication token, are fully encrypted.
- Network intermediaries (ISPs, public Wi-Fi, cell towers) only see encrypted packets to your domain name.

---

### 3. What happens when I'm outside and can't reach my home server?

**SynapseTab is completely offline-resilient:**

- **Uninterrupted Browsing:** You can open, move, close tabs, and switch workspaces normally. All operations are tracked locally in Firefox's extension storage (`browser.storage.local`) and session storage (`browser.sessions`).
- **Safe Offline Status:** Failed push requests fail gracefully. SynapseTab logs an offline notice in the debug log and updates the status indicator without modifying or closing any local tabs.
- **Safe Browser Launch:** When opening Firefox outside your network, SynapseTab detects that it cannot reach the server, keeps your local session intact, and continues in offline mode.
- **Seamless Catch-Up:** As soon as you reconnect to your home network or turn on your VPN (Tailscale/WireGuard), click **"Push changes now"** (or let tab events trigger) to push your accumulated changes with an incremented version to the server.

---

### 4. What about security, passwords, and browser cookies?

- **Zero Cookie / Session / Credential Leakage:** SynapseTab **never** reads, intercepts, or syncs cookies, localStorage, IndexedDB, or session tokens. Workspaces share your existing Firefox browsing context locally. Only tab URLs and titles are synced. Your banking sessions, logged-in accounts, and passwords never leave your computer.
- **Shared Bearer Secret Authentication:** Every API route on the server requires the `Authorization: Bearer <secret>` header. Requests with missing or invalid tokens are rejected immediately with HTTP `401 Unauthorized`.
- **Strict Schema Enforcement:** Incoming payloads are validated against compile-time schemas via TypeBox. Malformed, unexpected, or excessively large payloads are rejected with HTTP `400 Bad Request`.
- **Non-Sync Pages Excluded:** Internal browser URLs (`about:*`, `moz-extension://*`, `chrome://*`, and blank tabs) are strictly excluded from sync to protect your environment and avoid loopbacks.

---

### 5. How are remote workspaces loaded without slowing down my browser?

**Incoming remote tabs are materialized in a suspended state (`discarded: true`).**

When SynapseTab restores 50, 100, or more tabs from another workstation, it creates them natively discarded. They appear in the tab bar with their real title, URL, and favicon, but Firefox does **not** download the web page or load DOM trees into RAM until you actively click on the tab. This ensures instant synchronization with virtually zero network bandwidth and negligible memory usage.

---
