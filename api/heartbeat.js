import { redis } from './utils/redis.js';

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
    if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Valid userId (non-empty string) is required'
      });
    }

    if (!scriptId || typeof scriptId !== 'string' || scriptId.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Valid scriptId (non-empty string) is required'
      });
    }

    const sanitizedScriptId = scriptId.replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 50);
    const sanitizedUserId = userId.substring(0, 100);
    
    const key = `script:${sanitizedScriptId}:user:${sanitizedUserId}`;
    const onlineSetKey = `script:${sanitizedScriptId}:online`;
    const timestamp = Date.now();

    // Check if user exists and get current data
    const existingData = await redis.get(key);

    if (!existingData) {
      // User doesn't exist or expired (TTL reached)
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

    // CRITICAL: Save with 90-second TTL (matches cleanup time)
    await redis.setex(key, 90, JSON.stringify(userData));
    
    // Update sorted set with new timestamp (this is what keeps user "online")
    await redis.zadd(onlineSetKey, timestamp, sanitizedUserId);

    // CRITICAL: Auto-remove users inactive for 90 seconds
    const ninetySecondsAgo = timestamp - 90000;
    await redis.zremrangebyscore(onlineSetKey, 0, ninetySecondsAgo);

    // Get updated online count
    const onlineCount = await redis.zcard(onlineSetKey);

    return res.status(200).json({
      success: true,
      data: {
        userId: sanitizedUserId,
        scriptId: sanitizedScriptId,
        onlineCount,
        heartbeatCount: userData.heartbeatCount,
        nextHeartbeatIn: 30000, // 30 seconds
        timestamp,
        secondsSinceLastActive: 0 // Just updated
      }
    });

  } catch (error) {
    console.error('Heartbeat error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}
