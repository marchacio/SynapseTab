import { Workspace, SynapseSettings, SyncStatus } from '../types.js';

let currentWorkspaces: Workspace[] = [];
let activeWorkspaceId = 'default';
let currentSettings: SynapseSettings;

// DOM Elements
const statusBadge = document.getElementById('statusBadge') as HTMLElement;
const statusLabel = document.getElementById('statusLabel') as HTMLElement;
const syncNowBtn = document.getElementById('syncNowBtn') as HTMLButtonElement;
const toggleSettingsBtn = document.getElementById('toggleSettingsBtn') as HTMLButtonElement;
const settingsDrawer = document.getElementById('settingsDrawer') as HTMLElement;
const saveSettingsBtn = document.getElementById('saveSettingsBtn') as HTMLButtonElement;
const lastSyncedText = document.getElementById('lastSyncedText') as HTMLElement;

// Settings inputs
const settingBackendUrl = document.getElementById('settingBackendUrl') as HTMLInputElement;
const settingSyncSecret = document.getElementById('settingSyncSecret') as HTMLInputElement;
const settingUserId = document.getElementById('settingUserId') as HTMLInputElement;
const settingClientId = document.getElementById('settingClientId') as HTMLInputElement;

// Workspaces & Tabs containers
const workspacesList = document.getElementById('workspacesList') as HTMLElement;
const addWorkspaceBtn = document.getElementById('addWorkspaceBtn') as HTMLButtonElement;
const newWorkspaceRow = document.getElementById('newWorkspaceRow') as HTMLElement;
const newWorkspaceInput = document.getElementById('newWorkspaceInput') as HTMLInputElement;
const confirmAddWsBtn = document.getElementById('confirmAddWsBtn') as HTMLButtonElement;
const cancelAddWsBtn = document.getElementById('cancelAddWsBtn') as HTMLButtonElement;

const activeWorkspaceTitle = document.getElementById('activeWorkspaceTitle') as HTMLElement;
const tabCountBadge = document.getElementById('tabCountBadge') as HTMLElement;
const tabsList = document.getElementById('tabsList') as HTMLElement;

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
 * Loads settings from storage and populates drawer inputs.
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
 * Queries the state and updates workspaces and tabs UI.
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

  // Map tabs to workspaces
  const wsMap = new Map<string, any[]>();
  for (const ws of storedWorkspaces) {
    wsMap.set(ws.id, []);
  }

  for (const tab of tabs) {
    if (tab.id === undefined) continue;
    let wsId = activeWorkspaceId;
    try {
      const storedWs = await browser.sessions.getTabValue(tab.id, 'workspace_id');
      if (typeof storedWs === 'string') wsId = storedWs;
    } catch {}

    if (!wsMap.has(wsId)) {
      wsMap.set(wsId, []);
    }
    wsMap.get(wsId)!.push(tab);
  }

  currentWorkspaces = storedWorkspaces.map((w) => ({
    id: w.id,
    name: w.name,
    tabs: wsMap.get(w.id) || [],
  }));

  renderWorkspaces();
  renderTabs();
}

/**
 * Renders workspace cards list.
 */
function renderWorkspaces(): void {
  workspacesList.innerHTML = '';

  for (const ws of currentWorkspaces) {
    const card = document.createElement('div');
    const isActive = ws.id === activeWorkspaceId;
    card.className = `workspace-card ${isActive ? 'active' : ''}`;

    const info = document.createElement('div');
    info.className = 'ws-info';

    const bullet = document.createElement('div');
    bullet.className = 'ws-bullet';

    const textWrap = document.createElement('div');
    const nameEl = document.createElement('div');
    nameEl.className = 'ws-name';
    nameEl.textContent = ws.name;

    const countEl = document.createElement('div');
    countEl.className = 'ws-tab-count';
    const tabCount = ws.tabs ? ws.tabs.length : 0;
    countEl.textContent = `${tabCount} tab${tabCount === 1 ? '' : 's'}`;

    textWrap.appendChild(nameEl);
    textWrap.appendChild(countEl);
    info.appendChild(bullet);
    info.appendChild(textWrap);

    const actions = document.createElement('div');
    actions.className = 'ws-actions';

    // Delete workspace button (only if more than 1 workspace)
    if (currentWorkspaces.length > 1) {
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'btn btn-ghost btn-sm btn-danger';
      deleteBtn.innerHTML = '&times;';
      deleteBtn.title = 'Delete workspace';
      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm(`Delete workspace "${ws.name}"? Tabs will be reassigned.`)) {
          await browser.runtime.sendMessage({
            type: 'DELETE_WORKSPACE',
            workspaceId: ws.id,
          });
          await refreshState();
        }
      });
      actions.appendChild(deleteBtn);
    }

    card.appendChild(info);
    card.appendChild(actions);

    // Switch workspace on card click
    card.addEventListener('click', async () => {
      if (!isActive) {
        await browser.runtime.sendMessage({
          type: 'SWITCH_WORKSPACE',
          workspaceId: ws.id,
        });
        await refreshState();
      }
    });

    workspacesList.appendChild(card);
  }
}

