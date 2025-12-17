import { redis } from './utils/redis.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  try {
    const now = Date.now();
    let totalUsers = 0;
    let allScripts = [];
    
    // Get ALL script keys
    const scriptKeys = await redis.keys('script:*:online');
    
    for (const key of scriptKeys) {
      // Extract scriptId from key: "script:NAME:online"
      const scriptId = key.split(':')[1];
      
      // Clean up old users (90 seconds)
      await redis.zremrangebyscore(key, 0, now - 90000);
      
      const userCount = await redis.zcard(key);
      
      if (userCount > 0) {
        totalUsers += userCount;
        allScripts.push({
          scriptId: scriptId,
          onlineCount: userCount
        });
      }
    }
    
    return res.json({
      success: true,
      data: {
        totalUsers: totalUsers,
        scripts: allScripts,
        timestamp: now
      }
    });
    
  } catch (err) {
    console.error('All-status error:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
