export type StepSlotKey = string;

export function formatStepPathSegment(name: string, key?: string): string {
  return key === undefined ? name : `${name}:${key}`;
}

export class StepRegistry {
  private readonly usedSlots = new Set<StepSlotKey>();
  private readonly nameCounts = new Map<string, number>();

  constructor(private readonly parentKey: string) {}

  private slotKey(name: string, key: string | undefined): StepSlotKey {
    return `${this.parentKey}|${name}|${key ?? ""}`;
  }

  /**
   * Enforces React-like key rules for repeated step names under the same parent.
   */
  register(name: string, key: string | undefined, allowDuplicateName?: boolean): void {
    const count = (this.nameCounts.get(name) ?? 0) + 1;
    this.nameCounts.set(name, count);

    if (count > 1 && key === undefined && !allowDuplicateName) {
      throw new Error(
        `ctx.step("${name}", …): key is required when invoking the same step name again under the same parent`,
      );
    }

    const slot = this.slotKey(name, key);
    if (this.usedSlots.has(slot)) {
      throw new Error(
        `ctx.step("${name}", …): duplicate (name, key) under the same parent — use a distinct key`,
      );
    }
    this.usedSlots.add(slot);
  }
}
