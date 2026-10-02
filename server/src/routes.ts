import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { SyncPayloadSchema, BackupConfigSchema } from './schema.js';
import {
  SyncPayload,
  HealthResponse,
  SyncResponse,
  BackupRecord,
  BackupConfig,
  BackupListResponse,
  TabItem,
} from './types.js';
import {
  saveWorkspaceSnapshot,
  getWorkspaceSnapshot,
  deleteWorkspaceSnapshot,
  pingRedis,
  saveBackup,
  listBackups,
  getBackup,
  deleteBackup,
  getBackupConfig,
  setBackupConfig,
} from './redis.js';
import { config } from './config.js';
import { exportToSynapseFormat, importFromSynapseFormat } from './backup-format.js';

export async function registerRoutes(fastify: FastifyInstance): Promise<void> {
  // Authentication preHandler hook for sync and backup routes
  const authenticateBearer = async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      reply.status(401).send({
        error: 'Unauthorized',
        message: 'Missing Authorization header',
      });
      return;
    }

    const [scheme, token] = authHeader.split(' ');
    if (scheme !== 'Bearer' || !token) {
      reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid Authorization header format. Expected Bearer <token>',
      });
      return;
    }

    if (token !== config.syncSecret) {
      reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid sync secret',
      });
      return;
    }
  };

  // GET /api/v1/health - Readiness probe returning 200 OK and Redis ping status
  fastify.get('/api/v1/health', async (_request, reply) => {
    const isRedisConnected = await pingRedis();
    const response: HealthResponse = {
      status: isRedisConnected ? 'healthy' : 'degraded',
      redis: isRedisConnected ? 'connected' : 'disconnected',
      uptime: Math.floor(process.uptime()),
      timestamp: Math.floor(Date.now() / 1000),
      version: '1.4.1',
    };

    if (!isRedisConnected) {
      return reply.status(503).send(response);
    }

    return reply.status(200).send(response);
  });

  // POST /api/v1/sync - Validates payload schema and persists workspace snapshot to Redis
  fastify.post<{ Body: SyncPayload }>(
    '/api/v1/sync',
    {
      preHandler: [authenticateBearer],
      schema: {
        body: SyncPayloadSchema,
      },
    },
    async (request, reply) => {
      const payload = request.body;
      const userId = (request.headers['x-user-id'] as string) || config.defaultUserId;

      await saveWorkspaceSnapshot(userId, payload);

      const response: SyncResponse = {
        status: 'ok',
        updated_at: payload.updated_at,
        ...(payload.version !== undefined ? { version: payload.version } : {}),
      };

      return reply.status(200).send(response);
    }
  );

  // GET /api/v1/sync - Returns the latest workspace snapshot
  fastify.get(
    '/api/v1/sync',
    {
      preHandler: [authenticateBearer],
    },
    async (request, reply) => {
      const userId = (request.headers['x-user-id'] as string) || config.defaultUserId;
      const snapshot = await getWorkspaceSnapshot(userId);

      if (!snapshot) {
        return reply.status(404).send({
          error: 'Not Found',
          message: `No workspace snapshot found for user: ${userId}`,
        });
      }

      return reply.status(200).send(snapshot);
    }
  );

  // DELETE /api/v1/sync - Deletes the active workspace snapshot from Redis
  fastify.delete(
    '/api/v1/sync',
    {
      preHandler: [authenticateBearer],
    },
    async (request, reply) => {
      const userId = (request.headers['x-user-id'] as string) || config.defaultUserId;
      const deleted = await deleteWorkspaceSnapshot(userId);

      return reply.status(200).send({
        status: 'ok',
        deleted,
        message: `Workspaces for user ${userId} deleted from remote server`,
      });
    }
  );

  // GET /api/v1/backups - Returns list of user's backups + current backup configuration
  fastify.get(
    '/api/v1/backups',
    {
      preHandler: [authenticateBearer],
    },
    async (request, reply) => {
      const userId = (request.headers['x-user-id'] as string) || config.defaultUserId;
      const backups = await listBackups(userId);
      const userConfig = await getBackupConfig(userId);

      const response: BackupListResponse = {
        backups,
        config: userConfig,
      };

      return reply.status(200).send(response);
    }
  );

  // POST /api/v1/backups - Triggers an immediate manual backup of the current workspace snapshot
  fastify.post(
    '/api/v1/backups',
    {
      preHandler: [authenticateBearer],
    },
    async (request, reply) => {
      const userId = (request.headers['x-user-id'] as string) || config.defaultUserId;
      const snapshot = await getWorkspaceSnapshot(userId);

      if (!snapshot) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Cannot create backup: no workspace snapshot found yet for user.',
        });
      }

      const userConfig = await getBackupConfig(userId);
      const backupId = `bk_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const totalTabs = snapshot.workspaces.reduce(
        (acc, ws) => acc + (ws.tabs ? ws.tabs.length : 0),
        0
      );

      const pinnedTabs: TabItem[] = snapshot.workspaces.flatMap((w) =>
        (w.tabs || []).filter((t) => t.pinned)
      );
      const backupJson = exportToSynapseFormat(snapshot.workspaces, pinnedTabs, '1.4.1');

      const record: BackupRecord = {
        id: backupId,
        timestamp: Date.now(),
        reason: 'manual',
        workspaces_count: snapshot.workspaces.length,
        tabs_count: totalTabs,
        client_id: snapshot.client_id,
        snapshot,
        backup: backupJson,
      };

      await saveBackup(userId, record, userConfig.retentionCopies);

      return reply.status(201).send(record);
    }
  );

  // GET /api/v1/backups/:id - Returns full backup record including snapshot details (for exploration)
  fastify.get<{ Params: { id: string } }>(
    '/api/v1/backups/:id',
    {
      preHandler: [authenticateBearer],
    },
    async (request, reply) => {
      const userId = (request.headers['x-user-id'] as string) || config.defaultUserId;
      const { id } = request.params;
      const backup = await getBackup(userId, id);

      if (!backup) {
        return reply.status(404).send({
          error: 'Not Found',
          message: `Backup ${id} not found`,
        });
      }

      return reply.status(200).send(backup);
    }
  );

  // GET /api/v1/backups/:id/download - Downloads the backup JSON file in native SynapseTab format
  fastify.get<{ Params: { id: string } }>(
    '/api/v1/backups/:id/download',
    {
      preHandler: [authenticateBearer],
    },
    async (request, reply) => {
      const userId = (request.headers['x-user-id'] as string) || config.defaultUserId;
      const { id } = request.params;
      const backup = await getBackup(userId, id);

      if (!backup) {
        return reply.status(404).send({
          error: 'Not Found',
          message: `Backup ${id} not found`,
        });
      }

      const backupData =
        backup.backup ||
        exportToSynapseFormat(
          backup.snapshot.workspaces,
          backup.snapshot.workspaces.flatMap((w) => (w.tabs || []).filter((t) => t.pinned)),
          '1.4.1'
        );

      reply.header('Content-Type', 'application/json; charset=utf-8');
      reply.header('Content-Disposition', `attachment; filename="synapsetab-backup-${id}.json"`);
      return reply.status(200).send(backupData);
    }
  );

  // POST /api/v1/backups/:id/restore - Restores backup snapshot to the active workspace state
  fastify.post<{ Params: { id: string } }>(
    '/api/v1/backups/:id/restore',
    {
      preHandler: [authenticateBearer],
    },
    async (request, reply) => {
      const userId = (request.headers['x-user-id'] as string) || config.defaultUserId;
      const { id } = request.params;
      const backup = await getBackup(userId, id);

      if (!backup) {
        return reply.status(404).send({
          error: 'Not Found',
          message: `Backup ${id} not found`,
        });
      }

      let restoredWorkspaces = backup.snapshot.workspaces;
      if (backup.backup) {
        try {
          const importResult = importFromSynapseFormat(backup.backup);
          restoredWorkspaces = importResult.workspaces;
        } catch (e) {
          console.warn('[Restore] Failed to parse backup.backup with importFromSynapseFormat, falling back to snapshot:', e);
          restoredWorkspaces = backup.snapshot.workspaces;
        }
      }

      const restoredPayload: SyncPayload = {
        ...backup.snapshot,
        workspaces: restoredWorkspaces,
        updated_at: Math.floor(Date.now() / 1000),
      };

      await saveWorkspaceSnapshot(userId, restoredPayload);

      return reply.status(200).send({
        status: 'ok',
        message: `Backup ${id} restored successfully`,
        restored_snapshot: restoredPayload,
        backup: backup.backup,
      });
    }
  );

  // DELETE /api/v1/backups/:id - Deletes a backup from Redis
  fastify.delete<{ Params: { id: string } }>(
    '/api/v1/backups/:id',
    {
      preHandler: [authenticateBearer],
    },
    async (request, reply) => {
      const userId = (request.headers['x-user-id'] as string) || config.defaultUserId;
      const { id } = request.params;

      const deleted = await deleteBackup(userId, id);
      if (!deleted) {
        return reply.status(404).send({
          error: 'Not Found',
          message: `Backup ${id} not found`,
        });
      }

      return reply.status(200).send({
        status: 'ok',
        message: `Backup ${id} deleted successfully`,
      });
    }
  );

  // GET /api/v1/backups/config - Returns backup schedule and retention config
  fastify.get(
    '/api/v1/backups/config',
    {
      preHandler: [authenticateBearer],
    },
    async (request, reply) => {
      const userId = (request.headers['x-user-id'] as string) || config.defaultUserId;
      const userConfig = await getBackupConfig(userId);
      return reply.status(200).send(userConfig);
    }
  );

  // POST /api/v1/backups/config - Updates backup schedule and retention config
  fastify.post<{ Body: BackupConfig }>(
    '/api/v1/backups/config',
    {
      preHandler: [authenticateBearer],
      schema: {
        body: BackupConfigSchema,
      },
    },
    async (request, reply) => {
      const userId = (request.headers['x-user-id'] as string) || config.defaultUserId;
      const newConfig = request.body;

      await setBackupConfig(userId, newConfig);

      return reply.status(200).send({
        status: 'ok',
        config: newConfig,
      });
    }
  );
}

