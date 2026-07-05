#!/usr/bin/env python3
"""
Add the missing FYTD Mission Support "Retreats" row to MIR_Master_Template.pptx.

Clones the Suicide intervention row (oval, label, value), shifts FYTD TOTAL /
COMMANDS block down by one row pitch, and leaves all other shapes untouched.
"""
from __future__ import annotations

import re
import uuid
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = ROOT / "public" / "templates" / "MIR_Master_Template.pptx"
TEMPLATE_SOURCE = ROOT / "templates" / "MIR_Master_Template.pptx"

ROW_PITCH = 314325  # EMU; matches Marriage → Personal → Suicide spacing

SHIFT_NAMES = (
    "Rectangle 117",
    "TextBox 118",
    "mir_fytd_total",
    "TextBox 120",
    "mir_fytd_commands",
)

CLONE_SOURCES = (
    ("Oval 114", "mir_fytd_retreats_icon", {"S": "R"}),
    ("TextBox 115", "mir_fytd_retreats_label", {"Suicide intervention": "Retreats"}),
    ("mir_fytd_suicide", "mir_fytd_retreats", {"__": "__"}),
)

INSERT_BEFORE = "Rectangle 117"


def extract_shape(xml: str, name: str) -> str | None:
    pattern = rf'<p:sp>(?:(?!</p:sp>).)*?name="{re.escape(name)}"(?:(?!</p:sp>).)*?</p:sp>'
    match = re.search(pattern, xml, re.DOTALL)
    return match.group(0) if match else None


def shape_y(shape: str) -> int:
    match = re.search(r'<a:off x="(\d+)" y="(\d+)"', shape)
    if not match:
        raise ValueError("Shape has no a:off")
    return int(match.group(2))


def set_shape_y(shape: str, y: int) -> str:
    return re.sub(
        r'(<a:off x="\d+" y=")\d+(")',
        rf"\g<1>{y}\2",
        shape,
        count=1,
    )


def set_shape_id_and_name(shape: str, shape_id: int, name: str) -> str:
    shape = re.sub(
        r'(<p:cNvPr id=")\d+(" name=")[^"]+(")',
        rf"\g<1>{shape_id}\2{name}\3",
        shape,
        count=1,
    )
    creation = re.search(
        r'id="\{([0-9A-Fa-f-]+)\}"',
        shape,
    )
    if creation:
        new_guid = str(uuid.uuid4()).upper()
        shape = shape.replace(creation.group(1), new_guid, 1)
    return shape


def replace_text_tokens(shape: str, replacements: dict[str, str]) -> str:
    for old, new in replacements.items():
        shape = shape.replace(f"<a:t>{old}</a:t>", f"<a:t>{new}</a:t>")
    return shape


def collect_positions(xml: str) -> dict[str, int]:
    positions: dict[str, int] = {}
    for match in re.finditer(
        r'<p:sp>(?:(?!</p:sp>).)*?name="([^"]+)"(?:(?!</p:sp>).)*?</p:sp>',
        xml,
        re.DOTALL,
    ):
        name = match.group(1)
        y_match = re.search(r'<a:off x="\d+" y="(\d+)"', match.group(0))
        if y_match:
            positions[name] = int(y_match.group(1))
    return positions


def patch_slide_xml(xml: str) -> tuple[str, list[str]]:
    log: list[str] = []
    before = collect_positions(xml)

    suicide_oval = extract_shape(xml, "Oval 114")
    if suicide_oval is None:
        raise RuntimeError("Oval 114 not found")

    pitch = shape_y(extract_shape(xml, "Oval 114")) - shape_y(
        extract_shape(xml, "Oval 111")
    )
    if pitch != ROW_PITCH:
        log.append(f"Note: measured row pitch {pitch} differs from constant {ROW_PITCH}")

    max_id = max(int(m.group(1)) for m in re.finditer(r'<p:cNvPr id="(\d+)"', xml))
    next_id = max_id + 1

    new_shapes: list[str] = []
    for source_name, new_name, text_map in CLONE_SOURCES:
        source = extract_shape(xml, source_name)
        if source is None:
            raise RuntimeError(f"Source shape not found: {source_name}")
        cloned = set_shape_y(source, shape_y(source) + pitch)
        cloned = set_shape_id_and_name(cloned, next_id, new_name)
        cloned = replace_text_tokens(cloned, text_map)
        new_shapes.append(cloned)
        log.append(f"Added {new_name} at y={shape_y(cloned)} (cloned from {source_name})")
        next_id += 1

    for name in SHIFT_NAMES:
        shape = extract_shape(xml, name)
        if shape is None:
            raise RuntimeError(f"Shape to shift not found: {name}")
        old_y = shape_y(shape)
        shifted = set_shape_y(shape, old_y + pitch)
        xml = xml.replace(shape, shifted, 1)
        log.append(f"Shifted {name}: y {old_y} → {old_y + pitch}")

    anchor = extract_shape(xml, INSERT_BEFORE)
    if anchor is None:
        raise RuntimeError(f"Insert anchor not found: {INSERT_BEFORE}")
    xml = xml.replace(anchor, "".join(new_shapes) + anchor, 1)

    after = collect_positions(xml)
    moved = [
        name
        for name, y in before.items()
        if name in after and after[name] != y and name not in SHIFT_NAMES
    ]
    if moved:
        raise RuntimeError(f"Unexpected position changes: {', '.join(moved[:10])}")

    log.append(
        f"Verified {len(before)} shapes; only {len(SHIFT_NAMES)} shapes shifted vertically"
    )
    return xml, log


def main() -> None:
    if not TEMPLATE.exists():
        raise SystemExit(f"Template not found: {TEMPLATE}")

    with zipfile.ZipFile(TEMPLATE, "r") as zin:
        slide1 = zin.read("ppt/slides/slide1.xml").decode("utf-8")

        if extract_shape(slide1, "mir_fytd_retreats"):
            print("mir_fytd_retreats already present — no changes written")
            return

        patched, log = patch_slide_xml(slide1)

        out_bytes = patched.encode("utf-8")
        tmp = TEMPLATE.with_suffix(".patched.pptx")
        with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
            for info in zin.infolist():
                data = zin.read(info.filename)
                if info.filename == "ppt/slides/slide1.xml":
                    data = out_bytes
                zout.writestr(info, data)

    tmp.replace(TEMPLATE)
    if TEMPLATE_SOURCE != TEMPLATE and TEMPLATE_SOURCE.parent.exists():
        import shutil
        shutil.copy2(TEMPLATE, TEMPLATE_SOURCE)
    print(f"Patched {TEMPLATE}")
    for line in log:
        print(f"  {line}")


if __name__ == "__main__":
    main()
