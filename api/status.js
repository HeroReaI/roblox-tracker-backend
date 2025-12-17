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

    const onlineKey = `script:${sanitizedScriptId}:online`;
    const ttlSeconds = 90;

    // 🔥 Prune inactive users
    await redis.zremrangebyscore(onlineKey, 0, now - ttlSeconds * 1000);

    const onlineCount = await redis.zcard(onlineKey);
    const includeDetails = detailed === 'true' || detailed === '1';

    let users = [];

    if (includeDetails && onlineCount > 0) {
      const entries = await redis.zrange(
        onlineKey,
        0,
        -1,
        { withScores: true }
      );

      for (const { member: userId, score: lastActive } of entries) {
        const secondsAgo = Math.floor((now - lastActive) / 1000);
        if (secondsAgo >= ttlSeconds) continue;

        const userKey = `script:${sanitizedScriptId}:user:${userId}`;
        const raw = await redis.get(userKey);
        if (!raw) continue;

        try {
          const parsed = JSON.parse(raw);
          const startTime = parsed.userInfo?.startTime || parsed.registeredAt;
          const uptimeSeconds = Math.floor((now - startTime) / 1000);

          users.push({
            userId,
            playerName: parsed.userInfo.playerName,
            playerId: parsed.userInfo.playerId,
            profileUrl: parsed.userInfo.profileUrl,
            executor: parsed.userInfo.executor,
            jobId: parsed.userInfo.jobId,
            placeId: parsed.userInfo.placeId,
            heartbeatCount: parsed.heartbeatCount,
            uptimeSeconds,
            lastActive,
            secondsAgo,
            status: secondsAgo < 30 ? 'active' : 'idle'
          });
        } catch {
          // skip corrupted user
        }
      }
    }

    return res.json({
      success: true,
      data: {
        scriptId: sanitizedScriptId,
        onlineCount,
        users: includeDetails ? users : undefined,
        timestamp: now,
        ttlSeconds
      }
    });

  } catch (err) {
    console.error('Status error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
