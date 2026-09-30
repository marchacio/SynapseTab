import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SynapseApiClient } from '../src/api.js';

describe('SynapseApiClient URL Normalization and Auto-Healing', () => {
  it('normalizes URLs without protocol to http://', () => {
    expect(SynapseApiClient.normalizeUrl('192.168.1.8:8080')).toBe('http://192.168.1.8:8080');
    expect(SynapseApiClient.normalizeUrl('192.168.1.8:8080/')).toBe('http://192.168.1.8:8080');
    expect(SynapseApiClient.normalizeUrl('localhost:8080')).toBe('http://localhost:8080');
  });

  it('preserves existing http and https protocols while stripping trailing slashes', () => {
    expect(SynapseApiClient.normalizeUrl('http://192.168.1.8:8080/')).toBe('http://192.168.1.8:8080');
    expect(SynapseApiClient.normalizeUrl('https://synapse.home.lan///')).toBe('https://synapse.home.lan');
  });

  it('defaults empty string to http://localhost:8080', () => {
    expect(SynapseApiClient.normalizeUrl('')).toBe('http://localhost:8080');
  });

  it('auto-switches from https to http when https fails with network/SSL error', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.startsWith('https://')) {
        return Promise.reject(new TypeError('SSL_ERROR_RX_RECORD_TOO_LONG'));
      }
      if (url.startsWith('http://')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'healthy', redis: 'connected' }),
        });
      }
      return Promise.reject(new Error('Unknown url'));
    });

    vi.stubGlobal('fetch', fetchMock);

    const result = await SynapseApiClient.testConnection('https://192.168.1.8:8080', 'secret123');
    expect(result.ok).toBe(true);
    expect(result.effectiveUrl).toBe('http://192.168.1.8:8080');
    expect(result.autoSwitchedProtocol).toBe(true);
    expect(result.status).toBe('healthy');
  });

  it('auto-switches from http to https when http fails but https succeeds', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.startsWith('http://')) {
        return Promise.reject(new TypeError('NetworkError when attempting to fetch resource'));
      }
      if (url.startsWith('https://')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'healthy', redis: 'connected' }),
        });
      }
      return Promise.reject(new Error('Unknown url'));
    });

    vi.stubGlobal('fetch', fetchMock);

    const result = await SynapseApiClient.testConnection('http://secure.synapsetab.org', 'secret123');
    expect(result.ok).toBe(true);
    expect(result.effectiveUrl).toBe('https://secure.synapsetab.org');
    expect(result.autoSwitchedProtocol).toBe(true);
  });
});
