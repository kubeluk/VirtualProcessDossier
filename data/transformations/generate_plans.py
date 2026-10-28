#!/usr/bin/env python3
"""Append RDF plan triples for all machine plans from gripper/oven/press CSV files.

Generates plan:{run_id}_gripping, plan:{run_id}_heating, and plan:{run_id}_press
for every trial in run.csv except run 1 (already hand-authored in plans.ttl).

Edge cases handled:
- Rows with no Trial No.: skipped
- Trial 1: skipped (hand-authored)
- Duplicate Trial No. 37: second occurrence gets run_id '37b'
- Blank numeric cells: emitted as 0.0 with a warning
"""

import csv
import sys
from pathlib import Path

BASE = Path(__file__).parent
RUN_CSV     = BASE / "sources/studie-1/run.csv"
GRIPPER_CSV = BASE / "sources/studie-1/gripper.csv"
OVEN_CSV    = BASE / "sources/studie-1/oven.csv"
PRESS_CSV   = BASE / "sources/studie-1/press.csv"
TTL_PATH    = BASE / "plans.ttl"

ALREADY_DONE = {1}

# Fixed gripper XY positions from run 1 (mm, relative to gripperFrameReferencePoint)
GRIPPER_POSITIONS = [
    (1,   210.0,  100.0),
    (2,   210.0, -100.0),
    (3,  -210.0,  100.0),
    (4,  -210.0, -100.0),
    (5,   100.0,  210.0),
    (6,  -100.0,  210.0),
    (7,   100.0, -210.0),
    (8,  -100.0, -210.0),
]


def load_csv(path: Path, skip_rows: int) -> list[list[str]]:
    rows = []
    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.reader(f)
        for _ in range(skip_rows):
            next(reader, None)
        for row in reader:
            rows.append([cell.strip() for cell in row])
    return rows


def parse_float(s: str, label: str = "") -> float:
    s = s.strip()
    if not s:
        print(f"  WARNING: blank value for '{label}', using 0.0", file=sys.stderr)
        return 0.0
    return float(s)


def parse_power_cols(a: str, b: str, c: str) -> tuple[float, float, float]:
    """Parse three CSV cells that were split from a space-prefixed quoted value like ' "80', '20', '20"'."""
    return float(a.strip().strip('"')), float(b.strip()), float(c.strip().strip('"'))


def parse_closing_steps(cells: list[str]) -> list[tuple[float, float]]:
    """Parse closing-speed cells (split from a space-prefixed quoted value by csv.reader).

    Input: list of cells like [' "60-80', ' 25-60', ' 10-35', ' 5-15', ' 0-10"        ']
    Output: [(60.0, 80.0), (25.0, 60.0), (10.0, 35.0), (5.0, 15.0), (0.0, 10.0)]
    Each token is 'remaining_mm-speed_mm_per_sec'.
    """
    joined = ",".join(cells)
    steps = []
    for token in joined.strip().strip('"').split(","):
        token = token.strip().strip('"')
        if not token:
            continue
        remaining_s, speed_s = token.split("-")
        steps.append((float(remaining_s.strip()), float(speed_s.strip())))
    return steps


