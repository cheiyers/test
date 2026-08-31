(function (root) {
  const CORE_FIELDS = [
    { id: "poNumber", label: "采购订单号", group: "core" },
    { id: "lineNo", label: "行项目", group: "core" },
    { id: "materialNo", label: "物料号", group: "core" },
    { id: "materialGroup", label: "物料组", group: "core" },
    { id: "description", label: "物料描述", group: "core" },
    { id: "deliveryDate", label: "交货日期", group: "core" },
    { id: "qty", label: "数量", group: "core" },
    { id: "unit", label: "单位", group: "core" },
    { id: "unitPrice", label: "未税单价", group: "core" },
    { id: "amount", label: "未税金额", group: "core" },
  ];

  const OPTIONAL_FIELDS = [
    { id: "supplierName", label: "供应商", group: "optional" },
    { id: "deliveryAddress", label: "交货地址", group: "optional" },
    { id: "paymentTerms", label: "付款条件", group: "optional" },
  ];

  const KEYWORD_FIELDS = [
    { id: "drawingRev", label: "图号/版本", group: "keyword" },
    { id: "installCountry", label: "安装国家", group: "keyword" },
    { id: "groupTechCode", label: "成组技术码", group: "keyword" },
    { id: "transportType", label: "运输类型", group: "keyword" },
    { id: "deFlag", label: "D/E", group: "keyword" },
    { id: "productFamily", label: "产品家族", group: "keyword" },
    { id: "scmSize", label: "SCM大小/量纲", group: "keyword" },
  ];

  const ALL_BUILTIN = CORE_FIELDS.concat(OPTIONAL_FIELDS, KEYWORD_FIELDS);

  function flattenDocs(docs) {
    const rows = [];
    (docs || []).forEach(function (doc, di) {
      const header = doc.header || {};
      (doc.items || []).forEach(function (item, ii) {
        const extras = Object.assign({}, item.extras || {});
        KEYWORD_FIELDS.forEach(function (f) {
          if (extras[f.label] == null) extras[f.label] = item[f.id] || "";
        });
        rows.push({
          id: (header.poNumber || doc.file || "po") + "-" + (item.lineNo || ii) + "-" + di + "-" + ii,
          file: doc.file || "",
          extras: extras,
          poNumber: header.poNumber || "",
          purchaseGroup: header.purchaseGroup || "",
          documentDate: header.documentDate || "",
          supplierName: header.supplierName || "",
          supplierCode: header.supplierCode || "",
          supplierContact: header.supplierContact || "",
          supplierPhone: header.supplierPhone || "",
          deliveryAddress: header.deliveryAddress || "",
          paymentTerms: header.paymentTerms || "",
          billingTitle: header.billingTitle || "",
          plant: header.plant || "",
          companyCode: header.companyCode || "",
          vatTotal: header.vatTotal || "",
          buyer: header.buyer || "",
          buyerContact: header.buyerContact || "",
          lineNo: item.lineNo || "",
          materialNo: item.materialNo || "",
          materialGroup: item.materialGroup || "",
          description: item.description || "",
          deliveryDate: item.deliveryDate || header.deliveryDate || "",
          qty: item.qty || "",
          unit: item.unit || "",
          unitPrice: item.unitPrice || "",
          amount: item.amount || "",
          drawingRev: item.drawingRev || extras["图号/版本"] || "",
          installCountry: item.installCountry || extras["安装国家"] || "",
          groupTechCode: item.groupTechCode || extras["成组技术码"] || "",
          transportType: item.transportType || extras["运输类型"] || "",
          deFlag: item.deFlag || extras["D/E"] || "",
          productFamily: item.productFamily || extras["产品家族"] || "",
          scmSize: item.scmSize || extras["SCM大小/量纲"] || "",
        });
      });
    });
    return rows;
  }

  function fieldById(id, extraKeywords) {
    const hit = ALL_BUILTIN.find(function (f) {
      return f.id === id;
    });
    if (hit) return hit;
    const custom = (extraKeywords || []).find(function (k) {
      return k.id === id || k.label === id;
    });
    if (custom) return { id: custom.id || custom.label, label: custom.label, group: "keyword" };
    return null;
  }

  function rowContext(row, extraKeywords) {
    const ctx = {};
    ALL_BUILTIN.forEach(function (f) {
      const v = row[f.id] == null ? "" : row[f.id];
      ctx[f.id] = v;
      ctx[f.label] = v;
    });
    Object.keys(row.extras || {}).forEach(function (label) {
      ctx[label] = row.extras[label];
    });
    (extraKeywords || []).forEach(function (k) {
      const label = k.label || k.id;
      const v = (row.extras && row.extras[label]) || row[k.id] || "";
      ctx[label] = v;
      if (k.id) ctx[k.id] = v;
    });
    ctx["供应商编号"] = row.supplierCode || "";
    ctx.supplierCode = row.supplierCode || "";
    ctx.file = row.file || "";
    return ctx;
  }

  function discoverExtraKeywords(rows) {
    const builtin = {};
    ALL_BUILTIN.forEach(function (f) {
      builtin[f.label] = true;
    });
    const found = [];
    const seen = {};
    (rows || []).forEach(function (row) {
      Object.keys(row.extras || {}).forEach(function (label) {
        if (!label || builtin[label] || seen[label]) return;
        seen[label] = true;
        found.push({ id: "kw-" + label, label: label, discovered: true });
      });
    });
    return found;
  }

  function defaultSelectedIds() {
    return CORE_FIELDS.concat(KEYWORD_FIELDS).map(function (f) {
      return f.id;
    });
  }

  function columnFromField(field) {
    return {
      id: "col-" + field.id,
      sourceId: field.id,
      header: field.label,
      formula: "{" + field.label + "}",
    };
  }

  function syncOutputColumns(existing, selectedIds, extraKeywords) {
    const wanted = [];
    selectedIds.forEach(function (id) {
      const field = fieldById(id, extraKeywords);
      if (field) wanted.push(field);
    });
    const next = [];
    const seen = new Set();
    existing.forEach(function (col) {
      if (!col.sourceId) {
        next.push(col);
        return;
      }
      if (selectedIds.indexOf(col.sourceId) >= 0) {
        next.push(col);
        seen.add(col.sourceId);
      }
    });
    wanted.forEach(function (field) {
      if (!seen.has(field.id)) next.push(columnFromField(field));
    });
    return next;
  }

  function computeOutput(rows, columns, extraKeywords) {
    const Formula = root.PoFormula;
    return rows.map(function (row) {
      const ctx = rowContext(row, extraKeywords);
      const out = { _rowId: row.id };
      columns.forEach(function (col) {
        const raw = Formula.evaluate(col.formula, ctx);
        out[col.id] = Formula.stringify(raw);
      });
      return out;
    });
  }

  const api = {
    CORE_FIELDS: CORE_FIELDS,
    OPTIONAL_FIELDS: OPTIONAL_FIELDS,
    KEYWORD_FIELDS: KEYWORD_FIELDS,
    ALL_BUILTIN: ALL_BUILTIN,
    flattenDocs: flattenDocs,
    discoverExtraKeywords: discoverExtraKeywords,
    fieldById: fieldById,
    rowContext: rowContext,
    defaultSelectedIds: defaultSelectedIds,
    columnFromField: columnFromField,
    syncOutputColumns: syncOutputColumns,
    computeOutput: computeOutput,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.PoFields = api;
})(typeof window !== "undefined" ? window : globalThis);
