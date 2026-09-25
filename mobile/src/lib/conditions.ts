import type { Condition, Question } from "@/types";

/** Answers are strings, numbers, or string[] (multiselect). */
type Answers = Record<string, unknown>;

function answerValues(answer: unknown): string[] {
  if (Array.isArray(answer)) return answer.map((v) => String(v));
  if (answer === undefined || answer === null || answer === "") return [];
  return [String(answer)];
}

/** true when the answers satisfy the condition. Unknown shapes are treated as "no condition". */
export function evalCondition(cond: Condition | undefined, answers: Answers): boolean {
  if (!cond) return true;
  if ("any" in cond) return cond.any.some((c) => evalCondition(c, answers));
  if ("all" in cond) return cond.all.every((c) => evalCondition(c, answers));
  if ("q" in cond) {
    const given = answerValues(answers[cond.q]);
    if ("in" in cond) return given.some((v) => cond.in.includes(v));
    if ("not_in" in cond) return !given.some((v) => cond.not_in.includes(v));
  }
  return true;
}

/**
 * Which questions are currently visible. Evaluated top to bottom against the
 * answers of questions that are themselves visible, so a stale answer left in
 * a since-hidden question can't keep something else showing.
 */
export function visibleQuestionIds(questions: Question[], answers: Answers): Set<string> {
  const visible = new Set<string>();
  const effective: Answers = {};
  for (const q of questions) {
    if (!evalCondition(q.showIf, effective)) continue;
    visible.add(q.id);
    if (answers[q.id] !== undefined) effective[q.id] = answers[q.id];
  }
  return visible;
}

/** Compulsory right now: base-required, or its required-if condition holds. */
export function isRequiredNow(q: Question, answers: Answers): boolean {
  return Boolean(q.required) || (q.requiredIf !== undefined && evalCondition(q.requiredIf, answers));
}

/** Only answers to visible questions — hidden questions must not leak stale data into the record. */
export function visibleAnswers(questions: Question[], answers: Answers): Answers {
  const visible = visibleQuestionIds(questions, answers);
  const known = new Set(questions.map((q) => q.id));
  return Object.fromEntries(Object.entries(answers).filter(([id]) => !known.has(id) || visible.has(id)));
}

/**
 * Apply one answer change, plus "same as …" copies: a question with
 * `prefillFrom` mirrors that answer while it is still empty or still holds the
 * value it copied last time — once the surveyor edits it themselves it's left alone.
 */
export function applyAnswer(questions: Question[], prev: Answers, id: string, value: unknown): Answers {
  const next: Answers = { ...prev, [id]: value };
  for (const target of questions) {
    if (target.prefillFrom !== id) continue;
    const current = prev[target.id];
    if (current === undefined || current === "" || current === prev[id]) next[target.id] = value;
  }
  return next;
}
