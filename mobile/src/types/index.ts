export type QuestionType = "text" | "number" | "select" | "multiselect" | "condition_rating" | "date" | "photo_group";
export type Question = { id: string; label: string; type: QuestionType; required?: boolean; options?: string[]; minPhotos?: number };
export type FormSchema = { version: number; questions: Question[] };
export type SurveyRecord = { id: string; module: string; category: string; chainage: string; responses: Record<string, unknown>; latitude?: number; longitude?: number; capturedAt: string; status: "draft" | "submitted"; syncStatus: "pending" | "synced" | "error"; schemaVersion: number };
