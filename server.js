const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const QRCode = require('qrcode');
const cors = require('cors');
const os = require('os');

dotenv.config();

app.set('trust proxy', 1);
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/vendor/gif.js', express.static(path.join(__dirname, 'node_modules', 'gif.js', 'dist')));

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