def emit_gripping(run_id: str, heating: float, forming: float, rework: float) -> str:
    lines = [f"### Gripping\n", f"plan:{run_id}_gripping a prov:Plan, prov:Collection ;"]

    for i, (gnum, x, y) in enumerate(GRIPPER_POSITIONS):
        is_last = (i == len(GRIPPER_POSITIONS) - 1)
        lines.append(f"    prov:hadMember [")
        lines.append(f"        a prov:Plan ;")
        lines.append(f"        prov:wasDerivedFrom gripper:{gnum} ;")
        lines.append(f"        param:gripperPosition [")
        lines.append(f"            a prov:Entity ;")
        lines.append(f"            prov:value [")
        lines.append(f"                a qudt:Quantity ;")
        lines.append(f"                qudt:hasQuantityKind quantitykind:PositionVector ;")
        lines.append(f"                qudt:hasUnit unit:MilliM ;")
        lines.append(f"                qudt:value ( {x} {y} )")
        lines.append(f"            ] ;")
        lines.append(f"            prov:wasDerivedFrom pos:gripperFrameReferencePoint ;")
        lines.append(f"        ] ;")
        lines.append(f"        param:setpoint [")
        lines.append(f"            a prov:Entity ;")
        lines.append(f"            prov:value [")
        lines.append(f"                a qudt:Quantity ;")
        lines.append(f"                qudt:hasUnit unit:UNITLESS ;")
        lines.append(f"                qudt:value {heating}")
        lines.append(f"            ] ;")
        lines.append(f"            prov:wasDerivedFrom activity:heating")
        lines.append(f"        ] ;")
        lines.append(f"        param:setpoint [")
        lines.append(f"            a prov:Entity ;")
        lines.append(f"            prov:value [")
        lines.append(f"                a qudt:Quantity ;")
        lines.append(f"                qudt:hasUnit unit:UNITLESS ;")
        lines.append(f"                qudt:value {forming}")
        lines.append(f"            ] ;")
        lines.append(f"            prov:wasDerivedFrom activity:forming")
        lines.append(f"        ] ;")
        lines.append(f"        param:setpoint [")
        lines.append(f"            a prov:Entity ;")
        lines.append(f"            prov:value [")
        lines.append(f"                a qudt:Quantity ;")
        lines.append(f"                qudt:hasUnit unit:UNITLESS ;")
        lines.append(f"                qudt:value {rework}")
        lines.append(f"            ] ;")
        lines.append(f"            prov:wasDerivedFrom activity:reworking")
        lines.append(f"        ]")
        sep = " ." if is_last else " ;"
        lines.append(f"    ]{sep}")
    lines.append("")
    return "\n".join(lines) + "\n"


def emit_heating(
    run_id: str,
    temp_top: float, temp_bot: float,
    power_top: tuple[float, float, float],
    power_bot: tuple[float, float, float],
    holding: float,
) -> str:
    top_mid, top_edge, top_corner = power_top
    bot_mid, bot_edge, bot_corner = power_bot

    lines = [
        f"### Heating\n",
        f"plan:{run_id}_heating a prov:Plan, prov:Collection ;",
        f"    prov:hadMember [",
        f"        a prov:Plan ;",
        f"        param:temperatureGoal [",
        f"            a prov:Entity ;",
        f"            prov:value [",
        f"                a qudt:Quantity ;",
        f"                qudt:hasQuantityKind quantitykind:AreaTemperature ;",
        f"                qudt:hasUnit unit:DEG_C ;",
        f"                qudt:value {temp_top}",
        f"            ] ;",
        f"            prov:wasDerivedFrom machine:ir_top",
        f"        ] ;",
        f"        param:zoneControl [",
        f"            a prov:Entity ;",
        f"            prov:value [",
        f"                a qudt:Quantity ;",
        f"                qudt:hasUnit unit:PERCENT ;",
        f"                qudt:value {top_mid}",
        f"            ] ;",
        f"            prov:wasDerivedFrom machine:ir_top_middle",
        f"        ] ;",
        f"        param:zoneControl [",
        f"            a prov:Entity ;",
        f"            prov:value [",
        f"                a qudt:Quantity ;",
        f"                qudt:hasUnit unit:PERCENT ;",
        f"                qudt:value {top_edge}",
        f"            ] ;",
        f"            prov:wasDerivedFrom machine:ir_top_edge",
        f"        ] ;",
        f"        param:zoneControl [",
        f"            a prov:Entity ;",
        f"            prov:value [",
        f"                a qudt:Quantity ;",
        f"                qudt:hasUnit unit:PERCENT ;",
        f"                qudt:value {top_corner}",
        f"            ] ;",
        f"            prov:wasDerivedFrom machine:ir_top_corner",
        f"        ]",
        f"    ] ;",
        f"    prov:hadMember [",
        f"        a prov:Plan ;",
        f"        param:temperatureGoal [",
        f"            a prov:Entity ;",
        f"            prov:value [",
        f"                a qudt:Quantity ;",
        f"                qudt:hasQuantityKind quantitykind:AreaTemperature ;",
        f"                qudt:hasUnit unit:DEG_C ;",
        f"                qudt:value {temp_bot}",
        f"            ] ;",
        f"            prov:wasDerivedFrom machine:ir_bottom",
        f"        ] ;",
        f"        param:zoneControl [",
        f"            a prov:Entity ;",
        f"            prov:value [",
        f"                a qudt:Quantity ;",
        f"                qudt:hasUnit unit:PERCENT ;",
        f"                qudt:value {bot_mid}",
        f"            ] ;",
        f"            prov:wasDerivedFrom machine:ir_bottom_middle",
        f"        ] ;",
        f"        param:zoneControl [",
        f"            a prov:Entity ;",
        f"            prov:value [",
        f"                a qudt:Quantity ;",
        f"                qudt:hasUnit unit:PERCENT ;",
        f"                qudt:value {bot_edge}",
        f"            ] ;",
        f"            prov:wasDerivedFrom machine:ir_bottom_edge",
        f"        ] ;",
        f"        param:zoneControl [",
        f"            a prov:Entity ;",
        f"            prov:value [",
        f"                a qudt:Quantity ;",
        f"                qudt:hasUnit unit:PERCENT ;",
        f"                qudt:value {bot_corner}",
        f"            ] ;",
        f"            prov:wasDerivedFrom machine:ir_bottom_corner",
        f"        ]",
        f"    ] ;",
        f"    param:holdingTime [",
        f"        a qudt:Quantity ;",
        f"        qudt:hasQuantityKind quantitykind:Time ;",
        f"        qudt:hasUnit unit:SEC ;",
        f"        qudt:value {holding}",
        f"    ] .",
        f"",
    ]
    return "\n".join(lines) + "\n"


