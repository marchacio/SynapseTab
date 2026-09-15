import { SynapseApiClient } from './api.js';
import { reconcile } from './diff.js';
import { WorkspaceManager, DEFAULT_WORKSPACE_ID, DEFAULT_WORKSPACE_NAME } from './workspaces.js';
import { exportToStgFormat, importFromStgFormat } from './stg-adapter.js';
import { SynapseSettings, SyncStatus, SyncPayload, TabItem, Workspace } from './types.js';

const DEBOUNCE_DELAY_MS = 1000;
const DEFAULT_SETTINGS: SynapseSettings = {
  backendUrl: 'http://localhost:8080',
  syncSecret: 'synapse_dev_secret_123',
  userId: 'default',
  clientId: `firefox-${crypto.randomUUID().slice(0, 8)}`,
  pollIntervalSeconds: 15,
};

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let isApplyingRemoteDiff = false;
let hasCompletedInitialPull = false;
let currentStatus: SyncStatus = {
  state: 'idle',
  lastSyncTime: null,
  errorMessage: null,
};

/**
 * Loads extension configuration from local storage.
 */
async function loadSettings(): Promise<SynapseSettings> {
  const data = await browser.storage.local.get(['settings']);
  if (data.settings) {
    return {
      ...DEFAULT_SETTINGS,
      ...data.settings,
      userId: data.settings.userId || 'default',
    };
  }
  await browser.storage.local.set({ settings: DEFAULT_SETTINGS });
  return DEFAULT_SETTINGS;
}

/**
 * Updates internal sync status and informs popup.
 */
async function updateStatus(statusUpdate: Partial<SyncStatus>): Promise<void> {
  currentStatus = { ...currentStatus, ...statusUpdate };
  await browser.storage.local.set({ sync_status: currentStatus });
}

/**
 * Emits local state to the backend after 1000ms debounce.
 */
async function triggerPushSync(): Promise<void> {
  if (isApplyingRemoteDiff || !hasCompletedInitialPull) {
    return;
  }

  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = setTimeout(async () => {
    debounceTimer = null;
    await pushSync();
  }, DEBOUNCE_DELAY_MS);
}

/**
 * Pushes local state to backend.
 */
async function pushSync(): Promise<void> {
  if (isApplyingRemoteDiff) return;

  try {
    await updateStatus({ state: 'syncing', errorMessage: null });
    const settings = await loadSettings();
    const localState = await WorkspaceManager.captureLocalState(settings.clientId);

    await SynapseApiClient.pushLocalState(settings, localState);
    await updateStatus({
      state: 'synced',
      lastSyncTime: Date.now(),
      errorMessage: null,
    });
    console.log('[SynapseTab] Local state pushed successfully.');
  } catch (err: any) {
    console.error('[SynapseTab Push Error]', err.message);
    await updateStatus({
      state: 'error',
      errorMessage: err.message || 'Push sync failed',
    });
  }
}

/**
 * Pulls remote state from backend and executes reconciliation.
 */
async function pullSync(): Promise<void> {
  if (isApplyingRemoteDiff) return;

  try {
    const settings = await loadSettings();
    const remoteState = await SynapseApiClient.fetchRemoteState(settings);

    if (!remoteState) {
      // Nothing remote yet, push initial local snapshot
      await pushSync();
      return;
    }

    const localState = await WorkspaceManager.captureLocalState(settings.clientId);

    // If remote state was emitted by this very client, we already have it
    if (remoteState.client_id === settings.clientId) {
      return;
    }

    // Compute execution plan
    const plan = reconcile(localState, remoteState);

    // Apply plan with lock to avoid listener loops
    isApplyingRemoteDiff = true;
    try {
      await WorkspaceManager.applyExecutionPlan(plan);
    } finally {
      // Small timeout to allow tab events to settle
      setTimeout(() => {
        isApplyingRemoteDiff = false;
      }, 600);
    }

    await updateStatus({
      state: 'synced',
      lastSyncTime: Date.now(),
      errorMessage: null,
    });
    console.log('[SynapseTab] Remote reconciliation applied successfully.');
  } catch (err: any) {
    console.error('[SynapseTab Pull Error]', err.message);
    await updateStatus({
      state: 'error',
      errorMessage: err.message || 'Pull sync failed',
    });
  }
}

