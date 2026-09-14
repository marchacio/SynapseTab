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
