"""Structure-inventory questionnaire v2 — incremental changes on top of v1.

Built by patching a deep copy of v1, so nothing from v1 is removed or renamed:
every v1 question id is still present with the same meaning. Old records
(schema_version 1) keep working; new records are saved against version 2.

Schema features added on top of v1 (all optional keys on a question):

  show_if      Condition — question is only shown while the condition holds.
  required_if  Condition — question becomes compulsory while the condition
               holds (use together with "required": False).
  prefill_from question id — while this question is still empty (or still
               holds the auto-copied value), it mirrors that other answer.
  allow_other  (already in v1) — dropdown also accepts a hand-typed value.

  Condition := {"q": <question id>, "in": [values]}      answer equals / contains any
             | {"q": <question id>, "not_in": [values]}  answer is none of these (or unanswered)
             | {"any": [Condition, ...]} | {"all": [Condition, ...]}

Apps/clients that don't know these keys simply ignore them: every question is
shown, and anything that is only conditionally compulsory is base-optional, so
older APKs degrade to "everything visible, nothing newly blocking".
"""

from __future__ import annotations

import copy

from seeds.questionnaire_v1 import CONDITION_OPTIONS, STRUCTURE_INVENTORY_SCHEMA, q


def when(question_id: str, *values: str) -> dict:
    return {"q": question_id, "in": list(values)}


def unless(question_id: str, *values: str) -> dict:
    return {"q": question_id, "not_in": list(values)}


def qx(
    id: str,
    label: str,
    type: str,
    *,
    show_if: dict | None = None,
    required_if: dict | None = None,
    prefill_from: str | None = None,
    **kwargs,
) -> dict:
    item = q(id, label, type, **kwargs)
    if show_if is not None:
        item["show_if"] = show_if
    if required_if is not None:
        item["required_if"] = required_if
    if prefill_from is not None:
        item["prefill_from"] = prefill_from
    return item


def _index(questions: list[dict], question_id: str) -> int:
    for i, item in enumerate(questions):
        if item["id"] == question_id:
            return i
    raise KeyError(f"question {question_id!r} not found")


def _insert_after(questions: list[dict], after_id: str, items: list[dict]) -> None:
    at = _index(questions, after_id) + 1
    questions[at:at] = items


def _patch(questions: list[dict], question_id: str, **changes) -> dict:
    item = questions[_index(questions, question_id)]
    item.update(changes)
    return item


def _dims(prefix: str, label: str, *, prefill_prefix: str | None = None) -> list[dict]:
    """Height / Width / Length (m) trio — optional, not compulsory."""
    out = []
    for suffix, word in (("height", "Height"), ("width", "Width"), ("length", "Length")):
        out.append(
            qx(
                f"{prefix}_{suffix}",
                f"{label} : {word} (m)",
                "number",
                required=False,
                prefill_from=f"{prefill_prefix}_{suffix}" if prefill_prefix else None,
            )
        )
    return out


def _crash_barrier_dims() -> list[dict]:
    cb = when("parapet_railing_crash", "Crash Barrier (CB)")
    return [
        qx("cb_top_width", "CB (Crash Barrier) : Top Width (m)", "number", required=False, show_if=cb),
        qx("cb_bottom_width", "CB (Crash Barrier) : Bottom Width (m)", "number", required=False, show_if=cb),
        qx("cb_height", "CB (Crash Barrier) : Height (m)", "number", required=False, show_if=cb),
    ]


