'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { createSession } = require('../auth');

function authRoutes(db, authRequired) {
  const router = express.Router();

  router.post('/login', (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: '请输入用户名和密码' });
    }
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username).trim());
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }
    const session = createSession(db, user.id);
    res.json({
      token: session.token,
      expires_at: session.expires_at,
      user: {
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        role: user.role
      }
    });
  });

  router.post('/logout', (req, res) => {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '') || req.body?.token;
    if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    res.json({ ok: true });
  });

  router.get('/me', authRequired(db), (req, res) => {
    res.json({ user: req.user });
  });

  router.get('/users', authRequired(db), (req, res) => {
    const users = db.prepare(`
      SELECT id, username, display_name, role, created_at FROM users ORDER BY created_at
    `).all();
    res.json({ users });
  });

  return router;
}

module.exports = { authRoutes };
