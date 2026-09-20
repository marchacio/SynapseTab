import {
  Workspace,
  WorkspaceCustomType,
  SynapseSettings,
  SyncStatus,
  BackupMetadata,
  BackupRecord,
  BackupConfig,
  BackupListResponse,
} from '../types.js';
import { importFromStgFormat, StgImportResult } from '../stg-adapter.js';

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
const syncNowBtn = document.getElementById('syncNowBtn') as HTMLButtonElement;
const settingsBtn = document.getElementById('settingsBtn') as HTMLButtonElement;
const lastSyncedText = document.getElementById('lastSyncedText') as HTMLElement;

// Navigation
const fullPageNav = document.getElementById('fullPageNav') as HTMLElement;
const navWorkspaces = document.getElementById('navWorkspaces') as HTMLButtonElement;
const navBackups = document.getElementById('navBackups') as HTMLButtonElement;
const navImportExport = document.getElementById('navImportExport') as HTMLButtonElement;
const navSettings = document.getElementById('navSettings') as HTMLButtonElement;

// Main Sections
const workspacesSection = document.getElementById('workspacesSection') as HTMLElement;
const backupsSection = document.getElementById('backupsSection') as HTMLElement;
const importExportSection = document.getElementById('importExportSection') as HTMLElement;
const settingsSection = document.getElementById('settingsSection') as HTMLElement;

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

// Paste JSON elements
const pasteJsonInput = document.getElementById('pasteJsonInput') as HTMLTextAreaElement;
const parsePastedJsonBtn = document.getElementById('parsePastedJsonBtn') as HTMLButtonElement;

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

/**
 * Switches the active section in full-page mode.
 */
