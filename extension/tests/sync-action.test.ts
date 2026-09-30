import { describe, it, expect } from 'vitest';
import { determineSyncAction, isNonSyncUrl } from '../src/sync-action.js';
import { SyncPayload } from '../src/types.js';

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
        initialSyncCompleted: true,
      });
      expect(action).toBe('push');
    });

    it('returns push when server has no snapshot even on initial setup', () => {
      const action = determineSyncAction(null, {
        version: 0,
        updatedAt: 0,
        hasLocalChanges: false,
        initialSyncCompleted: false,
      });
      expect(action).toBe('push');
    });
  });

  describe('Fresh installation / Uninitialized client safeguard', () => {
    it('returns pull when extension is newly installed and server has an existing snapshot', () => {
      const serverSnapshot = createMockSnapshot(5, 1000);
      const action = determineSyncAction(serverSnapshot, {
        version: 0,
        updatedAt: 0,
        hasLocalChanges: false,
        initialSyncCompleted: false,
      });
      expect(action).toBe('pull');
    });

    it('returns pull on fresh install even if local browser opened tabs (hasLocalChanges is true)', () => {
      const serverSnapshot = createMockSnapshot(5, 1000);
      const action = determineSyncAction(serverSnapshot, {
        version: 0,
        updatedAt: 0,
        hasLocalChanges: true,
        initialSyncCompleted: false,
      });
      expect(action).toBe('pull');
    });

    it('returns pull if initialSyncCompleted is undefined but version and updatedAt are 0', () => {
      const serverSnapshot = createMockSnapshot(1, 1000);
      const action = determineSyncAction(serverSnapshot, {
        version: 0,
        updatedAt: 0,
        hasLocalChanges: false,
      });
      expect(action).toBe('pull');
    });
  });

  describe('Numeric version comparisons', () => {
    it('returns pull when server contains a newer version than local instance (another PC worked)', () => {
      const serverSnapshot = createMockSnapshot(5, 1000);
      const action = determineSyncAction(serverSnapshot, {
        version: 3,
        updatedAt: 900,
        hasLocalChanges: false,
        initialSyncCompleted: true,
      });
      expect(action).toBe('pull');
    });

    it('returns none when server contains an equal version to local instance and no local changes (do nothing)', () => {
      const serverSnapshot = createMockSnapshot(5, 1000);
      const action = determineSyncAction(serverSnapshot, {
        version: 5,
        updatedAt: 1000,
        hasLocalChanges: false,
        initialSyncCompleted: true,
      });
      expect(action).toBe('none');
    });

    it('returns push when server contains an equal base version but local has unpushed offline changes', () => {
      // Laptop was outside and made changes that were not pushed -> local is newer -> push!
      const serverSnapshot = createMockSnapshot(5, 1000);
      const action = determineSyncAction(serverSnapshot, {
        version: 5,
        updatedAt: 1000,
        hasLocalChanges: true,
        initialSyncCompleted: true,
      });
      expect(action).toBe('push');
    });

    it('returns push when server contains a lower version than local instance', () => {
      const serverSnapshot = createMockSnapshot(4, 1000);
      const action = determineSyncAction(serverSnapshot, {
        version: 5,
        updatedAt: 1100,
        hasLocalChanges: false,
        initialSyncCompleted: true,
      });
      expect(action).toBe('push');
    });

    it('returns pull when server version is higher than local base version even if local has unpushed changes', () => {
      // Remote desktop pushed v7 while laptop was offline at v4 -> remote is ahead -> pull!
      const serverSnapshot = createMockSnapshot(7, 1000);
      const action = determineSyncAction(serverSnapshot, {
        version: 4,
        updatedAt: 1000,
        hasLocalChanges: true,
        initialSyncCompleted: true,
      });
      expect(action).toBe('pull');
    });

    it('returns pull when versions match but local session is missing remote tabs (e.g. restart without session restore)', () => {
      const serverSnapshot = createMockSnapshot(5, 1000);
      serverSnapshot.workspaces[0].tabs = [
        { uuid: 'tab-1', url: 'https://example.com', title: 'Example', pinned: false, index: 0 },
      ];
      const action = determineSyncAction(serverSnapshot, {
        version: 5,
        updatedAt: 1000,
        hasLocalChanges: false,
        initialSyncCompleted: true,
        isLocalSessionMissingTabs: true,
      });
      expect(action).toBe('pull');
    });

    it('returns none when versions match and isLocalSessionMissingTabs is true but server has 0 tabs', () => {
      const serverSnapshot = createMockSnapshot(5, 1000);
      serverSnapshot.workspaces[0].tabs = [];
      const action = determineSyncAction(serverSnapshot, {
        version: 5,
        updatedAt: 1000,
        hasLocalChanges: false,
        initialSyncCompleted: true,
        isLocalSessionMissingTabs: true,
      });
      expect(action).toBe('none');
    });
  });

  describe('Timestamp fallback comparisons (when versions are absent/uninitialized)', () => {
    it('returns pull when server has a newer timestamp than local instance', () => {
      const serverSnapshot = createMockSnapshot(undefined, 2000);
      const action = determineSyncAction(serverSnapshot, {
        version: 0,
        updatedAt: 1000,
        hasLocalChanges: false,
        initialSyncCompleted: true,
      });
      expect(action).toBe('pull');
    });

    it('returns none when server has an equal timestamp and no local changes', () => {
      const serverSnapshot = createMockSnapshot(undefined, 1000);
      const action = determineSyncAction(serverSnapshot, {
        version: 0,
        updatedAt: 1000,
        hasLocalChanges: false,
        initialSyncCompleted: true,
      });
      expect(action).toBe('none');
    });

    it('returns push when server has an older timestamp than local instance', () => {
      const serverSnapshot = createMockSnapshot(undefined, 900);
      const action = determineSyncAction(serverSnapshot, {
        version: 0,
        updatedAt: 1000,
        hasLocalChanges: false,
        initialSyncCompleted: true,
      });
      expect(action).toBe('push');
    });

    it('returns push when timestamps are equal but local has unpushed changes', () => {
      const serverSnapshot = createMockSnapshot(undefined, 1000);
      const action = determineSyncAction(serverSnapshot, {
        version: 0,
        updatedAt: 1000,
        hasLocalChanges: true,
        initialSyncCompleted: true,
      });
      expect(action).toBe('push');
    });
  });

  describe('isNonSyncUrl URL Filtering', () => {
    it('identifies undefined, null, and empty string as non-sync URLs', () => {
      expect(isNonSyncUrl(undefined)).toBe(true);
      expect(isNonSyncUrl(null)).toBe(true);
      expect(isNonSyncUrl('')).toBe(true);
      expect(isNonSyncUrl('   ')).toBe(true);
    });

    it('identifies about: pages as non-sync URLs', () => {
      expect(isNonSyncUrl('about:blank')).toBe(true);
      expect(isNonSyncUrl('about:newtab')).toBe(true);
      expect(isNonSyncUrl('about:home')).toBe(true);
      expect(isNonSyncUrl('about:preferences')).toBe(true);
      expect(isNonSyncUrl('about:preferences#privacy')).toBe(true);
      expect(isNonSyncUrl('about:config')).toBe(true);
      expect(isNonSyncUrl('about:addons')).toBe(true);
      expect(isNonSyncUrl('about:debugging')).toBe(true);
    });

    it('identifies moz-extension:// pages as non-sync URLs', () => {
      expect(isNonSyncUrl('moz-extension://a3f5-6789-bcde/popup/index.html')).toBe(true);
      expect(isNonSyncUrl('moz-extension://some-uuid/settings.html')).toBe(true);
    });

    it('identifies chrome:// and internal schemes as non-sync URLs', () => {
      expect(isNonSyncUrl('chrome://browser/content/browser.xhtml')).toBe(true);
      expect(isNonSyncUrl('resource://gre/modules/Services.jsm')).toBe(true);
      expect(isNonSyncUrl('view-source:about:blank')).toBe(true);
    });

    it('allows normal web URLs to trigger sync', () => {
      expect(isNonSyncUrl('https://github.com/marco/SynapseTab')).toBe(false);
      expect(isNonSyncUrl('http://localhost:8080')).toBe(false);
      expect(isNonSyncUrl('https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons')).toBe(false);
      expect(isNonSyncUrl('http://192.168.1.100:3000')).toBe(false);
    });
  });
});
