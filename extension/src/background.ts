import { SynapseApiClient } from './api.js';
import { reconcile } from './diff.js';
import { WorkspaceManager, DEFAULT_WORKSPACE_ID, DEFAULT_WORKSPACE_NAME } from './workspaces.js';
import { exportToStgFormat, importFromStgFormat } from './stg-adapter.js';
import { exportToSynapseFormat, importFromSynapseFormat } from './backup-format.js';
import { initContextMenus } from './menus.js';
import { updateActionIcon } from './action-icon.js';
import { determineSyncAction, isNonSyncUrl } from './sync-action.js';
import { SynapseSettings, SyncStatus, SyncPayload, TabItem, Workspace, DebugLogLevel, DebugLogEntry, DebugDiagnostics } from './types.js';

export const DEFAULT_DEBOUNCE_DELAY_MS = 3000;
const DEFAULT_SETTINGS: SynapseSettings = {
  backendUrl: 'http://localhost:8080',
  syncSecret: 'synapse_dev_secret_123',
  userId: 'default',
  clientId: `firefox-${crypto.randomUUID().slice(0, 8)}`,
  pollIntervalSeconds: 15,
  debounceDelayMs: DEFAULT_DEBOUNCE_DELAY_MS,
};

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let isApplyingRemoteDiff = false;
let hasCompletedInitialPull = false;
let currentStatus: SyncStatus = {
  state: 'idle',
  lastSyncTime: null,
  errorMessage: null,
};

const MAX_DEBUG_LOGS = 250;
let debugLogs: DebugLogEntry[] = [];
const serviceStartTime = Date.now();
let currentTabCount = 0;
let lastLoggedTabCount = 0;
const knownNonSyncTabIds = new Set<number>();

async function loadStoredLogs(): Promise<void> {
  try {
    const data = await browser.storage.local.get(['debug_logs']);
    if (Array.isArray(data.debug_logs)) {
      debugLogs = data.debug_logs.slice(-MAX_DEBUG_LOGS);
    }
  } catch { }
}

async function refreshTabCount(): Promise<void> {
  try {
    const existingTabs = await browser.tabs.query({});
    currentTabCount = existingTabs.length;
    for (const t of existingTabs) {
      if (t.id !== undefined && isNonSyncUrl(t.url)) {
        knownNonSyncTabIds.add(t.id);
      }
    }
  } catch { }
}

function addDebugLog(
  level: DebugLogLevel,
  category: string,
  message: string,
  details?: any
): void {
  const tabDelta = currentTabCount - lastLoggedTabCount;
  const tabDeltaFormatted = tabDelta > 0 ? `+${tabDelta}` : `${tabDelta}`;
  const tabCountInfo = {
    current: currentTabCount,
    previous: lastLoggedTabCount,
    delta: tabDeltaFormatted,
  };
  lastLoggedTabCount = currentTabCount;

  let mergedDetails: any;
  if (details !== undefined && typeof details === 'object' && details !== null && !Array.isArray(details)) {
    mergedDetails = { ...details, tabCountChange: tabCountInfo };
  } else if (details !== undefined) {
    mergedDetails = { payload: details, tabCountChange: tabCountInfo };
  } else {
    mergedDetails = { tabCountChange: tabCountInfo };
  }

  const entry: DebugLogEntry = {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
    level,
    category,
    message,
    details: JSON.stringify(mergedDetails, null, 2),
  };

  debugLogs.push(entry);
  if (debugLogs.length > MAX_DEBUG_LOGS) {
    debugLogs = debugLogs.slice(-MAX_DEBUG_LOGS);
  }

  browser.storage.local.set({ debug_logs: debugLogs }).catch(() => { });

  const prefix = `[SynapseTab ${level.toUpperCase()}][${category}][tabs: ${tabCountInfo.current} (${tabCountInfo.delta})]`;
  if (level === 'error') {
    console.error(prefix, message, mergedDetails);
  } else if (level === 'warn') {
    console.warn(prefix, message, mergedDetails);
  } else {
    console.log(prefix, message, mergedDetails);
  }
}

