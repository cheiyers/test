'use strict';

const path = require('path');
const os = require('os');
const express = require('express');
const cors = require('cors');
const { initDb } = require('./db');
const { authRequired } = require('./auth');
const { authRoutes } = require('./routes/auth');
const { bomRoutes } = require('./routes/bom');
const { mappingRoutes } = require('./routes/mapping');
const { batchRoutes } = require('./routes/batches');
const { templateRoutes } = require('./routes/templates');
const { labelRoutes } = require('./routes/labels');
const { scanRoutes } = require('./routes/scan');

const PORT = Number(process.env.PORT) || 3789;
const db = initDb();
const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.use('/api/auth', authRoutes(db, authRequired));

app.use('/api/boms', authRequired(db), bomRoutes(db));
app.use('/api/mappings', authRequired(db), mappingRoutes(db));
app.use('/api/batches', authRequired(db), batchRoutes(db));
app.use('/api/templates', authRequired(db), templateRoutes(db));
app.use('/api/labels', authRequired(db), labelRoutes(db));
app.use('/api/scan', authRequired(db), scanRoutes(db));

app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || '服务器错误' });
});

function lanAddresses() {
  const nets = os.networkInterfaces();
  const result = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) result.push(net.address);
    }
  }
  return result;
}

app.listen(PORT, '0.0.0.0', () => {
  const lans = lanAddresses();
  console.log('');
  console.log('========================================');
  console.log('  BOM 扫码质量监管系统已启动');
  console.log(`  本机访问: http://127.0.0.1:${PORT}`);
  for (const ip of lans) {
    console.log(`  局域网:  http://${ip}:${PORT}`);
  }
  console.log('----------------------------------------');
  console.log('  默认账号:');
  console.log('    admin / admin123   (管理员)');
  console.log('    import / import123 (导入打印)');
  console.log('    scan / scan123     (扫码入库)');
  console.log('========================================');
  console.log('');
});
