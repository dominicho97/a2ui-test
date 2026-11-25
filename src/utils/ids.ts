let counter = 0;

/** Collision-free id for events/annotations created within the same millisecond. */
export function createId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}
