#!/usr/bin/env python3
"""
Remove Section 1 Notes placeholder strip and redistribute FYTD Mission Support
rows with equal vertical spacing into the reclaimed space.

Layout-only: no font, color, x-position, export, or outer-border changes.
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

REMOVE_NAMES = ("Rectangle 122", "TextBox 123")

# Gray Notes bar height (Rectangle 122 cy) — exact reclaimed vertical space.
RECLAIMED_EMU = 238125

# Comfortable padding below Commands value row (0.125").
BOTTOM_PADDING_EMU = 114300

# Marriage oval anchor before the emergency FYTD shift-up (restores top breathing room).
START_ANCHOR_Y = 2_209_928

# FYTD column guide (Rectangle 95) — extend height downward only.
FYTD_GUIDE_NAME = "Rectangle 95"

ROW_SPEC: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("Oval 108", ("Oval 108", "TextBox 109", "mir_fytd_marriage")),
    ("Oval 111", ("Oval 111", "TextBox 112", "mir_fytd_personal_growth")),
    ("Oval 114", ("Oval 114", "TextBox 115", "mir_fytd_suicide")),
    (
        "mir_fytd_retreats_icon",
        ("mir_fytd_retreats_icon", "mir_fytd_retreats_label", "mir_fytd_retreats"),
    ),
    ("Rectangle 117", ("Rectangle 117",)),
    ("TextBox 118", ("TextBox 118", "mir_fytd_total")),
    ("TextBox 120", ("TextBox 120", "mir_fytd_commands")),
)


def extract_shape(xml: str, name: str) -> str | None:
    pattern = rf'<p:sp>(?:(?!</p:sp>).)*?name="{re.escape(name)}"(?:(?!</p:sp>).)*?</p:sp>'
    match = re.search(pattern, xml, re.DOTALL)
    return match.group(0) if match else None


def remove_shape(xml: str, name: str) -> str:
    shape = extract_shape(xml, name)
    if shape is None:
        raise RuntimeError(f"Shape to remove not found: {name}")
    return xml.replace(shape, "", 1)


def shape_y(shape: str) -> int:
    match = re.search(r'<a:off x="\d+" y="(\d+)"', shape)
    if not match:
        raise ValueError("missing y")
    return int(match.group(1))


def shape_cy(shape: str) -> int:
    match = re.search(r'<a:ext cx="\d+" cy="(\d+)"', shape)
    if not match:
        raise ValueError("missing cy")
    return int(match.group(1))


def set_shape_y(shape: str, y: int) -> str:
    return re.sub(
        r'(<a:off x="\d+" y=")\d+(")',
        rf"\g<1>{y}\2",
        shape,
        count=1,
    )


def set_shape_cy(shape: str, cy: int) -> str:
    return re.sub(
        r'(<a:ext cx="\d+" cy=")\d+(")',
        rf"\g<1>{cy}\2",
        shape,
        count=1,
    )


def commands_value_bottom(xml: str, commands_anchor_y: int) -> int:
    cmd = extract_shape(xml, "mir_fytd_commands")
    if cmd is None:
        raise RuntimeError("mir_fytd_commands not found")
    offset = shape_y(cmd) - commands_anchor_y
    return commands_anchor_y + offset + shape_cy(cmd)


def compute_end_anchor_y(xml: str, notes_top_y: int) -> int:
    """Commands row anchor so value bottom clears reclaimed zone with padding."""
    content_bottom = notes_top_y + RECLAIMED_EMU
    tb120 = extract_shape(xml, "TextBox 120")
    if tb120 is None:
        raise RuntimeError("TextBox 120 not found")
    current_anchor = shape_y(tb120)
    max_bottom = content_bottom - BOTTOM_PADDING_EMU
    # Binary search not needed — linear offset from anchor to value bottom is fixed.
    offset_to_bottom = commands_value_bottom(xml, current_anchor) - current_anchor
    return max_bottom - offset_to_bottom


def patch_slide1(slide_xml: str) -> tuple[str, dict]:
    if extract_shape(slide_xml, "Rectangle 122") is None:
        return slide_xml, {"skipped": True}

    notes_bar = extract_shape(slide_xml, "Rectangle 122")
    if notes_bar is None:
        raise RuntimeError("Rectangle 122 not found")
    notes_top_y = shape_y(notes_bar)

    end_anchor_y = compute_end_anchor_y(slide_xml, notes_top_y)
    num_rows = len(ROW_SPEC)
    span = end_anchor_y - START_ANCHOR_Y
    if span <= 0:
        raise RuntimeError("Invalid anchor span for FYTD redistribution")

    new_anchors = [
        START_ANCHOR_Y + round(i * span / (num_rows - 1)) for i in range(num_rows)
    ]

    xml = slide_xml
    removed: list[str] = []
    for name in REMOVE_NAMES:
        if extract_shape(xml, name):
            xml = remove_shape(xml, name)
            removed.append(name)

    repositioned: list[tuple[str, int, int]] = []
    for row_idx, (anchor_name, shape_names) in enumerate(ROW_SPEC):
        anchor_shape = extract_shape(xml, anchor_name)
        if anchor_shape is None:
            raise RuntimeError(f"Missing row anchor: {anchor_name}")
        old_anchor_y = shape_y(anchor_shape)
        new_anchor_y = new_anchors[row_idx]
        for shape_name in shape_names:
            shape = extract_shape(xml, shape_name)
            if shape is None:
                raise RuntimeError(f"Missing shape: {shape_name}")
            offset = shape_y(shape) - old_anchor_y
            new_y = new_anchor_y + offset
            old_y = shape_y(shape)
            if old_y != new_y:
                updated = set_shape_y(shape, new_y)
                xml = xml.replace(shape, updated, 1)
                repositioned.append((shape_name, old_y, new_y))

    guide = extract_shape(xml, FYTD_GUIDE_NAME)
    if guide is None:
        raise RuntimeError(f"Missing {FYTD_GUIDE_NAME}")
    old_cy = shape_cy(guide)
    new_cy = old_cy + RECLAIMED_EMU
    xml = xml.replace(guide, set_shape_cy(guide, new_cy), 1)

    # Sanity: commands clears reclaimed zone
    final_tb120 = extract_shape(xml, "TextBox 120")
    if final_tb120 is None:
        raise RuntimeError("TextBox 120 missing after patch")
    bottom = commands_value_bottom(xml, shape_y(final_tb120))
    content_bottom = notes_top_y + RECLAIMED_EMU
    if bottom > content_bottom - BOTTOM_PADDING_EMU + 1:
        raise RuntimeError(
            f"Commands bottom {bottom} exceeds limit {content_bottom - BOTTOM_PADDING_EMU}"
        )

    return xml, {
        "skipped": False,
        "removed": removed,
        "repositioned": repositioned,
        "new_anchors": new_anchors,
        "content_bottom": content_bottom,
        "commands_bottom": bottom,
        "fytd_guide_cy": (old_cy, new_cy),
    }


def validate_xml(xml_bytes: bytes, label: str) -> None:
    ET.fromstring(xml_bytes)


def patch_template(path: Path) -> dict:
    with zipfile.ZipFile(path, "r") as zin:
        slide1 = zin.read("ppt/slides/slide1.xml").decode("utf-8")
        slide1, meta = patch_slide1(slide1)
        if meta.get("skipped"):
            print(f"Already patched: {path}")
            return meta

        tmp = path.with_suffix(".notes-removed.pptx")
        with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
            for info in zin.infolist():
                data = zin.read(info.filename)
                if info.filename == "ppt/slides/slide1.xml":
                    data = slide1.encode("utf-8")
                zout.writestr(info, data)
                if info.filename.endswith(".xml") or info.filename.endswith(".rels"):
                    validate_xml(data if info.filename != "ppt/slides/slide1.xml" else slide1.encode("utf-8"), info.filename)

    validate_xml(slide1.encode("utf-8"), "ppt/slides/slide1.xml")
    tmp.replace(path)
    print(f"Patched {path}")
    return meta


def main() -> None:
    meta: dict = {}
    for path in TEMPLATE_PATHS:
        if not path.exists():
            raise SystemExit(f"Missing template: {path}")
        meta = patch_template(path)

    if meta.get("skipped"):
        return

    print(f"\nRemoved: {', '.join(meta['removed'])}")
    print(f"Repositioned {len(meta['repositioned'])} shapes")
    for name, old_y, new_y in meta["repositioned"]:
        print(f"  {name}: {old_y / 914400:.4f}\" -> {new_y / 914400:.4f}\"")
    print(f"FYTD guide height: {meta['fytd_guide_cy'][0]} -> {meta['fytd_guide_cy'][1]} EMU")
    print(f"Commands bottom: {meta['commands_bottom'] / 914400:.4f}\"")
    print(f"Content bottom: {meta['content_bottom'] / 914400:.4f}\"")


if __name__ == "__main__":
    main()
