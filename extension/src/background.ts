import { SynapseApiClient } from './api.js';
import { reconcile } from './diff.js';
import { WorkspaceManager, DEFAULT_WORKSPACE_ID, DEFAULT_WORKSPACE_NAME } from './workspaces.js';
import { exportToStgFormat, importFromStgFormat } from './stg-adapter.js';
import { initContextMenus } from './menus.js';
import { updateActionIcon } from './action-icon.js';
import { determineSyncAction } from './sync-action.js';
import { SynapseSettings, SyncStatus, SyncPayload, TabItem, Workspace } from './types.js';

const DEBOUNCE_DELAY_MS = 2000;
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

interface LocalVersionState {
  version: number;
  updatedAt: number;
  hasLocalChanges: boolean;
  initialSyncCompleted?: boolean;
}

async function getLocalVersionState(): Promise<LocalVersionState> {
  const data = await browser.storage.local.get(['local_version_state']);
  if (data.local_version_state) {
    const existing = data.local_version_state;
    return {
      version: existing.version ?? 0,
      updatedAt: existing.updatedAt ?? 0,
      hasLocalChanges: Boolean(existing.hasLocalChanges),
      initialSyncCompleted: existing.initialSyncCompleted ?? (
        (existing.version ?? 0) > 0 || (existing.updatedAt ?? 0) > 0
      ),
    };
  }
  const initial: LocalVersionState = {
    version: 0,
    updatedAt: 0,
    hasLocalChanges: false,
    initialSyncCompleted: false,
  };
  await browser.storage.local.set({ local_version_state: initial });
  return initial;
}

async function setLocalVersionState(state: Partial<LocalVersionState>): Promise<void> {
  const current = await getLocalVersionState();
  const updated: LocalVersionState = { ...current, ...state };
  await browser.storage.local.set({ local_version_state: updated });
}

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
 * Emits local state to the backend after 2000ms debounce.
 */
async function triggerPushSync(): Promise<void> {
  if (isApplyingRemoteDiff || !hasCompletedInitialPull) {
    return;
  }

  await setLocalVersionState({ hasLocalChanges: true });

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
    const versionState = await getLocalVersionState();

    const versionToPush = versionState.hasLocalChanges
      ? versionState.version + 1
      : Math.max(versionState.version, 1);
    const updatedAtToPush = Math.floor(Date.now() / 1000);

    const localState = await WorkspaceManager.captureLocalState(
      settings.clientId,
      versionToPush,
      updatedAtToPush
    );

    const pushRes = await SynapseApiClient.pushLocalState(settings, localState);
    const confirmedVersion = pushRes.version ?? versionToPush;
    const confirmedUpdatedAt = pushRes.updated_at ?? updatedAtToPush;

    await setLocalVersionState({
      version: confirmedVersion,
      updatedAt: confirmedUpdatedAt,
      hasLocalChanges: false,
      initialSyncCompleted: true,
    });

    await updateStatus({
      state: 'synced',
      lastSyncTime: Date.now(),
      errorMessage: null,
    });
    console.log(`[SynapseTab] Local state pushed successfully (v${confirmedVersion}).`);
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
 * @param isInitial Whether this is the bootstrap pull on extension/browser startup.
 * @param preloadedRemoteState Optional pre-fetched remote snapshot.
 */
async function pullSync(isInitial: boolean = false, preloadedRemoteState?: SyncPayload): Promise<void> {
  if (isApplyingRemoteDiff) return;

  try {
    const settings = await loadSettings();
    const remoteState = preloadedRemoteState ?? (await SynapseApiClient.fetchRemoteState(settings));

    if (!remoteState) {
      // Nothing remote yet, push initial local snapshot
      await pushSync();
      return;
    }

    const localState = await WorkspaceManager.captureLocalState(settings.clientId);

    // Compute execution plan
    const plan = reconcile(localState, remoteState);

    // If the plan has no changes, still record version and return
    const hasChanges =
      plan.tabsToCreate.length > 0 ||
      plan.tabsToClose.length > 0 ||
      plan.tabsToUpdate.length > 0 ||
      plan.tabsToMove.length > 0 ||
      plan.workspacesToCreate.length > 0 ||
      plan.workspacesToUpdate.length > 0 ||
      plan.workspacesToRemove.length > 0 ||
      (plan.activeWorkspaceId && plan.activeWorkspaceId !== localState.active_workspace_id);

    if (hasChanges) {
      // Apply plan with lock to avoid listener loops
      isApplyingRemoteDiff = true;
      try {
        await WorkspaceManager.applyExecutionPlan(plan);
      } finally {
        // Allow tab events and DOM to settle before releasing lock
        await new Promise((resolve) => setTimeout(resolve, 600));
        isApplyingRemoteDiff = false;
      }
    }

    // Update local version tracking to match pulled remote state
    await setLocalVersionState({
      version: remoteState.version ?? 1,
      updatedAt: remoteState.updated_at,
      hasLocalChanges: false,
      initialSyncCompleted: true,
    });

    await updateStatus({
      state: 'synced',
      lastSyncTime: Date.now(),
      errorMessage: null,
    });
    console.log(
      `[SynapseTab] Remote reconciliation applied successfully (v${remoteState.version ?? remoteState.updated_at}).`
    );
  } catch (err: any) {
    console.error('[SynapseTab Pull Error]', err.message);
    await updateStatus({
      state: 'error',
      errorMessage: err.message || 'Pull sync failed',
    });
    throw err;
  }
}

/**
 * Register tab event listeners with 2000ms debounce.
 * Only pushes changes when user interacts with tabs; never pulls automatically.
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
 * Setup lifecycle listeners to push state when Firefox or windows close.
 */
function setupLifecycleListeners(): void {
  // Flush pending changes when any window is closed
  browser.windows.onRemoved.addListener(async () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
      await pushSync();
    } else {
      const versionState = await getLocalVersionState();
      if (versionState.hasLocalChanges) {
        await pushSync();
      }
    }
  });

  // Flush pending changes on extension suspend / shutdown
  if (typeof browser.runtime.onSuspend !== 'undefined' && browser.runtime.onSuspend.addListener) {
    browser.runtime.onSuspend.addListener(() => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      pushSync().catch(() => {});
    });
  }
}

