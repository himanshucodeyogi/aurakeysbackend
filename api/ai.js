// Developed by Himanshu Kashyap
// POST /api/ai
// Proxies AI requests to Groq with server-side API key rotation.
// Rate-limited keys (429) are blocked until next midnight UTC and skipped automatically.
// Body: { messages: [...], temperature?: number, max_tokens?: number }

const crypto                = require('crypto');
const { connectToDatabase } = require('../lib/db');

const GROQ_KEYS = (process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || '')
  .split(',')
  .map(k => k.trim())
  .filter(Boolean);

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL    = 'llama-3.3-70b-versatile';

function keyHash(key) {
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
}

function nextMidnightUTC() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}

// In-memory cache — avoids DB round-trip on every request (Vercel keeps instances warm)
let _blockedCache = { hashes: new Set(), fetchedAt: 0 };
const CACHE_TTL_MS = 5 * 60 * 1000; // refresh every 5 minutes

// Eagerly connect to DB and pre-warm the blocked-key cache when this module
// is first loaded. By the time the first real request arrives the TCP/TLS
// handshake to MongoDB is already done and the cache is populated, eliminating
// the cold-start DB round-trip from the critical path.
connectToDatabase()
  .then(({ db }) => getBlockedHashes(db))
  .catch(() => {}); // per-request error handling covers any failure here

async function getBlockedHashes(db) {
  const now = Date.now();
  if (now - _blockedCache.fetchedAt < CACHE_TTL_MS) return _blockedCache.hashes;
  const docs = await db.collection('groq_key_blocks')
    .find({ blocked_until: { $gt: new Date() } }, { projection: { key_hash: 1 } })
    .toArray();
  _blockedCache = { hashes: new Set(docs.map(d => d.key_hash)), fetchedAt: now };
  return _blockedCache.hashes;
}

async function blockKey(db, key) {
  const hash          = keyHash(key);
  const blocked_until = nextMidnightUTC();
  await db.collection('groq_key_blocks').updateOne(
    { key_hash: hash },
    { $set: { key_hash: hash, blocked_until } },
    { upsert: true }
  );
  // Invalidate in-memory cache so next request picks up the new block immediately
  _blockedCache.fetchedAt = 0;
  console.warn(`Key ${hash} blocked until ${blocked_until.toISOString()}`);
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const { messages, temperature = 0.7, max_tokens } = req.body || {};

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array required' });
  }

  if (!GROQ_KEYS.length) {
    return res.status(503).json({ error: 'No API key configured' });
  }

  // Get which keys are currently blocked in DB
  let db;
  let blockedHashes = new Set();
  try {
    ({ db } = await connectToDatabase());
    blockedHashes = await getBlockedHashes(db);
  } catch (e) {
    console.error('DB error fetching blocked keys:', e.message);
    // If DB is down, proceed without blocking info (fail open)
  }

  // Skip blocked keys
  const available = GROQ_KEYS.filter(k => !blockedHashes.has(keyHash(k)));

  if (!available.length) {
    return res.status(429).json({ error: 'Saari keys rate-limited hain. Kal try karo.' });
  }

  const body = { model: MODEL, messages, temperature };
  if (max_tokens) body.max_tokens = max_tokens;

  for (const key of available) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000); // 8s — under Vercel's 10s limit

    try {
      const groqRes = await fetch(GROQ_URL, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${key}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (groqRes.status === 429) {
        // Block this key until tomorrow midnight UTC
        if (db) await blockKey(db, key).catch(() => {});
        console.warn('Groq rate limit — trying next key...');
        continue;
      }

      const data = await groqRes.json();

      if (!groqRes.ok) {
        console.error('Groq error:', groqRes.status, data);
        return res.status(502).json({ error: 'Groq API error', status: groqRes.status });
      }

      return res.status(200).json(data);

    } catch (err) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        console.error('Groq request timed out');
        return res.status(504).json({ error: 'Request timed out' });
      }
      console.error('ai proxy error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  return res.status(429).json({ error: 'Saari keys rate-limited hain. Kal try karo.' });
};
