import { SyncPayload, ReconcilePlan, TabItem, Workspace } from './types.js';

/**
 * Pure, deterministic reconciliation engine.
 * Computes the minimal diff execution plan between local browser state and remote synchronized state.
 *
 * Guarantees:
 * - Matching UUID & matching URL are preserved intact (no reload, DOM/zoom preserved).
 * - Tabs missing locally are created with discarded: true (lazy loading).
 * - Tabs removed remotely are closed locally.
 * - Divergent indexes and pinned states are adjusted.
 */
export function reconcile(localState: SyncPayload, remoteState: SyncPayload): ReconcilePlan {
  const plan: ReconcilePlan = {
    tabsToCreate: [],
    tabsToClose: [],
    tabsToUpdate: [],
    tabsToMove: [],
    workspacesToCreate: [],
    workspacesToUpdate: [],
    workspacesToRemove: [],
    activeWorkspaceId: remoteState.active_workspace_id || localState.active_workspace_id || 'default',
  };

  // If remote is completely uninitialized (updated_at = 0 and no workspaces),
  // preserve local state without changes.
  if (remoteState.updated_at === 0 && remoteState.workspaces.length === 0) {
    return plan;
  }

  // 1. Workspace reconciliation
  const localWsMap = new Map<string, Workspace>();
  for (const ws of localState.workspaces) {
    localWsMap.set(ws.id, ws);
  }

  const remoteWsMap = new Map<string, Workspace>();
  for (const ws of remoteState.workspaces) {
    remoteWsMap.set(ws.id, ws);
  }

  // Workspaces to create or update
  for (const [rId, rWs] of remoteWsMap.entries()) {
    const lWs = localWsMap.get(rId);
    if (!lWs) {
      plan.workspacesToCreate.push({
        id: rId,
        name: rWs.name,
        customType: rWs.customType,
        customValue: rWs.customValue,
        color: rWs.color,
        icon: rWs.icon,
      });
    } else {
      const nameChanged = rWs.name !== lWs.name;
      const customTypeChanged = rWs.customType !== lWs.customType;
      const customValueChanged = rWs.customValue !== lWs.customValue;
      const colorChanged = rWs.color !== lWs.color;
      const iconChanged = rWs.icon !== lWs.icon;

      if (nameChanged || customTypeChanged || customValueChanged || colorChanged || iconChanged) {
        plan.workspacesToUpdate.push({
          id: rId,
          name: rWs.name,
          customType: rWs.customType,
          customValue: rWs.customValue,
          color: rWs.color,
          icon: rWs.icon,
        });
      }
    }
  }

  // Workspaces to remove (present locally, missing in remote)
  for (const [lId] of localWsMap.entries()) {
    if (!remoteWsMap.has(lId)) {
      plan.workspacesToRemove.push({ id: lId });
    }
  }

  // 2. Tab mapping
  const localTabsByUuid = new Map<string, { tab: TabItem; workspaceId: string }>();
  for (const ws of localState.workspaces) {
    for (const tab of ws.tabs) {
      if (tab.uuid) {
        localTabsByUuid.set(tab.uuid, { tab, workspaceId: ws.id });
      }
    }
  }

  const remoteTabsByUuid = new Map<string, { tab: TabItem; workspaceId: string }>();
  for (const ws of remoteState.workspaces) {
    for (const tab of ws.tabs) {
      if (tab.uuid) {
        remoteTabsByUuid.set(tab.uuid, { tab, workspaceId: ws.id });
      }
    }
  }

  // 3. Tabs to Create: present in remote, missing locally
  for (const [rUuid, { tab: rTab, workspaceId: rWsId }] of remoteTabsByUuid.entries()) {
    if (!localTabsByUuid.has(rUuid)) {
      plan.tabsToCreate.push({
        tab: { ...rTab },
        workspaceId: rWsId,
      });
    }
  }

  // 4. Tabs to Close: present locally, missing in remote
  for (const [lUuid, { tab: lTab }] of localTabsByUuid.entries()) {
    if (!remoteTabsByUuid.has(lUuid)) {
      plan.tabsToClose.push({
        uuid: lUuid,
        localTabId: lTab.localTabId,
      });
    }
  }

  // 5. Tabs to Update and Move: present in both
  for (const [uuid, { tab: rTab, workspaceId: rWsId }] of remoteTabsByUuid.entries()) {
    const localEntry = localTabsByUuid.get(uuid);
    if (!localEntry) continue;

    const { tab: lTab, workspaceId: lWsId } = localEntry;

    // Check for property differences
    const urlChanged = rTab.url !== lTab.url;
    const titleChanged = rTab.title !== lTab.title;
    const pinnedChanged = rTab.pinned !== lTab.pinned;
    const workspaceChanged = rWsId !== lWsId;

    if (urlChanged || titleChanged || pinnedChanged || workspaceChanged) {
      plan.tabsToUpdate.push({
        uuid,
        localTabId: lTab.localTabId,
        url: urlChanged ? rTab.url : undefined,
        title: titleChanged ? rTab.title : undefined,
        pinned: pinnedChanged ? rTab.pinned : undefined,
        workspaceId: workspaceChanged ? rWsId : undefined,
      });
    }

    // Check for index ordering differences
    if (rTab.index !== lTab.index) {
      plan.tabsToMove.push({
        uuid,
        localTabId: lTab.localTabId,
        targetIndex: rTab.index,
      });
    }
  }

  return plan;
}
