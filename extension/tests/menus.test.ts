import { describe, it, expect } from 'vitest';
import {
  getColorBullet,
  formatWorkspaceMenuTitle,
  isTabMovableToWorkspace,
  ROOT_MENU_ID,
  WORKSPACE_MENU_PREFIX,
} from '../src/menus.js';
import { StoredWorkspace } from '../src/workspaces.js';

describe('Menus Module Unit Tests', () => {
  describe('Constants', () => {
    it('defines expected root and prefix IDs', () => {
      expect(ROOT_MENU_ID).toBe('synapse-tab-move-root');
      expect(WORKSPACE_MENU_PREFIX).toBe('synapse-move-to-');
    });
  });

  describe('getColorBullet', () => {
    it('maps hex color codes to correct circle emojis', () => {
      expect(getColorBullet('#000000')).toBe('⚫');
      expect(getColorBullet('#0000ff')).toBe('🔵');
      expect(getColorBullet('#d0bcff')).toBe('🟣');
      expect(getColorBullet('#a8c7fa')).toBe('🔵');
      expect(getColorBullet('#7cd1ff')).toBe('🔵');
      expect(getColorBullet('#7bd88f')).toBe('🟢');
      expect(getColorBullet('#ffba28')).toBe('🟡');
      expect(getColorBullet('#ffb4ab')).toBe('🔴');
      expect(getColorBullet('#efb8c8')).toBe('🌸');
      expect(getColorBullet('#bec6dc')).toBe('⚪');
    });

    it('maps HSL / HSLA colors correctly', () => {
      expect(getColorBullet('hsla(50, 100%, 50%, 1)')).toBe('🟡');
      expect(getColorBullet('hsla(350, 100%, 50%, 1)')).toBe('🔴');
      expect(getColorBullet('hsla(0, 100%, 50%, 1)')).toBe('🔴');
      expect(getColorBullet('hsla(240, 100%, 50%, 1)')).toBe('🔵');
      expect(getColorBullet('hsla(300, 100%, 50%, 1)')).toBe('🟣');
      expect(getColorBullet('hsla(210, 100%, 50%, 1)')).toBe('🔵');
      expect(getColorBullet('hsla(170, 100%, 50%, 1)')).toBe('🟢');
      expect(getColorBullet('hsla(270, 100%, 50%, 1)')).toBe('🟣');
      expect(getColorBullet('hsla(30, 100%, 50%, 1)')).toBe('🟠');
      expect(getColorBullet('hsla(360, 100%, 50%, 1)')).toBe('🔴');
    });

    it('handles named colors and fallbacks', () => {
      expect(getColorBullet('black')).toBe('⚫');
      expect(getColorBullet('purple')).toBe('🟣');
      expect(getColorBullet('blue')).toBe('🔵');
      expect(getColorBullet('green')).toBe('🟢');
      expect(getColorBullet('yellow')).toBe('🟡');
      expect(getColorBullet('red')).toBe('🔴');
      expect(getColorBullet('pink')).toBe('🌸');
      expect(getColorBullet('gray')).toBe('⚪');
      expect(getColorBullet(undefined)).toBe('📁');
    });
  });

  describe('formatWorkspaceMenuTitle', () => {
    it('formats emoji workspace correctly', () => {
      const ws: StoredWorkspace = {
        id: 'ws-1',
        name: 'Spots',
        customType: 'emoji',
        customValue: '🔵',
      };
      expect(formatWorkspaceMenuTitle(ws)).toBe('🔵 Spots');
    });

    it('formats text tag workspace correctly', () => {
      const ws: StoredWorkspace = {
        id: 'ws-2',
        name: 'Medium Stories',
        customType: 'text',
        customValue: 'ME',
      };
      expect(formatWorkspaceMenuTitle(ws)).toBe('[ME] Medium Stories');
    });

    it('auto-generates text tag if customValue is missing', () => {
      const ws: StoredWorkspace = {
        id: 'ws-3',
        name: 'Development',
        customType: 'text',
      };
      expect(formatWorkspaceMenuTitle(ws)).toBe('[DEV] Development');
    });

    it('formats color workspace with matching bullet', () => {
      const ws: StoredWorkspace = {
        id: 'ws-4',
        name: 'Work',
        customType: 'color',
        color: '#7bd88f',
      };
      expect(formatWorkspaceMenuTitle(ws)).toBe('🟢 Work');
    });

    it('formats default workspace with folder icon', () => {
      const ws: StoredWorkspace = {
        id: 'default',
        name: 'Main',
        customType: 'default',
      };
      expect(formatWorkspaceMenuTitle(ws)).toBe('📁 Main');
    });

    it('formats default workspace with custom icon if present', () => {
      const ws: StoredWorkspace = {
        id: 'ws-5',
        name: 'Nav',
        icon: '📌',
      };
      expect(formatWorkspaceMenuTitle(ws)).toBe('📌 Nav');
    });

    it('formats workspace with both color and icon', () => {
      const ws: StoredWorkspace = {
        id: 'ws-nav',
        name: 'Nav',
        customType: 'color',
        color: '#000000',
        icon: '📌',
      };
      expect(formatWorkspaceMenuTitle(ws)).toBe('⚫ 📌 Nav');
    });

    it('appends (current) when isCurrent is true', () => {
      const ws: StoredWorkspace = {
        id: 'default',
        name: 'Main',
        customType: 'default',
      };
      expect(formatWorkspaceMenuTitle(ws, true)).toBe('📁 Main (current)');
    });
  });

  describe('isTabMovableToWorkspace', () => {
    it('returns false for pinned tabs', () => {
      expect(isTabMovableToWorkspace({ pinned: true })).toBe(false);
    });

    it('returns true for normal unpinned tabs', () => {
      expect(isTabMovableToWorkspace({ pinned: false })).toBe(true);
      expect(isTabMovableToWorkspace({})).toBe(true);
    });

    it('returns false for null or undefined tab', () => {
      expect(isTabMovableToWorkspace(null)).toBe(false);
      expect(isTabMovableToWorkspace(undefined)).toBe(false);
    });
  });

  describe('Context Menu Click & Tab Moving', () => {
    it('successfully moves tab to target workspace when menu item is clicked', async () => {
      const storedWorkspaces: StoredWorkspace[] = [
        { id: 'ws-main', name: 'Main' },
        { id: 'ws-dev', name: 'Dev' },
      ];

      const tabs: any[] = [
        { id: 101, windowId: 1, active: true, pinned: false, hidden: false },
        { id: 102, windowId: 1, active: false, pinned: false, hidden: false },
      ];

      const sessionValues = new Map<string, string>();
      const hiddenTabs = new Set<number>();
      const createdMenuItems: any[] = [];
      let onClickedListener: any = null;

      (globalThis as any).browser = {
        storage: {
          local: {
            get: async () => ({ workspaces: storedWorkspaces, active_workspace_id: 'ws-main' }),
            set: async () => {},
          },
          onChanged: { addListener: () => {} },
        },
        sessions: {
          getTabValue: async (tabId: number, key: string) => sessionValues.get(`${tabId}:${key}`),
          setTabValue: async (tabId: number, key: string, value: string) => {
            sessionValues.set(`${tabId}:${key}`, value);
          },
        },
        tabs: {
          get: async (id: number) => tabs.find((t) => t.id === id),
          query: async (queryInfo: any) => {
            return tabs.filter((t) => {
              if (queryInfo.windowId !== undefined && t.windowId !== queryInfo.windowId) return false;
              if (queryInfo.active !== undefined && t.active !== queryInfo.active) return false;
              if (queryInfo.highlighted !== undefined && t.highlighted !== queryInfo.highlighted) return false;
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
            return target;
          },
          hide: async (ids: number | number[]) => {
            const arr = Array.isArray(ids) ? ids : [ids];
            arr.forEach((id) => hiddenTabs.add(id));
            return arr;
          },
          show: async (ids: number | number[]) => {
            const arr = Array.isArray(ids) ? ids : [ids];
            arr.forEach((id) => hiddenTabs.delete(id));
            return arr;
          },
          create: async (createProps: any) => {
            const newTab = { id: 999, windowId: createProps.windowId || 1, active: true, pinned: false, hidden: false };
            tabs.push(newTab);
            return newTab;
          },
        },
        menus: {
          removeAll: async () => {
            createdMenuItems.length = 0;
          },
          create: (item: any) => {
            createdMenuItems.push(item);
          },
          update: async () => {},
          refresh: () => {},
          onClicked: {
            addListener: (fn: any) => {
              onClickedListener = fn;
            },
          },
          onShown: { addListener: () => {} },
          onHidden: { addListener: () => {} },
        },
      };

      const { initContextMenus, setupContextMenus } = await import('../src/menus.js');
      await setupContextMenus();

      // Check that menu items were created with correct IDs
      expect(createdMenuItems.some((m) => m.id === 'synapse-tab-move-root')).toBe(true);
      expect(createdMenuItems.some((m) => m.id === 'synapse-move-to-ws-dev')).toBe(true);
      const mainItem = createdMenuItems.find((m) => m.id === 'synapse-move-to-ws-main');
      expect(mainItem?.title).toContain('(current)');

      let movedCalled = false;
      initContextMenus(() => {
        movedCalled = true;
      });

      // Simulate clicking on the 'Dev' workspace for tab 101
      await onClickedListener(
        { menuItemId: 'synapse-move-to-ws-dev' },
        { id: 101, windowId: 1, active: true, pinned: false }
      );

      // Tab 101 was active, so tab 102 should have been activated and tab 101 hidden
      expect(sessionValues.get('101:workspace_id')).toBe('ws-dev');
      expect(hiddenTabs.has(101)).toBe(true);
      expect(tabs.find((t) => t.id === 102)?.active).toBe(true);
      expect(movedCalled).toBe(true);
    });

    it('does not move pinned tabs', async () => {
      const sessionValues = new Map<string, string>();
      let onClickedListener: any = null;

      (globalThis as any).browser = {
        storage: {
          local: {
            get: async () => ({ workspaces: [{ id: 'ws-dev', name: 'Dev' }], active_workspace_id: 'ws-main' }),
            set: async () => {},
          },
          onChanged: { addListener: () => {} },
        },
        sessions: {
          setTabValue: async (tabId: number, key: string, value: string) => {
            sessionValues.set(`${tabId}:${key}`, value);
          },
        },
        menus: {
          removeAll: async () => {},
          create: () => {},
          onClicked: {
            addListener: (fn: any) => {
              onClickedListener = fn;
            },
          },
          onShown: { addListener: () => {} },
          onHidden: { addListener: () => {} },
        },
      };

      const { initContextMenus } = await import('../src/menus.js');
      let movedCalled = false;
      initContextMenus(() => {
        movedCalled = true;
      });

      await onClickedListener(
        { menuItemId: 'synapse-move-to-ws-dev' },
        { id: 105, windowId: 1, pinned: true }
      );

      expect(sessionValues.has('105:workspace_id')).toBe(false);
      expect(movedCalled).toBe(false);
    });

    it('disables root menu for pinned tabs in onShown without hiding it', async () => {
      const updatedMenus: any[] = [];
      let onShownListener: any = null;

      (globalThis as any).browser = {
        storage: {
          local: {
            get: async () => ({ workspaces: [{ id: 'ws-dev', name: 'Dev' }], active_workspace_id: 'ws-dev' }),
            set: async () => {},
          },
          onChanged: { addListener: () => {} },
        },
        sessions: {
          getTabValue: async () => 'ws-main',
        },
        tabs: {
          query: async () => [],
        },
        menus: {
          removeAll: async () => {},
          create: () => {},
          update: async (id: string, props: any) => {
            updatedMenus.push({ id, ...props });
          },
          refresh: () => {},
          onClicked: { addListener: () => {} },
          onShown: {
            addListener: (fn: any) => {
              onShownListener = fn;
            },
          },
          onHidden: { addListener: () => {} },
        },
      };

      const { initContextMenus } = await import('../src/menus.js');
      initContextMenus();

      // Trigger onShown for a pinned tab
      await onShownListener({ contexts: ['tab'] }, { id: 201, pinned: true });
      expect(updatedMenus.length).toBeGreaterThan(0);
      const lastUpdate = updatedMenus[updatedMenus.length - 1];
      expect(lastUpdate.id).toBe('synapse-tab-move-root');
      expect(lastUpdate.visible).toBe(true);
      expect(lastUpdate.enabled).toBe(false);
      expect(lastUpdate.title).toBe('Cannot move pinned tab');

      // Trigger onShown for an unpinned tab
      updatedMenus.length = 0;
      await onShownListener({ contexts: ['tab'] }, { id: 202, pinned: false });
      const rootUpdate = updatedMenus.find((u) => u.id === 'synapse-tab-move-root');
      expect(rootUpdate).toBeDefined();
      expect(rootUpdate.visible).toBe(true);
      expect(rootUpdate.enabled).toBe(true);
    });
  });
});



