#!/usr/bin/env python3
"""Golden-file checks for the three Schindler sample POs."""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

from extract_po import fill_qty_unit_price, parse_pdf  # noqa: E402

SAMPLES = ROOT / "samples"

EXPECTED = {
    "PO_4551750005.pdf": {
        "poNumber": "4551750005",
        "documentDate": "2026/08/31",
        "purchaseGroup": "T0M",
        "supplierName": "苏州海联成套电器设备有限公司",
        "supplierCode": "1372010",
        "deliveryAddress": "上海 嘉定区兴顺路588号",
        "deliveryDate": "2026/09/09",
        "paymentTerms": "90 天之内 到期净值",
        "vatTotal": "467.50",
        "items": [
            {
                "lineNo": "00010",
                "materialNo": "57668963",
                "materialGroup": "XH",
                "description": "Round spot 4LED照明",
                "qty": "5",
                "unit": "件",
                "unitPrice": "93.50/1",
                "amount": "467.50",
                "drawingRev": "Z57668961+0+000",
                "groupTechCode": "MECH",
                "scmSize": "按照实物",
                "installCountry": "",
                "transportType": "",
                "deFlag": "",
                "productFamily": "",
            }
        ],
    },
    "PO_4551750009.pdf": {
        "poNumber": "4551750009",
        "purchaseGroup": "T0M",
        "supplierName": "苏州海联成套电器设备有限公司",
        "deliveryDate": "2026/09/15",
        "vatTotal": "193.20",
        "items": [
            {
                "lineNo": "00010",
                "materialNo": "57664581",
                "description": "LED方型灯",
                "qty": "4",
                "unit": "件",
                "unitPrice": "48.30/1",
                "amount": "193.20",
                "drawingRev": "E57664581+2+000/M57664581+1+000/M57664582+2+000/Q57664581+2+000",
            }
        ],
    },
    "PO_two_lines.pdf": {
        "poNumber": "4551750099",
        "supplierName": "苏州海联成套电器设备有限公司",
        "deliveryDate": "2026/09/20",
        "vatTotal": "660.70",
        "items": [
            {
                "lineNo": "00010",
                "materialNo": "57668963",
                "description": "Round spot 4LED照明 含安装附件",
                "qty": "5",
                "amount": "467.50",
                "drawingRev": "Z57668961+0+000",
            },
            {
                "lineNo": "00020",
                "materialNo": "57664581",
                "description": "LED方型灯",
                "qty": "4",
                "amount": "193.20",
                "drawingRev": "E57664581+2+000",
            },
        ],
    },
    "PO_4551787546.pdf": {
        "poNumber": "4551787546",
        "documentDate": "2026/09/02",
        "purchaseGroup": "T0M",
        "deliveryDate": "2026/09/11",
        "vatTotal": "1402.50",
        "items": [
            {
                "lineNo": "00010",
                "materialNo": "57668963",
                "description": "Round spot 4LED照明",
                "qty": "15",
                "unit": "件",
                "unitPrice": "93.50/1",
                "amount": "1402.50",
                "drawingRev": "Z57668961+0+000",
                "groupTechCode": "MECH",
            }
        ],
    },
    "PO_4551794879.pdf": {
        "poNumber": "4551794879",
        "documentDate": "2026/09/02",
        "purchaseGroup": "T84",
        "deliveryDate": "2026/09/14",
        "vatTotal": "1274.76",
        "items": [
            {
                "lineNo": "00010",
                "materialNo": "57680105",
                "description": "Line灯组件-4000K",
                "qty": "18",
                "unit": "件",
                "unitPrice": "70.82/1",
                "amount": "1274.76",
                "drawingRev": "L57680105(57680105)+0+000",
            }
        ],
    },
    "PO_4551750012.pdf": {
        "poNumber": "4551750012",
        "deliveryDate": "2026/09/08",
        "vatTotal": "187.00",
        "items": [
            {
                "lineNo": "00010",
                "materialNo": "57668963",
                "description": "Round spot 4LED照明",
                "qty": "2",
                "unitPrice": "93.50/1",
                "amount": "187.00",
            }
        ],
    },
    "PO_4551787549.pdf": {
        "poNumber": "4551787549",
        "documentDate": "2026/09/02",
        "purchaseGroup": "T0M",
        "deliveryDate": "2026/09/08",
        "vatTotal": "144.10",
        "electronicallySigned": True,
        "items": [
            {
                "lineNo": "00010",
                "materialNo": "C57647479-002",
                "description": "整流器",
                "qty": "1",
                "unit": "件",
                "unitPrice": "47.50/1",
                "amount": "47.50",
                "drawingRev": "L57647479(C57647479-002)+0+000",
                "deliveryDate": "2026/09/08",
            },
            {
                "lineNo": "00020",
                "materialNo": "57664581",
                "description": "LED方型灯",
                "qty": "2",
                "unit": "件",
                "unitPrice": "48.30/1",
                "amount": "96.60",
                "deliveryDate": "2026/09/08",
            },
        ],
    },
}


