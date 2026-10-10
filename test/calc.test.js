const assert = require("assert");
const fs = require("fs");
const path = require("path");
const XLSX = require("/tmp/xlsxpkg/node_modules/xlsx");
const Formula = require("../js/formula");
const Calc = require("../js/calc");

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log("ok", name);
  } catch (error) {
    console.error("FAIL", name);
    console.error(error);
    process.exitCode = 1;
  }
}

function sheetRows(sheet) {
  const ref = sheet["!ref"];
  if (!ref) return [];
  const range = XLSX.utils.decode_range(ref);
  const rows = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const row = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      if (!cell) row.push("");
      else if (cell.f) row.push(cell.f.charAt(0) === "=" ? cell.f : "=" + cell.f);
      else row.push(cell.v == null ? "" : cell.v);
    }
    rows.push(row);
  }
  return rows;
}

const wb = XLSX.readFile(path.join(__dirname, "../sample/BOM.xlsx"), { cellFormula: true });
const parsed = wb.SheetNames.flatMap((name) => Calc.parseGrid(sheetRows(wb.Sheets[name]), name));
assert.strictEqual(parsed.length, 2, "expected 2 BOMs");
const light = parsed[0];
const edge = parsed[1];
light.id = "light";
edge.id = "edge";

test("ignores the sheet without a parent row", () => {
  assert.strictEqual(light.parent.code, "HL0230002C");
  assert.strictEqual(light.children.length, 11);
  assert.strictEqual(edge.parent.code, "HL0230030X");
  assert.strictEqual(edge.children.length, 20);
});

test("extracts non-function parameters", () => {
  assert.deepStrictEqual(Calc.bomParams(light).slice().sort(), ["BB", "LENGTH", "LHLB", "N1LF18", "N1LF71S"]);
  assert.deepStrictEqual(Calc.bomParams(edge), ["BK", "TK"]);
});

test("LF18 length 1500 uses quantity times remark", () => {
  const scope = { LHLB: "LF18", LENGTH: 1500, N1LF18: 2, N1LF71S: 0, BB: 0 };
  const expected = {
    HL3120179B: 1,
    HL3120179C: 2,
    HL4030031F: 2,
    HL5850206D1: 1,
    HL4030152E6: 4,
    L5220401C: 0.12,
    HL23003N: 16,
    HL5520112E: 16,
    HL3120010L: 0,
    HL3120179B1: null,
    HL4030031G: 0
  };
  light.children.forEach((child) => {
    const remark = Formula.computeRemark(child.remark, scope);
    assert.strictEqual(remark.ok, true, child.code + " " + (remark.error || ""));
    const multiplier = remark.value === "" ? null : remark.value;
    const qty = multiplier == null ? null : Calc.cleanNumber(Number(child.qty) * multiplier);
    assert.strictEqual(qty, expected[child.code], child.code);
  });
});

test("LF71S spliced lamp quantities", () => {
  const scope = { LHLB: "LF71S", LENGTH: 2000, N1LF18: 0, N1LF71S: 4, BB: 2500 };
  const byCode = {};
  light.children.forEach((child) => {
    const remark = Formula.computeRemark(child.remark, scope);
    assert.strictEqual(remark.ok, true, remark.error);
    byCode[child.code] = remark.value === "" ? null : Calc.cleanNumber(Number(child.qty) * remark.value);
  });
  assert.strictEqual(byCode.HL3120179B, null);
  assert.strictEqual(byCode.HL4030031F, 2);
  assert.strictEqual(byCode.HL23003N, 44);
  assert.strictEqual(byCode.HL3120010L, 4);
  assert.strictEqual(byCode.HL3120179B1, 10);
  assert.strictEqual(byCode.HL4030031G, 2);
});

