'use strict';

const { v4: uuidv4 } = require('uuid');

function getToken(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return req.headers['x-session-token'] || req.query.token || null;
}

function authRequired(db) {
  return (req, res, next) => {
    const token = getToken(req);
    if (!token) {
      return res.status(401).json({ error: '未登录' });
    }
    const row = db.prepare(`
      SELECT s.token, s.expires_at, u.id, u.username, u.display_name, u.role
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token = ?
    `).get(token);

    if (!row) {
      return res.status(401).json({ error: '登录已失效，请重新登录' });
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
      return res.status(401).json({ error: '登录已过期，请重新登录' });
    }

    req.user = {
      id: row.id,
      username: row.username,
      display_name: row.display_name,
      role: row.role
    };
    req.token = token;
    next();
  };
}

function requireRoles(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: '未登录' });
    if (req.user.role === 'admin' || roles.includes(req.user.role)) {
      return next();
    }
    return res.status(403).json({ error: '权限不足' });
  };
}

function createSession(db, userId, days = 7) {
  const token = uuidv4() + uuidv4().replace(/-/g, '');
  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const expiresAt = expires.toISOString().slice(0, 19).replace('T', ' ');
  db.prepare(`
    INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)
  `).run(token, userId, expiresAt);
  return { token, expires_at: expiresAt };
}

module.exports = {
  authRequired,
  requireRoles,
  createSession,
  getToken
};
