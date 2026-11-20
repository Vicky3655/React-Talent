const express = require('express');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';

app.use((req, res, next) => {
  const blocked = ['/server.js', '/package.json', '/package-lock.json'];
  if (blocked.includes(req.path)) {
    return res.status(404).send('Not found');
  }
  next();
});

app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

app.use(express.static(path.join(__dirname), {
  extensions: ['html'],
  etag: false,
  lastModified: false,
  cacheControl: false,
}));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`Talent Flow server listening on http://${HOST}:${PORT}`);
});
