import { SyncPayload } from './types.js';

export interface LocalInstanceVersion {
  version: number;
  updatedAt: number;
  hasLocalChanges?: boolean;
}

export type SyncAction = 'pull' | 'push';

/**
 * Pure decision engine for the Synchronize button.
 * Compares the version of the instance saved in the server against the current Firefox instance:
 * - If the server contains a "newer version of the firefox instance", pull it ('pull').
 * - If server has a lower or equal version of the current firefox instance, push it to the server ('push').
 */
export function determineSyncAction(
  serverSnapshot: SyncPayload | null,
  localInstance: LocalInstanceVersion
): SyncAction {
  // If no snapshot exists on the server, the server has a lower version (0 / uninitialized)
  if (!serverSnapshot) {
    return 'push';
  }

  const remoteVersion = serverSnapshot.version;
  const remoteUpdatedAt = serverSnapshot.updated_at || 0;

  // Determine effective local version and timestamp taking into account unpushed local changes
  const effectiveLocalVersion = localInstance.hasLocalChanges
    ? localInstance.version + 1
    : localInstance.version;

  const effectiveLocalUpdatedAt = localInstance.hasLocalChanges
    ? Math.max(localInstance.updatedAt, Math.floor(Date.now() / 1000))
    : localInstance.updatedAt;

  // If explicit numeric version counters are present on both server and local instance
  if (
    typeof remoteVersion === 'number' &&
    typeof effectiveLocalVersion === 'number' &&
    effectiveLocalVersion > 0
  ) {
    if (remoteVersion > effectiveLocalVersion) {
      return 'pull';
    }
    return 'push';
  }

  // Fallback to timestamp comparison if version counters are missing/uninitialized
  if (remoteUpdatedAt > effectiveLocalUpdatedAt) {
    return 'pull';
  }

  return 'push';
}
