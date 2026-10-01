import {
  Workspace,
  WorkspaceCustomType,
  SynapseSettings,
  SyncStatus,
  BackupMetadata,
  BackupRecord,
  BackupConfig,
  BackupListResponse,
  DebugLogEntry,
  DebugDiagnostics,
  DebugDataResponse,
} from '../types.js';
import { importFromStgFormat, StgImportResult } from '../stg-adapter.js';
import { getContrastingTextColor } from '../theme/tokens.js';
import { SynapseApiClient, TestConnectionResult } from '../api.js';


let currentWorkspaces: Workspace[] = [];
let activeWorkspaceId = 'default';
let currentSettings: SynapseSettings;
let loadedStgResult: StgImportResult | null = null;
let rawImportedJson: any = null;

// Modal Editing State
let editingWorkspace: Workspace | null = null;
let currentEditType: WorkspaceCustomType = 'emoji';
let currentEditValue = '🚀';
let currentEditColor = '#d0bcff';

// DOM Elements - Header & Global
const statusBadge = document.getElementById('statusBadge') as HTMLElement;
const statusLabel = document.getElementById('statusLabel') as HTMLElement;
const pullNowBtn = document.getElementById('pullNowBtn') as HTMLButtonElement | null;
const pushNowBtn = (document.getElementById('pushNowBtn') || document.getElementById('syncNowBtn')) as HTMLButtonElement;
const syncNowBtn = pushNowBtn;
const settingsBtn = document.getElementById('settingsBtn') as HTMLButtonElement;
const lastSyncedText = document.getElementById('lastSyncedText') as HTMLElement;

// Navigation
const fullPageNav = document.getElementById('fullPageNav') as HTMLElement;
const navWorkspaces = document.getElementById('navWorkspaces') as HTMLButtonElement;
const navBackups = document.getElementById('navBackups') as HTMLButtonElement;
const navImportExport = document.getElementById('navImportExport') as HTMLButtonElement;
const navSettings = document.getElementById('navSettings') as HTMLButtonElement;
const navCustomization = document.getElementById('navCustomization') as HTMLButtonElement | null;
const navDebug = document.getElementById('navDebug') as HTMLButtonElement | null;
const navInformation = document.getElementById('navInformation') as HTMLButtonElement | null;
const navDestroy = document.getElementById('navDestroy') as HTMLButtonElement | null;

// Main Sections
const workspacesSection = document.getElementById('workspacesSection') as HTMLElement;
const backupsSection = document.getElementById('backupsSection') as HTMLElement;
const importExportSection = document.getElementById('importExportSection') as HTMLElement;
const settingsSection = document.getElementById('settingsSection') as HTMLElement;
const customizationSection = document.getElementById('customizationSection') as HTMLElement | null;
const debugSection = document.getElementById('debugSection') as HTMLElement;
const informationSection = document.getElementById('informationSection') as HTMLElement | null;
const destroySection = document.getElementById('destroySection') as HTMLElement | null;

// Customization Section Elements
const settingDebounceDelay = document.getElementById('settingDebounceDelay') as HTMLInputElement | null;
const saveCustomizationBtn = document.getElementById('saveCustomizationBtn') as HTMLButtonElement | null;
const resetCustomizationBtn = document.getElementById('resetCustomizationBtn') as HTMLButtonElement | null;
const customizationFeedbackMsg = document.getElementById('customizationFeedbackMsg') as HTMLElement | null;

// Information Section Elements
const infoVersionBadge = document.getElementById('infoVersionBadge') as HTMLElement | null;
const infoExtensionVersion = document.getElementById('infoExtensionVersion') as HTMLElement | null;
const infoPlatformEngine = document.getElementById('infoPlatformEngine') as HTMLElement | null;

// Destroy Section Elements
const confirmDestroyCheckbox = document.getElementById('confirmDestroyCheckbox') as HTMLInputElement | null;
const executeDestroyBtn = document.getElementById('executeDestroyBtn') as HTMLButtonElement | null;
const destroyFeedbackMsg = document.getElementById('destroyFeedbackMsg') as HTMLElement | null;

// Workspaces & Tabs containers
const workspacesList = document.getElementById('workspacesList') as HTMLElement;
const addWorkspaceBtn = document.getElementById('addWorkspaceBtn') as HTMLButtonElement;
const newWorkspaceRow = document.getElementById('newWorkspaceRow') as HTMLElement;
const newWorkspaceInput = document.getElementById('newWorkspaceInput') as HTMLInputElement;
const confirmAddWsBtn = document.getElementById('confirmAddWsBtn') as HTMLButtonElement;
const cancelAddWsBtn = document.getElementById('cancelAddWsBtn') as HTMLButtonElement;

const pinnedSectionWrapper = document.getElementById('pinnedSectionWrapper') as HTMLElement;
const pinnedCountBadge = document.getElementById('pinnedCountBadge') as HTMLElement;
const pinnedTabsList = document.getElementById('pinnedTabsList') as HTMLElement;

const activeWorkspaceTitle = document.getElementById('activeWorkspaceTitle') as HTMLElement;
const tabCountBadge = document.getElementById('tabCountBadge') as HTMLElement;
const tabsList = document.getElementById('tabsList') as HTMLElement;

// Workspace Edit Modal Elements
const wsEditModal = document.getElementById('wsEditModal') as HTMLElement;
const closeWsEditModalBtn = document.getElementById('closeWsEditModalBtn') as HTMLButtonElement;
const cancelWsEditBtn = document.getElementById('cancelWsEditBtn') as HTMLButtonElement;
const saveWsEditBtn = document.getElementById('saveWsEditBtn') as HTMLButtonElement;
const wsEditNameInput = document.getElementById('wsEditNameInput') as HTMLInputElement;
const wsTypeSegments = document.getElementById('wsTypeSegments') as HTMLElement;
const wsEmojiSection = document.getElementById('wsEmojiSection') as HTMLElement;
const wsEmojiInput = document.getElementById('wsEmojiInput') as HTMLInputElement;
const wsQuickEmojiGrid = document.getElementById('wsQuickEmojiGrid') as HTMLElement;
const wsTextSection = document.getElementById('wsTextSection') as HTMLElement;
const wsTagInput = document.getElementById('wsTagInput') as HTMLInputElement;
const wsColorSection = document.getElementById('wsColorSection') as HTMLElement;
const wsColorPalette = document.getElementById('wsColorPalette') as HTMLElement;
const wsPreviewBadge = document.getElementById('wsPreviewBadge') as HTMLElement;
const wsPreviewName = document.getElementById('wsPreviewName') as HTMLElement;
const promptDeleteWsBtn = document.getElementById('promptDeleteWsBtn') as HTMLButtonElement;
const wsDeleteConfirmBox = document.getElementById('wsDeleteConfirmBox') as HTMLElement;
const wsDeleteConfirmText = document.getElementById('wsDeleteConfirmText') as HTMLElement;
const confirmDeleteWsBtn = document.getElementById('confirmDeleteWsBtn') as HTMLButtonElement;
const cancelDeleteWsBtn = document.getElementById('cancelDeleteWsBtn') as HTMLButtonElement;

// Backups elements
const createBackupBtn = document.getElementById('createBackupBtn') as HTMLButtonElement;
const backupIntervalSelect = document.getElementById('backupIntervalSelect') as HTMLSelectElement;
const backupRetentionInput = document.getElementById('backupRetentionInput') as HTMLInputElement;
const saveBackupConfigBtn = document.getElementById('saveBackupConfigBtn') as HTMLButtonElement;
const backupsCountBadge = document.getElementById('backupsCountBadge') as HTMLElement;
const backupsList = document.getElementById('backupsList') as HTMLElement;

// Explorer elements
const backupExplorer = document.getElementById('backupExplorer') as HTMLElement;
const closeExplorerBtn = document.getElementById('closeExplorerBtn') as HTMLButtonElement;
const explorerSnapshotName = document.getElementById('explorerSnapshotName') as HTMLElement;
const explorerSnapshotDate = document.getElementById('explorerSnapshotDate') as HTMLElement;
const explorerContent = document.getElementById('explorerContent') as HTMLElement;

// Import / Export elements
const exportStgBtn = document.getElementById('exportStgBtn') as HTMLButtonElement;
const exportBadge = document.getElementById('exportBadge') as HTMLElement;
const stgFileInput = document.getElementById('stgFileInput') as HTMLInputElement;
const stgDropZone = document.getElementById('stgDropZone') as HTMLElement;
const dropZoneText = document.getElementById('dropZoneText') as HTMLElement;
const importPreviewCard = document.getElementById('importPreviewCard') as HTMLElement;
const previewFileName = document.getElementById('previewFileName') as HTMLElement;
const previewVersionBadge = document.getElementById('previewVersionBadge') as HTMLElement;
const previewWsCount = document.getElementById('previewWsCount') as HTMLElement;
const previewPinnedCount = document.getElementById('previewPinnedCount') as HTMLElement;
const previewTabsCount = document.getElementById('previewTabsCount') as HTMLElement;
const previewGroupsChips = document.getElementById('previewGroupsChips') as HTMLElement;
const executeImportBtn = document.getElementById('executeImportBtn') as HTMLButtonElement;
const importFeedbackMsg = document.getElementById('importFeedbackMsg') as HTMLElement;

// Restore Loading Screen Overlay Elements
const restoreLoadingOverlay = document.getElementById('restoreLoadingOverlay') as HTMLElement;
const restoreIconCenter = document.getElementById('restoreIconCenter') as HTMLElement;
const restoreLoadingTitle = document.getElementById('restoreLoadingTitle') as HTMLElement;
const restoreLoadingStatus = document.getElementById('restoreLoadingStatus') as HTMLElement;
const restoreProgressBar = document.getElementById('restoreProgressBar') as HTMLElement;
const restoreLoadingDetail = document.getElementById('restoreLoadingDetail') as HTMLElement;
const restoreCompletedActions = document.getElementById('restoreCompletedActions') as HTMLElement;
const restoreDoneBtn = document.getElementById('restoreDoneBtn') as HTMLButtonElement;

