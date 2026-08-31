(function () {
  const F = window.PoFields;
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
    dropBeforeId: undefined,
    suppressHeadClick: false,
  };

  const $ = function (id) {
    return document.getElementById(id);
  };

  function toast(msg) {
    const el = $("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(function () {
      el.classList.remove("show");
    }, 2400);
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
  }

  function savePrefs() {
    localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({
        selectedFields: Array.from(state.selectedFields),
        extraKeywords: state.extraKeywords,
        columns: state.columns,
      })
    );
    localStorage.setItem(SCHEMES_KEY, JSON.stringify(state.schemes));
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

  function setDocs(docs, source) {
    const sourceChanged = Boolean(state.source) && state.source !== source;
    state.docs = docs || [];
    state.rows = F.flattenDocs(state.docs);
    state.source = source;
    state.selectedRows = new Set(
      state.rows.map(function (r) {
        return r.id;
      })
    );
    mergeDiscoveredKeywords(true);
    const keep = sourceChanged ? [] : state.columns;
    state.columns = F.syncOutputColumns(keep, Array.from(state.selectedFields), state.extraKeywords);
  }

  function selectedRowObjects() {
    return state.rows.filter(function (r) {
      return state.selectedRows.has(r.id);
    });
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
    const cols = resultColumns();
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
    state.rows.forEach(function (row) {
      const tr = document.createElement("tr");
      const td0 = document.createElement("td");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = state.selectedRows.has(row.id);
      cb.dataset.rowId = row.id;
      td0.appendChild(cb);
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
      tbody.appendChild(tr);
    });
    table.appendChild(thead);
    table.appendChild(tbody);
    $("resultTable").innerHTML = "";
    $("resultTable").appendChild(table);
    $("rowCount").textContent =
      "已选 " + state.selectedRows.size + " / " + state.rows.length + " 行 · " + state.docs.length + " 张 PO";
    $("sourceHint").textContent =
      state.source === "demo"
        ? "当前：三份样张预识别结果"
        : state.source === "two-lines"
          ? "当前：双行项目 + 新字段（颜色 / 表面处理）样张"
          : state.source === "upload"
            ? "当前：本地上传识别"
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
      grip.draggable = true;
      grip.title = "拖动调整列顺序";
      grip.textContent = "⋮⋮";
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

  function renderDocs() {
    const root = $("docs");
    if (!root) return;
    root.innerHTML = "";
    state.docs.forEach(function (doc) {
      const el = document.createElement("article");
      el.className = "doc";
      const item = (doc.items && doc.items[0]) || {};
      const file = doc.file || "";
      const preview = "assets/previews/" + file.replace(/\.pdf$/i, ".png");
      el.innerHTML =
        '<div class="doc-head"><div><h3>' +
        (doc.header.docType || "采购订单") +
        ' <span class="po">' +
        (doc.header.poNumber || "") +
        "</span></h3><div class='meta' style='color:#57534e;font-size:13px'>" +
        file +
        " · " +
        (doc.items || []).length +
        " 条行项目</div></div>" +
        '<span class="pill">金额 ' +
        (item.amount || "") +
        " / 抬头 " +
        (doc.header.vatTotal || "") +
        "</span></div>" +
        '<div class="doc-body"><img alt="" src="' +
        preview +
        '"><div><dl class="kv"></dl></div></div>';
      const dl = el.querySelector(".kv");
      [
        ["供应商", doc.header.supplierName],
        ["交货地址", doc.header.deliveryAddress],
        ["付款条件", doc.header.paymentTerms],
        ["交货日期", doc.header.deliveryDate],
        ["公司代码", doc.header.companyCode],
        ["工厂", doc.header.plant],
      ].forEach(function (pair) {
        const dt = document.createElement("dt");
        dt.textContent = pair[0];
        const dd = document.createElement("dd");
        dd.textContent = pair[1] || "—";
        dl.appendChild(dt);
        dl.appendChild(dd);
      });
      root.appendChild(el);
    });
  }

  function render() {
    renderFields();
    renderResultTable();
    renderOutputTable();
    renderDocs();
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
      state.columns
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

  async function pdfToWords(file) {
    if (!pdfjsLib) throw new Error("未加载 PDF 组件");
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({
      data: buf,
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
    for (let i = 0; i < files.length; i++) {
      const pages = await pdfToWords(files[i]);
      docs.push(window.SchindlerPoParser.parseDocument(files[i].name, pages));
    }
    setDocs(docs, "upload");
    render();
    toast("已识别 " + docs.length + " 份，共 " + state.rows.length + " 行");
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
        $("rowCount").textContent =
          "已选 " + state.selectedRows.size + " / " + state.rows.length + " 行 · " + state.docs.length + " 张 PO";
        renderOutputTable();
        savePrefs();
      }
    });
    document.addEventListener("input", function (ev) {
      const t = ev.target;
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
    document.addEventListener("dragstart", function (ev) {
      const grip = ev.target.closest && ev.target.closest(".col-drag");
      if (!grip || !$("outputTable").contains(grip)) return;
      const th = grip.closest("th.col-head");
      if (!th || !th.dataset.colId) return;
      state.dragColId = th.dataset.colId;
      state.dropBeforeId = undefined;
      th.classList.add("dragging");
      ev.dataTransfer.effectAllowed = "move";
      ev.dataTransfer.setData("text/plain", th.dataset.colId);
    });
    document.addEventListener("dragover", function (ev) {
      if (!state.dragColId) return;
      const th = ev.target.closest && ev.target.closest("th.col-head");
      if (!th || !$("outputTable").contains(th)) return;
      ev.preventDefault();
      ev.dataTransfer.dropEffect = "move";
      const beforeId = dropTargetBeforeId(th, ev.clientX);
      state.dropBeforeId = beforeId;
      clearDropMarks();
      const dragged = $("outputTable").querySelector('th.col-head[data-col-id="' + state.dragColId + '"]');
      if (dragged) dragged.classList.add("dragging");
      if (!beforeId) {
        const last = $("outputTable").querySelector("thead tr th.col-head:last-child");
        if (last) last.classList.add("drop-after");
      } else if (beforeId !== state.dragColId) {
        const target = $("outputTable").querySelector('th.col-head[data-col-id="' + beforeId + '"]');
        if (target) target.classList.add("drop-before");
      }
    });
    document.addEventListener("drop", function (ev) {
      if (!state.dragColId) return;
      const th = ev.target.closest && ev.target.closest("th.col-head");
      if (!th || !$("outputTable").contains(th)) return;
      ev.preventDefault();
      const beforeId = dropTargetBeforeId(th, ev.clientX);
      const draggedId = state.dragColId;
      state.dragColId = null;
      state.dropBeforeId = undefined;
      clearDropMarks();
      state.suppressHeadClick = true;
      applyColumnOrder(F.reorderColumns(state.columns, draggedId, beforeId));
    });
    document.addEventListener("dragend", function () {
      if (state.dragColId) state.suppressHeadClick = true;
      state.dragColId = null;
      state.dropBeforeId = undefined;
      clearDropMarks();
    });
    $("btnSelAll").addEventListener("click", function () {
      state.selectedRows = new Set(state.rows.map(function (r) { return r.id; }));
      render();
    });
    $("btnSelNone").addEventListener("click", function () {
      state.selectedRows = new Set();
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
    $("btnToggleDocs").addEventListener("click", function () {
      $("docsPanel").hidden = !$("docsPanel").hidden;
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
  if (window.DEMO_DATA) {
    setDocs(window.DEMO_DATA.documents, "demo");
    render();
  }
})();
