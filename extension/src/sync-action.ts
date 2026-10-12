import { SyncPayload } from './types.js';

export interface LocalInstanceVersion {
  version: number;
  updatedAt: number;
  hasLocalChanges?: boolean;
  initialSyncCompleted?: boolean;
  isLocalSessionMissingTabs?: boolean;
}

export type SyncAction = 'pull' | 'push' | 'none';

export interface LocalTabSummary {
  id?: number;
  url?: string;
  uuid?: string;
}

export interface SessionMissingEvaluation {
  isMissing: boolean;
  matchingCount: number;
  remoteTabsCount: number;
  reason?: string;
}

/**
 * Pure evaluation function to determine if the local browser session is missing remote tabs
 * (for example, if Firefox started fresh without session restore, after a crash, or on a clean profile).
 *
 * Rules:
 * 1. If remote has 0 tabs or is null, session cannot be missing.
 * 2. If the local browser contains ANY tab matching remote UUIDs (matchingCount > 0),
 *    the session was restored. Minor disparities (e.g. 96 matching tabs out of 97 remote tabs)
 *    represent normal tab closures or non-sync tabs, NOT a lost browser session!
 * 3. Only if ZERO remote tabs match (matchingCount === 0) AND the local browser is in a fresh/blank state
 *    (e.g. 0-1 tabs, or all tabs are non-sync URLs like about:newtab/about:home) is the session truly missing.
 */
export function evaluateSessionMissingTabs(
  remoteState: SyncPayload | null,
  localTabs: LocalTabSummary[]
): SessionMissingEvaluation {
  if (!remoteState) {
    return { isMissing: false, matchingCount: 0, remoteTabsCount: 0 };
  }

  const remoteTabsCount = (remoteState.workspaces || []).reduce(
    (acc, ws) => acc + (ws.tabs?.length || 0),
    0
  );
  if (remoteTabsCount === 0) {
    return { isMissing: false, matchingCount: 0, remoteTabsCount: 0 };
  }

  const remoteUuids = new Set<string>();
  for (const ws of remoteState.workspaces || []) {
    for (const t of ws.tabs || []) {
      if (t.uuid) remoteUuids.add(t.uuid);
    }
  }

  let matchingCount = 0;
  for (const tab of localTabs) {
    if (tab.uuid && remoteUuids.has(tab.uuid)) {
      matchingCount++;
    }
  }

  // If local browser has tabs matching remote UUIDs, the session was restored by Firefox!
  if (matchingCount > 0) {
    return {
      isMissing: false,
      matchingCount,
      remoteTabsCount,
      reason: `Local browser has ${matchingCount}/${remoteTabsCount} matching tabs present. Session is intact.`,
    };
  }

  // Zero tabs match: verify whether the browser is essentially in a clean/empty state
  // (e.g. fresh launch with 0 or 1 default new/blank tab, or all non-sync tabs).
  const isFreshBrowserWindow =
    localTabs.length === 0 ||
    localTabs.length === 1 ||
    localTabs.every((tab) => isNonSyncUrl(tab.url));

  if (isFreshBrowserWindow) {
    return {
      isMissing: true,
      matchingCount: 0,
      remoteTabsCount,
      reason: `Fresh browser session detected: 0/${remoteTabsCount} remote tabs present locally.`,
    };
  }

  return {
    isMissing: false,
    matchingCount: 0,
    remoteTabsCount,
    reason: `Local browser has active non-matching browsing state (${localTabs.length} tabs).`,
  };
}

/**
 * Pure decision engine for synchronization.
 * Compares the version and timestamp of the instance saved in the server against the current Firefox instance:
 * - If server has no snapshot yet (null / empty), push initial snapshot ('push').
 * - If this client is freshly installed / configured and has not completed an initial sync,
 *   it must pull the latest snapshot from the server ('pull') to avoid overwriting remote state.
 * - If the local browser session is completely missing remote tabs (e.g. fresh launch without session restore),
 *   it must pull from the server ('pull') to restore the workspaces and tabs.
 * - If the server contains a newer version than the local instance, pull it ('pull').
 * - If the local instance is newer than the server (e.g. unpushed changes or higher version), push it ('push').
 * - If the local instance is the same as the server (equal versions/timestamps and no unpushed changes),
 *   do nothing ('none').
 */
