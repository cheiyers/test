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
  w(283.5, 323.9, "公司代码:3260"),
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
if (splitDoc.header.companyCode !== "3260") {
  console.error("companyCode", splitDoc.header);
  process.exit(1);
}

const commaWords = [
  w(42.5, 31.4, "迅达(中国）电梯有限公司"),
  w(42.5, 95.1, "采购订单"),
  w(42.5, 126.7, "采购订单号/采购组:"),
  w(136.1, 126.7, "4551787546/T0M"),
  w(42.5, 141.1, "凭证日期:"),
  w(136.1, 141.1, "2026/09/02"),
  w(283.5, 386.8, "交货日期: 2026/09/11"),
  w(42.5, 483.8, "行项目"),
  w(85.0, 483.8, "物料号"),
  w(42.5, 513.8, "00010"),
  w(85.0, 513.8, "57668963"),
  w(170.1, 513.8, "XH"),
  w(240.9, 513.8, "Round spot 4LED照明"),
  w(174.2, 525.8, "15"),
  w(226.8, 525.8, "件         93.50/1"),
  w(357.6, 525.8, "1,402.50"),
  w(42.5, 537.8, "图号/版本: Z57668961+0+000"),
  w(179.3, 639.8, "不含增值税总价 CNY"),
  w(357.6, 639.8, "1,402.50"),
];
const commaDoc = parser.parseDocument("PO_4551787546.pdf", [{ words: commaWords }]);
const commaItem = commaDoc.items[0];
if (!commaItem || commaItem.qty !== "15" || commaItem.amount !== "1402.50") {
  console.error("comma qty/amount", commaItem);
  process.exit(1);
}
if (commaItem.unit !== "件" || commaItem.unitPrice !== "93.50/1") {
  console.error("comma unit/price", commaItem);
  process.exit(1);
}
if (commaDoc.header.vatTotal !== "1402.50") {
  console.error("comma vatTotal", commaDoc.header);
  process.exit(1);
}
if ((commaDoc.warnings || []).length !== 0) {
  console.error("unexpected warnings on goods PO", commaDoc.warnings);
  process.exit(1);
}
if ((commaItem.reviewFlags || []).length !== 0) {
  console.error("unexpected reviewFlags", commaItem.reviewFlags);
  process.exit(1);
}

const reviewPage1 = [
  w(42.5, 31.4, "迅达(中国）电梯有限公司"),
  w(42.5, 95.1, "采购订单"),
  w(42.5, 126.7, "采购订单号/采购组:"),
  w(136.1, 126.7, "4551999001/T0M"),
  w(42.5, 483.8, "行项目"),
  w(85.0, 483.8, "物料号"),
  w(42.5, 513.8, "00010"),
  w(85.0, 513.8, "57668963"),
  w(170.1, 513.8, "XH"),
  w(240.9, 513.8, "Round spot 4LED照明"),
];
const reviewPage2 = [
  w(42.5, 483.8, "行项目"),
  w(85.0, 483.8, "物料号"),
  w(179.2, 513.8, "5"),
  w(226.8, 513.8, "件         93.50/1"),
  w(367.6, 513.8, "467.50"),
  w(42.5, 549.8, "00020"),
  w(240.9, 549.8, "现场安装劳务"),
  w(179.2, 561.8, "1"),
  w(226.8, 561.8, "项         800.00/1"),
  w(367.6, 561.8, "800.00"),
  w(42.5, 597.8, "00030"),
  w(240.9, 597.8, "包装注意事项请随箱附说明书"),
  w(179.3, 710.0, "不含增值税总价 CNY"),
  w(367.6, 710.0, "1267.50"),
];
const reviewDoc = parser.parseDocument("PO_review.pdf", [{ words: reviewPage1 }, { words: reviewPage2 }]);
const types = {};
(reviewDoc.warnings || []).forEach(function (w) {
  types[w.type] = (types[w.type] || 0) + 1;
});
if (!types["cross-page"] || !types["no-material"] || !types["service"]) {
  console.error("review warning types", reviewDoc.warnings);
  process.exit(1);
}
const line20 = reviewDoc.items.filter(function (i) { return i.lineNo === "00020"; })[0];
const line30 = reviewDoc.items.filter(function (i) { return i.lineNo === "00030"; })[0];
if (!line20 || line20.reviewFlags.indexOf("no-material") < 0 || line20.reviewFlags.indexOf("service") < 0) {
  console.error("line20 flags", line20);
  process.exit(1);
}
if (!line30 || line30.reviewFlags.indexOf("no-material") < 0 || line30.reviewFlags.indexOf("service") >= 0) {
  console.error("line30 flags", line30);
  process.exit(1);
}
if (!reviewDoc.pages[0].lastIncomplete || !reviewDoc.pages[1].orphanContinuation) {
  console.error("page meta", reviewDoc.pages);
  process.exit(1);
}

