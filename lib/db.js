// Developed by Himanshu Kashyap
// MongoDB connection with serverless-safe caching
// (Vercel keeps the function warm, so the same connection is reused)

const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error('MONGODB_URI environment variable is not set');

let cachedClient = null;
let cachedDb     = null;

async function connectToDatabase() {
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  const client = new MongoClient(uri, {
    maxPoolSize: 1,          // keep pool small for serverless
    serverSelectionTimeoutMS: 5000,
  });

  await client.connect();

  cachedClient = client;
  cachedDb     = client.db('aurakeys');

  // Create indexes on first connection
  await _ensureIndexes(cachedDb);

  return { client: cachedClient, db: cachedDb };
}

async function _ensureIndexes(db) {
  try {
    await Promise.all([
      // devices — unique key
      db.collection('devices').createIndex({ device_id: 1 }, { unique: true }),
      // devices — sort fields used by admin/users
      db.collection('devices').createIndex({ last_use_date: -1 }),
      db.collection('devices').createIndex({ install_date: -1 }),
      db.collection('devices').createIndex({ total_ai_uses: -1 }),
      db.collection('devices').createIndex({ total_keyboard_opens: -1 }),
      db.collection('devices').createIndex({ total_app_opens: -1 }),
      // devices — filter fields used by admin/users
      db.collection('devices').createIndex({ keyboard_enabled: 1 }),
      db.collection('devices').createIndex({ keyboard_selected: 1 }),
      // devices — text search on device_name
      db.collection('devices').createIndex({ device_name: 1 }),
      // events
      db.collection('events').createIndex({ device_id: 1 }),
      db.collection('events').createIndex({ event_type: 1 }),
      db.collection('events').createIndex({ timestamp: -1 }),
      // events — device detail modal (device_id + sort by timestamp)
      db.collection('events').createIndex({ device_id: 1, timestamp: -1 }),
    ]);
  } catch (_) {
    // Indexes already exist — safe to ignore
  }
}

module.exports = { connectToDatabase };
