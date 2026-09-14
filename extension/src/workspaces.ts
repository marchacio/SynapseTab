import { SyncPayload, Workspace, TabItem, ReconcilePlan } from './types.js';

// Default initial workspace
export const DEFAULT_WORKSPACE_ID = 'default';
export const DEFAULT_WORKSPACE_NAME = 'Main';

/**
 * Workspace and Tab Visibility Manager using Firefox native APIs.
 */
export class WorkspaceManager {
  /**
   * Retrieves or assigns an immutable UUID for a browser tab using the Sessions API.
   */
  static async getOrAssignTabUuid(tabId: number): Promise<string> {
    try {
      const existingUuid = await browser.sessions.getTabValue(tabId, 'tab_uuid');
      if (typeof existingUuid === 'string' && existingUuid.length > 0) {
        return existingUuid;
      }
    } catch {
      // Tab may have closed or session value not found
    }

    const newUuid = crypto.randomUUID();
    try {
      await browser.sessions.setTabValue(tabId, 'tab_uuid', newUuid);
    } catch (err) {
      console.warn(`[WorkspaceManager] Failed to set tab_uuid for tab ${tabId}:`, err);
    }
    return newUuid;
  }

  /**
   * Gets the workspace ID associated with a tab.
   */
  static async getTabWorkspaceId(tabId: number, fallbackWorkspaceId: string): Promise<string> {
    try {
      const wsId = await browser.sessions.getTabValue(tabId, 'workspace_id');
      if (typeof wsId === 'string' && wsId.length > 0) {
        return wsId;
      }
    } catch {
      // Ignored
    }
    return fallbackWorkspaceId;
  }

  /**
   * Associates a tab with a workspace ID.
   */
  static async setTabWorkspaceId(tabId: number, workspaceId: string): Promise<void> {
    try {
      await browser.sessions.setTabValue(tabId, 'workspace_id', workspaceId);
    } catch (err) {
      console.warn(`[WorkspaceManager] Failed to set workspace_id for tab ${tabId}:`, err);
    }
  }

  /**
   * Retrieves the current stored workspaces metadata from extension storage.
   */
  static async getStoredWorkspaces(): Promise<{ id: string; name: string }[]> {
    const data = await browser.storage.local.get(['workspaces', 'active_workspace_id']);
    if (Array.isArray(data.workspaces) && data.workspaces.length > 0) {
      return data.workspaces;
    }
    return [{ id: DEFAULT_WORKSPACE_ID, name: DEFAULT_WORKSPACE_NAME }];
  }

  /**
   * Saves workspaces metadata to extension storage.
   */
  static async saveStoredWorkspaces(workspaces: { id: string; name: string }[]): Promise<void> {
    await browser.storage.local.set({ workspaces });
  }

  /**
   * Gets the currently active workspace ID from storage.
   */
  static async getActiveWorkspaceId(): Promise<string> {
    const data = await browser.storage.local.get('active_workspace_id');
    return typeof data.active_workspace_id === 'string' ? data.active_workspace_id : DEFAULT_WORKSPACE_ID;
  }

  /**
   * Sets the active workspace ID in storage.
   */
  static async setActiveWorkspaceId(workspaceId: string): Promise<void> {
    await browser.storage.local.set({ active_workspace_id: workspaceId });
  }

