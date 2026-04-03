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
      db.collection('devices').createIndex({ device_id: 1 }, { unique: true }),
      db.collection('devices').createIndex({ last_use_date: -1 }),
      db.collection('devices').createIndex({ install_date: -1 }),
      db.collection('events').createIndex({ device_id: 1 }),
      db.collection('events').createIndex({ event_type: 1 }),
      db.collection('events').createIndex({ timestamp: -1 }),
    ]);
  } catch (_) {
    // Indexes already exist — safe to ignore
  }
}

module.exports = { connectToDatabase };
