/** Stable id without relying on crypto.randomUUID (Hermes / older runtimes). */
export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 8)}`;
}