function showRestoreLoadingScreen(title: string, status: string, detail?: string): void {
  restoreLoadingTitle.textContent = title;
  restoreLoadingStatus.textContent = status;
  if (detail) {
    restoreLoadingDetail.textContent = detail;
  }
  restoreIconCenter.className = 'restore-icon-center';
  restoreIconCenter.style.background = '';
  restoreIconCenter.innerHTML = `
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
      <polyline points="7 10 12 15 17 10"></polyline>
      <line x1="12" y1="15" x2="12" y2="3"></line>
    </svg>`;
  restoreProgressBar.className = 'restore-progress-bar indeterminate';
  restoreProgressBar.style.background = '';
  restoreProgressBar.style.width = '';
  restoreCompletedActions.classList.add('hidden');
  restoreLoadingOverlay.classList.remove('hidden');
}

function completeRestoreLoadingScreen(title: string, status: string, detail?: string, onDone?: () => void): void {
  restoreLoadingTitle.textContent = title;
  restoreLoadingStatus.textContent = status;
  if (detail) {
    restoreLoadingDetail.textContent = detail;
  }
  restoreIconCenter.className = 'restore-icon-center success';
  restoreIconCenter.innerHTML = `
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#7bd88f" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>`;
  restoreProgressBar.className = 'restore-progress-bar success';
  restoreCompletedActions.classList.remove('hidden');
  restoreDoneBtn.textContent = 'Go to Workspaces';

  let handled = false;
  const handleDone = () => {
    if (handled) return;
    handled = true;
    restoreLoadingOverlay.classList.add('hidden');
    if (onDone) onDone();
  };

  restoreDoneBtn.onclick = handleDone;

  // Automatically transition after 2 seconds if user does not click
  setTimeout(() => {
    if (!restoreLoadingOverlay.classList.contains('hidden')) {
      handleDone();
    }
  }, 2200);
}

function failRestoreLoadingScreen(title: string, errorMsg: string): void {
  restoreLoadingTitle.textContent = title;
  restoreLoadingStatus.textContent = errorMsg;
  restoreLoadingDetail.textContent = 'Please check your connection and debug logs for details.';
  restoreIconCenter.className = 'restore-icon-center';
  restoreIconCenter.style.background = 'rgba(255, 180, 171, 0.2)';
  restoreIconCenter.innerHTML = `
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ffb4ab" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="15" y1="9" x2="9" y2="15"></line>
      <line x1="9" y1="9" x2="15" y2="15"></line>
    </svg>`;
  restoreProgressBar.className = 'restore-progress-bar';
  restoreProgressBar.style.background = '#ffb4ab';
  restoreProgressBar.style.width = '100%';
  restoreCompletedActions.classList.remove('hidden');
  restoreDoneBtn.textContent = 'Dismiss';
  restoreDoneBtn.onclick = () => {
    restoreLoadingOverlay.classList.add('hidden');
  };
}

async function executeRestoreWithLoadingScreen(backupId: string, label: string): Promise<void> {
  showRestoreLoadingScreen(
    'Restoring Workspaces & Tabs',
    `Applying ${label}...`,
    'Materializing tabs in suspended state to ensure zero RAM exhaustion. SynapseTab will remain in foreground.'
  );

  try {
    const res = await browser.runtime.sendMessage({
      type: 'RESTORE_BACKUP',
      backupId,
    });
    if (res?.error) {
      throw new Error(res.error);
    }
    await refreshState();
    completeRestoreLoadingScreen(
      'Backup Restored Successfully!',
      'All workspaces and tabs are now synchronized.',
      'Tabs have been restored in suspended state and are ready to use.',
      async () => {
        await switchSection('workspaces');
        await refreshState();
      }
    );
  } catch (err: any) {
    failRestoreLoadingScreen('Restore Failed', err.message || 'An error occurred during restore.');
  }
}

async function executeStgImportWithLoadingScreen(
  stgData: string,
  mode: 'replace' | 'merge',
  info: { groupCount: number; tabCount: number; pinnedCount: number }
): Promise<void> {
  showRestoreLoadingScreen(
    'Importing Workspaces & Tabs',
    `Restoring ${info.groupCount} workspaces and ${info.tabCount + info.pinnedCount} tabs (${mode} mode)...`,
    'Materializing tabs in suspended state. SynapseTab will remain in foreground.'
  );

  try {
    const res = await browser.runtime.sendMessage({
      type: 'IMPORT_STG',
      stgData,
      mode,
    });
    if (res?.error) {
      throw new Error(res.error);
    }
    await refreshState();
    completeRestoreLoadingScreen(
      'Import Completed Successfully!',
      `Restored ${res.workspacesCount} workspaces and ${res.tabsCount + res.pinnedCount} tabs.`,
      'Clean state has been synchronized and persisted.',
      async () => {
        await switchSection('workspaces');
        await refreshState();
      }
    );
  } catch (err: any) {
    failRestoreLoadingScreen('Import Failed', err.message || 'Failed to import backup.');
  }
}

// Debug Page Elements
const openDebugFromSettingsBtn = document.getElementById('openDebugFromSettingsBtn') as HTMLButtonElement | null;
const refreshDebugBtn = document.getElementById('refreshDebugBtn') as HTMLButtonElement;
const copyDebugLogsBtn = document.getElementById('copyDebugLogsBtn') as HTMLButtonElement;
const clearDebugLogsBtn = document.getElementById('clearDebugLogsBtn') as HTMLButtonElement;
const debugSyncVersion = document.getElementById('debugSyncVersion') as HTMLElement;
const debugSyncState = document.getElementById('debugSyncState') as HTMLElement;
const debugLocalChanges = document.getElementById('debugLocalChanges') as HTMLElement;
const debugInitialSync = document.getElementById('debugInitialSync') as HTMLElement;
const debugServerStatus = document.getElementById('debugServerStatus') as HTMLElement;
const debugServerUrl = document.getElementById('debugServerUrl') as HTMLElement;
const debugTabsCount = document.getElementById('debugTabsCount') as HTMLElement;
const debugUptime = document.getElementById('debugUptime') as HTMLElement;
const countAllLogs = document.getElementById('countAllLogs') as HTMLElement;
const countErrorLogs = document.getElementById('countErrorLogs') as HTMLElement;
const countWarnLogs = document.getElementById('countWarnLogs') as HTMLElement;
const countSyncLogs = document.getElementById('countSyncLogs') as HTMLElement;
const countInfoLogs = document.getElementById('countInfoLogs') as HTMLElement;
const debugSearchInput = document.getElementById('debugSearchInput') as HTMLInputElement;
const debugLiveAutoRefresh = document.getElementById('debugLiveAutoRefresh') as HTMLInputElement;
const debugShowingCount = document.getElementById('debugShowingCount') as HTMLElement;
const debugCopyFeedback = document.getElementById('debugCopyFeedback') as HTMLElement;
const debugLogsContainer = document.getElementById('debugLogsContainer') as HTMLElement;

// Settings inputs
const settingBackendUrl = document.getElementById('settingBackendUrl') as HTMLInputElement;
const settingSyncSecret = document.getElementById('settingSyncSecret') as HTMLInputElement;
const settingUserId = document.getElementById('settingUserId') as HTMLInputElement;
const settingClientId = document.getElementById('settingClientId') as HTMLInputElement;
const saveSettingsBtn = document.getElementById('saveSettingsBtn') as HTMLButtonElement;
const testConnectionBtn = document.getElementById('testConnectionBtn') as HTMLButtonElement;
const settingsFeedbackMsg = document.getElementById('settingsFeedbackMsg') as HTMLElement;

/**
 * Updates the sync status badge in the header.
 */
function renderSyncStatus(status: SyncStatus): void {
  statusBadge.className = `status-badge ${status.state}`;

  switch (status.state) {
    case 'synced':
      statusLabel.textContent = 'Synced';
      break;
    case 'pending':
      statusLabel.textContent = 'Pending';
      break;
    case 'syncing':
      statusLabel.textContent = 'Syncing...';
      break;
    case 'error':
      statusLabel.textContent = 'Sync Error';
      break;
    default:
      statusLabel.textContent = 'Ready';
      break;
  }

  if (status.lastSyncTime) {
    const elapsedSec = Math.floor((Date.now() - status.lastSyncTime) / 1000);
    if (elapsedSec < 10) {
      lastSyncedText.textContent = 'Synced just now';
    } else if (elapsedSec < 60) {
      lastSyncedText.textContent = `Synced ${elapsedSec}s ago`;
    } else {
      const mins = Math.floor(elapsedSec / 60);
      lastSyncedText.textContent = `Synced ${mins}m ago`;
    }
  } else {
    lastSyncedText.textContent = 'Not yet synced';
  }
}

export type NavSection =
  | 'workspaces'
  | 'backups'
  | 'importExport'
  | 'settings'
  | 'customization'
  | 'information'
  | 'destroy'
  | 'debug';

/**
 * Switches the active section in full-page mode.
 */
