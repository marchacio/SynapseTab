import { describe, it, expect } from 'vitest';
import { determineSyncAction } from './sync-action.js';
import { SyncPayload } from './types.js';

describe('determineSyncAction Pure Decision Engine', () => {
  const createMockSnapshot = (version?: number, updatedAt: number = 1000): SyncPayload => ({
    client_id: 'firefox-remote',
    updated_at: updatedAt,
    version,
    active_workspace_id: 'default',
    workspaces: [
      {
        id: 'default',
        name: 'Main',
        tabs: [],
      },
    ],
  });

  describe('When server snapshot is null', () => {
    it('returns push when server has no snapshot yet', () => {
      const action = determineSyncAction(null, {
        version: 1,
        updatedAt: 1000,
        hasLocalChanges: false,
      });
      expect(action).toBe('push');
    });
  });

  describe('Numeric version comparisons', () => {
    it('returns pull when server contains a newer version than clean local instance', () => {
      const serverSnapshot = createMockSnapshot(5, 1000);
      const action = determineSyncAction(serverSnapshot, {
        version: 3,
        updatedAt: 900,
        hasLocalChanges: false,
      });
      expect(action).toBe('pull');
    });

    it('returns push when server contains an equal version to local instance', () => {
      const serverSnapshot = createMockSnapshot(5, 1000);
      const action = determineSyncAction(serverSnapshot, {
        version: 5,
        updatedAt: 1000,
        hasLocalChanges: false,
      });
      expect(action).toBe('push');
    });

    it('returns push when server contains a lower version than local instance', () => {
      const serverSnapshot = createMockSnapshot(4, 1000);
      const action = determineSyncAction(serverSnapshot, {
        version: 5,
        updatedAt: 1100,
        hasLocalChanges: false,
      });
      expect(action).toBe('push');
    });

    it('returns push when server version equals local base version, but local has unpushed changes', () => {
      // Local was at version 4, made local edits -> effective version is 5.
      // Server is at version 4 (lower than effective 5) -> push!
      const serverSnapshot = createMockSnapshot(4, 1000);
      const action = determineSyncAction(serverSnapshot, {
        version: 4,
        updatedAt: 1000,
        hasLocalChanges: true,
      });
      expect(action).toBe('push');
    });

    it('returns push when server version equals effective local version with unpushed changes', () => {
      // Local was at version 4, made local edits -> effective version is 5.
      // Server has version 5 (equal to effective 5) -> push!
      const serverSnapshot = createMockSnapshot(5, 1000);
      const action = determineSyncAction(serverSnapshot, {
        version: 4,
        updatedAt: 1000,
        hasLocalChanges: true,
      });
      expect(action).toBe('push');
    });

    it('returns pull when server version is higher than effective local version even with unpushed changes', () => {
      // Local was at version 4, made local edits -> effective version is 5.
      // Server has version 7 (strictly greater than effective 5) -> pull!
      const serverSnapshot = createMockSnapshot(7, 1000);
      const action = determineSyncAction(serverSnapshot, {
        version: 4,
        updatedAt: 1000,
        hasLocalChanges: true,
      });
      expect(action).toBe('pull');
    });
  });

  describe('Timestamp fallback comparisons (when versions are absent/uninitialized)', () => {
    it('returns pull when server has a newer timestamp than local instance', () => {
      const serverSnapshot = createMockSnapshot(undefined, 2000);
      const action = determineSyncAction(serverSnapshot, {
        version: 0,
        updatedAt: 1000,
        hasLocalChanges: false,
      });
      expect(action).toBe('pull');
    });

    it('returns push when server has an equal timestamp to local instance', () => {
      const serverSnapshot = createMockSnapshot(undefined, 1000);
      const action = determineSyncAction(serverSnapshot, {
        version: 0,
        updatedAt: 1000,
        hasLocalChanges: false,
      });
      expect(action).toBe('push');
    });

    it('returns push when server has an older timestamp than local instance', () => {
      const serverSnapshot = createMockSnapshot(undefined, 900);
      const action = determineSyncAction(serverSnapshot, {
        version: 0,
        updatedAt: 1000,
        hasLocalChanges: false,
      });
      expect(action).toBe('push');
    });

    it('returns push when local has unpushed changes and server timestamp is older or equal', () => {
      const serverSnapshot = createMockSnapshot(undefined, 1000);
      const action = determineSyncAction(serverSnapshot, {
        version: 0,
        updatedAt: 1000,
        hasLocalChanges: true,
      });
      expect(action).toBe('push');
    });
  });
});
