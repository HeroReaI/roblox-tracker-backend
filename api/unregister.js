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

    // Remove user from tracking
    const [deleteResult, removeResult] = await Promise.all([
      redis.del(key),
      redis.zrem(onlineSetKey, sanitizedUserId)
    ]);

    // Get updated online count
    const onlineCount = await redis.zcard(onlineSetKey);

    console.log(`[Unregister] ${sanitizedUserId} - Script: ${sanitizedScriptId} - Remaining: ${onlineCount}`);

    return res.status(200).json({
      success: true,
      data: {
        userId: sanitizedUserId,
        scriptId: sanitizedScriptId,
        onlineCount,
        removed: deleteResult > 0,
        timestamp: Date.now()
      }
    });

  } catch (error) {
    console.error('Unregister error:', error);

    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
