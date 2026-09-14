import dotenv from 'dotenv';

dotenv.config();

export interface ServerConfig {
  port: number;
  host: string;
  redisUrl: string;
  syncSecret: string;
  defaultUserId: string;
}

export const config: ServerConfig = {
  port: parseInt(process.env.PORT || '8080', 10),
  host: process.env.HOST || '0.0.0.0',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  syncSecret: process.env.SYNC_SECRET || 'synapse_dev_secret_123',
  defaultUserId: process.env.USER_ID || 'default',
};
