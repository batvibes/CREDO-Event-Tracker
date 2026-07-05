#!/usr/bin/env python3
"""Forensic OOXML package comparison for MIR PowerPoint files."""
from __future__ import annotations

import hashlib
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = {
    "template": ROOT / "templates/MIR_Master_Template.pptx",
    "jszip_export": ROOT / "scripts/spike-output/CREDO-MCI-WEST-Monthly-Impact-Report-June-2026.pptx",
    "automizer_spike": ROOT / "scripts/spike-output/spike-mir-template-export.pptx",
}

NS = {
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "rel": "http://schemas.openxmlformats.org/package/2006/relationships",
    "ct": "http://schemas.openxmlformats.org/package/2006/content-types",
}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def load_package(path: Path) -> dict[str, bytes]:
    with zipfile.ZipFile(path) as z:
        return {info.filename: z.read(info.filename) for info in z.infolist()}


def load_zip_meta(path: Path) -> dict[str, dict]:
    meta = {}
    with zipfile.ZipFile(path) as z:
        for info in z.infolist():
            meta[info.filename] = {
                "compress_type": info.compress_type,
                "compress_size": info.compress_size,
                "file_size": info.file_size,
                "CRC": info.CRC,
                "is_dir": info.filename.endswith("/"),
            }
    return meta


def parse_xml(data: bytes, name: str) -> tuple[bool, ET.Element | None, str | None]:
    try:
        return True, ET.fromstring(data), None
    except ET.ParseError as e:
        return False, None, f"{name}: {e}"


def xml_namespaces(data: bytes) -> set[str]:
    try:
        root = ET.fromstring(data)
    except ET.ParseError:
        return set()
    ns = set()
    for event, elem in ET.iterparse(Path('/dev/null'), events=('start-ns',)):
        pass
    # collect from root tag and attributes
    if root.tag.startswith('{'):
        ns.add(root.tag.split('}')[0][1:])
    for k, v in root.attrib.items():
        if k.startswith('{') and k.endswith('}xmlns') or k.startswith('xmlns'):
            pass
    # regex fallback for xmlns declarations
    for m in re.finditer(r'xmlns(?::\w+)?="([^"]+)"', data.decode('utf-8', errors='replace')):
        ns.add(m.group(1))
    return ns


def resolve_rel_target(base_part: str, target: str) -> str:
    if target.startswith('/'):
        return target.lstrip('/')
    base_dir = '/'.join(base_part.split('/')[:-1])
    combined = f"{base_dir}/{target}" if base_dir else target
    parts = []
    for seg in combined.split('/'):
        if seg == '..':
            if parts:
                parts.pop()
        elif seg and seg != '.':
            parts.append(seg)
    return '/'.join(parts)


def analyze_relationships(parts: dict[str, bytes]) -> list[str]:
    issues = []
    rel_files = sorted(n for n in parts if n.endswith('.rels'))
    for rel_path in rel_files:
        ok, root, err = parse_xml(parts[rel_path], rel_path)
        if not ok:
            issues.append(f"INVALID rels: {err}")
            continue
        base_part = rel_path.replace('_rels/', '').replace('.rels', '')
        for rel in root.findall('rel:Relationship', NS):
            rid = rel.get('Id')
            target = rel.get('Target')
            rtype = rel.get('Type')
            mode = rel.get('TargetMode', 'Internal')
            if not target:
                issues.append(f"{rel_path}: Relationship {rid} missing Target")
                continue
            if mode == 'External':
                continue
            resolved = resolve_rel_target(base_part, target)
            if resolved not in parts and not any(n.endswith('/' + resolved.split('/')[-1]) for n in parts):
                issues.append(f"{rel_path}: {rid} -> {target} (resolved {resolved}) TARGET MISSING")
    return issues


