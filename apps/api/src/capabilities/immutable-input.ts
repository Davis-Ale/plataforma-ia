export function createImmutableInput(input: unknown): unknown {
  const snapshot: unknown = structuredClone(input);
  const visited = new WeakSet<object>();

  function freeze(value: unknown): void {
    if (value === null || typeof value !== "object" || visited.has(value)) {
      return;
    }
    const prototype: unknown = Object.getPrototypeOf(value);
    if (!Array.isArray(value) && prototype !== null && Object.getPrototypeOf(prototype) !== null) {
      throw new Error("Unsupported mutable capability input");
    }
    visited.add(value);
    for (const nested of Object.values(value)) {
      freeze(nested);
    }
    Object.freeze(value);
  }

  freeze(snapshot);
  return snapshot;
}
