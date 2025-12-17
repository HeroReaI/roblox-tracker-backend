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
    const { userId, scriptId, userInfo = {} } = req.body;
    if (!userId || !scriptId) {
      return res.status(400).json({ success: false, error: 'Missing userId or scriptId' });
    }

    const sanitizedScriptId = scriptId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 50);
    const sanitizedUserId = userId.slice(0, 100);

    const userKey = `script:${sanitizedScriptId}:user:${sanitizedUserId}`;
    const onlineKey = `script:${sanitizedScriptId}:online`;

    const now = Date.now();
    const ttlSeconds = 90;

    const sessionId =
      userInfo.sessionId ||
      Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);

    const userData = {
      userId: sanitizedUserId,
      scriptId: sanitizedScriptId,
      sessionId,
      registeredAt: now,
      lastHeartbeat: now,
      heartbeatCount: 1,

      userInfo: {
        playerName: userInfo.playerName || "Unknown",
        playerId: userInfo.playerId || 0,
        profileUrl: userInfo.profileUrl || "",
        executor: userInfo.executor || "Unknown",
        placeId: userInfo.placeId,
        jobId: userInfo.jobId || "Unknown",
        scriptName: userInfo.scriptName || sanitizedScriptId,
        scriptVersion: userInfo.scriptVersion || "1.0",
        startTime: now
      }
    };

    await redis.setex(userKey, ttlSeconds, JSON.stringify(userData));
    await redis.zadd(onlineKey, now, sanitizedUserId);

    // 🔥 prune expired users
    await redis.zremrangebyscore(onlineKey, 0, now - ttlSeconds * 1000);

    const onlineCount = await redis.zcard(onlineKey);

    return res.json({
      success: true,
      data: {
        sessionId,
        onlineCount,
        ttlSeconds
      }
    });

  } catch (err) {
    console.error("Register error:", err);
    return res.status(500).json({ success: false, error: "Server error" });
  }
}
