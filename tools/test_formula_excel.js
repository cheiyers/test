#!/usr/bin/env node
const path = require("path");
const formula = require(path.join(__dirname, "..", "assets/js/formula.js"));

function fail(msg, extra) {
  console.error("FAIL", msg, extra == null ? "" : extra);
  process.exit(1);
}

function eq(expr, expected, ctx) {
  const got = formula.stringify(formula.evaluate(expr, ctx || {}));
  if (got !== String(expected)) fail(expr, JSON.stringify(got) + " expected " + JSON.stringify(expected));
}

function approx(expr, expected, ctx, eps) {
  const raw = formula.evaluate(expr, ctx || {});
  const n = typeof raw === "number" ? raw : Number(formula.stringify(raw));
  if (Math.abs(n - expected) > (eps || 0.001)) fail(expr, n + " expected ~" + expected);
}

const names = formula.functionNames();
if (names.length < 150) fail("too few functions", names.length);

const leaked = formula.extractNames("=IFS(AND(数量>1,OR(ROUNDUP(轿厢宽度,0)>1400,FALSE)),2,TRUE,1)*ABS(数量)");
if (leaked.indexOf("IFS") >= 0 || leaked.indexOf("AND") >= 0 || leaked.indexOf("ROUNDUP") >= 0) fail("fn leaked", leaked);
if (leaked.indexOf("数量") < 0 || leaked.indexOf("轿厢宽度") < 0) fail("vars missing", leaked);

eq("=AND(TRUE,1,TRUE)", "TRUE");
eq("=AND(TRUE,0)", "FALSE");
eq("=OR(FALSE,0,TRUE)", "TRUE");
eq("=NOT(FALSE)", "TRUE");
eq("=XOR(TRUE,TRUE)", "FALSE");
eq("=XOR(TRUE,FALSE)", "TRUE");
eq("=IFS(FALSE,1,TRUE,9)", "9");
eq("=SWITCH(2,1,\"a\",2,\"b\",\"c\")", "b");
eq("=IFERROR(DATEVALUE(\"bad\"),0)", "0");
eq("=IFERROR(1+1,0)", "2");
eq("=IFEMPTY(\"\",\"x\")", "x");
eq("=如果(3>1,\"是\",\"否\")", "是");
eq("=求和(1,2,3)", "6");

eq("=2^3", "8");
eq("=-2^2", "-4");
eq("=50%", "0.5");
eq("=200*10%", "20");
eq("=1.5E2", "150");

eq("=ROUNDUP(1.21,1)", "1.3");
eq("=ROUNDDOWN(1.29,1)", "1.2");
eq("=INT(-1.2)", "-2");
eq("=TRUNC(-1.9)", "-1");
eq("=ABS(-5)", "5");
eq("=SIGN(-8)", "-1");
eq("=MOD(7,3)", "1");
eq("=QUOTIENT(7,3)", "2");
eq("=POWER(2,10)", "1024");
eq("=SQRT(9)", "3");
eq("=SUM(1,2,3,4)", "10");
eq("=PRODUCT(2,3,4)", "24");
eq("=AVERAGE(2,4,6)", "4");
eq("=MIN(9,3,5)", "3");
eq("=MAX(9,3,5)", "9");
eq("=MEDIAN(1,5,3)", "3");
eq("=COUNT(1,\"a\",2)", "2");
eq("=COUNTA(1,\"a\",\"\")", "2");
eq("=COUNTIF(1,2,3,10,\">2\")", "2");
eq("=SUMIF(1,2,10,5,\">3\")", "15");
eq("=LARGE(3,8,1,1)", "8");
eq("=SMALL(3,8,1,2)", "3");
eq("=GCD(24,36)", "12");
eq("=LCM(4,6)", "12");
eq("=COMBIN(5,2)", "10");
eq("=FACT(5)", "120");
eq("=CEILING(2.1,1)", "3");
eq("=FLOOR(2.9,1)", "2");
eq("=MROUND(7,5)", "5");
eq("=EVEN(3)", "4");
eq("=ODD(4)", "5");

approx("=SIN(RADIANS(90))", 1);
approx("=DEGREES(PI())", 180);
eq("=LOG10(1000)", "3");
eq("=LOG(8,2)", "3");

