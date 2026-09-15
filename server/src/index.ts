import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import { createRedisClient, closeRedis } from './redis.js';
import { registerRoutes } from './routes.js';
import { BackupScheduler } from './backup-scheduler.js';
import { Redis as RedisClient } from 'ioredis';

export interface BuildServerOptions {
  customRedis?: RedisClient;
  enableScheduler?: boolean;
  schedulerIntervalMs?: number;
}

export async function buildServer(options: BuildServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    bodyLimit: 25 * 1024 * 1024,
    logger: process.env.NODE_ENV === 'test' ? false : {
      level: 'info',
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
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  });

  // Initialize Redis
  createRedisClient(config.redisUrl, options.customRedis);

  // Register API endpoints
  await registerRoutes(app);

  // Initialize and start backup scheduler if enabled
  const shouldEnableScheduler = options.enableScheduler ?? (process.env.NODE_ENV !== 'test');
  if (shouldEnableScheduler) {
    const scheduler = new BackupScheduler(options.schedulerIntervalMs);
    scheduler.start();
    app.addHook('onClose', async () => {
      scheduler.stop();
    });
  }

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
