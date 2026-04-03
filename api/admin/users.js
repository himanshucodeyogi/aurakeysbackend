// Developed by Himanshu Kashyap
// GET /api/admin/users
// Returns paginated list of all tracked devices.
// Query params:
//   ?page=1&limit=50
//   &sort=install_date|last_use_date|total_ai_uses|total_keyboard_opens  (default: last_use_date)
//   &order=desc|asc  (default: desc)
//   &filter=enabled|selected|active7d|active30d
//   &search=<device_name or device_id>
// Requires: Authorization: Bearer <ADMIN_PASSWORD>

const { connectToDatabase } = require('../../lib/db');
const { requireAdmin }      = require('../../lib/auth');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAdmin(req, res))  return;
  if (req.method !== 'GET')     return res.status(405).json({ error: 'Method not allowed' });

  const {
    page   = '1',
    limit  = '50',
    sort   = 'last_use_date',
    order  = 'desc',
    filter = '',
    search = '',
  } = req.query;

  const pageNum  = Math.max(1, parseInt(page, 10)  || 1);
  const limitNum = Math.min(100, parseInt(limit, 10) || 50);
  const skip     = (pageNum - 1) * limitNum;

  const allowedSort = ['install_date', 'last_use_date', 'total_ai_uses', 'total_keyboard_opens', 'total_app_opens'];
  const sortField = allowedSort.includes(sort) ? sort : 'last_use_date';
  const sortDir   = order === 'asc' ? 1 : -1;

  try {
    const { db } = await connectToDatabase();

    // ── Build query ──────────────────────────────────────────────
    const query = {};

    if (search.trim()) {
      const regex = { $regex: search.trim(), $options: 'i' };
      query.$or = [{ device_name: regex }, { device_id: regex }];
    }

    if (filter === 'enabled')  query.keyboard_enabled  = true;
    if (filter === 'selected') query.keyboard_selected = true;
    if (filter === 'active7d') {
      query.last_use_date = { $gte: new Date(Date.now() - 7 * 86400000).toISOString() };
    }
    if (filter === 'active30d') {
      query.last_use_date = { $gte: new Date(Date.now() - 30 * 86400000).toISOString() };
    }

    const [devices, total] = await Promise.all([
      db.collection('devices')
        .find(query, { projection: { _id: 0 } })
        .sort({ [sortField]: sortDir })
        .skip(skip)
        .limit(limitNum)
        .toArray(),
      db.collection('devices').countDocuments(query),
    ]);

    return res.status(200).json({
      devices,
      pagination: {
        page:        pageNum,
        limit:       limitNum,
        total,
        total_pages: Math.ceil(total / limitNum),
      },
    });

  } catch (err) {
    console.error('admin/users error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
