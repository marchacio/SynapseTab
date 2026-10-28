import { describe, it, expect, beforeEach } from 'vitest';
import { WorkspaceManager, StoredWorkspace } from '../src/workspaces.js';

describe('WorkspaceManager Unit Tests', () => {
  let localStorageData: Record<string, any>;
  let sessionValues: Map<string, string>;
  let tabs: any[];
  let hiddenTabs: Set<number>;
  let discardedTabs: Set<number>;

  beforeEach(() => {
    localStorageData = {};
    sessionValues = new Map();
    hiddenTabs = new Set();
    discardedTabs = new Set();
    tabs = [];

    (globalThis as any).browser = {
      storage: {
        local: {
          get: async (keys?: string | string[]) => {
            if (!keys) return { ...localStorageData };
            if (typeof keys === 'string') {
              return { [keys]: localStorageData[keys] };
            }
            const result: Record<string, any> = {};
            for (const k of keys) {
              result[k] = localStorageData[k];
            }
            return result;
          },
          set: async (items: Record<string, any>) => {
            Object.assign(localStorageData, items);
          },
        },
      },
      sessions: {
        getTabValue: async (tabId: number, key: string) => sessionValues.get(`${tabId}:${key}`),
        setTabValue: async (tabId: number, key: string, value: string) => {
          sessionValues.set(`${tabId}:${key}`, value);
        },
      },
      windows: {
        getAll: async (getInfo?: any) => [{ id: 1, focused: true, type: 'normal' }],
        get: async (id: number) => ({ id, focused: true, type: 'normal' }),
      },
      tabs: {
        get: async (id: number) => tabs.find((t) => t.id === id),
        query: async (queryInfo: any) => {
          return tabs.filter((t) => {
            if (queryInfo.windowId !== undefined && t.windowId !== queryInfo.windowId) return false;
            if (queryInfo.active !== undefined && t.active !== queryInfo.active) return false;
            if (queryInfo.pinned !== undefined && t.pinned !== queryInfo.pinned) return false;
            return true;
          });
        },
        update: async (tabId: number, updateInfo: any) => {
          const target = tabs.find((t) => t.id === tabId);
          if (target && updateInfo.active) {
            tabs.forEach((t) => {
              if (t.windowId === target.windowId) t.active = false;
            });
            target.active = true;
          }
          if (target && updateInfo.pinned !== undefined) {
            target.pinned = updateInfo.pinned;
          }
          return target;
        },
        hide: async (ids: number | number[]) => {
          const arr = Array.isArray(ids) ? ids : [ids];
          arr.forEach((id) => {
            hiddenTabs.add(id);
            const t = tabs.find((x) => x.id === id);
            if (t) t.hidden = true;
          });
          return arr;
        },
        show: async (ids: number | number[]) => {
          const arr = Array.isArray(ids) ? ids : [ids];
          arr.forEach((id) => {
            hiddenTabs.delete(id);
            const t = tabs.find((x) => x.id === id);
            if (t) t.hidden = false;
          });
          return arr;
        },
        discard: async (tabId: number) => {
          discardedTabs.add(tabId);
          const t = tabs.find((x) => x.id === tabId);
          if (t) t.discarded = true;
          return t;
        },
        create: async (createProps: any) => {
          const newId = 100 + tabs.length + 1;
          const newTab = {
            id: newId,
            windowId: createProps.windowId || 1,
            active: Boolean(createProps.active),
            pinned: Boolean(createProps.pinned),
            hidden: false,
            url: createProps.url || 'about:blank',
          };
          if (newTab.active) {
            tabs.forEach((t) => {
              if (t.windowId === newTab.windowId) t.active = false;
            });
          }
          tabs.push(newTab);
          return newTab;
        },
      },
    };
  });

  describe('Last Active Tab Tracking', () => {
    it('saves and retrieves last active tab info per workspace', async () => {
      expect(await WorkspaceManager.getLastActiveTab('ws-1')).toBeNull();

      await WorkspaceManager.setLastActiveTab('ws-1', 'tab-uuid-5', 'https://example.com/5', 105);

      const lastActive = await WorkspaceManager.getLastActiveTab('ws-1');
      expect(lastActive).toEqual({
        uuid: 'tab-uuid-5',
        url: 'https://example.com/5',
        tabId: 105,
      });

      const map = await WorkspaceManager.getLastActiveTabMap();
      expect(map['ws-1']?.uuid).toBe('tab-uuid-5');
    });

    it('isolates last active tab tracking across multiple workspaces', async () => {
      await WorkspaceManager.setLastActiveTab('ws-1', 'uuid-tab-1', 'https://a.com');
      await WorkspaceManager.setLastActiveTab('ws-2', 'uuid-tab-2', 'https://b.com');

      expect((await WorkspaceManager.getLastActiveTab('ws-1'))?.uuid).toBe('uuid-tab-1');
      expect((await WorkspaceManager.getLastActiveTab('ws-2'))?.uuid).toBe('uuid-tab-2');
    });
  });

  describe('switchToWorkspace Last Visited Tab Restoration', () => {
    it('restores the last visited tab (e.g. 5th page) when switching workspace rather than index 0', async () => {
      const storedWorkspaces: StoredWorkspace[] = [
        { id: 'ws-main', name: 'Main' },
        { id: 'ws-dev', name: 'Dev' },
      ];
      localStorageData.workspaces = storedWorkspaces;
      localStorageData.active_workspace_id = 'ws-main';

      // ws-main has 1 active tab
      tabs.push({ id: 1, windowId: 1, active: true, pinned: false, hidden: false, url: 'https://main.org' });
      sessionValues.set('1:workspace_id', 'ws-main');
      sessionValues.set('1:tab_uuid', 'uuid-main-1');

      // ws-dev has 5 tabs, initially hidden
      for (let i = 1; i <= 5; i++) {
        const id = 10 + i;
        tabs.push({ id, windowId: 1, active: false, pinned: false, hidden: true, url: `https://dev.org/${i}` });
        sessionValues.set(`${id}:workspace_id`, 'ws-dev');
        sessionValues.set(`${id}:tab_uuid`, `uuid-dev-${i}`);
      }

      // Record that the 5th tab was the last active tab in ws-dev
      await WorkspaceManager.setLastActiveTab('ws-dev', 'uuid-dev-5', 'https://dev.org/5', 15);

      // Switch to ws-dev
      await WorkspaceManager.switchToWorkspace('ws-dev', 1);

      // Verify that tab 15 (5th tab) is now active
      const activeTab = tabs.find((t) => t.active);
      expect(activeTab?.id).toBe(15);
      expect(activeTab?.url).toBe('https://dev.org/5');

      // Verify ws-dev tabs are unhidden and ws-main tab is hidden
      expect(hiddenTabs.has(1)).toBe(true);
      expect(hiddenTabs.has(11)).toBe(false);
      expect(hiddenTabs.has(15)).toBe(false);

      // Verify active workspace updated in storage
      expect(await WorkspaceManager.getActiveWorkspaceId()).toBe('ws-dev');
    });

    it('falls back to the first tab if no last active tab was recorded for target workspace', async () => {
      const storedWorkspaces: StoredWorkspace[] = [
        { id: 'ws-main', name: 'Main' },
        { id: 'ws-dev', name: 'Dev' },
      ];
      localStorageData.workspaces = storedWorkspaces;
      localStorageData.active_workspace_id = 'ws-main';

      tabs.push({ id: 1, windowId: 1, active: true, pinned: false, hidden: false });
      sessionValues.set('1:workspace_id', 'ws-main');

      tabs.push({ id: 2, windowId: 1, active: false, pinned: false, hidden: true });
      sessionValues.set('2:workspace_id', 'ws-dev');
      tabs.push({ id: 3, windowId: 1, active: false, pinned: false, hidden: true });
      sessionValues.set('3:workspace_id', 'ws-dev');

      await WorkspaceManager.switchToWorkspace('ws-dev', 1);

      // Tab 2 (first tab of ws-dev) should be activated
      const activeTab = tabs.find((t) => t.active);
      expect(activeTab?.id).toBe(2);
      expect(hiddenTabs.has(1)).toBe(true);
      expect(hiddenTabs.has(2)).toBe(false);
    });

    it('creates a new tab if target workspace is empty', async () => {
      const storedWorkspaces: StoredWorkspace[] = [
        { id: 'ws-main', name: 'Main' },
        { id: 'ws-empty', name: 'Empty' },
      ];
      localStorageData.workspaces = storedWorkspaces;
      localStorageData.active_workspace_id = 'ws-main';

      tabs.push({ id: 1, windowId: 1, active: true, pinned: false, hidden: false });
      sessionValues.set('1:workspace_id', 'ws-main');

      await WorkspaceManager.switchToWorkspace('ws-empty', 1);

      expect(tabs.length).toBe(2);
      const newTab = tabs.find((t) => t.id !== 1);
      expect(newTab).toBeDefined();
      expect(newTab?.active).toBe(true);
      expect(hiddenTabs.has(1)).toBe(true);
      expect(await WorkspaceManager.getActiveWorkspaceId()).toBe('ws-empty');
    });
  });

  describe('initializeExistingTabs on Startup', () => {
    it('activates the last visited tab (e.g. 5th page) and discards non-active tabs in active workspace', async () => {
      localStorageData.workspaces = [{ id: 'ws-main', name: 'Main' }, { id: 'ws-other', name: 'Other' }];
      localStorageData.active_workspace_id = 'ws-main';

      // 5 tabs in ws-main (first tab initially active from browser restart)
      for (let i = 1; i <= 5; i++) {
        const id = i;
        tabs.push({
          id,
          windowId: 1,
          active: i === 1,
          pinned: false,
          hidden: false,
          url: `https://example.com/page/${i}`,
        });
        sessionValues.set(`${id}:workspace_id`, 'ws-main');
        sessionValues.set(`${id}:tab_uuid`, `uuid-${i}`);
      }

      // 1 tab in inactive workspace
      tabs.push({
        id: 99,
        windowId: 1,
        active: false,
        pinned: false,
        hidden: false,
        url: 'https://other.com',
      });
      sessionValues.set('99:workspace_id', 'ws-other');
      sessionValues.set('99:tab_uuid', 'uuid-other');

      // 5th page was last active before Firefox closed
      await WorkspaceManager.setLastActiveTab('ws-main', 'uuid-5', 'https://example.com/page/5', 5);

      // Cold startup / session restore
      await WorkspaceManager.initializeExistingTabs();

      // Tab 5 must be the active tab!
      const activeTab = tabs.find((t) => t.active);
      expect(activeTab?.id).toBe(5);

      // Inactive workspace tab 99 must be hidden
      expect(hiddenTabs.has(99)).toBe(true);

      // Tabs 1, 2, 3, 4 must be discarded (suspended in RAM)
      expect(discardedTabs.has(1)).toBe(true);
      expect(discardedTabs.has(2)).toBe(true);
      expect(discardedTabs.has(3)).toBe(true);
      expect(discardedTabs.has(4)).toBe(true);

      // Tab 5 must NOT be discarded
      expect(discardedTabs.has(5)).toBe(false);
    });
  });
});

