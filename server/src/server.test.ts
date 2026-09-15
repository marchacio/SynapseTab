import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import RedisMock from 'ioredis-mock';
import { buildServer } from './index.js';
import { SyncPayload } from './types.js';
import { closeRedis, setBackupConfig, saveWorkspaceSnapshot } from './redis.js';
import { BackupScheduler } from './backup-scheduler.js';

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
    await mockRedis.flushall();
    app = await buildServer({ customRedis: mockRedis, enableScheduler: false });
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

  describe('Server Backup Management & Retention Endpoints', () => {
    beforeEach(async () => {
      // Seed a workspace snapshot first
      await app.inject({
        method: 'POST',
        url: '/api/v1/sync',
        headers: {
          Authorization: `Bearer ${validSecret}`,
          'X-User-Id': 'test-user',
        },
        payload: samplePayload,
      });
    });

    it('GET /api/v1/backups returns empty list and default config when no backups created', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/backups',
        headers: {
          Authorization: `Bearer ${validSecret}`,
          'X-User-Id': 'test-user',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.backups).toEqual([]);
      expect(body.config).toBeDefined();
      expect(body.config.interval).toBe('daily');
      expect(body.config.retentionCopies).toBe(10);
    });

    it('POST /api/v1/backups creates a new manual backup', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/backups',
        headers: {
          Authorization: `Bearer ${validSecret}`,
          'X-User-Id': 'test-user',
        },
      });

      expect(res.statusCode).toBe(201);
      const backup = res.json();
      expect(backup.id).toMatch(/^bk_/);
      expect(backup.reason).toBe('manual');
      expect(backup.workspaces_count).toBe(2);
      expect(backup.tabs_count).toBe(2);
      expect(backup.client_id).toBe('laptop-linux-01');
      expect(backup.snapshot).toEqual(samplePayload);

      // Verify backup appears in GET /api/v1/backups
      const listRes = await app.inject({
        method: 'GET',
        url: '/api/v1/backups',
        headers: {
          Authorization: `Bearer ${validSecret}`,
          'X-User-Id': 'test-user',
        },
      });
      expect(listRes.statusCode).toBe(200);
      const listData = listRes.json();
      expect(listData.backups.length).toBe(1);
      expect(listData.backups[0].id).toBe(backup.id);
    });

    it('POST /api/v1/backups fails with 400 when no snapshot exists yet', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/backups',
        headers: {
          Authorization: `Bearer ${validSecret}`,
          'X-User-Id': 'brand-new-user-without-state',
        },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('Bad Request');
    });

    it('GET /api/v1/backups/:id returns detailed backup record for exploration', async () => {
      // 1. Create backup
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/backups',
        headers: {
          Authorization: `Bearer ${validSecret}`,
          'X-User-Id': 'test-user',
        },
      });
      const backupId = createRes.json().id;

      // 2. Fetch specific backup
      const getRes = await app.inject({
        method: 'GET',
        url: `/api/v1/backups/${backupId}`,
        headers: {
          Authorization: `Bearer ${validSecret}`,
          'X-User-Id': 'test-user',
        },
      });

      expect(getRes.statusCode).toBe(200);
      const detail = getRes.json();
      expect(detail.id).toBe(backupId);
      expect(detail.snapshot.workspaces.length).toBe(2);
    });

    it('GET /api/v1/backups/:id returns 404 for non-existent backup', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/backups/non-existent-id',
        headers: {
          Authorization: `Bearer ${validSecret}`,
          'X-User-Id': 'test-user',
        },
      });

      expect(res.statusCode).toBe(404);
    });

    it('POST /api/v1/backups/:id/restore restores snapshot into active workspace state', async () => {
      // 1. Create backup of initial state
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/backups',
        headers: {
          Authorization: `Bearer ${validSecret}`,
          'X-User-Id': 'test-user',
        },
      });
      const backupId = createRes.json().id;

      // 2. Overwrite active state with modified snapshot (e.g. only 1 workspace)
      const modifiedPayload: SyncPayload = {
        ...samplePayload,
        updated_at: 1773339999,
        workspaces: [
          {
            id: 'uni',
            name: 'University Only',
            tabs: [],
          },
        ],
      };
      await app.inject({
        method: 'POST',
        url: '/api/v1/sync',
        headers: {
          Authorization: `Bearer ${validSecret}`,
          'X-User-Id': 'test-user',
        },
        payload: modifiedPayload,
      });

      // Verify active state was modified
      const currentRes = await app.inject({
        method: 'GET',
        url: '/api/v1/sync',
        headers: {
          Authorization: `Bearer ${validSecret}`,
          'X-User-Id': 'test-user',
        },
      });
      expect(currentRes.json().workspaces.length).toBe(1);

      // 3. Restore backup
      const restoreRes = await app.inject({
        method: 'POST',
        url: `/api/v1/backups/${backupId}/restore`,
        headers: {
          Authorization: `Bearer ${validSecret}`,
          'X-User-Id': 'test-user',
        },
      });

      expect(restoreRes.statusCode).toBe(200);
      expect(restoreRes.json().status).toBe('ok');

      // 4. Verify active state is restored
      const afterRestoreRes = await app.inject({
        method: 'GET',
        url: '/api/v1/sync',
        headers: {
          Authorization: `Bearer ${validSecret}`,
          'X-User-Id': 'test-user',
        },
      });
      expect(afterRestoreRes.statusCode).toBe(200);
      const afterRestoreData = afterRestoreRes.json();
      expect(afterRestoreData.workspaces.length).toBe(2);
      expect(afterRestoreData.workspaces[0].name).toBe('University');
    });

    it('DELETE /api/v1/backups/:id removes backup and index entry', async () => {
      // 1. Create backup
      const createRes = await app.inject({
        method: 'POST',
        url: '/api/v1/backups',
        headers: {
          Authorization: `Bearer ${validSecret}`,
          'X-User-Id': 'test-user',
        },
      });
      const backupId = createRes.json().id;

      // 2. Delete backup
      const delRes = await app.inject({
        method: 'DELETE',
        url: `/api/v1/backups/${backupId}`,
        headers: {
          Authorization: `Bearer ${validSecret}`,
          'X-User-Id': 'test-user',
        },
      });
      expect(delRes.statusCode).toBe(200);

      // 3. Verify it is gone
      const listRes = await app.inject({
        method: 'GET',
        url: '/api/v1/backups',
        headers: {
          Authorization: `Bearer ${validSecret}`,
          'X-User-Id': 'test-user',
        },
      });
      expect(listRes.json().backups).toEqual([]);
    });

    it('GET and POST /api/v1/backups/config updates backup schedule and retention', async () => {
      // 1. Update config
      const postConfigRes = await app.inject({
        method: 'POST',
        url: '/api/v1/backups/config',
        headers: {
          Authorization: `Bearer ${validSecret}`,
          'X-User-Id': 'test-user',
        },
        payload: {
          interval: 'weekly',
          retentionCopies: 5,
        },
      });

      expect(postConfigRes.statusCode).toBe(200);
      expect(postConfigRes.json().config).toEqual({
        interval: 'weekly',
        retentionCopies: 5,
      });

      // 2. Fetch config
      const getConfigRes = await app.inject({
        method: 'GET',
        url: '/api/v1/backups/config',
        headers: {
          Authorization: `Bearer ${validSecret}`,
          'X-User-Id': 'test-user',
        },
      });

      expect(getConfigRes.statusCode).toBe(200);
      expect(getConfigRes.json()).toEqual({
        interval: 'weekly',
        retentionCopies: 5,
      });
    });

    it('Enforces retention policy by automatically pruning oldest backups beyond limit', async () => {
      // 1. Set retention limit to 3 copies
      await app.inject({
        method: 'POST',
        url: '/api/v1/backups/config',
        headers: {
          Authorization: `Bearer ${validSecret}`,
          'X-User-Id': 'test-user',
        },
        payload: {
          interval: 'hourly',
          retentionCopies: 3,
        },
      });

      // 2. Create 4 backups with small pauses to ensure unique timestamps
      const backupIds: string[] = [];
      for (let i = 0; i < 4; i++) {
        await new Promise((r) => setTimeout(r, 2));
        const res = await app.inject({
          method: 'POST',
          url: '/api/v1/backups',
          headers: {
            Authorization: `Bearer ${validSecret}`,
            'X-User-Id': 'test-user',
          },
        });
        backupIds.push(res.json().id);
      }

      // 3. Check list
      const listRes = await app.inject({
        method: 'GET',
        url: '/api/v1/backups',
        headers: {
          Authorization: `Bearer ${validSecret}`,
          'X-User-Id': 'test-user',
        },
      });

      const list = listRes.json().backups;
      expect(list.length).toBe(3);
      // Oldest (backupIds[0]) should have been pruned
      const remainingIds = list.map((b: any) => b.id);
      expect(remainingIds).not.toContain(backupIds[0]);
      expect(remainingIds).toContain(backupIds[1]);
      expect(remainingIds).toContain(backupIds[2]);
      expect(remainingIds).toContain(backupIds[3]);
    });
  });

  describe('BackupScheduler Periodic Engine', () => {
    it('creates scheduled backups on periodic check when elapsed time matches policy', async () => {
      // 1. Seed user with workspace snapshot
      await saveWorkspaceSnapshot('scheduler-user', samplePayload);
      await setBackupConfig('scheduler-user', {
        interval: 'hourly',
        retentionCopies: 5,
      });

      const scheduler = new BackupScheduler(1000);
      const createdCount = await scheduler.runPeriodicCheck();
      expect(createdCount).toBe(1);

      // 2. Fetch backups for scheduler-user
      const listRes = await app.inject({
        method: 'GET',
        url: '/api/v1/backups',
        headers: {
          Authorization: `Bearer ${validSecret}`,
          'X-User-Id': 'scheduler-user',
        },
      });

      const list = listRes.json().backups;
      expect(list.length).toBe(1);
      expect(list[0].reason).toBe('scheduled');
      expect(list[0].workspaces_count).toBe(2);

      // Running immediately again without time passing should NOT create another backup
      const secondCheckCount = await scheduler.runPeriodicCheck();
      expect(secondCheckCount).toBe(0);
    });

    it('skips users when backup policy is disabled', async () => {
      await saveWorkspaceSnapshot('disabled-user', samplePayload);
      await setBackupConfig('disabled-user', {
        interval: 'disabled',
        retentionCopies: 5,
      });

      const scheduler = new BackupScheduler(1000);
      const createdCount = await scheduler.runPeriodicCheck();
      expect(createdCount).toBe(0);
    });
  });
});