async function getDebugDiagnostics(): Promise<DebugDiagnostics> {
  const settings = await loadSettings();
  const localVer = await getLocalVersionState();
  const activeWs = await WorkspaceManager.getActiveWorkspaceId();
  const storedWs = await WorkspaceManager.getStoredWorkspaces();
  const allTabs = await browser.tabs.query({ currentWindow: true });

  return {
    status: currentStatus,
    localVersionState: localVer,
    settings,
    activeWorkspaceId: activeWs,
    workspacesCount: storedWs.length,
    tabsCount: allTabs.length,
    uptimeSeconds: Math.floor((Date.now() - serviceStartTime) / 1000),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Firefox',
  };
}

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
      debounceDelayMs: typeof data.settings.debounceDelayMs === 'number' && data.settings.debounceDelayMs >= 100
        ? data.settings.debounceDelayMs
        : DEFAULT_DEBOUNCE_DELAY_MS,
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
 * Emits local state to the backend after the configured debounce delay.
 * Sets status to 'pending' while waiting for debounce.
 */
async function triggerPushSync(): Promise<void> {
  if (isApplyingRemoteDiff || !hasCompletedInitialPull) {
    return;
  }

  await setLocalVersionState({ hasLocalChanges: true });
  await updateStatus({ state: 'pending', errorMessage: null });

  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  const settings = await loadSettings();
  const delay = typeof settings.debounceDelayMs === 'number' && settings.debounceDelayMs >= 100
    ? settings.debounceDelayMs
    : DEFAULT_DEBOUNCE_DELAY_MS;

  debounceTimer = setTimeout(async () => {
    debounceTimer = null;
    await pushSync();
  }, delay);
}

/**
 * Pushes local state to backend.
 */
async function pushSync(forceIncrement = false): Promise<void> {
  if (isApplyingRemoteDiff) return;

  try {
    await updateStatus({ state: 'syncing', errorMessage: null });
    const settings = await loadSettings();
    const versionState = await getLocalVersionState();

    const versionToPush = (versionState.hasLocalChanges || forceIncrement)
      ? versionState.version + 1
      : Math.max(versionState.version, 1);
    const updatedAtToPush = Math.floor(Date.now() / 1000);

    const localState = await WorkspaceManager.captureLocalState(
      settings.clientId,
      versionToPush,
      updatedAtToPush
    );

    const totalTabs = localState.workspaces.reduce((acc, ws) => acc + (ws.tabs?.length || 0), 0);
    if (totalTabs === 0) {
      console.warn('[SynapseTab] Aborting pushSync: total tab count across all workspaces is 0. Window is closing or empty.');
      addDebugLog('warn', 'sync', 'Aborted pushSync: total tab count across all workspaces is 0 (window closing or empty).');
      return;
    }

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
    addDebugLog('sync', 'push', `Local state pushed successfully (v${confirmedVersion}).`, {
      version: confirmedVersion,
      updatedAt: confirmedUpdatedAt,
    });
  } catch (err: any) {
    addDebugLog('error', 'push', `Push sync failed: ${err.message}`, err.stack || err);
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
        await refreshTabCount();
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
    addDebugLog(
      'sync',
      'pull',
      `Remote reconciliation applied successfully (v${remoteState.version ?? remoteState.updated_at}).`,
      { version: remoteState.version, updatedAt: remoteState.updated_at }
    );
  } catch (err: any) {
    addDebugLog('error', 'pull', `Pull sync failed: ${err.message}`, err.stack || err);
    await updateStatus({
      state: 'error',
      errorMessage: err.message || 'Pull sync failed',
    });
    throw err;
  }
}

/**
 * Register tab event listeners with DEBOUNCE_DELAY_MS debounce.
 * Only pushes changes when user interacts with tabs; never pulls automatically.
 * Ignores internal, empty, settings, and extension pages (about:*, moz-extension://*, etc.).
 */