const twoPageWords1 = [
  w(42.5, 31.4, "迅达(中国）电梯有限公司"),
  w(42.5, 95.1, "采购订单"),
  w(42.5, 126.7, "采购订单号/采购组:"),
  w(136.1, 126.7, "4551787549/T0M"),
  w(283.5, 386.8, "交货日期: 2026/09/08"),
  w(42.5, 483.8, "行项目"),
  w(85.0, 483.8, "物料号"),
  w(42.5, 513.8, "00010"),
  w(85.0, 513.8, "C57647479-002"),
  w(170.1, 513.8, "XH"),
  w(240.9, 513.8, "整流器"),
  w(179.2, 525.8, "1"),
  w(226.8, 525.8, "件         47.50/1"),
  w(372.6, 525.8, "47.50"),
  w(42.5, 537.8, "图号/版本: L57647479(C57647479-002)+0+000"),
  w(481.9, 757.3, "页"),
  w(489.9, 755.8, "1 / 2"),
];
const twoPageWords2 = [
  w(42.5, 31.4, "迅达(中国）电梯有限公司"),
  w(42.5, 95.1, "采购订单"),
  w(42.5, 126.7, "采购订单号/采购组:"),
  w(136.1, 126.7, "4551787549/T0M"),
  w(42.5, 172.1, "行项目"),
  w(85.0, 172.1, "物料号"),
  w(42.5, 208.1, "00020"),
  w(85.0, 208.1, "57664581"),
  w(170.1, 208.1, "XH"),
  w(240.9, 208.1, "LED方型灯"),
  w(179.2, 220.1, "2"),
  w(226.8, 220.1, "件         48.30/1"),
  w(372.6, 220.1, "96.60"),
  w(179.3, 334.1, "不含增值税总价 CNY"),
  w(367.6, 334.1, "144.10"),
  w(42.5, 370.1, "此文档已电子签名"),
];
const twoPageDoc = parser.parseDocument("PO_4551787549.pdf", [
  { words: twoPageWords1 },
  { words: twoPageWords2 },
]);
if (twoPageDoc.items.length !== 2) {
  console.error("two-page item count", twoPageDoc.items);
  process.exit(1);
}
if (twoPageDoc.items[0].description !== "整流器") {
  console.error("footer in description", twoPageDoc.items[0].description);
  process.exit(1);
}
if (twoPageDoc.items[1].lineNo !== "00020" || twoPageDoc.items[1].qty !== "2" || twoPageDoc.items[1].amount !== "96.60") {
  console.error("page2 item", twoPageDoc.items[1]);
  process.exit(1);
}
if (twoPageDoc.items[1].deliveryDate !== "2026/09/08") {
  console.error("page2 deliveryDate", twoPageDoc.items[1]);
  process.exit(1);
}
if (!twoPageDoc.header.electronicallySigned) {
  console.error("e-sign", twoPageDoc.header);
  process.exit(1);
}
if (!(twoPageDoc.warnings || []).some(function (w) { return w.type === "cross-page"; })) {
  console.error("two-page warning", twoPageDoc.warnings);
  process.exit(1);
}
console.log("OK parser two-line + split unit/price + comma amount + review warnings + two-page");
