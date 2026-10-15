const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const QRCode = require('qrcode');
const cors = require('cors');
const crypto = require('crypto');
const mongoose = require('mongoose');
const XenConfig = require('./public/js/config.js');

dotenv.config();


const app = express();
app.set('trust proxy', 1);

const PORT = process.env.PORT || 3000;
const ADMIN_SESSION_TTL = 8 * 60 * 60 * 1000;
const sessions = new Map();
const loginAttempts = new Map();
const SETTINGS_ID = 'global';
let mongoConnectionPromise = null;
const settingsSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  config: { type: mongoose.Schema.Types.Mixed, required: true },
  updatedAt: { type: Date, required: true }
}, { versionKey: false, collection: 'app_settings' });
const Settings = mongoose.models.AppSettings || mongoose.model('AppSettings', settingsSchema);

async function ensureMongoConnection() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not configured.');
  if (mongoose.connection.readyState === 1) return;
  if (!mongoConnectionPromise) {
    mongoConnectionPromise = mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 })
      .catch((error) => {
        mongoConnectionPromise = null;
        throw error;
      });
  }
  await mongoConnectionPromise;
}

app.use(cors());
app.use(express.json({ limit: '8mb' }));
app.use((req, res, next) => {
  const pagePath = req.path.toLowerCase();
  if (pagePath === '/admin-login.html' || pagePath === '/admin.html') {
    res.set('Cache-Control', 'no-store');
    if (pagePath === '/admin.html' && !getAdminSession(req)) {
      return res.redirect(302, '/admin-login.html');
    }
  }
  next();
});
app.use(express.static(path.join(__dirname, 'public')));
app.use('/vendor/gif.js', express.static(path.join(__dirname, 'node_modules', 'gif.js', 'dist')));

function safeEqual(left, right) {
  const leftHash = crypto.createHash('sha256').update(left).digest();
  const rightHash = crypto.createHash('sha256').update(right).digest();
  return crypto.timingSafeEqual(leftHash, rightHash);
}

function getAdminSession(req) {
  const cookies = (req.headers.cookie || '').split(';');
  const sessionCookie = cookies.map((cookie) => cookie.trim()).find((cookie) => cookie.startsWith('xenAdminSession='));
  if (!sessionCookie) return null;
  const sessionId = sessionCookie.slice('xenAdminSession='.length);
  const expiresAt = sessions.get(sessionId);
  if (!expiresAt) return null;
  if (expiresAt <= Date.now()) {
    sessions.delete(sessionId);
    return null;
  }
  return sessionId;
}

function setAdminCookie(req, res, sessionId, maxAge) {
  const secure = req.secure ? '; Secure' : '';
  res.set('Set-Cookie', `xenAdminSession=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`);
}

app.post('/api/admin/login', (req, res) => {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) {
    return res.status(503).json({ error: 'Admin login is not configured on the server.' });
  }

  const ip = req.ip;
  const attempt = loginAttempts.get(ip);
  if (attempt && attempt.lockedUntil > Date.now()) {
    return res.status(429).json({ error: 'Too many failed attempts. Please wait before trying again.' });
  }

  const submittedUsername = typeof req.body?.username === 'string' ? req.body.username : '';
  const submittedPassword = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!safeEqual(submittedUsername, username) || !safeEqual(submittedPassword, password)) {
    const failures = attempt && attempt.windowStartedAt > Date.now() - 15 * 60 * 1000 ? attempt.failures + 1 : 1;
    loginAttempts.set(ip, {
      failures,
      windowStartedAt: attempt?.windowStartedAt > Date.now() - 15 * 60 * 1000 ? attempt.windowStartedAt : Date.now(),
      lockedUntil: failures >= 5 ? Date.now() + 60 * 1000 : 0
    });
    return res.status(401).json({ error: 'Wrong username or password.' });
  }

  loginAttempts.delete(ip);
  const sessionId = crypto.randomBytes(32).toString('hex');
  sessions.set(sessionId, Date.now() + ADMIN_SESSION_TTL);
  setAdminCookie(req, res, sessionId, ADMIN_SESSION_TTL / 1000);
  res.json({ authenticated: true });
});

app.get('/api/admin/session', (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!getAdminSession(req)) return res.status(401).json({ authenticated: false });
  res.json({ authenticated: true });
});

app.post('/api/admin/logout', (req, res) => {
  const sessionId = getAdminSession(req);
  if (sessionId) sessions.delete(sessionId);
  setAdminCookie(req, res, '', 0);
  res.json({ authenticated: false });
});

app.get('/api/config', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    await ensureMongoConnection();
    const saved = await Settings.findById(SETTINGS_ID).lean();
    res.json({
      config: saved?.config || XenConfig.defaults(),
      initialized: Boolean(saved),
      updatedAt: saved?.updatedAt || null
    });
  } catch (error) {
    console.error('Could not load shared settings:', error.message);
    res.status(503).json({
      error: process.env.MONGODB_URI
        ? 'Shared settings are temporarily unavailable.'
        : 'Shared settings are not configured on the server.'
    });
  }
});

app.put('/api/admin/config', async (req, res) => {
  if (!getAdminSession(req)) return res.status(401).json({ error: 'Admin login is required.' });
  const config = req.body?.config;
  if (!config || !Array.isArray(config.layouts) || !Array.isArray(config.frames) || !Array.isArray(config.templates)) {
    return res.status(400).json({ error: 'A valid settings configuration is required.' });
  }
  try {
    await ensureMongoConnection();
    const updatedAt = new Date();
    await Settings.findByIdAndUpdate(
      SETTINGS_ID,
      { $set: { config, updatedAt } },
      { new: true, upsert: true, runValidators: true }
    );
    res.json({ saved: true, updatedAt });
  } catch (error) {
    console.error('Could not save shared settings:', error.message);
    res.status(503).json({
      error: process.env.MONGODB_URI
        ? 'Could not save shared settings. Please try again.'
        : 'Shared settings are not configured on the server.'
    });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'xen-photobooth is running' });
});

app.get('/share-url', (req, res) => {
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.get('host');
  res.json({ url: `${proto}://${host}/photobooth.html` });
});

app.get('/qr', async (req, res) => {
  const data = typeof req.query.data === 'string' ? req.query.data : '';

  if (!data || data.length > 2048) {
    return res.status(400).send('A valid QR value is required.');
  }

  try {
    const image = await QRCode.toBuffer(data, {
      type: 'png',
      width: 160,
      margin: 1
    });

    res.type('png').send(image);
  } catch (error) {
    console.error('QR generation failed:', error);
    res.status(500).send('Unable to generate QR code.');
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`xen-photobooth listening on port ${PORT}`);
});
