#!/usr/bin/env node
const assert = require("assert");
const path = require("path");
const P = require(path.join(__dirname, "../assets/js/display-presets.js"));

const state = {
  viewMode: "nested",
  selectedParentFields: new Set(["po", "material"]),
  selectedBomFields: new Set(["bomPos"]),
  extractKeywords: ["Wire Length"],
  selectedBomDescs: ["ENCLOSURE"],
  columnRules: { "p:po": [{ type: "trim" }] },
  selectedCategories: new Set(["KM||LED"]),
  knownCategories: new Set(["KM||LED", "KM||SW"]),
};

const snap = P.snapshot(state);
assert.deepStrictEqual(snap.parentFields, ["po", "material"]);
assert.strictEqual(snap.viewMode, "nested");
assert.strictEqual(snap.columnRules["p:po"][0].type, "trim");

const other = {
  viewMode: "flat",
  selectedParentFields: new Set(["pos"]),
  selectedBomFields: new Set(),
  extractKeywords: [],
  selectedBomDescs: [],
  columnRules: {},
  selectedCategories: new Set(["KM||SW"]),
  knownCategories: new Set(["KM||LED", "KM||SW"]),
};
P.apply(other, snap, other.knownCategories);
assert.strictEqual(other.viewMode, "nested");
assert.ok(other.selectedParentFields.has("material"));
assert.deepStrictEqual(other.extractKeywords, ["Wire Length"]);
assert.ok(other.selectedCategories.has("KM||LED"));
assert.ok(!other.selectedCategories.has("KM||SW"));

const list = [];
const a = P.addOrUpdate(list, "  主开关  ", snap);
assert.strictEqual(a.updated, false);
assert.strictEqual(list[0].name, "主开关");
const b = P.addOrUpdate(list, "主开关", Object.assign({}, snap, { viewMode: "parent" }));
assert.strictEqual(b.updated, true);
assert.strictEqual(list.length, 1);
assert.strictEqual(list[0].viewMode, "parent");
assert.strictEqual(P.addOrUpdate(list, "  ", snap).error, "empty");

P.updateById(list, list[0].id, Object.assign({}, snap, { viewMode: "flat" }));
assert.strictEqual(list[0].viewMode, "flat");

const renamed = P.rename(list, list[0].id, "灯带");
assert.strictEqual(renamed.id, list[0].id);
assert.strictEqual(list[0].name, "灯带");

const left = P.removeById(list, list[0].id);
assert.strictEqual(left.length, 0);

assert.ok(P.sameSnapshot(snap, P.snapshot(state)));
assert.ok(!P.sameSnapshot(snap, { viewMode: "flat" }));

console.log("ok display presets");
