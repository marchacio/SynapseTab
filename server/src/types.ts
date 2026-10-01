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

export type WorkspaceCustomType = 'emoji' | 'text' | 'color' | 'default';

export interface Workspace {
  id: string;
  name: string;
  tabs: TabItem[];
  customType?: WorkspaceCustomType;
  customValue?: string;
  color?: string;
  icon?: string;
  order?: number;
  isDivider?: boolean;
  isArchived?: boolean;
}

export interface SyncPayload {
  client_id: string;
  updated_at: number;
  active_workspace_id: string;
  workspaces: Workspace[];
  version?: number;
}

export interface SyncResponse {
  status: 'ok' | 'error';
  message?: string;
  updated_at?: number;
  version?: number;
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

import type { SynapseTabBackupData } from './backup-format.js';

export interface BackupRecord extends BackupMetadata {
  snapshot: SyncPayload;
  backup?: SynapseTabBackupData;
}

export interface BackupConfig {
  interval: BackupFrequency;
  retentionCopies: number;
}

export interface BackupListResponse {
  backups: BackupMetadata[];
  config: BackupConfig;
}

