#!/usr/bin/env python3
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from extract_po import extract_order_ids, match_order_line

assert match_order_line("10 KM52261089 02.09.2026 1 PC 21.50 21.50")["material"] == "KM52261089"
blank = match_order_line("10 02.09.2026 1 PC 21.50 21.50")
assert blank["pos"] == "10"
assert blank["material"] == ""
assert blank["arrDate"] == "02.09.2026"
assert blank["qty"] == 1
assert blank["amount"] == "21.50"
assert match_order_line("10 KM52343954V000 18.08.2026 8 PC 12.53 100.27")["material"].startswith("KM")
assert match_order_line("not a line") is None

ids = extract_order_ids("采购单号: 4801154682\n采购订单号:PO202624V35\n报价单号:QUO-HF-2026-04653\n服务订单号:100040903")
assert ids["poNumber"] == "4801154682"
assert ids["purchaseOrderNo"] == "PO202624V35"
assert ids["quotationNo"] == "QUO-HF-2026-04653"
assert ids["serviceOrderNo"] == "100040903"
assert extract_order_ids("Purchase order\nNo. 4801006558")["poNumber"] == "4801006558"
split_ids = extract_order_ids("采购单号 : 4801154682\n采购订单号 :PO202624V35")
assert split_ids["poNumber"] == "4801154682"
assert split_ids["purchaseOrderNo"] == "PO202624V35"

out = ROOT / "data" / "_test_extract.json"
pdfs = sorted((ROOT / "samples").glob("*.pdf"))
assert len(pdfs) == 4, pdfs
subprocess.check_call([sys.executable, str(ROOT / "tools" / "extract_po.py"), *[str(p) for p in pdfs], "-o", str(out)])
docs = json.loads(out.read_text(encoding="utf-8"))
expect = {
    "4801006558": (4, 401.08),
    "4801007230": (4, 401.08),
    "4801169630": (254, 51928.13),
    "4801154682": (2, 43.0),
}
got = {d["header"]["poNumber"]: (d["itemCount"], d["sumAmount"]) for d in docs}
assert got == expect, got
for d in docs:
    assert d["header"]["vendorName"], d["header"]
    assert d["header"]["poNumber"]
    first = d["items"][0]
    if d["header"]["poNumber"] == "4801154682":
        assert first["material"] == "KM52261089"
        assert "井道照明" in first["description"]
        assert d["header"]["purchaseOrderNo"] == "PO202624V35"
        assert d["header"]["totalAmount"] == "43.00"
        assert "采购订单号" not in d["header"]["deliveryAddress"]
        continue
    assert first["material"].startswith("KM")
    assert first["salesOrderRef"]
    assert first["projectRef"]
# BOM remarks on the large PO
big = next(d for d in docs if d["header"]["poNumber"] == "4801169630")
switch = next(it for it in big["items"] if it["bom"])
label = next(b for b in switch["bom"] if b["pos"] == "0500")
assert label["remarkFields"]["A"] == "20"
assert "MAINS SWITCH" in label["remarkFields"]["C"]
assert label["remarkFields"]["D"].startswith("KMC")
descs = {
    (b.get("description") or "").strip()
    for it in big["items"]
    for b in it.get("bom") or []
    if (b.get("description") or "").strip()
}
assert len(descs) == 21, len(descs)
print("ok", got, "bom remarks", label["remarkFields"], "bom descs", len(descs))
out.unlink()