/**
 * Renders tab list for the active workspace.
 */
function renderTabs(): void {
  const activeWs = currentWorkspaces.find((w) => w.id === activeWorkspaceId);
  const activeTabs = activeWs ? activeWs.tabs : [];

  activeWorkspaceTitle.textContent = activeWs ? activeWs.name : 'Active Tabs';
  tabCountBadge.textContent = `${activeTabs.length} tab${activeTabs.length === 1 ? '' : 's'}`;
  tabsList.innerHTML = '';

  if (activeTabs.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.style.padding = '12px';
    emptyMsg.style.textAlign = 'center';
    emptyMsg.style.color = 'var(--text-muted)';
    emptyMsg.textContent = 'No open tabs in this workspace';
    tabsList.appendChild(emptyMsg);
    return;
  }

  for (const tab of activeTabs) {
    const row = document.createElement('div');
    row.className = 'tab-row';

    const main = document.createElement('div');
    main.className = 'tab-row-main';

    const icon = document.createElement('img');
    icon.className = 'tab-icon';
    icon.src = tab.favIconUrl || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%2394a3b8" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>';
    icon.onerror = () => {
      icon.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%2394a3b8" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>';
    };

    const title = document.createElement('span');
    title.className = 'tab-title';
    title.textContent = tab.title || tab.url || 'Tab';
    title.title = tab.url || '';

    main.appendChild(icon);
    main.appendChild(title);

    // Tab actions: Move to other workspace selector
    const actions = document.createElement('div');
    actions.className = 'tab-actions';

    if (currentWorkspaces.length > 1) {
      const select = document.createElement('select');
      select.className = 'ws-select';
      select.title = 'Move tab to another workspace';

      const placeholderOpt = document.createElement('option');
      placeholderOpt.value = '';
      placeholderOpt.textContent = 'Move to...';
      select.appendChild(placeholderOpt);

      for (const otherWs of currentWorkspaces) {
        if (otherWs.id !== activeWorkspaceId) {
          const opt = document.createElement('option');
          opt.value = otherWs.id;
          opt.textContent = otherWs.name;
          select.appendChild(opt);
        }
      }

      select.addEventListener('change', async () => {
        const tabId = tab.localTabId || (tab as any).id;
        if (select.value && tabId !== undefined) {
          await browser.runtime.sendMessage({
            type: 'MOVE_TAB_WORKSPACE',
            tabId,
            targetWorkspaceId: select.value,
          });
          await refreshState();
        }
      });

      actions.appendChild(select);
    }

    row.appendChild(main);
    row.appendChild(actions);
    tabsList.appendChild(row);
  }
}

// Event Listeners
toggleSettingsBtn.addEventListener('click', () => {
  settingsDrawer.classList.toggle('hidden');
});

saveSettingsBtn.addEventListener('click', async () => {
  const newSettings: SynapseSettings = {
    backendUrl: settingBackendUrl.value.trim() || 'http://localhost:8080',
    syncSecret: settingSyncSecret.value.trim() || 'synapse_dev_secret_123',
    userId: settingUserId.value.trim() || 'default',
    clientId: settingClientId.value.trim() || 'laptop-firefox-01',
    pollIntervalSeconds: 15,
  };

  await browser.storage.local.set({ settings: newSettings });
  currentSettings = newSettings;
  settingsDrawer.classList.add('hidden');

  // Trigger immediate sync
  syncNowBtn.click();
});

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
  await loadAndDisplaySettings();
  await refreshState();
});
