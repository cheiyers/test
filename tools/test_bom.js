#!/usr/bin/env node
const path = require("path");
require(path.join(__dirname, "..", "assets/js/formula.js"));
require(path.join(__dirname, "..", "assets/js/fields.js"));
const formula = require(path.join(__dirname, "..", "assets/js/formula.js"));
const bom = require(path.join(__dirname, "..", "assets/js/bom.js"));

function fail(msg, extra) {
  console.error("FAIL", msg, extra || "");
  process.exit(1);
}

const fs = require("fs");

const names = formula.extractNames("=IF(VALUE({轿厢宽度})>1400,2,1)*数量");
if (names.indexOf("轿厢宽度") < 0 || names.indexOf("数量") < 0) fail("extractNames", names);
if (names.indexOf("IF") >= 0 || names.indexOf("VALUE") >= 0) fail("reserved leaked", names);

const tpl = bom.parseTemplate([
  ["子件料号", "子件描述", "单位", "备注"],
  ["SCREW-M6", "螺丝", "件", "=数量*4"],
  ["LED-CORE", "灯芯", "件", "=IF(VALUE({轿厢宽度})>1400,2,1)*数量"],
]);
if (tpl.rows.length !== 2) fail("template rows", tpl.rows);
if (tpl.variables.indexOf("数量") < 0 || tpl.variables.indexOf("轿厢宽度") < 0) fail("template vars", tpl.variables);
if (tpl.headers[tpl.qtyCol] !== "备注") fail("qty col", tpl.qtyCol);

const maps = bom.mergeVarMaps(tpl.variables, [], []);
const qtyMap = maps.find(function (m) { return m.name === "数量"; });
if (!qtyMap || qtyMap.mode !== "column" || qtyMap.value !== "qty") fail("guess 数量", qtyMap);

const orderRows = [
  {
    id: "po-00010",
    poNumber: "4550711151",
    lineNo: "00010",
    materialNo: "57866241",
    qty: "1",
    extras: { 轿厢宽度: "1,600 mm" },
  },
  {
    id: "po-00030",
    poNumber: "4550711151",
    lineNo: "00030",
    materialNo: "57886847",
    qty: "4",
    extras: { 轿厢宽度: "" },
  },
];
const varMaps = [
  { name: "数量", mode: "column", value: "qty" },
  { name: "轿厢宽度", mode: "column", value: "kw-轿厢宽度" },
];
const lookup = bom.parseLookup([
  ["物料号", "对照料号", "对照描述"],
  ["57866241", "LED-ALT", "备用灯条"],
  ["57886847", "SLV-04", "套管配件"],
]);

const rows = bom.compute(orderRows, tpl, varMaps, [{ id: "kw-轿厢宽度", label: "轿厢宽度" }], lookup);
const bomRows = rows.filter(function (r) { return r._kind === "bom"; });
const lkRows = rows.filter(function (r) { return r._kind === "lookup"; });
if (bomRows.length !== 4) fail("bom count", bomRows.length);
if (lkRows.length !== 2) fail("lookup count", lkRows.length);

const screw1 = bomRows.find(function (r) { return r.行项目 === "00010" && r.子件料号 === "SCREW-M6"; });
if (!screw1 || String(screw1.计算数量) !== "4") fail("screw qty line 00010", screw1);
const led1 = bomRows.find(function (r) { return r.行项目 === "00010" && r.子件料号 === "LED-CORE"; });
if (!led1 || String(led1.计算数量) !== "2") fail("led qty wide cabin", led1);
const screw2 = bomRows.find(function (r) { return r.行项目 === "00030" && r.子件料号 === "SCREW-M6"; });
if (!screw2 || String(screw2.计算数量) !== "16") fail("screw qty line 00030", screw2);

if (rows[2]._kind !== "lookup" || rows[2].对照料号 !== "LED-ALT") fail("lookup after first PO line", rows[2]);
if (rows[rows.length - 1].对照料号 !== "SLV-04") fail("lookup last", rows[rows.length - 1]);

const constMaps = [
  { name: "数量", mode: "const", value: "3" },
  { name: "轿厢宽度", mode: "formula", value: "='1200 mm'" },
];
const constRows = bom.compute([orderRows[0]], tpl, constMaps, [], null);
const screwConst = constRows.find(function (r) { return r.子件料号 === "SCREW-M6"; });
const ledConst = constRows.find(function (r) { return r.子件料号 === "LED-CORE"; });
if (!screwConst || String(screwConst.计算数量) !== "12") fail("const qty", screwConst);
if (!ledConst || String(ledConst.计算数量) !== "3") fail("formula cabin qty", ledConst);

const csvQuoted = bom.parseCsv('子件料号,备注\nX,"=IF(VALUE({轿厢宽度})>1400,2,1)*数量"\n');
if (csvQuoted[1][1] !== "=IF(VALUE({轿厢宽度})>1400,2,1)*数量") fail("quoted csv formula", csvQuoted);
const csvBare = bom.parseCsv("子件料号,备注\nX,=IF(VALUE({轿厢宽度})>1400,2,1)*数量\n");
if (csvBare[1][1] !== "=IF(VALUE({轿厢宽度})>1400,2,1)*数量") fail("unquoted csv formula join", csvBare);
const sampleCsv = bom.parseCsv(fs.readFileSync(path.join(__dirname, "../samples/bom-template.csv"), "utf8"));
const sampleTpl = bom.parseTemplate(sampleCsv, "bom-template.csv");
if (sampleTpl.variables.indexOf("轿厢宽度") < 0) fail("sample csv vars", sampleTpl);
if (sampleTpl.rows[2][3].indexOf("IF") < 0) fail("sample csv LED formula", sampleTpl.rows[2]);

console.log("OK bom template vars compute lookup");