def emit_pressing(
    run_id: str,
    tool: str,
    path: float,
    temp_top: float,
    temp_bot: float,
    force: float,
    steps: list[tuple[float, float]],
    cooling: float,
) -> str:
    lines = [
        f"### Pressing\n",
        f"plan:{run_id}_press a prov:Plan ;",
        f"    prov:wasDerivedFrom machine:press ;",
        f"    param:tool :{tool} ;",
        f"    param:pressForce [",
        f"        a qudt:Quantity ;",
        f"        qudt:hasQuantityKind quantitykind:Force ;",
        f"        qudt:hasUnit unit:KiloN ;",
        f"        qudt:value {force}",
        f"    ] ;",
        f"    param:coolingTime [",
        f"        a qudt:Quantity ;",
        f"        qudt:hasQuantityKind quantitykind:Time ;",
        f"        qudt:hasUnit unit:SEC ;",
        f"        qudt:value {cooling}",
        f"    ] ;",
        f"    param:remainingPressPath [",
        f"        a qudt:Quantity ;",
        f"        qudt:hasQuantityKind quantitykind:Distance ;",
        f"        qudt:hasUnit unit:MilliM ;",
        f"        qudt:value {path}",
        f"    ] ;",
        f"    param:moldTemperature [",
        f"        a prov:Entity ;",
        f"        prov:value [",
        f"            a qudt:Quantity ;",
        f"            qudt:hasQuantityKind quantitykind:Temperature ;",
        f"            qudt:hasUnit unit:DEG_C ;",
        f"            qudt:value {temp_top}",
        f"        ] ;",
        f"        prov:wasDerivedFrom machine:press_mold_upper",
        f"    ] ;",
        f"    param:moldTemperature [",
        f"        a prov:Entity ;",
        f"        prov:value [",
        f"            a qudt:Quantity ;",
        f"            qudt:hasQuantityKind quantitykind:Temperature ;",
        f"            qudt:hasUnit unit:DEG_C ;",
        f"            qudt:value {temp_bot}",
        f"        ] ;",
        f"        prov:wasDerivedFrom machine:press_mold_lower",
        f"    ] ;",
        f"    param:closingSpeedSteps (",
    ]

    for i, (remaining, speed) in enumerate(steps):
        is_last = (i == len(steps) - 1)
        lines.append(f"        [")
        lines.append(f"            param:closingSpeed [")
        lines.append(f"                a qudt:Quantity ;")
        lines.append(f"                qudt:hasQuantityKind quantitykind:LinearVelocity ;")
        lines.append(f"                qudt:hasUnit unit:MilliM-PER-SEC ;")
        lines.append(f"                qudt:value {speed}")
        lines.append(f"            ] ;")
        lines.append(f"            param:remaining [")
        lines.append(f"                a qudt:Quantity ;")
        lines.append(f"                qudt:hasQuantityKind quantitykind:Distance ;")
        lines.append(f"                qudt:hasUnit unit:MilliM ;")
        lines.append(f"                qudt:value {remaining}")
        lines.append(f"            ]")
        lines.append(f"        ]")

    lines.append(f"    ) .")
    lines.append(f"")
    return "\n".join(lines) + "\n"


