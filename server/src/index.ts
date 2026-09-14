import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import { createRedisClient, closeRedis } from './redis.js';
import { registerRoutes } from './routes.js';
import { Redis as RedisClient } from 'ioredis';

export async function buildServer(options: { customRedis?: RedisClient } = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: process.env.NODE_ENV === 'test' ? false : {
      level: 'info',
      transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined,
    },
    ajv: {
      customOptions: {
        coerceTypes: false,
        allErrors: true,
      },
    },
  });

  await app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'OPTIONS'],
  });

  // Initialize Redis
  createRedisClient(config.redisUrl, options.customRedis);

  // Register API endpoints
  await registerRoutes(app);

  return app;
}

async function start() {
  try {
    const server = await buildServer();

    await server.listen({
      port: config.port,
      host: config.host,
    });

    console.log(`[SynapseTab Server] Listening on http://${config.host}:${config.port}`);
  } catch (err) {
    console.error('[SynapseTab Server Error]', err);
    await closeRedis();
    process.exit(1);
  }
}

// Start server if this is the main entry point
if (process.env.NODE_ENV !== 'test') {
  start();
}
