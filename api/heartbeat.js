import { redis } from './utils/redis.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'POST only' });
  }

  try {
    const { userId, scriptId } = req.body;
    if (!userId || !scriptId) {
      return res.status(400).json({ success: false, error: 'Missing userId or scriptId' });
    }

    const sanitizedScriptId = scriptId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 50);
    const sanitizedUserId = userId.slice(0, 100);

    const userKey = `script:${sanitizedScriptId}:user:${sanitizedUserId}`;
    const onlineKey = `script:${sanitizedScriptId}:online`;

    const now = Date.now();
    const ttlSeconds = 180; // INCREASED TO 180 SECONDS (3 MINUTES)

    const existing = await redis.get(userKey);
    if (!existing) {
      return res.status(404).json({
        success: false,
        code: 'SESSION_EXPIRED',
        action: 're-register'
      });
    }

    let userData;
    try {
      userData = JSON.parse(existing);
    } catch (e) {
      await redis.del(userKey);
      await redis.zrem(onlineKey, sanitizedUserId);
      return res.status(410).json({
        success: false,
        error: 'Session data corrupted',
        action: 're-register'
      });
    }

    // Update heartbeat info
    userData.lastHeartbeat = now;
    userData.heartbeatCount = (userData.heartbeatCount || 0) + 1;
    
    // Ensure userInfo exists
    if (!userData.userInfo) userData.userInfo = {};
    if (!userData.userInfo.startTime) {
      userData.userInfo.startTime = userData.registeredAt || now;
    }

    // Save with fresh 180-second TTL
    await redis.setex(userKey, ttlSeconds, JSON.stringify(userData));
    // Update sorted set with new timestamp
    await redis.zadd(onlineKey, now, sanitizedUserId);

    // Clean up users inactive for 90 seconds
    await redis.zremrangebyscore(onlineKey, 0, now - 90000);

    const onlineCount = await redis.zcard(onlineKey);
    const startTime = userData.userInfo.startTime;
    const uptimeSeconds = Math.floor((now - startTime) / 1000);

    return res.json({
      success: true,
      data: {
        userId: sanitizedUserId,
        scriptId: sanitizedScriptId,
        onlineCount,
        heartbeatCount: userData.heartbeatCount,
        uptimeSeconds,
        nextHeartbeatIn: 30000,
        timestamp: now
      }
    });

  } catch (err) {
    console.error('Heartbeat error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
