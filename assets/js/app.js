(function () {
  const PDFJS_BASE = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/";
  const pdfjsLib = window["pdfjs-dist/build/pdf"] || window.pdfjsLib;
  if (pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_BASE + "build/pdf.worker.min.js";
  }

  const PARENT_FIELDS = [
    { id: "po", label: "PO" },
    { id: "vendor", label: "\u4f9b\u5e94\u5546" },
    { id: "date", label: "\u8ba2\u5355\u65e5\u671f" },
    { id: "pos", label: "Pos" },
    { id: "material", label: "\u7269\u6599" },
    { id: "description", label: "\u63cf\u8ff0" },
    { id: "arrDate", label: "\u5230\u8d27\u65e5" },
    { id: "qty", label: "\u6570\u91cf" },
    { id: "price", label: "\u5355\u4ef7" },
    { id: "amount", label: "\u91d1\u989d" },
    { id: "salesOrderRef", label: "\u9500\u552e\u8ba2\u5355" },
    { id: "projectRef", label: "\u9879\u76ee\u53f7" },
    { id: "shippingInstruction", label: "\u53d1\u8d27\u8bf4\u660e" },
    { id: "rev", label: "REV" },
    { id: "page", label: "\u9875\u7801" },
    { id: "category", label: "\u7c7b\u522b" },
  ];
  const BOM_FIELDS = [
    { id: "bomPos", label: "\u5b50\u4ef6Pos" },
    { id: "bomMaterial", label: "\u5b50\u4ef6\u7269\u6599" },
    { id: "bomQty", label: "\u5b50\u4ef6\u6570\u91cf" },
    { id: "bomDescription", label: "\u5b50\u4ef6\u63cf\u8ff0" },
    { id: "remarkA", label: "\u5907\u6ce8 A" },
    { id: "remarkB", label: "\u5907\u6ce8 B" },
    { id: "remarkC", label: "\u5907\u6ce8 C" },
    { id: "remarkD", label: "\u5907\u6ce8 D" },
  ];
  const DEFAULT_PARENT = [
    "po",
    "pos",
    "material",
    "description",
    "arrDate",
    "qty",
    "price",
    "amount",
    "salesOrderRef",
    "projectRef",
    "shippingInstruction",
  ];
  const DEFAULT_BOM = BOM_FIELDS.map((f) => f.id);
  const DEFAULT_KEYWORDS = [
    "\u8f7f\u5185\u51c0\u9ad8",
    "\u8f7f\u53a2\u5bbd\u5ea6",
    "\u8f7f\u53a2\u6df1\u5ea6",
    "\u989d\u5b9a\u8f7d\u91cd",
    "Wire Length",
    "\u540a\u9876\u6750\u6599",
  ];

  const state = {
    docs: [],
    extractKeywords: DEFAULT_KEYWORDS.slice(),
    filterKeyword: "",
    expanded: new Set(),
    source: "demo",
    selectedCategories: new Set(),
    knownCategories: new Set(),
    selectedParentFields: new Set(DEFAULT_PARENT),
    selectedBomFields: new Set(DEFAULT_BOM),
    viewMode: "nested",
  };

  const $ = (sel) => document.querySelector(sel);

  function loadPrefs() {
    try {
      const raw = localStorage.getItem("kone-po-select-v1");
      if (!raw) return;
      const p = JSON.parse(raw);
      if (Array.isArray(p.parentFields)) state.selectedParentFields = new Set(p.parentFields);
      if (Array.isArray(p.bomFields)) state.selectedBomFields = new Set(p.bomFields);
      if (Array.isArray(p.keywords)) state.extractKeywords = p.keywords;
      if (p.viewMode) state.viewMode = p.viewMode;
    } catch (e) {}
  }

  function savePrefs() {
    localStorage.setItem(
      "kone-po-select-v1",
      JSON.stringify({
        parentFields: [...state.selectedParentFields],
        bomFields: [...state.selectedBomFields],
        keywords: state.extractKeywords,
        viewMode: state.viewMode,
      })
    );
  }

  function fmtMoney(v) {
    const n = Number(String(v ?? "").replace(/,/g, ""));
    if (Number.isNaN(n)) return v || "";
    return n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 2800);
  }

  function setDocs(docs, source) {
    state.docs = KonePoParser.normalizeDocs(docs || []);
    state.source = source;
    state.expanded = new Set();
    const { list } = KonePoParser.collectCategories(state.docs);
    const ids = list.map((c) => c.id);
    if (!state.knownCategories.size) {
      state.selectedCategories = new Set(ids);
    } else {
      ids.forEach((id) => {
        if (!state.knownCategories.has(id)) state.selectedCategories.add(id);
      });
    }
    state.knownCategories = new Set(ids);
  }

  async function loadDemo() {
    const res = await fetch("data/demo.json");
    if (!res.ok) throw new Error("demo.json missing");
    setDocs(await res.json(), "demo");
    render();
  }

  async function pdfToWords(file) {
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
        .filter((it) => it.str && String(it.str).trim())
        .map((it) => ({
          text: String(it.str).trim(),
          x: it.transform[4],
          y: viewport.height - it.transform[5],
          w: it.width || 0,
          h: it.height || 0,
        }));
      pages.push({ words, width: viewport.width, height: viewport.height });
      setProgress(i / pdf.numPages, file.name + "  " + i + "/" + pdf.numPages);
    }
    return pages;
  }

  async function parseFiles(fileList) {
    const files = [...fileList].filter((f) => /\.pdf$/i.test(f.name));
    if (!files.length) {
      toast("\u8bf7\u9009\u62e9 PDF \u6587\u4ef6");
      return;
    }
    $("#progressWrap").hidden = false;
    const docs = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProgress(0, "\u8bc6\u522b " + file.name);
        const pages = await pdfToWords(file);
        docs.push(KonePoParser.parseDocument(file.name, pages));
      }
      setDocs(docs, "upload");
      render();
      const n = docs.reduce((s, d) => s + d.itemCount, 0);
      toast("\u5df2\u8bc6\u522b " + files.length + " \u4efd PO\uff0c\u5171 " + n + " \u884c");
    } catch (err) {
      console.error(err);
      toast("\u8bc6\u522b\u5931\u8d25\uff1a" + (err.message || err));
    } finally {
      $("#progressWrap").hidden = true;
    }
  }

  function setProgress(ratio, label) {
    $("#progressBar").style.width = Math.round(ratio * 100) + "%";
    $("#progressLabel").textContent = label || "";
  }

  function parentValue(doc, item, fieldId) {
    const h = doc.header || {};
    switch (fieldId) {
      case "po":
        return h.poNumber || "";
      case "vendor":
        return h.vendorName || "";
      case "date":
        return h.date || "";
      case "pos":
        return item.pos || "";
      case "material":
        return item.material || "";
      case "description":
        return item.description || "";
      case "arrDate":
        return item.arrDate || "";
      case "qty":
        return item.qty != null ? item.qty + " " + (item.unit || "") : "";
      case "price":
        return item.price || "";
      case "amount":
        return item.amount || "";
      case "salesOrderRef":
        return item.salesOrderRef || "";
      case "projectRef":
        return item.projectRef || "";
      case "shippingInstruction":
        return item.shippingInstruction || "";
      case "rev":
        return item.rev || "";
      case "page":
        return item.page || "";
      case "category":
        return (item.family && item.family.name) || "";
      default:
        return "";
    }
  }

  function bomValue(bom, fieldId) {
    const rf = (bom && bom.remarkFields) || {};
    switch (fieldId) {
      case "bomPos":
        return bom.pos || "";
      case "bomMaterial":
        return bom.material || "";
      case "bomQty":
        return ((bom.qty || "") + " " + (bom.unit || "")).trim();
      case "bomDescription":
        return bom.description || "";
      case "remarkA":
        return rf.A || "";
      case "remarkB":
        return rf.B || "";
      case "remarkC":
        return rf.C || "";
      case "remarkD":
        return rf.D || "";
      default:
        return "";
    }
  }

  function visibleParents() {
    const filter = state.filterKeyword.trim().toLowerCase();
    const rows = [];
    state.docs.forEach((doc, di) => {
      (doc.items || []).forEach((item, ii) => {
        const cid = item.categoryId || KonePoParser.categoryId(item);
        if (!state.selectedCategories.has(cid)) return;
        if (filter) {
          const blob = KonePoParser.itemSearchBlob(item, doc.header);
          const bomBlob = (item.bom || [])
            .map((b) => [b.material, b.description, JSON.stringify(b.remarkFields || {})].join(" "))
            .join(" ");
          if (!(blob + " " + bomBlob).toLowerCase().includes(filter)) return;
        }
        rows.push({ doc, item, di, ii, key: di + ":" + ii });
      });
    });
    return rows;
  }

  function displayRows() {
    const parents = visibleParents();
    if (state.viewMode !== "flat") {
      return parents.map((p) => Object.assign({ kind: "parent" }, p));
    }
    const out = [];
    parents.forEach((p) => {
      const bom = p.item.bom || [];
      if (!bom.length) {
        out.push(Object.assign({ kind: "parent" }, p));
        return;
      }
      bom.forEach((b, bi) => {
        out.push(Object.assign({ kind: "bom", bom: b, bi, key: p.key + ":b" + bi }, p));
      });
    });
    return out;
  }

  function selectedParentFieldDefs() {
    return PARENT_FIELDS.filter((f) => state.selectedParentFields.has(f.id));
  }

  function selectedBomFieldDefs() {
    return BOM_FIELDS.filter((f) => state.selectedBomFields.has(f.id));
  }

  function renderCategories() {
    const { families } = KonePoParser.collectCategories(state.docs);
    const box = $("#categoryList");
    if (!families.length) {
      box.innerHTML = '<p class="muted">\u5c1a\u65e0\u8bc6\u522b\u7ed3\u679c</p>';
      return;
    }
    box.innerHTML = families
      .map((fam) => {
        const allOn = fam.categories.every((c) => state.selectedCategories.has(c.id));
        const rows = fam.categories
          .map((c) => {
            const on = state.selectedCategories.has(c.id);
            const bom = c.bomCount
              ? ` \u00b7 ${c.bomCount} \u5b50\u4ef6`
              : "";
            return `<div class="cat-row">
              <input type="checkbox" data-cat="${escapeHtml(c.id)}" ${on ? "checked" : ""} />
              <label><code>${escapeHtml(c.material)}</code> ${escapeHtml(c.description)}
                <em>${c.count} \u884c${bom}</em></label>
            </div>`;
          })
          .join("");
        return `<div class="family">
          <div class="family-head">
            <input type="checkbox" data-family="${escapeHtml(fam.id)}" ${allOn ? "checked" : ""} />
            <div>${escapeHtml(fam.name)} <span>${fam.count} \u884c${
          fam.bomCount ? " \u00b7 " + fam.bomCount + " \u5b50\u4ef6" : ""
        }</span></div>
          </div>
          ${rows}
        </div>`;
      })
      .join("");
    box.querySelectorAll("input[data-cat]").forEach((el) => {
      el.addEventListener("change", () => {
        if (el.checked) state.selectedCategories.add(el.dataset.cat);
        else state.selectedCategories.delete(el.dataset.cat);
        render();
      });
    });
    box.querySelectorAll("input[data-family]").forEach((el) => {
      el.addEventListener("change", () => {
        const fam = families.find((f) => f.id === el.dataset.family);
        if (!fam) return;
        fam.categories.forEach((c) => {
          if (el.checked) state.selectedCategories.add(c.id);
          else state.selectedCategories.delete(c.id);
        });
        render();
      });
    });
  }

  function renderFieldPickers() {
    const parentBox = $("#parentFields");
    parentBox.innerHTML = PARENT_FIELDS.map((f) => {
      const on = state.selectedParentFields.has(f.id);
      return `<label><input type="checkbox" data-pf="${f.id}" ${on ? "checked" : ""} /> ${escapeHtml(
        f.label
      )}</label>`;
    }).join("");
    parentBox.querySelectorAll("input").forEach((el) => {
      el.addEventListener("change", () => {
        if (el.checked) state.selectedParentFields.add(el.dataset.pf);
        else state.selectedParentFields.delete(el.dataset.pf);
        savePrefs();
        render();
      });
    });

    const bomBox = $("#bomFields");
    bomBox.innerHTML = BOM_FIELDS.map((f) => {
      const on = state.selectedBomFields.has(f.id);
      return `<label><input type="checkbox" data-bf="${f.id}" ${on ? "checked" : ""} /> ${escapeHtml(
        f.label
      )}</label>`;
    }).join("");
    bomBox.querySelectorAll("input").forEach((el) => {
      el.addEventListener("change", () => {
        if (el.checked) state.selectedBomFields.add(el.dataset.bf);
        else state.selectedBomFields.delete(el.dataset.bf);
        savePrefs();
        render();
      });
    });

    document.querySelectorAll("input[name=viewMode]").forEach((el) => {
      el.checked = el.value === state.viewMode;
    });
  }

  function renderKeywords() {
    const box = $("#keywordChips");
    box.innerHTML = state.extractKeywords
      .map(
        (k, i) =>
          `<span class="chip">${escapeHtml(k)}<button data-i="${i}" title="\u79fb\u9664">\u00d7</button></span>`
      )
      .join("");
    box.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.extractKeywords.splice(Number(btn.dataset.i), 1);
        savePrefs();
        render();
      });
    });

    const keys = KonePoParser.collectSpecKeys(state.docs);
    const sug = $("#suggestedKeys");
    if (!keys.length) {
      sug.innerHTML = "";
      return;
    }
    sug.innerHTML =
      `<span class="hint">\u6587\u6863\u4e2d\u7684\u89c4\u683c\uff0c\u70b9\u51fb\u52a0\u5165\u5217\uff1a</span>` +
      keys
        .map((k) => {
          const active = state.extractKeywords.some((x) => x === k.key);
          return `<button class="suggest ${active ? "on" : ""}" data-key="${escapeHtml(k.key)}">${escapeHtml(
            k.key
          )} <em>${k.count}</em></button>`;
        })
        .join("");
    sug.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.key;
        if (!state.extractKeywords.includes(key)) state.extractKeywords.push(key);
        savePrefs();
        render();
      });
    });
  }

  function renderSummary() {
    const docs = state.docs;
    const items = docs.reduce((s, d) => s + d.itemCount, 0);
    const amount = docs.reduce((s, d) => s + Number(d.sumAmount || 0), 0);
    const vis = visibleParents();
    const bomN = vis.reduce((s, r) => s + ((r.item.bom || []).length), 0);
    $("#summaryCards").innerHTML = `
      <article class="stat"><label>\u91c7\u8d2d\u8ba2\u5355</label><strong>${docs.length}</strong><span>\u4efd PDF</span></article>
      <article class="stat"><label>\u8ba2\u5355\u884c</label><strong>${items}</strong><span>\u5168\u91cf\u8bc6\u522b</span></article>
      <article class="stat"><label>\u5f53\u524d\u7c7b\u522b</label><strong>${vis.length}</strong><span>\u884c \u00b7 ${bomN} \u5b50\u4ef6</span></article>
      <article class="stat"><label>\u91d1\u989d\u5408\u8ba1</label><strong>${fmtMoney(amount)}</strong><span>RMB</span></article>
    `;

    $("#poCards").innerHTML = docs
      .map((d) => {
        const h = d.header || {};
        const mats = {};
        (d.items || []).forEach((it) => {
          const k = it.material + " " + (it.description || "");
          mats[k] = (mats[k] || 0) + 1;
        });
        const matHtml = Object.entries(mats)
          .map(
            ([k, n]) =>
              `<li><code>${escapeHtml(k.split(" ")[0])}</code> ${escapeHtml(k.slice(k.indexOf(" ") + 1))} \u00d7${n}</li>`
          )
          .join("");
        return `<article class="po-card">
          <header>
            <div>
              <p class="kicker">Purchase order</p>
              <h3>No. ${escapeHtml(h.poNumber || "-")}</h3>
            </div>
            <div class="po-total">${escapeHtml(h.currency || "RMB")} ${escapeHtml(
          h.totalAmount || fmtMoney(d.sumAmount)
        )}</div>
          </header>
          <dl>
            <div><dt>\u4f9b\u5e94\u5546</dt><dd>${escapeHtml(h.vendorName || "-")}</dd></div>
            <div><dt>\u4e70\u65b9</dt><dd>${escapeHtml(h.buyerName || "-")}</dd></div>
            <div><dt>\u65e5\u671f</dt><dd>${escapeHtml(h.date || "-")}</dd></div>
            <div><dt>\u8054\u7cfb\u4eba</dt><dd>${escapeHtml(h.buyerContact || "-")} / ${escapeHtml(
          h.supplierNumber || ""
        )}</dd></div>
            <div class="wide"><dt>\u9001\u8d27</dt><dd>${escapeHtml(h.deliveryAddress || "-")}</dd></div>
            <div><dt>\u8d26\u671f</dt><dd>${escapeHtml(h.termsOfPayment || "-")}</dd></div>
            <div><dt>\u9875\u6570 / \u884c\u6570</dt><dd>${d.pages} \u9875 \u00b7 ${d.itemCount} \u884c \u00b7 \u8bc6\u522b\u5408\u8ba1 ${fmtMoney(
          d.sumAmount
        )}</dd></div>
          </dl>
          <p class="mat-title">\u7269\u6599\u6c47\u603b</p>
          <ul class="mats">${matHtml}</ul>
        </article>`;
      })
      .join("");
  }

  function colCount() {
    const p = selectedParentFieldDefs().length;
    const kw = state.extractKeywords.length;
    const b = state.viewMode === "flat" ? selectedBomFieldDefs().length : 0;
    return 1 + p + kw + b;
  }

  function renderTable() {
    const rows = displayRows();
    const pdefs = selectedParentFieldDefs();
    const bdefs = selectedBomFieldDefs();
    const kw = state.extractKeywords;
    const showBomCols = state.viewMode === "flat";
    const thead = $("#resultHead");
    thead.innerHTML =
      `<tr><th></th>` +
      pdefs.map((f) => `<th>${escapeHtml(f.label)}</th>`).join("") +
      (showBomCols ? bdefs.map((f) => `<th class="kw">${escapeHtml(f.label)}</th>`).join("") : "") +
      kw.map((k) => `<th class="kw">${escapeHtml(k)}</th>`).join("") +
      `</tr>`;

    const body = $("#resultBody");
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="${colCount()}" class="empty">\u5f53\u524d\u7c7b\u522b\u6216\u8fc7\u6ee4\u6ca1\u6709\u5339\u914d\u884c\u3002\u53ef\u5728\u4e0a\u65b9\u91cd\u65b0\u52fe\u9009\u7c7b\u522b\u3002</td></tr>`;
      return;
    }

    body.innerHTML = rows
      .map((row) => {
        const { doc, item, key, kind } = row;
        const open = state.expanded.has(key);
        const parentCells = pdefs
          .map((f) => {
            const v = parentValue(doc, item, f.id);
            const cls = f.id === "material" || f.id === "po" || f.id === "salesOrderRef" ? "mono" : "";
            return `<td class="${cls}">${escapeHtml(v)}</td>`;
          })
          .join("");
        const bomCells = showBomCols
          ? bdefs
              .map((f) => {
                const v = kind === "bom" ? bomValue(row.bom, f.id) : "";
                return `<td class="kw">${escapeHtml(v)}</td>`;
              })
              .join("")
          : "";
        const extraCells = kw
          .map((k) => `<td class="kw">${escapeHtml(KonePoParser.specValueForKeyword(item, k))}</td>`)
          .join("");
        const specRows = (item.specs || [])
          .map(
            (s) =>
              `<tr><th>${escapeHtml(s.key)}</th><td>${escapeHtml(
                [s.code, s.value].filter(Boolean).join(" \u00b7 ")
              )}</td></tr>`
          )
          .join("");
        const bomHead =
          `<tr>` +
          bdefs.map((f) => `<th>${escapeHtml(f.label)}</th>`).join("") +
          `</tr>`;
        const bomBody = (item.bom || [])
          .map((b) => {
            return (
              `<tr>` +
              bdefs.map((f) => `<td>${escapeHtml(bomValue(b, f.id))}</td>`).join("") +
              `</tr>`
            );
          })
          .join("");
        const canExpand = state.viewMode !== "flat";
        const detail =
          canExpand && open
            ? `<tr class="detail open" data-for="${key}">
          <td colspan="${colCount()}">
            <div class="detail-grid">
              <section>
                <h4>\u89c4\u683c\u53c2\u6570 ${item.specs.length}</h4>
                ${specRows ? `<table class="mini">${specRows}</table>` : `<p class="muted">\u65e0\u89c4\u683c\u53c2\u6570</p>`}
              </section>
              <section>
                <h4>BOM \u5b50\u4ef6 ${item.bom.length}<span class="badge">\u542b\u5907\u6ce8\u884c</span></h4>
                ${
                  item.bom.length && bdefs.length
                    ? `<table class="mini bom"><thead>${bomHead}</thead><tbody>${bomBody}</tbody></table>`
                    : `<p class="muted">\u65e0 BOM \u5b50\u4ef6\u6216\u672a\u52fe\u9009\u5b50\u4ef6\u5b57\u6bb5</p>`
                }
              </section>
            </div>
          </td>
        </tr>`
            : "";
        const tag = kind === "bom" ? `<span class="badge">\u5b50\u4ef6</span>` : "";
        return `<tr class="item ${kind === "bom" ? "bom-line" : ""} ${open ? "open" : ""}" data-key="${key}">
          <td>${
            canExpand
              ? `<button class="exp" data-key="${key}">${open ? "\u2212" : "+"}</button>`
              : tag
          }</td>
          ${parentCells}${bomCells}${extraCells}
        </tr>${detail}`;
      })
      .join("");

    body.querySelectorAll("button.exp").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.key;
        if (state.expanded.has(key)) state.expanded.delete(key);
        else state.expanded.add(key);
        renderTable();
      });
    });
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function parentExportObject(doc, item) {
    const row = {};
    selectedParentFieldDefs().forEach((f) => {
      row[f.label] = parentValue(doc, item, f.id);
    });
    state.extractKeywords.forEach((k) => {
      row[k] = KonePoParser.specValueForKeyword(item, k);
    });
    return row;
  }

  function bomExportObject(doc, item, bom) {
    const row = {
      PO: doc.header.poNumber,
      "\u6bcd\u4ef6Pos": item.pos,
      "\u6bcd\u4ef6\u7269\u6599": item.material,
      "\u6bcd\u4ef6\u63cf\u8ff0": item.description,
      "\u9500\u552e\u8ba2\u5355": item.salesOrderRef,
      "\u9879\u76ee\u53f7": item.projectRef,
    };
    selectedBomFieldDefs().forEach((f) => {
      row[f.label] = bomValue(bom, f.id);
    });
    return row;
  }

  function exportDisplayedObjects() {
    return displayRows().map((row) => {
      const o = parentExportObject(row.doc, row.item);
      if (state.viewMode === "flat") {
        o["\u884c\u7c7b\u578b"] = row.kind === "bom" ? "\u5b50\u4ef6" : "\u8ba2\u5355\u884c";
        selectedBomFieldDefs().forEach((f) => {
          o[f.label] = row.kind === "bom" ? bomValue(row.bom, f.id) : "";
        });
      }
      return o;
    });
  }

  function downloadBlob(blob, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function toCsv(rows) {
    if (!rows.length) return "";
    const cols = Object.keys(rows[0]);
    const lines = [cols.join(",")].concat(
      rows.map((r) =>
        cols
          .map((c) => {
            const v = String(r[c] ?? "");
            return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
          })
          .join(",")
      )
    );
    return "\ufeff" + lines.join("\n");
  }

  function exportCsv() {
    const rows = exportDisplayedObjects();
    if (!rows.length) return toast("\u6ca1\u6709\u53ef\u5bfc\u51fa\u7684\u884c");
    downloadBlob(new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" }), "kone-po-selected.csv");
  }

  function exportXlsx() {
    const vis = visibleParents();
    if (!vis.length) return toast("\u6ca1\u6709\u53ef\u5bfc\u51fa\u7684\u884c");
    if (!window.XLSX) return toast("Excel \u5e93\u672a\u52a0\u8f7d\uff0c\u8bf7\u6539\u7528 CSV");
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(vis.map((r) => parentExportObject(r.doc, r.item))),
      "\u8ba2\u5355\u884c"
    );
    if (state.selectedBomFields.size) {
      const bomRows = [];
      vis.forEach(({ doc, item }) => {
        (item.bom || []).forEach((b) => bomRows.push(bomExportObject(doc, item, b)));
      });
      if (bomRows.length) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(bomRows), "BOM\u5b50\u4ef6");
      }
    }
    XLSX.writeFile(wb, "kone-po-selected.xlsx");
  }

  function exportJson() {
    const vis = visibleParents();
    const payload = vis.map(({ doc, item }) => ({
      file: doc.file,
      header: doc.header,
      item,
    }));
    downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), "kone-po-selected.json");
  }

  function render() {
    $("#sourceTag").textContent =
      state.source === "demo"
        ? "\u793a\u4f8b\u6587\u6863\uff08\u5df2\u9884\u8bc6\u522b\uff09"
        : "\u672c\u6b21\u4e0a\u4f20\u8bc6\u522b";
    renderCategories();
    renderFieldPickers();
    renderKeywords();
    renderSummary();
    renderTable();
  }

  function bind() {
    $("#fileInput").addEventListener("change", (e) => parseFiles(e.target.files));
    const dz = $("#dropzone");
    ["dragenter", "dragover"].forEach((ev) =>
      dz.addEventListener(ev, (e) => {
        e.preventDefault();
        dz.classList.add("over");
      })
    );
    ["dragleave", "drop"].forEach((ev) =>
      dz.addEventListener(ev, (e) => {
        e.preventDefault();
        dz.classList.remove("over");
      })
    );
    dz.addEventListener("drop", (e) => parseFiles(e.dataTransfer.files));
    dz.addEventListener("click", () => $("#fileInput").click());

    $("#loadDemo").addEventListener("click", () =>
      loadDemo().then(() => toast("\u5df2\u52a0\u8f7d\u4e09\u4efd\u793a\u4f8b PO"))
    );
    $("#parseSamples").addEventListener("click", async () => {
      const names = [
        "samples/KONE_PO_4801006558__Please_Acknowledge_Receipt_cd19.pdf",
        "samples/KONE_PO_4801007230__Please_Acknowledge_Receipt_5025.pdf",
        "samples/KONE_PO_4801169630__Please_Acknowledge_Receipt_659c.pdf",
      ];
      try {
        $("#progressWrap").hidden = false;
        const files = [];
        for (const n of names) {
          const res = await fetch(n);
          if (!res.ok) throw new Error("\u65e0\u6cd5\u8bfb\u53d6 " + n);
          const blob = await res.blob();
          files.push(new File([blob], n.split("/").pop(), { type: "application/pdf" }));
        }
        await parseFiles(files);
      } catch (err) {
        toast(err.message || String(err));
        $("#progressWrap").hidden = true;
      }
    });

    $("#addKeyword").addEventListener("click", addKeyword);
    $("#keywordInput").addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addKeyword();
      }
    });
    $("#filterInput").addEventListener("input", (e) => {
      state.filterKeyword = e.target.value;
      renderSummary();
      renderTable();
    });
    $("#btnCsv").addEventListener("click", exportCsv);
    $("#btnXlsx").addEventListener("click", exportXlsx);
    $("#btnJson").addEventListener("click", exportJson);
    $("#toggleStructure").addEventListener("click", () => {
      $("#structureBody").classList.toggle("collapsed");
      $("#toggleStructure").textContent = $("#structureBody").classList.contains("collapsed")
        ? "\u5c55\u5f00\u7ed3\u6784\u8bf4\u660e"
        : "\u6536\u8d77";
    });
    $("#catAll").addEventListener("click", () => {
      const { list } = KonePoParser.collectCategories(state.docs);
      state.selectedCategories = new Set(list.map((c) => c.id));
      render();
    });
    $("#catNone").addEventListener("click", () => {
      state.selectedCategories = new Set();
      render();
    });
    document.querySelectorAll("input[name=viewMode]").forEach((el) => {
      el.addEventListener("change", () => {
        if (!el.checked) return;
        state.viewMode = el.value;
        savePrefs();
        render();
      });
    });
  }

  function addKeyword() {
    const v = $("#keywordInput").value.trim();
    if (!v) return;
    if (!state.extractKeywords.includes(v)) state.extractKeywords.push(v);
    $("#keywordInput").value = "";
    savePrefs();
    render();
  }

  loadPrefs();
  bind();
  loadDemo().catch((err) => {
    console.warn(err);
    toast("\u793a\u4f8b\u6570\u636e\u672a\u52a0\u8f7d\uff0c\u8bf7\u76f4\u63a5\u4e0a\u4f20 PDF");
  });
})();