async function switchSection(section: NavSection): Promise<void> {
  workspacesSection.classList.add('hidden');
  backupsSection.classList.add('hidden');
  importExportSection.classList.add('hidden');
  settingsSection.classList.add('hidden');
  customizationSection?.classList.add('hidden');
  debugSection.classList.add('hidden');
  informationSection?.classList.add('hidden');
  destroySection?.classList.add('hidden');

  navWorkspaces?.classList.remove('active');
  navBackups?.classList.remove('active');
  navImportExport?.classList.remove('active');
  navSettings?.classList.remove('active');
  navCustomization?.classList.remove('active');
  navDebug?.classList.remove('active');
  navInformation?.classList.remove('active');
  navDestroy?.classList.remove('active');

  if (section !== 'debug' && debugLiveTimer) {
    clearInterval(debugLiveTimer);
    debugLiveTimer = null;
  }

  switch (section) {
    case 'workspaces':
      workspacesSection.classList.remove('hidden');
      navWorkspaces?.classList.add('active');
      await refreshState();
      break;
    case 'backups':
      backupsSection.classList.remove('hidden');
      navBackups?.classList.add('active');
      await loadAndRenderBackups();
      break;
    case 'importExport':
      importExportSection.classList.remove('hidden');
      navImportExport?.classList.add('active');
      break;
    case 'settings':
      settingsSection.classList.remove('hidden');
      navSettings?.classList.add('active');
      await loadAndDisplaySettings();
      break;
    case 'customization':
      customizationSection?.classList.remove('hidden');
      navCustomization?.classList.add('active');
      await loadAndDisplayCustomization();
      break;
    case 'debug':
      debugSection.classList.remove('hidden');
      navDebug?.classList.add('active');
      await loadAndRenderDebugData();
      startDebugLiveTimer();
      break;
    case 'information':
      informationSection?.classList.remove('hidden');
      navInformation?.classList.add('active');
      await loadAndDisplayInformation();
      break;
    case 'destroy':
      destroySection?.classList.remove('hidden');
      navDestroy?.classList.add('active');
      initDestroySection();
      break;
      break;
  }
}

/**
 * Loads settings from storage and populates inputs.
 */
async function loadAndDisplaySettings(): Promise<void> {
  const data = await browser.storage.local.get('settings');
  currentSettings = data.settings || {
    backendUrl: 'http://localhost:8080',
    syncSecret: 'synapse_dev_secret_123',
    userId: 'default',
    clientId: 'laptop-firefox-01',
    pollIntervalSeconds: 15,
    debounceDelayMs: 3000,
  };

  settingBackendUrl.value = currentSettings.backendUrl;
  settingSyncSecret.value = currentSettings.syncSecret;
  settingUserId.value = currentSettings.userId || 'default';
  settingClientId.value = currentSettings.clientId;
}

/**
 * Loads customization settings from storage and populates inputs.
 */
async function loadAndDisplayCustomization(): Promise<void> {
  const data = await browser.storage.local.get('settings');
  const delay = typeof data?.settings?.debounceDelayMs === 'number'
    ? data.settings.debounceDelayMs
    : 3000;

  if (settingDebounceDelay) {
    settingDebounceDelay.value = String(delay);
  }
  updatePresetChipsState(delay);
  if (customizationFeedbackMsg) {
    customizationFeedbackMsg.className = 'import-feedback hidden';
  }
}

function updatePresetChipsState(currentDelay: number): void {
  const chips = document.querySelectorAll<HTMLButtonElement>('#customizationSection .preset-chip');
  chips.forEach((chip) => {
    const val = parseInt(chip.getAttribute('data-delay') || '0', 10);
    if (val === currentDelay) {
      chip.classList.add('active');
    } else {
      chip.classList.remove('active');
    }
  });
}

/**
 * Loads information about the extension runtime and manifest.
 */
async function loadAndDisplayInformation(): Promise<void> {
  try {
    const manifest = browser.runtime.getManifest();
    const version = manifest.version || '1.4.0';
    if (infoVersionBadge) infoVersionBadge.textContent = `v${version}`;
    if (infoExtensionVersion) infoExtensionVersion.textContent = version;
    if (infoPlatformEngine) {
      infoPlatformEngine.textContent = navigator.userAgent.includes('Firefox')
        ? 'Mozilla Firefox'
        : 'Gecko / WebExtension';
    }
  } catch {
    // Keep defaults
  }
}

/**
 * Resets the destroy confirmation section state.
 */
function initDestroySection(): void {
  if (confirmDestroyCheckbox) {
    confirmDestroyCheckbox.checked = false;
  }
  if (executeDestroyBtn) {
    executeDestroyBtn.disabled = true;
  }
  if (destroyFeedbackMsg) {
    destroyFeedbackMsg.className = 'import-feedback hidden';
  }
}

/**
 * Queries the state and updates workspaces, tabs, and pinned tabs UI.
 */
async function refreshState(): Promise<void> {
  const data = await browser.storage.local.get(['workspaces', 'active_workspace_id', 'sync_status']);

  const storedWorkspaces: { id: string; name: string }[] = data.workspaces || [{ id: 'default', name: 'Main' }];
  activeWorkspaceId = data.active_workspace_id || 'default';

  if (data.sync_status) {
    renderSyncStatus(data.sync_status);
  }

  // Get current tabs in window
  const tabs = await browser.tabs.query({ currentWindow: true });

  // Pinned tabs handling
  const pinnedTabs = tabs.filter((t) => t.pinned);
  renderPinnedTabs(pinnedTabs);

  // Map tabs to workspaces (excluding pinned tabs from regular count)
  const wsMap = new Map<string, any[]>();
  for (const ws of storedWorkspaces) {
    wsMap.set(ws.id, []);
  }

  for (const tab of tabs) {
    if (tab.id === undefined) continue;
    let wsId = activeWorkspaceId;
    try {
      const storedWs = await browser.sessions.getTabValue(tab.id, 'workspace_id');
      if (typeof storedWs === 'string') {
        wsId = storedWs;
      }
    } catch {
      // Ignored
    }

    if (!tab.pinned) {
      const list = wsMap.get(wsId);
      if (list) {
        list.push(tab);
      } else {
        const defaultList = wsMap.get(storedWorkspaces[0]?.id || 'default');
        defaultList?.push(tab);
      }
    }
  }

  // Render Workspaces List
  currentWorkspaces = storedWorkspaces.map((ws: any) => ({
    id: ws.id,
    name: ws.name,
    customType: ws.customType,
    customValue: ws.customValue,
    color: ws.color,
    icon: ws.icon,
    tabs: (wsMap.get(ws.id) || []).map((t, idx) => ({
      uuid: '',
      url: t.url || '',
      title: t.title || '',
      favIconUrl: t.favIconUrl || undefined,
      pinned: t.pinned || false,
      active: t.active || false,
      index: t.index ?? idx,
      localTabId: t.id,
    })),
  }));

  renderWorkspacesList(currentWorkspaces, activeWorkspaceId);

  // Render Active Workspace Tabs
  const currentWs = currentWorkspaces.find((w) => w.id === activeWorkspaceId);
  activeWorkspaceTitle.textContent = currentWs ? `Tabs in ${currentWs.name}` : 'Active Tabs';
  const activeTabs = currentWs ? currentWs.tabs : [];
  tabCountBadge.textContent = `${activeTabs.length} tab${activeTabs.length === 1 ? '' : 's'}`;
  renderTabsList(activeTabs, currentWorkspaces);
}

/**
 * Renders global pinned tabs.
 */
function renderPinnedTabs(pinnedTabs: browser.tabs.Tab[]): void {
  pinnedTabsList.replaceChildren();

  if (pinnedTabs.length === 0) {
    pinnedSectionWrapper.classList.add('hidden');
    return;
  }

  pinnedSectionWrapper.classList.remove('hidden');
  pinnedCountBadge.textContent = `${pinnedTabs.length} pinned`;

  for (const tab of pinnedTabs) {
    const row = document.createElement('div');
    row.className = 'tab-row';

    const info = document.createElement('div');
    info.className = 'tab-info';

    const img = document.createElement('img');
    img.className = 'tab-favicon';
    img.src = tab.favIconUrl || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%2394a3b8" stroke-width="2"><circle cx="12" cy="12" r="10"></circle></svg>';
    img.onerror = () => {
      img.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%2394a3b8" stroke-width="2"><circle cx="12" cy="12" r="10"></circle></svg>';
    };

    const title = document.createElement('span');
    title.className = 'tab-title-text';
    title.textContent = tab.title || tab.url || 'Pinned Tab';
    title.title = tab.url || '';

    info.appendChild(img);
    info.appendChild(title);

    info.addEventListener('click', async () => {
      if (tab.id !== undefined) {
        await browser.tabs.update(tab.id, { active: true });
        window.close();
      }
    });

    const actions = document.createElement('div');
    actions.className = 'tab-actions';

    // Unpin button
    const unpinBtn = document.createElement('button');
    unpinBtn.className = 'tab-pin-btn pinned';
    unpinBtn.title = 'Unpin tab';
    unpinBtn.innerHTML = '📌';
    unpinBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (tab.id !== undefined) {
        await browser.runtime.sendMessage({
          type: 'TOGGLE_PIN_TAB',
          tabId: tab.id,
        });
        await refreshState();
      }
    });

    actions.appendChild(unpinBtn);
    row.appendChild(info);
    row.appendChild(actions);
    pinnedTabsList.appendChild(row);
  }
}

/**
 * Generates an M3 badge element for a workspace based on its customization settings.
 */
function createWorkspaceBadge(ws: Workspace): HTMLElement {
  const badge = document.createElement('span');
  const customType = ws.customType || (ws.icon ? 'emoji' : ws.color ? 'color' : 'default');
  const color = ws.color || '#d0bcff';

  if (customType === 'emoji') {
    badge.className = 'ws-badge ws-badge-emoji';
    badge.textContent = ws.customValue || ws.icon || '🚀';
    if (ws.color) {
      badge.style.backgroundColor = `${color}25`;
      badge.style.border = `1px solid ${color}60`;
    }
  } else if (customType === 'text') {
    badge.className = 'ws-badge ws-badge-text';
    const tag = (ws.customValue || ws.name.slice(0, 3) || 'WS').slice(0, 3).toUpperCase();
    badge.textContent = tag;
    badge.style.backgroundColor = color;
    badge.style.color = getContrastingTextColor(color);
  } else if (customType === 'color') {
    badge.className = 'ws-badge ws-badge-color';
    badge.style.backgroundColor = color;
  } else {
    badge.className = 'ws-badge ws-badge-default';
    badge.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2z"></path></svg>`;
    if (ws.color) {
      badge.style.color = color;
      badge.style.border = `1px solid ${color}50`;
    }
  }
  return badge;
}

/**
 * Updates the live preview in the workspace edit modal.
 */
