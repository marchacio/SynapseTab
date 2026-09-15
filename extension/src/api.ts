import {
  SyncPayload,
  SynapseSettings,
  BackupListResponse,
  BackupRecord,
  BackupConfig,
} from './types.js';

/**
 * HTTP Client communicating with the SynapseTab backend service.
 */

export class SynapseApiClient {
  /**
   * Fetches the latest workspace snapshot from the backend.
   */
  static async fetchRemoteState(settings: SynapseSettings): Promise<SyncPayload | null> {
    const url = `${settings.backendUrl.replace(/\/+$/, '')}/api/v1/sync`;
    const userId = settings.userId || 'default';

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${settings.syncSecret}`,
        'X-User-Id': userId,
      },
    });

    if (response.status === 404) {
      // Remote snapshot not yet created
      return null;
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Sync fetch failed (${response.status}): ${errorText}`);
    }

    return (await response.json()) as SyncPayload;
  }

  /**
   * Pushes the local workspace state to the backend.
   */
  static async pushLocalState(
    settings: SynapseSettings,
    payload: SyncPayload
  ): Promise<{ status: string; updated_at: number }> {
    const url = `${settings.backendUrl.replace(/\/+$/, '')}/api/v1/sync`;
    const userId = settings.userId || 'default';

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.syncSecret}`,
        'X-User-Id': userId,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Sync push failed (${response.status}): ${errorText}`);
    }

    return (await response.json()) as { status: string; updated_at: number };
  }

  /**
   * Pings the health endpoint to verify connectivity and readiness.
   */
  static async checkHealth(settings: SynapseSettings): Promise<boolean> {
    try {
      const url = `${settings.backendUrl.replace(/\/+$/, '')}/api/v1/health`;
      const response = await fetch(url, { method: 'GET' });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Lists historical backups stored on the server for the active user.
   */
  static async listBackups(settings: SynapseSettings): Promise<BackupListResponse> {
    const url = `${settings.backendUrl.replace(/\/+$/, '')}/api/v1/backups`;
    const userId = settings.userId || 'default';

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${settings.syncSecret}`,
        'X-User-Id': userId,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to list backups (${response.status}): ${errorText}`);
    }

    return (await response.json()) as BackupListResponse;
  }

  /**
   * Fetches full backup record for exploring snapshot contents.
   */
  static async getBackup(settings: SynapseSettings, backupId: string): Promise<BackupRecord> {
    const url = `${settings.backendUrl.replace(/\/+$/, '')}/api/v1/backups/${encodeURIComponent(backupId)}`;
    const userId = settings.userId || 'default';

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${settings.syncSecret}`,
        'X-User-Id': userId,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get backup (${response.status}): ${errorText}`);
    }

    return (await response.json()) as BackupRecord;
  }

  /**
   * Creates an immediate on-demand backup on the server.
   */
  static async createBackup(settings: SynapseSettings): Promise<BackupRecord> {
    const url = `${settings.backendUrl.replace(/\/+$/, '')}/api/v1/backups`;
    const userId = settings.userId || 'default';

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${settings.syncSecret}`,
        'X-User-Id': userId,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create backup (${response.status}): ${errorText}`);
    }

    return (await response.json()) as BackupRecord;
  }

  /**
   * Restores a backup snapshot as the active workspace state on the server.
   */
  static async restoreBackup(
    settings: SynapseSettings,
    backupId: string
  ): Promise<{ status: string; message: string; restored_snapshot: SyncPayload }> {
    const url = `${settings.backendUrl.replace(/\/+$/, '')}/api/v1/backups/${encodeURIComponent(backupId)}/restore`;
    const userId = settings.userId || 'default';

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${settings.syncSecret}`,
        'X-User-Id': userId,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to restore backup (${response.status}): ${errorText}`);
    }

    return (await response.json()) as {
      status: string;
      message: string;
      restored_snapshot: SyncPayload;
    };
  }

  /**
   * Deletes a specific backup from the server.
   */
  static async deleteBackup(
    settings: SynapseSettings,
    backupId: string
  ): Promise<{ status: string; message: string }> {
    const url = `${settings.backendUrl.replace(/\/+$/, '')}/api/v1/backups/${encodeURIComponent(backupId)}`;
    const userId = settings.userId || 'default';

    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${settings.syncSecret}`,
        'X-User-Id': userId,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to delete backup (${response.status}): ${errorText}`);
    }

    return (await response.json()) as { status: string; message: string };
  }

  /**
   * Updates backup configuration on the server.
   */
  static async updateBackupConfig(
    settings: SynapseSettings,
    config: BackupConfig
  ): Promise<{ status: string; config: BackupConfig }> {
    const url = `${settings.backendUrl.replace(/\/+$/, '')}/api/v1/backups/config`;
    const userId = settings.userId || 'default';

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.syncSecret}`,
        'X-User-Id': userId,
      },
      body: JSON.stringify(config),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to update backup config (${response.status}): ${errorText}`);
    }

    return (await response.json()) as { status: string; config: BackupConfig };
  }
}

