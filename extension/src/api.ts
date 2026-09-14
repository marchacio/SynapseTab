import { SyncPayload, SynapseSettings } from './types.js';

/**
 * HTTP Client communicating with the SynapseTab backend service.
 */

export class SynapseApiClient {
  /**
   * Fetches the latest workspace snapshot from the backend.
   */
  static async fetchRemoteState(settings: SynapseSettings): Promise<SyncPayload | null> {
    const url = `${settings.backendUrl.replace(/\/+$/, '')}/api/v1/sync`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${settings.syncSecret}`,
        'X-User-Id': settings.clientId,
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

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.syncSecret}`,
        'X-User-Id': settings.clientId,
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
}
