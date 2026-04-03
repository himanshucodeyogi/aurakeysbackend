// Developed by Himanshu Kashyap
// POST /api/track
// Receives device info + batched events from the AuraKeys Android app.
// Body: { device: { device_id, device_name, android_version, install_date, last_use_date },
//         events: [{ device_id, event_type, timestamp, metadata? }] }

const { connectToDatabase } = require('../lib/db');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  const { device, events } = req.body || {};

  if (!device?.device_id) {
    return res.status(400).json({ error: 'Missing device.device_id' });
  }

  try {
    const { db } = await connectToDatabase();

    // ── Upsert device record ─────────────────────────────────────
    const eventList = Array.isArray(events) ? events : [];
    const inc       = buildIncrements(eventList);

    const updateDoc = {
      $set: {
        device_name:     device.device_name     || 'Unknown',
        android_version: device.android_version || 'Unknown',
        last_use_date:   device.last_use_date   || new Date().toISOString(),
      },
      $setOnInsert: {
        device_id:    device.device_id,
        install_date: device.install_date || new Date().toISOString(),
        created_at:   new Date(),
      },
      // $inc initialises missing counter fields to 0 then adds — no conflict with $setOnInsert
      $inc: {
        total_app_opens:      inc.total_app_opens      || 0,
        total_keyboard_opens: inc.total_keyboard_opens || 0,
        total_ai_uses:        inc.total_ai_uses        || 0,
      },
    };

    await db.collection('devices').updateOne(
      { device_id: device.device_id },
      updateDoc,
      { upsert: true }
    );

    // Track keyboard/default status from events
    await _updateStatusFromEvents(db, device.device_id, eventList);

    // ── Insert events ────────────────────────────────────────────
    if (eventList.length > 0) {
      const safeEvents = eventList.map(e => ({
        device_id:   e.device_id   || device.device_id,
        event_type:  e.event_type  || 'unknown',
        timestamp:   e.timestamp   || new Date().toISOString(),
        metadata:    e.metadata    || null,
        received_at: new Date(),
      }));
      await db.collection('events').insertMany(safeEvents, { ordered: false });
    }

    return res.status(200).json({ ok: true, events_received: eventList.length });

  } catch (err) {
    console.error('track error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

function buildIncrements(events) {
  const inc = {};
  for (const e of events) {
    if (e.event_type === 'app_open')        inc.total_app_opens      = (inc.total_app_opens      || 0) + 1;
    if (e.event_type === 'keyboard_opened') inc.total_keyboard_opens = (inc.total_keyboard_opens || 0) + 1;
    if (e.event_type === 'ai_used')         inc.total_ai_uses        = (inc.total_ai_uses        || 0) + 1;
  }
  return inc;
}

async function _updateStatusFromEvents(db, deviceId, events) {
  const setFields = {};
  for (const e of events) {
    if (e.event_type === 'keyboard_enabled')  setFields.keyboard_enabled  = true;
    if (e.event_type === 'keyboard_selected') setFields.keyboard_selected = true;
    if (e.event_type === 'theme_changed' && e.metadata) setFields.selected_theme = e.metadata;
  }
  if (Object.keys(setFields).length > 0) {
    await db.collection('devices').updateOne({ device_id: deviceId }, { $set: setFields });
  }
}
