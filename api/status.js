import { redis } from '../../lib/redis';

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ 
      success: false, 
      error: 'Method not allowed. Use GET.' 
    });
  }

  try {
    const { scriptId = 'default', detailed = 'false' } = req.query;
    const sanitizedScriptId = scriptId.replace(/[^a-zA-Z0-9_-]/g, '');
    const timestamp = Date.now();

    const onlineSetKey = `script:${sanitizedScriptId}:online`;

    // Cleanup inactive users first (older than 2 minutes)
    const twoMinutesAgo = timestamp - 120000;
    await redis.zremrangebyscore(onlineSetKey, 0, twoMinutesAgo);

    // Get online count
    const onlineCount = await redis.zcard(onlineSetKey);

    // Get detailed user info if requested
    let detailedUsers = [];
    const includeDetails = detailed === 'true' || detailed === '1';

    if (includeDetails && onlineCount > 0) {
      // Get all user IDs from sorted set
      const userIds = await redis.zrange(onlineSetKey, 0, -1);
      
      // Get detailed info for each user
      const userPromises = userIds.map(async (userId) => {
        const key = `script:${sanitizedScriptId}:user:${userId}`;
        const userData = await redis.get(key);
        
        if (userData) {
          try {
            const parsedData = JSON.parse(userData);
            const lastActive = parsedData.lastHeartbeat || timestamp;
            const secondsAgo = Math.floor((timestamp - lastActive) / 1000);
            
            return {
              userId,
              ...parsedData,
              lastActive,
              secondsAgo,
              ttl: await redis.ttl(key)
            };
          } catch (e) {
            return { userId, error: 'Failed to parse data' };
          }
        }
        return { userId, error: 'No data found' };
      });

      detailedUsers = await Promise.all(userPromises);
    }

    // Get Redis memory info (if available)
    let memoryInfo = {};
    try {
      // This might not work on all Redis instances
      const memory = await redisCommand('INFO', 'memory');
      if (memory && typeof memory === 'string') {
        const usedMatch = memory.match(/used_memory:(\d+)/);
        if (usedMatch) {
          memoryInfo.usedMemory = parseInt(usedMatch[1]);
          memoryInfo.usedMemoryMB = (memoryInfo.usedMemory / 1024 / 1024).toFixed(2);
        }
      }
    } catch (e) {
      // Ignore memory info errors
    }

    return res.status(200).json({
      success: true,
      data: {
        scriptId: sanitizedScriptId,
        onlineCount,
        detailedUsers: includeDetails ? detailedUsers : undefined,
        userCount: onlineCount,
        timestamp,
        cleanupThresholdSeconds: 120,
        memory: memoryInfo.usedMemoryMB ? memoryInfo : undefined,
        uptime: process.uptime()
      }
    });

  } catch (error) {
    console.error('Status error:', error);

    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
