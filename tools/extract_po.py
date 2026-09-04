#!/usr/bin/env python3
"""Extract header + line items from Schindler (迅达) SAP purchase-order PDFs."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import pymupdf

LINE_NO_RE = re.compile(r"^\d{5}$")
PO_GROUP_RE = re.compile(r"^(\d{10})/(\S+)$")
MONEY_RE = re.compile(r"^\d{1,3}(?:,\d{3})*\.\d{2}$")
QTY_RE = re.compile(r"^\d+$")
UNIT_PRICE_RE = re.compile(r"^(\S+)\s+(\d+\.\d{2}/\d+)$")
PRICE_ONLY_RE = re.compile(r"^\d+\.\d{2}(?:/\d+)?$")
UNIT_LIKE_RE = re.compile(r"^(件|个|套|台|只|米|KG|kg|PC|PCE|EA|SET)$", re.I)
SERVICE_UNIT_RE = re.compile(r"^(项|次|式|AU|LE|ACT|LOT|H|HR|MAN)$", re.I)
SERVICE_TEXT_RE = re.compile(r"服务|劳务|service", re.I)
KV_RE = re.compile(r"^([^:：]{1,20})[:：]\s*(.*)$")
KEYWORD_LABELS = (
    "图号/版本",
    "安装国家",
    "成组技术码",
    "运输类型",
    "D/E",
    "产品家族",
    "SCM大小/量纲",
)
KEYWORD_MAP = {
    "图号/版本": "drawingRev",
    "安装国家": "installCountry",
    "成组技术码": "groupTechCode",
    "运输类型": "transportType",
    "D/E": "deFlag",
    "产品家族": "productFamily",
    "SCM大小/量纲": "scmSize",
}
SKIP_TABLE_TEXTS = {
    "行项目",
    "物料号",
    "物料组",
    "物料描述",
    "交货日期",
    "订单数量",
    "单位",
    "未税单价",
    "未税金额CNY]",
    "未税金额[CNY]",
}


def spans_from_page(page) -> list[dict]:
    out = []
    data = page.get_text("dict")
    for block in data.get("blocks", []):
        if block.get("type") != 0:
            continue
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                text = (span.get("text") or "").strip()
                if not text or set(text) <= {"_"}:
                    continue
                x0, y0, x1, y1 = span["bbox"]
                out.append(
                    {
                        "text": text,
                        "x": round(x0, 1),
                        "y": round(y0, 1),
                        "x1": round(x1, 1),
                        "y1": round(y1, 1),
                        "size": round(span.get("size") or 0, 1),
                    }
                )
    out.sort(key=lambda s: (s["y"], s["x"]))
    return out


def group_rows(spans: list[dict], y_tol: float = 3.5) -> list[dict]:
    rows: list[dict] = []
    for span in spans:
        placed = False
        for row in rows:
            if abs(row["y"] - span["y"]) <= y_tol:
                row["spans"].append(span)
                n = len(row["spans"])
                row["y"] = (row["y"] * (n - 1) + span["y"]) / n
                placed = True
                break
        if not placed:
            rows.append({"y": span["y"], "spans": [span]})
    for row in rows:
        row["spans"].sort(key=lambda s: s["x"])
        row["text"] = " ".join(s["text"] for s in row["spans"])
        row["x"] = row["spans"][0]["x"]
    rows.sort(key=lambda r: r["y"])
    return rows


def span_label(text: str) -> str:
    return text.split(":", 1)[0].split("：", 1)[0].strip()


def value_after_label(
    rows: list[dict],
    label: str,
    *,
    x_min: float = 0,
    x_max: float = 9999,
    max_dx: float = 180,
) -> str:
    """Take the value in the same column, immediately to the right of the label."""
    for row in rows:
        for j, span in enumerate(row["spans"]):
            if not (x_min <= span["x"] < x_max):
                continue
            if span_label(span["text"]) != label:
                continue
            m = KV_RE.match(span["text"])
            if m and m.group(2).strip():
                return m.group(2).strip()
            for later in row["spans"][j + 1 :]:
                if later["x"] < span["x"]:
                    continue
                if later["x"] >= x_max:
                    continue
                if later["x"] - span["x1"] > max_dx and later["x"] > span["x"] + 200:
                    continue
                if span_label(later["text"]) != later["text"] and ":" in later["text"]:
                    # hit the next label in the same row
                    continue
                return later["text"].strip()
    return ""


def is_money(text: str) -> bool:
    return bool(MONEY_RE.match(str(text or "").strip()))


def normalize_money(text: str) -> str:
    return str(text or "").replace(",", "").strip()


def find_amount_span(spans: list[dict]) -> dict | None:
    right = [s for s in spans if s["x"] >= 340]
    for s in right:
        if is_money(s["text"]):
            return {"text": normalize_money(s["text"]), "x": s["x"]}
    if right:
        joined = "".join(s["text"] for s in right).replace(" ", "")
        if is_money(joined):
            return {"text": normalize_money(joined), "x": right[0]["x"]}
    return None


def parse_unit_price(text: str) -> tuple[str, str]:
    raw = text.strip()
    m = UNIT_PRICE_RE.match(raw)
    if m:
        return m.group(1), m.group(2)
    if PRICE_ONLY_RE.match(raw):
        return "", raw
    return "", ""


def fill_qty_unit_price(item: dict, spans: list[dict]) -> bool:
    """Fill qty / unit / unitPrice / amount. Handles '件 93.50/1' in one span or split words."""
    qty_span = next((s for s in spans if QTY_RE.match(s["text"]) and 160 <= s["x"] < 220), None)
    amount_span = find_amount_span(spans)
    if not qty_span or not amount_span:
        return False
    if item.get("qty"):
        return True
    item["qty"] = qty_span["text"]
    item["amount"] = amount_span["text"]

    combined = next((s for s in spans if UNIT_PRICE_RE.match(s["text"])), None)
    if combined:
        unit, price = parse_unit_price(combined["text"])
        item["unit"] = unit
        item["unitPrice"] = price
        return True

    unit_span = next(
        (
            s
            for s in spans
            if 200 <= s["x"] < 280
            and (UNIT_LIKE_RE.match(s["text"]) or (not PRICE_ONLY_RE.match(s["text"]) and not QTY_RE.match(s["text"])))
        ),
        None,
    )
    price_span = next(
        (s for s in spans if PRICE_ONLY_RE.match(s["text"]) and 250 <= s["x"] < 360),
        None,
    )
    if unit_span:
        item["unit"] = unit_span["text"]
    if price_span:
        item["unitPrice"] = price_span["text"]
    return True


def fill_kv_fields(item: dict, spans: list[dict]) -> bool:
    """Accept '图号/版本: Z1' or split '图号/版本:' + 'Z1'."""
    found = False
    for i, s in enumerate(spans):
        m = KV_RE.match(s["text"])
        if m and m.group(2).strip():
            found = True
            key, val = m.group(1).strip(), m.group(2).strip()
        elif s["text"].endswith(":") or s["text"].endswith("："):
            key = s["text"].rstrip(":：").strip()
            nxt = next((t for t in spans[i + 1 :] if t["x"] >= s["x"] and not t["text"].endswith((":", "："))), None)
            if not key or not nxt:
                continue
            found = True
            val = nxt["text"].strip()
        else:
            continue
        item["extras"][key] = val
        if key in KEYWORD_MAP:
            item[KEYWORD_MAP[key]] = val
    return found


LEFT = (0, 280)
RIGHT = (280, 9999)


def column_texts(row: dict, x_min: float, x_max: float) -> list[str]:
    return [s["text"] for s in row["spans"] if x_min <= s["x"] < x_max]


def parse_header(rows: list[dict]) -> dict:
    po_raw = value_after_label(rows, "采购订单号/采购组", x_min=0, x_max=280)
    po_number, purchase_group = "", ""
    m = PO_GROUP_RE.match(po_raw.replace(" ", ""))
    if m:
        po_number, purchase_group = m.group(1), m.group(2)
    else:
        parts = po_raw.split("/")
        po_number = parts[0].strip()
        purchase_group = parts[1].strip() if len(parts) > 1 else ""

    supplier_lines = []
    for row in rows:
        if 160 <= row["y"] <= 200:
            right = column_texts(row, 300, 9999)
            if right:
                supplier_lines.append(" ".join(right))

    billing = []
    delivery = []
    in_billing = False
    in_delivery = False
    for row in rows:
        left_t = " ".join(column_texts(row, *LEFT)).strip()
        right_t = " ".join(column_texts(row, *RIGHT)).strip()
        if left_t.startswith("开票抬头"):
            in_billing = True
            left_t = ""
        if right_t.startswith("交货地址"):
            in_delivery = True
            right_t = ""
        if left_t.startswith("你们的参考号") or left_t == "行项目" or row["y"] >= 430:
            in_billing = False
        if right_t.startswith("工厂"):
            in_delivery = False
        if in_billing and left_t:
            billing.append(left_t)
        if in_delivery and right_t:
            delivery.append(right_t)

    delivery_date = ""
    for row in rows:
        for s in row["spans"]:
            if s["y"] < 430 and s["text"].startswith("交货日期:"):
                delivery_date = s["text"].split(":", 1)[-1].strip()

    header = {
        "buyer": next(
            (s["text"] for r in rows for s in r["spans"] if "迅达" in s["text"] and s["y"] < 50),
            "迅达(中国）电梯有限公司",
        ),
        "docType": next((s["text"] for r in rows for s in r["spans"] if s["text"] == "采购订单"), "采购订单"),
        "poNumber": po_number,
        "purchaseGroup": purchase_group,
        "documentDate": value_after_label(rows, "凭证日期", x_min=0, x_max=280),
        "buyerContact": value_after_label(rows, "联系人", x_min=0, x_max=280),
        "buyerPhone": value_after_label(rows, "电话/传真", x_min=0, x_max=280).rstrip(" /"),
        "buyerEmail": value_after_label(rows, "邮箱", x_min=0, x_max=280),
        "supplierContact": value_after_label(rows, "供应商联系人", x_min=0, x_max=280),
        "supplierCode": value_after_label(rows, "供应商", x_min=0, x_max=280),
        "supplierPhone": value_after_label(rows, "电话", x_min=0, x_max=280),
        "supplierName": supplier_lines[0] if supplier_lines else "",
        "supplierAddress": " ".join(supplier_lines[1:]) if len(supplier_lines) > 1 else "",
        "billingTitle": " / ".join(billing),
        "deliveryAddress": " ".join(delivery),
        "plant": "",
        "companyCode": "",
        "paymentTerms": "",
        "incoterms": "",
        "deliveryDate": delivery_date,
        "printDate": "",
        "vatTotal": "",
        "fileNo": "",
        "page": "",
        "electronicallySigned": False,
    }

    for row in rows:
        for s in row["spans"]:
            t = s["text"]
            if t.startswith("工厂:"):
                header["plant"] = t.split(":", 1)[-1].strip()
            elif t.startswith("公司代码:") and s["x"] >= 270:
                header["companyCode"] = t.split(":", 1)[-1].strip()
            elif t.startswith("打印日期:"):
                header["printDate"] = t.split(":", 1)[-1].strip()
            elif t.startswith("文件编号:"):
                header["fileNo"] = t.split(":", 1)[-1].strip()
            elif t.startswith("贸易条款:"):
                header["incoterms"] = t.split(":", 1)[-1].strip()
        right = " ".join(column_texts(row, *RIGHT)).strip()
        if re.search(r"\d+\s*天之内", right) or "到期净值" in right:
            header["paymentTerms"] = right.replace("付款条件:", "").strip()
        joined = row["text"]
        if "不含增值税总价" in joined:
            money = [normalize_money(s["text"]) for s in row["spans"] if is_money(s["text"])]
            if money:
                header["vatTotal"] = money[-1]
            elif not header["vatTotal"]:
                joined = "".join(s["text"] for s in row["spans"] if s["x"] >= 340).replace(" ", "")
                if is_money(joined):
                    header["vatTotal"] = normalize_money(joined)
        if "此文档已电子签名" in joined:
            header["electronicallySigned"] = True
        if row["y"] > 740 and ("页" in joined or re.search(r"\d+\s*/\s*\d+", joined)):
            header["page"] = re.sub(r"^页\s*", "", joined).strip()

    # Contact-block 电话 appears twice; keep the 11-digit supplier mobile.
    if header["supplierPhone"] and not re.fullmatch(r"\d{11}", header["supplierPhone"]):
        for row in rows:
            if 210 <= row["y"] <= 230:
                for s in row["spans"]:
                    if re.fullmatch(r"\d{11}", s["text"]):
                        header["supplierPhone"] = s["text"]

    return header


def service_reason(item: dict) -> str:
    desc = str((item or {}).get("description") or "")
    if SERVICE_TEXT_RE.search(desc):
        return "描述含服务/劳务"
    unit = (item or {}).get("unit") or ""
    if unit and SERVICE_UNIT_RE.match(unit):
        return f"单位为 {unit}"
    return ""


def attach_review_flags(items: list[dict]) -> None:
    for item in items:
        flags = []
        if not item.get("materialNo") and (item.get("description") or item.get("qty") or item.get("amount")):
            flags.append("no-material")
        if service_reason(item):
            flags.append("service")
        item["reviewFlags"] = flags


def collect_warnings(doc: dict) -> list[dict]:
    header = (doc or {}).get("header") or {}
    items = (doc or {}).get("items") or []
    pages = (doc or {}).get("pages") or []
    file_name = (doc or {}).get("file") or ""
    po = header.get("poNumber") or file_name or "PO"
    page_count = doc.get("pageCount") if doc and doc.get("pageCount") else (len(pages) or 1)
    attach_review_flags(items)
    warnings: list[dict] = []

    if page_count > 1:
        warnings.append(
            {
                "type": "cross-page",
                "poNumber": po,
                "file": file_name,
                "message": f"{po} 共 {page_count} 页。跨页续行尚未按整单拼接，请核对行项目、数量和金额是否完整。",
            }
        )
        later = pages[1:]
        later_has_rows = any(
            p and (p.get("itemCount", 0) > 0 or p.get("orphanContinuation") or p.get("hasTable"))
            for p in later
        )
        if later_has_rows and pages and pages[0].get("lastIncomplete"):
            warnings.append(
                {
                    "type": "cross-page",
                    "poNumber": po,
                    "file": file_name,
                    "message": f"{po} 第 1 页末行数量或金额未齐，后续页可能是续行，请对照原件。",
                }
            )

    for item in items:
        line = item.get("lineNo") or "（未知行）"
        no_mat = not item.get("materialNo") and (item.get("description") or item.get("qty") or item.get("amount"))
        if no_mat:
            warnings.append(
                {
                    "type": "no-material",
                    "poNumber": po,
                    "file": file_name,
                    "lineNo": item.get("lineNo") or "",
                    "message": f"{po} 行项目 {line} 没有物料号，可能是文本行或服务类行，请确认后再导出。",
                }
            )
        why = service_reason(item)
        if why:
            warnings.append(
                {
                    "type": "service",
                    "poNumber": po,
                    "file": file_name,
                    "lineNo": item.get("lineNo") or "",
                    "message": f"{po} 行项目 {line} 疑似服务类行（{why}），请核对数量与金额。",
                }
            )
    return warnings


def analyze_line_items(rows: list[dict], header: dict) -> dict:
    start_i = None
    end_i = len(rows)
    for i, row in enumerate(rows):
        if start_i is None and any(s["text"] == "行项目" for s in row["spans"]):
            start_i = i
        if start_i is not None and any("不含增值税总价" in s["text"] for s in row["spans"]):
            end_i = min(end_i, i)
    if start_i is None:
        return {"items": [], "hasTable": False, "orphanContinuation": False, "lastIncomplete": False}
    body = rows[start_i + 1 : end_i]

    items: list[dict] = []
    current = None
    orphan_continuation = False

    def new_item(line_no: str) -> dict:
        extras = {label: "" for label in KEYWORD_LABELS}
        return {
            "lineNo": line_no,
            "materialNo": "",
            "materialGroup": "",
            "description": "",
            "deliveryDate": header.get("deliveryDate") or "",
            "qty": "",
            "unit": "",
            "unitPrice": "",
            "amount": "",
            "drawingRev": "",
            "installCountry": "",
            "groupTechCode": "",
            "transportType": "",
            "deFlag": "",
            "productFamily": "",
            "scmSize": "",
            "extras": extras,
        }

    for row in body:
        spans = [s for s in row["spans"] if s["text"] not in SKIP_TABLE_TEXTS]
        if not spans:
            continue
        first = spans[0]["text"]

        merged = re.match(r"^(\d{5})(\d{6,})$", first)
        if merged and spans[0]["x"] < 80:
            first = merged.group(1)
            spans = [
                {**spans[0], "text": first},
                {**spans[0], "text": merged.group(2), "x": max(spans[0]["x"] + 40, 85)},
            ] + spans[1:]
        if LINE_NO_RE.match(first) and spans[0]["x"] < 80:
            if current:
                items.append(current)
            current = new_item(first)
            for s in spans[1:]:
                if 80 <= s["x"] < 160:
                    current["materialNo"] = s["text"]
                elif 160 <= s["x"] < 230:
                    current["materialGroup"] = s["text"]
                elif s["x"] >= 230:
                    current["description"] = (current["description"] + " " + s["text"]).strip()
            continue

        if current is None:
            qty_like = any(QTY_RE.match(s["text"]) and 160 <= s["x"] < 220 for s in spans)
            if qty_like or find_amount_span(spans) or (spans[0]["x"] >= 200 and spans[0]["text"]):
                orphan_continuation = True
            continue

        if fill_qty_unit_price(current, spans):
            continue

        if fill_kv_fields(current, spans):
            continue

        if spans[0]["x"] >= 200:
            extra = " ".join(s["text"] for s in spans).strip()
            if extra:
                current["description"] = (current["description"] + " " + extra).strip()

    if current:
        items.append(current)
    last = items[-1] if items else None
    return {
        "items": items,
        "hasTable": True,
        "orphanContinuation": orphan_continuation,
        "lastIncomplete": bool(last and (not last.get("qty") or not last.get("amount"))),
    }


def parse_line_items(rows: list[dict], header: dict) -> list[dict]:
    items = analyze_line_items(rows, header)["items"]
    attach_review_flags(items)
    return items


def parse_pdf(path: str | Path) -> dict:
    path = Path(path)
    doc = pymupdf.open(path)
    pages = []
    all_items = []
    header = {}
    for i, page in enumerate(doc):
        spans = spans_from_page(page)
        rows = group_rows(spans)
        page_header = parse_header(rows)
        if i == 0:
            header = page_header
        analyzed = analyze_line_items(rows, page_header)
        all_items.extend(analyzed["items"])
        pages.append(
            {
                "page": i + 1,
                "itemCount": len(analyzed["items"]),
                "hasTable": analyzed["hasTable"],
                "orphanContinuation": analyzed["orphanContinuation"],
                "lastIncomplete": analyzed["lastIncomplete"],
            }
        )
        if page_header.get("vatTotal"):
            header["vatTotal"] = page_header["vatTotal"]
    attach_review_flags(all_items)
    result = {
        "file": path.name,
        "pageCount": len(doc),
        "header": header,
        "items": all_items,
        "pages": pages,
    }
    result["warnings"] = collect_warnings(result)
    return result


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdfs", nargs="+")
    ap.add_argument("-o", "--output", default="-")
    args = ap.parse_args()
    docs = [parse_pdf(p) for p in args.pdfs]
    payload = {"documents": docs}
    text = json.dumps(payload, ensure_ascii=False, indent=2)
    if args.output == "-":
        print(text)
    else:
        Path(args.output).write_text(text, encoding="utf-8")


if __name__ == "__main__":
    main()