test("edge light BK/TK formulas", () => {
  const scope = { BK: 1000, TK: 1200 };
  const byCode = {};
  edge.children.forEach((child) => {
    const remark = Formula.computeRemark(child.remark, scope);
    assert.strictEqual(remark.ok, true, child.code + " " + remark.error);
    const base = child.qty === "" || child.qty == null ? 1 : Number(child.qty);
    byCode[child.code] = remark.value === "" ? null : Calc.cleanNumber(base * remark.value);
  });
  assert.strictEqual(byCode.HL0230030A, 2);
  assert.strictEqual(byCode.HL0230030C, 2);
  assert.strictEqual(byCode.HL0230030B, 0);
  assert.strictEqual(byCode.HL4030025B12, 4);
  assert.strictEqual(byCode.HL5620201X1, 1);
  assert.strictEqual(byCode.HL5620201X4, 0);
});

function sampleRows() {
  const headers = ["订单号", "母件料号", "系列", "长度", "LF18数量", "LF71S数量", "BB", "BK", "TK"];
  const matrix = [
    ["SO001", "HL0230002C", "LF18", 1500, 2, 0, 0, "", ""],
    ["SO001", "HL0230002C", "LF18", 900, 1, 0, 0, "", ""],
    ["SO002", "HL0230030X", "", "", "", "", "", 1000, 1200],
    ["SO003", "NO-SUCH", "", "", "", "", "", "", ""]
  ];
  return matrix.map((row, index) => {
    const obj = { __row: index + 2 };
    headers.forEach((header, column) => { obj[header] = row[column]; });
    return obj;
  });
}

const profile = {
  parentColumn: "母件料号",
  orderColumn: "订单号",
  params: {
    LHLB: { mode: "column", column: "系列" },
    LENGTH: { mode: "formula", formula: "[长度]" },
    N1LF18: { mode: "column", column: "LF18数量" },
    N1LF71S: { mode: "column", column: "LF71S数量" },
    BB: { mode: "column", column: "BB" },
    BK: { mode: "column", column: "BK" },
    TK: { mode: "column", column: "TK" }
  }
};

test("order match sums the same material inside one order and skips unknown parents", () => {
  const result = Calc.calculate({ boms: [light, edge], rows: sampleRows(), profile, resolution: {} });
  assert.deepStrictEqual(result.conflicts, []);
  assert.deepStrictEqual(result.unmatched, [{ sourceRow: 5, parentCode: "NO-SUCH" }]);
  assert.deepStrictEqual(result.missingParams, []);
  const summed = Calc.aggregate(result.lines, "order");
  const so1 = summed.filter((row) => row.orderNo === "SO001");
  const qty = Object.fromEntries(so1.map((row) => [row.materialCode, row.qty]));
  assert.strictEqual(qty.HL3120179B, 2);
  assert.strictEqual(qty.HL3120179C, 2);
  assert.strictEqual(qty.HL4030031F, 3);
  assert.strictEqual(qty.HL5850206D1, 2);
  assert.strictEqual(qty.HL4030152E6, 4);
  assert.strictEqual(qty.L5220401C, 0.12);
  assert.strictEqual(qty.HL23003N, 21);
  assert.strictEqual(qty.HL5520112E, 21);
  assert.strictEqual(qty.HL3120010L, 0);
  assert.strictEqual(qty.HL3120179B1, null);
  assert.strictEqual(qty.HL4030031G, 0);
  assert.strictEqual(so1[0].parentCode, "HL0230002C");
  const tube = summed.find((row) => row.orderNo === "SO002" && row.materialCode === "HL5620201X1");
  assert.strictEqual(tube.qty, 1);
  const hidden = Calc.filterRows(summed, true).filter((row) => row.orderNo === "SO001");
  assert.ok(hidden.every((row) => row.qty));
  assert.strictEqual(hidden.find((row) => row.materialCode === "HL3120010L"), undefined);
});