function updateModalPreview(): void {
  const name = wsEditNameInput.value.trim() || (editingWorkspace ? editingWorkspace.name : 'Workspace Name');
  wsPreviewName.textContent = name;

  // Reset preview badge element
  wsPreviewBadge.className = 'ws-badge';
  wsPreviewBadge.textContent = '';
  wsPreviewBadge.innerHTML = '';
  wsPreviewBadge.style.backgroundColor = '';
  wsPreviewBadge.style.border = '';
  wsPreviewBadge.style.color = '';

  const color = currentEditColor || '#d0bcff';

  if (currentEditType === 'emoji') {
    wsPreviewBadge.classList.add('ws-badge-emoji');
    wsPreviewBadge.textContent = wsEmojiInput.value.trim() || currentEditValue || '🚀';
    if (currentEditColor) {
      wsPreviewBadge.style.backgroundColor = `${color}25`;
      wsPreviewBadge.style.border = `1px solid ${color}60`;
    }
  } else if (currentEditType === 'text') {
    wsPreviewBadge.classList.add('ws-badge-text');
    const tag = (wsTagInput.value.trim().slice(0, 3) || name.slice(0, 3) || 'TAG').toUpperCase();
    wsPreviewBadge.textContent = tag;
    wsPreviewBadge.style.backgroundColor = color;
    wsPreviewBadge.style.color = getContrastingTextColor(color);
  } else if (currentEditType === 'color') {
    wsPreviewBadge.classList.add('ws-badge-color');
    wsPreviewBadge.style.backgroundColor = color;
  } else {
    wsPreviewBadge.classList.add('ws-badge-default');
    wsPreviewBadge.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2z"></path></svg>`;
    if (currentEditColor) {
      wsPreviewBadge.style.color = color;
      wsPreviewBadge.style.border = `1px solid ${color}50`;
    }
  }
}

/**
 * Switches the active visual customization type in the modal.
 */
