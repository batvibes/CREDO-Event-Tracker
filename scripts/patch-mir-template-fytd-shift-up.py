#!/usr/bin/env python3
"""
Shift FYTD Mission Support metric stack upward so FYTD TOTAL and COMMANDS
clear the Section 1 Notes placeholder (Rectangle 122).

Moves every FYTD category + summary shape by the same delta to preserve
alignment, divider spacing, and the Retreats row.
"""
from __future__ import annotations

import re
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEMPLATE_PATHS = [
    ROOT / "templates" / "MIR_Master_Template.pptx",
    ROOT / "public" / "templates" / "MIR_Master_Template.pptx",
]

# One row pitch — the vertical space added when the Retreats row was inserted.
DELTA_EMU = 313431

SHIFT_NAMES = (
    "Oval 108",
    "TextBox 109",
    "mir_fytd_marriage",
    "Oval 111",
    "TextBox 112",
    "mir_fytd_personal_growth",
    "Oval 114",
    "TextBox 115",
    "mir_fytd_suicide",
    "mir_fytd_retreats_icon",
    "mir_fytd_retreats_label",
    "mir_fytd_retreats",
    "Rectangle 117",
    "TextBox 118",
    "mir_fytd_total",
    "TextBox 120",
    "mir_fytd_commands",
)


def extract_shape(xml: str, name: str) -> str | None:
    pattern = rf'<p:sp>(?:(?!</p:sp>).)*?name="{re.escape(name)}"(?:(?!</p:sp>).)*?</p:sp>'
    match = re.search(pattern, xml, re.DOTALL)
    return match.group(0) if match else None


def shape_y(shape: str) -> int:
    match = re.search(r'<a:off x="\d+" y="(\d+)"', shape)
    if not match:
        raise ValueError("missing y")
    return int(match.group(1))


def set_shape_y(shape: str, y: int) -> str:
    return re.sub(
        r'(<a:off x="\d+" y=")\d+(")',
        rf"\g<1>{y}\2",
        shape,
        count=1,
    )


def patch_slide1(slide_xml: str) -> tuple[str, list[tuple[str, int, int]]]:
    if extract_shape(slide_xml, "mir_fytd_retreats"):
        tb118 = extract_shape(slide_xml, "TextBox 118")
        if tb118 and shape_y(tb118) < 3_500_000:
            return slide_xml, []

    xml = slide_xml
    moves: list[tuple[str, int, int]] = []
    for name in SHIFT_NAMES:
        shape = extract_shape(xml, name)
        if shape is None:
            raise RuntimeError(f"Missing shape: {name}")
        old_y = shape_y(shape)
        new_y = old_y - DELTA_EMU
        updated = set_shape_y(shape, new_y)
        xml = xml.replace(shape, updated, 1)
        moves.append((name, old_y, new_y))
    return xml, moves


def patch_template(path: Path) -> list[tuple[str, int, int]]:
    with zipfile.ZipFile(path, "r") as zin:
        slide1 = zin.read("ppt/slides/slide1.xml").decode("utf-8")
        slide1, moves = patch_slide1(slide1)
        if not moves:
            print(f"Already shifted: {path}")
            return []

        tmp = path.with_suffix(".fytd-shift.pptx")
        with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
            for info in zin.infolist():
                data = zin.read(info.filename)
                if info.filename == "ppt/slides/slide1.xml":
                    data = slide1.encode("utf-8")
                zout.writestr(info, data)
    tmp.replace(path)
    print(f"Patched {path}")
    return moves


def main() -> None:
    all_moves: list[tuple[str, int, int]] = []
    for path in TEMPLATE_PATHS:
        if not path.exists():
            raise SystemExit(f"Missing template: {path}")
        moves = patch_template(path)
        if moves:
            all_moves = moves

    if all_moves:
        print(f"\nShifted {len(all_moves)} shapes up by {DELTA_EMU} EMU ({DELTA_EMU / 914400:.4f}\")")
        for name, old_y, new_y in all_moves:
            print(f"  {name}: {old_y / 914400:.4f}\" -> {new_y / 914400:.4f}\"")


if __name__ == "__main__":
    main()
