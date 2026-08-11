(function (global) {
  'use strict';

  const KEY = 'label-studio-templates-v1';
  const LAST_KEY = 'label-studio-last-session-v1';

  function uid() {
    return 'tpl_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function list() {
    try {
      const raw = localStorage.getItem(KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function saveAll(items) {
    localStorage.setItem(KEY, JSON.stringify(items));
  }

  function saveTemplate(template) {
    const items = list();
    const now = new Date().toISOString();
    if (template.id) {
      const idx = items.findIndex((t) => t.id === template.id);
      if (idx >= 0) {
        items[idx] = { ...items[idx], ...template, updatedAt: now };
        saveAll(items);
        return items[idx];
      }
    }
    const item = {
      ...template,
      id: template.id || uid(),
      createdAt: now,
      updatedAt: now,
    };
    items.unshift(item);
    saveAll(items);
    return item;
  }

  function getTemplate(id) {
    return list().find((t) => t.id === id) || null;
  }

  function removeTemplate(id) {
    saveAll(list().filter((t) => t.id !== id));
  }

  function saveSession(session) {
    try {
      localStorage.setItem(LAST_KEY, JSON.stringify(session));
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

  global.LabelStorage = {
    list,
    saveTemplate,
    getTemplate,
    removeTemplate,
    saveSession,
    loadSession,
    uid,
  };
})(typeof window !== 'undefined' ? window : globalThis);