function setModalCustomType(type: WorkspaceCustomType): void {
  currentEditType = type;

  // Update segment buttons active state
  const segmentBtns = wsTypeSegments.querySelectorAll('.segment-btn');
  segmentBtns.forEach((btn) => {
    if (btn.getAttribute('data-type') === type) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Toggle visible sections based on selected customization type
  wsEmojiSection.classList.add('hidden');
  wsTextSection.classList.add('hidden');

  if (type === 'emoji') {
    wsEmojiSection.classList.remove('hidden');
    if (!wsEmojiInput.value) {
      wsEmojiInput.value = currentEditValue || '🚀';
    }
    currentEditValue = wsEmojiInput.value;
  } else if (type === 'text') {
    wsTextSection.classList.remove('hidden');
    if (!wsTagInput.value || wsTagInput.value.length > 3) {
      wsTagInput.value = (wsEditNameInput.value.slice(0, 3) || 'WS').toUpperCase();
    }
    currentEditValue = wsTagInput.value;
  }

  // The color selector is always shown after other fields for customization options
  // (emoji, 3-char tag, and color only) so color remains editable across styles.
  if (type === 'default') {
    wsColorSection.classList.add('hidden');
  } else {
    wsColorSection.classList.remove('hidden');
  }

  updateModalPreview();
}

/**
 * Opens the workspace edit & configuration modal for a given workspace.
 */
function openWorkspaceEditModal(ws: Workspace, allWorkspaces: Workspace[]): void {
  editingWorkspace = ws;
  wsDeleteConfirmBox.classList.add('hidden');

  wsEditNameInput.value = ws.name;
  currentEditColor = ws.color || '#d0bcff';

  // Highlight active color swatch
  const swatches = wsColorPalette.querySelectorAll('.color-swatch');
  swatches.forEach((s) => {
    if (s.getAttribute('data-color') === currentEditColor) {
      s.classList.add('active');
    } else {
      s.classList.remove('active');
    }
  });

  // Determine initial visual type
  const type: WorkspaceCustomType = ws.customType || (ws.icon ? 'emoji' : ws.color ? 'color' : 'default');
  currentEditValue = ws.customValue || ws.icon || (type === 'text' ? ws.name.slice(0, 3).toUpperCase() : (type === 'emoji' ? '🚀' : ''));

  if (type === 'emoji') {
    wsEmojiInput.value = currentEditValue || '🚀';
  } else if (type === 'text') {
    wsTagInput.value = currentEditValue || ws.name.slice(0, 3).toUpperCase();
  }

  // Highlight active emoji in grid if matching
  const emojiVal = wsEmojiInput.value || currentEditValue;
  const emojiBtns = wsQuickEmojiGrid.querySelectorAll('.emoji-btn');
  emojiBtns.forEach((b) => {
    if (b.getAttribute('data-emoji') === emojiVal) {
      b.classList.add('active');
    } else {
      b.classList.remove('active');
    }
  });

  setModalCustomType(type);

  // Disable delete button if only 1 workspace exists
  if (allWorkspaces.length <= 1) {
    promptDeleteWsBtn.disabled = true;
    promptDeleteWsBtn.title = 'Cannot delete the only remaining workspace';
    promptDeleteWsBtn.style.opacity = '0.35';
  } else {
    promptDeleteWsBtn.disabled = false;
    promptDeleteWsBtn.title = 'Delete workspace';
    promptDeleteWsBtn.style.opacity = '1';
  }

  wsEditModal.classList.remove('hidden');
  wsEditNameInput.focus();
}

/**
 * Closes the workspace edit modal.
 */
function closeWorkspaceEditModal(): void {
  wsEditModal.classList.add('hidden');
  editingWorkspace = null;
}

/**
 * Renders the workspaces list with visual customization badges and an edit button.
 */
function renderWorkspacesList(workspaces: Workspace[], activeId: string): void {
  workspacesList.replaceChildren();

  for (const ws of workspaces) {
    const item = document.createElement('div');
    item.className = `workspace-item ${ws.id === activeId ? 'active' : ''}`;

    const info = document.createElement('div');
    info.className = 'workspace-info';

    // 1. Workspace custom badge
    const badge = createWorkspaceBadge(ws);
    info.appendChild(badge);

    // 2. Workspace name
    const name = document.createElement('span');
    name.className = 'ws-name';
    name.textContent = ws.name;
    info.appendChild(name);

    // 3. Tabs count badge
    const count = document.createElement('span');
    count.className = 'ws-tabs-count';
    const tabCount = ws.tabs ? ws.tabs.length : 0;
    count.textContent = `(${tabCount})`;
    info.appendChild(count);

    item.appendChild(info);

    // Click on item switches workspace
    item.addEventListener('click', async () => {
      if (ws.id !== activeId) {
        await browser.runtime.sendMessage({
          type: 'SWITCH_WORKSPACE',
          workspaceId: ws.id,
        });
        await refreshState();
      }
    });

    // 4. Edit action icon button
    const actions = document.createElement('div');
    actions.className = 'ws-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'ws-edit-btn';
    editBtn.title = `Configure workspace "${ws.name}"`;
    editBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`;

    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openWorkspaceEditModal(ws, workspaces);
    });

    actions.appendChild(editBtn);
    item.appendChild(actions);

    workspacesList.appendChild(item);
  }
}

/**
 * Renders active tabs in current workspace as clean clickable list items (without action buttons).
 */
function renderTabsList(tabs: any[], _allWorkspaces: Workspace[]): void {
  tabsList.replaceChildren();

  if (tabs.length === 0) {
    const empty = document.createElement('div');
    empty.style.padding = '12px';
    empty.style.textAlign = 'center';
    empty.style.color = 'var(--text-muted)';
    empty.textContent = 'No open tabs in this workspace.';
    tabsList.appendChild(empty);
    return;
  }

  for (const tab of tabs) {
    const row = document.createElement('div');
    row.className = 'tab-row';
    row.style.cursor = 'pointer';

    const info = document.createElement('div');
    info.className = 'tab-info';

    const img = document.createElement('img');
    img.className = 'tab-favicon';
    img.src = tab.favIconUrl || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%2394a3b8" stroke-width="2"><circle cx="12" cy="12" r="10"></circle></svg>';
    img.onerror = () => {
      img.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%2394a3b8" stroke-width="2"><circle cx="12" cy="12" r="10"></circle></svg>';
    };

    const title = document.createElement('span');
    title.className = 'tab-title-text';
    title.textContent = tab.title || tab.url || 'Tab';
    title.title = tab.url;

    info.appendChild(img);
    info.appendChild(title);
    row.appendChild(info);

    row.addEventListener('click', async () => {
      if (tab.localTabId !== undefined) {
        await browser.tabs.update(tab.localTabId, { active: true });
        window.close();
      }
    });

    tabsList.appendChild(row);
  }
}

/**
 * Loads backups from server and renders list & policy values.
 */
async function loadAndRenderBackups(): Promise<void> {
  backupsList.replaceChildren();
  const loading = document.createElement('div');
  loading.style.padding = '12px';
  loading.style.textAlign = 'center';
  loading.style.color = 'var(--text-muted)';
  loading.textContent = 'Loading backups from server...';
  backupsList.appendChild(loading);

  try {
    const res: BackupListResponse = await browser.runtime.sendMessage({ type: 'LIST_BACKUPS' });
    const backups: BackupMetadata[] = res.backups || [];
    const config: BackupConfig = res.config || { interval: 'hourly', retentionCopies: 10 };

    backupIntervalSelect.value = config.interval;
    backupRetentionInput.value = String(config.retentionCopies);
    backupsCountBadge.textContent = `${backups.length} cop${backups.length === 1 ? 'y' : 'ies'}`;

    backupsList.replaceChildren();

    if (backups.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.style.padding = '14px';
      emptyMsg.style.textAlign = 'center';
      emptyMsg.style.color = 'var(--text-muted)';
      emptyMsg.textContent = 'No server backups found. Click "+ Backup Now" to create one.';
      backupsList.appendChild(emptyMsg);
      return;
    }

    for (const bk of backups) {
      const card = document.createElement('div');
      card.className = 'backup-card';

      const topRow = document.createElement('div');
      topRow.className = 'backup-card-top';

      const timeEl = document.createElement('span');
      timeEl.className = 'backup-time';
      const date = new Date(bk.timestamp);
      timeEl.textContent = date.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

      const badge = document.createElement('span');
      badge.className = `backup-badge ${bk.reason}`;
      badge.textContent = bk.reason;

      topRow.appendChild(timeEl);
      topRow.appendChild(badge);

      const bodyRow = document.createElement('div');
      bodyRow.className = 'backup-card-body';

      const meta = document.createElement('div');
      meta.className = 'backup-meta';
      meta.textContent = `${bk.workspaces_count} ws • ${bk.tabs_count} tab${bk.tabs_count === 1 ? '' : 's'}`;

      const actions = document.createElement('div');
      actions.className = 'backup-actions';

      // Explore button
      const exploreBtn = document.createElement('button');
      exploreBtn.className = 'btn btn-sm btn-ghost';
      exploreBtn.textContent = 'Explore';
      exploreBtn.title = 'Inspect workspaces and tabs in this backup';
      exploreBtn.addEventListener('click', () => {
        exploreBackup(bk.id);
      });

      // Restore button
      const restoreBtn = document.createElement('button');
      restoreBtn.className = 'btn btn-sm btn-primary';
      restoreBtn.textContent = 'Restore';
      restoreBtn.title = 'Restore this snapshot to active state';
      restoreBtn.addEventListener('click', async () => {
        const formatted = date.toLocaleString();
        if (confirm(`Restore snapshot from ${formatted}? Current tabs will synchronize with this backup.`)) {
          if (!document.body.classList.contains('tab-mode')) {
            // Open full-page tab to stay in foreground and show the restore loading screen
            await browser.tabs.create({
              url: browser.runtime.getURL(`popup/index.html?mode=tab&section=backups&restoreBackupId=${encodeURIComponent(bk.id)}`),
              active: true,
            });
            window.close();
            return;
          }

          await executeRestoreWithLoadingScreen(bk.id, `Backup from ${formatted}`);
        }
      });

      // Delete button
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'btn btn-sm btn-ghost btn-danger';
      deleteBtn.innerHTML = '&times;';
      deleteBtn.title = 'Delete backup from server';
      deleteBtn.addEventListener('click', async () => {
        const formatted = date.toLocaleString();
        if (confirm(`Delete server backup from ${formatted}?`)) {
          try {
            await browser.runtime.sendMessage({
              type: 'DELETE_BACKUP',
              backupId: bk.id,
            });
            await loadAndRenderBackups();
          } catch (err: any) {
            alert(`Delete failed: ${err.message}`);
          }
        }
      });

      actions.appendChild(exploreBtn);
      actions.appendChild(restoreBtn);
      actions.appendChild(deleteBtn);

      bodyRow.appendChild(meta);
      bodyRow.appendChild(actions);

      card.appendChild(topRow);
      card.appendChild(bodyRow);
      backupsList.appendChild(card);
    }
  } catch (err: any) {
    const errorEl = document.createElement('div');
    errorEl.style.padding = '12px';
    errorEl.style.textAlign = 'center';
    errorEl.style.color = 'var(--status-red)';
    errorEl.textContent = `Failed to load backups: ${err.message}`;
    backupsList.replaceChildren(errorEl);
  }
}

/**
 * Explores a specific backup and renders tree in preview drawer.
 */
async function exploreBackup(backupId: string): Promise<void> {
  backupExplorer.classList.remove('hidden');
  const loadingEl = document.createElement('div');
  loadingEl.style.textAlign = 'center';
  loadingEl.style.padding = '8px';
  loadingEl.style.color = 'var(--text-muted)';
  loadingEl.textContent = 'Loading snapshot details...';
  explorerContent.replaceChildren(loadingEl);

  try {
    const record: BackupRecord = await browser.runtime.sendMessage({
      type: 'GET_BACKUP',
      backupId,
    });

    explorerSnapshotName.textContent = `Backup (${record.reason})`;
    explorerSnapshotDate.textContent = new Date(record.timestamp).toLocaleString();
    explorerContent.replaceChildren();

    if (!record.snapshot || !record.snapshot.workspaces || record.snapshot.workspaces.length === 0) {
      const emptyEl = document.createElement('div');
      emptyEl.style.color = 'var(--text-muted)';
      emptyEl.style.fontSize = '11px';
      emptyEl.textContent = 'Empty snapshot';
      explorerContent.appendChild(emptyEl);
      return;
    }

    for (const ws of record.snapshot.workspaces) {
      const wsGroup = document.createElement('div');
      wsGroup.className = 'explorer-ws-group';

      const title = document.createElement('div');
      title.className = 'explorer-ws-title';
      const count = ws.tabs ? ws.tabs.length : 0;
      title.textContent = `📁 ${ws.name} (${count} tab${count === 1 ? '' : 's'})`;
      wsGroup.appendChild(title);

      if (ws.tabs && ws.tabs.length > 0) {
        for (const tab of ws.tabs) {
          const tabItem = document.createElement('div');
          tabItem.className = 'explorer-tab-item';
          tabItem.textContent = tab.title || tab.url || 'Tab';
          tabItem.title = tab.url;
          wsGroup.appendChild(tabItem);
        }
      } else {
        const noTab = document.createElement('div');
        noTab.className = 'explorer-tab-item';
        noTab.style.fontStyle = 'italic';
        noTab.textContent = 'No tabs';
        wsGroup.appendChild(noTab);
      }

      explorerContent.appendChild(wsGroup);
    }
  } catch (err: any) {
    const errorEl = document.createElement('div');
    errorEl.style.color = 'var(--status-red)';
    errorEl.style.fontSize = '11px';
    errorEl.textContent = `Error loading snapshot: ${err.message}`;
    explorerContent.replaceChildren(errorEl);
  }
}

/**
 * Common processor for parsed JSON content (from file or paste).
 */
function processJsonContent(content: string, sourceName: string = 'backup.json'): void {
  importFeedbackMsg.className = 'import-feedback hidden';
  dropZoneText.textContent = sourceName;

  try {
    rawImportedJson = JSON.parse(content);
    loadedStgResult = importFromStgFormat(rawImportedJson);

    previewFileName.textContent = sourceName;
    previewVersionBadge.textContent = `STG ${loadedStgResult.version}`;
    previewWsCount.textContent = `${loadedStgResult.groupCount} workspace${loadedStgResult.groupCount === 1 ? '' : 's'}`;
    previewPinnedCount.textContent = `${loadedStgResult.pinnedCount} pinned`;
    previewTabsCount.textContent = `${loadedStgResult.tabCount} total tabs`;

    // Render group chips
    previewGroupsChips.innerHTML = '';
    for (const ws of loadedStgResult.workspaces) {
      const chip = document.createElement('span');
      chip.className = 'group-chip';
      chip.textContent = ws.name;

      const tabsCountSpan = document.createElement('span');
      tabsCountSpan.className = 'group-chip-tabs';
      tabsCountSpan.textContent = `(${ws.tabs.length})`;
      chip.appendChild(tabsCountSpan);

      previewGroupsChips.appendChild(chip);
    }

    importPreviewCard.classList.remove('hidden');
  } catch (err: any) {
    loadedStgResult = null;
    rawImportedJson = null;
    importPreviewCard.classList.add('hidden');
    importFeedbackMsg.className = 'import-feedback error';
    importFeedbackMsg.textContent = `Error parsing file: ${err.message}`;
    importFeedbackMsg.classList.remove('hidden');
  }
}

/**
 * Parses selected STG / SynapseTab JSON file and populates the preview card.
 */
async function handleFileSelected(file: File): Promise<void> {
  try {
    const content = await file.text();
    processJsonContent(content, file.name);
  } catch (err: any) {
    importFeedbackMsg.className = 'import-feedback error';
    importFeedbackMsg.textContent = `Failed to read file: ${err.message}`;
    importFeedbackMsg.classList.remove('hidden');
  }
}

// Header & Global Actions
pullNowBtn?.addEventListener('click', async () => {
  pullNowBtn.classList.add('spinning');
  try {
    const res = await browser.runtime.sendMessage({ type: 'PULL_NOW' });
    if (res && res.pulled) {
      renderSyncStatus({
        state: 'synced',
        lastSyncTime: Date.now(),
        errorMessage: null,
      });
    }
  } catch (err: any) {
    console.error('[SynapseTab Pull Error]', err);
  } finally {
    setTimeout(() => {
      pullNowBtn.classList.remove('spinning');
    }, 600);
    await refreshState();
  }
});

pushNowBtn.addEventListener('click', async () => {
  pushNowBtn.classList.add('spinning');
  renderSyncStatus({ state: 'syncing', lastSyncTime: null, errorMessage: null });

  try {
    const updatedStatus = await browser.runtime.sendMessage({ type: 'PUSH_NOW' });
    if (updatedStatus) {
      renderSyncStatus(updatedStatus);
    }
  } catch (err: any) {
    renderSyncStatus({ state: 'error', lastSyncTime: null, errorMessage: err.message });
  } finally {
    setTimeout(() => {
      pushNowBtn.classList.remove('spinning');
    }, 600);
    await refreshState();
  }
});

settingsBtn.addEventListener('click', async () => {
  if (!document.body.classList.contains('tab-mode')) {
    // Popup Mode: Open dedicated full-page tab
    await browser.tabs.create({
      url: browser.runtime.getURL('popup/index.html?mode=tab&section=settings'),
    });
    window.close();
  } else {
    // Tab Mode: Switch to settings section
    await switchSection('settings');
  }
});

// Sidebar Navigation Items
navWorkspaces?.addEventListener('click', () => switchSection('workspaces'));
navBackups?.addEventListener('click', () => switchSection('backups'));
navImportExport?.addEventListener('click', () => switchSection('importExport'));
navSettings?.addEventListener('click', () => switchSection('settings'));
navCustomization?.addEventListener('click', () => switchSection('customization'));
navDebug?.addEventListener('click', () => switchSection('debug'));
navInformation?.addEventListener('click', () => switchSection('information'));
navDestroy?.addEventListener('click', () => switchSection('destroy'));
openDebugFromSettingsBtn?.addEventListener('click', () => switchSection('debug'));

// Explorer Close
closeExplorerBtn.addEventListener('click', () => {
  backupExplorer.classList.add('hidden');
});

// Export STG JSON Action
exportStgBtn.addEventListener('click', async () => {
  exportStgBtn.disabled = true;
  exportStgBtn.textContent = 'Generating export...';

  try {
    const stgData = await browser.runtime.sendMessage({ type: 'EXPORT_STG' });
    const jsonStr = JSON.stringify(stgData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
    const filename = `synapsetab-stg-backup-${dateStr}_${timeStr}.json`;

    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.download = filename;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    URL.revokeObjectURL(url);

    exportBadge.textContent = 'Downloaded!';
    setTimeout(() => {
      exportBadge.textContent = 'Ready';
    }, 3000);
  } catch (err: any) {
    alert(`Export failed: ${err.message}`);
  } finally {
    exportStgBtn.disabled = false;
    exportStgBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
      </svg>
      Export JSON File
    `;
  }
});

// Import STG File Input & Drag and Drop
stgFileInput.addEventListener('change', (e) => {
  const target = e.target as HTMLInputElement;
  if (target.files && target.files.length > 0) {
    handleFileSelected(target.files[0]);
    target.value = '';
  }
});

stgDropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  stgDropZone.classList.add('dragover');
});