  /**
   * Captures the full local state across all workspaces and tabs in the current window.
   */
  static async captureLocalState(clientId: string): Promise<SyncPayload> {
    const storedWorkspaces = await this.getStoredWorkspaces();
    const activeWorkspaceId = await this.getActiveWorkspaceId();

    const tabs = await browser.tabs.query({ currentWindow: true });

    const workspaceTabsMap = new Map<string, TabItem[]>();
    for (const ws of storedWorkspaces) {
      workspaceTabsMap.set(ws.id, []);
    }

    for (const tab of tabs) {
      if (tab.id === undefined) continue;

      const uuid = await this.getOrAssignTabUuid(tab.id);
      const wsId = await this.getTabWorkspaceId(tab.id, activeWorkspaceId);

      // Ensure workspace exists in map
      if (!workspaceTabsMap.has(wsId)) {
        workspaceTabsMap.set(wsId, []);
      }

      const tabItem: TabItem = {
        uuid,
        url: tab.url || 'about:blank',
        title: tab.title || 'New Tab',
        favIconUrl: tab.favIconUrl,
        pinned: Boolean(tab.pinned),
        index: tab.index,
        localTabId: tab.id,
      };

      workspaceTabsMap.get(wsId)!.push(tabItem);
    }

    const workspaces: Workspace[] = [];
    for (const [wsId, wsTabs] of workspaceTabsMap.entries()) {
      const stored = storedWorkspaces.find((w) => w.id === wsId);
      workspaces.push({
        id: wsId,
        name: stored ? stored.name : wsId,
        tabs: wsTabs,
      });
    }

    return {
      client_id: clientId,
      updated_at: Math.floor(Date.now() / 1000),
      active_workspace_id: activeWorkspaceId,
      workspaces,
    };
  }

  /**
   * Switches the active workspace, smoothly toggling tab visibility.
   */
  static async switchToWorkspace(targetWorkspaceId: string): Promise<void> {
    const tabs = await browser.tabs.query({ currentWindow: true });
    const currentActiveWsId = await this.getActiveWorkspaceId();

    if (currentActiveWsId === targetWorkspaceId) {
      return;
    }

    const targetTabIds: number[] = [];
    const hideTabIds: number[] = [];

    for (const tab of tabs) {
      if (tab.id === undefined) continue;
      const wsId = await this.getTabWorkspaceId(tab.id, currentActiveWsId);

      if (wsId === targetWorkspaceId) {
        targetTabIds.push(tab.id);
      } else {
        hideTabIds.push(tab.id);
      }
    }

    // 1. If target workspace has tabs, show them and activate the first one
    if (targetTabIds.length > 0) {
      try {
        await browser.tabs.show(targetTabIds);
      } catch (err) {
        console.warn('[WorkspaceManager] Failed to show target tabs:', err);
      }
      await browser.tabs.update(targetTabIds[0], { active: true });
    } else {
      // If target workspace has no tabs, create one before hiding other tabs
      const newTab = await browser.tabs.create({
        active: true,
        url: 'about:blank',
      });
      if (newTab.id !== undefined) {
        await this.getOrAssignTabUuid(newTab.id);
        await this.setTabWorkspaceId(newTab.id, targetWorkspaceId);
      }
    }

    // 2. Hide tabs from other workspaces (excluding pinned tabs if any, as Firefox does not hide pinned tabs)
    const canHideIds = tabs
      .filter((t) => t.id !== undefined && hideTabIds.includes(t.id) && !t.pinned && !t.active)
      .map((t) => t.id as number);

    if (canHideIds.length > 0) {
      try {
        await browser.tabs.hide(canHideIds);
      } catch (err) {
        console.warn('[WorkspaceManager] Failed to hide inactive tabs:', err);
      }
    }

    await this.setActiveWorkspaceId(targetWorkspaceId);
  }

