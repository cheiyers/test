(function (global) {
  'use strict';

  const KEY = 'label-studio-templates-v1';
  const LAST_KEY = 'label-studio-last-session-v1';
  const SEED_VERSION = 'cable-defaults-v4-longtext';

  function uid() {
    return 'tpl_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function userList() {
    try {
      const raw = localStorage.getItem(KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function builtins() {
    const defs = (global.LabelDefaults && global.LabelDefaults.templates) || [];
    const now = '1970-01-01T00:00:00.000Z';
    return defs.map((t) => ({
      ...t,
      builtin: true,
      createdAt: t.createdAt || now,
      updatedAt: t.updatedAt || now,
    }));
  }

  function list() {
    const users = userList();
    const userIds = new Set(users.map((t) => t.id));
    const built = builtins().filter((t) => !userIds.has(t.id));
    return users.concat(built);
  }

  function saveAll(items) {
    // Never persist builtins into user store; only user-created / overridden copies
    const builtinIds = new Set(builtins().map((t) => t.id));
    const usersOnly = items.filter((t) => !t.builtin || !builtinIds.has(t.id) || usersOverride(t));
    localStorage.setItem(KEY, JSON.stringify(usersOnly.filter((t) => !t.builtin)));
  }

  function usersOverride(t) {
    // If user saved over a builtin id, keep it as a normal user template
    return !t.builtin && builtins().some((b) => b.id === t.id);
  }

  function saveTemplate(template) {
    const items = userList();
    const now = new Date().toISOString();
    const payload = { ...template, builtin: false };
    if (payload.id) {
      const idx = items.findIndex((t) => t.id === payload.id);
      if (idx >= 0) {
        items[idx] = { ...items[idx], ...payload, updatedAt: now };
        localStorage.setItem(KEY, JSON.stringify(items));
        return items[idx];
      }
    }
    const item = {
      ...payload,
      id: payload.id || uid(),
      createdAt: now,
      updatedAt: now,
    };
    items.unshift(item);
    localStorage.setItem(KEY, JSON.stringify(items));
    return item;
  }

  function getTemplate(id) {
    return list().find((t) => t.id === id) || null;
  }

  function removeTemplate(id) {
    const built = builtins().find((t) => t.id === id);
    if (built) {
      // Removing a builtin is not allowed; ignore
      return false;
    }
    localStorage.setItem(KEY, JSON.stringify(userList().filter((t) => t.id !== id)));
    return true;
  }

  function saveSession(session) {
    try {
      localStorage.setItem(LAST_KEY, JSON.stringify({
        ...session,
        seedVersion: SEED_VERSION,
      }));
    } catch (e) {
      console.warn('session save failed', e);
    }
  }

  function loadSession() {
    try {
      const raw = localStorage.getItem(LAST_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function isCurrentSeed(session) {
    return !!(session && session.seedVersion === SEED_VERSION);
  }

  global.LabelStorage = {
    list,
    saveTemplate,
    getTemplate,
    removeTemplate,
    saveSession,
    loadSession,
    isCurrentSeed,
    SEED_VERSION,
    uid,
  };
})(typeof window !== 'undefined' ? window : globalThis);
