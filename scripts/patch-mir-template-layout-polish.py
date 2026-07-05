#!/usr/bin/env python3
"""
Minor layout polish for MIR_Master_Template.pptx:
- +0.5 pt on dynamic value shape fonts (sz +50)
- Taller FYTD TOTAL / COMMANDS label boxes with slight vertical nudge
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

VALUE_SHAPES_SLIDE1 = {
    "mir_month_label": 1700,
    "mir_month_reach_commands": 920,
    "mir_month_reach_beneficiaries": 840,
    "mir_month_reach_workshops": 920,
    "mir_month_reach_retreats": 920,
    "mir_fytd_marriage": 1150,
    "mir_fytd_personal_growth": 1150,
    "mir_fytd_suicide": 1150,
    "mir_fytd_retreats": 1150,
    "mir_fytd_total": 1250,
    "mir_fytd_commands": 1250,
}

VALUE_SHAPES_SLIDE2 = {
    "mir_notes_reach": 750,
    "mir_notes_manpower": 750,
    "mir_notes_readiness": 730,
    "mir_notes_command_highlights": 730,
}

LABEL_BOX_PATCHES = {
    "TextBox 118": {"y": "3595500", "cy": "253087"},
    "TextBox 120": {"y": "3766500", "cy": "253087"},
}


def extract_shape(xml: str, name: str) -> str | None:
    pattern = rf'<p:sp>(?:(?!</p:sp>).)*?name="{re.escape(name)}"(?:(?!</p:sp>).)*?</p:sp>'
    match = re.search(pattern, xml, re.DOTALL)
    return match.group(0) if match else None


def bump_shape_font(shape: str, old_sz: int) -> str:
    new_sz = old_sz + 50
    updated, count = re.subn(
        rf'(<a:rPr[^>]*sz="){old_sz}(")',
        rf"\g<1>{new_sz}\2",
        shape,
        count=1,
    )
    if count != 1:
        raise RuntimeError(f"Expected one sz={old_sz} in shape, replaced {count}")
    return updated


def patch_label_box(shape: str, y: str, cy: str) -> str:
    shape = re.sub(
        r'(<a:off x="\d+" y=")\d+(")',
        rf"\g<1>{y}\2",
        shape,
        count=1,
    )
    shape = re.sub(
        r'(<a:ext cx="\d+" cy=")\d+(")',
        rf"\g<1>{cy}\2",
        shape,
        count=1,
    )
    return shape


def patch_slide(slide_xml: str, value_shapes: dict[str, int]) -> str:
    xml = slide_xml
    for name, old_sz in value_shapes.items():
        shape = extract_shape(xml, name)
        if shape is None:
            raise RuntimeError(f"Shape not found: {name}")
        updated = bump_shape_font(shape, old_sz)
        xml = xml.replace(shape, updated, 1)
    return xml


def patch_slide1(slide_xml: str) -> str:
    xml = patch_slide(slide_xml, VALUE_SHAPES_SLIDE1)
    for name, coords in LABEL_BOX_PATCHES.items():
        shape = extract_shape(xml, name)
        if shape is None:
            raise RuntimeError(f"Label shape not found: {name}")
        updated = patch_label_box(shape, coords["y"], coords["cy"])
        xml = xml.replace(shape, updated, 1)
    return xml


def patch_template(path: Path) -> None:
    with zipfile.ZipFile(path, "r") as zin:
        slide1 = zin.read("ppt/slides/slide1.xml").decode("utf-8")
        slide2 = zin.read("ppt/slides/slide2.xml").decode("utf-8")

        if 'sz="970"' in slide1 and extract_shape(slide1, "TextBox 118"):
            tb = extract_shape(slide1, "TextBox 118")
            if tb and 'cy="253087"' in tb:
                print(f"Already patched: {path}")
                return

        slide1 = patch_slide1(slide1)
        slide2 = patch_slide(slide2, VALUE_SHAPES_SLIDE2)

        tmp = path.with_suffix(".polish.pptx")
        with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
            for info in zin.infolist():
                data = zin.read(info.filename)
                if info.filename == "ppt/slides/slide1.xml":
                    data = slide1.encode("utf-8")
                elif info.filename == "ppt/slides/slide2.xml":
                    data = slide2.encode("utf-8")
                zout.writestr(info, data)

    tmp.replace(path)
    print(f"Patched {path}")


def main() -> None:
    for path in TEMPLATE_PATHS:
        if not path.exists():
            raise SystemExit(f"Missing template: {path}")
        patch_template(path)


if __name__ == "__main__":
    main()