/**
 * Register tab event listeners with 1000ms debounce.
 */
function setupTabListeners(): void {
  const onTabChange = () => {
    if (!isApplyingRemoteDiff) {
      triggerPushSync();
    }
  };

  browser.tabs.onCreated.addListener(async (tab) => {
    if (tab.id !== undefined && !isApplyingRemoteDiff) {
      await WorkspaceManager.getOrAssignTabUuid(tab.id);
      const activeWs = await WorkspaceManager.getActiveWorkspaceId();
      await WorkspaceManager.setTabWorkspaceId(tab.id, activeWs);
      onTabChange();
    }
  });

  browser.tabs.onUpdated.addListener((_tabId, changeInfo) => {
    // Only react to significant updates (url, title, pinned, status = complete)
    if (changeInfo.url || changeInfo.title || changeInfo.pinned !== undefined || changeInfo.status === 'complete') {
      onTabChange();
    }
  });

  browser.tabs.onRemoved.addListener((_tabId, _removeInfo) => {
    onTabChange();
  });

  browser.tabs.onMoved.addListener((_tabId, _moveInfo) => {
    onTabChange();
  });

  browser.tabs.onActivated.addListener((_activeInfo) => {
    onTabChange();
  });
}

/**
 * Setup recurring alarms for background polling.
 */
function setupAlarms(): void {
  browser.alarms.create('synapse-pull-sync', { periodInMinutes: 0.25 }); // every 15s

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'synapse-pull-sync') {
      pullSync();
    }
  });
}

/**
 * Message handler for popup UI requests.
 */
