import { redis } from './redis';

export const getOrSetCache = async <T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds = 3600
): Promise<T> => {
  const cachedData = await redis.get(key);

  if (cachedData) {
    console.log(`Cache hit for key: ${key}`);
    return JSON.parse(cachedData) as T;
  }
  console.log(`Cache miss for key: ${key}`);
  const data = await fetcher();

  await redis.set(key, JSON.stringify(data), "EX", ttlSeconds);
  return data;
};
