#!/usr/bin/env node
const assert = require("assert");
const path = require("path");
const F = require(path.join(__dirname, "../assets/js/map-formula.js"));
const M = require(path.join(__dirname, "../assets/js/export-map.js"));

function ctxFrom(cols) {
  const letters = {};
  const names = {};
  cols.forEach((c, i) => {
    letters[M.colLetter(i)] = c;
    names[c.name] = c;
  });
  function valueAt(i) {
    if (i < 0 || i >= cols.length) return "#REF!";
    return cols[i].v;
  }
  return {
    thisValue: cols[0] ? cols[0].v : "",
    valueAt,
    valueByName: (n) => {
      const hit = cols.find((c) => c.name === n);
      return hit ? hit.v : "#REF!";
    },
  };
}

function ev(formula, cols) {
  return F.evaluate(formula, ctxFrom(cols || [{ name: "A", v: "KM1" }]));
}

assert.strictEqual(ev('IF(A="KM1","是","否")', [{ v: "KM1" }]), "是");
assert.strictEqual(ev('IF(A="KM1","是","否")', [{ v: "KM2" }]), "否");
assert.strictEqual(
  ev('IF(A="",IF(B="","都空",B),A)', [
    { v: "" },
    { v: "备" },
  ]),
  "备"
);
assert.strictEqual(
  ev('IF(AND(A<>"",NUM(C)>1),CONCAT(A,"×",C),IFEMPTY(B,"—"))', [
    { v: "KM1" },
    { v: "" },
    { v: "2 PC" },
  ]),
  "KM1×2 PC"
);
assert.strictEqual(F.displayValue(ev("1+2*3")), "7");
assert.strictEqual(ev('"A"&"-"&B', [{ v: "x" }, { v: "y", name: "B" }]), "A-y");
assert.strictEqual(ev('COL("品名")', [{ v: "KM", name: "物料" }, { v: "灯", name: "品名" }]), "灯");
assert.strictEqual(ev("[品名]", [{ v: "KM", name: "物料" }, { v: "灯", name: "品名" }]), "灯");
assert.strictEqual(ev("THIS()", [{ v: "本列" }]), "本列");
assert.strictEqual(ev('IFEMPTY(A,"缺")', [{ v: "  " }]), "缺");
assert.strictEqual(ev('IFS(A="灯","L",A="开关","S",TRUE,"其他")', [{ v: "开关" }]), "S");
assert.strictEqual(ev('SWITCH(A,"灯","L","开关","S","其他")', [{ v: "x" }]), "其他");
assert.strictEqual(ev("LEFT(A,2)", [{ v: "KM123" }]), "KM");
assert.strictEqual(ev("RIGHT(A,3)", [{ v: "KM123" }]), "123");
assert.strictEqual(ev("MID(A,3,2)", [{ v: "KM123" }]), "12");
assert.strictEqual(ev('SUBSTITUTE(A,"KM","")', [{ v: "KM123" }]), "123");
assert.strictEqual(ev("ROUND(NUM(A)*1.5,1)", [{ v: "2 PC" }]), 3);
assert.strictEqual(ev("SUM(1,2,3)"), 6);
assert.strictEqual(ev('CONTAINS(A,"LED")', [{ v: "LED STRIP" }]), true);
assert.strictEqual(ev("OR(FALSE, A=\"\")", [{ v: "x" }]), false);
assert.strictEqual(ev("AND(TRUE, A<>\"\")", [{ v: "x" }]), true);
assert.strictEqual(ev("IFERROR(1/0,0)"), 0);
assert.strictEqual(ev('REGEXEXTRACT(A,"[0-9]+")', [{ v: "KM12X" }]), "12");
assert.strictEqual(ev("CHOOSE(2,\"a\",\"b\",\"c\")"), "b");
assert.strictEqual(ev("如果(A=\"\",\"空\",A)", [{ v: "" }]), "空");

const mapped = [
  M.emptyColumn("物料", "p:material"),
  M.emptyColumn("品名", "p:description"),
  M.emptyColumn("数量", "p:qty"),
  Object.assign(M.emptyColumn("备注"), { formula: 'IF(A="", "缺料", CONCAT(A, " · ", B))' }),
];
const rows = [
  { material: "KM1", description: "灯", qty: "2 PC" },
  { material: "", description: "空行", qty: "1" },
];
const getValue = (row, src) => {
  if (src === "p:material") return row.material;
  if (src === "p:description") return row.description;
  if (src === "p:qty") return row.qty;
  return "";
};
const { body } = M.mappedMatrix(rows, mapped, getValue);
assert.strictEqual(body[0][3], "KM1 · 灯");
assert.strictEqual(body[1][3], "缺料");

const cycle = [
  Object.assign(M.emptyColumn("A", "p:material"), { formula: "B" }),
  Object.assign(M.emptyColumn("B"), { formula: "A" }),
];
const cyc = M.mappedMatrix([{ material: "x" }], cycle, getValue);
assert.strictEqual(cyc.body[0][0], "#CYCLE!");

const nestedCol = [
  M.emptyColumn("物料", "p:material"),
  Object.assign(M.emptyColumn("短码"), { formula: "LEFT(A,2)" }),
  Object.assign(M.emptyColumn("标签"), { formula: 'IF(B="KM", UPPER(A), B)' }),
];
const nbody = M.mappedMatrix([{ material: "KM9" }], nestedCol, getValue).body;
assert.strictEqual(nbody[0][1], "KM");
assert.strictEqual(nbody[0][2], "KM9");

console.log("ok map formula");
