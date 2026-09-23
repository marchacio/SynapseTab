import { SyncPayload, Workspace, TabItem, ReconcilePlan, WorkspaceCustomType } from './types.js';

// Default initial workspace
export const DEFAULT_WORKSPACE_ID = 'default';
export const DEFAULT_WORKSPACE_NAME = 'Main';

export interface StoredWorkspace {
  id: string;
  name: string;
  customType?: WorkspaceCustomType;
  customValue?: string;
  color?: string;
  icon?: string;
}

/**
 * Checks whether a URL is a safe, standard web URL that can be passed to browser.tabs.create.
 */
export function isSafeWebUrl(url?: string): boolean {
  if (!url) return false;
  return (
    url.startsWith('http://') ||
    url.startsWith('https://') ||
    url.startsWith('about:') ||
    url.startsWith('moz-extension://')
  );
}

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
   * Auto-persists the fallback workspace ID when not explicitly set to prevent tab floating.
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

    // Auto-persist fallback to bind the tab permanently to this workspace
    await this.setTabWorkspaceId(tabId, fallbackWorkspaceId);
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
   * Initializes all existing tabs on extension startup, assigning UUIDs, workspace IDs,
   * and ensuring inactive workspace tabs are properly hidden.
   */
  static async initializeExistingTabs(): Promise<void> {
    const activeWsId = await this.getActiveWorkspaceId();
    const tabs = await browser.tabs.query({});
    for (const tab of tabs) {
      if (tab.id !== undefined) {
        await this.getOrAssignTabUuid(tab.id);
        const wsId = await this.getTabWorkspaceId(tab.id, activeWsId);
        await this.setTabWorkspaceId(tab.id, wsId);

        // Hide tabs that belong to inactive workspaces (pinned tabs stay visible)
        if (wsId !== activeWsId && !tab.pinned) {
          try {
            await browser.tabs.hide(tab.id);
          } catch {
            // Ignored
          }
        }
      }
    }
  }

  /**
   * Retrieves the current stored workspaces metadata from extension storage.
   */
  static async getStoredWorkspaces(): Promise<StoredWorkspace[]> {
    const data = await browser.storage.local.get(['workspaces', 'active_workspace_id']);
    if (Array.isArray(data.workspaces) && data.workspaces.length > 0) {
      return data.workspaces;
    }
    return [{ id: DEFAULT_WORKSPACE_ID, name: DEFAULT_WORKSPACE_NAME }];
  }

  /**
   * Saves workspaces metadata to extension storage.
   */
  static async saveStoredWorkspaces(workspaces: StoredWorkspace[]): Promise<void> {
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
        customType: stored?.customType,
        customValue: stored?.customValue,
        color: stored?.color,
        icon: stored?.icon,
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
    const currentActiveWsId = await this.getActiveWorkspaceId();

    if (currentActiveWsId === targetWorkspaceId) {
      return;
    }

    // Update active workspace ID in storage
    await this.setActiveWorkspaceId(targetWorkspaceId);

    const tabs = await browser.tabs.query({ currentWindow: true });
    const targetTabIds: number[] = [];
    const hideTabIds: number[] = [];

    for (const tab of tabs) {
      if (tab.id === undefined) continue;
      const wsId = await this.getTabWorkspaceId(tab.id, currentActiveWsId);

      if (wsId === targetWorkspaceId) {
        targetTabIds.push(tab.id);
      } else {
        if (!tab.pinned) {
          hideTabIds.push(tab.id);
        }
      }
    }

    // 1. If target workspace has tabs, show them and activate the first one
    if (targetTabIds.length > 0) {
      try {
        await browser.tabs.show(targetTabIds);
      } catch (err) {
        console.warn('[WorkspaceManager] Failed to show target tabs:', err);
      }
      try {
        await browser.tabs.update(targetTabIds[0], { active: true });
      } catch (err) {
        console.warn('[WorkspaceManager] Failed to activate target tab:', err);
      }
    } else {
      // If target workspace has no tabs, create one before hiding other tabs
      try {
        const newTab = await browser.tabs.create({
          active: true,
          url: 'about:blank',
        });
        if (newTab.id !== undefined) {
          await this.getOrAssignTabUuid(newTab.id);
          await this.setTabWorkspaceId(newTab.id, targetWorkspaceId);
          targetTabIds.push(newTab.id);
        }
      } catch (err) {
        console.error('[WorkspaceManager] Failed to create tab for target workspace:', err);
      }
    }

    // 2. Query fresh tab list in window to verify active state and safely hide inactive tabs
    const freshTabs = await browser.tabs.query({ currentWindow: true });
    const canHideIds = freshTabs
      .filter((t) => t.id !== undefined && hideTabIds.includes(t.id) && !t.pinned && !t.active)
      .map((t) => t.id as number);

    if (canHideIds.length > 0) {
      try {
        await browser.tabs.hide(canHideIds);
      } catch (err) {
        console.warn('[WorkspaceManager] Failed to hide inactive tabs:', err);
      }
    }
  }

  /**
   * Applies the pure reconciliation plan against the Firefox browser environment.
   */
  static async applyExecutionPlan(plan: ReconcilePlan): Promise<void> {
    const activeWsId = await this.getActiveWorkspaceId();
    const targetActiveWs = plan.activeWorkspaceId || activeWsId;

    // 1. Handle workspace creations/deletions in storage
    const storedWorkspaces = await this.getStoredWorkspaces();
    let updatedWorkspaces = [...storedWorkspaces];

    for (const ws of plan.workspacesToCreate) {
      if (!updatedWorkspaces.some((w) => w.id === ws.id)) {
        updatedWorkspaces.push({
          id: ws.id,
          name: ws.name,
          customType: ws.customType,
          customValue: ws.customValue,
          color: ws.color,
          icon: ws.icon,
        });
      }
    }

    if (plan.workspacesToUpdate && plan.workspacesToUpdate.length > 0) {
      for (const ws of plan.workspacesToUpdate) {
        const targetIndex = updatedWorkspaces.findIndex((w) => w.id === ws.id);
        if (targetIndex !== -1) {
          updatedWorkspaces[targetIndex] = {
            id: ws.id,
            name: ws.name !== undefined ? ws.name : updatedWorkspaces[targetIndex].name,
            customType: ws.customType,
            customValue: ws.customValue,
            color: ws.color,
            icon: ws.icon,
          };
        }
      }
    }

    for (const ws of plan.workspacesToRemove) {
      updatedWorkspaces = updatedWorkspaces.filter((w) => w.id !== ws.id);
    }

    await this.saveStoredWorkspaces(updatedWorkspaces);

    // 2. Create new remote tabs with LAZY MATERIALIZATION (discarded: true) FIRST
    // Creating tabs before closing ensures the browser window never closes due to 0 tabs.
    for (const createAction of plan.tabsToCreate) {
      const { tab, workspaceId } = createAction;

      try {
        const isSafe = isSafeWebUrl(tab.url);
        const isHttp = Boolean(tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://')));
        const canDiscard = isHttp;
        let newTab: browser.tabs.Tab;

        const createProps: browser.tabs._CreateCreateProperties = {
          active: false,
          pinned: tab.pinned,
        };
        if (isSafe && tab.url && tab.url !== 'about:newtab') {
          createProps.url = tab.url;
        }

        try {
          newTab = await browser.tabs.create(createProps);
        } catch {
          // Fallback without restricted URL
          newTab = await browser.tabs.create({
            active: false,
            pinned: tab.pinned,
            url: isSafe ? tab.url : undefined,
          });
        }

        if (newTab.id !== undefined) {
          if (canDiscard) {
            try {
              await browser.tabs.discard(newTab.id);
            } catch {}
          }
          await browser.sessions.setTabValue(newTab.id, 'tab_uuid', tab.uuid);
          await this.setTabWorkspaceId(newTab.id, workspaceId);

          // If created in an inactive workspace, hide it
          if (workspaceId !== targetActiveWs && !tab.pinned) {
            try {
              await browser.tabs.hide(newTab.id);
            } catch {
              // Ignore if already hidden or not supported
            }
          }
        }
      } catch (err) {
        console.error('[WorkspaceManager] Error creating tab:', err);
      }
    }

    // 3. Update existing tabs
    for (const updateAction of plan.tabsToUpdate) {
      let tabId = updateAction.localTabId;
      if (!tabId) {
        tabId = await this.findTabIdByUuid(updateAction.uuid);
      }
      if (!tabId) continue;

      const updateProperties: browser.tabs._UpdateUpdateProperties = {};
      if (updateAction.url && isSafeWebUrl(updateAction.url)) {
        updateProperties.url = updateAction.url;
      }
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
        if (updateAction.workspaceId !== targetActiveWs && !updateAction.pinned) {
          try {
            const currentTab = await browser.tabs.get(tabId);
            if (currentTab.active) {
              const allTabs = await browser.tabs.query({ currentWindow: true });
              const otherTab = allTabs.find((t) => t.id !== tabId && !t.hidden);
              if (otherTab && otherTab.id) {
                await browser.tabs.update(otherTab.id, { active: true });
              }
            }
            await browser.tabs.hide(tabId);
          } catch {}
        } else {
          try {
            await browser.tabs.show(tabId);
          } catch {}
        }
      }
    }

    // 4. Move tabs if needed
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

    // 5. Close tabs planned for removal with zero-tab window prevention safeguard
    const currentTabsBeforeClose = await browser.tabs.query({ currentWindow: true });
    const tabIdsToClose: number[] = [];

    for (const closeAction of plan.tabsToClose) {
      let targetTabId = closeAction.localTabId;
      if (!targetTabId) {
        targetTabId = await this.findTabIdByUuid(closeAction.uuid);
      }
      if (targetTabId && currentTabsBeforeClose.some((t) => t.id === targetTabId)) {
        tabIdsToClose.push(targetTabId);
      }
    }

    const remainingTabsCount = currentTabsBeforeClose.length - tabIdsToClose.length;
    // If closing these tabs would leave 0 tabs in window, create a fallback tab first
    if (remainingTabsCount <= 0) {
      try {
        const fallbackTab = await browser.tabs.create({ active: true, url: 'about:blank' });
        if (fallbackTab.id !== undefined) {
          await this.getOrAssignTabUuid(fallbackTab.id);
          await this.setTabWorkspaceId(fallbackTab.id, targetActiveWs);
        }
      } catch (err) {
        console.error('[WorkspaceManager] Failed to create fallback tab before closing:', err);
      }
    }

    for (const tabId of tabIdsToClose) {
      try {
        await browser.tabs.remove(tabId);
      } catch (err) {
        console.warn(`[WorkspaceManager] Error closing tab ${tabId}:`, err);
      }
    }

    // 6. Switch active workspace if remote specified a different one and it exists
    if (plan.activeWorkspaceId && plan.activeWorkspaceId !== activeWsId) {
      await this.switchToWorkspace(plan.activeWorkspaceId);
    } else {
      // Ensure active workspace has an active visible tab
      const currentWindowTabs = await browser.tabs.query({ currentWindow: true });
      const activeWsTabs = [];
      for (const t of currentWindowTabs) {
        if (t.id === undefined) continue;
        const wsId = await this.getTabWorkspaceId(t.id, targetActiveWs);
        if (wsId === targetActiveWs && !t.hidden) {
          activeWsTabs.push(t);
        }
      }
      if (activeWsTabs.length > 0 && !activeWsTabs.some((t) => t.active)) {
        try {
          await browser.tabs.update(activeWsTabs[0].id!, { active: true });
        } catch {}
      }
    }
  }

  /**
   * Toggles the pinned status of a tab.
   */
  static async togglePinTab(tabId: number): Promise<boolean> {
    const tab = await browser.tabs.get(tabId);
    const newPinned = !tab.pinned;
    await browser.tabs.update(tabId, { pinned: newPinned });
    return newPinned;
  }

  /**
   * Retrieves all currently pinned tabs in the active window.
   */
  static async getPinnedTabs(): Promise<TabItem[]> {
    const tabs = await browser.tabs.query({ currentWindow: true, pinned: true });
    const pinnedItems: TabItem[] = [];

    for (const tab of tabs) {
      if (tab.id === undefined) continue;
      const uuid = await this.getOrAssignTabUuid(tab.id);
      pinnedItems.push({
        uuid,
        url: tab.url || 'about:blank',
        title: tab.title || 'Pinned Tab',
        favIconUrl: tab.favIconUrl,
        pinned: true,
        index: tab.index,
        localTabId: tab.id,
      });
    }

    return pinnedItems;
  }

  /**
   * Imports workspaces and pinned tabs in either 'merge' or 'replace' mode.
   */
  static async importWorkspacesAndTabs(
    importedWorkspaces: Workspace[],
    importedPinnedTabs: TabItem[],
    mode: 'merge' | 'replace' = 'replace',
    preferredActiveWorkspaceId?: string
  ): Promise<void> {
    if (importedWorkspaces.length === 0) {
      importedWorkspaces = [{ id: DEFAULT_WORKSPACE_ID, name: DEFAULT_WORKSPACE_NAME, tabs: [] }];
    }

    // Helper to safely create a tab with lazy materialization support
    const createSafeTab = async (
      url: string,
      title: string | undefined,
      isActive: boolean,
      isPinned: boolean,
      wsId: string,
      uuid: string
    ): Promise<number | undefined> => {
      const isHttp = url.startsWith('http://') || url.startsWith('https://');
      const isAbout = url.startsWith('about:');
      const safeUrl = isHttp || isAbout || url.startsWith('moz-extension://') ? url : 'about:blank';
      const canDiscard = isHttp && !isActive;

      let newTab: browser.tabs.Tab | undefined;

      try {
        newTab = await browser.tabs.create({
          url: safeUrl === 'about:newtab' ? undefined : safeUrl,
          active: isActive,
          pinned: isPinned,
        });
      } catch {
        try {
          newTab = await browser.tabs.create({
            active: isActive,
            pinned: isPinned,
            url: isHttp ? safeUrl : undefined,
          });
        } catch (err) {
          console.warn('[WorkspaceManager] Failed to create tab:', safeUrl, err);
          return undefined;
        }
      }

      if (newTab && newTab.id !== undefined) {
        if (canDiscard) {
          try {
            await browser.tabs.discard(newTab.id);
          } catch {}
        }
        await browser.sessions.setTabValue(newTab.id, 'tab_uuid', uuid);
        await this.setTabWorkspaceId(newTab.id, wsId);
        return newTab.id;
      }
      return undefined;
    };

    if (mode === 'replace') {
      // 1. Query and record IDs of all existing tabs before creating imported ones
      const existingTabs = await browser.tabs.query({ currentWindow: true });
      const oldTabIds = existingTabs
        .filter((t) => t.id !== undefined)
        .map((t) => t.id as number);

      const targetActiveWs = (preferredActiveWorkspaceId && importedWorkspaces.some((w) => w.id === preferredActiveWorkspaceId))
        ? preferredActiveWorkspaceId
        : importedWorkspaces[0].id;

      const createdTabIds = new Set<number>();
      const tabsToHide: number[] = [];

      // 2. Create pinned tabs from imported list
      for (const pinTab of importedPinnedTabs) {
        const createdId = await createSafeTab(
          pinTab.url,
          pinTab.title,
          false,
          true,
          targetActiveWs,
          pinTab.uuid || crypto.randomUUID()
        );
        if (createdId !== undefined) {
          createdTabIds.add(createdId);
        }
      }

      // 3. Create tabs for active workspace
      const activeWs = importedWorkspaces.find((w) => w.id === targetActiveWs) || importedWorkspaces[0];
      let activeTabCreated = false;

      for (let i = 0; i < activeWs.tabs.length; i++) {
        const tab = activeWs.tabs[i];
        const isFirst = i === 0;
        const createdId = await createSafeTab(
          tab.url,
          tab.title,
          isFirst,
          false,
          targetActiveWs,
          tab.uuid || crypto.randomUUID()
        );
        if (createdId !== undefined) {
          createdTabIds.add(createdId);
          if (isFirst) activeTabCreated = true;
        }
      }

      // Fallback if active workspace had no tabs created
      if (!activeTabCreated) {
        const fallbackId = await createSafeTab(
          'about:blank',
          'New Tab',
          true,
          false,
          targetActiveWs,
          crypto.randomUUID()
        );
        if (fallbackId !== undefined) {
          createdTabIds.add(fallbackId);
        }
      }

      // 4. Create tabs for inactive workspaces
      for (const otherWs of importedWorkspaces) {
        if (otherWs.id === targetActiveWs) continue;
        for (const tab of otherWs.tabs) {
          const createdId = await createSafeTab(
            tab.url,
            tab.title,
            false,
            false,
            otherWs.id,
            tab.uuid || crypto.randomUUID()
          );
          if (createdId !== undefined) {
            createdTabIds.add(createdId);
            tabsToHide.push(createdId);
          }
        }
      }

      // 5. Hide inactive tabs in batch
      if (tabsToHide.length > 0) {
        try {
          await browser.tabs.hide(tabsToHide);
        } catch (err) {
          console.warn('[WorkspaceManager] Failed to batch hide inactive tabs on import:', err);
        }
      }

      // 6. Close ONLY the old tabs that existed prior to import
      for (const oldId of oldTabIds) {
        if (!createdTabIds.has(oldId)) {
          try {
            await browser.tabs.remove(oldId);
          } catch {}
        }
      }

      // 7. Save stored workspaces and active workspace ID
      await this.saveStoredWorkspaces(
        importedWorkspaces.map((w) => ({
          id: w.id,
          name: w.name,
          customType: w.customType,
          customValue: w.customValue,
          color: w.color,
          icon: w.icon,
        }))
      );
      await this.setActiveWorkspaceId(targetActiveWs);

    } else {
      // MODE: 'merge'
      const stored = await this.getStoredWorkspaces();
      const existingIds = new Set(stored.map((w) => w.id));
      const newWorkspacesToStore: StoredWorkspace[] = [...stored];
      const tabsToHide: number[] = [];

      // Create pinned tabs if not existing
      const existingPinned = await browser.tabs.query({ currentWindow: true, pinned: true });
      const existingPinnedUrls = new Set(existingPinned.map((t) => t.url));

      for (const pinTab of importedPinnedTabs) {
        if (!existingPinnedUrls.has(pinTab.url)) {
          await createSafeTab(
            pinTab.url,
            pinTab.title,
            false,
            true,
            stored[0]?.id || DEFAULT_WORKSPACE_ID,
            pinTab.uuid || crypto.randomUUID()
          );
        }
      }

      // Append new workspaces and create their hidden tabs
      for (const ws of importedWorkspaces) {
        let wsId = ws.id;
        if (existingIds.has(wsId)) {
          wsId = `ws-${crypto.randomUUID().slice(0, 6)}`;
        }
        existingIds.add(wsId);
        newWorkspacesToStore.push({
          id: wsId,
          name: ws.name,
          customType: ws.customType,
          customValue: ws.customValue,
          color: ws.color,
          icon: ws.icon,
        });

        for (const tab of ws.tabs) {
          const createdId = await createSafeTab(
            tab.url,
            tab.title,
            false,
            false,
            wsId,
            tab.uuid || crypto.randomUUID()
          );
          if (createdId !== undefined) {
            tabsToHide.push(createdId);
          }
        }
      }

      if (tabsToHide.length > 0) {
        try {
          await browser.tabs.hide(tabsToHide);
        } catch (err) {
          console.warn('[WorkspaceManager] Failed to hide merged tabs:', err);
        }
      }

      await this.saveStoredWorkspaces(newWorkspacesToStore);
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