function setupTabListeners(): void {
  const onTabChange = () => {
    if (!isApplyingRemoteDiff) {
      triggerPushSync();
    }
  };

  browser.tabs.onCreated.addListener(async (tab) => {
    currentTabCount++;
    if (tab.id !== undefined && !isApplyingRemoteDiff) {
      await WorkspaceManager.getOrAssignTabUuid(tab.id);
      const activeWs = await WorkspaceManager.getActiveWorkspaceId();
      await WorkspaceManager.setTabWorkspaceId(tab.id, activeWs);

      if (isNonSyncUrl(tab.url)) {
        knownNonSyncTabIds.add(tab.id);
        addDebugLog('info', 'tabs', `Ignored tab creation for non-sync URL`);
      } else {
        knownNonSyncTabIds.delete(tab.id);
        addDebugLog('info', 'tabs', `Tab created with syncable URL`);
        onTabChange();
      }
    }
  });

  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    const effectiveUrl = changeInfo.url || tab?.url;

    if (isNonSyncUrl(effectiveUrl)) {
      knownNonSyncTabIds.add(tabId);
      return;
    }

    knownNonSyncTabIds.delete(tabId);

    // Only react to significant user/content updates (url, meaningful title change, pinned)
    if (changeInfo.url || (changeInfo.title && changeInfo.title !== 'New Tab') || changeInfo.pinned !== undefined) {
      addDebugLog('info', 'tabs', `Tab updated: ${effectiveUrl || 'page'} [Tab #${tabId}]`);
      onTabChange();
    }
  });

  browser.tabs.onRemoved.addListener((tabId, removeInfo) => {
    currentTabCount = Math.max(0, currentTabCount - 1);

    if (removeInfo && removeInfo.isWindowClosing) {
      // Entire window is closing (Firefox exiting or closing window). Cancel debounce timer!
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      knownNonSyncTabIds.delete(tabId);
      return;
    }

    if (currentTabCount === 0) {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      return;
    }

    if (knownNonSyncTabIds.has(tabId)) {
      knownNonSyncTabIds.delete(tabId);
      addDebugLog('info', 'tabs', `Ignored tab removal for non-sync page [Tab #${tabId}]`);
      return;
    }

    addDebugLog('info', 'tabs', `Tab closed [Tab #${tabId}]`);
    onTabChange();
  });

  browser.tabs.onMoved.addListener((tabId, _moveInfo) => {
    if (knownNonSyncTabIds.has(tabId)) {
      return;
    }
    onTabChange();
  });

  browser.tabs.onActivated.addListener(async (activeInfo) => {
    if (knownNonSyncTabIds.has(activeInfo.tabId)) {
      return;
    }
    try {
      const tab = await browser.tabs.get(activeInfo.tabId);
      if (tab && isNonSyncUrl(tab.url)) {
        knownNonSyncTabIds.add(activeInfo.tabId);
        return;
      }
    } catch { }
    onTabChange();
  });
}

/**
 * Setup lifecycle listeners to push state when Firefox or windows close.
 */
function setupLifecycleListeners(): void {
  // If a window is removed, check if any normal windows remain
  browser.windows.onRemoved.addListener(async () => {
    try {
      const normalWindows = await browser.windows.getAll({ windowTypes: ['normal'] });
      if (normalWindows.length === 0) {
        // Last window closed: Firefox is quitting.
        // Clear any pending debounce timer to prevent pushing an empty state!
        if (debounceTimer) {
          clearTimeout(debounceTimer);
          debounceTimer = null;
        }
        return;
      }
    } catch { }

    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
      await pushSync();
    }
  });

  // Flush pending changes on extension suspend / shutdown
  if (typeof browser.runtime.onSuspend !== 'undefined' && browser.runtime.onSuspend.addListener) {
    browser.runtime.onSuspend.addListener(() => {
      // Browser or extension is shutting down. Cancel pending debounce timer!
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
    });
  }
}

/**
 * Evaluates whether the local browser session is missing remote workspaces/tabs
 * (for example, if Firefox started fresh without session restore, after a crash, or on a clean profile).
 */
