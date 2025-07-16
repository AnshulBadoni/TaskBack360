import Redis from 'ioredis';
import { redisConfig } from "./redis";

export const pub = new Redis(redisConfig);
export const sub = new Redis(redisConfig);

// Handle Redis connection errors
pub.on('error', (err) => console.error('Redis Publisher Error:', err));
sub.on('error', (err) => console.error('Redis Subscriber Error:', err));
