#!/usr/bin/env python3
"""
Align FYTD summary value shapes to the same right edge as category values.
X/width only — no y, font, or spacing changes.
"""
from __future__ import annotations

import re
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEMPLATE_PATHS = [
    ROOT / "templates" / "MIR_Master_Template.pptx",
    ROOT / "public" / "templates" / "MIR_Master_Template.pptx",
]

REFERENCE_VALUE = "mir_fytd_marriage"
ALIGN_VALUES = ("mir_fytd_total", "mir_fytd_commands")
LABEL_NAMES = ("TextBox 118", "TextBox 120")


def extract_shape(xml: str, name: str) -> str | None:
    pattern = rf'<p:sp>(?:(?!</p:sp>).)*?name="{re.escape(name)}"(?:(?!</p:sp>).)*?</p:sp>'
    match = re.search(pattern, xml, re.DOTALL)
    return match.group(0) if match else None


def shape_x_cx(shape: str) -> tuple[int, int]:
    off = re.search(r'<a:off x="(\d+)" y="\d+"', shape)
    ext = re.search(r'<a:ext cx="(\d+)" cy="\d+"', shape)
    if not off or not ext:
        raise ValueError("missing geometry")
    return int(off.group(1)), int(ext.group(1))


def set_shape_x(shape: str, x: int) -> str:
    return re.sub(
        r'(<a:off x=")\d+(" y="\d+")',
        rf"\g<1>{x}\2",
        shape,
        count=1,
    )


def patch_slide1(slide_xml: str) -> tuple[str, list[dict]]:
    ref = extract_shape(slide_xml, REFERENCE_VALUE)
    if ref is None:
        raise RuntimeError(f"Missing reference shape: {REFERENCE_VALUE}")

    ref_x, ref_cx = shape_x_cx(ref)
    target_right = ref_x + ref_cx

    xml = slide_xml
    changes: list[dict] = []

    for name in ALIGN_VALUES:
        shape = extract_shape(xml, name)
        if shape is None:
            raise RuntimeError(f"Missing shape: {name}")
        old_x, cx = shape_x_cx(shape)
        old_right = old_x + cx
        new_x = target_right - cx
        if old_x != new_x:
            updated = set_shape_x(shape, new_x)
            xml = xml.replace(shape, updated, 1)
            changes.append(
                {
                    "name": name,
                    "old_x": old_x,
                    "new_x": new_x,
                    "cx": cx,
                    "old_right": old_right,
                    "new_right": new_x + cx,
                }
            )

    labels = []
    for name in LABEL_NAMES:
        shape = extract_shape(xml, name)
        if shape is None:
            raise RuntimeError(f"Missing shape: {name}")
        x, cx = shape_x_cx(shape)
        labels.append((name, x, cx))

    lefts = {x for _, x, _ in labels}
    if len(lefts) != 1:
        raise RuntimeError(f"Summary labels not left-aligned: {labels}")

    return xml, changes


def patch_template(path: Path) -> list[dict]:
    with zipfile.ZipFile(path, "r") as zin:
        slide1 = zin.read("ppt/slides/slide1.xml").decode("utf-8")
        slide1, changes = patch_slide1(slide1)

        tmp = path.with_suffix(".fytd-x-align.pptx")
        with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
            for info in zin.infolist():
                data = zin.read(info.filename)
                if info.filename == "ppt/slides/slide1.xml":
                    data = slide1.encode("utf-8")
                zout.writestr(info, data)
                if info.filename.endswith(".xml") or info.filename.endswith(".rels"):
                    ET.fromstring(data)

    tmp.replace(path)
    print(f"Patched {path}")
    return changes


def main() -> None:
    all_changes: list[dict] = []
    for path in TEMPLATE_PATHS:
        if not path.exists():
            raise SystemExit(f"Missing template: {path}")
        changes = patch_template(path)
        if changes:
            all_changes = changes

    if not all_changes:
        print("Already aligned — no changes")
        return

    for c in all_changes:
        print(
            f"{c['name']}: x {c['old_x']} -> {c['new_x']}, "
            f"cx {c['cx']} (unchanged), "
            f"right {c['old_right']} -> {c['new_right']}"
        )


if __name__ == "__main__":
    main()