def build_structure_inventory_v2() -> dict:
    schema = copy.deepcopy(STRUCTURE_INVENTORY_SCHEMA)
    schema["version"] = 2
    cats = schema["categories"]

    # ── Pipe culvert ────────────────────────────────────────────────────────
    # Size can already be hand-typed (allow_other on pipe_size; the app now
    # honours it). Add the separate dimensions and the closing remarks.
    pipe = cats["pipe_culvert"]["questions"]
    _insert_after(
        pipe,
        "pipe_size",
        [
            qx("pipe_culvert_height", "Pipe Culvert Size : Height (m)", "number", required=False),
            qx("pipe_culvert_length", "Pipe Culvert Size : Length (m)", "number", required=False),
        ],
    )
    pipe.append(
        q(
            "observations_recommendations",
            "General Condition, Observation & Recommendations, if any",
            "text",
            required=False,
        )
    )

    # ── Box / slab culvert ──────────────────────────────────────────────────
    box = cats["box_or_slab_culvert"]["questions"]
    _patch(box, "intermediate_wall_thickness", required=False)  # not compulsory
    _insert_after(
        box,
        "skew_normal",
        [
            q(
                "flow_direction",
                "Flow direction",
                "select",
                options=["LHS To RHS", "RHS To LHS", "Unidentified Direction", "Choked"],
                ui="dropdown",
            )
        ],
    )
    return_wall = when("wing_return_wall_type", "Return Wall")
    _insert_after(
        box,
        "wing_wall_condition",
        [
            qx(
                "return_wall_condition",
                "Condition of Return Wall (VG/G/F/P/VP)",
                "condition_rating",
                options=CONDITION_OPTIONS,
                required=False,
                show_if=return_wall,
                required_if=return_wall,
            )
        ],
    )
    _insert_after(
        box,
        "parapet_railing_crash",
        [
            q(
                "parapet_railing_cb_type",
                "Parapet / Railing / CB Type (e.g. RCC, Metal, W-Beam)",
                "text",
                required=False,
            )
        ],
    )

    # ── Major / minor bridge (girder type) ──────────────────────────────────
    mjb = cats["major_minor_bridge_girder"]["questions"]
    _patch(
        mjb,
        "flow_direction",
        options=["LHS to RHS", "RHS to LHS", "Unidentified Direction", "Choked"],
    )
    _patch(
        mjb,
        "bearing_type",
        options=["Elastomeric Bearing", "Pot Bearing", "Spherical Bearing", "Not Visible"],
    )
    bearing_visible = unless("bearing_type", "Not Visible")
    _patch(mjb, "bearing_condition", required=False, show_if=bearing_visible, required_if=bearing_visible)
    _insert_after(
        mjb,
        "sub_structure_type",
        [q("pier_abutment_height", "Height of pier & abutment from GL (m)", "number", required=False)],
    )
    wall_chosen = when("return_wing_wall", "Return Wall", "Wing Wall")
    _patch(mjb, "return_wing_wall", required=False)  # option itself not compulsory
    _patch(mjb, "return_wing_wall_size", required=False)
    _patch(mjb, "return_wing_wall_condition", required=False, show_if=wall_chosen, required_if=wall_chosen)
    _insert_after(
        mjb,
        "return_wing_wall",
        [
            qx(
                f"return_wing_wall_{suffix}",
                f"Return Wall/Wing Wall : {word} (m)",
                "number",
                required=False,
                show_if=wall_chosen,
                required_if=wall_chosen,
            )
            for suffix, word in (("width", "Width"), ("height", "Height"), ("length", "Length"))
        ],
    )

    # ── Minor bridge (girder type or box type > 6 m) ────────────────────────
    minor = cats["minor_bridge_girder_or_box"]["questions"]
    _patch(minor, "wing_return_wall_size", required=False)  # not compulsory
    _insert_after(
        minor,
        "wing_return_wall_size",
        _dims("wing_wall", "Wing Wall") + _dims("return_wall", "Return Wall", prefill_prefix="wing_wall"),
    )
    _insert_after(minor, "prc_height", _crash_barrier_dims())

    # ── Grade separated (ROB / Flyover / VUP / LVUP …) ──────────────────────
    gs = cats["grade_separated_structure"]["questions"]
    _insert_after(
        gs,
        "super_structure_type",
        [
            q(
                "super_structure_bt_cc",
                "Type of Superstructure (BT / CC)",
                "select",
                options=["BT", "CC"],
                ui="radio",
                required=False,
            )
        ],
    )
    _insert_after(gs, "prc_height", _crash_barrier_dims())
    _insert_after(
        gs,
        "wing_return_wall_size",
        _dims("wing_wall", "Wing Wall") + _dims("return_wall", "Return Wall", prefill_prefix="wing_wall"),
    )
    sr_side_shown = when("service_road", "Yes")
    _insert_after(
        gs,
        "service_road_width_side",
        [
            qx(
                "sr_side",
                "SR (Service Road) Side",
                "select",
                options=["LHS", "RHS", "Both"],
                ui="radio",
                required=False,
                show_if=sr_side_shown,
            ),
            qx(
                "sr_width_lhs",
                "SR Width - LHS (m)",
                "number",
                required=False,
                show_if=when("sr_side", "LHS", "Both"),
            ),
            qx(
                "sr_width_rhs",
                "SR Width - RHS (m)",
                "number",
                required=False,
                show_if=when("sr_side", "RHS", "Both"),
            ),
        ],
    )

    return schema


STRUCTURE_INVENTORY_SCHEMA_V2: dict = build_structure_inventory_v2()


def validate_v2(v1: dict = STRUCTURE_INVENTORY_SCHEMA, v2: dict = STRUCTURE_INVENTORY_SCHEMA_V2) -> list[str]:
    """Return a list of problems (empty = fine). Used by the seed and tests."""
    problems: list[str] = []

    def cond_refs(cond: object) -> list[str]:
        if not isinstance(cond, dict):
            return []
        if "q" in cond:
            return [cond["q"]]
        return [r for c in (cond.get("any") or cond.get("all") or []) for r in cond_refs(c)]

    for key, cat in v2["categories"].items():
        ids = [item["id"] for item in cat["questions"]]
        if len(ids) != len(set(ids)):
            problems.append(f"{key}: duplicate question ids")
        v1_ids = [item["id"] for item in v1["categories"][key]["questions"]]
        missing = [i for i in v1_ids if i not in ids]
        if missing:
            problems.append(f"{key}: v1 questions dropped: {missing}")
        seen: set[str] = set()
        for item in cat["questions"]:
            for field in ("show_if", "required_if"):
                for ref in cond_refs(item.get(field)):
                    if ref not in seen:
                        problems.append(f"{key}.{item['id']}.{field} refers to {ref!r}, which isn't asked earlier")
            pf = item.get("prefill_from")
            if pf and pf not in seen:
                problems.append(f"{key}.{item['id']}.prefill_from refers to {pf!r}, which isn't asked earlier")
            seen.add(item["id"])
    return problems
