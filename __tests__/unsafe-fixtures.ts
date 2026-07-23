/**
 * Supplies a deliberately invalid JavaScript value to a typed API.
 *
 * Keep this helper limited to characterization tests that exercise values a
 * TypeScript caller could not provide. Ordinary fixtures must satisfy their
 * production type without using this escape hatch.
 */
export function unsafeInvalidValue<T>(value: unknown): T {
  return value as T
}
