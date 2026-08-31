(function () {
  const LINE_COLS = [
    ["采购订单号", "poNumber"],
    ["行项目", "lineNo"],
    ["物料号", "materialNo"],
    ["物料组", "materialGroup"],
    ["物料描述", "description"],
    ["交货日期", "deliveryDate"],
    ["数量", "qty"],
    ["单位", "unit"],
    ["未税单价", "unitPrice"],
    ["未税金额", "amount"],
    ["图号/版本", "drawingRev"],
    ["成组技术码", "groupTechCode"],
    ["SCM大小/量纲", "scmSize"],
    ["供应商", "supplierName"],
    ["供应商编号", "supplierCode"],
  ];

  const HEADER_FIELDS = [
    ["买方", "buyer"],
    ["供应商", "supplierName"],
    ["供应商地址", "supplierAddress"],
    ["供应商编号", "supplierCode"],
    ["供应商联系人", "supplierContact"],
    ["供应商电话", "supplierPhone"],
    ["采购组", "purchaseGroup"],
    ["凭证日期", "documentDate"],
    ["交货日期", "deliveryDate"],
    ["交货地址", "deliveryAddress"],
    ["开票抬头", "billingTitle"],
    ["付款条件", "paymentTerms"],
    ["工厂 / 公司代码", "plant"],
    ["不含税总价", "vatTotal"],
    ["买方联系人", "buyerContact"],
  ];

  function flatten(documents) {
    const rows = [];
    for (const doc of documents) {
      for (const item of doc.items) {
        rows.push({
          file: doc.file,
          ...doc.header,
          ...item,
          plant: doc.header.plant + " / " + doc.header.companyCode,
        });
      }
    }
    return rows;
  }

  function renderTable(rows) {
    const wrap = document.getElementById("line-table");
    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const trh = document.createElement("tr");
    LINE_COLS.forEach(([label]) => {
      const th = document.createElement("th");
      th.textContent = label;
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    const tbody = document.createElement("tbody");
    rows.forEach((row) => {
      const tr = document.createElement("tr");
      LINE_COLS.forEach(([label, key]) => {
        const cell = document.createElement("td");
        const value = row[key];
        if (["qty", "unitPrice", "amount", "poNumber", "lineNo", "materialNo"].includes(key)) {
          cell.className = "num";
        }
        if (["description", "drawingRev", "supplierName"].includes(key)) cell.classList.add("wrap");
        if (!value) {
          cell.classList.add("empty");
          cell.textContent = "—";
        } else {
          cell.textContent = value;
        }
        tr.appendChild(cell);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(thead);
    table.appendChild(tbody);
    wrap.innerHTML = "";
    wrap.appendChild(table);
    document.getElementById("row-count").textContent =
      rows.length + " 条订单行 · " + new Set(rows.map((r) => r.poNumber)).size + " 张采购订单";
  }

  function previewName(file) {
    return "assets/previews/" + file.replace(/\.pdf$/i, ".png");
  }

  function renderDocs(documents) {
    const root = document.getElementById("docs");
    root.innerHTML = "";
    documents.forEach((doc) => {
      const el = document.createElement("article");
      el.className = "doc";
      const item = doc.items[0] || {};
      el.innerHTML =
        '<div class="doc-head">' +
        "<div><h3>" +
        doc.header.docType +
        ' <span class="po">' +
        doc.header.poNumber +
        "</span></h3>" +
        "<div class='meta' style='color:#57534e;font-size:13px'>" +
        doc.file +
        " · " +
        doc.pageCount +
        " 页 · " +
        doc.items.length +
        " 条行项目</div></div>" +
        '<span class="pill">金额核对 ' +
        item.amount +
        " = 抬头 " +
        doc.header.vatTotal +
        "</span></div>" +
        '<div class="doc-body">' +
        '<img alt="PDF 预览 ' +
        doc.header.poNumber +
        '" src="' +
        previewName(doc.file) +
        '">' +
        "<div>" +
        '<dl class="kv"></dl>' +
        '<div class="item-block"></div>' +
        "</div></div>";
      const dl = el.querySelector(".kv");
      HEADER_FIELDS.forEach(([label, key]) => {
        const dt = document.createElement("dt");
        dt.textContent = label;
        const dd = document.createElement("dd");
        const value = key === "plant" ? doc.header.plant + " / " + doc.header.companyCode : doc.header[key];
        dd.textContent = value || "—";
        if (!value) dd.classList.add("empty");
        dl.appendChild(dt);
        dl.appendChild(dd);
      });
      const block = el.querySelector(".item-block");
      block.innerHTML =
        "<h3>识别出的订单行</h3>" +
        "<div class='table-wrap'></div>";
      const table = document.createElement("table");
      table.innerHTML =
        "<thead><tr><th>行项目</th><th>物料号</th><th>物料组</th><th>物料描述</th><th>数量</th><th>单位</th><th>未税单价</th><th>未税金额</th><th>图号/版本</th><th>成组技术码</th><th>SCM</th></tr></thead>";
      const tb = document.createElement("tbody");
      doc.items.forEach((it) => {
        const tr = document.createElement("tr");
        [
          it.lineNo,
          it.materialNo,
          it.materialGroup,
          it.description,
          it.qty,
          it.unit,
          it.unitPrice,
          it.amount,
          it.drawingRev,
          it.groupTechCode,
          it.scmSize,
        ].forEach((v, i) => {
          const td = document.createElement("td");
          if ([0, 1, 4, 6, 7].includes(i)) td.className = "num";
          if (i === 3 || i === 8) td.classList.add("wrap");
          td.textContent = v || "—";
          if (!v) td.classList.add("empty");
          tr.appendChild(td);
        });
        tb.appendChild(tr);
      });
      table.appendChild(tb);
      block.querySelector(".table-wrap").appendChild(table);
      root.appendChild(el);
    });
  }

  function csvEscape(v) {
    const s = v == null ? "" : String(v);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function exportCsv(rows) {
    const lines = [LINE_COLS.map(([label]) => csvEscape(label)).join(",")];
    rows.forEach((row) => {
      lines.push(LINE_COLS.map(([, key]) => csvEscape(row[key])).join(","));
    });
    const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "schindler-po-lines.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function boot(data) {
    const rows = flatten(data.documents);
    renderTable(rows);
    renderDocs(data.documents);
    document.getElementById("btn-csv").addEventListener("click", () => exportCsv(rows));
  }

  const embedded = document.getElementById("demo-data");
  if (embedded && embedded.textContent.trim()) {
    boot(JSON.parse(embedded.textContent));
  } else {
    fetch("data/demo.json")
      .then((r) => r.json())
      .then(boot)
      .catch((err) => {
        document.getElementById("line-table").textContent = "无法加载识别结果：" + err;
      });
  }
})();
