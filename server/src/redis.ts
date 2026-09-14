import Redis, { Redis as RedisClient } from 'ioredis';
import { SyncPayload } from './types.js';

let client: RedisClient | null = null;

export function createRedisClient(url: string, customClient?: RedisClient): RedisClient {
  if (customClient) {
    client = customClient;
    return client;
  }

  // Handle ESM / CJS interop for ioredis constructor
  const RedisCtor: any = (Redis as any).default || Redis;

  const newClient: RedisClient = new RedisCtor(url, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: true,
    retryStrategy(times: number) {
      const delay = Math.min(times * 100, 3000);
      return delay;
    },
  });

  newClient.on('error', (err: Error) => {
    // Log Redis errors without crashing server immediately
    console.error('[Redis Client Error]', err.message);
  });

  client = newClient;
  return client;
}

export function getRedisClient(): RedisClient {
  if (!client) {
    throw new Error('Redis client not initialized. Call createRedisClient first.');
  }
  return client;
}

export function setRedisClient(customClient: RedisClient): void {
  client = customClient;
}

export function getWorkspaceRedisKey(userId: string): string {
  return `tabvortex:workspaces:${userId}`;
}

export async function saveWorkspaceSnapshot(
  userId: string,
  payload: SyncPayload
): Promise<void> {
  const redis = getRedisClient();
  const key = getWorkspaceRedisKey(userId);
  await redis.set(key, JSON.stringify(payload));
}

export async function getWorkspaceSnapshot(
  userId: string
): Promise<SyncPayload | null> {
  const redis = getRedisClient();
  const key = getWorkspaceRedisKey(userId);
  const data = await redis.get(key);
  if (!data) {
    return null;
  }
  return JSON.parse(data) as SyncPayload;
}

export async function pingRedis(): Promise<boolean> {
  try {
    const redis = getRedisClient();
    const result = await redis.ping();
    return result === 'PONG';
  } catch {
    return false;
  }
}

export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
  }
}
