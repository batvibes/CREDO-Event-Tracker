#!/usr/bin/env python3
"""
Style FYTD TOTAL and COMMANDS as normal summary rows matching category row
typography, alignment, value boxes, and vertical rhythm.
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

# Category row reference (TextBox 109 / mir_fytd_marriage / Oval 108).
LABEL_X = 3_486_150
LABEL_CX = 1_485_900
LABEL_CY = 253_916
LABEL_SZ = 1050
LABEL_Y_OFFSET = 19_050

VALUE_X = 5_086_350
VALUE_CX = 571_500
VALUE_CY = 209_550
VALUE_SZ = 1200
VALUE_Y_OFFSET = 9_525

ROW_HEIGHT = 272_966
ROW_GAP = 9_867
BOTTOM_PADDING = 114_300

SUMMARY_LABELS = ("TextBox 118", "TextBox 120")
SUMMARY_VALUES = ("mir_fytd_total", "mir_fytd_commands")
ANCHOR_SHAPE = "Rectangle 117"
SECTION_BORDER = "Rounded Rectangle 9"


def extract_shape(xml: str, name: str) -> str | None:
    pattern = (
        rf'<p:sp>(?:(?!</p:sp>).)*?<p:cNvPr id="\d+" name="{re.escape(name)}"'
        rf'(?:(?!</p:sp>).)*?</p:sp>'
    )
    match = re.search(pattern, xml, re.DOTALL)
    return match.group(0) if match else None


def shape_y(shape: str) -> int:
    return int(re.search(r'<a:off x="\d+" y="(\d+)"', shape).group(1))


def shape_bounds(shape: str) -> tuple[int, int, int, int]:
    off = re.search(r'<a:off x="(\d+)" y="(\d+)"', shape)
    ext = re.search(r'<a:ext cx="(\d+)" cy="(\d+)"', shape)
    x, y, cx, cy = map(int, (off.group(1), off.group(2), ext.group(1), ext.group(2)))
    return x, y, cx, cy


def repair_xfrm(shape: str, x: int, y: int, cx: int, cy: int) -> str:
    """Fix geometry tags (including prior corrupted off/ext writes)."""
    shape = re.sub(
        r'<a:off x="[^"]*"(?: y="[^"]*")?\s*/>',
        f'<a:off x="{x}" y="{y}"/>',
        shape,
        count=1,
    )
    shape = re.sub(
        r'<a:ext cx="[^"]*"(?: cy="[^"]*")?\s*/>',
        f'<a:ext cx="{cx}" cy="{cy}"/>',
        shape,
        count=1,
    )
    return shape


def set_off_ext(shape: str, x: int, y: int, cx: int, cy: int) -> str:
    return repair_xfrm(shape, x, y, cx, cy)


def set_run_sz(shape: str, old_sz: int, new_sz: int) -> str:
    updated, count = re.subn(
        rf'(<a:rPr[^>]*sz="){old_sz}(")',
        rf"\g<1>{new_sz}\2",
        shape,
        count=1,
    )
    if count != 1:
        raise RuntimeError(f"Expected one sz={old_sz}, replaced {count}")
    return updated


def row_bottom(xml: str, names: tuple[str, ...]) -> int:
    bottoms = []
    for name in names:
        shape = extract_shape(xml, name)
        if shape is None:
            raise RuntimeError(f"Missing shape: {name}")
        _, y, _, cy = shape_bounds(shape)
        bottoms.append(y + cy)
    return max(bottoms)


def patch_slide1(slide_xml: str) -> tuple[str, list[str], bool]:
    label = extract_shape(slide_xml, SUMMARY_LABELS[0])
    if label is None:
        raise RuntimeError(f"Missing {SUMMARY_LABELS[0]}")
    if (
        LABEL_X == 3_486_150
        and 'sz="1050"' in label
        and re.search(r'<a:off x="3486150" y="\d+"', label)
        and 'sz="1200"' in (extract_shape(slide_xml, SUMMARY_VALUES[0]) or "")
    ):
        return slide_xml, [], True

    divider = extract_shape(slide_xml, ANCHOR_SHAPE)
    border = extract_shape(slide_xml, SECTION_BORDER)
    if divider is None or border is None:
        raise RuntimeError("Missing divider or section border")

    _, _, _, div_cy = shape_bounds(divider)
    div_y = shape_y(divider)
    divider_bottom = div_y + div_cy

    row6_top = divider_bottom + ROW_GAP
    row7_top = row6_top + ROW_HEIGHT + ROW_GAP

    label_positions = {
        SUMMARY_LABELS[0]: row6_top + LABEL_Y_OFFSET,
        SUMMARY_LABELS[1]: row7_top + LABEL_Y_OFFSET,
    }
    value_positions = {
        SUMMARY_VALUES[0]: row6_top + VALUE_Y_OFFSET,
        SUMMARY_VALUES[1]: row7_top + VALUE_Y_OFFSET,
    }

    _, _, _, border_cy = shape_bounds(border)
    border_y = shape_y(border)
    bottom_limit = border_y + border_cy - BOTTOM_PADDING
    if value_positions[SUMMARY_VALUES[1]] + VALUE_CY > bottom_limit:
        raise RuntimeError("Summary rows would clip section bottom")

    xml = slide_xml
    log: list[str] = []

    for name in SUMMARY_LABELS:
        shape = extract_shape(xml, name)
        if shape is None:
            raise RuntimeError(f"Missing shape: {name}")
        old_x, old_y, old_cx, old_cy = (0, 0, 0, 0)
        try:
            old_x, old_y, old_cx, old_cy = shape_bounds(shape)
        except (ValueError, AttributeError):
            pass
        updated = set_off_ext(shape, LABEL_X, label_positions[name], LABEL_CX, LABEL_CY)
        if 'sz="850"' in updated:
            updated = set_run_sz(updated, 850, LABEL_SZ)
        xml = xml.replace(shape, updated, 1)
        log.append(
            f"{name}: label x {old_x}->{LABEL_X}, y {old_y}->{label_positions[name]}, "
            f"cx {old_cx}->{LABEL_CX}, cy {old_cy}->{LABEL_CY}, sz ->1050"
        )

    for name in SUMMARY_VALUES:
        shape = extract_shape(xml, name)
        if shape is None:
            raise RuntimeError(f"Missing shape: {name}")
        old_x, old_y, old_cx, old_cy = (0, 0, 0, 0)
        try:
            old_x, old_y, old_cx, old_cy = shape_bounds(shape)
        except (ValueError, AttributeError):
            pass
        updated = set_off_ext(
            shape, VALUE_X, value_positions[name], VALUE_CX, VALUE_CY
        )
        if 'sz="1300"' in updated:
            updated = set_run_sz(updated, 1300, VALUE_SZ)
        xml = xml.replace(shape, updated, 1)
        log.append(
            f"{name}: value x {old_x}->{VALUE_X}, y {old_y}->{value_positions[name]}, "
            f"cx {old_cx}->{VALUE_CX}, cy {old_cy}->{VALUE_CY}, sz 1300->1200"
        )

    return xml, log, False


def patch_template(path: Path) -> list[str]:
    with zipfile.ZipFile(path, "r") as zin:
        slide1 = zin.read("ppt/slides/slide1.xml").decode("utf-8")
        slide1, log, skipped = patch_slide1(slide1)
        if skipped:
            print(f"Already patched: {path}")
            return []

        tmp = path.with_suffix(".fytd-hierarchy.pptx")
        with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
            for info in zin.infolist():
                data = zin.read(info.filename)
                if info.filename == "ppt/slides/slide1.xml":
                    data = slide1.encode("utf-8")
                zout.writestr(info, data)
                if info.filename.endswith(".xml") or info.filename.endswith(".rels"):
                    ET.fromstring(data)

    ET.fromstring(slide1.encode("utf-8"))
    tmp.replace(path)
    print(f"Patched {path}")
    return log


def main() -> None:
    for path in TEMPLATE_PATHS:
        if not path.exists():
            raise SystemExit(f"Missing template: {path}")
        log = patch_template(path)
        for line in log:
            print(f"  {line}")


if __name__ == "__main__":
    main()
