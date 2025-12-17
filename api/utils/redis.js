// Redis client for Upstash REST API
const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

/**
 * Execute a Redis command via Upstash REST API
 */
export async function redisCommand(command, ...args) {
  if (!UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_REST_TOKEN) {
    throw new Error('Redis credentials not configured');
  }

  const response = await fetch(UPSTASH_REDIS_REST_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${UPSTASH_REDIS_REST_TOKEN}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify([command, ...args])
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Redis API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data.result;
}

/**
 * Convenience methods for common Redis operations
 */
export const redis = {
  // String operations
  setex: (key, seconds, value) => redisCommand('SETEX', key, seconds, typeof value === 'object' ? JSON.stringify(value) : value),
  get: (key) => redisCommand('GET', key),
  del: (key) => redisCommand('DEL', key),
  expire: (key, seconds) => redisCommand('EXPIRE', key, seconds),
  
  // Sorted Set operations
  zadd: (key, score, member) => redisCommand('ZADD', key, score, member),
  zrem: (key, member) => redisCommand('ZREM', key, member),
  zcard: (key) => redisCommand('ZCARD', key),
  zrange: (key, start, stop, withScores = false) => {
    const args = [key, start, stop];
    if (withScores) args.push('WITHSCORES');
    return redisCommand('ZRANGE', ...args);
  },
  zremrangebyscore: (key, min, max) => redisCommand('ZREMRANGEBYSCORE', key, min, max),
  
  // Key operations
  keys: (pattern) => redisCommand('KEYS', pattern),
  ttl: (key) => redisCommand('TTL', key)
};
