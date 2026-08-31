#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
require(path.join(__dirname, "..", "assets/js/formula.js"));
const fields = require(path.join(__dirname, "..", "assets/js/fields.js"));

const demo = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data/demo.json"), "utf8"));
const rows = fields.flattenDocs(demo.documents);
if (rows.length !== 3) {
  console.error("expected 3 rows, got", rows.length);
  process.exit(1);
}
const emptyKeys = ["安装国家", "运输类型", "D/E", "产品家族"];
rows.forEach(function (row) {
  emptyKeys.forEach(function (k) {
    if (!Object.prototype.hasOwnProperty.call(row.extras, k)) {
      console.error(row.poNumber, "missing extras", k);
      process.exit(1);
    }
  });
  if (!row.extras["图号/版本"]) {
    console.error(row.poNumber, "missing drawing");
    process.exit(1);
  }
});

let selected = fields.defaultSelectedIds();
if (selected.indexOf("supplierName") >= 0) {
  console.error("optional supplier should be off by default");
  process.exit(1);
}
let cols = fields.syncOutputColumns([], selected, []);
const headers = cols.map(function (c) {
  return c.header;
});
if (headers.indexOf("供应商") >= 0 || headers.indexOf("交货地址") >= 0 || headers.indexOf("付款条件") >= 0) {
  console.error("optional fields leaked into default export", headers);
  process.exit(1);
}
if (headers.indexOf("凭证日期") < 0) {
  console.error("documentDate should be a default export column", headers);
  process.exit(1);
}
if (rows.some(function (r) { return r.documentDate !== "2026/08/31"; })) {
  console.error("documentDate missing on flattened rows");
  process.exit(1);
}
if (headers.indexOf("安装国家") < 0 || headers.indexOf("图号/版本") < 0) {
  console.error("empty keywords should stay as export columns", headers);
  process.exit(1);
}

selected = selected.concat(["supplierName", "deliveryAddress", "paymentTerms"]);
cols = fields.syncOutputColumns(cols, selected, []);
if (!cols.some(function (c) { return c.sourceId === "supplierName"; })) {
  console.error("checking supplier should add column");
  process.exit(1);
}
selected = selected.filter(function (id) {
  return id !== "supplierName";
});
cols = fields.syncOutputColumns(cols, selected, []);
if (cols.some(function (c) { return c.sourceId === "supplierName"; })) {
  console.error("unchecking supplier should drop column");
  process.exit(1);
}

cols.push({ id: "col-double", sourceId: "", header: "双倍数量", formula: "={数量}*2" });
const picked = rows.filter(function (r) {
  return r.poNumber !== "4551750009";
});
const out = fields.computeOutput(picked, cols, []);
if (out.length !== 2) {
  console.error("selected rows should be 2, got", out.length);
  process.exit(1);
}
const qtyCol = cols.find(function (c) {
  return c.sourceId === "qty";
});
const firstQty = out[0][qtyCol.id];
const firstDouble = out[0]["col-double"];
if (firstQty !== "5" || firstDouble !== "10") {
  console.error("formula/qty mismatch", firstQty, firstDouble);
  process.exit(1);
}

const headerEdit = cols.find(function (c) {
  return c.sourceId === "materialNo";
});
headerEdit.header = "料号";
if (headerEdit.header !== "料号") {
  console.error("header should be editable");
  process.exit(1);
}

const twoLineDoc = {
  file: "PO_two_lines.pdf",
  header: { poNumber: "4551750099", deliveryDate: "2026/09/20", vatTotal: "660.70" },
  items: [
    {
      lineNo: "00010",
      materialNo: "57668963",
      description: "Round spot 4LED照明 含安装附件",
      qty: "5",
      amount: "467.50",
      extras: { 颜色: "黑色", 表面处理: "" },
    },
    {
      lineNo: "00020",
      materialNo: "57664581",
      description: "LED方型灯",
      qty: "4",
      amount: "193.20",
      extras: { 颜色: "银色", 表面处理: "喷塑" },
    },
  ],
};
const twoRows = fields.flattenDocs([twoLineDoc]);
if (twoRows.length !== 2) {
  console.error("two-line flatten", twoRows.length);
  process.exit(1);
}
const discovered = fields.discoverExtraKeywords(twoRows);
const labels = discovered.map(function (k) { return k.label; }).sort();
if (labels.join(",") !== "颜色,表面处理" && labels.join(",") !== "表面处理,颜色") {
  console.error("discovered", labels);
  process.exit(1);
}
const twoCols = fields.syncOutputColumns([], ["poNumber", "lineNo", "kw-颜色", "kw-表面处理"], discovered);
const twoOut = fields.computeOutput(twoRows, twoCols, discovered);
const colorCol = twoCols.find(function (c) { return c.sourceId === "kw-颜色"; });
if (twoOut[0][colorCol.id] !== "黑色" || twoOut[1][colorCol.id] !== "银色") {
  console.error("color output", twoOut);
  process.exit(1);
}

