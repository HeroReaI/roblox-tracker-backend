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
    const { userId, scriptId, userInfo = {} } = req.body;

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

    // Sanitize scriptId (alphanumeric, dashes, underscores only)
    const sanitizedScriptId = scriptId.replace(/[^a-zA-Z0-9_-]/g, '');
    const sanitizedUserId = userId.substring(0, 100); // Limit length

    const key = `script:${sanitizedScriptId}:user:${sanitizedUserId}`;
    const onlineSetKey = `script:${sanitizedScriptId}:online`;
    const timestamp = Date.now();

    // Generate session ID if not provided
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
    await redis.setex(key, 90, JSON.stringify(userData));
    await redis.zadd(onlineSetKey, timestamp, sanitizedUserId);

    // Cleanup old entries (older than 2 minutes)
    const twoMinutesAgo = timestamp - 120000;
    await redis.zremrangebyscore(onlineSetKey, 0, twoMinutesAgo);

    // Get current online count
    const onlineCount = await redis.zcard(onlineSetKey);

    // Log registration (optional)
    console.log(`[Register] ${sanitizedUserId} - Script: ${sanitizedScriptId} - Total: ${onlineCount}`);

    return res.status(200).json({
      success: true,
      data: {
        userId: sanitizedUserId,
        scriptId: sanitizedScriptId,
        sessionId,
        onlineCount,
        nextHeartbeatIn: 30000, // milliseconds
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