async function checkLocalSessionMissingTabs(remoteState: SyncPayload | null): Promise<boolean> {
  if (!remoteState) return false;
  const remoteTabsCount = (remoteState.workspaces || []).reduce((acc, ws) => acc + (ws.tabs?.length || 0), 0);
  if (remoteTabsCount === 0) return false;

  const remoteUuids = new Set<string>();
  for (const ws of (remoteState.workspaces || [])) {
    for (const t of (ws.tabs || [])) {
      if (t.uuid) remoteUuids.add(t.uuid);
    }
  }

  const allLocalTabs = await browser.tabs.query({});
  let matchingCount = 0;
  for (const tab of allLocalTabs) {
    if (tab.id !== undefined) {
      const uuid = await browser.sessions.getTabValue(tab.id, 'tab_uuid');
      if (typeof uuid === 'string' && remoteUuids.has(uuid)) {
        matchingCount++;
      }
    }
  }

  // If local browser has fewer matching tabs than the remote state, tabs are missing!
  if (matchingCount < remoteTabsCount) {
    addDebugLog(
      'info',
      'startup',
      `Session tab disparity detected: only ${matchingCount}/${remoteTabsCount} remote tabs present locally.`
    );
    return true;
  }

  // Also check if any remote workspace with tabs is completely missing locally
  for (const ws of (remoteState.workspaces || [])) {
    if (ws.tabs && ws.tabs.length > 0) {
      const wsUuids = new Set(ws.tabs.map((t) => t.uuid).filter(Boolean));
      let wsMatch = 0;
      for (const tab of allLocalTabs) {
        if (tab.id !== undefined) {
          const uuid = await browser.sessions.getTabValue(tab.id, 'tab_uuid');
          if (typeof uuid === 'string' && wsUuids.has(uuid)) {
            wsMatch++;
          }
        }
      }
      if (wsMatch === 0) {
        addDebugLog(
          'info',
          'startup',
          `Workspace "${ws.name}" (${ws.tabs.length} tabs) has 0 tabs locally.`
        );
        return true;
      }
    }
  }

  return false;
}

/**
 * Handles the manual "Push changes now" button click:
 * Forces an immediate push of the current local state to the server.
 */
async function handlePushNowButton(): Promise<SyncStatus> {
  try {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    addDebugLog('sync', 'manual', 'Manual push requested: pushing local state to server.');
    await pushSync(true);
    hasCompletedInitialPull = true;
    return currentStatus;
  } catch (err: any) {
    console.error('[SynapseTab Push Error]', err.message);
    addDebugLog('error', 'manual', `Push failed: ${err.message}`, err.stack || err);
    await updateStatus({
      state: 'error',
      errorMessage: err.message || 'Push failed',
    });
    return currentStatus;
  }
}

/**
 * Handles the manual "Pull remote changes" button click:
 * Looks for the version on the server:
 * - If server has a newer version, downloads and applies it.
 * - If server version is minor or equal, does nothing.
 */
