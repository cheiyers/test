(function () {
  const F = window.PoFields;
  const B = window.PoBom;
  const PDFJS_BASE = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/";
  const pdfjsLib = window["pdfjs-dist/build/pdf"] || window.pdfjsLib;
  if (pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_BASE + "build/pdf.worker.min.js";
  }

  const PREFS_KEY = "schindler-po-export-v3";
  const SCHEMES_KEY = "schindler-po-schemes-v1";

  const state = {
    docs: [],
    rows: [],
    selectedFields: new Set(F.defaultSelectedIds()),
    extraKeywords: [],
    selectedRows: new Set(),
    columns: [],
    source: "",
    schemes: [],
    editingColId: null,
    dragColId: null,
    dragActive: false,
    dragStartX: 0,
    dropBeforeId: undefined,
    suppressHeadClick: false,
    pdfBuffers: {},
    pdfPaintToken: 0,
    rowFilter: "",
    rowFilterField: "",
    bomTemplate: null,
    bomLibrary: [],
    replacingBomId: null,
    varMaps: [],
    lookupTable: null,
    lookupKey: "",
    bomRows: [],
    exportTemplate: null,
    exportMaps: [],
    skipRule: { enabled: false, column: "计算数量", empty: true, zero: true },
    collapsedPanels: {},
  };

  const SAMPLE_EXPORT_AOA = [
    ["物料编码", "物料名称", "数量", "单位", "采购订单号", "行项目", "订单物料号", "物料描述"],
  ];

  const SAMPLE_BOM_AOA = [
    ["子件料号", "子件描述", "单位", "备注"],
    ["SCREW-M6", "平头套管配套螺丝", "件", "=数量*4"],
    ["BRKT-01", "装饰吊顶固定支架", "件", "=数量"],
    ["LED-CORE", "Edge light灯芯", "件", '=IF(VALUE({轿厢宽度})>1400,2,1)*数量'],
  ];
  const SAMPLE_LOOKUP_AOA = [
    ["物料号", "对照料号", "对照描述", "规格"],
    ["57668963", "LED-ALT", "备用灯条", "白色"],
    ["57664581", "SLV-04", "套管配件", "M6"],
    ["57866241", "LED-ALT", "备用灯条", "白色"],
    ["57886847", "SLV-04", "套管配件", "M6"],
    ["57886831", "BRKT-ALT", "支架备件", "喷塑"],
  ];

  const $ = function (id) {
    return document.getElementById(id);
  };

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function toast(msg, ms) {
    const el = $("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () {
      el.classList.remove("show");
    }, ms || 2400);
  }

  function ensureDocWarnings(docs) {
    const P = window.SchindlerPoParser;
    return (docs || []).map(function (doc) {
      if (P && P.collectWarnings) doc.warnings = P.collectWarnings(doc);
      else if (!doc.warnings) doc.warnings = [];
      return doc;
    });
  }

  function allWarnings() {
    const list = [];
    state.docs.forEach(function (doc) {
      (doc.warnings || []).forEach(function (w) {
        list.push(w);
      });
    });
    return list;
  }

  function flagLabel(flag) {
    if (flag === "no-material") return "无物料号";
    if (flag === "service") return "服务类行";
    if (flag === "cross-page") return "跨页续行";
    return flag;
  }

  function renderWarnings() {
    const box = $("parseWarnings");
    if (!box) return;
    const warnings = allWarnings();
    box.innerHTML = "";
    if (!warnings.length) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    const title = document.createElement("strong");
    title.textContent = "发现 " + warnings.length + " 处需人工核对（跨页续行 / 无物料号文本行 / 服务类行）";
    box.appendChild(title);
    const ul = document.createElement("ul");
    warnings.forEach(function (w) {
      const li = document.createElement("li");
      li.textContent = w.message;
      ul.appendChild(li);
    });
    box.appendChild(ul);
  }

  function notifyWarnings(prefix) {
    const n = allWarnings().length;
    if (!n) {
      if (prefix) toast(prefix);
      return;
    }
    toast((prefix ? prefix + "；" : "") + "有 " + n + " 处需人工核对，请查看黄色提示", 4200);
  }

  function applyNormalized(norm) {
    state.extraKeywords = norm.extraKeywords;
    state.selectedFields = new Set(norm.selectedFields);
  }

  function loadPrefs() {
    try {
      const fromV3 = localStorage.getItem(PREFS_KEY);
      const fromV2 = localStorage.getItem("schindler-po-export-v2");
      const raw = fromV3 || fromV2 || localStorage.getItem("schindler-po-export-v1");
      if (raw) {
        const p = JSON.parse(raw);
        if (Array.isArray(p.selectedFields)) state.selectedFields = new Set(p.selectedFields);
        if (Array.isArray(p.extraKeywords)) state.extraKeywords = p.extraKeywords;
        if (Array.isArray(p.columns)) state.columns = p.columns;
        if (p.bomTemplate) state.bomTemplate = p.bomTemplate;
        if (Array.isArray(p.bomLibrary)) state.bomLibrary = p.bomLibrary;
        if (Array.isArray(p.varMaps)) state.varMaps = p.varMaps;
        if (p.lookupTable) state.lookupTable = p.lookupTable;
        if (p.lookupKey) state.lookupKey = p.lookupKey;
        if (p.exportTemplate) state.exportTemplate = p.exportTemplate;
        if (Array.isArray(p.exportMaps)) state.exportMaps = p.exportMaps;
        if (p.skipRule) state.skipRule = p.skipRule;
        if (p.collapsedPanels && typeof p.collapsedPanels === "object") state.collapsedPanels = p.collapsedPanels;
        if (!fromV3 && !fromV2) state.selectedFields.add("documentDate");
      }
      const schemeRaw = localStorage.getItem(SCHEMES_KEY);
      if (schemeRaw) {
        const list = JSON.parse(schemeRaw);
        if (Array.isArray(list)) state.schemes = list.filter(function (s) { return s && s.name; });
      }
    } catch (e) {}
    applyNormalized(
      F.normalizeKeywordsAndSelection(state.extraKeywords, Array.from(state.selectedFields))
    );
    if (B) {
      state.bomLibrary = B.normalizeLibrary(state.bomLibrary, state.bomTemplate);
      syncPrimaryTemplate();
    }
  }

  function savePrefs() {
    localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({
        selectedFields: Array.from(state.selectedFields),
        extraKeywords: state.extraKeywords,
        columns: state.columns,
        bomTemplate: state.bomTemplate,
        bomLibrary: state.bomLibrary,
        varMaps: state.varMaps,
        lookupTable: state.lookupTable,
        lookupKey: state.lookupKey,
        exportTemplate: state.exportTemplate,
        exportMaps: state.exportMaps,
        skipRule: state.skipRule,
        collapsedPanels: state.collapsedPanels || {},
      })
    );
    localStorage.setItem(SCHEMES_KEY, JSON.stringify(state.schemes));
  }

  function panelIds() {
    return Array.prototype.map.call(document.querySelectorAll("section.panel[data-panel]"), function (el) {
      return el.getAttribute("data-panel");
    });
  }

  function applyPanelCollapsed() {
    document.querySelectorAll("section.panel[data-panel]").forEach(function (panel) {
      const id = panel.getAttribute("data-panel");
      const collapsed = !!(state.collapsedPanels && state.collapsedPanels[id]);
      panel.classList.toggle("collapsed", collapsed);
      const btn = panel.querySelector(".panel-toggle");
      if (btn) btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
      const hint = panel.querySelector(".panel-fold-hint");
      if (hint) hint.textContent = collapsed ? "展开" : "折叠";
    });
  }

  function setPanelCollapsed(id, collapsed) {
    if (!id) return;
    state.collapsedPanels = state.collapsedPanels || {};
    if (collapsed) state.collapsedPanels[id] = true;
    else delete state.collapsedPanels[id];
    applyPanelCollapsed();
    savePrefs();
  }

  function togglePanel(id) {
    setPanelCollapsed(id, !(state.collapsedPanels && state.collapsedPanels[id]));
  }

  function expandPanel(id) {
    setPanelCollapsed(id, false);
  }

  function setAllPanelsCollapsed(collapsed) {
    state.collapsedPanels = {};
    if (collapsed) {
      panelIds().forEach(function (id) {
        state.collapsedPanels[id] = true;
      });
    }
    applyPanelCollapsed();
    savePrefs();
  }

  function mergeDiscoveredKeywords(autoSelect) {
    const discovered = F.discoverExtraKeywords(state.rows);
    const kept = state.extraKeywords.filter(function (k) {
      return !k.discovered;
    });
    const keptLabels = {};
    kept.forEach(function (k) {
      keptLabels[k.label] = true;
    });
    discovered.forEach(function (k) {
      if (keptLabels[k.label]) return;
      kept.push(k);
      if (autoSelect !== false) state.selectedFields.add(k.id);
    });
    applyNormalized(F.normalizeKeywordsAndSelection(kept, Array.from(state.selectedFields)));
  }

  function setDocs(docs, source, pdfBuffers) {
    const sourceChanged = Boolean(state.source) && state.source !== source;
    state.docs = ensureDocWarnings(docs || []);
    state.rows = F.flattenDocs(state.docs);
    state.source = source;
    if (pdfBuffers) state.pdfBuffers = pdfBuffers;
    else if (source !== "upload") state.pdfBuffers = {};
    state.selectedRows = new Set(
      state.rows.map(function (r) {
        return r.id;
      })
    );
    mergeDiscoveredKeywords(true);
    const keep = sourceChanged ? [] : state.columns;
    state.columns = F.syncOutputColumns(keep, Array.from(state.selectedFields), state.extraKeywords);
    const panel = $("docsPanel");
    if (panel) {
      panel.hidden = false;
      expandPanel("docs");
    }
  }

  function selectedRowObjects() {
    return state.rows.filter(function (r) {
      return state.selectedRows.has(r.id);
    });
  }

  function rowMatchesFilter(row) {
    const q = String(state.rowFilter || "").trim().toLowerCase();
    if (!q) return true;
    const cols = resultColumns();
    if (state.rowFilterField) {
      const field = cols.find(function (c) {
        return c.id === state.rowFilterField;
      }) || F.fieldById(state.rowFilterField, state.extraKeywords);
      const v = field ? String(F.fieldValue(row, field) || "") : "";
      return v.toLowerCase().indexOf(q) >= 0;
    }
    if ((row.reviewFlags || []).map(flagLabel).join(" ").toLowerCase().indexOf(q) >= 0) return true;
    return cols.some(function (c) {
      return String(F.fieldValue(row, c) || "").toLowerCase().indexOf(q) >= 0;
    });
  }

  function visibleRows() {
    return state.rows.filter(rowMatchesFilter);
  }

  function updateRowCount() {
    const el = $("rowCount");
    if (!el) return;
    const shown = visibleRows();
    const visSel = shown.filter(function (r) {
      return state.selectedRows.has(r.id);
    }).length;
    el.textContent =
      "已选 " +
      state.selectedRows.size +
      " / 可见 " +
      shown.length +
      " / 共 " +
      state.rows.length +
      " 行 · 可见已选 " +
      visSel +
      " · " +
      state.docs.length +
      " 张 PO";
  }

  function fillFilterFieldSelect() {
    const sel = $("rowFilterField");
    if (!sel) return;
    const prev = state.rowFilterField || sel.value || "";
    sel.innerHTML = "";
    const all = document.createElement("option");
    all.value = "";
    all.textContent = "全部列";
    sel.appendChild(all);
    resultColumns().forEach(function (c) {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = c.label;
      sel.appendChild(opt);
    });
    const exists = prev && Array.prototype.some.call(sel.options, function (o) {
      return o.value === prev;
    });
    sel.value = exists ? prev : "";
    state.rowFilterField = sel.value;
    const input = $("rowFilter");
    if (input && document.activeElement !== input) input.value = state.rowFilter;
  }

  function bomExtras() {
    return {
      bomTemplate: state.bomTemplate || null,
      bomLibrary: B ? B.normalizeLibrary(state.bomLibrary, state.bomTemplate) : state.bomLibrary || [],
      varMaps: state.varMaps || [],
      lookupTable: state.lookupTable || null,
      lookupKey: state.lookupKey || "",
      exportTemplate: state.exportTemplate || null,
      exportMaps: B && B.uniqueExportMaps ? B.uniqueExportMaps(state.exportMaps || []) : state.exportMaps || [],
      skipRule: state.skipRule || { enabled: false, column: "计算数量", empty: true, zero: true },
    };
  }

  function syncPrimaryTemplate() {
    const lib = B ? B.normalizeLibrary(state.bomLibrary, null) : state.bomLibrary || [];
    state.bomLibrary = lib;
    const enabled = lib.filter(function (item) {
      return item.enabled !== false;
    });
    const first = enabled[0] || lib[0] || null;
    state.bomTemplate = first ? first.template : null;
  }

  function applyBomExtras(snap) {
    const lib = B
      ? B.normalizeLibrary(snap && snap.bomLibrary, snap && snap.bomTemplate)
      : (snap && Array.isArray(snap.bomLibrary) ? snap.bomLibrary : []);
    state.bomLibrary = lib;
    syncPrimaryTemplate();
    state.varMaps = snap && Array.isArray(snap.varMaps) ? snap.varMaps : [];
    state.lookupTable = snap && snap.lookupTable ? snap.lookupTable : null;
    state.lookupKey = snap && snap.lookupKey ? snap.lookupKey : (state.lookupTable && state.lookupTable.key) || "";
    state.exportTemplate = snap && snap.exportTemplate ? snap.exportTemplate : null;
    state.exportMaps = snap && Array.isArray(snap.exportMaps) ? snap.exportMaps : [];
    if (B && B.uniqueExportMaps) state.exportMaps = B.uniqueExportMaps(state.exportMaps);
    state.skipRule = snap && snap.skipRule
      ? snap.skipRule
      : { enabled: false, column: "计算数量", empty: true, zero: true };
    state.bomRows = [];
    syncBomMaps();
    syncExportMaps();
  }

  function syncBomMaps() {
    if (!B) return;
    const vars = B.libraryVariables(state.bomLibrary);
    if (!vars.length) {
      if (!(state.bomLibrary || []).length) state.varMaps = [];
      return;
    }
    state.varMaps = B.mergeVarMaps(vars, state.varMaps, state.extraKeywords);
  }

  function bomHeaderList() {
    if (!B) return [];
    if (B.libraryResultHeaders) return B.libraryResultHeaders(state.bomLibrary, activeLookup());
    return B.resultHeaders(state.bomTemplate, activeLookup());
  }

  function syncExportMaps() {
    if (!B) return;
    if (state.exportMaps && state.exportMaps.length && B.uniqueExportMaps) {
      state.exportMaps = B.uniqueExportMaps(state.exportMaps);
    }
    if (!state.exportTemplate || !state.exportTemplate.headers || !state.exportTemplate.headers.length) {
      return;
    }
    state.exportMaps = B.mergeExportMaps(
      state.exportTemplate.headers,
      state.exportMaps,
      bomHeaderList(),
      state.extraKeywords
    );
    const headers = state.exportMaps.map(function (m) { return m.header; });
    if (headers.length && headers.indexOf((state.skipRule && state.skipRule.column) || "") < 0) {
      const hit = headers.find(function (h) { return /数量|用量/.test(h); });
      state.skipRule = state.skipRule || { enabled: false, empty: true, zero: true };
      state.skipRule.column = hit || headers[0];
    }
  }

  function orderRowById() {
    const map = {};
    state.rows.forEach(function (r) {
      map[r.id] = r;
    });
    return map;
  }

  function skipRuleFromState() {
    const r = state.skipRule || {};
    return {
      enabled: !!r.enabled,
      column: r.column || (state.exportMaps[0] && state.exportMaps[0].header) || "计算数量",
      empty: r.empty !== false,
      zero: r.zero !== false,
    };
  }

  function computeFinalExport() {
    if (!B || !state.exportMaps.length) return [];
    const maps = B.uniqueExportMaps ? B.uniqueExportMaps(state.exportMaps) : state.exportMaps;
    const mapped = B.applyExport(
      B.uniqueRows(state.bomRows || []),
      orderRowById(),
      state.extraKeywords,
      maps,
      state.rows
    );
    return B.filterExportRows(mapped, skipRuleFromState());
  }

  function resolvedVarMaps() {
    return (state.varMaps || []).map(function (m) {
      if (!m || m.mode !== "column" || !m.value) return m;
      const col = state.columns.find(function (c) {
        return c.id === m.value;
      });
      if (col) return { name: m.name, mode: "formula", value: col.formula || "" };
      return m;
    });
  }

  function activeLookup() {
    if (!state.lookupTable || !state.lookupTable.rows || !state.lookupTable.rows.length) return null;
    return Object.assign({}, state.lookupTable, {
      key: state.lookupKey || state.lookupTable.key || "",
    });
  }

  function computeBomRows() {
    if (!B) {
      state.bomRows = [];
      return;
    }
    const lib = B.normalizeLibrary(state.bomLibrary, state.bomTemplate);
    const enabled = B.enabledLibrary ? B.enabledLibrary(lib) : lib.filter(function (item) {
      return item.enabled !== false;
    });
    if (!enabled.length) {
      state.bomRows = [];
      return;
    }
    state.bomRows = B.computeLibrary
      ? B.computeLibrary(selectedRowObjects(), lib, resolvedVarMaps(), state.extraKeywords, activeLookup())
      : B.uniqueRows(B.compute(
        selectedRowObjects(),
        enabled[0].template,
        resolvedVarMaps(),
        state.extraKeywords,
        activeLookup(),
        enabled[0].id
      ));
  }

  function sheetToAoa(wb) {
    const name = wb.SheetNames && wb.SheetNames[0];
    const sheet = name ? wb.Sheets[name] : null;
    if (!sheet) return [];
    const ref = sheet["!ref"];
    if (!ref) return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });
    const range = XLSX.utils.decode_range(ref);
    const aoa = [];
    for (let r = range.s.r; r <= range.e.r; r++) {
      const row = [];
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = sheet[XLSX.utils.encode_cell({ r: r, c: c })];
        if (!cell) {
          row.push("");
          continue;
        }
        if (cell.f) row.push("=" + cell.f);
        else if (cell.w != null && cell.w !== "") row.push(String(cell.w));
        else if (cell.v != null) row.push(String(cell.v));
        else row.push("");
      }
      aoa.push(row);
    }
    return aoa;
  }

  function isCsvName(name, mime) {
    return /\.csv$/i.test(name || "") || mime === "text/csv" || mime === "text/plain";
  }

  function aoaFromText(text, name) {
    if (B && B.parseCsv && (isCsvName(name) || !window.XLSX)) {
      return B.parseCsv(text);
    }
    if (!window.XLSX) throw new Error("未加载表格组件");
    const wb = XLSX.read(text, { type: "string", raw: false });
    return sheetToAoa(wb);
  }

  function readTableFile(file) {
    if (isCsvName(file.name, file.type)) {
      return file.text().then(function (text) {
        return { name: file.name, aoa: aoaFromText(text, file.name) };
      });
    }
    return file.arrayBuffer().then(function (buf) {
      if (!window.XLSX) throw new Error("未加载表格组件");
      const wb = XLSX.read(new Uint8Array(buf), { type: "array", cellFormula: true, raw: false });
      return { name: file.name, aoa: sheetToAoa(wb) };
    });
  }

  function readTableText(text, name) {
    return { name: name || "", aoa: aoaFromText(text, name) };
  }

  function recognizedSample(field) {
    for (let i = 0; i < state.rows.length; i++) {
      const v = F.fieldValue(state.rows[i], field);
      if (v) return v;
    }
    return "";
  }

  function renderFieldGroup(el, fields, noteEmpty) {
    el.innerHTML = "";
    fields.forEach(function (field) {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = state.selectedFields.has(field.id);
      input.dataset.fieldId = field.id;
      label.appendChild(input);
      const span = document.createElement("span");
      span.textContent = field.label;
      if (noteEmpty) {
        const filled = state.rows.some(function (r) {
          return F.fieldValue(r, field);
        });
        if (!filled) span.textContent += "（样张为空，仍可导出）";
      }
      label.appendChild(span);
      el.appendChild(label);
    });
  }

  function renderCustomChips() {
    const box = $("customChips");
    box.innerHTML = "";
    state.extraKeywords.forEach(function (k, i) {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = k.label;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = "×";
      btn.dataset.removeKw = String(i);
      chip.appendChild(btn);
      box.appendChild(chip);
    });
  }

  function renderSchemeSelect() {
    const sel = $("schemeSelect");
    const current = sel.value;
    sel.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = state.schemes.length ? "选择已存方案" : "暂无已存方案";
    sel.appendChild(placeholder);
    state.schemes.forEach(function (s, i) {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = s.name;
      sel.appendChild(opt);
    });
    if (current && Number(current) < state.schemes.length) sel.value = current;
  }

  function renderFields() {
    renderFieldGroup($("coreFields"), F.CORE_FIELDS, false);
    renderFieldGroup($("optionalFields"), F.OPTIONAL_FIELDS, false);
    renderFieldGroup($("keywordFields"), F.KEYWORD_FIELDS, true);
    state.extraKeywords.forEach(function (k) {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = state.selectedFields.has(k.id);
      input.dataset.fieldId = k.id;
      label.appendChild(input);
      const span = document.createElement("span");
      span.textContent = k.label + (k.discovered ? "（文档中发现）" : "（自定义）");
      label.appendChild(span);
      $("keywordFields").appendChild(label);
    });
    renderCustomChips();
    renderSchemeSelect();
  }

  function resultColumns() {
    return F.CORE_FIELDS.concat(F.OPTIONAL_FIELDS, F.KEYWORD_FIELDS).concat(
      state.extraKeywords.map(function (k) {
        return { id: k.id, label: k.label };
      })
    );
  }

  function renderResultTable() {
    fillFilterFieldSelect();
    const cols = resultColumns();
    const shown = visibleRows();
    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const hr = document.createElement("tr");
    const th0 = document.createElement("th");
    th0.textContent = "输出";
    hr.appendChild(th0);
    cols.forEach(function (c) {
      const th = document.createElement("th");
      th.textContent = c.label;
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    const tbody = document.createElement("tbody");
    shown.forEach(function (row) {
      const tr = document.createElement("tr");
      const flags = row.reviewFlags || [];
      if (flags.length) {
        tr.classList.add("needs-review");
        tr.title = "需核对：" + flags.map(flagLabel).join("、");
      }
      const td0 = document.createElement("td");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = state.selectedRows.has(row.id);
      cb.dataset.rowId = row.id;
      td0.appendChild(cb);
      if (flags.length) {
        const mark = document.createElement("span");
        mark.className = "review-mark";
        mark.textContent = "需核对";
        td0.appendChild(mark);
      }
      tr.appendChild(td0);
      cols.forEach(function (c) {
        const td = document.createElement("td");
        const v = F.fieldValue(row, c);
        if (!v) {
          td.className = "empty";
          td.textContent = "—";
        } else {
          if (["qty", "unitPrice", "amount", "poNumber", "lineNo", "materialNo", "companyCode"].indexOf(c.id) >= 0) {
            td.className = "num";
          }
          if (["description", "drawingRev", "supplierName", "deliveryAddress"].indexOf(c.id) >= 0) {
            td.classList.add("wrap");
          }
          td.textContent = v;
        }
        tr.appendChild(td);
      });
      tr.classList.add("result-row");
      tr.dataset.po = row.poNumber || "";
      tr.dataset.line = row.lineNo || "";
      tr.title = (tr.title ? tr.title + " · " : "") + "点击查看该订单识别内容";
      tr.addEventListener("click", function (ev) {
        if (ev.target && ev.target.closest && ev.target.closest("input")) return;
        jumpToPo(row.poNumber, row.lineNo);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(thead);
    table.appendChild(tbody);
    $("resultTable").innerHTML = "";
    if (!shown.length) {
      const empty = document.createElement("p");
      empty.className = "hint";
      empty.style.padding = "12px";
      empty.textContent = state.rows.length ? "没有符合筛选条件的行" : "还没有识别结果";
      $("resultTable").appendChild(empty);
    }
    $("resultTable").appendChild(table);
    updateRowCount();
    $("sourceHint").textContent =
      state.source === "demo"
        ? "当前：三份样张预识别结果"
        : state.source === "two-lines"
          ? "当前：双行项目 + 新字段（颜色 / 表面处理）样张"
          : state.source === "upload"
            ? "当前：本地上传识别"
            : state.source === "review"
              ? "当前：需核对样张（跨页续行 / 无物料号 / 服务类行）"
              : "";
  }

  function editingColumn() {
    if (!state.editingColId) return null;
    return state.columns.find(function (c) {
      return c.id === state.editingColId;
    }) || null;
  }

  function syncFormatBar() {
    const bar = $("colFormatBar");
    const col = editingColumn();
    if (!col) {
      bar.hidden = true;
      return;
    }
    bar.hidden = false;
    $("colFormatWhich").textContent = col.header || "未命名列";
    if (document.activeElement !== $("colFormatHeader")) $("colFormatHeader").value = col.header;
    if (document.activeElement !== $("colFormatFormula")) $("colFormatFormula").value = col.formula;
    const idx = state.columns.findIndex(function (c) {
      return c.id === col.id;
    });
    $("btnColMoveLeft").disabled = idx <= 0;
    $("btnColMoveRight").disabled = idx < 0 || idx >= state.columns.length - 1;
  }

  function openColFormat(colId, focusFormula) {
    state.editingColId = colId;
    const col = editingColumn();
    if (!col) return;
    $("colFormatBar").hidden = false;
    $("colFormatWhich").textContent = col.header || "未命名列";
    $("colFormatHeader").value = col.header;
    $("colFormatFormula").value = col.formula;
    renderOutputTable();
    const input = focusFormula === false ? $("colFormatHeader") : $("colFormatFormula");
    input.focus();
    input.select();
  }

  function closeColFormat() {
    state.editingColId = null;
    $("colFormatBar").hidden = true;
    renderOutputTable();
  }

  function applyColumnOrder(next) {
    const same =
      next.length === state.columns.length &&
      next.every(function (c, i) {
        return c.id === state.columns[i].id;
      });
    if (same) return false;
    state.columns = next;
    renderOutputTable();
    savePrefs();
    return true;
  }

  function moveEditingColumn(delta) {
    const col = editingColumn();
    if (!col) return;
    applyColumnOrder(F.moveColumnBy(state.columns, col.id, delta));
  }

  function dropTargetBeforeId(th, clientX) {
    const rect = th.getBoundingClientRect();
    const after = clientX > rect.left + rect.width / 2;
    if (!after) return th.dataset.colId;
    const next = th.nextElementSibling;
    return next && next.dataset && next.dataset.colId ? next.dataset.colId : null;
  }

  function clearDropMarks() {
    const table = $("outputTable");
    if (!table) return;
    table.querySelectorAll("th.col-head").forEach(function (th) {
      th.classList.remove("drop-before", "drop-after", "dragging");
      th.style.pointerEvents = "";
    });
  }

  function renderOutputTable() {
    const rows = F.computeOutput(selectedRowObjects(), state.columns, state.extraKeywords);
    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const hr = document.createElement("tr");
    state.columns.forEach(function (col) {
      const th = document.createElement("th");
      th.className = "col-head" + (col.id === state.editingColId ? " editing" : "");
      if (col.id === state.dragColId) th.classList.add("dragging");
      th.dataset.colId = col.id;
      th.title = "点击设置列名和格式；拖动手柄调整顺序";
      const grip = document.createElement("span");
      grip.className = "col-drag";
      grip.title = "拖动调整列顺序";
      grip.textContent = "::";
      th.appendChild(grip);
      const name = document.createElement("span");
      name.className = "col-name";
      name.textContent = col.header || "（空列名）";
      th.appendChild(name);
      const hint = document.createElement("span");
      hint.className = "edit-hint";
      hint.textContent = col.id === state.editingColId ? "编辑中" : "点击编辑";
      th.appendChild(hint);
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    const tbody = document.createElement("tbody");
    rows.forEach(function (row) {
      const tr = document.createElement("tr");
      state.columns.forEach(function (col) {
        const td = document.createElement("td");
        const v = row[col.id];
        if (!v) {
          td.className = "empty";
          td.textContent = "—";
        } else {
          td.textContent = v;
          if (/^\d/.test(v)) td.classList.add("num");
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(thead);
    table.appendChild(tbody);
    $("outputTable").innerHTML = "";
    $("outputTable").appendChild(table);
    syncFormatBar();
  }

  function extraPairs(item) {
    const extras = (item && item.extras) || {};
    return Object.keys(extras)
      .filter(function (k) {
        return extras[k];
      })
      .map(function (k) {
        return k + " " + extras[k];
      });
  }

  function sumAmounts(doc) {
    return (doc.items || []).reduce(function (s, it) {
      const n = parseFloat(String(it.amount || "").replace(/,/g, ""));
      return s + (isFinite(n) ? n : 0);
    }, 0);
  }

  function fmtMoney(n) {
    if (!isFinite(n)) return "";
    return n.toFixed(2);
  }

  function jumpToPo(poNumber, lineNo) {
    const panel = $("docsPanel");
    if (panel) {
      panel.hidden = false;
      expandPanel("docs");
    }
    const id = "po-" + String(poNumber || "").replace(/[^\w-]/g, "");
    const card = document.getElementById(id);
    if (!card) {
      toast("没有找到该订单的识别内容");
      return;
    }
    const scroller = $("docsScroll");
    if (scroller && scroller.contains(card)) {
      const sRect = scroller.getBoundingClientRect();
      const cRect = card.getBoundingClientRect();
      scroller.scrollBy({ top: cRect.top - sRect.top - 10, behavior: "smooth" });
    } else {
      card.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    card.classList.add("flash");
    setTimeout(function () {
      card.classList.remove("flash");
    }, 1600);
    if (lineNo) {
      const row = card.querySelector('tr[data-line="' + lineNo + '"]');
      if (row) row.classList.add("flash");
    }
  }

  function renderSummary() {
    const box = $("summaryCards");
    if (!box) return;
    const docs = state.docs || [];
    const items = docs.reduce(function (s, d) {
      return s + ((d.items && d.items.length) || 0);
    }, 0);
    const amount = docs.reduce(function (s, d) {
      return s + sumAmounts(d);
    }, 0);
    const missing = docs.reduce(function (s, d) {
      return (
        s +
        (d.items || []).filter(function (it) {
          return !it.qty || !it.unit;
        }).length
      );
    }, 0);
    box.innerHTML =
      '<article class="stat"><label>采购订单</label><strong>' +
      docs.length +
      "</strong><span>份 PDF</span></article>" +
      '<article class="stat"><label>行项目</label><strong>' +
      items +
      "</strong><span>已识别</span></article>" +
      '<article class="stat"><label>未税合计</label><strong>' +
      (amount ? fmtMoney(amount) : "—") +
      "</strong><span>CNY</span></article>" +
      '<article class="stat"><label>缺数量/单位</label><strong>' +
      missing +
      "</strong><span>" +
      (missing ? "请对照原件" : "均已识别") +
      "</span></article>";
  }

  function kvHtml(pairs) {
    return pairs
      .map(function (pair) {
        return "<dt>" + escapeHtml(pair[0]) + "</dt><dd>" + escapeHtml(pair[1] || "—") + "</dd>";
      })
      .join("");
  }

  function renderDocs() {
    const root = $("docs");
    if (!root) return;
    renderSummary();
    root.innerHTML = "";
    const token = ++state.pdfPaintToken;
    state.docs.forEach(function (doc) {
      const el = document.createElement("article");
      el.className = "po-card";
      const po = (doc.header && doc.header.poNumber) || "";
      el.id = "po-" + String(po || doc.file || "").replace(/[^\w-]/g, "");
      const items = doc.items || [];
      const missing = items.filter(function (it) {
        return !it.qty || !it.unit;
      }).length;
      const lineRows = items
        .map(function (it) {
          const missQty = !it.qty;
          const missUnit = !it.unit;
          const extra = extraPairs(it).join("；");
          return (
            '<tr data-line="' +
            escapeHtml(it.lineNo || "") +
            '">' +
            "<td>" +
            escapeHtml(it.lineNo || "") +
            "</td>" +
            "<td>" +
            escapeHtml(it.materialNo || "—") +
            "</td>" +
            '<td class="wrap">' +
            escapeHtml(it.description || "—") +
            "</td>" +
            '<td class="num' +
            (missQty ? " miss" : "") +
            '">' +
            escapeHtml(it.qty || "—") +
            "</td>" +
            "<td" +
            (missUnit ? ' class="miss"' : "") +
            ">" +
            escapeHtml(it.unit || "—") +
            "</td>" +
            '<td class="num">' +
            escapeHtml(it.unitPrice || "—") +
            "</td>" +
            '<td class="num">' +
            escapeHtml(it.amount || "—") +
            "</td>" +
            '<td class="wrap">' +
            escapeHtml(extra || "—") +
            "</td></tr>"
          );
        })
        .join("");
      el.innerHTML =
        "<header><div><p class='kicker'>Purchase order</p><h3>No. <span class='po'>" +
        escapeHtml(po || "—") +
        "</span></h3><div class='meta' style='color:#57534e;font-size:13px'>" +
        escapeHtml(doc.file || "") +
        " · " +
        items.length +
        " 条行项目 · " +
        (doc.pageCount || 1) +
        " 页</div></div>" +
        '<div class="po-total">未税 ' +
        escapeHtml((doc.header && doc.header.vatTotal) || fmtMoney(sumAmounts(doc)) || "—") +
        (missing ? ' <span class="pill warn">缺数量/单位 ' + missing + "</span>" : ' <span class="pill">数量单位已识别</span>') +
        "</div></header>" +
        '<div class="po-layout"><div class="po-preview" data-file="' +
        escapeHtml(doc.file || "") +
        '"></div><div>' +
        '<dl class="kv">' +
        kvHtml([
          ["供应商", doc.header.supplierName],
          ["供应商代码", doc.header.supplierCode],
          ["联系人", doc.header.supplierContact],
          ["凭证日期", doc.header.documentDate],
          ["交货日期", doc.header.deliveryDate],
          ["交货地址", doc.header.deliveryAddress],
          ["付款条件", doc.header.paymentTerms],
          ["贸易条款", doc.header.incoterms],
          ["公司代码", doc.header.companyCode],
          ["采购组", doc.header.purchaseGroup],
        ]) +
        "</dl>" +
        '<div class="item-block"><table class="mini"><thead><tr>' +
        "<th>行项目</th><th>物料号</th><th>物料描述</th><th>数量</th><th>单位</th><th>未税单价</th><th>未税金额</th><th>行下字段</th>" +
        "</tr></thead><tbody>" +
        (lineRows || '<tr><td colspan="8" class="empty">没有行项目</td></tr>') +
        "</tbody></table>" +
        (missing ? '<p class="miss-hint">有 ' + missing + " 行缺少数量或单位，请对照左侧原件纠错。</p>" : "") +
        "</div></div></div>";
      root.appendChild(el);
      fillPreview(el.querySelector(".po-preview"), doc.file, token);
    });
  }

  function fillPreview(box, fileName, token) {
    if (!box) return;
    const buffer = state.pdfBuffers && state.pdfBuffers[fileName];
    if (buffer && pdfjsLib) {
      paintPdfPreview(box, buffer, token);
      return;
    }
    const preview = "assets/previews/" + String(fileName || "").replace(/\.pdf$/i, ".png");
    const img = document.createElement("img");
    img.alt = fileName || "";
    img.src = preview;
    img.addEventListener("error", function () {
      box.innerHTML = '<p class="muted">没有原件预览。上传 PDF 后可在此对照。</p>';
    });
    box.innerHTML = "";
    box.appendChild(img);
  }

  async function paintPdfPreview(box, buffer, token) {
    try {
      const pdf = await pdfjsLib.getDocument({
        data: buffer.slice(0),
        cMapUrl: PDFJS_BASE + "cmaps/",
        cMapPacked: true,
        standardFontDataUrl: PDFJS_BASE + "standard_fonts/",
      }).promise;
      if (token !== state.pdfPaintToken) return;
      box.innerHTML = "";
      const max = Math.min(pdf.numPages, 2);
      for (let i = 1; i <= max; i++) {
        const page = await pdf.getPage(i);
        if (token !== state.pdfPaintToken) return;
        const unscaled = page.getViewport({ scale: 1 });
        const scale = Math.min(1.2, 280 / unscaled.width);
        const viewport = page.getViewport({ scale: scale });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext("2d"), viewport: viewport }).promise;
        box.appendChild(canvas);
      }
    } catch (err) {
      box.innerHTML = '<p class="muted">原件预览失败</p>';
    }
  }

  function fieldOptionsForVar() {
    const groups = [
      { label: "识别字段", items: F.CORE_FIELDS.concat(F.OPTIONAL_FIELDS, F.KEYWORD_FIELDS) },
      {
        label: "关键字",
        items: state.extraKeywords.map(function (k) {
          return { id: k.id, label: k.label };
        }),
      },
      {
        label: "导出列",
        items: state.columns.map(function (c) {
          return { id: c.id, label: (c.header || "未命名列") + "（导出）" };
        }),
      },
    ];
    return groups.filter(function (g) {
      return g.items.length;
    });
  }

  function renderBomLibrary() {
    const box = $("bomLibrary");
    if (!box) return;
    box.innerHTML = "";
    const lib = state.bomLibrary || [];
    if (!lib.length) {
      const p = document.createElement("p");
      p.className = "hint";
      p.style.padding = "10px 12px";
      p.style.margin = "0";
      p.textContent = "尚未上传。拖入或选择表格会加入列表，可继续添加；点「替换」可修改某一份。";
      box.appendChild(p);
      return;
    }
    const head = document.createElement("h4");
    head.textContent = "已上传 BOM（" + lib.length + "）";
    box.appendChild(head);
    const ul = document.createElement("ul");
    lib.forEach(function (item) {
      const li = document.createElement("li");
      const chk = document.createElement("label");
      chk.className = "chk";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = item.enabled !== false;
      input.dataset.bomEnable = item.id;
      chk.appendChild(input);
      const mark = document.createElement("span");
      mark.textContent = "计算";
      chk.appendChild(mark);
      li.appendChild(chk);
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = item.name || "BOM";
      name.title = item.name || "";
      li.appendChild(name);
      const meta = document.createElement("span");
      meta.className = "meta";
      meta.textContent = ((item.template && item.template.rows) || []).length + " 个子件";
      li.appendChild(meta);
      const btnRep = document.createElement("button");
      btnRep.type = "button";
      btnRep.className = "ghost";
      btnRep.textContent = "替换";
      btnRep.dataset.bomReplace = item.id;
      li.appendChild(btnRep);
      const btnDel = document.createElement("button");
      btnDel.type = "button";
      btnDel.className = "ghost";
      btnDel.textContent = "删除";
      btnDel.dataset.bomDelete = item.id;
      li.appendChild(btnDel);
      ul.appendChild(li);
    });
    box.appendChild(ul);
  }

  function renderVarMapTable() {
    const box = $("varMapTable");
    if (!box) return;
    box.innerHTML = "";
    if (!(state.bomLibrary || []).length) {
      box.innerHTML = '<p class="hint" style="padding:12px">先导入 BOM 模板，将自动列出公式中的变量。</p>';
      return;
    }
    if (!state.varMaps.length) {
      box.innerHTML = '<p class="hint" style="padding:12px">模板公式中没有识别到变量。</p>';
      return;
    }
    const table = document.createElement("table");
    table.className = "var-map-table";
    table.innerHTML = "<thead><tr><th>变量</th><th>来源</th><th>取值</th></tr></thead>";
    const tbody = document.createElement("tbody");
    const groups = fieldOptionsForVar();
    state.varMaps.forEach(function (m) {
      const tr = document.createElement("tr");
      const tdName = document.createElement("td");
      tdName.textContent = m.name;
      const tdMode = document.createElement("td");
      tdMode.className = "mode";
      const mode = document.createElement("select");
      mode.dataset.varName = m.name;
      mode.dataset.varProp = "mode";
      [["column", "识别/导出列"], ["formula", "公式"], ["const", "固定值"]].forEach(function (pair) {
        const opt = document.createElement("option");
        opt.value = pair[0];
        opt.textContent = pair[1];
        if (m.mode === pair[0]) opt.selected = true;
        mode.appendChild(opt);
      });
      tdMode.appendChild(mode);
      const tdVal = document.createElement("td");
      tdVal.className = "value";
      if (m.mode === "column") {
        const sel = document.createElement("select");
        sel.dataset.varName = m.name;
        sel.dataset.varProp = "value";
        const blank = document.createElement("option");
        blank.value = "";
        blank.textContent = "请选择列";
        sel.appendChild(blank);
        groups.forEach(function (g) {
          const og = document.createElement("optgroup");
          og.label = g.label;
          g.items.forEach(function (item) {
            const opt = document.createElement("option");
            opt.value = item.id;
            opt.textContent = item.label;
            if (m.value === item.id) opt.selected = true;
            og.appendChild(opt);
          });
          sel.appendChild(og);
        });
        tdVal.appendChild(sel);
      } else {
        const input = document.createElement("input");
        input.type = "text";
        input.dataset.varName = m.name;
        input.dataset.varProp = "value";
        input.value = m.value || "";
        input.placeholder = m.mode === "formula" ? '=数量*2 或 {物料号}' : "例如 1 或 1200 mm";
        tdVal.appendChild(input);
      }
      tr.appendChild(tdName);
      tr.appendChild(tdMode);
      tr.appendChild(tdVal);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    box.appendChild(table);
  }

  function renderLookupKeySelect() {
    const sel = $("lookupKey");
    if (!sel) return;
    const headers = (state.lookupTable && state.lookupTable.headers) || [];
    const prev = state.lookupKey || (state.lookupTable && state.lookupTable.key) || "";
    sel.innerHTML = "";
    if (!headers.length) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "无对照表";
      sel.appendChild(opt);
      sel.disabled = true;
      return;
    }
    sel.disabled = false;
    headers.forEach(function (h) {
      if (!h) return;
      const opt = document.createElement("option");
      opt.value = h;
      opt.textContent = h;
      sel.appendChild(opt);
    });
    sel.value = headers.indexOf(prev) >= 0 ? prev : headers[0];
    state.lookupKey = sel.value;
    if (state.lookupTable) state.lookupTable.key = state.lookupKey;
  }

  function renderBomTable() {
    const box = $("bomTable");
    const count = $("bomCount");
    if (!box) return;
    box.innerHTML = "";
    if (!(state.bomLibrary || []).some(function (item) { return item.enabled !== false; })) {
      if (count) count.textContent = "";
      return;
    }
    const headers = bomHeaderList();
    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const hr = document.createElement("tr");
    headers.forEach(function (h) {
      const th = document.createElement("th");
      th.textContent = h;
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    const tbody = document.createElement("tbody");
    (state.bomRows || []).forEach(function (row) {
      const tr = document.createElement("tr");
      if (row._kind === "lookup") tr.className = "bom-lookup";
      headers.forEach(function (h) {
        const td = document.createElement("td");
        const v = row[h];
        if (h === "来源") {
          const pill = document.createElement("span");
          pill.className = "kind-pill" + (row._kind === "lookup" ? " lookup" : "");
          pill.textContent = v || "";
          td.appendChild(pill);
        } else if (v == null || v === "") {
          td.className = "empty";
          td.textContent = "—";
        } else {
          td.textContent = String(v);
          if (h === "计算数量" || /^\d/.test(String(v))) td.classList.add("num");
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(thead);
    table.appendChild(tbody);
    box.appendChild(table);
    if (count) {
      const nBom = (state.bomRows || []).filter(function (r) { return r._kind === "bom"; }).length;
      const nLk = (state.bomRows || []).filter(function (r) { return r._kind === "lookup"; }).length;
      const nTpl = B && B.enabledLibrary ? B.enabledLibrary(state.bomLibrary).length : (state.bomLibrary || []).length;
      count.textContent =
        "BOM " + nBom + " 行" + (nLk ? " · 对照 " + nLk + " 行" : "") +
        " · " + nTpl + " 份模板 · 来自 " + selectedRowObjects().length + " 条勾选订单";
    }
  }

  function renderBom() {
    syncPrimaryTemplate();
    syncBomMaps();
    renderBomLibrary();
    const tplHint = $("bomTplHint");
    if (tplHint) {
      const lib = state.bomLibrary || [];
      const enabled = lib.filter(function (item) { return item.enabled !== false; });
      const vars = B ? B.libraryVariables(lib) : [];
      tplHint.textContent = lib.length
        ? "列表 " + lib.length + " 份，计算 " + enabled.length + " 份 · 子件 " +
          enabled.reduce(function (n, item) { return n + ((item.template && item.template.rows) || []).length; }, 0) +
          " · 变量 " + (vars.join("、") || "无") + "。继续上传可追加。"
        : "尚未导入模板。可用示例：螺丝=数量×4，灯芯按轿厢宽度分档。";
    }
    const lkHint = $("lookupHint");
    if (lkHint) {
      lkHint.textContent = state.lookupTable
        ? "已加载「" +
          (state.lookupTable.name || "对照表") +
          "」· " +
          (state.lookupTable.rows || []).length +
          " 行 · 按「" +
          (state.lookupKey || state.lookupTable.key || "") +
          "」匹配订单物料号"
        : "可选。匹配到物料号的行会追加到该订单 BOM 下方。";
    }
    renderLookupKeySelect();
    renderVarMapTable();
    computeBomRows();
    renderBomTable();
    renderExport();
  }

  function renderExportMapTable() {
    const box = $("exportMapTable");
    if (!box) return;
    box.innerHTML = "";
    if (!state.exportTemplate || !state.exportMaps.length) {
      box.innerHTML = '<p class="hint" style="padding:12px">先上传导出表头，或点「按 BOM 表头生成」。</p>';
      return;
    }
    const bomHeads = bomHeaderList();
    const orderFields = F.CORE_FIELDS.concat(F.OPTIONAL_FIELDS, F.KEYWORD_FIELDS).concat(
      state.extraKeywords.map(function (k) {
        return { id: k.id, label: k.label };
      })
    );
    const table = document.createElement("table");
    table.className = "var-map-table";
    table.innerHTML = "<thead><tr><th>导出列</th><th>来源</th><th>取值</th></tr></thead>";
    const tbody = document.createElement("tbody");
    state.exportMaps.forEach(function (m) {
      const tr = document.createElement("tr");
      const tdH = document.createElement("td");
      tdH.textContent = m.header;
      const tdMode = document.createElement("td");
      tdMode.className = "mode";
      const mode = document.createElement("select");
      mode.dataset.exHeader = m.header;
      mode.dataset.exProp = "mode";
      [["bom", "BOM 计算列"], ["order", "识别订单列"], ["formula", "公式"], ["const", "固定值"]].forEach(function (pair) {
        const opt = document.createElement("option");
        opt.value = pair[0];
        opt.textContent = pair[1];
        if (m.mode === pair[0]) opt.selected = true;
        mode.appendChild(opt);
      });
      tdMode.appendChild(mode);
      const tdVal = document.createElement("td");
      tdVal.className = "value";
      if (m.mode === "bom") {
        const sel = document.createElement("select");
        sel.dataset.exHeader = m.header;
        sel.dataset.exProp = "value";
        const blank = document.createElement("option");
        blank.value = "";
        blank.textContent = "请选择 BOM 列";
        sel.appendChild(blank);
        bomHeads.forEach(function (h) {
          const opt = document.createElement("option");
          opt.value = h;
          opt.textContent = h;
          if (m.value === h) opt.selected = true;
          sel.appendChild(opt);
        });
        tdVal.appendChild(sel);
      } else if (m.mode === "order") {
        const sel = document.createElement("select");
        sel.dataset.exHeader = m.header;
        sel.dataset.exProp = "value";
        const blank = document.createElement("option");
        blank.value = "";
        blank.textContent = "请选择订单列";
        sel.appendChild(blank);
        orderFields.forEach(function (f) {
          const opt = document.createElement("option");
          opt.value = f.id;
          opt.textContent = f.label;
          if (m.value === f.id) opt.selected = true;
          sel.appendChild(opt);
        });
        tdVal.appendChild(sel);
      } else {
        const input = document.createElement("input");
        input.type = "text";
        input.dataset.exHeader = m.header;
        input.dataset.exProp = "value";
        input.value = m.value || "";
        input.placeholder = m.mode === "formula" ? '={计算数量}*1 或 {物料描述}' : "固定文字";
        tdVal.appendChild(input);
      }
      tr.appendChild(tdH);
      tr.appendChild(tdMode);
      tr.appendChild(tdVal);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    box.appendChild(table);
  }

  function renderSkipControls() {
    const rule = skipRuleFromState();
    const en = $("skipEnabled");
    const col = $("skipColumn");
    const empty = $("skipEmpty");
    const zero = $("skipZero");
    if (en && document.activeElement !== en) en.checked = rule.enabled;
    if (empty && document.activeElement !== empty) empty.checked = rule.empty;
    if (zero && document.activeElement !== zero) zero.checked = rule.zero;
    if (!col) return;
    const prev = rule.column;
    col.innerHTML = "";
    const headers = (state.exportMaps || []).map(function (m) { return m.header; });
    const extras = bomHeaderList();
    const seen = {};
    headers.concat(extras).forEach(function (h) {
      if (!h || seen[h]) return;
      seen[h] = true;
      const opt = document.createElement("option");
      opt.value = h;
      opt.textContent = h;
      col.appendChild(opt);
    });
    if (!col.options.length) {
      const opt = document.createElement("option");
      opt.value = "计算数量";
      opt.textContent = "计算数量";
      col.appendChild(opt);
    }
    col.value = seen[prev] ? prev : (col.options[0] && col.options[0].value) || "计算数量";
    state.skipRule.column = col.value;
  }

  function renderFinalExportTable() {
    const box = $("finalExportTable");
    const count = $("exportCount");
    if (!box) return;
    box.innerHTML = "";
    if (!state.exportMaps.length) {
      if (count) count.textContent = "";
      return;
    }
    const rows = computeFinalExport();
    const headers = state.exportMaps.map(function (m) { return m.header; });
    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const hr = document.createElement("tr");
    headers.forEach(function (h) {
      const th = document.createElement("th");
      th.textContent = h;
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    const tbody = document.createElement("tbody");
    rows.forEach(function (row) {
      const tr = document.createElement("tr");
      if (row._kind === "lookup") tr.className = "bom-lookup";
      headers.forEach(function (h) {
        const td = document.createElement("td");
        const v = row[h];
        if (v == null || v === "") {
          td.className = "empty";
          td.textContent = "—";
        } else {
          td.textContent = String(v);
          if (/^\d/.test(String(v))) td.classList.add("num");
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(thead);
    table.appendChild(tbody);
    box.appendChild(table);
    if (count) {
      const raw = (state.bomRows || []).length;
      count.textContent = "将导出 " + rows.length + " 行（BOM 计算 " + raw + " 行" + (raw !== rows.length ? "，已按空/0 跳过" : "") + "）";
    }
  }

  function renderExport() {
    syncExportMaps();
    const hint = $("exportTplHint");
    if (hint) {
      hint.textContent = state.exportTemplate && state.exportTemplate.headers && state.exportTemplate.headers.length
        ? "已加载「" + (state.exportTemplate.name || "导出模板") + "」· " + state.exportTemplate.headers.length + " 列：" + state.exportTemplate.headers.join("、")
        : "尚未导入表头。最终导出按 BOM 计算行输出，可先加载示例表头。";
    }
    renderExportMapTable();
    renderSkipControls();
    renderFinalExportTable();
  }

  function setExportTemplate(aoa, name) {
    if (!B) {
      toast("未加载 BOM 组件");
      return;
    }
    const tpl = B.parseExportTemplate(aoa, name);
    if (!tpl.headers.length) {
      toast("模板没有表头");
      return;
    }
    state.exportTemplate = tpl;
    state.exportMaps = [];
    syncExportMaps();
    render();
    toast("已加载导出表头 " + tpl.headers.length + " 列");
  }

  function setExportFromBomHeaders() {
    if (!B || !(state.bomLibrary || []).some(function (item) { return item.enabled !== false; })) {
      toast("请先导入并计算 BOM");
      return;
    }
    const headers = bomHeaderList();
    state.exportTemplate = { name: "BOM表头", headers: headers };
    state.exportMaps = [];
    syncExportMaps();
    render();
    toast("已按 BOM 表头生成 " + headers.length + " 列");
  }

  function setBomTemplate(aoa, name) {
    addOrReplaceBom(aoa, name);
  }

  function addOrReplaceBom(aoa, name) {
    if (!B) {
      toast("未加载 BOM 组件");
      return;
    }
    const tpl = B.parseTemplate(aoa, name);
    if (!tpl.rows.length) {
      toast("模板没有数据行");
      return;
    }
    state.bomLibrary = B.normalizeLibrary(state.bomLibrary, null);
    const replaceId = state.replacingBomId;
    state.replacingBomId = null;
    if (replaceId) {
      const idx = state.bomLibrary.findIndex(function (item) {
        return item.id === replaceId;
      });
      if (idx >= 0) {
        state.bomLibrary[idx] = {
          id: replaceId,
          name: name || tpl.name || state.bomLibrary[idx].name,
          enabled: state.bomLibrary[idx].enabled !== false,
          template: tpl,
        };
        syncPrimaryTemplate();
        syncBomMaps();
        render();
        toast("已替换「" + (state.bomLibrary[idx].name) + "」· " + tpl.rows.length + " 个子件");
        return;
      }
    }
    const item = B.makeLibraryItem(tpl, name);
    state.bomLibrary.push(item);
    syncPrimaryTemplate();
    syncBomMaps();
    render();
    toast("已加入 BOM 列表「" + item.name + "」· " + tpl.rows.length + " 个子件 · 变量 " + ((tpl.variables || []).join("、") || "无"));
  }

  function deleteBom(id) {
    state.bomLibrary = (state.bomLibrary || []).filter(function (item) {
      return item.id !== id;
    });
    if (state.replacingBomId === id) state.replacingBomId = null;
    syncPrimaryTemplate();
    syncBomMaps();
    render();
    toast(state.bomLibrary.length ? "已删除该 BOM" : "已清空 BOM 列表");
  }

  function setLookupTable(aoa, name) {
    if (!B) {
      toast("未加载 BOM 组件");
      return;
    }
    const look = B.parseLookup(aoa, name);
    if (!look.rows.length) {
      toast("对照表没有数据行");
      return;
    }
    state.lookupTable = look;
    state.lookupKey = look.key || look.headers[0] || "";
    render();
    toast("已加载对照表 " + look.rows.length + " 行，键「" + state.lookupKey + "」");
  }

  function bomMatrix() {
    if (!B) return [];
    return B.toMatrix(state.bomRows || [], bomHeaderList());
  }

  function exportBomCsv() {
    if (!state.bomRows.length) {
      toast("请先计算 BOM");
      return;
    }
    const matrix = bomMatrix();
    const text = "\ufeff" + matrix.map(function (r) {
      return r.map(csvEscape).join(",");
    }).join("\n");
    downloadBlob(new Blob([text], { type: "text/csv;charset=utf-8" }), "schindler-bom.csv");
    toast("已导出 BOM CSV（" + (matrix.length - 1) + " 行）");
  }

  function exportBomXlsx() {
    if (!state.bomRows.length) {
      toast("请先计算 BOM");
      return;
    }
    if (!window.XLSX) {
      exportBomCsv();
      toast("未加载 Excel 组件，已改为 CSV");
      return;
    }
    const matrix = bomMatrix();
    const ws = XLSX.utils.aoa_to_sheet(matrix);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "BOM子件");
    XLSX.writeFile(wb, "schindler-bom.xlsx");
    toast("已导出 BOM Excel（" + (matrix.length - 1) + " 行）");
  }

  function finalExportMatrix() {
    if (!B || !state.exportMaps.length) return [];
    return B.exportMatrix(computeFinalExport(), state.exportMaps);
  }

  function exportFinalCsv() {
    if (!state.bomRows.length) {
      toast("请先计算 BOM");
      return;
    }
    if (!state.exportMaps.length) {
      toast("请先上传导出表头或按 BOM 表头生成");
      return;
    }
    const matrix = finalExportMatrix();
    const text = "\ufeff" + matrix.map(function (r) {
      return r.map(csvEscape).join(",");
    }).join("\n");
    downloadBlob(new Blob([text], { type: "text/csv;charset=utf-8" }), "schindler-bom-export.csv");
    toast("已导出 " + (matrix.length - 1) + " 行（BOM 计算结果）");
  }

  function exportFinalXlsx() {
    if (!state.bomRows.length) {
      toast("请先计算 BOM");
      return;
    }
    if (!state.exportMaps.length) {
      toast("请先上传导出表头或按 BOM 表头生成");
      return;
    }
    if (!window.XLSX) {
      exportFinalCsv();
      toast("未加载 Excel 组件，已改为 CSV");
      return;
    }
    const matrix = finalExportMatrix();
    const ws = XLSX.utils.aoa_to_sheet(matrix);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "BOM导出");
    XLSX.writeFile(wb, "schindler-bom-export.xlsx");
    toast("已导出 Excel（" + (matrix.length - 1) + " 行，BOM 计算结果）");
  }

  function bindDropzone(dropId, inputId, onFiles) {
    const drop = $(dropId);
    const input = $(inputId);
    if (!drop || !input) return;
    drop.addEventListener("click", function () {
      if (dropId === "bomDrop") state.replacingBomId = null;
      input.click();
    });
    input.addEventListener("change", function (ev) {
      onFiles(ev.target.files);
      input.value = "";
    });
    drop.addEventListener("dragover", function (ev) {
      ev.preventDefault();
    });
    drop.addEventListener("drop", function (ev) {
      ev.preventDefault();
      if (dropId === "bomDrop") state.replacingBomId = null;
      onFiles(ev.dataTransfer.files);
    });
  }

  function handleTableFiles(fileList, kind) {
    const files = Array.from(fileList || []);
    if (!files.length) {
      toast("请选择表格文件");
      return;
    }
    if (kind === "bom") {
      const list = state.replacingBomId ? files.slice(0, 1) : files;
      list.reduce(function (p, file) {
        return p.then(function () {
          return readTableFile(file).then(function (res) {
            addOrReplaceBom(res.aoa, res.name);
          });
        });
      }, Promise.resolve()).catch(function (err) {
        state.replacingBomId = null;
        toast("读取表格失败：" + (err.message || err));
      });
      return;
    }
    readTableFile(files[0])
      .then(function (res) {
        if (kind === "lookup") setLookupTable(res.aoa, res.name);
        else setExportTemplate(res.aoa, res.name);
      })
      .catch(function (err) {
        toast("读取表格失败：" + (err.message || err));
      });
  }

  function loadSampleCsv(url, fallback, name, kind) {
    fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.text();
      })
      .then(function (text) {
        const got = readTableText(text, name);
        if (kind === "bom") setBomTemplate(got.aoa, name);
        else if (kind === "lookup") setLookupTable(got.aoa, name);
        else setExportTemplate(got.aoa, name);
      })
      .catch(function () {
        if (kind === "bom") setBomTemplate(fallback, name);
        else if (kind === "lookup") setLookupTable(fallback, name);
        else setExportTemplate(fallback, name);
      });
  }

  function render() {
    renderFields();
    renderResultTable();
    renderOutputTable();
    renderDocs();
    renderWarnings();
    renderBom();
    savePrefs();
  }

  function syncColumnsFromFields() {
    state.columns = F.syncOutputColumns(state.columns, Array.from(state.selectedFields), state.extraKeywords);
  }

  function saveScheme() {
    const name = String($("schemeName").value || "").trim();
    if (!name) {
      toast("请输入方案名称");
      $("schemeName").focus();
      return;
    }
    const snap = F.captureScheme(
      name,
      Array.from(state.selectedFields),
      state.extraKeywords,
      state.columns,
      bomExtras()
    );
    const idx = state.schemes.findIndex(function (s) {
      return s.name === name;
    });
    if (idx >= 0) state.schemes[idx] = snap;
    else state.schemes.push(snap);
    renderSchemeSelect();
    $("schemeSelect").value = String(idx >= 0 ? idx : state.schemes.length - 1);
    savePrefs();
    toast(idx >= 0 ? "已更新方案「" + name + "」" : "已保存方案「" + name + "」");
  }

  function applyScheme() {
    const idx = Number($("schemeSelect").value);
    const scheme = state.schemes[idx];
    if (!scheme) {
      toast("请先选择方案");
      return;
    }
    const snap = F.cloneScheme(scheme);
    applyNormalized(
      F.normalizeKeywordsAndSelection(snap.extraKeywords, snap.selectedFields)
    );
    mergeDiscoveredKeywords(false);
    state.columns = (snap.columns || []).map(function (c) {
      return {
        id: c.id,
        sourceId: c.sourceId || "",
        header: c.header || "",
        formula: c.formula || "",
      };
    });
    state.columns = F.syncOutputColumns(state.columns, Array.from(state.selectedFields), state.extraKeywords);
    applyBomExtras(snap);
    $("schemeName").value = snap.name;
    closeColFormat();
    render();
    toast("已应用方案「" + snap.name + "」");
  }

  function deleteScheme() {
    const idx = Number($("schemeSelect").value);
    const scheme = state.schemes[idx];
    if (!scheme) {
      toast("请先选择要删除的方案");
      return;
    }
    state.schemes.splice(idx, 1);
    renderSchemeSelect();
    savePrefs();
    toast("已删除方案「" + scheme.name + "」");
  }

  function exportMatrix() {
    const data = F.computeOutput(selectedRowObjects(), state.columns, state.extraKeywords);
    const headers = state.columns.map(function (c) {
      return c.header;
    });
    const body = data.map(function (row) {
      return state.columns.map(function (c) {
        return row[c.id] || "";
      });
    });
    return [headers].concat(body);
  }

  function csvEscape(v) {
    const s = v == null ? "" : String(v);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function exportCsv() {
    const matrix = exportMatrix();
    const text = "\ufeff" + matrix.map(function (r) {
      return r.map(csvEscape).join(",");
    }).join("\n");
    downloadBlob(new Blob([text], { type: "text/csv;charset=utf-8" }), "schindler-po.csv");
    toast("已导出 CSV（" + (matrix.length - 1) + " 行）");
  }

  function exportXlsx() {
    if (!window.XLSX) {
      exportCsv();
      toast("未加载 Excel 组件，已改为 CSV");
      return;
    }
    const matrix = exportMatrix();
    const ws = XLSX.utils.aoa_to_sheet(matrix);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "订单行");
    XLSX.writeFile(wb, "schindler-po.xlsx");
    toast("已导出 Excel（" + (matrix.length - 1) + " 行）");
  }

  function downloadBlob(blob, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function pdfToWordsFromBuffer(buf) {
    if (!pdfjsLib) throw new Error("未加载 PDF 组件");
    const pdf = await pdfjsLib.getDocument({
      data: buf.slice ? buf.slice(0) : buf,
      cMapUrl: PDFJS_BASE + "cmaps/",
      cMapPacked: true,
      standardFontDataUrl: PDFJS_BASE + "standard_fonts/",
    }).promise;
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const words = content.items
        .filter(function (it) {
          return it.str && String(it.str).trim();
        })
        .map(function (it) {
          return {
            text: String(it.str).trim(),
            x: it.transform[4],
            y: viewport.height - it.transform[5],
            x1: it.transform[4] + (it.width || 0),
            y1: viewport.height - it.transform[5],
          };
        });
      pages.push({ words: words, width: viewport.width, height: viewport.height });
    }
    return pages;
  }

  async function parseFiles(fileList) {
    const files = Array.from(fileList).filter(function (f) {
      return /\.pdf$/i.test(f.name);
    });
    if (!files.length) {
      toast("请选择 PDF");
      return;
    }
    const docs = [];
    const buffers = {};
    for (let i = 0; i < files.length; i++) {
      const buf = await files[i].arrayBuffer();
      buffers[files[i].name] = buf;
      const pages = await pdfToWordsFromBuffer(buf);
      docs.push(window.SchindlerPoParser.parseDocument(files[i].name, pages));
    }
    setDocs(docs, "upload", buffers);
    render();
    notifyWarnings("已识别 " + docs.length + " 份，共 " + state.rows.length + " 行");
  }

  function addKeyword(raw) {
    const field = F.resolveKeyword(raw);
    if (!field) return;
    if (F.isBuiltinId(field.id)) {
      state.selectedFields.add(field.id);
      syncColumnsFromFields();
      render();
      const sample = recognizedSample(field);
      toast(sample ? "已勾选「" + field.label + "」： " + sample : "已勾选「" + field.label + "」，当前单据无值");
      return;
    }
    const existing = state.extraKeywords.find(function (k) {
      return k.label === field.label || k.id === field.id;
    });
    if (existing) {
      state.selectedFields.add(existing.id);
      syncColumnsFromFields();
      render();
      const sample = recognizedSample(existing);
      toast(sample ? "已勾选「" + existing.label + "」： " + sample : "已勾选「" + existing.label + "」");
      return;
    }
    state.extraKeywords.push({ id: field.id, label: field.label });
    state.selectedFields.add(field.id);
    syncColumnsFromFields();
    render();
    const sample = recognizedSample(field);
    toast(sample ? "已添加「" + field.label + "」： " + sample : "已添加关键字「" + field.label + "」");
  }

  function bind() {
    document.addEventListener("change", function (ev) {
      const t = ev.target;
      if (t.dataset && t.dataset.fieldId) {
        if (t.checked) state.selectedFields.add(t.dataset.fieldId);
        else state.selectedFields.delete(t.dataset.fieldId);
        syncColumnsFromFields();
        render();
        return;
      }
      if (t.dataset && t.dataset.rowId) {
        if (t.checked) state.selectedRows.add(t.dataset.rowId);
        else state.selectedRows.delete(t.dataset.rowId);
        updateRowCount();
        renderOutputTable();
        renderBom();
        savePrefs();
        return;
      }
      if (t.id === "rowFilterField") {
        state.rowFilterField = t.value;
        renderResultTable();
        return;
      }
      if (t.id === "lookupKey") {
        state.lookupKey = t.value;
        if (state.lookupTable) state.lookupTable.key = t.value;
        renderBom();
        savePrefs();
        return;
      }
      if (t.dataset && t.dataset.bomEnable) {
        const item = (state.bomLibrary || []).find(function (x) {
          return x.id === t.dataset.bomEnable;
        });
        if (!item) return;
        item.enabled = t.checked;
        syncPrimaryTemplate();
        syncBomMaps();
        computeBomRows();
        renderBom();
        savePrefs();
        return;
      }
      if (t.dataset && t.dataset.varName) {
        const m = state.varMaps.find(function (x) {
          return x.name === t.dataset.varName;
        });
        if (!m) return;
        const prop = t.dataset.varProp;
        m[prop] = t.value;
        if (prop === "mode") {
          m.value = "";
          renderVarMapTable();
        }
        computeBomRows();
        renderBomTable();
        renderExport();
        savePrefs();
        return;
      }
      if (t.dataset && t.dataset.exHeader) {
        const m = state.exportMaps.find(function (x) {
          return x.header === t.dataset.exHeader;
        });
        if (!m) return;
        const prop = t.dataset.exProp;
        m[prop] = t.value;
        if (prop === "mode") {
          m.value = "";
          renderExportMapTable();
        }
        renderFinalExportTable();
        savePrefs();
        return;
      }
      if (t.id === "skipEnabled" || t.id === "skipEmpty" || t.id === "skipZero" || t.id === "skipColumn") {
        state.skipRule = state.skipRule || { enabled: false, column: "计算数量", empty: true, zero: true };
        if (t.id === "skipEnabled") state.skipRule.enabled = t.checked;
        if (t.id === "skipEmpty") state.skipRule.empty = t.checked;
        if (t.id === "skipZero") state.skipRule.zero = t.checked;
        if (t.id === "skipColumn") state.skipRule.column = t.value;
        renderFinalExportTable();
        savePrefs();
      }
    });
    document.addEventListener("input", function (ev) {
      const t = ev.target;
      if (t.id === "rowFilter") {
        state.rowFilter = t.value;
        renderResultTable();
        return;
      }
      if (t.dataset && t.dataset.varName && t.dataset.varProp === "value") {
        const m = state.varMaps.find(function (x) {
          return x.name === t.dataset.varName;
        });
        if (!m) return;
        m.value = t.value;
        computeBomRows();
        renderBomTable();
        renderExport();
        savePrefs();
        return;
      }
      if (t.dataset && t.dataset.exHeader && t.dataset.exProp === "value") {
        const m = state.exportMaps.find(function (x) {
          return x.header === t.dataset.exHeader;
        });
        if (!m) return;
        m.value = t.value;
        renderFinalExportTable();
        savePrefs();
        return;
      }
      const col = editingColumn();
      if (!col) return;
      if (t.id === "colFormatHeader") {
        col.header = t.value;
        $("colFormatWhich").textContent = col.header || "未命名列";
        renderOutputTable();
        savePrefs();
      }
      if (t.id === "colFormatFormula") {
        col.formula = t.value;
        renderOutputTable();
        savePrefs();
      }
    });
    document.addEventListener("click", function (ev) {
      const t = ev.target;
      const toggle = t.closest && t.closest(".panel-toggle");
      if (toggle) {
        const panel = toggle.closest("section.panel");
        if (panel && panel.getAttribute("data-panel")) {
          togglePanel(panel.getAttribute("data-panel"));
        }
        return;
      }
      if (t.dataset && t.dataset.bomReplace) {
        state.replacingBomId = t.dataset.bomReplace;
        const input = $("bomFile");
        if (input) input.click();
        return;
      }
      if (t.dataset && t.dataset.bomDelete) {
        deleteBom(t.dataset.bomDelete);
        return;
      }
      if (t.dataset && t.dataset.removeKw != null) {
        const i = Number(t.dataset.removeKw);
        const kw = state.extraKeywords[i];
        if (kw) {
          state.selectedFields.delete(kw.id);
          state.extraKeywords.splice(i, 1);
          syncColumnsFromFields();
          render();
        }
        return;
      }
      const head = t.closest && t.closest("th.col-head");
      if (head && head.dataset.colId && $("outputTable").contains(head)) {
        if (t.closest && t.closest(".col-drag")) return;
        if (state.suppressHeadClick) {
          state.suppressHeadClick = false;
          return;
        }
        openColFormat(head.dataset.colId);
      }
    });
    function beginColDrag(ev, grip) {
      const th = grip.closest("th.col-head");
      if (!th || !th.dataset.colId) return;
      state.dragColId = th.dataset.colId;
      state.dropBeforeId = undefined;
      state.dragActive = false;
      state.dragStartX = ev.clientX;
    }
    function moveColDrag(ev) {
      if (!state.dragColId) return;
      if (!state.dragActive && Math.abs(ev.clientX - state.dragStartX) > 6) {
        state.dragActive = true;
        state.suppressHeadClick = true;
      }
      if (!state.dragActive) return;
      ev.preventDefault();
      const dragged = $("outputTable").querySelector('th.col-head[data-col-id="' + state.dragColId + '"]');
      if (dragged) {
        dragged.classList.add("dragging");
        dragged.style.pointerEvents = "none";
      }
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const th = el && el.closest ? el.closest("th.col-head") : null;
      $("outputTable").querySelectorAll("th.col-head").forEach(function (node) {
        node.classList.remove("drop-before", "drop-after");
      });
      if (!th || !$("outputTable").contains(th)) return;
      const beforeId = dropTargetBeforeId(th, ev.clientX);
      state.dropBeforeId = beforeId;
      if (!beforeId) {
        const last = $("outputTable").querySelector("thead tr th.col-head:last-child");
        if (last) last.classList.add("drop-after");
      } else if (beforeId !== state.dragColId) {
        const target = $("outputTable").querySelector('th.col-head[data-col-id="' + beforeId + '"]');
        if (target) target.classList.add("drop-before");
      }
    }
    function finishColDrag(ev) {
      const draggedId = state.dragColId;
      const wasActive = state.dragActive;
      let th = null;
      if (wasActive && ev) {
        const el = document.elementFromPoint(ev.clientX, ev.clientY);
        th = el && el.closest ? el.closest("th.col-head") : null;
      }
      const beforeId = th && $("outputTable").contains(th) ? dropTargetBeforeId(th, ev.clientX) : undefined;
      const canDrop = Boolean(th && $("outputTable").contains(th));
      state.dragColId = null;
      state.dragActive = false;
      state.dropBeforeId = undefined;
      clearDropMarks();
      if (!wasActive || !draggedId) return;
      state.suppressHeadClick = true;
      if (!canDrop) return;
      applyColumnOrder(F.reorderColumns(state.columns, draggedId, beforeId));
    }
    document.addEventListener("pointerdown", function (ev) {
      const grip = ev.target.closest && ev.target.closest(".col-drag");
      if (!grip || !$("outputTable").contains(grip)) return;
      beginColDrag(ev, grip);
      try {
        grip.setPointerCapture(ev.pointerId);
      } catch (err) {}
    });
    document.addEventListener("pointermove", moveColDrag);
    document.addEventListener("pointerup", finishColDrag);
    document.addEventListener("pointercancel", function () {
      state.dragColId = null;
      state.dragActive = false;
      state.dropBeforeId = undefined;
      clearDropMarks();
    });
    document.addEventListener("mousedown", function (ev) {
      if (ev.button !== 0) return;
      const grip = ev.target.closest && ev.target.closest(".col-drag");
      if (!grip || !$("outputTable").contains(grip)) return;
      beginColDrag(ev, grip);
    });
    document.addEventListener("mousemove", moveColDrag);
    document.addEventListener("mouseup", finishColDrag);
    $("btnSelAll").addEventListener("click", function () {
      state.selectedRows = new Set(state.rows.map(function (r) { return r.id; }));
      render();
    });
    $("btnSelNone").addEventListener("click", function () {
      state.selectedRows = new Set();
      render();
    });
    $("btnSelVisible").addEventListener("click", function () {
      visibleRows().forEach(function (r) {
        state.selectedRows.add(r.id);
      });
      render();
    });
    $("btnUnselVisible").addEventListener("click", function () {
      visibleRows().forEach(function (r) {
        state.selectedRows.delete(r.id);
      });
      render();
    });
    $("btnAddCol").addEventListener("click", function () {
      const col = {
        id: "col-extra-" + Date.now(),
        sourceId: "",
        header: "新列",
        formula: "=",
      };
      state.columns.push(col);
      openColFormat(col.id);
      savePrefs();
    });
    $("btnResetCols").addEventListener("click", function () {
      state.columns = F.syncOutputColumns([], Array.from(state.selectedFields), state.extraKeywords);
      closeColFormat();
      render();
    });
    $("btnColFormatDone").addEventListener("click", function () {
      closeColFormat();
      savePrefs();
    });
    $("btnColMoveLeft").addEventListener("click", function () {
      moveEditingColumn(-1);
    });
    $("btnColMoveRight").addEventListener("click", function () {
      moveEditingColumn(1);
    });
    $("btnColFormatDel").addEventListener("click", function () {
      const id = state.editingColId;
      if (!id) return;
      state.columns = state.columns.filter(function (c) {
        return c.id !== id;
      });
      closeColFormat();
      render();
    });
    $("btnAddKeyword").addEventListener("click", function () {
      addKeyword($("keywordInput").value);
      $("keywordInput").value = "";
    });
    $("keywordInput").addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") {
        ev.preventDefault();
        addKeyword($("keywordInput").value);
        $("keywordInput").value = "";
      }
    });
    $("btnSaveScheme").addEventListener("click", saveScheme);
    $("btnApplyScheme").addEventListener("click", applyScheme);
    $("btnDeleteScheme").addEventListener("click", deleteScheme);
    $("schemeName").addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") {
        ev.preventDefault();
        saveScheme();
      }
    });
    $("btnXlsx").addEventListener("click", exportXlsx);
    $("btnCsv").addEventListener("click", exportCsv);
    $("btnComputeBom").addEventListener("click", function () {
      const enabled = (state.bomLibrary || []).filter(function (item) { return item.enabled !== false; });
      if (!enabled.length) {
        toast("请先导入 BOM 模板");
        return;
      }
      computeBomRows();
      renderBomTable();
      renderExport();
      toast(state.bomRows.length ? "已按勾选行计算 BOM（" + enabled.length + " 份模板）" : "勾选行后没有算出子件");
    });
    $("btnBomXlsx").addEventListener("click", exportBomXlsx);
    $("btnBomCsv").addEventListener("click", exportBomCsv);
    $("btnClearBom").addEventListener("click", function () {
      state.bomLibrary = [];
      state.bomTemplate = null;
      state.replacingBomId = null;
      state.varMaps = [];
      state.bomRows = [];
      render();
      toast("已清空 BOM 列表");
    });
    $("btnClearLookup").addEventListener("click", function () {
      state.lookupTable = null;
      state.lookupKey = "";
      render();
      toast("已清除料号对照表");
    });
    $("btnBomSample").addEventListener("click", function () {
      loadSampleCsv("samples/bom-template.csv", SAMPLE_BOM_AOA, "bom-template.csv", "bom");
    });
    $("btnLookupSample").addEventListener("click", function () {
      loadSampleCsv("samples/material-lookup.csv", SAMPLE_LOOKUP_AOA, "material-lookup.csv", "lookup");
    });
    bindDropzone("bomDrop", "bomFile", function (files) {
      handleTableFiles(files, "bom");
    });
    bindDropzone("lookupDrop", "lookupFile", function (files) {
      handleTableFiles(files, "lookup");
    });
    bindDropzone("exportDrop", "exportFile", function (files) {
      handleTableFiles(files, "export");
    });
    $("btnExportSample").addEventListener("click", function () {
      loadSampleCsv("samples/export-template.csv", SAMPLE_EXPORT_AOA, "export-template.csv", "export");
    });
    $("btnExportFromBom").addEventListener("click", setExportFromBomHeaders);
    $("btnClearExportTpl").addEventListener("click", function () {
      state.exportTemplate = null;
      state.exportMaps = [];
      render();
      toast("已清除导出模板");
    });
    $("btnFinalXlsx").addEventListener("click", exportFinalXlsx);
    $("btnFinalCsv").addEventListener("click", exportFinalCsv);
    $("btnDemo").addEventListener("click", function () {
      if (!window.DEMO_DATA) {
        toast("没有样张数据");
        return;
      }
      setDocs(window.DEMO_DATA.documents, "demo");
      render();
    });
    $("btnTwoLines").addEventListener("click", function () {
      if (!window.DEMO_TWO_LINES) {
        toast("没有双行样张");
        return;
      }
      setDocs(window.DEMO_TWO_LINES.documents, "two-lines");
      render();
      toast("已识别 1 份 PO，共 " + state.rows.length + " 行；新字段已加入关键字");
    });
    $("btnReview").addEventListener("click", function () {
      if (!window.SchindlerPoParser || !window.DEMO_REVIEW_PAGES) {
        toast("没有需核对样张");
        return;
      }
      const docs = [
        window.SchindlerPoParser.parseDocument("PO_review_cases.pdf", window.DEMO_REVIEW_PAGES),
      ];
      setDocs(docs, "review");
      render();
      notifyWarnings("已加载需核对样张，共 " + state.rows.length + " 行");
    });
    $("btnToggleDocs").addEventListener("click", function () {
      const panel = $("docsPanel");
      if (panel) panel.hidden = false;
      togglePanel("docs");
    });
    $("btnFoldAll").addEventListener("click", function () {
      setAllPanelsCollapsed(true);
    });
    $("btnExpandAll").addEventListener("click", function () {
      setAllPanelsCollapsed(false);
    });
    const drop = $("dropzone");
    drop.addEventListener("click", function () {
      $("fileInput").click();
    });
    $("fileInput").addEventListener("change", function (ev) {
      parseFiles(ev.target.files).catch(function (err) {
        toast("识别失败：" + (err.message || err));
      });
    });
    drop.addEventListener("dragover", function (ev) {
      ev.preventDefault();
    });
    drop.addEventListener("drop", function (ev) {
      ev.preventDefault();
      parseFiles(ev.dataTransfer.files).catch(function (err) {
        toast("识别失败：" + (err.message || err));
      });
    });
  }

  loadPrefs();
  bind();
  applyPanelCollapsed();
  if (window.DEMO_DATA) {
    setDocs(window.DEMO_DATA.documents, "demo");
    render();
  }
})();
