(function () {
  const pdfjsLib = window["pdfjs-dist/build/pdf"] || window.pdfjsLib;
  if (pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }

  const state = {
    docs: [],
    extractKeywords: [
      "\u8f7f\u5185\u51c0\u9ad8",
      "\u8f7f\u53a2\u5bbd\u5ea6",
      "\u8f7f\u53a2\u6df1\u5ea6",
      "\u989d\u5b9a\u8f7d\u91cd",
      "Wire Length",
      "\u540a\u9876\u6750\u6599",
    ],
    filterKeyword: "",
    expanded: new Set(),
    source: "demo",
  };

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];

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

  async function loadDemo() {
    const res = await fetch("data/demo.json");
    if (!res.ok) throw new Error("demo.json missing");
    const docs = await res.json();
    state.docs = docs;
    state.source = "demo";
    state.expanded = new Set();
    render();
  }

  async function pdfToWords(file) {
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
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
      state.docs = docs;
      state.source = "upload";
      state.expanded = new Set();
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

  function visibleRows() {
    const filter = state.filterKeyword.trim().toLowerCase();
    const rows = [];
    state.docs.forEach((doc, di) => {
      (doc.items || []).forEach((item, ii) => {
        if (filter) {
          const blob = KonePoParser.itemSearchBlob(item, doc.header);
          if (!blob.includes(filter)) return;
        }
        rows.push({ doc, item, di, ii, key: di + ":" + ii });
      });
    });
    return rows;
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
      `<span class="hint">\u6587\u6863\u4e2d\u51fa\u73b0\u7684\u89c4\u683c\u5b57\u6bb5\uff0c\u70b9\u51fb\u52a0\u5165\u63d0\u53d6\u5217\uff1a</span>` +
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
        render();
      });
    });
  }

  function renderSummary() {
    const docs = state.docs;
    const items = docs.reduce((s, d) => s + d.itemCount, 0);
    const amount = docs.reduce((s, d) => s + Number(d.sumAmount || 0), 0);
    const cards = $("#summaryCards");
    cards.innerHTML = `
      <article class="stat"><label>\u91c7\u8d2d\u8ba2\u5355</label><strong>${docs.length}</strong><span>\u4efd PDF</span></article>
      <article class="stat"><label>\u8ba2\u5355\u884c</label><strong>${items}</strong><span>\u884c\u660e\u7ec6</span></article>
      <article class="stat"><label>\u91d1\u989d\u5408\u8ba1</label><strong>${fmtMoney(amount)}</strong><span>RMB</span></article>
      <article class="stat"><label>\u5f53\u524d\u663e\u793a</label><strong>${visibleRows().length}</strong><span>\u884c\uff08\u542b\u8fc7\u6ee4\uff09</span></article>
    `;

    const poCards = $("#poCards");
    poCards.innerHTML = docs
      .map((d) => {
        const h = d.header || {};
        const mats = {};
        (d.items || []).forEach((it) => {
          const k = it.material + " " + (it.description || "");
          mats[k] = (mats[k] || 0) + 1;
        });
        const matHtml = Object.entries(mats)
          .map(([k, n]) => `<li><code>${escapeHtml(k.split(" ")[0])}</code> ${escapeHtml(k.slice(k.indexOf(" ") + 1))} \u00d7${n}</li>`)
          .join("");
        return `<article class="po-card">
          <header>
            <div>
              <p class="kicker">Purchase order</p>
              <h3>No. ${escapeHtml(h.poNumber || "-")}</h3>
            </div>
            <div class="po-total">${escapeHtml(h.currency || "RMB")} ${escapeHtml(h.totalAmount || fmtMoney(d.sumAmount))}</div>
          </header>
          <dl>
            <div><dt>\u4f9b\u5e94\u5546</dt><dd>${escapeHtml(h.vendorName || "-")}</dd></div>
            <div><dt>\u4e70\u65b9</dt><dd>${escapeHtml(h.buyerName || "-")}</dd></div>
            <div><dt>\u65e5\u671f</dt><dd>${escapeHtml(h.date || "-")}</dd></div>
            <div><dt>\u8054\u7cfb\u4eba</dt><dd>${escapeHtml(h.buyerContact || "-")} / ${escapeHtml(h.supplierNumber || "")}</dd></div>
            <div class="wide"><dt>\u9001\u8d27</dt><dd>${escapeHtml(h.deliveryAddress || "-")}</dd></div>
            <div><dt>\u8d26\u671f</dt><dd>${escapeHtml(h.termsOfPayment || "-")}</dd></div>
            <div><dt>\u9875\u6570 / \u884c\u6570</dt><dd>${d.pages} \u9875 \u00b7 ${d.itemCount} \u884c \u00b7 \u8bc6\u522b\u5408\u8ba1 ${fmtMoney(d.sumAmount)}</dd></div>
          </dl>
          <p class="mat-title">\u7269\u6599\u6c47\u603b</p>
          <ul class="mats">${matHtml}</ul>
        </article>`;
      })
      .join("");
  }

  function renderTable() {
    const rows = visibleRows();
    const kw = state.extractKeywords;
    const thead = $("#resultHead");
    const extra = kw.map((k) => `<th class="kw">${escapeHtml(k)}</th>`).join("");
    thead.innerHTML = `<tr>
      <th></th>
      <th>PO</th>
      <th>Pos</th>
      <th>\u7269\u6599</th>
      <th>\u63cf\u8ff0</th>
      <th>\u5230\u8d27\u65e5</th>
      <th>\u6570\u91cf</th>
      <th>\u5355\u4ef7</th>
      <th>\u91d1\u989d</th>
      <th>\u9500\u552e\u8ba2\u5355</th>
      <th>\u9879\u76ee\u53f7</th>
      <th>\u53d1\u8d27</th>
      ${extra}
    </tr>`;

    const body = $("#resultBody");
    if (!rows.length) {
      body.innerHTML = `<tr><td colspan="${12 + kw.length}" class="empty">\u6ca1\u6709\u5339\u914d\u7684\u8ba2\u5355\u884c\u3002\u8bd5\u8bd5\u6e05\u7a7a\u8fc7\u6ee4\u6216\u52a0\u8f7d\u6587\u4ef6\u3002</td></tr>`;
      return;
    }

    body.innerHTML = rows
      .map(({ doc, item, key }) => {
        const open = state.expanded.has(key);
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
        const bomRows = (item.bom || [])
          .map(
            (b) =>
              `<tr><td>${escapeHtml(b.pos)}</td><td><code>${escapeHtml(b.material)}</code></td><td>${escapeHtml(
                b.qty
              )} ${escapeHtml(b.unit)}</td><td>${escapeHtml(b.description)}</td></tr>`
          )
          .join("");
        const detail = `<tr class="detail ${open ? "open" : ""}" data-for="${key}">
          <td colspan="${12 + kw.length}">
            <div class="detail-grid">
              <section>
                <h4>\u89c4\u683c\u53c2\u6570 ${item.specs.length}</h4>
                ${
                  specRows
                    ? `<table class="mini">${specRows}</table>`
                    : `<p class="muted">\u65e0\u89c4\u683c\u53c2\u6570</p>`
                }
              </section>
              <section>
                <h4>BOM \u5b50\u4ef6 ${item.bom.length}</h4>
                ${
                  bomRows
                    ? `<table class="mini bom"><thead><tr><th>Pos</th><th>\u7269\u6599</th><th>\u6570\u91cf</th><th>\u63cf\u8ff0</th></tr></thead><tbody>${bomRows}</tbody></table>`
                    : `<p class="muted">\u65e0 BOM \u5b50\u4ef6</p>`
                }
              </section>
            </div>
          </td>
        </tr>`;
        return `<tr class="item ${open ? "open" : ""}" data-key="${key}">
          <td><button class="exp" data-key="${key}">${open ? "\u2212" : "+"}</button></td>
          <td class="mono">${escapeHtml(doc.header.poNumber)}</td>
          <td>${escapeHtml(item.pos)}</td>
          <td class="mono">${escapeHtml(item.material)}</td>
          <td>${escapeHtml(item.description)}</td>
          <td>${escapeHtml(item.arrDate)}</td>
          <td>${item.qty} ${escapeHtml(item.unit)}</td>
          <td class="num">${escapeHtml(item.price)}</td>
          <td class="num">${escapeHtml(item.amount)}</td>
          <td class="mono">${escapeHtml(item.salesOrderRef)}</td>
          <td>${escapeHtml(item.projectRef)}</td>
          <td>${escapeHtml(item.shippingInstruction)}</td>
          ${extraCells}
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

  function exportRows() {
    const kw = state.extractKeywords;
    const rows = visibleRows();
    return rows.map(({ doc, item }) => {
      const row = {
        "\u6587\u4ef6": doc.file,
        PO: doc.header.poNumber,
        "\u4f9b\u5e94\u5546": doc.header.vendorName,
        "\u8ba2\u5355\u65e5\u671f": doc.header.date,
        Pos: item.pos,
        "\u7269\u6599": item.material,
        "\u63cf\u8ff0": item.description,
        "\u5230\u8d27\u65e5": item.arrDate,
        "\u6570\u91cf": item.qty,
        "\u5355\u4f4d": item.unit,
        "\u5355\u4ef7": item.price,
        "\u91d1\u989d": item.amount,
        "\u9500\u552e\u8ba2\u5355": item.salesOrderRef,
        "\u9879\u76ee\u53f7": item.projectRef,
        "\u53d1\u8d27\u8bf4\u660e": item.shippingInstruction,
        REV: item.rev,
        "\u9875\u7801": item.page,
      };
      kw.forEach((k) => {
        row[k] = KonePoParser.specValueForKeyword(item, k);
      });
      return row;
    });
  }

  function downloadBlob(blob, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function exportCsv() {
    const rows = exportRows();
    if (!rows.length) return toast("\u6ca1\u6709\u53ef\u5bfc\u51fa\u7684\u884c");
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
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    downloadBlob(blob, "kone-po-lines.csv");
  }

  function exportXlsx() {
    const rows = exportRows();
    if (!rows.length) return toast("\u6ca1\u6709\u53ef\u5bfc\u51fa\u7684\u884c");
    if (!window.XLSX) return toast("Excel \u5e93\u672a\u52a0\u8f7d\uff0c\u8bf7\u6539\u7528 CSV");
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "PO\u884c\u9879\u76ee");
    const bomRows = [];
    visibleRows().forEach(({ doc, item }) => {
      (item.bom || []).forEach((b) => {
        bomRows.push({
          PO: doc.header.poNumber,
          "\u6bcd\u4ef6Pos": item.pos,
          "\u6bcd\u4ef6\u7269\u6599": item.material,
          "BOM Pos": b.pos,
          "BOM\u7269\u6599": b.material,
          "BOM\u6570\u91cf": b.qty,
          "BOM\u63cf\u8ff0": b.description,
        });
      });
    });
    if (bomRows.length) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(bomRows), "BOM\u5b50\u4ef6");
    }
    XLSX.writeFile(wb, "kone-po-lines.xlsx");
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(state.docs, null, 2)], { type: "application/json" });
    downloadBlob(blob, "kone-po-parsed.json");
  }

  function render() {
    $("#sourceTag").textContent =
      state.source === "demo"
        ? "\u793a\u4f8b\u6587\u6863\uff08\u5df2\u9884\u8bc6\u522b\uff09"
        : "\u672c\u6b21\u4e0a\u4f20\u8bc6\u522b";
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
      renderTable();
      renderSummary();
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
  }

  function addKeyword() {
    const v = $("#keywordInput").value.trim();
    if (!v) return;
    if (!state.extractKeywords.includes(v)) state.extractKeywords.push(v);
    $("#keywordInput").value = "";
    render();
  }

  bind();
  loadDemo().catch((err) => {
    console.warn(err);
    toast("\u793a\u4f8b\u6570\u636e\u672a\u52a0\u8f7d\uff0c\u8bf7\u76f4\u63a5\u4e0a\u4f20 PDF");
  });
})();
