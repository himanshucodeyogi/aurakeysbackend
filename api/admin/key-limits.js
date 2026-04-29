// Developed by Himanshu Kashyap
// GET  /api/admin/key-limits  — rate-limit block status for all configured Groq keys
// DELETE /api/admin/key-limits — manually unblock a key { key_hash }

const crypto                = require('crypto');
const { connectToDatabase } = require('../../lib/db');
const { requireAdmin }      = require('../../lib/auth');

function keyHash(key) {
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAdmin(req, res)) return;

  const rawKeys = (process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || '')
    .split(',').map(k => k.trim()).filter(Boolean);

  try {
    const { db } = await connectToDatabase();

    // ── GET: return block status for all keys ────────────────
    if (req.method === 'GET') {
      const blocks = await db.collection('groq_key_blocks')
        .find({}, { projection: { key_hash: 1, blocked_until: 1 } })
        .toArray();

      const blockMap = new Map(blocks.map(b => [b.key_hash, b.blocked_until]));
      const now      = new Date();

      const keys = rawKeys.map((k, i) => {
        const hash         = keyHash(k);
        const blockedUntil = blockMap.get(hash);
        const isBlocked    = !!blockedUntil && new Date(blockedUntil) > now;
        return {
          index:         i + 1,
          name:          `Key ${i + 1}`,
          masked:        k.slice(0, 7) + '••••••••••••' + k.slice(-4),
          key_hash:      hash,
          status:        isBlocked ? 'blocked' : 'available',
          blocked_until: isBlocked ? blockedUntil : null,
        };
      });

      return res.status(200).json({ keys });
    }

    // ── DELETE: manually unblock a key by hash ───────────────
    if (req.method === 'DELETE') {
      const { key_hash } = req.body || {};
      if (!key_hash) return res.status(400).json({ error: 'key_hash required' });

      await db.collection('groq_key_blocks').deleteOne({ key_hash });
      return res.status(200).json({ ok: true, unblocked: key_hash });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (err) {
    console.error('key-limits error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
