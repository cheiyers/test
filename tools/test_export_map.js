#!/usr/bin/env node
const assert = require("assert");
const path = require("path");
const M = require(path.join(__dirname, "../assets/js/export-map.js"));

const sources = [
  { key: "p:po", label: "PO" },
  { key: "p:purchaseOrderNo", label: "采购订单号" },
  { key: "p:material", label: "物料" },
  { key: "p:description", label: "描述" },
  { key: "p:qty", label: "数量" },
  { key: "p:price", label: "单价" },
  { key: "p:amount", label: "金额" },
  { key: "p:projectRef", label: "项目号" },
  { key: "k:Wire Length", label: "Wire Length" },
];

assert.strictEqual(M.guessSource("物料编码", sources), "p:material");
assert.strictEqual(M.guessSource("品名", sources), "p:description");
assert.strictEqual(M.guessSource("数量", sources), "p:qty");
assert.strictEqual(M.guessSource("采购订单号", sources), "p:purchaseOrderNo");
assert.strictEqual(M.guessSource("PO", sources), "p:po");
assert.strictEqual(M.guessSource("Wire Length", sources), "k:Wire Length");
assert.strictEqual(M.guessSource("未知列", sources), "");

const parsed = M.parseTemplateAoa([
  ["出货清单", "", ""],
  ["物料编码", "品名", "数量"],
  ["KM1", "灯", 2],
]);
assert.strictEqual(parsed.headerRow, 2);
assert.deepStrictEqual(parsed.headers, ["物料编码", "品名", "数量"]);
assert.strictEqual(parsed.prefixRows.length, 2);

const cols = M.columnsFromHeaders(parsed.headers, sources);
assert.strictEqual(cols.length, 3);
assert.strictEqual(cols[0].source, "p:material");
assert.strictEqual(cols[1].source, "p:description");
assert.strictEqual(cols[2].source, "p:qty");

cols.push(M.emptyColumn("备注", "const", "核对"));
const rows = [
  { material: "KM1", description: "灯", qty: "2 PC" },
  { material: "KM2", description: "开关", qty: "1 PC" },
];
const getValue = (row, src) => {
  if (src === "p:material") return row.material;
  if (src === "p:description") return row.description;
  if (src === "p:qty") return row.qty;
  return "";
};

const aoa = M.exportAoa(cols, rows, getValue, parsed.prefixRows);
assert.deepStrictEqual(aoa[0], ["出货清单", "", "", ""]);
assert.deepStrictEqual(aoa[1], ["物料编码", "品名", "数量", "备注"]);
assert.deepStrictEqual(aoa[2], ["KM1", "灯", "2 PC", "核对"]);
assert.deepStrictEqual(aoa[3], ["KM2", "开关", "1 PC", "核对"]);

const objects = M.mappedObjects(rows, cols, getValue);
assert.strictEqual(objects[0]["物料编码"], "KM1");
assert.strictEqual(objects[0]["备注"], "核对");

const moved = M.moveColumn(cols, cols[0].id, 1);
assert.strictEqual(moved[0].name, "品名");
assert.strictEqual(moved[1].name, "物料编码");
assert.strictEqual(M.removeColumn(cols, cols[3].id).length, 3);

assert.strictEqual(M.colLetter(0), "A");
assert.strictEqual(M.colLetter(25), "Z");
assert.strictEqual(M.colLetter(26), "AA");

assert.strictEqual(M.ensureExt("出货清单.xlsx", "csv"), "出货清单.csv");
assert.strictEqual(M.ensureExt("a/b/foo.xlsx", "xlsx"), "foo.xlsx");
assert.strictEqual(M.sanitizeFileName('坏:名*.xlsx', "x").includes(":"), false);

const generated = M.columnsFromSources(sources.slice(0, 2));
assert.strictEqual(generated[0].source, "p:po");
assert.strictEqual(generated[0].name, "PO");

const map = M.normalize({ enabled: true, columns: cols, fileName: " 清单 " });
assert.ok(M.hasMapping(map));
assert.strictEqual(map.fileName, "清单");
assert.ok(!M.hasMapping({ enabled: true, columns: [] }));

const utf8csv = Buffer.from("物料编码,品名\nKM1,灯", "utf8");
assert.ok(M.decodeCsvBytes(utf8csv).includes("物料编码"));
const bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), utf8csv]);
assert.ok(M.decodeCsvBytes(bom).startsWith("物料编码"));

const schemes = [];
const added = M.addOrUpdate(schemes, "  出货  ", map);
assert.strictEqual(added.updated, false);
assert.strictEqual(schemes[0].name, "出货");
assert.strictEqual(schemes[0].fileName, "清单");
const other = M.normalize({});
M.apply(other, schemes[0]);
assert.strictEqual(other.fileName, "清单");
assert.ok(M.sameSnapshot(other, schemes[0]));
other.columns[0].name = "改名";
assert.ok(!M.sameSnapshot(other, schemes[0]));
const upd = M.updateById(schemes, schemes[0].id, other);
assert.strictEqual(upd.updated, true);
assert.strictEqual(schemes[0].columns[0].name, "改名");
assert.strictEqual(M.addOrUpdate(schemes, "  ", map).error, "empty");
const again = M.addOrUpdate(schemes, "出货", map);
assert.strictEqual(again.updated, true);
assert.strictEqual(schemes.length, 1);
assert.strictEqual(M.removeById(schemes, schemes[0].id).length, 0);

console.log("ok export map");
