#!/usr/bin/env python3
"""
Rebalance FYTD Mission Support vertical stack using equal gaps between
row bounding boxes. Y-only changes; x/width/fonts/colors untouched.
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

# FYTD stack rows (anchor shape first in each group).
ROW_GROUPS: tuple[tuple[str, ...], ...] = (
    ("Oval 108", "TextBox 109", "mir_fytd_marriage"),
    ("Oval 111", "TextBox 112", "mir_fytd_personal_growth"),
    ("Oval 114", "TextBox 115", "mir_fytd_suicide"),
    ("mir_fytd_retreats_icon", "mir_fytd_retreats_label", "mir_fytd_retreats"),
    ("Rectangle 117",),
    ("TextBox 118", "mir_fytd_total"),
    ("TextBox 120", "mir_fytd_commands"),
)

TOP_SHAPE = "Oval 108"
BOTTOM_SHAPE = "mir_fytd_commands"
HEADER_SHAPE = "TextBox 2"
SECTION1_BORDER = "Rounded Rectangle 9"
BOTTOM_PADDING_EMU = 114300  # 0.125"


def extract_shape(xml: str, name: str) -> str | None:
    # Exact name match — avoids mir_fytd_retreats matching *_icon / *_label.
    pattern = (
        rf'<p:sp>(?:(?!</p:sp>).)*?name="{re.escape(name)}"(?:(?!</p:sp>).)*?</p:sp>'
    )
    for match in re.finditer(pattern, xml, re.DOTALL):
        block = match.group(0)
        if re.search(rf'<p:cNvPr id="\d+" name="{re.escape(name)}"', block):
            return block
    return None


def shape_geom(shape: str) -> dict[str, int]:
    off = re.search(r'<a:off x="(\d+)" y="(\d+)"', shape)
    ext = re.search(r'<a:ext cx="(\d+)" cy="(\d+)"', shape)
    if not off or not ext:
        raise ValueError("missing geometry")
    return {
        "x": int(off.group(1)),
        "y": int(off.group(2)),
        "cx": int(ext.group(1)),
        "cy": int(ext.group(2)),
    }


def set_shape_y(shape: str, y: int) -> str:
    return re.sub(
        r'(<a:off x="\d+" y=")\d+(")',
        rf"\g<1>{y}\2",
        shape,
        count=1,
    )


def row_bounds(shapes: dict[str, dict[str, int]], names: tuple[str, ...]) -> tuple[int, int]:
    tops = [shapes[n]["y"] for n in names]
    bottoms = [shapes[n]["y"] + shapes[n]["cy"] for n in names]
    return min(tops), max(bottoms)


def patch_slide1(slide_xml: str) -> tuple[str, list[tuple[str, int, int]], dict[str, dict[str, int]]]:
    xml = slide_xml
    before: dict[str, dict[str, int]] = {}
    for group in ROW_GROUPS:
        for name in group:
            shape = extract_shape(xml, name)
            if shape is None:
                raise RuntimeError(f"Missing shape: {name}")
            before[name] = shape_geom(shape)

    top_anchor = before[TOP_SHAPE]["y"]
    header = extract_shape(xml, HEADER_SHAPE)
    border = extract_shape(xml, SECTION1_BORDER)
    if header is None or border is None:
        raise RuntimeError("Missing FYTD panel boundary shapes")
    header_geom = shape_geom(header)
    border_geom = shape_geom(border)
    _ = header_geom  # header retained for future bounds checks

    bottom_limit = border_geom["y"] + border_geom["cy"] - BOTTOM_PADDING_EMU
    top_limit = top_anchor  # preserve FYTD panel top anchor

    row_meta: list[dict] = []
    for names in ROW_GROUPS:
        top, bottom = row_bounds(before, names)
        offsets = {n: before[n]["y"] - top for n in names}
        row_meta.append(
            {
                "names": names,
                "height": bottom - top,
                "offsets": offsets,
            }
        )

    total_height = sum(r["height"] for r in row_meta)
    span = bottom_limit - top_limit
    gap = (span - total_height) / (len(row_meta) - 1)

    moves: list[tuple[str, int, int]] = []
    cursor = float(top_limit)
    for row in row_meta:
        for name in row["names"]:
            old_y = before[name]["y"]
            new_y = int(round(cursor + row["offsets"][name]))
            if old_y != new_y:
                shape = extract_shape(xml, name)
                if shape is None:
                    raise RuntimeError(f"Missing shape during patch: {name}")
                updated = set_shape_y(shape, new_y)
                xml = xml.replace(shape, updated, 1)
                moves.append((name, old_y, new_y))
        cursor += row["height"] + gap

    after: dict[str, dict[str, int]] = {}
    for group in ROW_GROUPS:
        for name in group:
            shape = extract_shape(xml, name)
            if shape is None:
                raise RuntimeError(f"Missing shape after patch: {name}")
            after[name] = shape_geom(shape)

    # x/cx/cy must be unchanged
    for name, geom in before.items():
        for key in ("x", "cx", "cy"):
            if before[name][key] != after[name][key]:
                raise RuntimeError(
                    f"{name}.{key} changed: {before[name][key]} -> {after[name][key]}"
                )

    cmd_bottom = after[BOTTOM_SHAPE]["y"] + after[BOTTOM_SHAPE]["cy"]
    if cmd_bottom > bottom_limit + 1:
        raise RuntimeError(
            f"Commands bottom {cmd_bottom} exceeds limit {bottom_limit}"
        )

    return xml, moves, {"gap_emu": int(round(gap)), "top": top_limit, "bottom_limit": bottom_limit}


def patch_template(path: Path) -> list[tuple[str, int, int]]:
    with zipfile.ZipFile(path, "r") as zin:
        slide1 = zin.read("ppt/slides/slide1.xml").decode("utf-8")
        slide1, moves, meta = patch_slide1(slide1)

        tmp = path.with_suffix(".fytd-rebalance.pptx")
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
    print(f"Patched {path} (gap={meta['gap_emu']} EMU)")
    return moves


def main() -> None:
    all_moves: list[tuple[str, int, int]] = []
    for path in TEMPLATE_PATHS:
        if not path.exists():
            raise SystemExit(f"Missing template: {path}")
        moves = patch_template(path)
        if moves:
            all_moves = moves

    if not all_moves:
        print("No y changes required")
        return

    print(f"\nMoved {len(all_moves)} shapes:")
    for name, old_y, new_y in all_moves:
        print(f"  {name}: {old_y / 914400:.4f}\" -> {new_y / 914400:.4f}\"")


if __name__ == "__main__":
    main()
