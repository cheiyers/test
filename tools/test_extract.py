#!/usr/bin/env python3
"""Golden-file checks for the three Schindler sample POs."""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

from extract_po import parse_pdf  # noqa: E402

SAMPLES = ROOT / "samples"

EXPECTED = {
    "PO_4551750005.pdf": {
        "poNumber": "4551750005",
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
        if name == "PO_two_lines.pdf":
            extras0 = doc["items"][0].get("extras") or {}
            extras1 = doc["items"][1].get("extras") or {}
            if extras0.get("颜色") != "黑色":
                errors.append(f"{name} item0 颜色 {extras0.get('颜色')!r}")
            if extras1.get("颜色") != "银色":
                errors.append(f"{name} item1 颜色 {extras1.get('颜色')!r}")
            if extras1.get("表面处理") != "喷塑":
                errors.append(f"{name} item1 表面处理 {extras1.get('表面处理')!r}")
    if errors:
        print("FAIL")
        for e in errors:
            print(" -", e)
        return 1
    print(f"OK {len(EXPECTED)} documents")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
