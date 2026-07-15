"""Full transcription of the Google Form Inventory Data Collection questionnaire.

Source: Questions of Google Form.pdf (138 questions, 6 structure-category branches).
Question types: text, number, select, multiselect, condition_rating, date, photo_group.
"""

from __future__ import annotations

CONDITION_OPTIONS = ["Very Good", "Good", "Fair", "Poor", "Very Poor"]


def q(
    id: str,
    label: str,
    type: str,
    *,
    required: bool = True,
    options: list[str] | None = None,
    allow_other: bool = False,
    is_unique_key: bool = False,
    ui: str | None = None,
    note: str | None = None,
) -> dict:
    item: dict = {
        "id": id,
        "label": label,
        "type": type,
        "required": required,
    }
    if options is not None:
        item["options"] = options
    if allow_other:
        item["allow_other"] = True
    if is_unique_key:
        item["is_unique_key"] = True
    if ui:
        item["ui"] = ui  # "dropdown" | "radio" | "checkbox"
    if note:
        item["note"] = note
    return item


def condition(id: str, label: str, *, required: bool = True) -> dict:
    return q(id, label, "condition_rating", required=required, options=CONDITION_OPTIONS)


STRUCTURE_INVENTORY_SCHEMA: dict = {
    "module": "structure_inventory",
    "version": 1,
    "root_question": "structure_category",
    "root": {
        "id": "structure_category",
        "label": "Structure Category",
        "type": "select",
        "required": True,
        "options": [
            {"value": "pipe_culvert", "label": "Pipe Culvert"},
            {
                "value": "box_or_slab_culvert",
                "label": "Box Culvert (Span <= 6m) or Slab Culvert",
            },
            {
                "value": "major_minor_bridge_girder",
                "label": "Major Bridge / Minor Bridge (Girder Type)",
            },
            {
                "value": "minor_bridge_girder_or_box",
                "label": "Minor Bridge (Girder Type or Box Type > 6m)",
            },
            {
                "value": "grade_separated_structure",
                "label": "Grade Separated Structure (Flyover/VUP/LVUP/ROB/ROU)",
            },
            {
                "value": "utility_identification",
                "label": "Utility Identification (IOCL,GAIL,OFC,TOWER, High Tension Line Crossing...etc)",
            },
        ],
    },
    "shared": {
        "auto_capture": [
            {"id": "latitude", "label": "Latitude", "type": "number", "readonly": True},
            {"id": "longitude", "label": "Longitude", "type": "number", "readonly": True},
            {"id": "captured_at", "label": "Date & Time", "type": "date", "readonly": True},
        ],
        "photo_group": q(
            "structure_photos",
            "Structure Photographs",
            "photo_group",
            required=True,
            note="Minimum photo count is configured in app settings (default 4).",
        ),
    },
    "categories": {
        "pipe_culvert": {
            "label": "Pipe Culvert",
            "source_questions": "2-15",
            "questions": [
                q("chainage", "Existing Chainage (km) of Pipe Culvert", "text", is_unique_key=True),
                q(
                    "cushion_encasing_type",
                    "Type (Cushion / Encasing)",
                    "select",
                    options=["Cushion", "Encasing", "Not Visible"],
                    ui="radio",
                ),
                q(
                    "pipe_size",
                    "Size (No. of Pipe x Opening Dia.) (m)",
                    "select",
                    options=[
                        "1 x 0.6",
                        "1 x 0.9",
                        "1 x 1.2",
                        "2 x 0.6",
                        "2 x 0.9",
                        "2 x 1.2",
                        "3 x 0.6",
                        "3 x 0.9",
                        "3 x 1.2",
                    ],
                    allow_other=True,
                    ui="radio",
                ),
                q("skew_normal", "Skew / Normal", "select", options=["Skew", "Normal"], ui="radio"),
                q("width_of_structure", "Width of structure (inner/inner of Headwall or parapet) (m)", "number"),
                q("total_width", "Total Width (o/o Parapet/Head wall) (m)", "number"),
                q(
                    "flow_direction",
                    "Flow direction",
                    "select",
                    options=["LHS To RHS", "RHS To LHS", "Unidentified Direction", "Choked"],
                    ui="dropdown",
                ),
                q(
                    "head_wall_or_parapet",
                    "Head Wall or Parapet Wall",
                    "select",
                    options=["Head Wall", "Parapet Wall"],
                    ui="dropdown",
                ),
                q(
                    "head_wall_parapet_type",
                    "Head wall/Parapet Type",
                    "select",
                    options=["RCC", "Brick Wall"],
                    ui="dropdown",
                ),
                q("head_wall_parapet_length", "Head wall/Parapet Length (m)", "number"),
                q("head_wall_parapet_thickness", "Head wall/Parapet Thickness / Width (m)", "number"),
                q("head_wall_parapet_height", "Head wall/Parapet Height from GL (m)", "number"),
                q("road_level_from_bed", "Road level from bed level (m)", "number"),
                condition("head_wall_parapet_condition", "Condition of Head wall/Parapet (VG/G/F/P/VP)"),
            ],
        },
        "box_or_slab_culvert": {
            "label": "Box Culvert (Span <= 6m) or Slab Culvert",
            "source_questions": "16-45",
            "questions": [
                q(
                    "box_or_slab",
                    "Box Culvert or Slab Culvert",
                    "select",
                    options=["Box Culvert", "Slab Culvert"],
                    ui="radio",
                ),
                q("chainage", "Existing Chainage (km)", "text", is_unique_key=True),
                q("skew_normal", "Skew / Normal", "select", options=["Skew", "Normal"], ui="radio"),
                q("span_arrangement", "Span Arrangement (No. x Width) (m)", "text"),
                q(
                    "width_of_structure",
                    "Width of structure (inner/inner of railing or parapet) (m)",
                    "number",
                ),
                q("total_width", "Total width (O/O Parapet) (m)", "number"),
                q("total_horizontal_vent_width", "Total Horizontal Vent width (m)", "number"),
                q("height_of_box_without_slab", "Height of Box without Slab (vertical Clearance) (m)", "number"),
                q("top_slab_thickness", "TOP Slab Thickness (m)", "number"),
                q("side_wall_thickness", "Side Wall Thickness (m)", "number"),
                q("intermediate_wall_thickness", "Intermediate Wall Thickness (m)", "number"),
                q(
                    "abutment_type",
                    "Abutment Details : Type",
                    "select",
                    options=["RCC", "Wall Type", "Not Applicable"],
                    allow_other=True,
                    ui="dropdown",
                ),
                q(
                    "abutment_height",
                    "Abutment Details: Height of pier & abutment from GL (m)",
                    "number",
                    required=False,
                ),
                condition("abutment_condition", "Abutment Details: Condition (VG/G/F/P/VP)"),
                q("road_level_from_bed", "Road Level from Bed (m)", "number"),
                q(
                    "wing_return_wall_type",
                    "Wing wall / Return wall : Type",
                    "multiselect",
                    options=["Return Wall", "Wing Wall", "Not Visible", "Not Applicable"],
                    ui="checkbox",
                ),
                q("return_wall_length", "Return Wall : Length (m)", "number", required=False),
                q("return_wall_width", "Return Wall : Width (m)", "number", required=False),
                q("wing_wall_length", "Wing Wall : Length (m)", "number", required=False),
                q("wing_wall_width", "Wing Wall : Width (m)", "number", required=False),
                condition("wing_wall_condition", "Condition of Wing Wall (VG/G/F/P/VP)"),
                q("pitching", "Pitching (Y / N)", "select", options=["Yes", "No"], ui="radio"),
                q(
                    "parapet_railing_crash",
                    "Parapet (P) / Railing (R) / Crash Barrier (CB)",
                    "multiselect",
                    options=["Parapet (P)", "Railing (R)", "Crash Barrier (CB)", "N/A"],
                    ui="checkbox",
                    note="Select applicable sides/types as observed (LHS/RHS noted in remarks if needed).",
                ),
                q("parapet_width", "Parapet Width (m)", "number", required=False),
                q("parapet_height", "Parapet Height (m)", "number", required=False),
                q("railing_crash_barrier_width", "Railing / Crash Barrier Width (m)", "number", required=False),
                q("railing_crash_barrier_height", "Railing / Crash Barrier Height (m)", "number", required=False),
                q(
                    "parapet_condition",
                    "Condition of Parapet (VG/G/F/P/VP)",
                    "condition_rating",
                    options=[*CONDITION_OPTIONS, "N/A"],
                    required=False,
                ),
                q(
                    "railing_condition",
                    "Condition of Railing (VG/G/F/P/VP)",
                    "condition_rating",
                    options=[*CONDITION_OPTIONS, "N/A"],
                    required=False,
                ),
                q(
                    "crash_barrier_condition",
                    "Condition of Crash Barrier (VG/G/F/P/VP)",
                    "condition_rating",
                    options=[*CONDITION_OPTIONS, "N/A"],
                    required=False,
                ),
                q(
                    "bed_protection",
                    "Bed Protection (Y/N)",
                    "select",
                    options=["Yes", "No", "Not Visible"],
                    ui="radio",
                ),
                q(
                    "observations_recommendations",
                    "General Condition, Observation & Recommendations, if any",
                    "text",
                    required=False,
                ),
            ],
        },
        "major_minor_bridge_girder": {
            "label": "Major Bridge / Minor Bridge (Girder Type)",
            "source_questions": "46-74",
            "questions": [
                q("bridge_type", "Type of Bridge", "select", options=["Major", "Minor"], ui="radio"),
                q("chainage", "Existing Chainage (Km)", "text", is_unique_key=True),
                q("skew_normal", "Skew/Normal", "select", options=["Skew", "Normal"], ui="radio"),
                q("river_name", "Name of the River", "text", required=False),
                q("year_of_construction", "Year of Construction", "text", required=False),
                q("span_arrangement", "Span Arrangement (No x Span Length)", "text"),
                q("total_length_of_bridge", "Total length of Bridge (c/c exp joints) (m)", "number"),
                q(
                    "flow_direction",
                    "Flow Direction",
                    "select",
                    options=["LHS to RHS", "RHS to LHS", "Unidentified Direction"],
                    ui="dropdown",
                ),
                q(
                    "width_of_structure",
                    "Width of structure (inner/inner of railing or parapet) (m)",
                    "number",
                ),
                q("total_width", "Total width (o/o face of slab) (m)", "number"),
                q("super_structure_type", "Super Structure: Type", "text"),
                q(
                    "wearing_coat_type",
                    "Type Wearing Coat",
                    "select",
                    options=["CC", "BT"],
                    ui="radio",
                ),
                condition("super_structure_condition", "Condition of Super Structure (VG/G/F/P/VP)"),
                q(
                    "parapet_railing_crash",
                    "Parapet (P) / Railing (R) / Crash Barrier (CB)",
                    "select",
                    options=["Parapet (P)", "Railing (R)", "Crash Barrier (CB)"],
                    ui="radio",
                ),
                q("prc_top_width", "Top Width (m) of P/R/CB", "number"),
                q("prc_bottom_width", "Bottom Width (m) of P/R/CB", "number"),
                q("prc_height", "Height (m) of P/R/CB", "number"),
                q(
                    "bearing_type",
                    "Bearing Type",
                    "select",
                    options=["Elastomeric Bearing", "Pot Bearing", "Spherical Bearing"],
                    ui="dropdown",
                ),
                condition("bearing_condition", "Bearing Condition"),
                q(
                    "sub_structure_type",
                    "Type of Sub Structure",
                    "select",
                    options=["Circular Pier", "Wall Type Pier"],
                    ui="radio",
                ),
                condition("sub_structure_condition", "Condition of Sub-Structure"),
                q("expansion_joint_type", "Expansion Joint : Type", "text"),
                condition("expansion_joint_condition", "Condition of Expansion joint"),
                q(
                    "return_wing_wall",
                    "Return Wall/Wing Wall",
                    "select",
                    options=["Return Wall", "Wing Wall"],
                    ui="radio",
                ),
                q("return_wing_wall_size", "Return Wall/Wing Wall : Size", "text"),
                condition("return_wing_wall_condition", "Condition of Return Wall/Wing Wall"),
                q("high_flood_level", "High Flood Level (RL)/(m)", "number", required=False),
                q("bed_protection", "Bed Protection (Y / N)", "select", options=["Yes", "No"], ui="radio"),
                q(
                    "observations_recommendations",
                    "General Condition, Observation & Recommendations, if any",
                    "text",
                    required=False,
                ),
            ],
        },
        "minor_bridge_girder_or_box": {
            "label": "Minor Bridge (Girder Type or Box Type > 6m)",
            "source_questions": "75-99",
            "questions": [
                q("chainage", "Existing Chainage (Km)", "text", is_unique_key=True),
                q(
                    "minor_bridge_type",
                    "Type of Minor Bridge",
                    "select",
                    options=["Girder Type", "Box Type"],
                    ui="radio",
                ),
                q("skew_normal", "Skew/Normal", "select", options=["Skew", "Normal"], ui="radio"),
                q("span_arrangement", "Span Arrangement [No x Span]", "text"),
                q(
                    "width_of_structure",
                    "Width of structure (inner/inner of railing or parapet) (m)",
                    "number",
                ),
                q("total_width", "Total width (O/O Parapet) (m)", "number"),
                q("total_horizontal_vent_width", "Total Horizontal Vent width (m)", "number"),
                q("slab_thickness", "Slab Thickness (m)", "number"),
                q("side_wall_thickness", "Side Wall Thickness (m)", "number"),
                q("intermediate_wall_thickness", "Intermediate Wall Thickness (m)", "number"),
                q("abutment_type", "Abutment Type", "text"),
                q("pier_abutment_height", "Height of pier & abutment from GL (m)", "number"),
                condition("structure_condition", "Condition of Structure (VG/G/F/P/VP)"),
                q("road_level_from_bed", "Road level from bed (m)", "number"),
                q("flow_direction", "Flow Direction", "text"),
                q(
                    "wing_return_wall",
                    "Wing Wall / Return Wall",
                    "select",
                    options=["Wing Wall", "Return Wall"],
                    ui="radio",
                ),
                q("wing_return_wall_size", "Size of Wing Wall/Return Wall", "text"),
                condition("wing_return_wall_condition", "Condition of Wing Wall/Return Wall"),
                q("pitching", "Pitching", "select", options=["Yes", "No"], ui="radio"),
                q(
                    "parapet_railing_crash",
                    "Parapet (P) / Railing (R) / Crash Barrier (CB)",
                    "select",
                    options=["Parapet (P)", "Railing (R)", "Crash Barrier (CB)"],
                    ui="radio",
                ),
                q("prc_width", "Width (m) of [P/R/CB]", "number"),
                q("prc_height", "Height (m) of [P/R/CB]", "number"),
                condition("prc_condition", "Condition of P/R/CB"),
                q("bed_protection", "Bed Protection", "select", options=["Yes", "No"], ui="radio"),
                q(
                    "observations_recommendations",
                    "General Condition, Observation & Recommendations, if any",
                    "text",
                ),
            ],
        },
        "grade_separated_structure": {
            "label": "Grade Separated Structure (Flyover/VUP/LVUP/ROB/ROU)",
            "source_questions": "100-131",
            "questions": [
                q("chainage", "Existing Chainage (km)", "text", is_unique_key=True),
                q("cross_road_category", "Cross Road Category / Existing LC No.", "text"),
                q(
                    "structure_type",
                    "Type of Structure (ROB/FLYOVER/VUP…)",
                    "select",
                    options=["VUP", "LVUP", "FLYOVER", "ELEVATED CORRIDOR", "ROB", "ROU"],
                    allow_other=True,
                    ui="radio",
                ),
                q("skew_normal", "Skew / Normal", "select", options=["Skew", "Normal"], ui="radio"),
                q("year_of_construction", "Year of Construction", "text"),
                q("span_arrangement", "Span arrangement [No x Span]", "text", required=False),
                q("total_length_of_bridge", "Total length of Bridge (c/c exp joints) (m)", "number"),
                q(
                    "width_of_structure",
                    "Width of structure (inner/inner of railing or parapet) (m)",
                    "number",
                ),
                q("total_width", "Total width (o/o face of slab) (m)", "number"),
                q("super_structure_type", "Type of Super Structure", "text"),
                q(
                    "wearing_coat_type",
                    "Type of Wearing Coat",
                    "select",
                    options=["BT 40 mm", "BT 50 mm", "CC 40 mm", "CC 50 mm"],
                    allow_other=True,
                    ui="radio",
                ),
                condition("super_structure_condition", "Condition of Super Structure"),
                q(
                    "parapet_railing_crash",
                    "Parapet (P) / Railing (R) / Crash Barrier (CB)",
                    "select",
                    options=["Parapet (P)", "Railing (R)", "Crash Barrier (CB)"],
                    ui="radio",
                ),
                q("prc_width", "Width (m) of P/R/CB", "number"),
                q("prc_height", "Height (m) of P/R/CB", "number"),
                condition("prc_condition", "Condition of P/R/CB"),
                q(
                    "bearing_type",
                    "Bearing Type",
                    "select",
                    options=["Elastomeric Bearings", "Pot Bearing", "Spherical Bearing"],
                    ui="radio",
                ),
                condition("bearing_condition", "Condition of Bearing"),
                q(
                    "sub_structure_type",
                    "Type of Sub-Structure",
                    "select",
                    options=["Circular Pier", "Wall type Pier"],
                    ui="radio",
                ),
                q("pier_abutment_height", "Height of pier & abutment from GL (m)", "number"),
                condition("sub_structure_condition", "Condition of Sub-Structure"),
                q("expansion_joint_type", "Type of Expansion Joint", "text"),
                condition("expansion_joint_condition", "Condition of Expansion Joint"),
                q(
                    "return_wing_wall",
                    "Return Wall/Wing Wall",
                    "select",
                    options=["Return Wall", "Wing Wall"],
                    ui="radio",
                ),
                q("wing_return_wall_size", "Size of Wing Wall/Return Wall", "text"),
                condition("wing_return_wall_condition", "Condition of Wing Wall/Return Wall"),
                q("approach_type", "Approach Type", "text"),
                q("approach_width", "Width of Approach", "number"),
                condition("approach_condition", "Condition of Approach"),
                q("service_road", "Service Road Yes/No", "select", options=["Yes", "No"], ui="radio"),
                q(
                    "service_road_width_side",
                    "Width of SR and Side of SR",
                    "select",
                    options=["7 m BHS", "5.5 BHS", "7.5 RHS", "7.5 LHS", "5.5 RHS", "5.5 LHS"],
                    allow_other=True,
                    ui="radio",
                    required=False,
                ),
                q(
                    "observations_recommendations",
                    "General Condition, Observation & Recommendations, if any",
                    "text",
                ),
            ],
        },
        "utility_identification": {
            "label": "Utility Identification",
            "source_questions": "132-138",
            "questions": [
                q("chainage", "Chainage (000+000 Format)", "text", is_unique_key=True),
                q(
                    "utility_side",
                    "Side of Utility with Respect to Project Road",
                    "select",
                    options=["LHS (Left hand Side)", "RHS (Right hand Side)"],
                    ui="radio",
                ),
                q(
                    "utility_type",
                    "Type of Utility",
                    "select",
                    options=[
                        "Electric Utility (EHT/HT/LT Line, Transformer, Pole, etc.)",
                        "Water Supply / Sewerage Pipeline",
                        "Gas / Petroleum Pipeline Utility",
                        "Optical Fiber Cable (OFC) Utility",
                    ],
                    allow_other=True,
                    ui="radio",
                ),
                q(
                    "utility_owning_agency",
                    "Name of Utility Owning Agency",
                    "select",
                    options=["Not Mentioned on Stone/Board"],
                    allow_other=True,
                    ui="radio",
                ),
                q(
                    "utility_location",
                    "Utility Location (Under Ground/Above Ground)",
                    "select",
                    options=["Under Ground", "Above Ground"],
                    ui="radio",
                ),
                q(
                    "utility_alignment",
                    "Utility Alignment Relative to Road",
                    "select",
                    options=[
                        "Crossing",
                        "Parallel",
                        "Not Identified (If Underground and Direction is not define)",
                    ],
                    ui="radio",
                ),
                q("remarks", "Remarks / Additional Observations", "text", required=False),
            ],
        },
    },
}


UTILITY_SHIFTING_SCHEMA: dict = {
    "module": "utility_shifting",
    "version": 1,
    "root_question": "structure_category",
    "root": {
        "id": "structure_category",
        "label": "Survey Type",
        "type": "select",
        "required": True,
        "options": [
            {
                "value": "utility_identification",
                "label": "Utility Identification & Shifting Requirement",
            }
        ],
    },
    "shared": STRUCTURE_INVENTORY_SCHEMA["shared"],
    "categories": {
        "utility_identification": STRUCTURE_INVENTORY_SCHEMA["categories"]["utility_identification"],
    },
}


def count_questions(schema: dict) -> int:
    """Count leaf questions across categories (excluding root)."""
    total = 0
    for cat in schema["categories"].values():
        total += len(cat["questions"])
    return total
