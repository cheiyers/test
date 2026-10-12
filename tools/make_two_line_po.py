#!/usr/bin/env python3
"""Build a synthetic Schindler-style PO with two line items and new keywords."""

from pathlib import Path

import pymupdf

OUT = Path(__file__).resolve().parents[1] / "samples" / "PO_two_lines.pdf"


def put(page, x, y, text, size=10):
    # insert_text uses baseline; extractor reads bbox y as top. Shift down by size.
    page.insert_text((x, y + size), text, fontsize=size, fontname="china-s")


def main() -> None:
    doc = pymupdf.open()
    page = doc.new_page(width=595, height=842)
    put(page, 42.5, 31.4, "迅达(中国）电梯有限公司", 12)
    put(page, 42.5, 95.1, "采购订单", 14)
    put(page, 42.5, 126.7, "采购订单号/采购组:")
    put(page, 136.1, 126.7, "4551750099/T0M")
    put(page, 42.5, 141.1, "凭证日期:")
    put(page, 136.1, 141.1, "2026/08/31")
    put(page, 317.5, 165.5, "苏州海联成套电器设备有限公司")
    put(page, 317.5, 177.5, "苏州工业园区东富路9号45幢")
    put(page, 317.5, 189.5, "215000 苏州")
    put(page, 39.0, 199.2, "供应商:", 8)
    put(page, 132.6, 199.2, "1372010", 8)
    put(page, 42.5, 241.4, "开票抬头:", 8)
    put(page, 42.5, 251.9, "公司代码 3260/JDF")
    put(page, 42.5, 263.9, "迅达（中国）电梯有限公司")
    put(page, 283.5, 241.4, "交货地址:", 8)
    put(page, 283.5, 251.9, "上海")
    put(page, 283.5, 263.9, "嘉定区兴顺路588号")
    put(page, 283.5, 311.9, "工厂:3260")
    put(page, 283.5, 323.9, "公司代码:3260")
    put(page, 42.5, 338.8, "你们的参考号:", 8)
    put(page, 283.5, 348.4, "付款条件:", 8)
    put(page, 283.5, 358.0, "90 天之内 到期净值", 8)
    put(page, 283.5, 386.8, "交货日期: 2026/09/20", 8)
    put(page, 283.5, 396.4, "打印日期: 2026/08/31", 8)

    put(page, 42.5, 483.8, "行项目")
    put(page, 85.0, 483.8, "物料号")
    put(page, 170.1, 483.8, "物料组")
    put(page, 240.9, 483.8, "物料描述")
    put(page, 85.0, 495.8, "交货日期")
    put(page, 170.1, 495.8, "订单数量")
    put(page, 240.9, 495.8, "单位")
    put(page, 297.6, 495.8, "未税单价")
    put(page, 368.5, 495.8, "未税金额CNY]")

    # item 00010 — description wraps to a second visual line
    put(page, 42.5, 513.8, "00010")
    put(page, 85.0, 514.2, "57668963", 9.8)
    put(page, 170.1, 513.8, "XH")
    put(page, 240.9, 513.8, "Round spot 4LED照明")
    put(page, 240.9, 525.8, "含安装附件")
    put(page, 179.2, 537.8, "5")
    put(page, 226.8, 537.8, "件         93.50/1")
    put(page, 367.6, 537.8, "467.50")
    put(page, 42.5, 549.8, "图号/版本: Z57668961+0+000")
    put(page, 42.5, 561.8, "成组技术码: MECH")
    put(page, 42.5, 573.8, "颜色: 黑色")
    put(page, 42.5, 585.8, "SCM大小/量纲: 按照实物")

    # item 00020 — new keywords only on this line
    put(page, 42.5, 609.8, "00020")
    put(page, 85.0, 610.2, "57664581", 9.8)
    put(page, 170.1, 609.8, "XH")
    put(page, 240.9, 609.8, "LED方型灯")
    put(page, 179.2, 621.8, "4")
    put(page, 226.8, 621.8, "件         48.30/1")
    put(page, 367.6, 621.8, "193.20")
    put(page, 42.5, 633.8, "图号/版本: E57664581+2+000")
    put(page, 42.5, 645.8, "成组技术码: MECH")
    put(page, 42.5, 657.8, "颜色: 银色")
    put(page, 42.5, 669.8, "表面处理: 喷塑")
    put(page, 42.5, 681.8, "SCM大小/量纲: 按照实物")

    put(page, 179.3, 710.0, "不含增值税总价 CNY")
    put(page, 367.6, 710.0, "660.70")
    doc.save(OUT)
    print("wrote", OUT)


if __name__ == "__main__":
    main()
