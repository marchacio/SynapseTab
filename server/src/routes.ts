import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { SyncPayloadSchema } from './schema.js';
import { SyncPayload, HealthResponse, SyncResponse } from './types.js';
import { saveWorkspaceSnapshot, getWorkspaceSnapshot, pingRedis } from './redis.js';
import { config } from './config.js';

export async function registerRoutes(fastify: FastifyInstance): Promise<void> {
  // Authentication preHandler hook for sync routes
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
      version: '1.0.0',
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
}
