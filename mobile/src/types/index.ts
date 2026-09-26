export type QuestionType = "text" | "number" | "select" | "multiselect" | "condition_rating" | "date" | "photo_group" | "text_list";

/** Same shape the backend schema uses (show_if / required_if). */
export type Condition =
  | { q: string; in: string[] }
  | { q: string; not_in: string[] }
  | { any: Condition[] }
  | { all: Condition[] };

export type Question = {
  id: string;
  label: string;
  type: QuestionType;
  required?: boolean;
  options?: string[];
  minPhotos?: number;
  /** Dropdown also accepts a hand-typed value. */
  allowOther?: boolean;
  /** Only shown while this holds. */
  showIf?: Condition;
  /** Compulsory while this holds (for questions that are optional otherwise). */
  requiredIf?: Condition;
  /** Mirrors another answer until the surveyor edits it ("same as wing wall"). */
  prefillFrom?: string;
  /** text_list only: what one entry is called ("Observation" -> "Observation 1"). */
  itemLabel?: string;
};
export type FormSchema = { version: number; questions: Question[] };
export type SurveyRecord = { id: string; module: string; category: string; chainage: string; responses: Record<string, unknown>; latitude?: number; longitude?: number; capturedAt: string; status: "draft" | "submitted"; syncStatus: "pending" | "synced" | "error"; schemaVersion: number };
