#!/usr/bin/env python3
"""Append RDF triples for all remaining workflow runs from run.csv (Trial No. 3+).

Edge cases handled:
- Rows with no Trial No.: skipped
- Trials 1 and 2: skipped (already hand-written in runs.ttl)
- Duplicate Trial No. 37: second occurrence gets suffix 'b' and no sosa:hasResult
  (no matching part in material.ttl for the duplicate)
- Trials 59–73 with no time: prov:startedAtTime uses xsd:date instead of xsd:dateTime
- Non-blank Comments column: written as a second rdfs:comment triple
"""

import csv
import re
from pathlib import Path

CSV_PATH = Path(__file__).parent / "sources/studie-1/run.csv"
TTL_PATH = Path(__file__).parent / "runs.ttl"

ALREADY_DONE = {1, 2}
CEST_OFFSET = "+02:00"


def parse_date(s: str) -> str | None:
    s = s.strip()
    if not s:
        return None
    m = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{2})$", s)
    if not m:
        return None
    month, day, year = int(m.group(1)), int(m.group(2)), int(m.group(3))
    return f"{2000 + year:04d}-{month:02d}-{day:02d}"


def parse_time(s: str) -> str | None:
    s = s.strip()
    if not s:
        return None
    m = re.match(r"^(\d{1,2}):(\d{2})$", s)
    if not m:
        return None
    return f"{int(m.group(1)):02d}:{m.group(2)}:00"


def ttl_str(s: str) -> str:
    return s.replace("\\", "\\\\").replace('"', '\\"')


def emit_run(
    run_id: str,
    trial_no: int,
    label_suffix: str,
    date_iso: str | None,
    time_iso: str | None,
    purpose: str,
    comment: str,
    has_part: bool,
) -> str:
    out = [f"## Run {run_id}\n"]

    # --- WorkflowInstance ---
    out.append(f"run:{run_id} a wild:WorkflowInstance, sosa:Sampling, prov:Activity ;")
    out.append(f'    rdfs:label "Trial No. {label_suffix}" ;')
    out.append(f'    rdfs:comment "{ttl_str(purpose)}" ;')
    if comment:
        out.append(f'    rdfs:comment "{ttl_str(comment)}" ;')
    out.append( "    wild:workflowInstanceOf workflow:stampForming ;")
    out.append( "    sosa:madeBySampler system:ict ;")
    out.append( "    sosa:usedProcedure workflow:stampForming ;")
    out.append( "    sosa:hasFeatureOfInterest feature:processMaturityLevel ;")
    if has_part:
        out.append(f"    sosa:hasResult part:{trial_no} ;")
    if date_iso and time_iso:
        out.append(f'    prov:startedAtTime "{date_iso}T{time_iso}{CEST_OFFSET}"^^xsd:dateTime ;')
    elif date_iso:
        out.append(f'    prov:startedAtTime "{date_iso}"^^xsd:date ;')
    out.append( "    wild:hasState wild:done .")
    out.append("")

    # --- Composite activity instances (no machine) ---
    for suffix, model_uri in [
        ("root",                      "workflow:stampForming_root"),
        ("heatingTransferingForming", "workflow:heatingTransferingForming"),
    ]:
        out.append(f"run:{run_id}_{suffix} a wild:ActivityInstance, prov:Activity ;")
        out.append(f"    wild:inWorkflowInstance run:{run_id} ;")
        out.append(f"    wild:activityInstanceOf {model_uri} ;")
        out.append( "    wild:hasState wild:done .")
        out.append("")

    # --- forming (press) ---
    out.append(f"run:{run_id}_forming a wild:ActivityInstance, prov:Activity ;")
    out.append(f"    wild:inWorkflowInstance run:{run_id} ;")
    out.append( "    wild:activityInstanceOf activity:forming ;")
    out.append( "    prov:wasAssociatedWith machine:press ;")
    out.append( "    prov:qualifiedAssociation [")
    out.append( "        a prov:Association ;")
    out.append( "        prov:agent machine:press ;")
    out.append(f"        prov:hadPlan plan:{run_id}_press")
    out.append( "    ] ;")
    out.append( "    wild:hasState wild:done .")
    out.append("")

    # --- transfering (no machine) ---
    out.append(f"run:{run_id}_transfering a wild:ActivityInstance, prov:Activity ;")
    out.append(f"    wild:inWorkflowInstance run:{run_id} ;")
    out.append( "    wild:activityInstanceOf activity:transfering ;")
    out.append( "    wild:hasState wild:done .")
    out.append("")

    # --- heating (oven) ---
    out.append(f"run:{run_id}_heating a wild:ActivityInstance, prov:Activity ;")
    out.append(f"    wild:inWorkflowInstance run:{run_id} ;")
    out.append( "    wild:activityInstanceOf activity:heating ;")
    out.append( "    prov:wasAssociatedWith machine:oven ;")
    out.append( "    prov:qualifiedAssociation [")
    out.append( "        a prov:Association ;")
    out.append( "        prov:agent machine:oven ;")
    out.append(f"        prov:hadPlan plan:{run_id}_heating")
    out.append( "    ] ;")
    out.append( "    wild:hasState wild:done .")
    out.append("")

    # --- gripping (gripperFrame) ---
    out.append(f"run:{run_id}_gripping a wild:ActivityInstance, prov:Activity ;")
    out.append(f"    wild:inWorkflowInstance run:{run_id} ;")
    out.append( "    wild:activityInstanceOf activity:gripping ;")
    out.append( "    prov:wasAssociatedWith machine:gripperFrame ;")
    out.append( "    prov:qualifiedAssociation [")
    out.append( "        a prov:Association ;")
    out.append( "        prov:agent machine:gripperFrame ;")
    out.append(f"        prov:hadPlan plan:{run_id}_gripping")
    out.append( "    ] ;")
    out.append( "    wild:hasState wild:done .")
    out.append("")

    return "\n".join(out) + "\n"


def main() -> None:
    seen: dict[int, int] = {}  # trial_no → occurrence count
    blocks: list[str] = []

    with open(CSV_PATH, newline="", encoding="utf-8-sig") as f:
        reader = csv.reader(f)
        next(reader)  # skip header
        for row in reader:
            while len(row) < 6:
                row.append("")
            trial_raw, _, date_raw, time_raw, purpose_raw, comment_raw = row[:6]

            trial_raw = trial_raw.strip()
            if not trial_raw:
                continue
            try:
                trial_no = int(trial_raw)
            except ValueError:
                continue
            if trial_no in ALREADY_DONE:
                continue

            count = seen.get(trial_no, 0)
            seen[trial_no] = count + 1
            if count == 0:
                run_id = str(trial_no)
                label_suffix = str(trial_no)
                has_part = True
            else:
                suffix_letter = chr(ord("b") + count - 1)
                run_id = f"{trial_no}{suffix_letter}"
                label_suffix = f"{trial_no}{suffix_letter}"
                has_part = False  # no matching part:N for the duplicate

            blocks.append(emit_run(
                run_id=run_id,
                trial_no=trial_no,
                label_suffix=label_suffix,
                date_iso=parse_date(date_raw),
                time_iso=parse_time(time_raw),
                purpose=purpose_raw.strip(),
                comment=comment_raw.strip(),
                has_part=has_part,
            ))

    if not blocks:
        print("No new runs to generate.")
        return

    with open(TTL_PATH, "a", encoding="utf-8") as f:
        for block in blocks:
            f.write(block)

    print(f"Appended {len(blocks)} run(s) to {TTL_PATH.name}.")


if __name__ == "__main__":
    main()
