#!/usr/bin/env python3
"""
One-time migration: move param:hasFiberMassFraction from laminat to tape entities.

Part 1 is already correct (no fraction on laminat:1, fraction on tape:1-6).
This script handles parts 2-169.

Steps:
  1. Build {N -> fraction} from laminat:N entities that still carry the property.
  2. Build {tape_uri -> fraction} by reading each layup:N's prov:value tape list.
  3. Remove param:hasFiberMassFraction from all laminat blocks (they end with ] ; not ] .).
  4. Add param:hasFiberMassFraction to every tape entity block missing it.
"""

import re
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
TTL_PATH = os.path.join(SCRIPT_DIR, "material.ttl")


def main():
    with open(TTL_PATH, 'r', encoding='utf-8') as f:
        text = f.read()

    count_before = text.count('param:hasFiberMassFraction')
    print(f"param:hasFiberMassFraction occurrences before: {count_before}")

    # -------------------------------------------------------------------------
    # Step 1: Build {N -> fraction} from laminat:N entities.
    # The fraction block on laminats is always followed by ] ; (more predicates follow).
    # .{0,800}? limits the DOTALL scan to avoid crossing subject boundaries.
    # -------------------------------------------------------------------------
    laminat_frac_re = re.compile(
        r'laminat:(\d+) a geo:Feature, prov:Entity ;.{0,800}?'
        r'param:hasFiberMassFraction \[\n'
        r'        a qudt:Quantity ;\n'
        r'        qudt:hasQuantityKind quantitykind:MassFraction ;\n'
        r'        qudt:hasUnit unit:PERCENT ;\n'
        r'        qudt:value (\d+)\n'
        r'    \]',
        re.DOTALL,
    )
    laminat_fraction: dict[int, int] = {}
    for m in laminat_frac_re.finditer(text):
        laminat_fraction[int(m.group(1))] = int(m.group(2))
    print(f"Step 1: {len(laminat_fraction)} laminat entities still carry the fraction")

    # -------------------------------------------------------------------------
    # Step 2: Build {tape_uri -> fraction} via layup:N -> prov:value tape list.
    # layup:1 is skipped because laminat:1 was already migrated (not in laminat_fraction).
    # -------------------------------------------------------------------------
    layup_re = re.compile(
        r'layup:(\d+) a prov:Entity\b.*?prov:value \(([^)]+)\)',
        re.DOTALL,
    )
    tape_fraction: dict[str, int] = {}
    for m in layup_re.finditer(text):
        n = int(m.group(1))
        if n not in laminat_fraction:
            continue
        fraction = laminat_fraction[n]
        for tape_uri in m.group(2).split():
            tape_fraction[tape_uri.strip()] = fraction
    print(f"Step 2: {len(tape_fraction)} tape entities to receive the fraction")

    # -------------------------------------------------------------------------
    # Step 3: Remove param:hasFiberMassFraction from laminat blocks.
    # Pattern targets the predicate including its leading newline+indent and
    # trailing ] ; — leaving the surrounding predicates properly connected.
    # Tape entities in part 1 end with ] . (not ] ;) so they are untouched.
    # -------------------------------------------------------------------------
    frac_remove_re = re.compile(
        r'\n    param:hasFiberMassFraction \[\n'
        r'        a qudt:Quantity ;\n'
        r'        qudt:hasQuantityKind quantitykind:MassFraction ;\n'
        r'        qudt:hasUnit unit:PERCENT ;\n'
        r'        qudt:value \d+\n'
        r'    \] ;'
    )
    text = frac_remove_re.sub('', text)
    removed = count_before - text.count('param:hasFiberMassFraction')
    print(f"Step 3: removed {removed} fraction blocks from laminat entities")

    # -------------------------------------------------------------------------
    # Step 4: Add param:hasFiberMassFraction to tape entity blocks.
    # Matches tape blocks whose last predicate is param:fiberType "X" .
    # (Part 1 tapes already have the fraction and end with ] . — not matched.)
    # -------------------------------------------------------------------------
    tape_re = re.compile(
        r'(tape:\d+) a prov:Entity ;\n'
        r'    param:polymer "([^"]+)" ;\n'
        r'    param:fiberType "([^"]+)" \.'
    )

    def add_fraction(m: re.Match) -> str:
        tape_uri = m.group(1)
        if tape_uri not in tape_fraction:
            return m.group(0)
        frac = tape_fraction[tape_uri]
        return (
            f'{tape_uri} a prov:Entity ;\n'
            f'    param:polymer "{m.group(2)}" ;\n'
            f'    param:fiberType "{m.group(3)}" ;\n'
            f'    param:hasFiberMassFraction [\n'
            f'        a qudt:Quantity ;\n'
            f'        qudt:hasQuantityKind quantitykind:MassFraction ;\n'
            f'        qudt:hasUnit unit:PERCENT ;\n'
            f'        qudt:value {frac}\n'
            f'    ] .'
        )

    text = tape_re.sub(add_fraction, text)
    count_after = text.count('param:hasFiberMassFraction')
    added = count_after - (count_before - removed)
    print(f"Step 4: added {added} fraction blocks to tape entities")
    print(f"param:hasFiberMassFraction occurrences after:  {count_after}")

    with open(TTL_PATH, 'w', encoding='utf-8') as f:
        f.write(text)
    print("Done. material.ttl updated.")


if __name__ == '__main__':
    main()
