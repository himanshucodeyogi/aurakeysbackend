// Developed by Himanshu Kashyap
// GET /api/public-stats
// Returns safe aggregated stats for the public website.
// No personal or device-level data is exposed.

const { connectToDatabase } = require('../lib/db');

// Cache stats for 5 minutes to reduce DB load
let cache = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')    return res.status(405).json({ error: 'Method not allowed' });

  // Serve from cache if fresh
  if (cache && Date.now() - cacheTime < CACHE_TTL) {
    res.setHeader('X-Cache', 'HIT');
    return res.status(200).json(cache);
  }

  try {
    const { db } = await connectToDatabase();

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [
      total_installs,
      active_users,
      keyboardAgg,
      aiCount,
    ] = await Promise.all([
      db.collection('devices').countDocuments(),
      db.collection('devices').countDocuments({ last_use_date: { $gte: thirtyDaysAgo } }),
      db.collection('devices')
        .aggregate([{ $group: { _id: null, total: { $sum: '$total_keyboard_opens' } } }])
        .toArray(),
      db.collection('events').countDocuments({ event_type: 'ai_used' }),
    ]);

    const stats = {
      total_installs,
      active_users,
      keyboard_sessions: keyboardAgg[0]?.total || 0,
      ai_actions:        aiCount,
      updated_at:        new Date().toISOString(),
    };

    cache     = stats;
    cacheTime = Date.now();

    res.setHeader('X-Cache', 'MISS');
    return res.status(200).json(stats);

  } catch (err) {
    console.error('public-stats error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