async function switchSection(section: 'workspaces' | 'backups' | 'importExport' | 'settings'): Promise<void> {
  workspacesSection.classList.add('hidden');
  backupsSection.classList.add('hidden');
  importExportSection.classList.add('hidden');
  settingsSection.classList.add('hidden');

  navWorkspaces?.classList.remove('active');
  navBackups?.classList.remove('active');
  navImportExport?.classList.remove('active');
  navSettings?.classList.remove('active');

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
  };

  settingBackendUrl.value = currentSettings.backendUrl;
  settingSyncSecret.value = currentSettings.syncSecret;
  settingUserId.value = currentSettings.userId || 'default';
  settingClientId.value = currentSettings.clientId;
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
          restoreBtn.disabled = true;
          restoreBtn.textContent = 'Restoring...';
          try {
            await browser.runtime.sendMessage({
              type: 'RESTORE_BACKUP',
              backupId: bk.id,
            });
            await switchSection('workspaces');
            await refreshState();
          } catch (err: any) {
            alert(`Restore failed: ${err.message}`);
          } finally {
            restoreBtn.disabled = false;
            restoreBtn.textContent = 'Restore';
          }
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
syncNowBtn.addEventListener('click', async () => {
  syncNowBtn.classList.add('spinning');
  renderSyncStatus({ state: 'syncing', lastSyncTime: null, errorMessage: null });

  try {
    const updatedStatus = await browser.runtime.sendMessage({ type: 'SYNC_NOW' });
    if (updatedStatus) {
      renderSyncStatus(updatedStatus);
    }
  } catch (err: any) {
    renderSyncStatus({ state: 'error', lastSyncTime: null, errorMessage: err.message });
  } finally {
    setTimeout(() => {
      syncNowBtn.classList.remove('spinning');
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

// Paste JSON Actions
pasteJsonInput.addEventListener('input', () => {
  const text = pasteJsonInput.value.trim();
  if (text && (text.startsWith('{') || text.startsWith('['))) {
    processJsonContent(text, 'pasted-content.json');
  }
});

pasteJsonInput.addEventListener('paste', () => {
  setTimeout(() => {
    const text = pasteJsonInput.value.trim();
    if (text && (text.startsWith('{') || text.startsWith('['))) {
      processJsonContent(text, 'pasted-content.json');
    }
  }, 50);
});

parsePastedJsonBtn.addEventListener('click', () => {
  const text = pasteJsonInput.value.trim();
  if (!text) {
    importFeedbackMsg.className = 'import-feedback error';
    importFeedbackMsg.textContent = 'Please paste valid JSON text into the box.';
    importFeedbackMsg.classList.remove('hidden');
    return;
  }
  processJsonContent(text, 'pasted-content.json');
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

  executeImportBtn.disabled = true;
  executeImportBtn.textContent = 'Importing tabs & workspaces...';

  try {
    const res = await browser.runtime.sendMessage({
      type: 'IMPORT_STG',
      stgData: rawImportedJson,
      mode,
    });

    if (res.error) {
      throw new Error(res.error);
    }

    importFeedbackMsg.className = 'import-feedback success';
    importFeedbackMsg.textContent = `Successfully imported ${res.workspacesCount} workspaces and ${res.pinnedCount} pinned tabs!`;
    importFeedbackMsg.classList.remove('hidden');

    setTimeout(async () => {
      await switchSection('workspaces');
    }, 1200);
  } catch (err: any) {
    importFeedbackMsg.className = 'import-feedback error';
    importFeedbackMsg.textContent = `Import failed: ${err.message}`;
    importFeedbackMsg.classList.remove('hidden');
  } finally {
    executeImportBtn.disabled = false;
    executeImportBtn.textContent = '🚀 Import into SynapseTab';
  }
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

  const newSettings: SynapseSettings = {
    backendUrl: settingBackendUrl.value.trim() || 'http://localhost:8080',
    syncSecret: settingSyncSecret.value.trim() || 'synapse_dev_secret_123',
    userId: settingUserId.value.trim() || 'default',
    clientId: settingClientId.value.trim() || 'laptop-firefox-01',
    pollIntervalSeconds: 15,
  };

  await browser.storage.local.set({ settings: newSettings });
  currentSettings = newSettings;

  settingsFeedbackMsg.className = 'import-feedback success';
  settingsFeedbackMsg.textContent = '✓ Configuration saved successfully!';
  settingsFeedbackMsg.classList.remove('hidden');
  saveSettingsBtn.disabled = false;
  saveSettingsBtn.textContent = 'Save Configuration';

  // Trigger immediate sync
  syncNowBtn.click();
});

// Test Connection Action
testConnectionBtn?.addEventListener('click', async () => {
  testConnectionBtn.disabled = true;
  testConnectionBtn.textContent = 'Testing...';
  settingsFeedbackMsg.className = 'import-feedback hidden';

  const url = settingBackendUrl.value.trim() || 'http://localhost:8080';
  const secret = settingSyncSecret.value.trim();

  try {
    const startTime = performance.now();
    const res = await fetch(`${url}/api/v1/health`, {
      headers: secret ? { Authorization: `Bearer ${secret}` } : {},
    });
    const latency = Math.round(performance.now() - startTime);

    if (res.ok) {
      const data = await res.json();
      settingsFeedbackMsg.className = 'import-feedback success';
      settingsFeedbackMsg.textContent = `✓ Server is reachable! (Status: ${data.status}, Redis: ${data.redis}, Latency: ${latency}ms)`;
      settingsFeedbackMsg.classList.remove('hidden');
    } else {
      settingsFeedbackMsg.className = 'import-feedback error';
      settingsFeedbackMsg.textContent = `Server responded with HTTP ${res.status}: ${res.statusText}`;
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
  const isTab = urlParams.get('mode') === 'tab' || !window.location.href.startsWith('moz-extension://') || window.innerWidth > 500;

  if (isTab) {
    document.body.classList.add('tab-mode');
  }

  const requestedSection = urlParams.get('section') as any;
  if (isTab && requestedSection && ['workspaces', 'backups', 'importExport', 'settings'].includes(requestedSection)) {
    await switchSection(requestedSection);
  } else {
    await switchSection('workspaces');
  }

  await loadAndDisplaySettings();
  await refreshState();
});

// Reactively update popup UI when remote sync or background updates modify storage
browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local') {
    if (changes.workspaces || changes.sync_status || changes.active_workspace_id) {
      refreshState();
    }
  }
});

