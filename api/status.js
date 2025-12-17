import { redis } from './utils/redis.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'GET only' });
  }

  try {
    const { scriptId = 'default', detailed = 'false' } = req.query;
    const sanitizedScriptId = scriptId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 50);
    const now = Date.now();
    const ttlSeconds = 90;

    const onlineKey = `script:${sanitizedScriptId}:online`;

    // Cleanup expired users (90 seconds)
    await redis.zremrangebyscore(onlineKey, 0, now - (ttlSeconds * 1000));

    const onlineCount = await redis.zcard(onlineKey);
    const includeDetails = detailed === 'true' || detailed === '1';

    let detailedUsers = [];

    if (includeDetails && onlineCount > 0) {
      // FIXED: Use correct parameter format for zrange
      const usersWithScores = await redis.zrange(onlineKey, 0, -1, true);
      
      // Process users in pairs (userId, score, userId, score...)
      for (let i = 0; i < usersWithScores.length; i += 2) {
        const userId = usersWithScores[i];
        const lastActive = parseInt(usersWithScores[i + 1]);
        const secondsAgo = Math.floor((now - lastActive) / 1000);
        
        // Skip if expired (shouldn't happen due to cleanup above)
        if (secondsAgo >= ttlSeconds) continue;

        const userKey = `script:${sanitizedScriptId}:user:${userId}`;
        const raw = await redis.get(userKey);
        if (!raw) continue;

        try {
          const parsed = JSON.parse(raw);
          const startTime = parsed.userInfo?.startTime || parsed.registeredAt || now;
          const uptimeSeconds = Math.floor((now - startTime) / 1000);

          detailedUsers.push({
            userId: userId,
            sessionId: parsed.sessionId,
            userInfo: parsed.userInfo || {},
            heartbeatCount: parsed.heartbeatCount || 1,
            lastActive: lastActive,
            secondsAgo: secondsAgo,
            uptimeSeconds: uptimeSeconds,
            status: secondsAgo < 30 ? 'active' : 'idle'
          });
        } catch (e) {
          console.log('Skipping corrupted user data for:', userId);
        }
      }
    }

    return res.json({
      success: true,
      data: {
        scriptId: sanitizedScriptId,
        onlineCount,
        detailedUsers: includeDetails ? detailedUsers : undefined,
        timestamp: now,
        cleanupThresholdSeconds: ttlSeconds
      }
    });

  } catch (err) {
    console.error('Status error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
