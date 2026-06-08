#!/usr/bin/env python3
"""
Generates RDF Turtle triples for material.csv rows 3-169 (CSV lines 4-170, parts 3-169).
Appends to data/material.ttl.

URI convention: n = csv_line - 1  →  part:n, laminat:n, layup:n, extract:n
Tape and pos counters are dense (no gaps for skipped rows).
Skipped rows (blend & Folie materials) get only an extract:n changelog entry.
"""

import csv
import os
import re

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.path.join(SCRIPT_DIR, "sources", "studie-1", "material.csv")
TTL_PATH = os.path.join(SCRIPT_DIR, "material.ttl")

LAYUP_TABLE = {
    "[0/60/120]s":            [0, 60, 120, 120, 60, 0],
    "[0/45/-45/90]s":         [0, 45, -45, 90, 90, -45, 45, 0],
    "[0/90]2s":               [0, 90, 90, 0, 0, 90, 90, 0],
    "[0/0/90/90/0/0/90/90]":  [0, 0, 90, 90, 0, 0, 90, 90],
    "[90/90/0/0/90/90/0/0]":  [90, 90, 0, 0, 90, 90, 0, 0],
    "[0/0/0/90/90/0/90/0]":   [0, 0, 0, 90, 90, 0, 90, 0],
    "[90/90/90/0/0/90/0/90]": [90, 90, 90, 0, 0, 90, 0, 90],
}

NEEDLE_POINTS = [
    (190.0, 100.0), (190.0, -100.0),
    (-190.0, 100.0), (-190.0, -100.0),
    (100.0, 190.0), (-100.0, 190.0),
    (100.0, -190.0), (-100.0, -190.0),
]

# Turtle triple-quote delimiter for long literals
TQ = '"""'

AGENT_ASSOCIATION = """\
    prov:qualifiedAssociation [
        a prov:Association ;
        prov:agent [
            a prov:SoftwareAgent ;
            rdfs:label "Claude Sonnet 4.6" ;
            rdfs:comment "Anthropic large language model; model ID claude-sonnet-4-6." ;
            dcterms:identifier "claude-sonnet-4-6"
        ] ;
        prov:hadPlan extract:plan_remaining
    ]"""


# ---------------------------------------------------------------------------
# Parsing helpers
# ---------------------------------------------------------------------------

def parse_thickness(s):
    """Returns (float | None, flagged: bool)."""
    s = s.strip().strip('"')
    if not s:
        return None, False
    flagged = '?' in s
    s = s.replace(',', '.').replace('?', '').strip()
    if not s:
        return None, False
    try:
        return float(s), flagged
    except ValueError:
        return None, True


def parse_panel_id(s):
    s = s.strip()
    return s if s else None


def parse_dimensions(s):
    """Returns (length_mm, width_mm) or (None, None) if blank."""
    s = s.strip()
    if not s:
        return None, None
    m = re.match(r'(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)', s, re.IGNORECASE)
    if m:
        return float(m.group(1)), float(m.group(2))
    return None, None


def parse_material(s):
    """Returns (label, polymer, fiber_type, fiber_fraction_int) or None if skip."""
    label = s.strip()
    if '&' in label:
        return None
    m = re.search(r'(PA\d+)-GF(\d+)', label)
    if m:
        return label, m.group(1), "GF", int(m.group(2))
    return None


def skip_reason(material, layup):
    """Returns a skip reason string or None if the row should be processed."""
    mat = material.strip()
    lay = layup.strip()
    if '&' in mat and 'Folie' in mat:
        return (
            f"material '{mat}' contains a Folie (polymer film) layer "
            "requiring a separate modeling decision."
        )
    if '&' in mat:
        return (
            f"material '{mat}' is a fibre-blend composition "
            "requiring a separate modeling decision."
        )
    if lay not in LAYUP_TABLE and lay:
        return f"layup '{lay}' contains unsupported ply types (e.g. Folie)."
    return None


# ---------------------------------------------------------------------------
# Turtle formatting helpers
# ---------------------------------------------------------------------------

