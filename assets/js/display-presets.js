(function (root) {
  function uid() {
    return "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function clone(v) {
    return JSON.parse(JSON.stringify(v == null ? {} : v));
  }

  function snapshot(state) {
    return {
      viewMode: state.viewMode || "nested",
      parentFields: [...(state.selectedParentFields || [])],
      bomFields: [...(state.selectedBomFields || [])],
      keywords: (state.extractKeywords || []).slice(),
      bomDescs: (state.selectedBomDescs || []).slice(),
      columnRules: clone(state.columnRules || {}),
      categories: [...(state.selectedCategories || [])],
    };
  }

  function apply(state, preset, knownCategories) {
    if (!preset) return state;
    if (preset.viewMode) state.viewMode = preset.viewMode;
    if (Array.isArray(preset.parentFields)) state.selectedParentFields = new Set(preset.parentFields);
    if (Array.isArray(preset.bomFields)) state.selectedBomFields = new Set(preset.bomFields);
    if (Array.isArray(preset.keywords)) state.extractKeywords = preset.keywords.slice();
    if (Array.isArray(preset.bomDescs)) state.selectedBomDescs = preset.bomDescs.slice();
    if (preset.columnRules && typeof preset.columnRules === "object") {
      state.columnRules = clone(preset.columnRules);
    }
    if (Array.isArray(preset.categories)) {
      const known = knownCategories || state.knownCategories;
      if (known && known.size) {
        const next = preset.categories.filter((id) => known.has(id));
        if (next.length) state.selectedCategories = new Set(next);
      } else if (preset.categories.length) {
        state.selectedCategories = new Set(preset.categories);
      }
    }
    return state;
  }

  function sameSnapshot(a, b) {
    if (!a || !b) return false;
    return JSON.stringify(pickCompare(a)) === JSON.stringify(pickCompare(b));
  }

  function pickCompare(p) {
    return {
      viewMode: p.viewMode || "",
      parentFields: (p.parentFields || []).slice().sort(),
      bomFields: (p.bomFields || []).slice().sort(),
      keywords: p.keywords || [],
      bomDescs: p.bomDescs || [],
      columnRules: p.columnRules || {},
      categories: (p.categories || []).slice().sort(),
    };
  }

  function addOrUpdate(list, name, snap) {
    const trimmed = String(name || "").trim();
    if (!trimmed) return { list, error: "empty" };
    const existing = list.find((p) => p.name === trimmed);
    if (existing) {
      Object.assign(existing, snap, { name: trimmed });
      return { list, id: existing.id, updated: true };
    }
    const item = Object.assign({ id: uid(), name: trimmed }, snap);
    list.push(item);
    return { list, id: item.id, updated: false };
  }

  function updateById(list, id, snap) {
    const item = list.find((p) => p.id === id);
    if (!item) return { list, error: "missing" };
    Object.assign(item, snap, { name: item.name, id: item.id });
    return { list, id: item.id, updated: true };
  }

  function removeById(list, id) {
    return list.filter((p) => p.id !== id);
  }

  function rename(list, id, name) {
    const trimmed = String(name || "").trim();
    if (!trimmed) return { list, error: "empty" };
    const item = list.find((p) => p.id === id);
    if (!item) return { list, error: "missing" };
    if (list.some((p) => p.id !== id && p.name === trimmed)) return { list, error: "dup" };
    item.name = trimmed;
    return { list, id };
  }

  const api = {
    uid,
    snapshot,
    apply,
    sameSnapshot,
    addOrUpdate,
    updateById,
    removeById,
    rename,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.DisplayPresets = api;
})(typeof window !== "undefined" ? window : globalThis);