if (rows[0].companyCode !== "3260" || rows[0].extras["公司代码"] !== "3260") {
  console.error("companyCode not flattened", rows[0].companyCode, rows[0].extras["公司代码"]);
  process.exit(1);
}
const companyField = fields.resolveKeyword("公司代码");
if (!companyField || companyField.id !== "companyCode") {
  console.error("resolve 公司代码", companyField);
  process.exit(1);
}
if (fields.fieldValue(rows[0], companyField) !== "3260") {
  console.error("fieldValue 公司代码", fields.fieldValue(rows[0], companyField));
  process.exit(1);
}
selected = selected.concat(["companyCode"]);
cols = fields.syncOutputColumns(cols, selected, []);
const companyCol = cols.find(function (c) { return c.sourceId === "companyCode"; });
if (!companyCol) {
  console.error("companyCode column missing after select");
  process.exit(1);
}
const companyOut = fields.computeOutput(rows.slice(0, 1), [companyCol], []);
if (companyOut[0][companyCol.id] !== "3260") {
  console.error("companyCode output", companyOut[0]);
  process.exit(1);
}

const absorbed = fields.normalizeKeywordsAndSelection(
  [{ id: "kw-公司代码", label: "公司代码" }],
  ["kw-公司代码", "poNumber"]
);
if (absorbed.selectedFields.indexOf("companyCode") < 0 || absorbed.selectedFields.indexOf("poNumber") < 0) {
  console.error("absorb selection", absorbed.selectedFields);
  process.exit(1);
}
if (absorbed.extraKeywords.length !== 0) {
  console.error("absorb should drop builtin keyword", absorbed.extraKeywords);
  process.exit(1);
}
if (fields.fieldValue(rows[0], { id: "kw-公司代码", label: "公司代码" }) !== "3260") {
  console.error("legacy kw fieldValue", fields.fieldValue(rows[0], { id: "kw-公司代码", label: "公司代码" }));
  process.exit(1);
}
const pg = fields.resolveKeyword("采购组");
if (!pg || pg.id !== "purchaseGroup") {
  console.error("resolve 采购组", pg);
  process.exit(1);
}
if (fields.fieldValue(rows[0], pg) !== "T0M") {
  console.error("fieldValue 采购组", fields.fieldValue(rows[0], pg));
  process.exit(1);
}

const scheme = fields.captureScheme(
  "物料对账",
  ["poNumber", "companyCode"],
  [{ id: "kw-公司代码", label: "公司代码" }],
  [{ id: "col-poNumber", sourceId: "poNumber", header: "PO", formula: "{采购订单号}" }]
);
if (scheme.name !== "物料对账") {
  console.error("scheme name", scheme);
  process.exit(1);
}
if (scheme.selectedFields.indexOf("companyCode") < 0 || scheme.selectedFields.indexOf("poNumber") < 0) {
  console.error("scheme fields", scheme.selectedFields);
  process.exit(1);
}
if (scheme.extraKeywords.length !== 0) {
  console.error("scheme should not keep builtin extras", scheme.extraKeywords);
  process.exit(1);
}
if (scheme.columns[0].header !== "PO" || scheme.columns[0].formula !== "{采购订单号}") {
  console.error("scheme columns", scheme.columns);
  process.exit(1);
}

console.log("OK fields", rows.length, "rows", cols.length, "cols", "two-line", twoRows.length);
