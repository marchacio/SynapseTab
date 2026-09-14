import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import RedisMock from 'ioredis-mock';
import { buildServer } from './index.js';
import { SyncPayload } from './types.js';
import { closeRedis } from './redis.js';

describe('SynapseTab Server Integration Tests', () => {
  let app: FastifyInstance;
  let mockRedis: any;

  const validSecret = 'synapse_dev_secret_123';
  const samplePayload: SyncPayload = {
    client_id: 'laptop-linux-01',
    updated_at: 1773329000,
    active_workspace_id: 'hacking-p1',
    workspaces: [
      {
        id: 'uni',
        name: 'University',
        tabs: [
          {
            uuid: '550e8400-e29b-41d4-a716-446655440000',
            url: 'https://portal.university.edu',
            title: 'Student Portal',
            favIconUrl: 'https://portal.university.edu/favicon.ico',
            pinned: false,
            index: 0,
          },
        ],
      },
      {
        id: 'hacking-p1',
        name: 'Hacking Project 1',
        tabs: [
          {
            uuid: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
            url: 'https://target.local/admin',
            title: 'Admin Dashboard',
            favIconUrl: 'https://target.local/favicon.ico',
            pinned: false,
            index: 0,
          },
        ],
      },
    ],
  };

  beforeEach(async () => {
    mockRedis = new RedisMock();
    app = await buildServer({ customRedis: mockRedis });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    await closeRedis();
  });

  describe('GET /api/v1/health', () => {
    it('returns 200 OK and health information when Redis is reachable', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/health',
      });

      expect(response.statusCode).toBe(200);
      const data = response.json();
      expect(data.status).toBe('healthy');
      expect(data.redis).toBe('connected');
      expect(data.version).toBe('1.0.0');
      expect(typeof data.uptime).toBe('number');
    });
  });

  describe('Authentication Enforcement', () => {
    it('rejects requests missing Authorization header with 401', async () => {
      const getRes = await app.inject({
        method: 'GET',
        url: '/api/v1/sync',
      });
      expect(getRes.statusCode).toBe(401);

      const postRes = await app.inject({
        method: 'POST',
        url: '/api/v1/sync',
        payload: samplePayload,
      });
      expect(postRes.statusCode).toBe(401);
    });

    it('rejects requests with malformed Authorization header with 401', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/sync',
        headers: {
          Authorization: 'Basic invalidcredentials',
        },
      });
      expect(response.statusCode).toBe(401);
    });

    it('rejects requests with incorrect Bearer token with 401', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/sync',
        headers: {
          Authorization: 'Bearer wrong_token',
        },
      });
      expect(response.statusCode).toBe(401);
    });

    it('allows requests with correct Bearer token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/sync',
        headers: {
          Authorization: `Bearer ${validSecret}`,
        },
      });
      // 404 is expected because no snapshot exists yet, but auth passed!
      expect(response.statusCode).toBe(404);
    });
  });

  describe('Schema Validation on POST /api/v1/sync', () => {
    it('rejects empty payload with 400 Bad Request', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/sync',
        headers: {
          Authorization: `Bearer ${validSecret}`,
        },
        payload: {},
      });
      expect(response.statusCode).toBe(400);
    });

    it('rejects payload missing required fields (workspaces)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/sync',
        headers: {
          Authorization: `Bearer ${validSecret}`,
        },
        payload: {
          client_id: 'client-1',
          updated_at: 123456,
          active_workspace_id: 'w1',
        },
      });
      expect(response.statusCode).toBe(400);
    });

    it('rejects payload with invalid tab data (negative index)', async () => {
      const invalidPayload = {
        ...samplePayload,
        workspaces: [
          {
            id: 'test',
            name: 'Test',
            tabs: [
              {
                uuid: 'tab-1',
                url: 'https://example.com',
                title: 'Example',
                pinned: false,
                index: -1, // invalid
              },
            ],
          },
        ],
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/sync',
        headers: {
          Authorization: `Bearer ${validSecret}`,
        },
        payload: invalidPayload,
      });
      expect(response.statusCode).toBe(400);
    });
  });

  describe('End-to-End Read/Write Persistence to Redis', () => {
    it('successfully persists and retrieves workspace snapshot', async () => {
      // 1. Post valid payload
      const postRes = await app.inject({
        method: 'POST',
        url: '/api/v1/sync',
        headers: {
          Authorization: `Bearer ${validSecret}`,
        },
        payload: samplePayload,
      });

      expect(postRes.statusCode).toBe(200);
      const postData = postRes.json();
      expect(postData.status).toBe('ok');
      expect(postData.updated_at).toBe(samplePayload.updated_at);

      // 2. Retrieve state
      const getRes = await app.inject({
        method: 'GET',
        url: '/api/v1/sync',
        headers: {
          Authorization: `Bearer ${validSecret}`,
        },
      });

      expect(getRes.statusCode).toBe(200);
      const retrieved = getRes.json();
      expect(retrieved).toEqual(samplePayload);
    });

    it('isolates state per user ID header', async () => {
      const userAPayload: SyncPayload = {
        ...samplePayload,
        client_id: 'user-a-device',
      };

      // Save for user-a
      await app.inject({
        method: 'POST',
        url: '/api/v1/sync',
        headers: {
          Authorization: `Bearer ${validSecret}`,
          'X-User-Id': 'alice',
        },
        payload: userAPayload,
      });

      // User bob should receive 404
      const bobRes = await app.inject({
        method: 'GET',
        url: '/api/v1/sync',
        headers: {
          Authorization: `Bearer ${validSecret}`,
          'X-User-Id': 'bob',
        },
      });
      expect(bobRes.statusCode).toBe(404);

      // User alice should receive userAPayload
      const aliceRes = await app.inject({
        method: 'GET',
        url: '/api/v1/sync',
        headers: {
          Authorization: `Bearer ${validSecret}`,
          'X-User-Id': 'alice',
        },
      });
      expect(aliceRes.statusCode).toBe(200);
      expect(aliceRes.json().client_id).toBe('user-a-device');
    });
  });
});
