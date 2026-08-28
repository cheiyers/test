#!/usr/bin/env python3
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
out = ROOT / "data" / "_test_extract.json"
pdfs = sorted((ROOT / "samples").glob("*.pdf"))
assert len(pdfs) == 3, pdfs
subprocess.check_call([sys.executable, str(ROOT / "tools" / "extract_po.py"), *[str(p) for p in pdfs], "-o", str(out)])
docs = json.loads(out.read_text(encoding="utf-8"))
expect = {
    "4801006558": (4, 401.08),
    "4801007230": (4, 401.08),
    "4801169630": (254, 51928.13),
}
got = {d["header"]["poNumber"]: (d["itemCount"], d["sumAmount"]) for d in docs}
assert got == expect, got
for d in docs:
    assert d["header"]["vendorName"]
    assert d["header"]["poNumber"]
    first = d["items"][0]
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
print("ok", got, "bom remarks", label["remarkFields"])
out.unlink()
