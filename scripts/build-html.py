#!/usr/bin/env python3
"""Embed XLSX + PDF.js (+ cmaps/worker) into 订单转换系统.html from order-converter.app.html."""
from pathlib import Path
import base64

ROOT = Path(__file__).resolve().parents[1]
VENDOR = ROOT / 'vendor' / 'pdfjs'
src = (ROOT / 'order-converter.app.html').read_text(encoding='utf-8')

def esc(js: str) -> str:
    return js.replace('</script>', '<\\/script>')

xlsx = Path('/tmp/xlsx-dl/xlsx.full.min.js')
if not xlsx.exists():
    raise SystemExit('Missing /tmp/xlsx-dl/xlsx.full.min.js — download SheetJS first')

# Build cmaps + worker inline JS from binaries
cmap_names = ['UniGB-UTF16-H', 'Adobe-GB1-UCS2']
cmap_lines = ["window.__OC_PDF_CMAPS = {"]
for name in cmap_names:
    data = (VENDOR / (name + '.bcmap')).read_bytes()
    cmap_lines.append(f"  '{name}': '{base64.b64encode(data).decode('ascii')}',")
cmap_lines.append("};")
cmaps_js = '\n'.join(cmap_lines)
worker_b64 = base64.b64encode((VENDOR / 'pdf.worker.min.js').read_bytes()).decode('ascii')
worker_js = "window.__OC_PDF_WORKER_B64 = '" + worker_b64 + "';\n"

replacements = [
    ('<!-- XLSX_LIB_PLACEHOLDER -->', '<script>\n' + esc(xlsx.read_text(encoding='utf-8')) + '\n</script>'),
    ('<!-- PDFJS_LIB_PLACEHOLDER -->', '<script>\n' + esc((VENDOR / 'pdf.min.js').read_text(encoding='utf-8')) + '\n</script>'),
    ('<!-- PDF_CMAPS_PLACEHOLDER -->', '<script>\n' + cmaps_js + '\n</script>'),
    ('<!-- PDF_WORKER_PLACEHOLDER -->', '<script>\n' + worker_js + '\n</script>'),
]
out = src
for a, b in replacements:
    if a not in out:
        raise SystemExit('Missing placeholder: ' + a)
    out = out.replace(a, b, 1)

dest = ROOT / '订单转换系统.html'
dest.write_text(out, encoding='utf-8')
print('wrote', dest, 'bytes', dest.stat().st_size, 'scripts', out.count('<script'), out.count('</script>'))
