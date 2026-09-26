"""Structure-inventory questionnaire v3 — Observations & Recommendations lists.

Patches v2 (which patches v1). Every structure category gets two optional,
unlimited lists — the surveyor adds "Observation 1, 2, 3…" and
"Recommendation 1, 2, 3…" with add / delete — matching the bullet lists in the
client's Inventory Survey Report.

The old single free-text "General Condition, Observation & Recommendations"
box is replaced by these lists (it was compulsory on two forms). Nothing is lost:
records saved on v1/v2 keep that answer and the report still prints it.

New question type
  text_list   answer is a list of strings; "item_label" names one entry
              ("Observation" -> "Observation 1"). Never compulsory.
              An app that doesn't know the type shows a plain text box.

The utility form is untouched — it isn't a structure in the report.
"""

from __future__ import annotations

import copy

from seeds.questionnaire_v2 import STRUCTURE_INVENTORY_SCHEMA_V2, validate_v2

LIST_CATEGORIES = (
    "pipe_culvert",
    "box_or_slab_culvert",
    "major_minor_bridge_girder",
    "minor_bridge_girder_or_box",
    "grade_separated_structure",
)
OLD_COMBINED_FIELD = "observations_recommendations"


def _list_question(qid: str, label: str, item_label: str) -> dict:
    return {
        "id": qid,
        "label": label,
        "type": "text_list",
        "required": False,
        "item_label": item_label,
    }


def build_structure_inventory_v3() -> dict:
    schema = copy.deepcopy(STRUCTURE_INVENTORY_SCHEMA_V2)
    schema["version"] = 3
    for category in LIST_CATEGORIES:
        questions = schema["categories"][category]["questions"]
        questions[:] = [q for q in questions if q["id"] != OLD_COMBINED_FIELD]
        questions.append(_list_question("observations", "Observations", "Observation"))
        questions.append(_list_question("recommendations", "Recommendations", "Recommendation"))
    return schema


STRUCTURE_INVENTORY_SCHEMA_V3: dict = build_structure_inventory_v3()


def validate_v3(v2: dict = STRUCTURE_INVENTORY_SCHEMA_V2, v3: dict = STRUCTURE_INVENTORY_SCHEMA_V3) -> list[str]:
    problems: list[str] = []
    for category, body in v3["categories"].items():
        v2_ids = {q["id"] for q in v2["categories"][category]["questions"]}
        v3_ids = [q["id"] for q in body["questions"]]
        if len(v3_ids) != len(set(v3_ids)):
            problems.append(f"{category}: duplicate ids")
        dropped = v2_ids - set(v3_ids)
        expected = {OLD_COMBINED_FIELD} if category in LIST_CATEGORIES else set()
        if dropped - expected:
            problems.append(f"{category}: unexpectedly dropped {sorted(dropped - expected)}")
        if category in LIST_CATEGORIES:
            for qid in ("observations", "recommendations"):
                q = next((x for x in body["questions"] if x["id"] == qid), None)
                if q is None:
                    problems.append(f"{category}: missing {qid}")
                elif q["required"] or q["type"] != "text_list":
                    problems.append(f"{category}.{qid} must be an optional text_list")
    return problems + validate_v2(v2=v3)