stgDropZone.addEventListener('dragleave', () => {
  stgDropZone.classList.remove('dragover');
});

stgDropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  stgDropZone.classList.remove('dragover');
  if (e.dataTransfer && e.dataTransfer.files.length > 0) {
    handleFileSelected(e.dataTransfer.files[0]);
  } else if (e.dataTransfer) {
    const text = e.dataTransfer.getData('text');
    if (text) {
      processJsonContent(text, 'dropped-data.json');
    }
  }
});

// ==========================================================================
// Debug & Diagnostics Subsystem
// ==========================================================================
let allDebugLogs: DebugLogEntry[] = [];
let currentDebugFilter: 'all' | 'error' | 'warn' | 'sync' | 'info' = 'all';
let debugLiveTimer: ReturnType<typeof setInterval> | null = null;

function startDebugLiveTimer(): void {
  if (debugLiveTimer) clearInterval(debugLiveTimer);
  if (debugLiveAutoRefresh && debugLiveAutoRefresh.checked) {
    debugLiveTimer = setInterval(async () => {
      if (!debugSection.classList.contains('hidden')) {
        await loadAndRenderDebugData(true);
      }
    }, 3000);
  }
}

async function loadAndRenderDebugData(isLiveUpdate: boolean = false): Promise<void> {
  try {
    const res: DebugDataResponse = await browser.runtime.sendMessage({ type: 'GET_DEBUG_DATA' });
    if (!res) return;

    allDebugLogs = res.logs || [];
    const diag = res.diagnostics;

    if (diag) {
      const ver = diag.localVersionState?.version ?? 0;
      const state = diag.status?.state ?? 'idle';
      debugSyncVersion.textContent = `v${ver} (${state.toUpperCase()})`;
      debugSyncState.textContent = diag.status?.errorMessage
        ? `Error: ${diag.status.errorMessage}`
        : `State: ${state} • Last: ${diag.status?.lastSyncTime ? new Date(diag.status.lastSyncTime).toLocaleTimeString() : 'never'}`;

      const hasChanges = diag.localVersionState?.hasLocalChanges;
      debugLocalChanges.textContent = hasChanges ? '⚠️ Pending Changes' : 'Clean';
      debugLocalChanges.style.color = hasChanges ? '#fbbf24' : '#4ade80';
      debugInitialSync.textContent = `Initial sync: ${diag.localVersionState?.initialSyncCompleted ? 'completed' : 'pending'}`;

      debugServerUrl.textContent = diag.settings?.backendUrl || 'None';
      debugTabsCount.textContent = `${diag.workspacesCount} ws / ${diag.tabsCount} tabs`;
      const hrs = Math.floor(diag.uptimeSeconds / 3600);
      const mins = Math.floor((diag.uptimeSeconds % 3600) / 60);
      const secs = diag.uptimeSeconds % 60;
      debugUptime.textContent = `Uptime: ${hrs > 0 ? `${hrs}h ` : ''}${mins}m ${secs}s`;

      if (!isLiveUpdate) {
        debugServerStatus.textContent = 'Testing...';
        SynapseApiClient.testConnection(diag.settings.backendUrl, diag.settings.syncSecret)
          .then((testRes) => {
            if (testRes.ok) {
              debugServerStatus.textContent = `Connected (${testRes.latencyMs}ms)`;
              debugServerStatus.style.color = '#4ade80';
            } else {
              debugServerStatus.textContent = 'Degraded / Error';
              debugServerStatus.style.color = '#f87171';
            }
          })
          .catch(() => {
            debugServerStatus.textContent = 'Offline';
            debugServerStatus.style.color = '#f87171';
          });
      }
    }

    const errCount = allDebugLogs.filter((l) => l.level === 'error').length;
    const warnCount = allDebugLogs.filter((l) => l.level === 'warn').length;
    const syncCount = allDebugLogs.filter((l) => l.level === 'sync').length;
    const infoCount = allDebugLogs.filter((l) => l.level === 'info').length;

    countAllLogs.textContent = String(allDebugLogs.length);
    countErrorLogs.textContent = String(errCount);
    countWarnLogs.textContent = String(warnCount);
    countSyncLogs.textContent = String(syncCount);
    countInfoLogs.textContent = String(infoCount);

    renderDebugLogs();
  } catch (err: any) {
    console.error('Failed to load debug data:', err);
  }
}

function renderDebugLogs(): void {
  const searchTerm = debugSearchInput.value.trim().toLowerCase();

  const filtered = allDebugLogs.filter((entry) => {
    if (currentDebugFilter !== 'all' && entry.level !== currentDebugFilter) {
      return false;
    }
    if (searchTerm) {
      const matchMsg = entry.message.toLowerCase().includes(searchTerm);
      const matchCat = entry.category.toLowerCase().includes(searchTerm);
      const matchDetails = entry.details ? entry.details.toLowerCase().includes(searchTerm) : false;
      return matchMsg || matchCat || matchDetails;
    }
    return true;
  });

  debugShowingCount.textContent = String(filtered.length);
  debugLogsContainer.innerHTML = '';

  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'debug-empty-state';
    empty.textContent = allDebugLogs.length === 0
      ? 'No logs captured yet. Tab activity and sync events will appear here.'
      : 'No logs match the current filter or search criteria.';
    debugLogsContainer.appendChild(empty);
    return;
  }

  const reversed = [...filtered].reverse();

  for (const entry of reversed) {
    const row = document.createElement('div');
    row.className = 'debug-log-line';

    const header = document.createElement('div');
    header.className = 'debug-log-header';

    const time = document.createElement('span');
    time.className = 'debug-log-time';
    const d = new Date(entry.timestamp);
    const ms = String(d.getMilliseconds()).padStart(3, '0');
    time.textContent = `${d.toTimeString().slice(0, 8)}.${ms}`;

    const badge = document.createElement('span');
    badge.className = `debug-log-badge debug-badge-${entry.level}`;
    badge.textContent = entry.level;

    const cat = document.createElement('span');
    cat.className = 'debug-log-cat';
    cat.textContent = `[${entry.category}]`;

    // Extract tabCountChange if present in details
    let tabCountChip: HTMLElement | null = null;
    if (entry.details) {
      try {
        const parsed = JSON.parse(entry.details);
        if (parsed && parsed.tabCountChange && typeof parsed.tabCountChange.current === 'number') {
          const { current, delta } = parsed.tabCountChange;
          tabCountChip = document.createElement('span');
          tabCountChip.className = 'debug-log-tabs-chip';
          const hasDelta = delta !== undefined && delta !== '0' && delta !== '+0';
          if (typeof delta === 'string' && delta.startsWith('+') && delta !== '+0') {
            tabCountChip.classList.add('delta-inc');
          } else if (typeof delta === 'string' && delta.startsWith('-')) {
            tabCountChip.classList.add('delta-dec');
          }
          tabCountChip.textContent = `tabs: ${current}${hasDelta ? ` (${delta})` : ''}`;
        }
      } catch { }
    }

    const msg = document.createElement('span');
    msg.className = 'debug-log-msg';
    msg.textContent = entry.message;

    header.appendChild(time);
    header.appendChild(badge);
    header.appendChild(cat);
    if (tabCountChip) {
      header.appendChild(tabCountChip);
    }
    header.appendChild(msg);

    if (entry.details) {
      const toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.className = 'debug-log-details-toggle';
      toggleBtn.textContent = 'details';

      const pre = document.createElement('pre');
      pre.className = 'debug-log-details-pre hidden';
      pre.textContent = entry.details;

      toggleBtn.addEventListener('click', () => {
        const isHidden = pre.classList.toggle('hidden');
        toggleBtn.textContent = isHidden ? 'details' : 'hide';
      });

      header.appendChild(toggleBtn);
      row.appendChild(header);
      row.appendChild(pre);
    } else {
      row.appendChild(header);
    }

    debugLogsContainer.appendChild(row);
  }
}

// Debug Filter Chip Listeners
document.querySelectorAll('.debug-filter-chip').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.debug-filter-chip').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentDebugFilter = (btn.getAttribute('data-level') || 'all') as any;
    renderDebugLogs();
  });
});

debugSearchInput.addEventListener('input', () => {
  renderDebugLogs();
});

debugLiveAutoRefresh.addEventListener('change', () => {
  if (debugLiveAutoRefresh.checked) {
    startDebugLiveTimer();
  } else if (debugLiveTimer) {
    clearInterval(debugLiveTimer);
    debugLiveTimer = null;
  }
});

refreshDebugBtn.addEventListener('click', async () => {
  refreshDebugBtn.disabled = true;
  await loadAndRenderDebugData();
  refreshDebugBtn.disabled = false;
});

