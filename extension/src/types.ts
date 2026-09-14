/**
 * Tab and Workspace synchronization data types for SynapseTab.
 */

export interface TabItem {
  uuid: string;
  url: string;
  title: string;
  favIconUrl?: string;
  pinned: boolean;
  index: number;
  localTabId?: number;
}

export interface Workspace {
  id: string;
  name: string;
  tabs: TabItem[];
}

export interface SyncPayload {
  client_id: string;
  updated_at: number;
  active_workspace_id: string;
  workspaces: Workspace[];
}

export interface ReconcilePlan {
  tabsToCreate: Array<{ tab: TabItem; workspaceId: string }>;
  tabsToClose: Array<{ uuid: string; localTabId?: number }>;
  tabsToUpdate: Array<{
    uuid: string;
    localTabId?: number;
    url?: string;
    title?: string;
    pinned?: boolean;
    workspaceId?: string;
  }>;
  tabsToMove: Array<{ uuid: string; localTabId?: number; targetIndex: number }>;
  workspacesToCreate: Array<{ id: string; name: string }>;
  workspacesToRemove: Array<{ id: string }>;
  activeWorkspaceId: string;
}

export interface SynapseSettings {
  backendUrl: string;
  syncSecret: string;
  clientId: string;
  userId?: string;
  pollIntervalSeconds: number;
}

export interface SyncStatus {
  state: 'idle' | 'syncing' | 'synced' | 'error';
  lastSyncTime: number | null;
  errorMessage: string | null;
}