async function handlePullNowButton(): Promise<{
  pulled: boolean;
  remoteVersion?: number;
  localVersion?: number;
  message: string;
}> {
  try {
    const settings = await loadSettings();
    const remoteState = await SynapseApiClient.fetchRemoteState(settings);

    if (!remoteState) {
      addDebugLog('sync', 'pull', 'Manual pull check: no remote snapshot found on server.');
      return {
        pulled: false,
        message: 'No workspace snapshot found on remote server.',
      };
    }

    const localState = await getLocalVersionState();
    const remoteVersion = remoteState.version ?? 0;
    const localVersion = localState.version ?? 0;

    let isNewer = false;
    if (remoteVersion > 0 && localVersion > 0) {
      isNewer = remoteVersion > localVersion;
    } else {
      isNewer = (remoteState.updated_at || 0) > (localState.updatedAt || 0);
    }

    if (isNewer) {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      addDebugLog(
        'sync',
        'pull',
        `Manual pull: server version (v${remoteVersion}) is newer than local (v${localVersion}). Applying update.`
      );
      await updateStatus({ state: 'syncing', errorMessage: null });
      await pullSync(false, remoteState);
      hasCompletedInitialPull = true;
      return {
        pulled: true,
        remoteVersion,
        localVersion,
        message: `Updated to newer remote version (v${remoteVersion}).`,
      };
    } else {
      addDebugLog(
        'sync',
        'pull',
        `Manual pull check: server version (${remoteVersion}) is minor or equal to local (${localVersion}). Nothing to do.`
      );
      return {
        pulled: false,
        remoteVersion,
        localVersion,
        message: `Already up to date. Server version (${remoteVersion}) is not newer than local (${localVersion}).`,
      };
    }
  } catch (err: any) {
    console.error('[SynapseTab Pull Error]', err.message);
    addDebugLog('error', 'pull', `Manual pull failed: ${err.message}`, err.stack || err);
    await updateStatus({
      state: 'error',
      errorMessage: err.message || 'Pull failed',
    });
    return {
      pulled: false,
      message: `Pull failed: ${err.message}`,
    };
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

        case 'PUSH_NOW':
        case 'SYNC_NOW':
          return await handlePushNowButton();

        case 'PULL_NOW':
          return await handlePullNowButton();

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
            order: stored.length,
            isDivider: false,
            isArchived: false,
          });
          await WorkspaceManager.saveStoredWorkspaces(stored);
          await pushSync();
          return { success: true, id };
        }

        case 'CREATE_DIVIDER': {
          const stored = await WorkspaceManager.getStoredWorkspaces();
          const id = `divider-${crypto.randomUUID().slice(0, 8)}`;
          const newDivider: StoredWorkspace = {
            id,
            name: message.name || 'Divider',
            isDivider: true,
            order: typeof message.targetIndex === 'number' ? message.targetIndex : stored.length,
          };
          if (typeof message.targetIndex === 'number' && message.targetIndex >= 0 && message.targetIndex <= stored.length) {
            stored.splice(message.targetIndex, 0, newDivider);
          } else {
            stored.push(newDivider);
          }
          stored.forEach((w, idx) => {
            w.order = idx;
          });
          await WorkspaceManager.saveStoredWorkspaces(stored);
          await pushSync();
          return { success: true, id };
        }

        case 'REORDER_WORKSPACES': {
          const stored = await WorkspaceManager.getStoredWorkspaces();
          const orderedIds: string[] = message.orderedIds;
          if (!Array.isArray(orderedIds)) {
            throw new Error('orderedIds array is required');
          }
          const map = new Map(stored.map((w) => [w.id, w]));
          const reordered: StoredWorkspace[] = [];
          for (let i = 0; i < orderedIds.length; i++) {
            const id = orderedIds[i];
            const item = map.get(id);
            if (item) {
              item.order = i;
              reordered.push(item);
              map.delete(id);
            }
          }
          for (const item of map.values()) {
            item.order = reordered.length;
            reordered.push(item);
          }
          await WorkspaceManager.saveStoredWorkspaces(reordered);
          await pushSync();
          return { success: true };
        }

        case 'ARCHIVE_WORKSPACE': {
          const stored = await WorkspaceManager.getStoredWorkspaces();
          const targetIndex = stored.findIndex((w) => w.id === message.workspaceId);
          if (targetIndex === -1) {
            throw new Error(`Workspace with id ${message.workspaceId} not found`);
          }
          const shouldArchive = Boolean(message.archive);
          if (shouldArchive) {
            const activeWorkspaces = stored.filter((w) => !w.isDivider && !w.isArchived);
            if (activeWorkspaces.length <= 1 && activeWorkspaces.some((w) => w.id === message.workspaceId)) {
              throw new Error('Cannot archive the only remaining active workspace');
            }
            const activeWs = await WorkspaceManager.getActiveWorkspaceId();
            if (activeWs === message.workspaceId) {
              const fallbackWs = stored.find((w) => w.id !== message.workspaceId && !w.isDivider && !w.isArchived);
              if (fallbackWs) {
                await WorkspaceManager.switchToWorkspace(fallbackWs.id);
              }
            }
            const allTabs = await browser.tabs.query({ currentWindow: true });
            const tabsToHide: number[] = [];
            for (const t of allTabs) {
              if (t.id !== undefined && !t.pinned) {
                const ws = await WorkspaceManager.getTabWorkspaceId(t.id, '');
                if (ws === message.workspaceId) {
                  tabsToHide.push(t.id);
                }
              }
            }
            if (tabsToHide.length > 0) {
              try {
                await browser.tabs.hide(tabsToHide);
              } catch {}
            }
            stored[targetIndex].isArchived = true;
          } else {
            stored[targetIndex].isArchived = false;
          }
          await WorkspaceManager.saveStoredWorkspaces(stored);
          await updateActionIcon();
          await pushSync();
          return { success: true };
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
            order: message.order !== undefined ? message.order : stored[targetIndex].order,
            isDivider: message.isDivider !== undefined ? message.isDivider : stored[targetIndex].isDivider,
            isArchived: message.isArchived !== undefined ? message.isArchived : stored[targetIndex].isArchived,
          };
          await WorkspaceManager.saveStoredWorkspaces(stored);
          await pushSync();
          return { success: true };
        }

        case 'DELETE_WORKSPACE': {
          const stored = await WorkspaceManager.getStoredWorkspaces();
          const targetWs = stored.find((w) => w.id === message.workspaceId);

          // If deleting a divider, simply remove without closing tabs
          if (targetWs?.isDivider) {
            const filtered = stored.filter((w) => w.id !== message.workspaceId);
            filtered.forEach((w, idx) => {
              w.order = idx;
            });
            await WorkspaceManager.saveStoredWorkspaces(filtered);
            await pushSync();
            return { success: true };
          }

          const activeWorkspaces = stored.filter((w) => !w.isDivider && !w.isArchived);
          if (activeWorkspaces.length <= 1 && activeWorkspaces.some((w) => w.id === message.workspaceId)) {
            throw new Error('Cannot delete the only remaining workspace');
          }
          const filtered = stored.filter((w) => w.id !== message.workspaceId);
          const fallbackWs = filtered.find((w) => !w.isDivider && !w.isArchived)?.id || DEFAULT_WORKSPACE_ID;
          const activeWs = await WorkspaceManager.getActiveWorkspaceId();

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

          filtered.forEach((w, idx) => {
            w.order = idx;
          });
          await WorkspaceManager.saveStoredWorkspaces(filtered);
          await pushSync();
          return { success: true };
        }

        case 'DESTROY_ALL_WORKSPACES': {
          if (debounceTimer) {
            clearTimeout(debounceTimer);
            debounceTimer = null;
          }
          isApplyingRemoteDiff = true;

          let remoteDeleteSuccess = false;
          let remoteErrorMessage: string | null = null;

          try {
            const settings = await loadSettings();
            try {
              await SynapseApiClient.deleteRemoteWorkspaces(settings);
              remoteDeleteSuccess = true;
            } catch (apiErr: any) {
              remoteErrorMessage = apiErr.message || String(apiErr);
              console.warn('[SynapseTab] Failed to delete remote workspaces:', remoteErrorMessage);
            }

            // Create a clean new tab in each window to prevent window closure, associated with DEFAULT_WORKSPACE_ID
            const allTabs = await browser.tabs.query({});
            const keptTabIds = new Set<number>();
            try {
              const windows = await browser.windows.getAll();
              for (const win of windows) {
                if (win.id !== undefined) {
                  const fallbackTab = await browser.tabs.create({
                    windowId: win.id,
                    active: true,
                    url: 'about:blank',
                  });
                  if (fallbackTab.id !== undefined) {
                    keptTabIds.add(fallbackTab.id);
                    await WorkspaceManager.getOrAssignTabUuid(fallbackTab.id);
                    await WorkspaceManager.setTabWorkspaceId(fallbackTab.id, DEFAULT_WORKSPACE_ID);
                  }
                }
              }
            } catch {
              const fallbackTab = await browser.tabs.create({
                active: true,
                url: 'about:blank',
              });
              if (fallbackTab.id !== undefined) {
                keptTabIds.add(fallbackTab.id);
                await WorkspaceManager.getOrAssignTabUuid(fallbackTab.id);
                await WorkspaceManager.setTabWorkspaceId(fallbackTab.id, DEFAULT_WORKSPACE_ID);
              }
            }

            // Close all other tabs
            for (const t of allTabs) {
              if (t.id !== undefined && !keptTabIds.has(t.id)) {
                try {
                  await browser.tabs.remove(t.id);
                } catch {
                  // Tab may already have closed
                }
              }
            }

            // Reset stored workspaces to default only
            await WorkspaceManager.saveStoredWorkspaces([
              { id: DEFAULT_WORKSPACE_ID, name: DEFAULT_WORKSPACE_NAME },
            ]);
            await WorkspaceManager.setActiveWorkspaceId(DEFAULT_WORKSPACE_ID);

            // Reset local version state
            await setLocalVersionState({
              version: 0,
              updatedAt: Math.floor(Date.now() / 1000),
              hasLocalChanges: false,
              initialSyncCompleted: true,
            });

            // Reset sync status
            await updateStatus({
              state: 'idle',
              lastSyncTime: null,
              errorMessage: null,
            });

            await updateActionIcon();

            addDebugLog('warn', 'destroy', 'Destroyed all local workspaces and removed remote server state.', {
              remoteDeleteSuccess,
              remoteErrorMessage,
            });

            return {
              success: true,
              remoteDeleteSuccess,
              remoteErrorMessage,
              message: remoteDeleteSuccess
                ? 'All workspaces deleted locally and on remote server.'
                : `Workspaces deleted locally. Remote server error: ${remoteErrorMessage}`,
            };
          } finally {
            isApplyingRemoteDiff = false;
          }
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

          if (debounceTimer) {
            clearTimeout(debounceTimer);
            debounceTimer = null;
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
            setTimeout(async () => {
              isApplyingRemoteDiff = false;
              await refreshTabCount();
              // Update local version tracking to match the restored snapshot directly
              await setLocalVersionState({
                version: restoredSnapshot.version ?? 1,
                updatedAt: restoredSnapshot.updated_at,
                hasLocalChanges: false,
                initialSyncCompleted: true,
              });
              await updateStatus({
                state: 'synced',
                lastSyncTime: Date.now(),
                errorMessage: null,
              });
              addDebugLog(
                'sync',
                'restore',
                `Restored backup (${message.backupId}) with ${workspaces.length} workspaces and ${pinnedTabs.length} pinned tabs.`
              );
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

        case 'EXPORT_SYNAPSE_BACKUP': {
          const settings = await loadSettings();
          const localState = await WorkspaceManager.captureLocalState(settings.clientId);
          const pinnedTabs = await WorkspaceManager.getPinnedTabs();
          return exportToSynapseFormat(localState.workspaces, pinnedTabs);
        }

        case 'IMPORT_SYNAPSE_BACKUP': {
          const { backupData, mode } = message;
          const parsedResult = importFromSynapseFormat(backupData);
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
              refreshTabCount().then(() => triggerPushSync());
            }, 500);
          }
          return {
            success: true,
            workspacesCount: parsedResult.workspaces.length,
            pinnedCount: parsedResult.pinnedTabs.length,
            tabsCount: parsedResult.tabCount,
            dividerCount: parsedResult.dividerCount,
            archivedCount: parsedResult.archivedCount,
          };
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
              refreshTabCount().then(() => triggerPushSync());
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

        case 'GET_DEBUG_DATA': {
          const diagnostics = await getDebugDiagnostics();
          return { logs: debugLogs, diagnostics };
        }

        case 'CLEAR_DEBUG_LOGS': {
          debugLogs = [];
          await browser.storage.local.remove(['debug_logs']);
          addDebugLog('info', 'lifecycle', 'Debug logs cleared by user.');
          return { success: true };
        }

        case 'LOG_CLIENT_DEBUG': {
          addDebugLog(message.level || 'info', message.category || 'client', message.message, message.details);
          return { success: true };
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
 * Safely shows the startup workspace download loading tab.
 */
async function showStartupLoadingTab(): Promise<number | null> {
  try {
    const currentTabs = await browser.tabs.query({ currentWindow: true });
    const activeTab = currentTabs.find((t) => t.active) || currentTabs[0];
    const loadingUrl = browser.runtime.getURL('popup/index.html?mode=startup-loading');

    const isBlankOrNew = (u?: string | null) =>
      !u || u === 'about:blank' || u === 'about:newtab' || u === 'about:home';

    if (activeTab && activeTab.id !== undefined && isBlankOrNew(activeTab.url)) {
      await browser.tabs.update(activeTab.id, { url: loadingUrl, active: true });
      return activeTab.id;
    } else {
      const newTab = await browser.tabs.create({ url: loadingUrl, active: true });
      return newTab.id ?? null;
    }
  } catch (err) {
    console.warn('[SynapseTab] Could not display startup loading tab:', err);
    return null;
  }
}

/**
 * Safely removes the startup loading tab and activates a real workspace tab.
 */
async function dismissStartupLoadingTab(
  loadingTabId: number | null,
  success: boolean,
  errorMessage?: string
): Promise<void> {
  if (!loadingTabId) return;

  try {
    // Broadcast completion to the loading tab UI
    browser.runtime.sendMessage({
      type: 'STARTUP_SYNC_COMPLETED',
      success,
      errorMessage,
    }).catch(() => { });

    if (success) {
      const activeWsId = await WorkspaceManager.getActiveWorkspaceId();
      const currentTabs = await browser.tabs.query({ currentWindow: true });

      // Find tabs belonging to the active workspace that are not hidden
      let tabToActivate: number | null = null;
      for (const t of currentTabs) {
        if (t.id === undefined || t.id === loadingTabId) continue;
        const wsId = await WorkspaceManager.getTabWorkspaceId(t.id, activeWsId);
        if (wsId === activeWsId && !t.hidden) {
          tabToActivate = t.id;
          break;
        }
      }

      // If no visible tab found, show all active workspace tabs and pick the first
      if (!tabToActivate) {
        const activeWsTabIds: number[] = [];
        for (const t of currentTabs) {
          if (t.id === undefined || t.id === loadingTabId) continue;
          const wsId = await WorkspaceManager.getTabWorkspaceId(t.id, activeWsId);
          if (wsId === activeWsId) {
            activeWsTabIds.push(t.id);
          }
        }
        if (activeWsTabIds.length > 0) {
          try {
            await browser.tabs.show(activeWsTabIds);
          } catch { }
          tabToActivate = activeWsTabIds[0];
        }
      }

      // Fallback: any other tab in the window
      if (!tabToActivate) {
        const otherTab = currentTabs.find(
          (t) => t.id !== undefined && t.id !== loadingTabId && !t.hidden
        );
        if (otherTab && otherTab.id !== undefined) {
          tabToActivate = otherTab.id;
        }
      }

      if (tabToActivate) {
        try {
          await browser.tabs.update(tabToActivate, { active: true });
        } catch { }
      }

      // Allow brief animation (400ms) for visual polish, then close loading tab
      await new Promise((resolve) => setTimeout(resolve, 400));
      await browser.tabs.remove(loadingTabId);
    } else {
      // In case of error, keep open for 1.8s so user sees the message, then close
      await new Promise((resolve) => setTimeout(resolve, 1800));
      await browser.tabs.remove(loadingTabId);
    }
  } catch (err) {
    console.warn('[SynapseTab] Error dismissing startup loading tab:', err);
    try {
      await browser.tabs.remove(loadingTabId);
    } catch { }
  }
}

/**
 * Initialize extension background process.
 */
async function init(): Promise<void> {
  await loadStoredLogs();

  // Initialize tab counts and register non-sync URLs
  await refreshTabCount();
  lastLoggedTabCount = currentTabCount;

  addDebugLog('info', 'lifecycle', 'Background service initialized.');
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
    await browser.alarms.clearAll().catch(() => { });
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

    const remoteTotalTabs = (remoteState?.workspaces || []).reduce((acc, ws) => acc + (ws.tabs?.length || 0), 0);
    const isMissingTabs = await checkLocalSessionMissingTabs(remoteState);

    const action = determineSyncAction(remoteState, {
      version: versionState.version,
      updatedAt: versionState.updatedAt,
      hasLocalChanges: versionState.hasLocalChanges,
      initialSyncCompleted: versionState.initialSyncCompleted,
      isLocalSessionMissingTabs: isMissingTabs,
    });

    console.log(`[SynapseTab] Startup sync evaluation: action = ${action}`);

    if (action === 'pull' && remoteState) {
      const reason = isMissingTabs
        ? `Local browser is missing remote workspaces/tabs (${remoteTotalTabs} remote tabs). Restoring session...`
        : `Server contains newer version (${remoteState.version ?? remoteState.updated_at} > ${versionState.version ?? versionState.updatedAt}). Pulling...`;
      addDebugLog('sync', 'startup', reason);

      const loadingTabId = await showStartupLoadingTab();
      try {
        await pullSync(true, remoteState);
        await dismissStartupLoadingTab(loadingTabId, true);
      } catch (pullErr: any) {
        await dismissStartupLoadingTab(loadingTabId, false, pullErr.message);
        throw pullErr;
      }
    } else if (action === 'push') {
      addDebugLog(
        'sync',
        'startup',
        `Local instance is newer or server uninitialized. Pushing...`
      );
      await pushSync();
    } else {
      // action === 'none': local instance is the same stored in the home-server. Do nothing!
      addDebugLog(
        'info',
        'startup',
        `Local instance is identical to server (v${versionState.version}). No sync required.`
      );
      await updateStatus({
        state: 'synced',
        lastSyncTime: Date.now(),
        errorMessage: null,
      });
    }

    hasCompletedInitialPull = true;
  } catch (err: any) {
    addDebugLog('error', 'startup', `Startup sync error: ${err.message}`, err.stack || err);
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
