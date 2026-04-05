// Developed by Himanshu Kashyap
// GET /api/admin/stats
// Admin overview — total users, DAU, WAU, MAU, total keyboard opens, total AI uses.
// Requires: Authorization: Bearer <ADMIN_PASSWORD>

const { connectToDatabase } = require('../../lib/db');
const { requireAdmin }      = require('../../lib/auth');

let cache = null;
let cacheTime = 0;
const CACHE_TTL = 2 * 60 * 1000; // 2 minutes

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAdmin(req, res))  return;
  if (req.method !== 'GET')     return res.status(405).json({ error: 'Method not allowed' });

  if (cache && Date.now() - cacheTime < CACHE_TTL) {
    res.setHeader('X-Cache', 'HIT');
    return res.status(200).json(cache);
  }

  try {
    const { db } = await connectToDatabase();

    const now      = new Date();
    const day1Ago  = new Date(now - 1  * 24 * 60 * 60 * 1000).toISOString();
    const day7Ago  = new Date(now - 7  * 24 * 60 * 60 * 1000).toISOString();
    const day30Ago = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [
      total_users,
      dau,
      wau,
      mau,
      keyboardAgg,
      aiAgg,
      appOpenAgg,
      recentInstalls,
    ] = await Promise.all([
      db.collection('devices').countDocuments(),
      db.collection('devices').countDocuments({ last_use_date: { $gte: day1Ago } }),
      db.collection('devices').countDocuments({ last_use_date: { $gte: day7Ago } }),
      db.collection('devices').countDocuments({ last_use_date: { $gte: day30Ago } }),
      db.collection('devices')
        .aggregate([{ $group: { _id: null, total: { $sum: '$total_keyboard_opens' } } }])
        .toArray(),
      db.collection('devices')
        .aggregate([{ $group: { _id: null, total: { $sum: '$total_ai_uses' } } }])
        .toArray(),
      db.collection('devices')
        .aggregate([{ $group: { _id: null, total: { $sum: '$total_app_opens' } } }])
        .toArray(),
      db.collection('devices')
        .countDocuments({ install_date: { $gte: day7Ago } }),
    ]);

    const result = {
      total_users,
      dau,
      wau,
      mau,
      total_keyboard_opens: keyboardAgg[0]?.total  || 0,
      total_ai_uses:        aiAgg[0]?.total         || 0,
      total_app_opens:      appOpenAgg[0]?.total    || 0,
      new_installs_7d:      recentInstalls,
      generated_at:         now.toISOString(),
    };

    cache     = result;
    cacheTime = Date.now();
    res.setHeader('X-Cache', 'MISS');
    return res.status(200).json(result);

  } catch (err) {
    console.error('admin/stats error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