test("duplicate parent codes stop for a choice and do not use the latest upload", () => {
  const copy = JSON.parse(JSON.stringify(light));
  copy.id = "light-new";
  copy.uploadedAt = "2099-01-01T00:00:00.000Z";
  const blocked = Calc.calculate({ boms: [light, copy, edge], rows: sampleRows(), profile, resolution: {} });
  assert.strictEqual(blocked.lines.length, 0);
  assert.strictEqual(blocked.conflicts.length, 1);
  assert.strictEqual(blocked.conflicts[0].parentCode, "HL0230002C");
  const chosen = Calc.calculate({
    boms: [light, copy, edge],
    rows: sampleRows(),
    profile,
    resolution: { HL0230002C: "light" }
  });
  assert.strictEqual(chosen.conflicts.length, 0);
  assert.ok(chosen.lines.every((line) => line.parentCode !== "HL0230002C" || line.bomId === "light"));
  const stale = Calc.calculate({
    boms: [light, copy, edge],
    rows: sampleRows(),
    profile,
    resolution: { HL0230002C: { id: "light", signature: "light" } }
  });
  assert.strictEqual(stale.conflicts.length, 1);
});

test("merged row from two parents leaves parent columns blank and keeps one price", () => {
  const other = {
    id: "other",
    parent: { code: "P2", name: "另一母件", spec: "", attr: "", warehouse: "", unit: "PCS", qty: 1, loss: "", remark: "" },
    children: [{ level: "1级子件", code: "HL5850206D1", name: "标签", spec: "", attr: "", warehouse: "", unit: "张", qty: 1, loss: "", remark: 2 }]
  };
  const rows = [
    { __row: 2, 订单号: "SO9", 母件料号: "HL0230002C", 系列: "LF18", 长度: 900, LF18数量: 1, LF71S数量: 0, BB: 0 },
    { __row: 3, 订单号: "SO9", 母件料号: "P2", 系列: "", 长度: "", LF18数量: "", LF71S数量: "", BB: "" }
  ];
  const result = Calc.calculate({ boms: [light, other], rows, profile, resolution: {} });
  const summed = Calc.aggregate(result.lines, "order");
  const label = summed.find((row) => row.materialCode === "HL5850206D1");
  assert.strictEqual(label.qty, 3);
  assert.strictEqual(label.parentCode, "");
  assert.strictEqual(label.parentName, "");
  const priced = Calc.applyMaterials([label], { HL5850206D1: { price: 1.5, name: "标签" } }, true)[0];
  assert.strictEqual(priced.amount, 4.5);
  const plain = Calc.applyMaterials([label], { HL5850206D1: { price: 1.5, name: "标签" } }, false)[0];
  assert.strictEqual(plain.amount, null);
  assert.strictEqual(plain.price, 1.5);
});

test("parameter formula can read other columns on the same order row", () => {
  const custom = JSON.parse(JSON.stringify(profile));
  custom.params.N1LF18 = { mode: "formula", formula: "IF([系列]=\"LF18\",[套数]*2,0)" };
  const rows = [{ __row: 2, 订单号: "SO7", 母件料号: "HL0230002C", 系列: "LF18", 长度: 900, 套数: 3, LF71S数量: 0, BB: 0 }];
  const result = Calc.calculate({ boms: [light], rows, profile: custom, resolution: {} });
  const line = result.lines.find((item) => item.materialCode === "HL3120179B");
  assert.strictEqual(line.qty, 6);
});

test("export projection blanks unchecked parent fields", () => {
  const rows = [{ orderNo: "SO1", parentCode: "P", parentName: "母件名", materialCode: "C", qty: 2, price: 3, amount: 6 }];
  const columns = [
    { header: "单号", field: "orderNo" },
    { header: "母件", field: "parentCode" },
    { header: "名称", field: "parentName" },
    { header: "物料", field: "materialCode" }
  ];
  const projected = Calc.projectRows(rows, columns, ["parentCode"]);
  assert.deepStrictEqual(projected, [["SO1", "P", "", "C"]]);
});

if (!process.exitCode) console.log(passed + " tests passed");