/**
 * Handles the manual Synchronize button click:
 * - If server contains a newer version, pull it.
 * - If local is newer (e.g. offline changes or higher version), push it to the server.
 * - If local is identical to server, do nothing.
 */
async function handleSynchronizeButton(): Promise<SyncStatus> {
  try {
    await updateStatus({ state: 'syncing', errorMessage: null });
    const settings = await loadSettings();
    const remoteState = await SynapseApiClient.fetchRemoteState(settings);

    const versionState = await getLocalVersionState();
    const action = determineSyncAction(remoteState, {
      version: versionState.version,
      updatedAt: versionState.updatedAt,
      hasLocalChanges: versionState.hasLocalChanges || debounceTimer !== null,
      initialSyncCompleted: versionState.initialSyncCompleted,
    });

    if (action === 'pull' && remoteState) {
      console.log(
        `[SynapseTab] Server contains newer version (${remoteState.version ?? remoteState.updated_at} > ${versionState.version ?? versionState.updatedAt}). Pulling...`
      );
      await pullSync(true, remoteState);
    } else if (action === 'push') {
      console.log(
        `[SynapseTab] Local instance is newer or server uninitialized. Pushing...`
      );
      await pushSync();
    } else {
      console.log(
        `[SynapseTab] Local instance is already identical to server (v${versionState.version}). No sync required.`
      );
      await updateStatus({
        state: 'synced',
        lastSyncTime: Date.now(),
        errorMessage: null,
      });
    }

    hasCompletedInitialPull = true;
    return currentStatus;
  } catch (err: any) {
    console.error('[SynapseTab Sync Error]', err.message);
    await updateStatus({
      state: 'error',
      errorMessage: err.message || 'Synchronization failed',
    });
    return currentStatus;
  }
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
          return await handleSynchronizeButton();

      case 'SWITCH_WORKSPACE': {
        isApplyingRemoteDiff = true;
        try {
          await WorkspaceManager.switchToWorkspace(message.workspaceId);
          await updateActionIcon();
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
        await pushSync();
        return { success: true, id };
      }

      case 'UPDATE_WORKSPACE': {
        const stored = await WorkspaceManager.getStoredWorkspaces();
        const targetIndex = stored.findIndex((w) => w.id === message.workspaceId);
        if (targetIndex === -1) {
          throw new Error(`Workspace with id ${message.workspaceId} not found`);
        }
        const nextCustomType = message.customType !== undefined ? message.customType : stored[targetIndex].customType;
        let nextCustomValue: string | undefined;
        if (nextCustomType === 'default') {
          nextCustomValue = undefined;
        } else if (message.customValue !== undefined) {
          nextCustomValue = message.customValue;
        } else {
          nextCustomValue = stored[targetIndex].customValue;
        }

        const nextIcon = message.icon !== undefined ? message.icon : (nextCustomType === 'emoji' ? nextCustomValue : undefined);

        stored[targetIndex] = {
          id: stored[targetIndex].id,
          name: message.name !== undefined ? message.name : stored[targetIndex].name,
          customType: nextCustomType,
          customValue: nextCustomValue,
          color: message.color !== undefined ? message.color : stored[targetIndex].color,
          icon: nextIcon,
        };
        await WorkspaceManager.saveStoredWorkspaces(stored);
        await pushSync();
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
        await pushSync();
        return { success: true };
      }

      case 'MOVE_TAB_WORKSPACE': {
        await WorkspaceManager.moveTabToWorkspace(message.tabId, message.targetWorkspaceId);
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

      case 'TEST_CONNECTION': {
        return await SynapseApiClient.testConnection(message.url, message.secret);
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

  // Clear any existing alarms so background polling never runs during usage
  if (typeof browser.alarms !== 'undefined' && browser.alarms.clearAll) {
    await browser.alarms.clearAll().catch(() => {});
  }

  setupLifecycleListeners();
  setupMessageListener();

  // Startup sync decision: check if local instance is older, newer, or same
  try {
    const settings = await loadSettings();
    const versionState = await getLocalVersionState();
    let remoteState: SyncPayload | null = null;

    try {
      remoteState = await SynapseApiClient.fetchRemoteState(settings);
    } catch (fetchErr: any) {
      console.warn('[SynapseTab] Could not reach sync server on startup:', fetchErr.message);
      // If client has already completed initial sync in the past, allow working offline
      if (versionState.initialSyncCompleted) {
        hasCompletedInitialPull = true;
        console.log('[SynapseTab] Operating in offline mode with existing synced state.');
      }
      throw fetchErr;
    }

    const action = determineSyncAction(remoteState, {
      version: versionState.version,
      updatedAt: versionState.updatedAt,
      hasLocalChanges: versionState.hasLocalChanges,
      initialSyncCompleted: versionState.initialSyncCompleted,
    });

    console.log(`[SynapseTab] Startup sync evaluation: action = ${action}`);

    if (action === 'pull' && remoteState) {
      console.log(
        `[SynapseTab] Server contains newer version (${remoteState.version ?? remoteState.updated_at} > ${versionState.version ?? versionState.updatedAt}). Pulling...`
      );
      await pullSync(true, remoteState);
    } else if (action === 'push') {
      console.log(
        `[SynapseTab] Local instance is newer or server uninitialized. Pushing...`
      );
      await pushSync();
    } else {
      // action === 'none': local instance is the same stored in the home-server. Do nothing!
      console.log(
        `[SynapseTab] Local instance is identical to server (v${versionState.version}). No sync required.`
      );
      await updateStatus({
        state: 'synced',
        lastSyncTime: Date.now(),
        errorMessage: null,
      });
    }

    hasCompletedInitialPull = true;
  } catch (err: any) {
    console.error('[SynapseTab] Startup sync error:', err.message);
    await updateStatus({
      state: 'error',
      errorMessage: err.message || 'Startup sync check failed',
    });
  }

  // Register tab listeners ONLY after initial pull has completed and settled
  setupTabListeners();

  // Initialize Firefox tab context menus
  initContextMenus(() => triggerPushSync());

  // Listen for storage changes to active workspace or workspaces to update action icon
  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && (changes.active_workspace_id || changes.workspaces)) {
      updateActionIcon();
    }
  });

  // Update browser toolbar icon for active workspace
  await updateActionIcon();
}

init();
