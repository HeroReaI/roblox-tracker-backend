/**
 * Redis client for Upstash
 */
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
  zrange: (key, start, stop, withScores = false) => 
    redisCommand('ZRANGE', key, start, stop, ...(withScores ? ['WITHSCORES'] : [])),
  zremrangebyscore: (key, min, max) => redisCommand('ZREMRANGEBYSCORE', key, min, max),
  
  // Key operations
  keys: (pattern) => redisCommand('KEYS', pattern),
  ttl: (key) => redisCommand('TTL', key),
  
  // Pipeline multiple commands
  pipeline: async (commands) => {
    const results = [];
    for (const [command, ...args] of commands) {
      try {
        const result = await redisCommand(command, ...args);
        results.push({ success: true, result });
      } catch (error) {
        results.push({ success: false, error: error.message });
      }
    }
    return results;
  }
};

/**
 * Test Redis connection
 */
export async function testRedisConnection() {
  try {
    const pong = await redisCommand('PING');
    console.log('Redis connection successful:', pong);
    return { success: true, message: pong };
  } catch (error) {
    console.error('Redis connection failed:', error.message);
    return { success: false, error: error.message };
  }
}