eq("=LEFT(\"ABCDE\",2)", "AB");
eq("=RIGHT(\"ABCDE\",2)", "DE");
eq("=MID(\"ABCDE\",2,3)", "BCD");
eq("=LEN(\"你好\")", "2");
eq("=UPPER(\"ab\")", "AB");
eq("=LOWER(\"AB\")", "ab");
eq("=PROPER(\"foo bar\")", "Foo Bar");
eq("=TRIM(\"  a   b  \")", "a b");
eq("=SUBSTITUTE(\"a-a-a\",\"a\",\"b\",2)", "a-b-a");
eq("=REPLACE(\"abcdef\",2,3,\"XY\")", "aXYef");
eq("=FIND(\"c\",\"abcde\")", "3");
eq("=SEARCH(\"C\",\"abcde\")", "3");
eq("=EXACT(\"a\",\"a\")", "TRUE");
eq("=REPT(\"ab\",3)", "ababab");
eq("=CONCAT(\"A\",1,\"B\")", "A1B");
eq("=TEXTJOIN(\"-\",TRUE,\"a\",\"\",\"b\")", "a-b");
eq("=CHAR(65)", "A");
eq("=CODE(\"A\")", "65");
eq("=TEXTBEFORE(\"a/b/c\",\"/\")", "a");
eq("=TEXTAFTER(\"a/b/c\",\"/\")", "b/c");
eq("=FIXED(1234.5,1,TRUE)", "1234.5");

eq("=DATE(2026,9,16)", "2026-09-16");
eq("=YEAR(DATE(2026,9,16))", "2026");
eq("=MONTH(DATE(2026,9,16))", "9");
eq("=DAY(DATE(2026,9,16))", "16");
eq("=DATEDIF(DATE(2024,1,1),DATE(2026,1,1),\"y\")", "2");
eq("=DAYS(DATE(2026,1,10),DATE(2026,1,1))", "9");
eq("=EOMONTH(DATE(2026,1,15),0)", "2026-01-31");
eq("=EDATE(DATE(2026,1,15),1)", "2026-02-15");
eq("=WEEKDAY(DATE(2026,10,12),2)", "1");
eq("=NETWORKDAYS(DATE(2026,10,12),DATE(2026,10,16))", "5");

eq("=CHOOSE(2,\"a\",\"b\",\"c\")", "b");
eq("=MATCH(9,1,9,8)", "2");
eq("=INDEX(\"a\",\"b\",\"c\",3)", "c");
eq("=VLOOKUP(\"B\",\"A\",1,\"B\",2)", "2");

eq("=ISBLANK(\"\")", "TRUE");
eq("=ISNUMBER(3)", "TRUE");
eq("=ISTEXT(\"x\")", "TRUE");
eq("=ISLOGICAL(TRUE)", "TRUE");
eq("=ISEVEN(4)", "TRUE");
eq("=ISODD(5)", "TRUE");
eq("=ISERROR(NA())", "TRUE");
eq("=IFNA(NA(),0)", "0");
eq("=HEX2DEC(\"FF\")", "255");
eq("=DEC2HEX(255)", "FF");
eq("=BIN2DEC(\"1010\")", "10");
eq("=BITAND(6,3)", "2");
eq("=ROMAN(2026)", "MMXXVI");
eq("=ARABIC(\"XIV\")", "14");
eq("=CONVERT(1,\"m\",\"mm\")", "1000");
eq("=BASE(10,2)", "1010");
eq("=DECIMAL(\"FF\",16)", "255");

approx("=PMT(0.01,12,-1000)", 88.8488, {}, 0.01);
approx("=FV(0.01,12,-100)", 1268.25, {}, 0.2);
eq("=SLN(10000,1000,5)", "1800");
eq("=N(TRUE)", "1");
eq("=TYPE(\"a\")", "2");

const ctx = { 数量: "5", 轿厢宽度: "1,600 mm", 物料描述: "Edge light灯芯" };
eq("=IFS(VALUE({轿厢宽度})>1400,2,TRUE,1)*数量", "10", ctx);
eq("=AND({数量}>3,VALUE({轿厢宽度})>1000)", "TRUE", ctx);
eq("=ROUNDUP(VALUE({轿厢宽度})/1000,0)", "2", ctx);
eq("=IF(OR(FIND(\"灯\",{物料描述})>0,数量>10),数量*2,数量)", "10", ctx);
eq("=CONVERT(VALUE(轿厢宽度),\"mm\",\"m\")", "1.6", ctx);

const r = formula.evaluate("=RAND()", {});
if (typeof r !== "number" || r < 0 || r >= 1) fail("RAND", r);

const unknown = formula.stringify(formula.evaluate("=NOTAFUNC(1)", {}));
if (unknown.indexOf("未知函数") < 0) fail("unknown fn", unknown);

console.log("OK formula excel", names.length, "functions");
