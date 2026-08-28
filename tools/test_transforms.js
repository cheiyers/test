#!/usr/bin/env node
const assert = require("assert");
const path = require("path");
const { applyPipeline, applyStep } = require(path.join(__dirname, "../assets/js/transforms.js"));

assert.strictEqual(applyStep("  ab  ", { type: "trim" }), "ab");
assert.strictEqual(applyPipeline("365712130/6100", [{ type: "split", sep: "/", index: 1 }]), "365712130");
assert.strictEqual(applyPipeline("365712130/6100", [{ type: "split", sep: "/", index: 2 }]), "6100");
assert.strictEqual(applyPipeline("18.08.2026", [{ type: "date" }]), "2026-08-18");
assert.strictEqual(applyPipeline("8 PC", [{ type: "extract", pattern: "\\d+", group: 0 }]), "8");
assert.strictEqual(applyPipeline("48,200", [{ type: "replace", find: ",", to: "", all: true }, { type: "number" }]), "48200");
assert.strictEqual(applyPipeline("KM5234", [{ type: "replace", find: "KM", to: "" }]), "5234");
assert.strictEqual(applyPipeline("led", [{ type: "upper" }, { type: "prefix", text: "#" }]), "#LED");
assert.strictEqual(applyPipeline("A", [{ type: "map", table: "A -> 20\nB=-" }]), "20");
assert.strictEqual(applyPipeline("", [{ type: "default", text: "-" }]), "-");
assert.strictEqual(applyPipeline("ST4 / ST4-Silver", [{ type: "split", sep: " / ", index: 1 }]), "ST4");
console.log("ok transforms");
