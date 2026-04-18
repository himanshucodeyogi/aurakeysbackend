// Developed by Himanshu Kashyap
// GET /api/admin/check-keys
// Tests all configured Groq API keys server-side and returns health results.
// Requires: Authorization: Bearer <ADMIN_PASSWORD>

const { requireAdmin } = require('../../lib/auth');

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL    = 'llama-3.3-70b-versatile';

async function testKey(key) {
  const t0 = Date.now();
  try {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 1,
      }),
    });

    const latency = Date.now() - t0;

    if (res.ok) {
      return { status: 'working', latency, error: null };
    }

    const body = await res.json().catch(() => ({}));
    const msg  = body?.error?.message || res.statusText || 'Unknown error';

    if (res.status === 429) return { status: 'ratelimit', latency, error: 'Rate limited — key likely valid' };
    if (res.status === 401) return { status: 'failed',    latency, error: 'Invalid or expired key' };
    return { status: 'failed', latency, error: msg.slice(0, 120) };

  } catch (e) {
    return { status: 'failed', latency: Date.now() - t0, error: e.message.slice(0, 120) };
  }
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!requireAdmin(req, res))  return;
  if (req.method !== 'GET')     return res.status(405).json({ error: 'Method not allowed' });

  const rawKeys = (process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY || '')
    .split(',')
    .map(k => k.trim())
    .filter(Boolean);

  if (!rawKeys.length) {
    return res.status(200).json({ results: [] });
  }

  // Test all keys concurrently
  const settled = await Promise.allSettled(rawKeys.map(testKey));

  const results = rawKeys.map((k, i) => {
    const r = settled[i].status === 'fulfilled' ? settled[i].value : { status: 'failed', latency: null, error: 'Test threw an exception' };
    return {
      index:     i + 1,
      name:      `Key ${i + 1}`,
      masked:    k.slice(0, 7) + '••••••••••••' + k.slice(-4),
      model:     MODEL,
      status:    r.status,
      latency:   r.latency,
      error:     r.error,
      checkedAt: new Date().toISOString(),
    };
  });

  return res.status(200).json({ results });
};
