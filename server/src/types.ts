/**
 * Tab and Workspace data contract definitions for SynapseTab.
 */

export interface TabItem {
  uuid: string;
  url: string;
  title: string;
  favIconUrl?: string;
  pinned: boolean;
  index: number;
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

export interface SyncResponse {
  status: 'ok' | 'error';
  message?: string;
  updated_at?: number;
}

export interface HealthResponse {
  status: 'healthy' | 'degraded';
  uptime: number;
  timestamp: number;
  redis: 'connected' | 'disconnected';
  version: string;
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

