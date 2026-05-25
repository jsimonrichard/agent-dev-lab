/** Thrown by v1 API factories that are typed but not yet executed. */
export class AdlNotImplementedError extends Error {
  readonly feature: string;

  constructor(feature: string) {
    super(`@agent-dev-lab/core: ${feature} is not implemented yet (v1 API draft)`);
    this.name = "AdlNotImplementedError";
    this.feature = feature;
  }
}
