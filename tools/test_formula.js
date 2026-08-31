#!/usr/bin/env node
const path = require("path");
const formula = require(path.join(__dirname, "..", "assets/js/formula.js"));

const ctx = {
  数量: "5",
  qty: "5",
  未税单价: "93.50/1",
  unitPrice: "93.50/1",
  未税金额: "467.50",
  amount: "467.50",
  物料描述: "Round spot 4LED照明",
  description: "Round spot 4LED照明",
  图号版本: "Z57668961+0+000",
  "图号/版本": "Z57668961+0+000",
  安装国家: "",
};

const cases = [
  ["{数量}*2", "10"],
  ["={未税金额}*1.13", "528.275"],
  ["=ROUND({未税金额}*1.13, 2)", "528.28"],
  ["{物料描述}&\" / \"&{图号/版本}", "Round spot 4LED照明 / Z57668961+0+000"],
  ["=IF({数量}>3,\"大\",\"小\")", "大"],
  ["=IF({数量}<3,\"大\",\"小\")", "小"],
  ["=LEFT({物料描述},5)", "Round"],
  ["=VALUE({未税单价})", "93.5"],
  ["{安装国家}", ""],
  ["固定文字", "固定文字"],
];

let failed = 0;
cases.forEach(function (pair) {
  const got = formula.stringify(formula.evaluate(pair[0], ctx));
  if (got !== pair[1]) {
    console.log("FAIL", pair[0], "=>", JSON.stringify(got), "expected", JSON.stringify(pair[1]));
    failed++;
  }
});
if (failed) {
  process.exit(1);
}
console.log("OK formula", cases.length);
