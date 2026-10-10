export function identifier(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "" && value.length <= 200 && !/[\r\n\u0000]/.test(value);
}

export function amount(value: unknown, maximum = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= maximum;
}

export function positive(value: unknown, maximum = Number.MAX_SAFE_INTEGER): value is number {
  return amount(value, maximum) && value > 0;
}

export function oneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === "string" && values.includes(value as T);
}

export function listOf<T>(value: unknown, valid: (item: unknown) => item is T): value is T[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 16 &&
    new Set(value).size === value.length && value.every(valid);
}
