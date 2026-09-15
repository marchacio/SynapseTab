import {
  Workspace,
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
  currentWorkspaces = storedWorkspaces.map((ws) => ({
    id: ws.id,
    name: ws.name,
    tabs: (wsMap.get(ws.id) || []).map((t) => ({
      uuid: '',
      url: t.url || '',
      title: t.title || '',
      favIconUrl: t.favIconUrl || undefined,
      pinned: t.pinned || false,
      active: t.active || false,
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
 * Renders the workspaces list with switch and delete actions.
 */
function renderWorkspacesList(workspaces: Workspace[], activeId: string): void {
  workspacesList.replaceChildren();

  for (const ws of workspaces) {
    const item = document.createElement('div');
    item.className = `workspace-item ${ws.id === activeId ? 'active' : ''}`;

    const info = document.createElement('div');
    info.className = 'workspace-info';

    const name = document.createElement('span');
    name.className = 'ws-name';
    name.textContent = ws.name;

    const count = document.createElement('span');
    count.className = 'ws-tabs-count';
    const tabCount = ws.tabs ? ws.tabs.length : 0;
    count.textContent = `(${tabCount})`;

    info.appendChild(name);
    info.appendChild(count);

    item.appendChild(info);

    item.addEventListener('click', async () => {
      if (ws.id !== activeId) {
        await browser.runtime.sendMessage({
          type: 'SWITCH_WORKSPACE',
          workspaceId: ws.id,
        });
        await refreshState();
      }
    });

    if (workspaces.length > 1) {
      const actions = document.createElement('div');
      actions.className = 'ws-actions';

      const delBtn = document.createElement('button');
      delBtn.className = 'ws-del-btn';
      delBtn.innerHTML = '&times;';
      delBtn.title = `Delete workspace "${ws.name}"`;

      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm(`Delete workspace "${ws.name}" and close all its tabs?`)) {
          await browser.runtime.sendMessage({
            type: 'DELETE_WORKSPACE',
            workspaceId: ws.id,
          });
          await refreshState();
        }
      });

      actions.appendChild(delBtn);
      item.appendChild(actions);
    }

    workspacesList.appendChild(item);
  }
}

/**
 * Renders active tabs in current workspace with pin toggle and move actions.
 */
function renderTabsList(tabs: any[], allWorkspaces: Workspace[]): void {
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

    const info = document.createElement('div');
    info.className = 'tab-info';
    info.style.cursor = 'pointer';

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

    info.addEventListener('click', async () => {
      if (tab.localTabId !== undefined) {
        await browser.tabs.update(tab.localTabId, { active: true });
        window.close();
      }
    });

    const actions = document.createElement('div');
    actions.className = 'tab-actions';

    // Pin button
    const pinBtn = document.createElement('button');
    pinBtn.className = `tab-pin-btn ${tab.pinned ? 'pinned' : ''}`;
    pinBtn.title = tab.pinned ? 'Unpin tab' : 'Pin tab (Global)';
    pinBtn.innerHTML = '📌';
    pinBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (tab.localTabId !== undefined) {
        await browser.runtime.sendMessage({
          type: 'TOGGLE_PIN_TAB',
          tabId: tab.localTabId,
        });
        await refreshState();
      }
    });
    actions.appendChild(pinBtn);

    // Move to other workspace selector
    if (allWorkspaces.length > 1) {
      const select = document.createElement('select');
      select.className = 'tab-move-select';
      select.title = 'Move tab to another workspace';

      for (const ws of allWorkspaces) {
        const opt = document.createElement('option');
        opt.value = ws.id;
        opt.textContent = ws.name;
        opt.selected = ws.id === activeWorkspaceId;
        select.appendChild(opt);
      }

      select.addEventListener('change', async (e) => {
        e.stopPropagation();
        const targetWsId = select.value;
        if (targetWsId !== activeWorkspaceId && tab.localTabId !== undefined) {
          await browser.runtime.sendMessage({
            type: 'MOVE_TAB_WORKSPACE',
            tabId: tab.localTabId,
            targetWorkspaceId: targetWsId,
          });
          await refreshState();
        }
      });

      actions.appendChild(select);
    }

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'tab-close-btn';
    closeBtn.innerHTML = '&times;';
    closeBtn.title = 'Close tab';
    closeBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (tab.localTabId !== undefined) {
        await browser.tabs.remove(tab.localTabId);
        await refreshState();
      }
    });
    actions.appendChild(closeBtn);

    row.appendChild(info);
    row.appendChild(actions);
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
