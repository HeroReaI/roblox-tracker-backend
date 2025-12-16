import { redis } from '../../lib/redis';

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false, 
      error: 'Method not allowed. Use POST.' 
    });
  }

  try {
    const { userId, scriptId } = req.body;

    // Validate input
    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Valid userId (string) is required'
      });
    }

    if (!scriptId || typeof scriptId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Valid scriptId (string) is required'
      });
    }

    const sanitizedScriptId = scriptId.replace(/[^a-zA-Z0-9_-]/g, '');
    const sanitizedUserId = userId.substring(0, 100);
    
    const key = `script:${sanitizedScriptId}:user:${sanitizedUserId}`;
    const onlineSetKey = `script:${sanitizedScriptId}:online`;
    const timestamp = Date.now();

    // Check if user exists and get current data
    const existingData = await redis.get(key);

    if (!existingData) {
      // User doesn't exist or expired
      return res.status(404).json({
        success: false,
        error: 'User session not found or expired',
        code: 'SESSION_EXPIRED',
        action: 're-register'
      });
    }

    // Parse and update user data
    let userData;
    try {
      userData = JSON.parse(existingData);
    } catch (parseError) {
      // Corrupted data, delete and ask for re-registration
      await redis.del(key);
      await redis.zrem(onlineSetKey, sanitizedUserId);
      
      return res.status(410).json({
        success: false,
        error: 'Session data corrupted',
        code: 'DATA_CORRUPTED',
        action: 're-register'
      });
    }

    // Update heartbeat info
    userData.lastHeartbeat = timestamp;
    userData.heartbeatCount = (userData.heartbeatCount || 0) + 1;
    userData.updatedAt = timestamp;

    // Save updated data with fresh TTL
    await redis.setex(key, 90, JSON.stringify(userData));
    
    // Update sorted set with new timestamp
    await redis.zadd(onlineSetKey, timestamp, sanitizedUserId);

    // Cleanup inactive users (older than 2 minutes)
    const twoMinutesAgo = timestamp - 120000;
    await redis.zremrangebyscore(onlineSetKey, 0, twoMinutesAgo);

    // Get updated online count
    const onlineCount = await redis.zcard(onlineSetKey);

    // Log heartbeat (optional)
    if (userData.heartbeatCount % 10 === 0) {
      console.log(`[Heartbeat] ${sanitizedUserId} - Count: ${userData.heartbeatCount} - Total: ${onlineCount}`);
    }

    return res.status(200).json({
      success: true,
      data: {
        userId: sanitizedUserId,
        scriptId: sanitizedScriptId,
        onlineCount,
        heartbeatCount: userData.heartbeatCount,
        nextHeartbeatIn: 30000,
        timestamp
      }
    });

  } catch (error) {
    console.error('Heartbeat error:', error);

    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