  /**
   * Applies the pure reconciliation plan against the Firefox browser environment.
   */
  static async applyExecutionPlan(plan: ReconcilePlan): Promise<void> {
    const activeWsId = await this.getActiveWorkspaceId();

    // 1. Handle workspace creations/deletions in storage
    const storedWorkspaces = await this.getStoredWorkspaces();
    let updatedWorkspaces = [...storedWorkspaces];

    for (const ws of plan.workspacesToCreate) {
      if (!updatedWorkspaces.some((w) => w.id === ws.id)) {
        updatedWorkspaces.push({ id: ws.id, name: ws.name });
      }
    }

    for (const ws of plan.workspacesToRemove) {
      updatedWorkspaces = updatedWorkspaces.filter((w) => w.id !== ws.id);
    }

    await this.saveStoredWorkspaces(updatedWorkspaces);

    // 2. Close tabs planned for removal
    for (const closeAction of plan.tabsToClose) {
      let targetTabId = closeAction.localTabId;
      if (!targetTabId) {
        // Find tab by uuid
        targetTabId = await this.findTabIdByUuid(closeAction.uuid);
      }

      if (targetTabId) {
        try {
          await browser.tabs.remove(targetTabId);
        } catch (err) {
          console.warn(`[WorkspaceManager] Error closing tab ${targetTabId}:`, err);
        }
      }
    }

    // 3. Create new remote tabs with LAZY MATERIALIZATION (discarded: true)
    for (const createAction of plan.tabsToCreate) {
      const { tab, workspaceId } = createAction;

      try {
        // Spec requirement: Newly created tabs MUST be created with discarded: true and active: false
        const newTab = await browser.tabs.create({
          url: tab.url,
          discarded: true,
          active: false,
          pinned: tab.pinned,
          index: tab.index,
        });

        if (newTab.id !== undefined) {
          await browser.sessions.setTabValue(newTab.id, 'tab_uuid', tab.uuid);
          await this.setTabWorkspaceId(newTab.id, workspaceId);

          // If created in an inactive workspace, hide it
          if (workspaceId !== activeWsId && !tab.pinned) {
            try {
              await browser.tabs.hide(newTab.id);
            } catch {
              // Ignore if already hidden or not supported
            }
          }
        }
      } catch (err) {
        console.error('[WorkspaceManager] Error lazy-creating tab:', err);
      }
    }

    // 4. Update existing tabs
    for (const updateAction of plan.tabsToUpdate) {
      let tabId = updateAction.localTabId;
      if (!tabId) {
        tabId = await this.findTabIdByUuid(updateAction.uuid);
      }
      if (!tabId) continue;

      const updateProperties: browser.tabs._UpdateUpdateProperties = {};
      if (updateAction.url) updateProperties.url = updateAction.url;
      if (updateAction.pinned !== undefined) updateProperties.pinned = updateAction.pinned;

      if (Object.keys(updateProperties).length > 0) {
        try {
          await browser.tabs.update(tabId, updateProperties);
        } catch (err) {
          console.warn(`[WorkspaceManager] Error updating tab ${tabId}:`, err);
        }
      }

      if (updateAction.workspaceId) {
        await this.setTabWorkspaceId(tabId, updateAction.workspaceId);
        if (updateAction.workspaceId !== activeWsId) {
          try {
            await browser.tabs.hide(tabId);
          } catch {}
        } else {
          try {
            await browser.tabs.show(tabId);
          } catch {}
        }
      }
    }

    // 5. Move tabs if needed
    for (const moveAction of plan.tabsToMove) {
      let tabId = moveAction.localTabId;
      if (!tabId) {
        tabId = await this.findTabIdByUuid(moveAction.uuid);
      }
      if (!tabId) continue;

      try {
        await browser.tabs.move(tabId, { index: moveAction.targetIndex });
      } catch (err) {
        console.warn(`[WorkspaceManager] Error moving tab ${tabId}:`, err);
      }
    }

    // 6. Switch active workspace if remote specified a different one and it exists
    if (plan.activeWorkspaceId && plan.activeWorkspaceId !== activeWsId) {
      await this.switchToWorkspace(plan.activeWorkspaceId);
    }
  }

  /**
   * Helper to find tabId by UUID.
   */
  private static async findTabIdByUuid(uuid: string): Promise<number | undefined> {
    const tabs = await browser.tabs.query({ currentWindow: true });
    for (const tab of tabs) {
      if (tab.id === undefined) continue;
      try {
        const val = await browser.sessions.getTabValue(tab.id, 'tab_uuid');
        if (val === uuid) {
          return tab.id;
        }
      } catch {}
    }
    return undefined;
  }
}
