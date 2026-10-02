import {
  SyncPayload,
  SynapseSettings,
  BackupListResponse,
  BackupRecord,
  BackupConfig,
} from './types.js';

export interface TestConnectionResult {
  ok: boolean;
  status?: string;
  redis?: string;
  latencyMs?: number;
  effectiveUrl: string;
  autoSwitchedProtocol?: boolean;
  error?: string;
}

/**
 * HTTP Client communicating with the SynapseTab backend service.
 * Includes automatic protocol auto-detection (HTTP <-> HTTPS),
 * URL normalization, and self-healing storage updates.
 */
export class SynapseApiClient {
  /**
   * Normalizes a backend URL ensuring valid scheme and no trailing slash.
   */
  static normalizeUrl(url: string): string {
    let clean = (url || '').trim().replace(/\/+$/, '');
    if (!clean) {
      return 'http://localhost:8080';
    }
    if (!/^https?:\/\//i.test(clean)) {
      clean = `http://${clean}`;
    }
    return clean;
  }

  /**
   * Performs an HTTP request with automatic protocol auto-healing.
   * If an HTTPS connection fails due to SSL/network errors on an HTTP-only server (or vice-versa),
   * it transparently tries the alternate scheme and persists the working URL to storage.
   */
  private static async fetchWithAutoHeal(
    settings: SynapseSettings,
    path: string,
    init: RequestInit
  ): Promise<Response> {
    const primaryBase = this.normalizeUrl(settings.backendUrl);
    const primaryUrl = `${primaryBase}${path}`;

    // Enable keepalive for POST requests under 60KB so requests survive context/window closing
    const bodyStr = typeof init.body === 'string' ? init.body : undefined;
    const canUseKeepalive = init.method === 'POST' && bodyStr !== undefined && bodyStr.length < 60000;
    const fetchInit: RequestInit = canUseKeepalive ? { ...init, keepalive: true } : init;

    try {
      const response = await fetch(primaryUrl, fetchInit);
      return response;
    } catch (primaryErr: any) {
      // Determine alternative protocol
      let altBase: string | null = null;
      if (primaryBase.startsWith('https://')) {
        altBase = primaryBase.replace(/^https:\/\//i, 'http://');
      } else if (primaryBase.startsWith('http://')) {
        altBase = primaryBase.replace(/^http:\/\//i, 'https://');
      }

      if (altBase) {
        const altUrl = `${altBase}${path}`;
        try {
          const altResponse = await fetch(altUrl, fetchInit);
          if (altResponse.ok || altResponse.status < 500) {
            // Auto-heal the setting in memory and in browser storage
            settings.backendUrl = altBase;
            if (typeof browser !== 'undefined' && browser.storage?.local) {
              browser.storage.local.get('settings').then((data) => {
                if (data?.settings) {
                  data.settings.backendUrl = altBase!;
                  browser.storage.local.set({ settings: data.settings }).catch(() => {});
                }
              }).catch(() => {});
            }
            return altResponse;
          }
        } catch {
          // Alt scheme also failed; rethrow primary error below
        }
      }

      throw primaryErr;
    }
  }

  /**
   * Probes the server health endpoint with intelligent protocol auto-detection.
   * If HTTPS fails on an HTTP server (e.g. SSL_ERROR_RX_RECORD_TOO_LONG),
   * it automatically tests HTTP and returns the working URL.
   */
  static async testConnection(rawUrl: string, secret?: string): Promise<TestConnectionResult> {
    const normalized = this.normalizeUrl(rawUrl);
    const candidates = [normalized];

    // Add alternate protocol candidate
    if (normalized.startsWith('https://')) {
      candidates.push(normalized.replace(/^https:\/\//i, 'http://'));
    } else if (normalized.startsWith('http://')) {
      candidates.push(normalized.replace(/^http:\/\//i, 'https://'));
    }

    let lastError = 'Unknown error';

    for (const candidate of candidates) {
      const startTime = performance.now();
      try {
        const response = await fetch(`${candidate}/api/v1/health`, {
          method: 'GET',
          headers: secret ? { Authorization: `Bearer ${secret}` } : {},
        });

        if (response.ok) {
          const data = await response.json();
          const latencyMs = Math.round(performance.now() - startTime);
          return {
            ok: true,
            status: data.status || 'healthy',
            redis: data.redis || 'connected',
            latencyMs,
            effectiveUrl: candidate,
            autoSwitchedProtocol: candidate !== normalized,
          };
        } else {
          lastError = `Server responded with HTTP ${response.status}: ${response.statusText}`;
        }
      } catch (err: any) {
        lastError = err?.message || String(err);
      }
    }

    return {
      ok: false,
      effectiveUrl: normalized,
      error: lastError,
    };
  }

  /**
   * Fetches the latest workspace snapshot from the backend.
   */
  static async fetchRemoteState(settings: SynapseSettings): Promise<SyncPayload | null> {
    const userId = settings.userId || 'default';

    const response = await this.fetchWithAutoHeal(settings, '/api/v1/sync', {
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
  ): Promise<{ status: string; updated_at: number; version?: number }> {
    const userId = settings.userId || 'default';

    const response = await this.fetchWithAutoHeal(settings, '/api/v1/sync', {
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

    return (await response.json()) as { status: string; updated_at: number; version?: number };
  }

  /**
   * Pings the health endpoint to verify connectivity and readiness.
   */
  static async checkHealth(settings: SynapseSettings): Promise<boolean> {
    try {
      const response = await this.fetchWithAutoHeal(settings, '/api/v1/health', {
        method: 'GET',
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Lists historical backups stored on the server for the active user.
   */
  static async listBackups(settings: SynapseSettings): Promise<BackupListResponse> {
    const userId = settings.userId || 'default';

    const response = await this.fetchWithAutoHeal(settings, '/api/v1/backups', {
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
    const userId = settings.userId || 'default';

    const response = await this.fetchWithAutoHeal(
      settings,
      `/api/v1/backups/${encodeURIComponent(backupId)}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${settings.syncSecret}`,
          'X-User-Id': userId,
        },
      }
    );

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
    const userId = settings.userId || 'default';

    const response = await this.fetchWithAutoHeal(settings, '/api/v1/backups', {
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
  ): Promise<{ status: string; message: string; restored_snapshot: SyncPayload; backup?: any }> {
    const userId = settings.userId || 'default';

    const response = await this.fetchWithAutoHeal(
      settings,
      `/api/v1/backups/${encodeURIComponent(backupId)}/restore`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${settings.syncSecret}`,
          'X-User-Id': userId,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to restore backup (${response.status}): ${errorText}`);
    }

    return (await response.json()) as {
      status: string;
      message: string;
      restored_snapshot: SyncPayload;
      backup?: any;
    };
  }

  /**
   * Downloads the backup file in native SynapseTab JSON format from the server.
   */
  static async downloadBackup(
    settings: SynapseSettings,
    backupId: string
  ): Promise<any> {
    const userId = settings.userId || 'default';

    const response = await this.fetchWithAutoHeal(
      settings,
      `/api/v1/backups/${encodeURIComponent(backupId)}/download`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${settings.syncSecret}`,
          'X-User-Id': userId,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to download backup (${response.status}): ${errorText}`);
    }

    return await response.json();
  }

  /**
   * Deletes a specific backup from the server.
   */
  static async deleteBackup(
    settings: SynapseSettings,
    backupId: string
  ): Promise<{ status: string; message: string }> {
    const userId = settings.userId || 'default';

    const response = await this.fetchWithAutoHeal(
      settings,
      `/api/v1/backups/${encodeURIComponent(backupId)}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${settings.syncSecret}`,
          'X-User-Id': userId,
        },
      }
    );

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
    const userId = settings.userId || 'default';

    const response = await this.fetchWithAutoHeal(settings, '/api/v1/backups/config', {
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

  /**
   * Deletes the active workspace snapshot from the backend.
   */
  static async deleteRemoteWorkspaces(
    settings: SynapseSettings
  ): Promise<{ status: string; message: string; deleted?: boolean }> {
    const userId = settings.userId || 'default';

    const response = await this.fetchWithAutoHeal(settings, '/api/v1/sync', {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${settings.syncSecret}`,
        'X-User-Id': userId,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to delete remote workspaces (${response.status}): ${errorText}`);
    }

    return (await response.json()) as { status: string; message: string; deleted?: boolean };
  }
}