def content_types_overrides(parts: dict[str, bytes]) -> tuple[dict[str, str], list[str]]:
    issues = []
    ct_path = '[Content_Types].xml'
    ok, root, err = parse_xml(parts[ct_path], ct_path)
    if not ok:
        return {}, [f"INVALID content types: {err}"]
    overrides = {}
    defaults = {}
    for d in root.findall('ct:Default', NS):
        defaults[d.get('Extension')] = d.get('ContentType')
    for o in root.findall('ct:Override', NS):
        overrides[o.get('PartName').lstrip('/')] = o.get('ContentType')
    # every non-directory part should be covered
    for name, data in parts.items():
        if name.endswith('/'):
            continue
        part_key = name
        if part_key in overrides:
            continue
        ext = part_key.rsplit('.', 1)[-1].lower() if '.' in part_key else ''
        if ext not in defaults:
            issues.append(f"[Content_Types].xml: no override/default for part {name}")
    return overrides, issues


def slide_shape_inventory(slide_xml: bytes, slide_name: str) -> dict:
    ok, root, err = parse_xml(slide_xml, slide_name)
    if not ok:
        return {"parse_ok": False, "error": err}
    inventory = {
        "parse_ok": True,
        "shapes": [],
        "ids": [],
        "names": [],
        "graphic_frames": [],
        "pictures": [],
        "groups": [],
        "connectors": [],
    }
    sp_tree = root.find('p:cSld/p:spTree', NS)
    if sp_tree is None:
        inventory["error"] = "missing p:spTree"
        return inventory

    def walk(elem, depth=0):
        tag = elem.tag.split('}')[-1]
        if tag == 'sp':
            cnv = elem.find('.//p:cNvPr', NS)
            sid = cnv.get('id') if cnv is not None else None
            sname = cnv.get('name') if cnv is not None else None
            texts = ''.join(t.text or '' for t in elem.findall('.//a:t', NS))
            inventory['shapes'].append({"id": sid, "name": sname, "text_preview": texts[:40]})
            if sid:
                inventory['ids'].append(sid)
            if sname:
                inventory['names'].append(sname)
        elif tag == 'graphicFrame':
            cnv = elem.find('.//p:cNvPr', NS)
            inventory['graphic_frames'].append(cnv.get('name') if cnv is not None else None)
        elif tag == 'pic':
            cnv = elem.find('.//p:cNvPr', NS)
            inventory['pictures'].append(cnv.get('name') if cnv is not None else None)
        elif tag == 'grpSp':
            cnv = elem.find('.//p:cNvPr', NS)
            inventory['groups'].append(cnv.get('name') if cnv is not None else None)
        elif tag == 'cxnSp':
            cnv = elem.find('.//p:cNvPr', NS)
            inventory['connectors'].append(cnv.get('name') if cnv is not None else None)
        for child in elem:
            walk(child, depth + 1)

    for child in sp_tree:
        walk(child)
    return inventory


def compare_inventories(a: dict, b: dict, label_a: str, label_b: str) -> list[str]:
    diffs = []
    if not a.get('parse_ok') or not b.get('parse_ok'):
        return [f"parse failure {label_a}={a.get('error')} {label_b}={b.get('error')}"]
    if len(a['shapes']) != len(b['shapes']):
        diffs.append(f"shape count {label_a}={len(a['shapes'])} {label_b}={len(b['shapes'])}")
    id_a, id_b = Counter(a['ids']), Counter(b['ids'])
    dup_a = [i for i, c in id_a.items() if c > 1]
    dup_b = [i for i, c in id_b.items() if c > 1]
    if dup_a:
        diffs.append(f"{label_a} duplicate ids: {dup_a}")
    if dup_b:
        diffs.append(f"{label_b} duplicate ids: {dup_b}")
    if id_a != id_b:
        only_a = set(id_a) - set(id_b)
        only_b = set(id_b) - set(id_a)
        if only_a or only_b:
            diffs.append(f"id set diff only_{label_a}={sorted(only_a)[:10]} only_{label_b}={sorted(only_b)[:10]}")
    name_a = [s['name'] for s in a['shapes']]
    name_b = [s['name'] for s in b['shapes']]
    if name_a != name_b:
        diffs.append(f"shape name order/count differs")
    return diffs


def strip_a_t(xml: str) -> str:
    return re.sub(r'<a:t>[^<]*</a:t>', '<a:t></a:t>', xml)