def check_subset(actual: dict, expected: dict, prefix: str) -> list[str]:
    errors = []
    for key, want in expected.items():
        if key == "items":
            if len(actual["items"]) != len(want):
                errors.append(f"{prefix} item count {len(actual['items'])} != {len(want)}")
                continue
            for i, item_want in enumerate(want):
                errors.extend(check_subset(actual["items"][i], item_want, f"{prefix} item[{i}]"))
            continue
        got = actual.get(key, actual.get("header", {}).get(key))
        if got != want:
            errors.append(f"{prefix} {key}: {got!r} != {want!r}")
    return errors


def main() -> int:
    errors = []
    for name, expected in EXPECTED.items():
        path = SAMPLES / name
        if not path.exists():
            errors.append(f"missing sample {path}")
            continue
        doc = parse_pdf(path)
        merged = {"header": doc["header"], "items": doc["items"], **doc["header"]}
        errors.extend(check_subset(merged, expected, name))
        amount_sum = sum(float(i["amount"]) for i in doc["items"])
        total = float(doc["header"]["vatTotal"])
        if abs(amount_sum - total) > 0.001:
            errors.append(f"{name} amount sum {amount_sum} != vatTotal {total}")
        for item in doc["items"]:
            extras = item.get("extras") or {}
            for key in (
                "图号/版本",
                "安装国家",
                "成组技术码",
                "运输类型",
                "D/E",
                "产品家族",
                "SCM大小/量纲",
            ):
                if key not in extras:
                    errors.append(f"{name} missing extras[{key}]")
        if doc.get("pageCount", 1) <= 1 and doc.get("warnings"):
            errors.append(f"{name} unexpected warnings {doc['warnings']}")
        if name == "PO_4551787549.pdf":
            types = {w.get("type") for w in (doc.get("warnings") or [])}
            if "cross-page" not in types:
                errors.append(f"{name} missing cross-page warning {doc.get('warnings')}")
            if "页" in (doc["items"][0].get("description") or ""):
                errors.append(f"{name} footer leaked into description {doc['items'][0]}")
        for item in doc["items"]:
            if item.get("reviewFlags"):
                errors.append(f"{name} unexpected reviewFlags {item.get('lineNo')} {item.get('reviewFlags')}")
        if name == "PO_two_lines.pdf":
            extras0 = doc["items"][0].get("extras") or {}
            extras1 = doc["items"][1].get("extras") or {}
            if extras0.get("颜色") != "黑色":
                errors.append(f"{name} item0 颜色 {extras0.get('颜色')!r}")
            if extras1.get("颜色") != "银色":
                errors.append(f"{name} item1 颜色 {extras1.get('颜色')!r}")
            if extras1.get("表面处理") != "喷塑":
                errors.append(f"{name} item1 表面处理 {extras1.get('表面处理')!r}")
    split_item = {
        "qty": "",
        "unit": "",
        "unitPrice": "",
        "amount": "",
    }
    fill_qty_unit_price(
        split_item,
        [
            {"text": "5", "x": 179.2},
            {"text": "件", "x": 226.8},
            {"text": "93.50/1", "x": 287.6},
            {"text": "467.50", "x": 367.6},
        ],
    )
    if split_item["unit"] != "件" or split_item["unitPrice"] != "93.50/1":
        errors.append(f"split unit/price {split_item}")
    comma_item = {"qty": "", "unit": "", "unitPrice": "", "amount": ""}
    fill_qty_unit_price(
        comma_item,
        [
            {"text": "15", "x": 174.2},
            {"text": "件         93.50/1", "x": 226.8},
            {"text": "1,402.50", "x": 357.6},
        ],
    )
    if comma_item["qty"] != "15" or comma_item["amount"] != "1402.50" or comma_item["unit"] != "件":
        errors.append(f"comma amount {comma_item}")

    if errors:
        print("FAIL")
        for e in errors:
            print(" -", e)
        return 1
    print(f"OK {len(EXPECTED)} documents")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