copyDebugLogsBtn.addEventListener('click', async () => {
  const text = allDebugLogs
    .map((l) => {
      const date = new Date(l.timestamp).toISOString();
      let tabPrefix = '';
      if (l.details) {
        try {
          const parsed = JSON.parse(l.details);
          if (parsed && parsed.tabCountChange && typeof parsed.tabCountChange.current === 'number') {
            tabPrefix = ` [tabs: ${parsed.tabCountChange.current} (${parsed.tabCountChange.delta})]`;
          }
        } catch { }
      }
      const det = l.details ? `\nDetails: ${l.details}` : '';
      return `[${date}] [${l.level.toUpperCase()}] [${l.category}]${tabPrefix} ${l.message}${det}`;
    })
    .join('\n');

  try {
    await navigator.clipboard.writeText(text);
    debugCopyFeedback.classList.remove('hidden');
    setTimeout(() => {
      debugCopyFeedback.classList.add('hidden');
    }, 2500);
  } catch {
    alert('Failed to copy logs to clipboard');
  }
});

clearDebugLogsBtn.addEventListener('click', async () => {
  if (confirm('Clear all debug logs?')) {
    await browser.runtime.sendMessage({ type: 'CLEAR_DEBUG_LOGS' });
    await loadAndRenderDebugData();
  }
});

// Execute Import
executeImportBtn.addEventListener('click', async () => {
  if (!rawImportedJson || !loadedStgResult) return;

  const modeRadio = document.querySelector('input[name="importMode"]:checked') as HTMLInputElement;
  const mode = (modeRadio ? modeRadio.value : 'replace') as 'replace' | 'merge';

  const confirmMsg =
    mode === 'replace'
      ? `Replace all current workspaces with ${loadedStgResult.groupCount} workspaces and ${loadedStgResult.pinnedCount} pinned tabs?`
      : `Merge ${loadedStgResult.groupCount} workspaces and ${loadedStgResult.pinnedCount} pinned tabs into your current setup?`;

  if (!confirm(confirmMsg)) return;

  await executeStgImportWithLoadingScreen(rawImportedJson, mode, loadedStgResult);
});

// Create Backup Manual Action
createBackupBtn.addEventListener('click', async () => {
  createBackupBtn.disabled = true;
  createBackupBtn.textContent = 'Backing up...';

  try {
    await browser.runtime.sendMessage({ type: 'CREATE_BACKUP' });
    await loadAndRenderBackups();
  } catch (err: any) {
    alert(`Failed to create backup: ${err.message}`);
  } finally {
    createBackupBtn.disabled = false;
    createBackupBtn.textContent = '+ Backup Now';
  }
});

// Save Backup Policy
saveBackupConfigBtn.addEventListener('click', async () => {
  saveBackupConfigBtn.disabled = true;
  saveBackupConfigBtn.textContent = 'Saving...';

  const newConfig: BackupConfig = {
    interval: backupIntervalSelect.value as any,
    retentionCopies: Math.max(1, Math.min(100, parseInt(backupRetentionInput.value, 10) || 10)),
  };

  try {
    await browser.runtime.sendMessage({
      type: 'UPDATE_BACKUP_CONFIG',
      config: newConfig,
    });
    await loadAndRenderBackups();
  } catch (err: any) {
    alert(`Failed to save policy: ${err.message}`);
  } finally {
    saveBackupConfigBtn.disabled = false;
    saveBackupConfigBtn.textContent = 'Save Policy';
  }
});

// Save Settings Action
saveSettingsBtn.addEventListener('click', async () => {
  saveSettingsBtn.disabled = true;
  saveSettingsBtn.textContent = 'Saving...';
  settingsFeedbackMsg.className = 'import-feedback hidden';

  let rawUrl = settingBackendUrl.value.trim() || 'http://localhost:8080';
  const secret = settingSyncSecret.value.trim();

  // Test connection and auto-heal URL
  try {
    const testRes = await SynapseApiClient.testConnection(rawUrl, secret);
    if (testRes.ok && testRes.effectiveUrl) {
      rawUrl = testRes.effectiveUrl;
      settingBackendUrl.value = rawUrl;
    }
  } catch {
    rawUrl = SynapseApiClient.normalizeUrl(rawUrl);
  }

  const newSettings: SynapseSettings = {
    backendUrl: rawUrl,
    syncSecret: settingSyncSecret.value.trim() || 'synapse_dev_secret_123',
    userId: settingUserId.value.trim() || 'default',
    clientId: settingClientId.value.trim() || 'laptop-firefox-01',
    pollIntervalSeconds: 15,
    debounceDelayMs: typeof currentSettings?.debounceDelayMs === 'number' ? currentSettings.debounceDelayMs : 3000,
  };

  await browser.storage.local.set({ settings: newSettings });
  currentSettings = newSettings;

  settingsFeedbackMsg.className = 'import-feedback success';
  settingsFeedbackMsg.textContent = `✓ Configuration saved successfully! (${rawUrl})`;
  settingsFeedbackMsg.classList.remove('hidden');
  saveSettingsBtn.disabled = false;
  saveSettingsBtn.textContent = 'Save Configuration';

  // Trigger immediate push
  pushNowBtn.click();
});

// Test Connection Action
testConnectionBtn?.addEventListener('click', async () => {
  testConnectionBtn.disabled = true;
  testConnectionBtn.textContent = 'Testing...';
  settingsFeedbackMsg.className = 'import-feedback hidden';

  const rawUrl = settingBackendUrl.value.trim();
  const secret = settingSyncSecret.value.trim();

  try {
    const res = await SynapseApiClient.testConnection(rawUrl, secret);

    if (res.ok) {
      if (res.autoSwitchedProtocol || res.effectiveUrl !== rawUrl) {
        settingBackendUrl.value = res.effectiveUrl;
      }
      settingsFeedbackMsg.className = 'import-feedback success';
      const switchNotice = res.autoSwitchedProtocol
        ? ` (Auto-detected ${res.effectiveUrl.startsWith('https') ? 'HTTPS' : 'HTTP'})`
        : '';
      settingsFeedbackMsg.textContent = `✓ Server is reachable!${switchNotice} (Status: ${res.status}, Redis: ${res.redis}, Latency: ${res.latencyMs}ms)`;
      settingsFeedbackMsg.classList.remove('hidden');
    } else {
      settingsFeedbackMsg.className = 'import-feedback error';
      settingsFeedbackMsg.textContent = `Connection failed: ${res.error || 'Server unreachable'}`;
      settingsFeedbackMsg.classList.remove('hidden');
    }
  } catch (err: any) {
    settingsFeedbackMsg.className = 'import-feedback error';
    settingsFeedbackMsg.textContent = `Connection failed: ${err.message}`;
    settingsFeedbackMsg.classList.remove('hidden');
  } finally {
    testConnectionBtn.disabled = false;
    testConnectionBtn.textContent = 'Test Connection';
  }
});

// Customization Section Actions
document.querySelectorAll<HTMLButtonElement>('#customizationSection .preset-chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    const delay = parseInt(chip.getAttribute('data-delay') || '3000', 10);
    if (settingDebounceDelay) {
      settingDebounceDelay.value = String(delay);
    }
    updatePresetChipsState(delay);
  });
});

settingDebounceDelay?.addEventListener('input', () => {
  if (settingDebounceDelay) {
    const delay = parseInt(settingDebounceDelay.value, 10);
    updatePresetChipsState(delay);
  }
});

saveCustomizationBtn?.addEventListener('click', async () => {
  if (!settingDebounceDelay || !customizationFeedbackMsg) return;
  saveCustomizationBtn.disabled = true;
  saveCustomizationBtn.textContent = 'Saving...';
  customizationFeedbackMsg.className = 'import-feedback hidden';

  try {
    const parsed = parseInt(settingDebounceDelay.value, 10);
    const delay = isNaN(parsed) || parsed < 200 ? 3000 : parsed;
    settingDebounceDelay.value = String(delay);
    updatePresetChipsState(delay);

    const data = await browser.storage.local.get('settings');
    const updated: SynapseSettings = {
      ...(data.settings || currentSettings),
      debounceDelayMs: delay,
    };

    await browser.storage.local.set({ settings: updated });
    currentSettings = updated;

    customizationFeedbackMsg.className = 'import-feedback success';
    customizationFeedbackMsg.textContent = `✓ Customization saved! Debounce delay set to ${delay}ms.`;
    customizationFeedbackMsg.classList.remove('hidden');
  } catch (err: any) {
    customizationFeedbackMsg.className = 'import-feedback error';
    customizationFeedbackMsg.textContent = `Failed to save customization: ${err.message}`;
    customizationFeedbackMsg.classList.remove('hidden');
  } finally {
    saveCustomizationBtn.disabled = false;
    saveCustomizationBtn.textContent = 'Save Customization';
  }
});

resetCustomizationBtn?.addEventListener('click', () => {
  if (settingDebounceDelay) {
    settingDebounceDelay.value = '3000';
    updatePresetChipsState(3000);
  }
});

// Destroy Section Actions
confirmDestroyCheckbox?.addEventListener('change', () => {
  if (executeDestroyBtn && confirmDestroyCheckbox) {
    executeDestroyBtn.disabled = !confirmDestroyCheckbox.checked;
  }
});

