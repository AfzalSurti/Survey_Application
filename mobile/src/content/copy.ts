export const COMPANY_INTRO = `Founded in 2007, Geo Designs & Research Pvt. Ltd. (GDRPL) carries forward the legacy of Geo Test House, established in 1991 by Mr. Pradip Chauhan, a Gold Medalist Civil Engineer. With its head office in Vadodara and branches across Gujarat & Rajasthan, GDRPL delivers comprehensive civil engineering solutions.

GDRPL serves sectors including Architecture, BIM, Bridge Engineering, Highways, Hydro Projects, Lab Testing, MEPF, Project Management Consultancy, Structural Design, Urban Planning, Green Buildings, Interior Design, and Environmental Solutions.

GDRPL Survey is a digital field survey application designed for highway infrastructure projects. It enables survey teams to collect, organize, and manage field data in a standardized format, ensuring accuracy, consistency, and reliable project execution.`;

export const STRUCTURE_SURVEY_DESCRIPTION = `This survey is designed to collect a detailed inventory and condition assessment of highway structures, including Pipe Culverts, Box Culverts, Slab Culverts, Minor Bridges, Major Bridges, Flyovers, Railway Over Bridges (ROBs), Railway Under Bridges (RUBs), Vehicular Underpasses (VUPs), Light Vehicular Underpasses (LVUPs), and other grade-separated structures.

Instructions:
• Select the appropriate structure type.
• Enter all dimensions in meters (m) unless otherwise specified.
• Enter the chainage in kilometers (km) using the 00+000 format (e.g., 218+450).
• Record all field measurements accurately.
• Ensure that all mandatory fields are completed before submitting the survey.
• Verify the entered information before final submission.`;

export const UTILITY_SURVEY_DESCRIPTION = `This form is intended for collecting details of existing utilities located within or near the proposed highway corridor for assessment of utility shifting requirements. Provide accurate information regarding the utility type, ownership, location, alignment (crossing/parallel), and side of the roadway.`;

export const STRUCTURE_CATEGORIES = [
  { key: "pipe_culvert", label: "Pipe Culvert" },
  { key: "box_or_slab_culvert", label: "Box Culvert (Span <= 6m) or Slab Culvert" },
  { key: "major_minor_bridge_girder", label: "Major Bridge / Minor Bridge (Girder Type)" },
  { key: "minor_bridge_girder_or_box", label: "Minor Bridge (Girder Type or Box Type > 6m)" },
  { key: "grade_separated_structure", label: "Grade Separated Structure (Flyover/VUP/LVUP/ROB/ROU)" },
] as const;

export const UTILITY_CATEGORIES = [
  { key: "utility_identification", label: "Utility Identification" },
] as const;
