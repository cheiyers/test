(function () {
  const F = window.PoFields;
  const PDFJS_BASE = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/";
  const pdfjsLib = window["pdfjs-dist/build/pdf"] || window.pdfjsLib;
  if (pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_BASE + "build/pdf.worker.min.js";
  }

  const state = {
    docs: [],
    rows: [],
    selectedFields: new Set(F.defaultSelectedIds()),
    extraKeywords: [],
    selectedRows: new Set(),
    columns: [],
    source: "",
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

  function loadPrefs() {
    try {
      const raw = localStorage.getItem("schindler-po-export-v1");
      if (!raw) return;
      const p = JSON.parse(raw);
      if (Array.isArray(p.selectedFields)) state.selectedFields = new Set(p.selectedFields);
      if (Array.isArray(p.extraKeywords)) state.extraKeywords = p.extraKeywords;
      if (Array.isArray(p.columns)) state.columns = p.columns;
    } catch (e) {}
  }

  function savePrefs() {
    localStorage.setItem(
      "schindler-po-export-v1",
      JSON.stringify({
        selectedFields: Array.from(state.selectedFields),
        extraKeywords: state.extraKeywords,
        columns: state.columns,
      })
    );
  }

  function setDocs(docs, source) {
    state.docs = docs || [];
    state.rows = F.flattenDocs(state.docs);
    state.source = source;
    state.selectedRows = new Set(
      state.rows.map(function (r) {
        return r.id;
      })
    );
    if (!state.columns.length) {
      state.columns = F.syncOutputColumns([], Array.from(state.selectedFields), state.extraKeywords);
    } else {
      state.columns = F.syncOutputColumns(state.columns, Array.from(state.selectedFields), state.extraKeywords);
    }
  }

  function selectedRowObjects() {
    return state.rows.filter(function (r) {
      return state.selectedRows.has(r.id);
    });
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
          return r[field.id] || (r.extras && r.extras[field.label]);
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
      span.textContent = k.label + "（自定义）";
      label.appendChild(span);
      $("keywordFields").appendChild(label);
    });
    renderCustomChips();
  }

  function resultColumns() {
    return F.CORE_FIELDS.concat(F.OPTIONAL_FIELDS, F.KEYWORD_FIELDS).concat(
      state.extraKeywords.map(function (k) {
        return { id: k.id, label: k.label };
      })
    );
  }

  function cellText(row, field) {
    if (row[field.id] != null && row[field.id] !== "") return String(row[field.id]);
    if (row.extras && row.extras[field.label]) return String(row.extras[field.label]);
    return "";
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
        const v = cellText(row, c);
        if (!v) {
          td.className = "empty";
          td.textContent = "—";
        } else {
          if (["qty", "unitPrice", "amount", "poNumber", "lineNo", "materialNo"].indexOf(c.id) >= 0) {
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
    $("sourceHint").textContent = state.source === "demo" ? "当前：三份样张预识别结果" : state.source === "upload" ? "当前：本地上传识别" : "";
  }

  function renderColEditor() {
    const box = $("colEditor");
    box.innerHTML = "";
    state.columns.forEach(function (col, i) {
      const row = document.createElement("div");
      row.className = "col-row";
      const header = document.createElement("input");
      header.type = "text";
      header.value = col.header;
      header.placeholder = "表头";
      header.dataset.colHeader = String(i);
      const formula = document.createElement("input");
      formula.type = "text";
      formula.value = col.formula;
      formula.placeholder = "{物料号} 或 ={数量}*2";
      formula.dataset.colFormula = String(i);
      const del = document.createElement("button");
      del.type = "button";
      del.className = "ghost";
      del.textContent = "删除";
      del.dataset.colDel = String(i);
      row.appendChild(header);
      row.appendChild(formula);
      row.appendChild(del);
      box.appendChild(row);
    });
  }

  function renderOutputTable() {
    const rows = F.computeOutput(selectedRowObjects(), state.columns, state.extraKeywords);
    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const hr = document.createElement("tr");
    state.columns.forEach(function (col) {
      const th = document.createElement("th");
      th.textContent = col.header || "";
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
    renderColEditor();
    renderOutputTable();
    renderDocs();
    savePrefs();
  }

  function syncColumnsFromFields() {
    state.columns = F.syncOutputColumns(state.columns, Array.from(state.selectedFields), state.extraKeywords);
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
    downloadBlob(new Blob([text], { type: "text/csv;charset=utf-8" }), "schindler-po.xlsx".replace(".xlsx", ".csv"));
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
    const label = String(raw || "").trim();
    if (!label) return;
    const builtin = F.ALL_BUILTIN.find(function (f) {
      return f.label === label || f.id === label;
    });
    if (builtin) {
      state.selectedFields.add(builtin.id);
      syncColumnsFromFields();
      render();
      return;
    }
    if (state.extraKeywords.some(function (k) { return k.label === label; })) return;
    const id = "kw-" + label;
    state.extraKeywords.push({ id: id, label: label });
    state.selectedFields.add(id);
    syncColumnsFromFields();
    render();
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
      if (t.dataset && t.dataset.colHeader != null) {
        const i = Number(t.dataset.colHeader);
        if (state.columns[i]) state.columns[i].header = t.value;
        renderOutputTable();
        savePrefs();
      }
      if (t.dataset && t.dataset.colFormula != null) {
        const i = Number(t.dataset.colFormula);
        if (state.columns[i]) state.columns[i].formula = t.value;
        renderOutputTable();
        savePrefs();
      }
    });
    document.addEventListener("click", function (ev) {
      const t = ev.target;
      if (t.dataset && t.dataset.colDel != null) {
        state.columns.splice(Number(t.dataset.colDel), 1);
        render();
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
      }
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
      state.columns.push({
        id: "col-extra-" + Date.now(),
        sourceId: "",
        header: "新列",
        formula: "=",
      });
      render();
    });
    $("btnResetCols").addEventListener("click", function () {
      state.columns = F.syncOutputColumns([], Array.from(state.selectedFields), state.extraKeywords);
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