executeDestroyBtn?.addEventListener('click', async () => {
  if (!confirmDestroyCheckbox || !confirmDestroyCheckbox.checked || !executeDestroyBtn || !destroyFeedbackMsg) {
    return;
  }

  const confirmed = window.confirm(
    'Are you ABSOLUTELY sure you want to permanently delete all saved workspaces locally and on the remote server?\n\nThis will reset your local tabs and erase the remote state snapshot.'
  );
  if (!confirmed) {
    return;
  }

  executeDestroyBtn.disabled = true;
  executeDestroyBtn.innerHTML = `<span>Destroying all workspaces...</span>`;
  destroyFeedbackMsg.className = 'import-feedback hidden';

  try {
    const response = await browser.runtime.sendMessage({ type: 'DESTROY_ALL_WORKSPACES' });
    if (response && response.success) {
      destroyFeedbackMsg.className = 'import-feedback success';
      destroyFeedbackMsg.textContent = `✓ ${response.message || 'All workspaces deleted locally and on remote server.'}`;
      destroyFeedbackMsg.classList.remove('hidden');
      confirmDestroyCheckbox.checked = false;
      await refreshState();
    } else {
      destroyFeedbackMsg.className = 'import-feedback error';
      destroyFeedbackMsg.textContent = response?.message || 'Error occurred while destroying workspaces.';
      destroyFeedbackMsg.classList.remove('hidden');
    }
  } catch (err: any) {
    destroyFeedbackMsg.className = 'import-feedback error';
    destroyFeedbackMsg.textContent = `Failed to destroy workspaces: ${err.message}`;
    destroyFeedbackMsg.classList.remove('hidden');
  } finally {
    executeDestroyBtn.disabled = false;
    executeDestroyBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
      </svg>
      <span>Destroy All Workspaces (Local & Remote)</span>
    `;
  }
});

// Workspaces Add Actions
addWorkspaceBtn.addEventListener('click', () => {
  newWorkspaceRow.classList.remove('hidden');
  newWorkspaceInput.value = '';
  newWorkspaceInput.focus();
});

cancelAddWsBtn.addEventListener('click', () => {
  newWorkspaceRow.classList.add('hidden');
});

confirmAddWsBtn.addEventListener('click', async () => {
  const name = newWorkspaceInput.value.trim();
  if (name) {
    await browser.runtime.sendMessage({
      type: 'CREATE_WORKSPACE',
      name,
    });
    newWorkspaceRow.classList.add('hidden');
    await refreshState();
  }
});

newWorkspaceInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    confirmAddWsBtn.click();
  } else if (e.key === 'Escape') {
    cancelAddWsBtn.click();
  }
});

// Workspace Edit Modal Event Listeners
closeWsEditModalBtn?.addEventListener('click', () => {
  closeWorkspaceEditModal();
});

cancelWsEditBtn?.addEventListener('click', () => {
  closeWorkspaceEditModal();
});

wsEditModal?.addEventListener('click', (e) => {
  if (e.target === wsEditModal) {
    closeWorkspaceEditModal();
  }
});

wsEditNameInput?.addEventListener('input', () => {
  updateModalPreview();
});

wsTypeSegments?.addEventListener('click', (e) => {
  const target = (e.target as HTMLElement).closest('.segment-btn');
  if (target) {
    const type = target.getAttribute('data-type') as WorkspaceCustomType;
    if (type) {
      setModalCustomType(type);
    }
  }
});

wsEmojiInput?.addEventListener('input', () => {
  currentEditValue = wsEmojiInput.value.trim() || '🚀';
  const emojiBtns = wsQuickEmojiGrid.querySelectorAll('.emoji-btn');
  emojiBtns.forEach((b) => {
    if (b.getAttribute('data-emoji') === currentEditValue) {
      b.classList.add('active');
    } else {
      b.classList.remove('active');
    }
  });
  updateModalPreview();
});

wsQuickEmojiGrid?.addEventListener('click', (e) => {
  const target = (e.target as HTMLElement).closest('.emoji-btn');
  if (target) {
    const emoji = target.getAttribute('data-emoji');
    if (emoji) {
      currentEditValue = emoji;
      wsEmojiInput.value = emoji;
      wsQuickEmojiGrid.querySelectorAll('.emoji-btn').forEach((b) => b.classList.remove('active'));
      target.classList.add('active');
      updateModalPreview();
    }
  }
});

wsTagInput?.addEventListener('input', () => {
  currentEditValue = wsTagInput.value.slice(0, 3).toUpperCase();
  wsTagInput.value = currentEditValue;
  updateModalPreview();
});

wsColorPalette?.addEventListener('click', (e) => {
  const target = (e.target as HTMLElement).closest('.color-swatch');
  if (target) {
    const color = target.getAttribute('data-color');
    if (color) {
      currentEditColor = color;
      wsColorPalette.querySelectorAll('.color-swatch').forEach((s) => s.classList.remove('active'));
      target.classList.add('active');
      updateModalPreview();
    }
  }
});

saveWsEditBtn?.addEventListener('click', async () => {
  if (!editingWorkspace) return;

  const newName = wsEditNameInput.value.trim() || editingWorkspace.name;
  let customVal: string | undefined = undefined;

  if (currentEditType === 'text') {
    customVal = (wsTagInput.value.trim().slice(0, 3) || newName.slice(0, 3)).toUpperCase();
  } else if (currentEditType === 'emoji') {
    customVal = wsEmojiInput.value.trim() || '🚀';
  } else if (currentEditType === 'color') {
    customVal = currentEditColor;
  } else {
    customVal = undefined;
  }

  const icon = currentEditType === 'emoji' ? customVal : undefined;

  saveWsEditBtn.disabled = true;
  saveWsEditBtn.textContent = 'Saving...';

  try {
    await browser.runtime.sendMessage({
      type: 'UPDATE_WORKSPACE',
      workspaceId: editingWorkspace.id,
      name: newName,
      customType: currentEditType,
      customValue: customVal,
      color: currentEditColor,
      icon: icon,
    });
    closeWorkspaceEditModal();
    await refreshState();
  } catch (err) {
    console.error('[Popup] Failed to update workspace:', err);
  } finally {
    saveWsEditBtn.disabled = false;
    saveWsEditBtn.textContent = 'Save Changes';
  }
});

promptDeleteWsBtn?.addEventListener('click', () => {
  if (!editingWorkspace) return;
  if (currentWorkspaces.length <= 1) return;

  const tabCount = editingWorkspace.tabs ? editingWorkspace.tabs.length : 0;
  wsDeleteConfirmText.textContent = `Are you sure you want to delete workspace "${editingWorkspace.name}" and close all its ${tabCount} tab${tabCount === 1 ? '' : 's'}?`;
  wsDeleteConfirmBox.classList.remove('hidden');
});

cancelDeleteWsBtn?.addEventListener('click', () => {
  wsDeleteConfirmBox.classList.add('hidden');
});

confirmDeleteWsBtn?.addEventListener('click', async () => {
  if (!editingWorkspace) return;

  confirmDeleteWsBtn.disabled = true;
  confirmDeleteWsBtn.textContent = 'Deleting...';

  try {
    await browser.runtime.sendMessage({
      type: 'DELETE_WORKSPACE',
      workspaceId: editingWorkspace.id,
    });
    closeWorkspaceEditModal();
    await refreshState();
  } catch (err) {
    console.error('[Popup] Failed to delete workspace:', err);
  } finally {
    confirmDeleteWsBtn.disabled = false;
    confirmDeleteWsBtn.textContent = 'Confirm Delete';
  }
});

// Initialization
document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const isStartupLoading = urlParams.get('mode') === 'startup-loading';
  const isTab = urlParams.get('mode') === 'tab' || isStartupLoading || !window.location.href.startsWith('moz-extension://') || window.innerWidth > 500;

  if (isStartupLoading) {
    document.body.classList.add('tab-mode', 'startup-loading-mode');
    restoreLoadingOverlay.classList.remove('hidden');
    restoreLoadingTitle.textContent = 'Loading Workspaces & Tabs';
    restoreLoadingStatus.textContent = 'Downloading your workspaces and tabs from the server...';
    restoreLoadingDetail.textContent = 'Materializing tabs in suspended state to ensure instant launch and zero RAM impact. Please wait...';
    restoreProgressBar.className = 'restore-progress-bar indeterminate';
    restoreCompletedActions.classList.add('hidden');

    browser.runtime.onMessage.addListener((message: any) => {
      if (message.type === 'STARTUP_SYNC_COMPLETED') {
        if (message.success) {
          restoreLoadingTitle.textContent = 'Workspaces Ready';
          restoreLoadingStatus.textContent = 'All workspaces and tabs are now synchronized.';
          restoreProgressBar.className = 'restore-progress-bar success';
          restoreIconCenter.classList.add('success');
        } else {
          restoreLoadingTitle.textContent = 'Sync Offline';
          restoreLoadingStatus.textContent = message.errorMessage || 'Unable to reach sync server. Operating offline.';
          restoreLoadingDetail.textContent = 'Continuing with local workspaces...';
        }
      }
    });

    // Fallback safety timeout (30s) in case background task fails to close tab
    setTimeout(() => {
      window.close();
    }, 30000);

    return;
  }

  if (isTab) {
    document.body.classList.add('tab-mode');
  }

  const requestedSection = urlParams.get('section') as any;
  if (
    isTab &&
    requestedSection &&
    [
      'workspaces',
      'backups',
      'importExport',
      'settings',
      'customization',
      'information',
      'destroy',
      'debug',
    ].includes(requestedSection)
  ) {
    await switchSection(requestedSection);
  } else {
    await switchSection('workspaces');
  }

  await loadAndDisplaySettings();
  await refreshState();

  // Footer version tag opens Information section
  document.querySelectorAll('.version-tag').forEach((el) => {
    el.addEventListener('click', async () => {
      if (document.body.classList.contains('tab-mode')) {
        await switchSection('information');
      } else {
        await browser.tabs.create({
          url: browser.runtime.getURL('popup/index.html?mode=tab&section=information'),
        });
        window.close();
      }
    });
  });

  // If opened with restoreBackupId, trigger restore in foreground with loading screen
  const restoreBackupId = urlParams.get('restoreBackupId');
  if (restoreBackupId) {
    window.history.replaceState({}, document.title, window.location.pathname + '?mode=tab&section=backups');
    await executeRestoreWithLoadingScreen(restoreBackupId, 'Selected Server Backup');
  }
});

// Reactively update popup UI when remote sync or background updates modify storage
browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local') {
    if (changes.workspaces || changes.sync_status || changes.active_workspace_id) {
      refreshState();
    }
  }
});