function setupMessageListener(): void {
  browser.runtime.onMessage.addListener(async (message: any) => {
    try {
      switch (message.type) {
        case 'GET_STATUS':
          return currentStatus;

        case 'SYNC_NOW':
          await pullSync();
          return currentStatus;

      case 'SWITCH_WORKSPACE': {
        isApplyingRemoteDiff = true;
        try {
          await WorkspaceManager.switchToWorkspace(message.workspaceId);
        } finally {
          setTimeout(() => {
            isApplyingRemoteDiff = false;
            triggerPushSync();
          }, 300);
        }
        return { success: true };
      }

      case 'CREATE_WORKSPACE': {
        const stored = await WorkspaceManager.getStoredWorkspaces();
        const id = `ws-${crypto.randomUUID().slice(0, 6)}`;
        stored.push({
          id,
          name: message.name || 'New Workspace',
          customType: message.customType,
          customValue: message.customValue,
          color: message.color,
          icon: message.icon,
        });
        await WorkspaceManager.saveStoredWorkspaces(stored);
        triggerPushSync();
        return { success: true, id };
      }

      case 'UPDATE_WORKSPACE': {
        const stored = await WorkspaceManager.getStoredWorkspaces();
        const targetIndex = stored.findIndex((w) => w.id === message.workspaceId);
        if (targetIndex === -1) {
          throw new Error(`Workspace with id ${message.workspaceId} not found`);
        }
        stored[targetIndex] = {
          id: stored[targetIndex].id,
          name: message.name !== undefined ? message.name : stored[targetIndex].name,
          customType: message.customType !== undefined ? message.customType : stored[targetIndex].customType,
          customValue: message.customValue !== undefined ? message.customValue : stored[targetIndex].customValue,
          color: message.color !== undefined ? message.color : stored[targetIndex].color,
          icon: message.icon !== undefined ? message.icon : (message.customType === 'emoji' ? message.customValue : undefined),
        };
        await WorkspaceManager.saveStoredWorkspaces(stored);
        triggerPushSync();
        return { success: true };
      }

      case 'DELETE_WORKSPACE': {
        const stored = await WorkspaceManager.getStoredWorkspaces();
        const activeWs = await WorkspaceManager.getActiveWorkspaceId();
        if (stored.length <= 1) {
          throw new Error('Cannot delete the only remaining workspace');
        }
        const filtered = stored.filter((w) => w.id !== message.workspaceId);
        const fallbackWs = filtered[0].id;

        // If the workspace being deleted is currently active, switch to fallback workspace first
        if (activeWs === message.workspaceId) {
          await WorkspaceManager.switchToWorkspace(fallbackWs);
        }

        // Close all tabs belonging to the deleted workspace
        const allTabs = await browser.tabs.query({ currentWindow: true });
        const tabsToClose: number[] = [];
        for (const t of allTabs) {
          if (t.id !== undefined) {
            const ws = await WorkspaceManager.getTabWorkspaceId(t.id, activeWs);
            if (ws === message.workspaceId) {
              tabsToClose.push(t.id);
            }
          }
        }

        // Zero-tab window prevention safeguard
        const remainingTabsCount = allTabs.length - tabsToClose.length;
        if (remainingTabsCount <= 0) {
          try {
            const fallbackTab = await browser.tabs.create({ active: true, url: 'about:blank' });
            if (fallbackTab.id !== undefined) {
              await WorkspaceManager.getOrAssignTabUuid(fallbackTab.id);
              await WorkspaceManager.setTabWorkspaceId(fallbackTab.id, fallbackWs);
            }
          } catch (err) {
            console.error('[WorkspaceManager] Failed to create fallback tab during workspace deletion:', err);
          }
        }

        for (const tabId of tabsToClose) {
          try {
            await browser.tabs.remove(tabId);
          } catch (err) {
            console.warn(`[WorkspaceManager] Failed to close tab ${tabId} during workspace deletion:`, err);
          }
        }

        await WorkspaceManager.saveStoredWorkspaces(filtered);
        triggerPushSync();
        return { success: true };
      }

      case 'MOVE_TAB_WORKSPACE': {
        await WorkspaceManager.setTabWorkspaceId(message.tabId, message.targetWorkspaceId);
        const activeWs = await WorkspaceManager.getActiveWorkspaceId();
        if (message.targetWorkspaceId !== activeWs) {
          try {
            const currentTab = await browser.tabs.get(message.tabId);
            if (currentTab.active) {
              const allTabs = await browser.tabs.query({ currentWindow: true });
              const otherTab = allTabs.find((t) => t.id !== message.tabId && !t.hidden);
              if (otherTab && otherTab.id) {
                await browser.tabs.update(otherTab.id, { active: true });
              } else {
                const newTab = await browser.tabs.create({ active: true, url: 'about:blank' });
                if (newTab.id) {
                  await WorkspaceManager.getOrAssignTabUuid(newTab.id);
                  await WorkspaceManager.setTabWorkspaceId(newTab.id, activeWs);
                }
              }
            }
            await browser.tabs.hide(message.tabId);
          } catch (err) {
            console.warn('[WorkspaceManager] Failed to hide moved tab:', err);
          }
        }
        triggerPushSync();
        return { success: true };
      }

      case 'LIST_BACKUPS': {
        const settings = await loadSettings();
        return await SynapseApiClient.listBackups(settings);
      }

      case 'GET_BACKUP': {
        const settings = await loadSettings();
        return await SynapseApiClient.getBackup(settings, message.backupId);
      }

      case 'CREATE_BACKUP': {
        const settings = await loadSettings();
        return await SynapseApiClient.createBackup(settings);
      }

      case 'RESTORE_BACKUP': {
        const settings = await loadSettings();
        const res = await SynapseApiClient.restoreBackup(settings, message.backupId);
        if (!res || !res.restored_snapshot) {
          throw new Error('Failed to restore backup snapshot from server');
        }

        const restoredSnapshot: SyncPayload = res.restored_snapshot;
        const pinnedTabs: TabItem[] = [];
        const workspaces: Workspace[] = [];

        for (const ws of (restoredSnapshot.workspaces || [])) {
          const wsRegularTabs: TabItem[] = [];
          for (const tab of (ws.tabs || [])) {
            if (tab.pinned) {
              if (!pinnedTabs.some((p) => p.url === tab.url || (p.uuid && p.uuid === tab.uuid))) {
                pinnedTabs.push(tab);
              }
            } else {
              wsRegularTabs.push(tab);
            }
          }
          workspaces.push({
            id: ws.id,
            name: ws.name,
            customType: ws.customType,
            customValue: ws.customValue,
            color: ws.color,
            icon: ws.icon,
            tabs: wsRegularTabs,
          });
        }

        isApplyingRemoteDiff = true;
        try {
          await WorkspaceManager.importWorkspacesAndTabs(
            workspaces.length > 0 ? workspaces : [{ id: DEFAULT_WORKSPACE_ID, name: DEFAULT_WORKSPACE_NAME, tabs: [] }],
            pinnedTabs,
            'replace',
            restoredSnapshot.active_workspace_id
          );
        } finally {
          setTimeout(() => {
            isApplyingRemoteDiff = false;
            triggerPushSync();
          }, 600);
        }

        return res;
      }

      case 'DELETE_BACKUP': {
        const settings = await loadSettings();
        return await SynapseApiClient.deleteBackup(settings, message.backupId);
      }

      case 'UPDATE_BACKUP_CONFIG': {
        const settings = await loadSettings();
        return await SynapseApiClient.updateBackupConfig(settings, message.config);
      }

      case 'EXPORT_STG': {
        const settings = await loadSettings();
        const localState = await WorkspaceManager.captureLocalState(settings.clientId);
        const pinnedTabs = await WorkspaceManager.getPinnedTabs();
        return exportToStgFormat(localState.workspaces, pinnedTabs);
      }

      case 'IMPORT_STG': {
        const { stgData, mode } = message;
        const parsedResult = importFromStgFormat(stgData);
        isApplyingRemoteDiff = true;
        try {
          await WorkspaceManager.importWorkspacesAndTabs(
            parsedResult.workspaces,
            parsedResult.pinnedTabs,
            mode || 'replace'
          );
        } finally {
          setTimeout(() => {
            isApplyingRemoteDiff = false;
            triggerPushSync();
          }, 500);
        }
        return {
          success: true,
          workspacesCount: parsedResult.workspaces.length,
          pinnedCount: parsedResult.pinnedTabs.length,
          tabsCount: parsedResult.tabCount,
        };
      }

      case 'TOGGLE_PIN_TAB': {
        const newPinned = await WorkspaceManager.togglePinTab(message.tabId);
        triggerPushSync();
        return { success: true, pinned: newPinned };
      }

      default:
        return { error: 'Unknown action' };
    }
  } catch (err: any) {
    console.error('[SynapseTab background] Error handling message:', message.type, err);
    return { error: err.message || String(err) };
  }
});
}

/**
 * Initialize extension background process.
 */
async function init(): Promise<void> {
  console.log('[SynapseTab] Background service initialized.');
  await loadSettings();

  // Ensure default workspace exists
  const stored = await WorkspaceManager.getStoredWorkspaces();
  if (stored.length === 0) {
    await WorkspaceManager.saveStoredWorkspaces([
      { id: DEFAULT_WORKSPACE_ID, name: DEFAULT_WORKSPACE_NAME },
    ]);
  }

  // Initialize and assign UUIDs and workspaces for all existing tabs
  await WorkspaceManager.initializeExistingTabs();

  setupTabListeners();
  setupAlarms();
  setupMessageListener();

  // Initial pull sync
  try {
    await pullSync();
  } catch (err) {
    console.error('[SynapseTab] Initial pull error:', err);
  } finally {
    hasCompletedInitialPull = true;
  }
}

init();
