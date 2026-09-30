import { SyncPayload } from './types.js';

export interface LocalInstanceVersion {
  version: number;
  updatedAt: number;
  hasLocalChanges?: boolean;
  initialSyncCompleted?: boolean;
  isLocalSessionMissingTabs?: boolean;
}

export type SyncAction = 'pull' | 'push' | 'none';

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

  // If local browser session is missing remote workspaces/tabs (e.g. fresh start without session restore),
  // it must pull to materialize the remote workspaces and tabs.
  if (localInstance.isLocalSessionMissingTabs && serverSnapshot) {
    const remoteTabCount = (serverSnapshot.workspaces || []).reduce((acc, ws) => acc + (ws.tabs?.length || 0), 0);
    if (remoteTabCount > 0) {
      return 'pull';
    }
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