def fmt(f):
    """Format a float for Turtle output: always include decimal point."""
    if f == int(f):
        return f"{int(f)}.0"
    return str(round(f, 4))


def ttl_str(s):
    """Escape a string for use inside Turtle double-quoted literals."""
    return s.replace('\\', '\\\\').replace('"', '\\"')


def subject_block(subject_type_decl, predicates):
    """
    Build a Turtle subject block.
    subject_type_decl: e.g. "extract:3 a prov:Activity"
    predicates: list of indented predicate-object strings (without ; or .)
    Returns complete block ending with ' .\n\n'
    """
    lines = [subject_type_decl + " ;"]
    for i, pred in enumerate(predicates):
        sep = " ;" if i < len(predicates) - 1 else " ."
        lines.append(pred + sep)
    return "\n".join(lines) + "\n\n"


# ---------------------------------------------------------------------------
# Block emitters
# ---------------------------------------------------------------------------

def emit_provenance_header():
    plan_desc = (
        "Same CSV to RDF mapping rules as extract:plan2. "
        "Additional rules: (1) comma-decimal thickness normalized silently; "
        "(2) blank fields omitted with changelog note; "
        "(3) rows with blend materials or Folie layer skipped with changelog note; "
        "(4) 8-ply layup decoding for [0/45/-45/90]s, [0/90]2s, "
        "and four explicit 8-ply configs."
    )
    lines = [
        "",
        "# Batch Provenance (Lines 4–170)",
        "",
        subject_block(
            "extract:prompt_remaining a prov:Entity",
            [
                '    rdfs:label "User Prompt – Remaining Material Extractions (Lines 4–170)"',
                '    dcterms:description "Write a plan on how you would do that for all the remaining rows in the CSV."',
            ],
        ).rstrip("\n"),
        "",
        subject_block(
            "extract:plan_remaining a prov:Plan",
            [
                '    rdfs:label "Material RDF Extraction Plan – Rows 4–170"',
                f'    dcterms:description {TQ}{plan_desc}{TQ}',
                "    prov:wasDerivedFrom extract:prompt_remaining",
            ],
        ).rstrip("\n"),
        "",
    ]
    return "\n".join(lines) + "\n"


def emit_skip_block(n, csv_line, reason):
    block = subject_block(
        f"extract:{n} a prov:Activity",
        [
            f'    rdfs:label "RDF Triple Construction {n}"',
            f'    rdfs:comment "Row {csv_line} in material.csv was skipped: {ttl_str(reason)} No triples generated."',
            AGENT_ASSOCIATION,
        ],
    )
    return f"### Part {n}\n\n" + block