def first_xml_diff(a: str, b: str, context: int = 60) -> str | None:
    if a == b:
        return None
    limit = min(len(a), len(b))
    for i in range(limit):
        if a[i] != b[i]:
            start = max(0, i - context)
            return f"offset {i}: A={repr(a[start:i+context])} | B={repr(b[start:i+context])}"
    if len(a) != len(b):
        return f"length diff A={len(a)} B={len(b)} common_prefix={limit}"
    return "different but same length?"


def main() -> int:
    print("=" * 72)
    print("MIR PPTX FORENSIC COMPARISON")
    print("=" * 72)

    packages = {}
    metas = {}
    for label, path in FILES.items():
        if not path.exists():
            print(f"MISSING: {label} -> {path}")
            return 1
        packages[label] = load_package(path)
        metas[label] = load_zip_meta(path)
        print(f"{label:16} {path.name:55} {path.stat().st_size:>8} bytes  parts={len(packages[label])}")

    labels = list(FILES.keys())

    # 1. Zip entry existence matrix
    print("\n" + "=" * 72)
    print("1. ZIP ENTRY EXISTENCE")
    print("=" * 72)
    all_names = sorted(set().union(*(set(packages[l]) for l in labels)))
    for name in all_names:
        row = {l: name in packages[l] for l in labels}
        if not all(row.values()):
            print(f"  {name:60} template={row['template']} jszip={row['jszip_export']} automizer={row['automizer_spike']}")

    only = {l: sorted(set(packages[l]) - set(packages['template'])) for l in labels if l != 'template'}
    missing = {l: sorted(set(packages['template']) - set(packages[l])) for l in labels if l != 'template'}
    for l in labels:
        if l == 'template':
            continue
        if only[l]:
            print(f"\n  Only in {l} ({len(only[l])}):")
            for n in only[l][:30]:
                print(f"    + {n}")
            if len(only[l]) > 30:
                print(f"    ... {len(only[l])-30} more")
        if missing[l]:
            print(f"\n  Missing from {l} vs template ({len(missing[l])}):")
            for n in missing[l][:30]:
                print(f"    - {n}")

    # 2. Byte-level diff vs template
    print("\n" + "=" * 72)
    print("2. BYTE-LEVEL DIFF vs TEMPLATE (non-directory parts)")
    print("=" * 72)
    template_parts = {k: v for k, v in packages['template'].items() if not k.endswith('/')}
    for label in ['jszip_export', 'automizer_spike']:
        changed = []
        identical = []
        for name, tdata in sorted(template_parts.items()):
            if name not in packages[label]:
                changed.append((name, 'MISSING', None, None))
                continue
            edata = packages[label][name]
            if tdata != edata:
                changed.append((name, 'DIFF', len(tdata), len(edata)))
            else:
                identical.append(name)
        print(f"\n  {label}: {len(identical)} identical, {len(changed)} changed/missing")
        for name, status, ts, es in changed:
            th = sha256(tdata := template_parts.get(name, b''))[:12] if status != 'MISSING' else '-'
            eh = sha256(packages[label][name])[:12] if name in packages[label] else '-'
            print(f"    {status:7} {name:50} size {ts}->{es} sha {th}/{eh}")

    # 3. XML validity all packages
    print("\n" + "=" * 72)
    print("3. XML VALIDITY (ET.fromstring)")
    print("=" * 72)
    invalid = defaultdict(list)
    valid_counts = {}
    for label, parts in packages.items():
        xml_parts = sorted(n for n in parts if n.endswith('.xml') and not n.endswith('/'))
        bad = []
        for part in xml_parts:
            ok, _, err = parse_xml(parts[part], part)
            if not ok:
                bad.append(err)
        invalid[label] = bad
        valid_counts[label] = (len(xml_parts) - len(bad), len(xml_parts))
        print(f"  {label:16} {valid_counts[label][0]}/{valid_counts[label][1]} valid")
        for err in bad:
            print(f"    INVALID: {err}")

    # 4. Content types
    print("\n" + "=" * 72)
    print("4. [Content_Types].xml")
    print("=" * 72)
    for label in labels:
        overrides, issues = content_types_overrides(packages[label])
        print(f"  {label:16} overrides={len(overrides)} issues={len(issues)}")
        for i in issues[:10]:
            print(f"    {i}")

    # 5. Relationships
    print("\n" + "=" * 72)
    print("5. RELATIONSHIP TARGET VALIDATION")
    print("=" * 72)
    for label in labels:
        issues = analyze_relationships(packages[label])
        print(f"  {label:16} {len(issues)} issue(s)")
        for i in issues[:20]:
            print(f"    {i}")

    # 6. Slide shape trees
    print("\n" + "=" * 72)
    print("6. SLIDE SHAPE TREES")
    print("=" * 72)
    slide_paths = sorted(n for n in packages['template'] if re.match(r'ppt/slides/slide\d+\.xml', n))
    inventories = {}
    for label in labels:
        inventories[label] = {}
        for sp in slide_paths:
            if sp in packages[label]:
                inventories[label][sp] = slide_shape_inventory(packages[label][sp], sp)

    for sp in slide_paths:
        print(f"\n  {sp}:")
        for label in labels:
            inv = inventories[label].get(sp, {"parse_ok": False, "error": "missing"})
            if inv.get('parse_ok'):
                dupes = [i for i, c in Counter(inv['ids']).items() if c > 1]
                print(f"    {label:16} shapes={len(inv['shapes'])} ids={len(inv['ids'])} dupes={dupes} gf={len(inv['graphic_frames'])} pic={len(inv['pictures'])}")
            else:
                print(f"    {label:16} ERROR: {inv.get('error')}")
        for other in ['jszip_export', 'automizer_spike']:
            diffs = compare_inventories(inventories['template'].get(sp, {}), inventories[other].get(sp, {}), 'template', other)
            if diffs:
                print(f"    template vs {other}: {diffs}")

    # 7. Structural diff of changed XML (strip text)
    print("\n" + "=" * 72)
    print("7. STRUCTURAL XML DIFF (text stripped from <a:t>)")
    print("=" * 72)
    for label in ['jszip_export', 'automizer_spike']:
        print(f"\n  vs template ({label}):")
        for name, tdata in sorted(template_parts.items()):
            if not name.endswith('.xml'):
                continue
            if name not in packages[label]:
                continue
            t = tdata.decode('utf-8')
            e = packages[label][name].decode('utf-8')
            if t == e:
                continue
            ts = strip_a_t(t)
            es = strip_a_t(e)
            if ts != es:
                fd = first_xml_diff(ts, es)
                print(f"    STRUCTURAL {name}: {fd}")
            else:
                # text-only diff - show a:t changes
                t_texts = re.findall(r'<a:t>([^<]*)</a:t>', t)
                e_texts = re.findall(r'<a:t>([^<]*)</a:t>', e)
                changed_texts = [(a, b) for a, b in zip(t_texts, e_texts) if a != b]
                extra = len(t_texts) - len(e_texts)
                print(f"    TEXT-ONLY {name}: {len(changed_texts)} a:t value changes, a:t count {len(t_texts)}->{len(e_texts)}")

    # 8. jszip_export specific: first non-text structural anomaly in slide1
    print("\n" + "=" * 72)
    print("8. jszip_export slide1 DEEP DIFF (shape-by-shape txBody)")
    print("=" * 72)
    s1t = packages['template']['ppt/slides/slide1.xml'].decode('utf-8')
    s1e = packages['jszip_export']['ppt/slides/slide1.xml'].decode('utf-8')

    def extract_shapes(xml):
        return re.findall(r'<p:sp>(?:(?!</p:sp>).)*?</p:sp>', xml, re.DOTALL)

    shapes_t = {re.search(r'name="([^"]+)"', s).group(1): s for s in extract_shapes(s1t)}
    shapes_e = {re.search(r'name="([^"]+)"', s).group(1): s for s in extract_shapes(s1e)}

    structural_shape_diffs = []
    text_only_diffs = []
    for name in sorted(set(shapes_t) | set(shapes_e)):
        if name not in shapes_t or name not in shapes_e:
            structural_shape_diffs.append((name, 'missing in one package'))
            continue
        st = strip_a_t(shapes_t[name])
        se = strip_a_t(shapes_e[name])
        if st != se:
            structural_shape_diffs.append((name, first_xml_diff(st, se, 40)))
        elif shapes_t[name] != shapes_e[name]:
            text_only_diffs.append(name)

    print(f"  Structural shape diffs: {len(structural_shape_diffs)}")
    for name, detail in structural_shape_diffs[:25]:
        print(f"    {name}: {detail}")
    print(f"  Text-only shape diffs: {len(text_only_diffs)}")
    for name in text_only_diffs[:20]:
        tt = re.findall(r'<a:t>([^<]*)</a:t>', shapes_t[name])
        et = re.findall(r'<a:t>([^<]*)</a:t>', shapes_e[name])
        print(f"    {name}: {tt} -> {et}")

    # 9. Compare automizer spike structure (known good) vs jszip
    print("\n" + "=" * 72)
    print("9. automizer_spike (GOOD) vs jszip_export package completeness")
    print("=" * 72)
    auto_only = set(packages['automizer_spike']) - set(packages['jszip_export'])
    jszip_only = set(packages['jszip_export']) - set(packages['automizer_spike'])
    print(f"  Parts only in automizer: {len(auto_only)}")
    for n in sorted(auto_only)[:25]:
        print(f"    + {n}")
    print(f"  Parts only in jszip: {len(jszip_only)}")
    for n in sorted(jszip_only):
        print(f"    + {n}")

    # 10. Media
    print("\n" + "=" * 72)
    print("10. MEDIA PARTS")
    print("=" * 72)
    for label in labels:
        media = sorted(n for n in packages[label] if n.startswith('ppt/media/'))
        print(f"  {label:16} {media}")
        for m in media:
            print(f"    {m} sha256={sha256(packages[label][m])[:16]}")

    # 11. Zip compression / CRC differences for identical logical content
    print("\n" + "=" * 72)
    print("11. ZIP METADATA (compression) for changed parts")
    print("=" * 72)
    for name in sorted(template_parts):
        if name not in packages['jszip_export']:
            continue
        if packages['template'][name] == packages['jszip_export'][name]:
            continue
        mt = metas['template'].get(name, {})
        me = metas['jszip_export'].get(name, {})
        print(f"  {name}: compress_type {mt.get('compress_type')}->{me.get('compress_type')} CRC {mt.get('CRC')}->{me.get('CRC')}")

    # 12. Template self-check - does template open issues correlate with retreat row?
    print("\n" + "=" * 72)
    print("12. TEMPLATE-ONLY ANOMALIES (retreat row patch)")
    print("=" * 72)
    inv = inventories['template'].get('ppt/slides/slide1.xml', {})
    retreat_shapes = [s for s in inv.get('shapes', []) if 'retreat' in (s.get('name') or '').lower()]
    print(f"  Retreat-related shapes in template: {len(retreat_shapes)}")
    for s in retreat_shapes:
        print(f"    id={s['id']} name={s['name']} text={s['text_preview']!r}")

    # Check creationId duplicates across slide1
    s1 = packages['template']['ppt/slides/slide1.xml'].decode('utf-8')
    creation_ids = re.findall(r'creationId[^>]*id="\{([^}]+)\}"', s1)
    dup_creation = [i for i, c in Counter(creation_ids).items() if c > 1]
    print(f"  Duplicate a16:creationId in template slide1: {len(dup_creation)}")
    if dup_creation:
        print(f"    examples: {dup_creation[:10]}")

    # Compare creation ids between template and jszip export in slide1
    s1e = packages['jszip_export']['ppt/slides/slide1.xml'].decode('utf-8')
    if strip_a_t(s1) == strip_a_t(s1e):
        print("  slide1 structure (text stripped) IDENTICAL between template and jszip_export")
    else:
        print("  slide1 structure differs beyond text between template and jszip_export")

    print("\n" + "=" * 72)
    print("DONE")
    print("=" * 72)
    return 0


if __name__ == '__main__':
    sys.exit(main())
