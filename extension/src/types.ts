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

export type WorkspaceCustomType = 'emoji' | 'text' | 'color' | 'default';

export interface Workspace {
  id: string;
  name: string;
  tabs: TabItem[];
  customType?: WorkspaceCustomType;
  customValue?: string;
  color?: string;
  icon?: string;
}

export interface SyncPayload {
  client_id: string;
  updated_at: number;
  active_workspace_id: string;
  workspaces: Workspace[];
  version?: number;
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
  workspacesToCreate: Array<{
    id: string;
    name: string;
    customType?: WorkspaceCustomType;
    customValue?: string;
    color?: string;
    icon?: string;
  }>;
  workspacesToUpdate: Array<{
    id: string;
    name?: string;
    customType?: WorkspaceCustomType;
    customValue?: string;
    color?: string;
    icon?: string;
  }>;
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

export type BackupFrequency = 'hourly' | 'daily' | 'weekly' | 'monthly' | 'disabled';

export interface BackupMetadata {
  id: string;
  timestamp: number;
  reason: 'scheduled' | 'manual';
  workspaces_count: number;
  tabs_count: number;
  client_id: string;
  size_bytes?: number;
}

export interface BackupRecord extends BackupMetadata {
  snapshot: SyncPayload;
}

export interface BackupConfig {
  interval: BackupFrequency;
  retentionCopies: number;
}

export interface BackupListResponse {
  backups: BackupMetadata[];
  config: BackupConfig;
}

export type DebugLogLevel = 'info' | 'warn' | 'error' | 'sync';

export interface DebugLogEntry {
  id: string;
  timestamp: number;
  level: DebugLogLevel;
  category: string;
  message: string;
  details?: string;
}

export interface DebugDiagnostics {
  status: SyncStatus;
  localVersionState: {
    version: number;
    updatedAt: number;
    hasLocalChanges: boolean;
    initialSyncCompleted?: boolean;
  };
  settings: SynapseSettings;
  activeWorkspaceId: string;
  workspacesCount: number;
  tabsCount: number;
  uptimeSeconds: number;
  userAgent: string;
}

export interface DebugDataResponse {
  logs: DebugLogEntry[];
  diagnostics: DebugDiagnostics;
}

