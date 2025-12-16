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
    const { userId, scriptId, userInfo = {} } = req.body;

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

    // Sanitize inputs
    const sanitizedScriptId = scriptId.replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 50);
    const sanitizedUserId = userId.substring(0, 100);
    
    const key = `script:${sanitizedScriptId}:user:${sanitizedUserId}`;
    const onlineSetKey = `script:${sanitizedScriptId}:online`;
    const timestamp = Date.now();

    // Generate session ID
    const sessionId = userInfo.sessionId || 
      Math.random().toString(36).substring(2, 15) + 
      Math.random().toString(36).substring(2, 15);

    // User data to store
    const userData = {
      userId: sanitizedUserId,
      scriptId: sanitizedScriptId,
      userInfo: {
        ...userInfo,
        sessionId,
        ip: req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown'
      },
      lastHeartbeat: timestamp,
      registeredAt: timestamp,
      heartbeatCount: 1
    };

    // Execute Redis operations
    await redis.setex(key, 90, userData);
    await redis.zadd(onlineSetKey, timestamp, sanitizedUserId);

    // Cleanup old entries (older than 2 minutes)
    const twoMinutesAgo = timestamp - 120000;
    await redis.zremrangebyscore(onlineSetKey, 0, twoMinutesAgo);

    // Get current online count
    const onlineCount = await redis.zcard(onlineSetKey);

    return res.status(200).json({
      success: true,
      data: {
        userId: sanitizedUserId,
        scriptId: sanitizedScriptId,
        sessionId,
        onlineCount,
        nextHeartbeatIn: 30000,
        timestamp
      }
    });

  } catch (error) {
    console.error('Registration error:', error);

    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
