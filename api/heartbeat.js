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
      // User doesn't exist or expired
      return res.status(404).json({
        success: false,
        error: 'User session not found or expired',
        code: 'SESSION_EXPIRED',
        action: 're-register'
      });
    }

    // Update heartbeat info
    existingData.lastHeartbeat = timestamp;
    existingData.heartbeatCount = (existingData.heartbeatCount || 0) + 1;
    existingData.updatedAt = timestamp;

    // Save updated data with fresh TTL
    await redis.setex(key, 90, existingData);
    
    // Update sorted set with new timestamp
    await redis.zadd(onlineSetKey, timestamp, sanitizedUserId);

    // Cleanup inactive users (older than 2 minutes)
    const twoMinutesAgo = timestamp - 120000;
    await redis.zremrangebyscore(onlineSetKey, 0, twoMinutesAgo);

    // Get updated online count
    const onlineCount = await redis.zcard(onlineSetKey);

    return res.status(200).json({
      success: true,
      data: {
        userId: sanitizedUserId,
        scriptId: sanitizedScriptId,
        onlineCount,
        heartbeatCount: existingData.heartbeatCount,
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
