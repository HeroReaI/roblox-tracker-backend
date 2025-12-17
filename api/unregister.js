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
    const { userId, scriptId, sessionId } = req.body;
    if (!userId || !scriptId || !sessionId) {
      return res.status(400).json({
        success: false,
        error: 'userId, scriptId, sessionId required'
      });
    }

    const sanitizedScriptId = scriptId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 50);
    const sanitizedUserId = userId.slice(0, 100);

    const userKey = `script:${sanitizedScriptId}:user:${sanitizedUserId}`;
    const onlineKey = `script:${sanitizedScriptId}:online`;

    const raw = await redis.get(userKey);
    if (!raw) {
      return res.json({ success: true, data: { removed: false } });
    }

    const parsed = JSON.parse(raw);
    if (parsed.sessionId !== sessionId) {
      return res.status(403).json({
        success: false,
        error: 'Invalid session'
      });
    }

    await redis.del(userKey);
    await redis.zrem(onlineKey, sanitizedUserId);

    const onlineCount = await redis.zcard(onlineKey);

    return res.json({
      success: true,
      data: {
        removed: true,
        onlineCount,
        timestamp: Date.now()
      }
    });

  } catch (err) {
    console.error('Unregister error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