export function determineSyncAction(
  serverSnapshot: SyncPayload | null,
  localInstance: LocalInstanceVersion
): SyncAction {
  // If no snapshot exists on the server, the server is uninitialized -> push initial snapshot
  if (!serverSnapshot) {
    return 'push';
  }

  // If this extension is newly installed / configured and has never completed an initial sync:
  // It MUST pull the existing server instance, even if local Firefox opened default tabs.
  const isInitial =
    localInstance.initialSyncCompleted === false ||
    (!localInstance.initialSyncCompleted && localInstance.version === 0 && localInstance.updatedAt === 0);

  if (isInitial) {
    return 'pull';
  }

  const remoteVersion = serverSnapshot.version;
  const remoteUpdatedAt = serverSnapshot.updated_at || 0;
  const hasLocalChanges = Boolean(localInstance.hasLocalChanges);

  // If explicit numeric version counters are present on both server and local instance (> 0)
  if (
    typeof remoteVersion === 'number' &&
    typeof localInstance.version === 'number' &&
    localInstance.version > 0
  ) {
    console.log(`[SynapseTab] Remote version: ${remoteVersion}, Local version: ${localInstance.version}`);
    if (remoteVersion > localInstance.version) {
      // Server has a newer version (another Firefox instance worked and updated the server) -> pull
      return 'pull';
    }

    if (remoteVersion < localInstance.version) {
      // Local version is higher than server -> push
      return 'push';
    }

    // remoteVersion === localInstance.version
    if (hasLocalChanges) {
      // Same base version, but local has unpushed changes (e.g. worked offline outside) -> push
      return 'push';
    }

    // Equal version and no unpushed local changes:
    // If local browser session is missing remote workspaces/tabs (e.g. fresh start without session restore),
    // it must pull to materialize the remote workspaces and tabs.
    if (localInstance.isLocalSessionMissingTabs) {
      const remoteTabCount = (serverSnapshot.workspaces || []).reduce((acc, ws) => acc + (ws.tabs?.length || 0), 0);
      if (remoteTabCount > 0) {
        return 'pull';
      }
    }

    // Equal version and no unpushed local changes -> identical, do nothing
    return 'none';
  }

  // Fallback to timestamp comparison if version counters are missing / uninitialized
  if (remoteUpdatedAt > localInstance.updatedAt) {
    // Server timestamp is newer -> pull
    return 'pull';
  }

  if (remoteUpdatedAt < localInstance.updatedAt) {
    // Local timestamp is newer -> push
    return 'push';
  }

  // remoteUpdatedAt === localInstance.updatedAt
  if (hasLocalChanges) {
    return 'push';
  }

  if (localInstance.isLocalSessionMissingTabs) {
    const remoteTabCount = (serverSnapshot.workspaces || []).reduce((acc, ws) => acc + (ws.tabs?.length || 0), 0);
    if (remoteTabCount > 0) {
      return 'pull';
    }
  }

  return 'none';
}

/**
 * URL schemes and prefixes that represent internal, empty, settings, or extension pages.
 * Changes to tabs with these URLs will NOT trigger sync push events to the server.
 */
export const NON_SYNC_URL_PREFIXES: readonly string[] = [
  'about:',
  'moz-extension://',
  'chrome://',
  'resource://',
  'view-source:about:',
];

/**
 * Evaluates whether a URL should be excluded from triggering sync push events.
 * Empty URLs, Firefox settings (about:*), extension pages (moz-extension://*),
 * and browser chrome pages are ignored.
 */
export function isNonSyncUrl(url?: string | null): boolean {
  if (!url || url.trim() === '') {
    return true;
  }
  const lower = url.trim().toLowerCase();
  return NON_SYNC_URL_PREFIXES.some((prefix) => lower.startsWith(prefix));
}
