#!/usr/bin/env node
const path = require("path");
const parser = require(path.join(__dirname, "..", "assets/js/parser.js"));

function w(x, y, text) {
  return { text: text, x: x, y: y, x1: x + String(text).length * 5 };
}

const words = [
  w(42.5, 31.4, "迅达(中国）电梯有限公司"),
  w(42.5, 95.1, "采购订单"),
  w(42.5, 126.7, "采购订单号/采购组:"),
  w(136.1, 126.7, "4551750099/T0M"),
  w(283.5, 386.8, "交货日期: 2026/09/20"),
  w(42.5, 483.8, "行项目"),
  w(85.0, 483.8, "物料号"),
  w(42.5, 513.8, "00010"),
  w(85.0, 513.8, "57668963"),
  w(170.1, 513.8, "XH"),
  w(240.9, 513.8, "Round spot 4LED照明"),
  w(240.9, 525.8, "含安装附件"),
  w(179.2, 537.8, "5"),
  w(226.8, 537.8, "件         93.50/1"),
  w(367.6, 537.8, "467.50"),
  w(42.5, 549.8, "图号/版本: Z1"),
  w(42.5, 561.8, "颜色: 黑色"),
  w(42.5, 609.8, "00020"),
  w(85.0, 609.8, "57664581"),
  w(170.1, 609.8, "XH"),
  w(240.9, 609.8, "LED方型灯"),
  w(179.2, 621.8, "4"),
  w(226.8, 621.8, "件         48.30/1"),
  w(367.6, 621.8, "193.20"),
  w(42.5, 633.8, "颜色: 银色"),
  w(42.5, 645.8, "表面处理: 喷塑"),
  w(179.3, 710.0, "不含增值税总价 CNY"),
  w(367.6, 710.0, "660.70"),
];

const doc = parser.parseDocument("PO_two_lines.pdf", [{ words: words }]);
if (doc.items.length !== 2) {
  console.error("item count", doc.items.length, JSON.stringify(doc.items, null, 2));
  process.exit(1);
}
if (doc.items[0].lineNo !== "00010" || doc.items[1].lineNo !== "00020") {
  console.error("line nos", doc.items.map(function (i) { return i.lineNo; }));
  process.exit(1);
}
if (doc.items[0].description.indexOf("含安装附件") < 0) {
  console.error("wrap desc", doc.items[0].description);
  process.exit(1);
}
if (doc.items[0].extras["颜色"] !== "黑色" || doc.items[1].extras["颜色"] !== "银色") {
  console.error("colors", doc.items[0].extras, doc.items[1].extras);
  process.exit(1);
}
if (doc.items[1].extras["表面处理"] !== "喷塑") {
  console.error("finish", doc.items[1].extras);
  process.exit(1);
}
if (doc.header.poNumber !== "4551750099") {
  console.error("po", doc.header);
  process.exit(1);
}
if (doc.items[0].unit !== "件" || doc.items[0].unitPrice !== "93.50/1") {
  console.error("combined unit/price", doc.items[0]);
  process.exit(1);
}

const splitWords = [
  w(42.5, 31.4, "迅达(中国）电梯有限公司"),
  w(42.5, 95.1, "采购订单"),
  w(42.5, 126.7, "采购订单号/采购组:"),
  w(136.1, 126.7, "4551750005/T0M"),
  w(42.5, 141.1, "凭证日期:"),
  w(136.1, 141.1, "2026/08/31"),
  w(283.5, 386.8, "交货日期: 2026/09/09"),
  w(42.5, 483.8, "行项目"),
  w(85.0, 483.8, "物料号"),
  w(42.5, 513.8, "00010"),
  w(85.0, 513.8, "57668963"),
  w(170.1, 513.8, "XH"),
  w(240.9, 513.8, "Round"),
  w(271.0, 513.8, "spot"),
  w(296.0, 513.8, "4LED照明"),
  w(179.2, 525.8, "5"),
  w(226.8, 525.8, "件"),
  w(287.6, 525.8, "93.50/1"),
  w(367.6, 525.8, "467.50"),
  w(42.5, 537.8, "图号/版本:"),
  w(97.5, 537.8, "Z57668961+0+000"),
  w(179.3, 639.8, "不含增值税总价"),
  w(254.3, 639.8, "CNY"),
  w(367.6, 639.8, "467.50"),
];
const splitDoc = parser.parseDocument("PO_4551750005.pdf", [{ words: splitWords }]);
const it = splitDoc.items[0];
if (!it) {
  console.error("split parse missing item", splitDoc);
  process.exit(1);
}
if (it.unit !== "件" || it.unitPrice !== "93.50/1") {
  console.error("split unit/price", it);
  process.exit(1);
}
if (it.qty !== "5" || it.amount !== "467.50") {
  console.error("split qty/amount", it);
  process.exit(1);
}
if (it.drawingRev !== "Z57668961+0+000" && it.extras["图号/版本"] !== "Z57668961+0+000") {
  console.error("split drawing", it);
  process.exit(1);
}
if (splitDoc.header.documentDate !== "2026/08/31") {
  console.error("documentDate", splitDoc.header);
  process.exit(1);
}
console.log("OK parser two-line + split unit/price");