def emit_part_block(n, tape_start, pos_start, thickness, flagged_thickness,
                    panel_id, material_label, polymer, fiber_type, fiber_fraction,
                    dim_l, dim_w, layup_config, plies, csv_line, comments):
    ply_count = len(plies)
    tape_uris = [f"tape:{tape_start + i}" for i in range(ply_count)]
    pos_uris = [f"pos:{pos_start + i}" for i in range(8)]

    # ---- extract:n ----
    generated_items = (
        [f"part:{n}", f"laminat:{n}"] + pos_uris + [f"layup:{n}"] + tape_uris
    )
    comment_preds = [
        f'    rdfs:comment "Construction of RDF triples for part {n} from material.csv line {csv_line}."'
    ]
    if comments:
        for c in comments:
            comment_preds.append(f'    rdfs:comment "{ttl_str(c)}"')
    else:
        comment_preds.append('    rdfs:comment "No issues encountered."')

    extract_preds = (
        [f'    rdfs:label "RDF Triple Construction {n}"']
        + comment_preds
        + [
            AGENT_ASSOCIATION,
            f'    prov:generated {", ".join(generated_items)}',
        ]
    )
    extract_ttl = subject_block(f"extract:{n} a prov:Activity", extract_preds)

    # ---- part:n ----
    part_ttl = subject_block(
        f"part:{n} a prov:Entity, sosa:Sample",
        [
            f"    sosa:isResultOf run:{n}",
            f"    sosa:isSampleOf feature:processMaturityLevel",
            f"    prov:wasDerivedFrom laminat:{n}",
            (
                f"    prov:qualifiedDerivation [\n"
                f"        a prov:Derivation ;\n"
                f"        prov:entity laminat:{n} ;\n"
                f"        prov:hadActivity run:{n}\n"
                f"    ]"
            ),
        ],
    )

    # ---- laminat:n ----
    size_preds = []
    if dim_l is not None:
        size_preds.append(
            f"    geo:hasSize [\n"
            f"        a qudt:Quantity ;\n"
            f"        qudt:hasQuantityKind quantitykind:Length ;\n"
            f"        qudt:hasUnit unit:MilliM ;\n"
            f"        qudt:value {fmt(dim_l)}\n"
            f"    ]"
        )
        size_preds.append(
            f"    geo:hasSize [\n"
            f"        a qudt:Quantity ;\n"
            f"        qudt:hasQuantityKind quantitykind:Width ;\n"
            f"        qudt:hasUnit unit:MilliM ;\n"
            f"        qudt:value {fmt(dim_w)}\n"
            f"    ]"
        )
    if thickness is not None:
        size_preds.append(
            f"    geo:hasSize [\n"
            f"        a qudt:Quantity ;\n"
            f"        qudt:hasQuantityKind quantitykind:Thickness ;\n"
            f"        qudt:hasUnit unit:MilliM ;\n"
            f"        qudt:value {fmt(thickness)}\n"
            f"    ]"
        )

    laminat_preds = [f'    rdfs:label "{ttl_str(material_label)}"']
    if panel_id:
        laminat_preds.append(f'    dcterms:identifier "{ttl_str(panel_id)}"')
    laminat_preds.append(f"    prov:wasDerivedFrom layup:{n}")
    laminat_preds.extend(size_preds)
    laminat_preds.append(
        f"    param:hasFiberMassFraction [\n"
        f"        a qudt:Quantity ;\n"
        f"        qudt:hasQuantityKind quantitykind:MassFraction ;\n"
        f"        qudt:hasUnit unit:PERCENT ;\n"
        f"        qudt:value {fiber_fraction}\n"
        f"    ]"
    )
    laminat_preds.append("    pos:hasPositionalReference pos:laminatReferencePoint")
    laminat_preds.append(f'    param:hasNeedlePoint {", ".join(pos_uris)}')
    laminat_ttl = subject_block(f"laminat:{n} a geo:Feature, prov:Entity", laminat_preds)

    # ---- pos:N blocks ----
    pos_ttl = ""
    for i, (x, y) in enumerate(NEEDLE_POINTS):
        pn = pos_start + i
        pos_ttl += subject_block(
            f"pos:{pn} a qudt:Quantity, prov:Entity",
            [
                "    qudt:hasQuantityKind quantitykind:PositionVector",
                (
                    f"    qudt:quantityValue [\n"
                    f"        a qudt:Quantity ;\n"
                    f"        qudt:hasUnit unit:MilliM ;\n"
                    f"        qudt:value ( {fmt(x)} {fmt(y)} )\n"
                    f"    ]"
                ),
                "    prov:wasDerivedFrom pos:laminatReferencePoint",
            ],
        )

    # ---- layup:n ----
    qual_deriv_preds = []
    for tape_uri, angle in zip(tape_uris, plies):
        qual_deriv_preds.append(
            f"    prov:qualifiedDerivation [\n"
            f"        a prov:Derivation ;\n"
            f"        prov:entity {tape_uri} ;\n"
            f"        param:fiberOrientation [\n"
            f"            a qudt:Quantity ;\n"
            f"            qudt:hasUnit unit:DEG ;\n"
            f"            qudt:value {angle}\n"
            f"        ]\n"
            f"    ]"
        )

    layup_preds = (
        [
            f'    rdfs:label "{ttl_str(layup_config)}"',
            f'    prov:value ( {" ".join(tape_uris)} )',
            f'    prov:wasDerivedFrom {", ".join(tape_uris)}',
        ]
        + qual_deriv_preds
    )
    layup_ttl = subject_block(f"layup:{n} a prov:Entity", layup_preds)

    # ---- tape blocks ----
    tape_ttl = ""
    for tape_uri in tape_uris:
        tape_ttl += subject_block(
            f"{tape_uri} a prov:Entity",
            [
                f'    param:polymer "{polymer}"',
                f'    param:fiberType "{fiber_type}"',
            ],
        )

    return (
        f"### Part {n}\n\n"
        + extract_ttl
        + "#### Part entity\n\n"
        + part_ttl
        + "#### Laminat\n\n"
        + laminat_ttl
        + pos_ttl
        + "#### Layup\n\n"
        + layup_ttl
        + "#### Tape\n\n"
        + tape_ttl
    )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    tape_counter = 13   # tape:1–12 used by parts 1 and 2
    pos_counter = 17    # pos:1–16 used by parts 1 and 2

    with open(CSV_PATH, newline='', encoding='utf-8') as f:
        reader = csv.reader(f)
        rows = list(reader)

    # rows[0] = header; rows[1] = part 1 (done); rows[2] = part 2 (done)
    # Process rows[3]..rows[168]  (CSV lines 4–170)

    with open(TTL_PATH, 'a', encoding='utf-8') as out:
        out.write(emit_provenance_header())

        last_n = None
        for row_idx in range(3, len(rows)):
            csv_line = row_idx + 1   # 1-indexed CSV line
            n = csv_line - 1         # entity URI index (part:n, laminat:n, …)
            last_n = n

            row = rows[row_idx]
            while len(row) < 5:
                row.append('')

            thickness_raw = row[0]
            panel_raw     = row[1]
            material_raw  = row[2].strip()
            layup_raw     = row[3].strip()
            dim_raw       = row[4]

            reason = skip_reason(material_raw, layup_raw)
            if reason:
                out.write(emit_skip_block(n, csv_line, reason))
                continue

            thickness, flagged_thickness = parse_thickness(thickness_raw)
            panel_id = parse_panel_id(panel_raw)
            dim_l, dim_w = parse_dimensions(dim_raw)
            mat = parse_material(material_raw)

            if mat is None:
                out.write(emit_skip_block(
                    n, csv_line,
                    f"material '{material_raw}' could not be parsed."
                ))
                continue

            plies = LAYUP_TABLE.get(layup_raw)
            if plies is None:
                out.write(emit_skip_block(
                    n, csv_line,
                    f"layup '{layup_raw}' is not in the supported layup table."
                ))
                continue

            mat_label, polymer, fiber_type, fiber_fraction = mat

            # Collect data-quality comments
            issue_comments = []
            if thickness is None and panel_id is None:
                issue_comments.append(
                    "Thickness and Panel Denotation are blank in source data; "
                    "geo:hasSize (thickness) and dcterms:identifier omitted."
                )
            elif thickness is None:
                issue_comments.append(
                    "Thickness is blank in source data; geo:hasSize (thickness) omitted."
                )
            if flagged_thickness and thickness is not None:
                issue_comments.append(
                    f"Thickness value was flagged in source data (contained '?'); "
                    f"normalized to {fmt(thickness)} mm; data quality uncertain."
                )
            if dim_l is None:
                issue_comments.append(
                    "Dimensions are blank in source data; "
                    "geo:hasSize (length/width) omitted."
                )

            out.write(emit_part_block(
                n=n,
                tape_start=tape_counter,
                pos_start=pos_counter,
                thickness=thickness,
                flagged_thickness=flagged_thickness,
                panel_id=panel_id,
                material_label=mat_label,
                polymer=polymer,
                fiber_type=fiber_type,
                fiber_fraction=fiber_fraction,
                dim_l=dim_l,
                dim_w=dim_w,
                layup_config=layup_raw,
                plies=plies,
                csv_line=csv_line,
                comments=issue_comments,
            ))

            tape_counter += len(plies)
            pos_counter += 8

    print(f"Done.")
    print(f"  Last part n={last_n}  (CSV line {last_n + 1})")
    print(f"  Next tape:  tape:{tape_counter}")
    print(f"  Next pos:   pos:{pos_counter}")


if __name__ == "__main__":
    main()
