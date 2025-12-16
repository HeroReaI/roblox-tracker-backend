import { redis } from './utils/redis.js';

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
    const sanitizedScriptId = scriptId.replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 50);
    const timestamp = Date.now();

    const onlineSetKey = `script:${sanitizedScriptId}:online`;

    // CRITICAL: Auto-remove users inactive for 90 seconds
    const ninetySecondsAgo = timestamp - 90000; // 90,000ms = 90 seconds
    await redis.zremrangebyscore(onlineSetKey, 0, ninetySecondsAgo);

    // Get current online count AFTER cleanup
    const onlineCount = await redis.zcard(onlineSetKey);

    // Get detailed user info if requested
    let detailedUsers = [];
    const includeDetails = detailed === 'true' || detailed === '1';

    if (includeDetails && onlineCount > 0) {
      // Get all user IDs from sorted set with scores
      const usersWithScores = await redis.zrange(onlineSetKey, 0, -1, true);
      
      // Process users
      for (let i = 0; i < usersWithScores.length; i += 2) {
        const userId = usersWithScores[i];
        const lastActive = parseInt(usersWithScores[i + 1]);
        const secondsAgo = Math.floor((timestamp - lastActive) / 1000);
        
        // Only include users active within 90 seconds
        if (secondsAgo < 90) {
          try {
            const key = `script:${sanitizedScriptId}:user:${userId}`;
            const userData = await redis.get(key);
            if (userData) {
              detailedUsers.push({
                userId,
                ...userData,
                lastActive,
                secondsAgo,
                status: secondsAgo < 30 ? 'active' : 'idle'
              });
            }
          } catch (e) {
            // Skip corrupted data
          }
        }
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        scriptId: sanitizedScriptId,
        onlineCount,
        detailedUsers: includeDetails ? detailedUsers : undefined,
        timestamp,
        cleanupThresholdSeconds: 90, // Shows 90s in dashboard
        lastCleanup: ninetySecondsAgo
      }
    });

  } catch (error) {
    console.error('Status error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}
