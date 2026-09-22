#!/usr/bin/env python3
"""Extract KONE purchase-order headers, line items, specs and BOM from PDFs."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import pymupdf

LINE_RE = re.compile(
    r"^(\d+)\s+(?:([A-Z][A-Z0-9._-]{3,})\s+)?"
    r"(\d{2}\.\d{2}\.\d{4})"
    r"(?:\s+(\d{2}\.\d{2}\.\d{4}))?\s+(\d+)\s*PC\s+([\d,.]+)\s+([\d,.]+)$"
)
BOM_RE = re.compile(r"^\.1\s+(\d{4})\s+(KM[A-Z0-9]+)\s+([\d,.]+)\s+PC$")
DATE_RE = re.compile(r"\d{2}\.\d{2}\.\d{4}")
CONTACT_RE = re.compile(r"([A-Za-z]+,[A-Za-z]+)")
REMARK_RE = re.compile(r"Remarks line\s+(\d+)\s+([A-Za-z])\s*=\s*(.*)$")


def apply_remark(bom: dict, line: str) -> None:
    bom.setdefault("remarks", []).append(line)
    bom.setdefault("remarkFields", {})
    m = REMARK_RE.search(line.strip())
    if m:
        bom["remarkFields"][m.group(2).upper()] = m.group(3).strip()



def words_to_lines(words, y_tol: float = 3.0):
    rows = []
    for word in words:
        x0, y0, x1, y1, text, *_ = word
        if not text.strip():
            continue
        placed = False
        for row in rows:
            if abs(row["y"] - y0) <= y_tol:
                row["words"].append((x0, x1, text))
                n = len(row["words"])
                row["y"] = (row["y"] * (n - 1) + y0) / n
                placed = True
                break
        if not placed:
            rows.append({"y": y0, "words": [(x0, x1, text)]})
    rows.sort(key=lambda r: r["y"])
    lines = []
    for row in rows:
        ws = sorted(row["words"], key=lambda t: t[0])
        lines.append(
            {
                "y": row["y"],
                "x0": ws[0][0],
                "x1": ws[-1][1],
                "text": " ".join(t[2] for t in ws),
                "words": ws,
            }
        )
    return lines


def page_lines(page):
    return words_to_lines(page.get_text("words"))


def content_band(lines):
    header_y = None
    footer_y = 690.0
    for ln in lines:
        if (ln["text"].startswith("Pos.") and "Material" in ln["text"]) or (
            "项目.物料" in re.sub(r"\s+", "", ln["text"])
            or "项目物料" in re.sub(r"\s+", "", ln["text"])
        ):
            header_y = ln["y"]
        if (
            "TOTAL AMOUNT" in ln["text"]
            or "\u603b\u91d1\u989d" in ln["text"]
            or ln["text"].startswith("\u8d26\u53f7:")
        ):
            footer_y = min(footer_y, ln["y"] - 2)
        if ln["text"].startswith("1.") and "Please acknowledge" in ln["text"]:
            footer_y = min(footer_y, ln["y"] - 2)
    content = []
    for ln in lines:
        if header_y is not None and ln["y"] <= header_y + 2:
            continue
        if ln["y"] >= footer_y:
            continue
        content.append(ln)
    return content


def column_text(ln, x_min=0, x_max=9999) -> str:
    parts = [text for x0, x1, text in ln["words"] if x_min <= x0 < x_max]
    return " ".join(parts).strip()


def parse_header(doc) -> dict:
    lines = page_lines(doc[0])
    header = {
        "company": "KONE Elevators Co. Ltd.",
        "companyZh": "\u901a\u529b\u7535\u68af\u6709\u9650\u516c\u53f8",
        "docType": "Purchase order",
        "poNumber": "",
        "purchaseOrderNo": "",
        "quotationNo": "",
        "serviceOrderNo": "",
        "vendorName": "",
        "vendorNameEn": "",
        "vendorAddress": "",
        "buyerName": "\u901a\u529b\u7535\u68af\u6709\u9650\u516c\u53f8",
        "vatNo": "",
        "deliveryAddress": "",
        "buyerContact": "",
        "supplierNumber": "",
        "date": "",
        "datePrinted": "",
        "termsOfPayment": "",
        "currency": "RMB",
        "totalAmount": "",
        "tel": "",
    }
    full = "\n".join(ln["text"] for ln in lines)
    header.update(extract_order_ids(full))
    m = re.search(r"VAT No:\s*(\S+)", full)
    if m:
        header["vatNo"] = m.group(1)
    m = re.search(r"Tel:\s*(\d+)", full)
    if m:
        header["tel"] = m.group(1)

    vendor, buyer, delivery = [], [], []
    mode = None
    for ln in lines:
        left = column_text(ln, 0, 280)
        right = column_text(ln, 280, 9999)
        left_key = compact_text(left)
        line_key = compact_text(ln["text"])
        if "Seller/Vendor" in left or "卖方(乙方)" in left_key:
            mode = "vendor"
            continue
        if left == "Buyer" or left.startswith("Buyer") or "买方(甲方)" in left_key:
            mode = "buyer"
            continue
        if (
            left.startswith("Delivery address")
            or left_key.startswith("交货/项目地址")
            or left_key.startswith("交货地址")
        ):
            mode = "delivery"
            continue
        if (left.startswith("Pos.") and "Material" in ln["text"]) or "项目.物料" in line_key or "项目物料" in line_key:
            break
        if (
            left.startswith("Quotation")
            or left.startswith("采购订单号")
            or left.startswith("报价单号")
            or left.startswith("服务订单号")
        ):
            mode = None
            continue
        if "Shipping Instruction" in left:
            left = left.replace("Shipping Instruction", "").strip()
            if not left:
                continue
        if mode == "vendor" and left:
            vendor.append(left)
        elif mode == "buyer" and left and not left.startswith("VAT"):
            buyer.append(left)
        elif mode == "delivery" and left:
            delivery.append(left)
        if "\u5230\u671f\u51c0\u503c" in right or "\u5929\u4e4b\u5185" in right:
            header["termsOfPayment"] = right

    if vendor:
        header["vendorName"] = vendor[0]
        en = [
            t
            for t in vendor[1:]
            if re.search(r"[A-Za-z]", t) and t not in ("CHINA",) and not t.startswith("Tel:") and not t.startswith("电话")
        ]
        zh_rest = [t for t in vendor[1:] if t not in en and not t.startswith("Tel:") and not t.startswith("电话")]
        header["vendorNameEn"] = " ".join(en)
        header["vendorAddress"] = " ".join(zh_rest)
    if buyer:
        header["buyerName"] = buyer[0]
    header["deliveryAddress"] = " / ".join(delivery)

    dates = []
    for ln in lines:
        if ln["y"] < 110:
            dates.extend(DATE_RE.findall(column_text(ln, 280, 9999)))
    dates = list(dict.fromkeys(dates))
    if dates:
        header["date"] = dates[0]
        header["datePrinted"] = dates[-1]

    for ln in lines:
        right = column_text(ln, 280, 9999)
        if 100 < ln["y"] < 130:
            m = CONTACT_RE.search(right)
            if m:
                header["buyerContact"] = m.group(1)
            m = re.search(r"\d{8}", right)
            if m:
                header["supplierNumber"] = m.group(0)

    header["totalAmount"] = extract_total_amount(lines)
    return header


def compact_text(s: str) -> str:
    return re.sub(r"\s+", "", (s or "").replace("（", "(").replace("）", ")"))


def extract_order_ids(full: str) -> dict:
    ids = {
        "poNumber": "",
        "purchaseOrderNo": "",
        "quotationNo": "",
        "serviceOrderNo": "",
    }
    for t in (full or "", compact_text(full)):
        m = re.search(r"采购订单号\s*[:：]\s*([A-Za-z0-9_-]+)", t)
        if m and not ids["purchaseOrderNo"]:
            ids["purchaseOrderNo"] = m.group(1)
        m = re.search(r"采购单号\s*[:：]\s*(\d{7,})", t)
        if m and not ids["poNumber"]:
            ids["poNumber"] = m.group(1)
        m = re.search(r"No\.\s*(\d{7,})", t)
        if m and not ids["poNumber"]:
            ids["poNumber"] = m.group(1)
        m = re.search(r"报价单号\s*[:：]\s*([A-Za-z0-9_-]+)", t)
        if m and not ids["quotationNo"]:
            ids["quotationNo"] = m.group(1)
        m = re.search(r"服务订单号\s*[:：]\s*(\d+)", t)
        if m and not ids["serviceOrderNo"]:
            ids["serviceOrderNo"] = m.group(1)
    return ids


def extract_total_amount(lines) -> str:
    for i, ln in enumerate(lines):
        t = ln["text"]
        if "TOTAL AMOUNT" not in t and "总金额" not in t and "币别" not in t:
            continue
        for cand in lines[i : i + 4]:
            cleaned = re.sub(r"\d{2}\.\d{2}\.\d{4}", " ", cand["text"])
            m = re.search(r"([\d,]+\.\d{2})", cleaned)
            if m:
                return m.group(1)
    for ln in reversed(lines):
        if ln["y"] <= 680:
            continue
        if re.search(r"\d{2}\.\d{2}\.\d{4}", ln["text"]):
            continue
        m = re.search(r"([\d,]+\.\d{2})", ln["text"])
        if m:
            return m.group(1)
    return ""


def match_order_line(text: str) -> dict | None:
    t_norm = re.sub(r"\s+", " ", (text or "").strip())
    m = LINE_RE.match(t_norm)
    if not m:
        return None
    return {
        "pos": m.group(1),
        "material": m.group(2) or "",
        "arrDate": m.group(3),
        "reqShippingDate": m.group(4) or "",
        "qty": int(m.group(5)),
        "unit": "PC",
        "price": m.group(6),
        "amount": m.group(7),
    }


def split_spec(ln) -> dict | None:
    key_parts, code_parts, value_parts = [], [], []
    for x0, x1, text in ln["words"]:
        if x0 < 250:
            key_parts.append(text)
        elif x0 < 348:
            code_parts.append(text)
        else:
            value_parts.append(text)
    key = " ".join(key_parts).strip().strip('"')
    code = " ".join(code_parts).strip()
    value = " ".join(value_parts).strip()
    if not key:
        return None
    spec = {"key": key, "value": value or code}
    if code and value:
        spec["code"] = code
        spec["value"] = value
    return spec


def parse_items(doc) -> list[dict]:
    all_lines = []
    for i, page in enumerate(doc):
        for ln in content_band(page_lines(page)):
            row = dict(ln)
            row["page"] = i + 1
            all_lines.append(row)

    items = []
    current = None
    pending_bom_desc = False

    def flush():
        nonlocal current, pending_bom_desc
        if current:
            items.append(current)
        current = None
        pending_bom_desc = False

    for ln in all_lines:
        t_norm = re.sub(r"\s+", " ", ln["text"].strip())
        m = match_order_line(t_norm)
        if m:
            flush()
            current = {
                "pos": m["pos"],
                "material": m["material"],
                "arrDate": m["arrDate"],
                "reqShippingDate": m["reqShippingDate"],
                "qty": m["qty"],
                "unit": m["unit"],
                "price": m["price"],
                "amount": m["amount"],
                "description": "",
                "salesOrderRef": "",
                "projectRef": "",
                "shippingInstruction": "",
                "rev": "",
                "specs": [],
                "bom": [],
                "page": ln["page"],
            }
            continue
        if current is None:
            continue
        if t_norm.startswith("Sales order ref."):
            current["salesOrderRef"] = t_norm.replace("Sales order ref.", "").strip()
            continue
        if t_norm.startswith("Project ref."):
            current["projectRef"] = t_norm.replace("Project ref.", "").strip()
            continue
        if t_norm.startswith("Shipping instruction:"):
            current["shippingInstruction"] = t_norm.split(":", 1)[1].strip()
            continue
        if t_norm.startswith("REV#:"):
            current["rev"] = t_norm.replace("REV#:", "").strip()
            continue
        if t_norm in (".",):
            continue
        bm = BOM_RE.match(t_norm)
        if bm:
            current["bom"].append(
                {
                    "pos": bm.group(1),
                    "material": bm.group(2),
                    "qty": bm.group(3),
                    "unit": "PC",
                    "description": "",
                    "remarks": [],
                    "remarkFields": {},
                }
            )
            pending_bom_desc = True
            continue
        if re.match(r"^\.1\s+0000$", t_norm) or t_norm.startswith("item:"):
            continue
        if current["bom"] and t_norm.startswith("Remarks line"):
            apply_remark(current["bom"][-1], t_norm)
            pending_bom_desc = True
            continue
        if pending_bom_desc and current["bom"]:
            current["bom"][-1]["description"] = (
                current["bom"][-1]["description"] + " " + t_norm
            ).strip()
            pending_bom_desc = False
            continue
        if "/" in t_norm and t_norm.endswith("PC") and not current["description"]:
            current["description"] = t_norm.rsplit("/", 1)[0].strip()
            continue
        spec = split_spec(ln)
        if spec:
            if spec["key"].startswith("Remarks line"):
                if current["bom"]:
                    apply_remark(current["bom"][-1], t_norm)
                continue
            current["specs"].append(spec)
        elif not current["description"] and t_norm and not t_norm.startswith("."):
            current["description"] = t_norm
    flush()
    return items


def parse_pdf(path: Path) -> dict:
    doc = pymupdf.open(path)
    header = parse_header(doc)
    items = parse_items(doc)
    total = round(sum(float(it["amount"].replace(",", "")) for it in items), 2)
    return {
        "file": path.name,
        "pages": doc.page_count,
        "header": header,
        "itemCount": len(items),
        "sumAmount": total,
        "items": items,
    }


def main():
    parser = argparse.ArgumentParser(description="Extract KONE PO line items")
    parser.add_argument("pdfs", nargs="+", type=Path)
    parser.add_argument("-o", "--output", type=Path, default=Path("data/demo.json"))
    args = parser.parse_args()
    results = [parse_pdf(p) for p in args.pdfs]
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(results, ensure_ascii=False), encoding="utf-8")
    for r in results:
        h = r["header"]
        print(
            f"{h['poNumber']}: {r['itemCount']} lines, "
            f"sum={r['sumAmount']} header={h['totalAmount']} "
            f"vendor={h['vendorName']} contact={h['buyerContact']} date={h['date']}"
        )


if __name__ == "__main__":
    main()