def main() -> None:
    run_rows     = load_csv(RUN_CSV,     skip_rows=1)
    gripper_rows = load_csv(GRIPPER_CSV, skip_rows=3)
    oven_rows    = load_csv(OVEN_CSV,    skip_rows=5)
    press_rows   = load_csv(PRESS_CSV,   skip_rows=3)

    seen: dict[int, int] = {}
    blocks: list[str] = []

    for i, (run_row, g_row, o_row, p_row) in enumerate(
        zip(run_rows, gripper_rows, oven_rows, press_rows)
    ):
        while len(run_row) < 1:
            run_row.append("")
        trial_raw = run_row[0].strip()
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
        else:
            run_id = f"{trial_no}{chr(ord('b') + count - 1)}"

        # --- parse gripper row ---
        while len(g_row) < 3:
            g_row.append("")
        heating = parse_float(g_row[0], f"run {run_id} tension_heating")
        forming = parse_float(g_row[1], f"run {run_id} tension_forming")
        rework  = parse_float(g_row[2], f"run {run_id} rework_force")

        # --- parse oven row ---
        # csv.reader splits ' "80,20,20"' into 3 cells because the leading space
        # prevents quote recognition: col[2]=' "80', col[3]='20', col[4]='20"',
        # col[5]=' "100', col[6]='20', col[7]='20"', col[8]=holding_time
        while len(o_row) < 9:
            o_row.append("")
        temp_top    = parse_float(o_row[0], f"run {run_id} oven temp_top")
        temp_bot    = parse_float(o_row[1], f"run {run_id} oven temp_bot")
        power_top   = parse_power_cols(o_row[2], o_row[3], o_row[4])
        power_bot   = parse_power_cols(o_row[5], o_row[6], o_row[7])
        holding     = parse_float(o_row[8], f"run {run_id} holding_time")

        # --- parse press row (skip inlet cols 4-5, measured cols 6-7) ---
        # csv.reader splits the space-prefixed closing-speed value across multiple cols;
        # cooling_time is always the last column, speed steps are cols[9:-1]
        while len(p_row) < 11:
            p_row.append("")
        tool        = p_row[0].strip() or "Drapiernapf"
        path        = parse_float(p_row[1], f"run {run_id} remaining_path")
        mold_top    = parse_float(p_row[2], f"run {run_id} mold_temp_top")
        mold_bot    = parse_float(p_row[3], f"run {run_id} mold_temp_bot")
        # p_row[4]: inlet top  — skipped
        # p_row[5]: inlet bot  — skipped
        # p_row[6]: measured top — skipped
        # p_row[7]: measured bot — skipped
        force       = parse_float(p_row[8], f"run {run_id} press_force")
        steps       = parse_closing_steps(p_row[9:-1])
        cooling     = parse_float(p_row[-1], f"run {run_id} cooling_time")

        block = f"## Run {run_id}\n\n"
        block += emit_gripping(run_id, heating, forming, rework)
        block += emit_heating(run_id, temp_top, temp_bot, power_top, power_bot, holding)
        block += emit_pressing(run_id, tool, path, mold_top, mold_bot, force, steps, cooling)
        blocks.append(block)

    if not blocks:
        print("No new plans to generate.")
        return

    with open(TTL_PATH, "a", encoding="utf-8") as f:
        for block in blocks:
            f.write(block)

    print(f"Appended {len(blocks)} run plan(s) to {TTL_PATH.name}.")


if __name__ == "__main__":
    main()
