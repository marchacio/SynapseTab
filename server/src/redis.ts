import Redis, { Redis as RedisClient } from 'ioredis';
import { SyncPayload, BackupRecord, BackupMetadata, BackupConfig } from './types.js';
import { config } from './config.js';

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

export function getBackupIndexKey(userId: string): string {
  return `tabvortex:backups:index:${userId}`;
}

export function getBackupDataKey(userId: string, backupId: string): string {
  return `tabvortex:backup:${userId}:${backupId}`;
}

export function getBackupConfigKey(userId: string): string {
  return `tabvortex:backup:config:${userId}`;
}

export function getUsersSetKey(): string {
  return `tabvortex:users`;
}

export async function saveWorkspaceSnapshot(
  userId: string,
  payload: SyncPayload
): Promise<void> {
  const redis = getRedisClient();
  const key = getWorkspaceRedisKey(userId);
  await redis.set(key, JSON.stringify(payload));
  await redis.sadd(getUsersSetKey(), userId);
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

export async function saveBackup(
  userId: string,
  record: BackupRecord,
  maxCopies: number = config.backupRetentionCopies
): Promise<void> {
  const redis = getRedisClient();
  const dataKey = getBackupDataKey(userId, record.id);
  const indexKey = getBackupIndexKey(userId);

  // Save full record data
  await redis.set(dataKey, JSON.stringify(record));
  // Add to sorted set indexed by timestamp
  await redis.zadd(indexKey, record.timestamp, record.id);
  await redis.sadd(getUsersSetKey(), userId);

  // Retention pruning
  const totalCount = await redis.zcard(indexKey);
  if (totalCount > maxCopies) {
    const removeCount = totalCount - maxCopies;
    const oldBackupIds = await redis.zrange(indexKey, 0, removeCount - 1);
    if (oldBackupIds.length > 0) {
      for (const oldId of oldBackupIds) {
        await redis.del(getBackupDataKey(userId, oldId));
      }
      await redis.zrem(indexKey, ...oldBackupIds);
    }
  }
}

export async function listBackups(userId: string): Promise<BackupMetadata[]> {
  const redis = getRedisClient();
  const indexKey = getBackupIndexKey(userId);
  const backupIds = await redis.zrevrange(indexKey, 0, -1);

  if (!backupIds || backupIds.length === 0) {
    return [];
  }

  const results: BackupMetadata[] = [];
  for (const id of backupIds) {
    const raw = await redis.get(getBackupDataKey(userId, id));
    if (raw) {
      try {
        const record = JSON.parse(raw) as BackupRecord;
        results.push({
          id: record.id,
          timestamp: record.timestamp,
          reason: record.reason,
          workspaces_count: record.workspaces_count,
          tabs_count: record.tabs_count,
          client_id: record.client_id,
          size_bytes: record.size_bytes ?? raw.length,
        });
      } catch {
        // Skip malformed records
      }
    }
  }

  return results;
}

export async function getBackup(
  userId: string,
  backupId: string
): Promise<BackupRecord | null> {
  const redis = getRedisClient();
  const raw = await redis.get(getBackupDataKey(userId, backupId));
  if (!raw) {
    return null;
  }
  return JSON.parse(raw) as BackupRecord;
}

export async function deleteBackup(
  userId: string,
  backupId: string
): Promise<boolean> {
  const redis = getRedisClient();
  const indexKey = getBackupIndexKey(userId);
  const dataKey = getBackupDataKey(userId, backupId);

  const removedFromIndex = await redis.zrem(indexKey, backupId);
  const removedData = await redis.del(dataKey);

  return removedFromIndex > 0 || removedData > 0;
}

export async function getBackupConfig(userId: string): Promise<BackupConfig> {
  const redis = getRedisClient();
  const raw = await redis.get(getBackupConfigKey(userId));
  if (!raw) {
    return {
      interval: config.backupInterval,
      retentionCopies: config.backupRetentionCopies,
    };
  }
  try {
    return JSON.parse(raw) as BackupConfig;
  } catch {
    return {
      interval: config.backupInterval,
      retentionCopies: config.backupRetentionCopies,
    };
  }
}

export async function setBackupConfig(
  userId: string,
  backupConfig: BackupConfig
): Promise<void> {
  const redis = getRedisClient();
  await redis.set(getBackupConfigKey(userId), JSON.stringify(backupConfig));
  await redis.sadd(getUsersSetKey(), userId);
}

export async function getUserIdsWithWorkspaces(): Promise<string[]> {
  const redis = getRedisClient();
  const users = await redis.smembers(getUsersSetKey());
  if (!users || users.length === 0) {
    return [config.defaultUserId];
  }
  return users;
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

