// Developed by Himanshu Kashyap
// GET /api/admin/user?id=<device_id>
// Returns device detail + recent activity timeline for one device.
// Requires: Authorization: Bearer <ADMIN_PASSWORD>

const { connectToDatabase } = require('../../lib/db');
const { requireAdmin }      = require('../../lib/auth');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAdmin(req, res))  return;
  if (req.method !== 'GET')     return res.status(405).json({ error: 'Method not allowed' });

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Missing ?id= parameter' });

  try {
    const { db } = await connectToDatabase();

    const [device, recentEvents] = await Promise.all([
      db.collection('devices').findOne({ device_id: id }, { projection: { _id: 0 } }),
      db.collection('events')
        .find({ device_id: id }, { projection: { _id: 0 } })
        .sort({ timestamp: -1 })
        .limit(50)
        .toArray(),
    ]);

    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }

    return res.status(200).json({ device, recent_events: recentEvents });

  } catch (err) {
    console.error('admin/user error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
