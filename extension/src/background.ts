import { SynapseApiClient } from './api.js';
import { reconcile } from './diff.js';
import { WorkspaceManager, DEFAULT_WORKSPACE_ID, DEFAULT_WORKSPACE_NAME } from './workspaces.js';
import { SynapseSettings, SyncStatus } from './types.js';

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
    switch (message.type) {
      case 'GET_STATUS':
        return currentStatus;

      case 'SYNC_NOW':
        await pullSync();
        return currentStatus;

      case 'SWITCH_WORKSPACE':
        await WorkspaceManager.switchToWorkspace(message.workspaceId);
        triggerPushSync();
        return { success: true };

      case 'CREATE_WORKSPACE': {
        const stored = await WorkspaceManager.getStoredWorkspaces();
        const id = `ws-${crypto.randomUUID().slice(0, 6)}`;
        stored.push({ id, name: message.name || 'New Workspace' });
        await WorkspaceManager.saveStoredWorkspaces(stored);
        triggerPushSync();
        return { success: true, id };
      }

      case 'DELETE_WORKSPACE': {
        const stored = await WorkspaceManager.getStoredWorkspaces();
        const activeWs = await WorkspaceManager.getActiveWorkspaceId();
        if (stored.length <= 1) {
          throw new Error('Cannot delete the only remaining workspace');
        }
        const filtered = stored.filter((w) => w.id !== message.workspaceId);
        await WorkspaceManager.saveStoredWorkspaces(filtered);
        if (activeWs === message.workspaceId) {
          await WorkspaceManager.switchToWorkspace(filtered[0].id);
        }
        triggerPushSync();
        return { success: true };
      }

      case 'MOVE_TAB_WORKSPACE': {
        await WorkspaceManager.setTabWorkspaceId(message.tabId, message.targetWorkspaceId);
        const activeWs = await WorkspaceManager.getActiveWorkspaceId();
        if (message.targetWorkspaceId !== activeWs) {
          try {
            await browser.tabs.hide(message.tabId);
          } catch {}
        }
        triggerPushSync();
        return { success: true };
      }

      default:
        return { error: 'Unknown action' };
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
