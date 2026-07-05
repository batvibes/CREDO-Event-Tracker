#!/usr/bin/env python3
"""Verify Section 2 manpower rows in a MIR export."""
from __future__ import annotations

import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path


def read_slide1(path: Path) -> str:
    with zipfile.ZipFile(path) as z:
        return z.read("ppt/slides/slide1.xml").decode("utf-8")


def shape_text(xml: str, name: str) -> str:
    pattern = rf'<p:sp>(?:(?!</p:sp>).)*?name="{re.escape(name)}"(?:(?!</p:sp>).)*?</p:sp>'
    match = re.search(pattern, xml, re.DOTALL)
    if not match:
        return ""
    text = re.search(r"<a:t>([^<]*)</a:t>", match.group(0))
    return text.group(1) if text else ""


def shape_geom(xml: str, name: str) -> tuple[int, int, int, int] | None:
    pattern = rf'<p:sp>(?:(?!</p:sp>).)*?name="{re.escape(name)}"(?:(?!</p:sp>).)*?</p:sp>'
    match = re.search(pattern, xml, re.DOTALL)
    if not match:
        return None
    block = match.group(0)
    off = re.search(r'<a:off x="(\d+)" y="(\d+)"', block)
    ext = re.search(r'<a:ext cx="(\d+)" cy="(\d+)"', block)
    if not off or not ext:
        return None
    return tuple(map(int, (off.group(1), off.group(2), ext.group(1), ext.group(2))))


def main() -> int:
    if len(sys.argv) != 4:
        print("Usage: validate-mir-section2-export.py <template.pptx> <export.pptx> <rows.json>")
        return 2

    template = Path(sys.argv[1])
    export = Path(sys.argv[2])
    rows = json.loads(Path(sys.argv[3]).read_text(encoding="utf-8"))

    errors: list[str] = []
    template_xml = read_slide1(template)
    export_xml = read_slide1(export)

    for part in ("ppt/slides/slide1.xml", "ppt/slides/slide2.xml"):
        with zipfile.ZipFile(export) as z:
            try:
                ET.fromstring(z.read(part))
            except ET.ParseError as exc:
                errors.append(f"XML invalid: {part}: {exc}")

    fields = [
        ("name", "name"),
        ("title", "billetOrRole"),
        ("role", "statusNextAction"),
        ("date", "prdEaos"),
    ]

    for index in range(5):
        row_num = index + 1
        row = rows[index] if index < len(rows) else {}
        for suffix, key in fields:
            shape = f"mir_manpower_row{row_num}_{suffix}"
            expected = str(row.get(key, ""))
            actual = shape_text(export_xml, shape)
            if actual != expected:
                errors.append(f"{shape}: expected [{expected}] got [{actual}]")
            geom_before = shape_geom(template_xml, shape)
            geom_after = shape_geom(export_xml, shape)
            if geom_before != geom_after:
                errors.append(f"{shape}: geometry changed {geom_before} -> {geom_after}")

    if errors:
        print("FAIL")
        for error in errors:
            print(f"  {error}")
        return 1

    print("PASS")
    print(f"  Section 2 rows populated: {len(rows)} of 5")
    for index, row in enumerate(rows, 1):
        print(f'  Row {index}: {row.get("name", "")} | {row.get("billetOrRole", "")}')
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
