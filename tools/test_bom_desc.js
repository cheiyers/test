#!/usr/bin/env node
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const parser = require(path.join(__dirname, "../assets/js/parser.js"));

const docs = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/demo.json"), "utf8"));
parser.normalizeDocs(docs);

const list = parser.collectBomDescriptions(docs);
assert.strictEqual(list.length, 21, "unique BOM descriptions");
const residual = list.find((d) => d.description.startsWith("RESIDUAL CURRENT BREAKER"));
assert.ok(residual);
assert.strictEqual(residual.count, 188);
assert.strictEqual(residual.itemCount, 94);
assert.deepStrictEqual(residual.materials, ["KM52255324"]);

const big = docs.find((d) => d.header.poNumber === "4801169630");
const switchItem = big.items.find((it) => (it.bom || []).length);
const led = docs.find((d) => d.header.poNumber === "4801006558").items[0];

const residualVal = parser.bomDescValue(switchItem, "RESIDUAL CURRENT BREAKER 1P+N C6A 30mA");
assert.strictEqual(residualVal, "KM52255324 · 1.000 PC ×2");

const enclosure = parser.bomDescValue(switchItem, "ENCLOSURE, PLASTIC 340x300x132MM");
assert.strictEqual(enclosure, "KM52255244V000 · 1.000 PC");

const terminals = parser.bomDescValue(switchItem, "TERMINAL BLOCK,SAKDU 2.5N");
assert.strictEqual(terminals, "KM51705345 · 5.000 PC");

const label = parser.bomDescValue(switchItem, "LABEL, POSITION AND IDENTIFICATION");
assert.ok(label.includes("KMC1366324C01"));
assert.ok(label.includes("A=20"));
assert.ok(label.includes("C=MR MAINS SWITCH UNIT CN"));
assert.ok(!label.includes("B=-"));

assert.strictEqual(parser.bomDescValue(led, "ENCLOSURE, PLASTIC 340x300x132MM"), "");
assert.strictEqual(parser.bomDescValue(switchItem, "not a real description"), "");
assert.strictEqual(parser.bomDescValue(switchItem, "  enclosure, plastic 340x300x132mm "), enclosure);

console.log("ok bom desc", list.length, residualVal, label);
