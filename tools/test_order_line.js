#!/usr/bin/env node
const assert = require("assert");
const path = require("path");
const parser = require(path.join(__dirname, "../assets/js/parser.js"));

const withMat = parser.matchOrderLine("10 KM52261089 02.09.2026 1 PC 21.50 21.50");
assert.strictEqual(withMat.material, "KM52261089");
assert.strictEqual(withMat.pos, "10");

const blank = parser.matchOrderLine("20 02.09.2026 1 PC 21.50 21.50");
assert.strictEqual(blank.pos, "20");
assert.strictEqual(blank.material, "");
assert.strictEqual(blank.arrDate, "02.09.2026");
assert.strictEqual(blank.amount, "21.50");

assert.ok(parser.matchOrderLine("10 KM52343954V000 18.08.2026 8 PC 12.53 100.27").material.startsWith("KM"));
assert.strictEqual(parser.matchOrderLine("hello"), null);

const zh = parser.extractOrderIds(
  "采购单号: 4801154682\n采购订单号:PO202624V35\n报价单号:QUO-HF-2026-04653"
);
assert.strictEqual(zh.poNumber, "4801154682");
assert.strictEqual(zh.purchaseOrderNo, "PO202624V35");
assert.strictEqual(parser.extractOrderIds("No. 4801006558").poNumber, "4801006558");

console.log("ok order line and PO ids");
