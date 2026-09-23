import { createId } from "../internal/ids";
import type {
  MemoryScopeSnapshot,
  RunEvent,
  StepRecord,
  WorkflowRunSummary,
} from "../observability/events";
import type { WorkflowStore } from "../observability/workflow-store";

export type SeedRetryAttemptArgs = {
  /** Run that contains the target step (any run in its forest). */
  fromWorkflowRunId: string;
  /** Step to retry from; unknown id throws. */
  fromStepId: string;
};

/** Prior nested-child spawn record used to resolve mapped ids on re-entry. */
export type PriorChildLink = {
  priorParentRunId: string;
  priorParentStepId: string | null;
  /** Logical path of the spawning parent step (empty when nested at root). */
  priorParentStepPath: string[];
  priorChildRunId: string;
  workflowId: string;
};

export type AttemptRunMaterialization = {
  workflowRunId: string;
  workflowId: string;
  status: WorkflowRunSummary["status"];
  startedAt: string;
  finishedAt?: string;
  input?: unknown;
  output?: unknown;
  title?: string;
  tags: string[];
  parentWorkflowRunId?: string | null;
  parentStepId?: string | null;
  retriesFromRunId?: string | null;
  replayOfRunId?: string | null;
};

export type AttemptStepMaterialization = {
  workflowRunId: string;
  stepId: string;
  name: string;
  key?: string;
  path: string[];
  parentStepId: string | null;
  output?: unknown;
  status: StepRecord["status"];
  pure?: boolean;
  replayOfStepId?: string | null;
  memoryScopes?: readonly string[];
  memorySnapshots?: readonly MemoryScopeSnapshot[];
};

/**
 * Seeded new-attempt forest: copies for still-valid work, new ids for re-exec.
 * Pass into {@link WorkflowRunStartOptions.retryAttempt} when re-entering.
 */
export type RetryAttempt = {
  newRootRunId: string;
  retriesFromRunId: string;
  /** Prior run id → new run id. */
  runIdMap: Map<string, string>;
  /** Prior step id → new step id (replayed / seeded steps only). */
  stepIdMap: Map<string, string>;
  /** Prior step ids that must re-execute on the new attempt. */
  reExecStepIds: ReadonlySet<string>;
  priorChildLinks: readonly PriorChildLink[];
  /**
   * Mutable FIFO cursor for nested calls at parent workflow root
   * (`parentStepId === null`). Key: `${priorParentRunId}\0${workflowId}`.
   */
  rootSpawnCursor: Map<string, number>;
};

/**
 * Map a prior attempt's `${runId}:${suffix}` scope onto this attempt.
 * Returns null when `scope` is not prefixed by a run id in `runIdMap` (a caller-chosen id).
 */
export function retargetMemoryScope(
  scope: string,
  runIdMap: ReadonlyMap<string, string>,
): string | null {
  let match: { priorId: string; newId: string } | null = null;
  for (const [priorId, newId] of runIdMap) {
    if (!scope.startsWith(`${priorId}:`)) {
      continue;
    }
    if (!match || priorId.length > match.priorId.length) {
      match = { priorId, newId };
    }
  }
  if (!match) {
    return null;
  }
  return `${match.newId}:${scope.slice(match.priorId.length + 1)}`;
}

type ForestStep = {
  workflowRunId: string;
  stepId: string;
  parentStepId: string | null;
  path: string[];
  name: string;
  key?: string;
  startedAt: string;
  startedRunSeq: number;
  endedAt?: string;
  endedRunSeq?: number;
  output?: unknown;
  status: "ok" | "error" | "running";
  pure: boolean;
  memoryScopes?: readonly string[];
  memorySnapshots?: readonly MemoryScopeSnapshot[];
};

type ForestSnapshot = {
  rootRunId: string;
  runs: Map<string, WorkflowRunSummary>;
  runInputs: Map<string, unknown>;
  runOutputs: Map<string, unknown>;
  stepsByRun: Map<string, ForestStep[]>;
  stepById: Map<string, ForestStep>;
  childLinks: PriorChildLink[];
};

function pathEquals(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return a.every((seg, i) => seg === b[i]);
}

function isPathPrefix(prefix: string[], path: string[]): boolean {
  if (prefix.length >= path.length) {
    return false;
  }
  return prefix.every((seg, i) => seg === path[i]);
}

function isPathAncestorOrSelf(ancestor: string[], path: string[]): boolean {
  if (ancestor.length > path.length) {
    return false;
  }
  return ancestor.every((seg, i) => seg === path[i]);
}

async function loadForestSnapshot(
  store: WorkflowStore,
  fromWorkflowRunId: string,
): Promise<ForestSnapshot> {
  const start = await store.getRun(fromWorkflowRunId);
  if (!start) {
    throw new Error(`seedRetryAttempt: unknown workflow run "${fromWorkflowRunId}"`);
  }

  let rootRunId = fromWorkflowRunId;
  let cursor: WorkflowRunSummary | null = start;
  while (cursor?.parentWorkflowRunId) {
    rootRunId = cursor.parentWorkflowRunId;
    cursor = await store.getRun(rootRunId);
    if (!cursor) {
      throw new Error(`seedRetryAttempt: broken parent chain at "${rootRunId}"`);
    }
  }

  const root = await store.getRun(rootRunId);
  if (!root) {
    throw new Error(`seedRetryAttempt: unknown forest root "${rootRunId}"`);
  }

  const descendants = await store.listDescendantRuns(rootRunId);
  const runs = new Map<string, WorkflowRunSummary>([
    [root.workflowRunId, root],
    ...descendants.map((r) => [r.workflowRunId, r] as const),
  ]);

  const runInputs = new Map<string, unknown>();
  const runOutputs = new Map<string, unknown>();
  const stepsByRun = new Map<string, ForestStep[]>();
  const stepById = new Map<string, ForestStep>();
  const childLinks: PriorChildLink[] = [];

  for (const run of runs.values()) {
    runInputs.set(run.workflowRunId, await store.getRunInput(run.workflowRunId));
    runOutputs.set(run.workflowRunId, await store.getRunOutput(run.workflowRunId));

    const events = await store.listEvents({ workflowRunId: run.workflowRunId });
    const steps = collectStepsFromEvents(events);
    stepsByRun.set(run.workflowRunId, steps);
    for (const step of steps) {
      stepById.set(step.stepId, step);
    }

    if (run.parentWorkflowRunId != null) {
      childLinks.push({
        priorParentRunId: run.parentWorkflowRunId,
        priorParentStepId: run.parentStepId ?? null,
        priorParentStepPath: [],
        priorChildRunId: run.workflowRunId,
        workflowId: run.workflowId,
      });
    }
  }

  // Fill parent step paths once all runs are loaded
  for (const link of childLinks) {
    if (link.priorParentStepId == null) {
      continue;
    }
    const parentSteps = stepsByRun.get(link.priorParentRunId) ?? [];
    const spawn = parentSteps.find((s) => s.stepId === link.priorParentStepId);
    if (spawn) {
      link.priorParentStepPath = spawn.path;
    }
  }

  return { rootRunId, runs, runInputs, runOutputs, stepsByRun, stepById, childLinks };
}

function collectStepsFromEvents(events: RunEvent[]): ForestStep[] {
  const byId = new Map<string, ForestStep>();
  for (const event of events) {
    if (event.type === "step_started") {
      byId.set(event.stepId, {
        workflowRunId: event.workflowRunId,
        stepId: event.stepId,
        parentStepId: event.parentStepId,
        path: event.path,
        name: event.name,
        key: event.key,
        startedAt: event.at,
        startedRunSeq: event.runSeq,
        status: "running",
        pure: event.pure !== false,
      });
    } else if (event.type === "step_finished") {
      const existing = byId.get(event.stepId);
      byId.set(event.stepId, {
        workflowRunId: event.workflowRunId,
        stepId: event.stepId,
        parentStepId: event.parentStepId,
        path: event.path,
        name: event.name,
        key: event.key,
        startedAt: existing?.startedAt ?? event.at,
        startedRunSeq: existing?.startedRunSeq ?? event.runSeq,
        endedAt: event.at,
        endedRunSeq: event.runSeq,
        output: event.output,
        status: "ok",
        pure: event.pure !== false,
        memoryScopes: event.memoryScopes,
        memorySnapshots: event.memorySnapshots,
      });
    } else if (event.type === "step_failed") {
      const existing = byId.get(event.stepId);
      byId.set(event.stepId, {
        workflowRunId: event.workflowRunId,
        stepId: event.stepId,
        parentStepId: event.parentStepId,
        path: event.path,
        name: event.name,
        key: event.key,
        startedAt: existing?.startedAt ?? event.at,
        startedRunSeq: existing?.startedRunSeq ?? event.runSeq,
        endedAt: event.at,
        endedRunSeq: event.runSeq,
        status: "error",
        pure: event.pure !== false,
        memoryScopes: event.memoryScopes,
      });
    } else if (event.type === "step_skipped") {
      if (!byId.has(event.stepId)) {
        byId.set(event.stepId, {
          workflowRunId: event.workflowRunId,
          stepId: event.stepId,
          parentStepId: event.parentStepId,
          path: event.path,
          name: event.name,
          key: event.key,
          startedAt: event.at,
          startedRunSeq: event.runSeq,
          endedAt: event.at,
          endedRunSeq: event.runSeq,
          output: event.output,
          status: "ok",
          pure: true,
          memoryScopes: event.memoryScopes,
          memorySnapshots: event.memorySnapshots,
        });
      }
    }
  }
  return [...byId.values()];
}

/**
 * Compute prior step ids that must re-execute on a new attempt targeting S.
 */
export function computeReExecStepIds(
  snapshot: ForestSnapshot,
  fromWorkflowRunId: string,
  fromStepId: string,
): Set<string> {
  const S = snapshot.stepById.get(fromStepId);
  if (!S) {
    throw new Error(`seedRetryAttempt: unknown stepId "${fromStepId}"`);
  }
  if (S.workflowRunId !== fromWorkflowRunId) {
    throw new Error(
      `seedRetryAttempt: step "${fromStepId}" belongs to run "${S.workflowRunId}", not "${fromWorkflowRunId}"`,
    );
  }

  const tEnd = S.endedAt ?? S.startedAt;
  const tEndSeq = S.endedRunSeq ?? S.startedRunSeq;
  const reExec = new Set<string>();

  const mark = (stepId: string) => {
    reExec.add(stepId);
  };

  const isTimeSubsequent = (step: ForestStep): boolean => {
    if (step.stepId === S.stepId) {
      return false;
    }
    if (step.startedAt > tEnd) {
      return true;
    }
    // Same wall-clock ms: order by started runSeq relative to S's terminal event.
    return step.startedAt === tEnd && step.startedRunSeq > tEndSeq;
  };

  mark(S.stepId);

  // In-run descendants + path ancestors of S
  const inRun = snapshot.stepsByRun.get(S.workflowRunId) ?? [];
  for (const step of inRun) {
    if (step.stepId === S.stepId) {
      continue;
    }
    if (isPathPrefix(S.path, step.path)) {
      mark(step.stepId);
    }
    if (isPathAncestorOrSelf(step.path, S.path) && step.path.length < S.path.length) {
      mark(step.stepId);
    }
  }

  // Child runs under S (parentStepId is S or a descendant of S)
  const descendantStepIds = new Set<string>([S.stepId]);
  for (const step of inRun) {
    if (isPathPrefix(S.path, step.path)) {
      descendantStepIds.add(step.stepId);
    }
  }

  const runsUnderTarget = new Set<string>();
  for (const run of snapshot.runs.values()) {
    if (run.parentWorkflowRunId === S.workflowRunId && run.parentStepId != null) {
      if (descendantStepIds.has(run.parentStepId)) {
        runsUnderTarget.add(run.workflowRunId);
      }
    }
  }
  // Transitively include descendants of those child runs
  let grew = true;
  while (grew) {
    grew = false;
    for (const run of snapshot.runs.values()) {
      if (
        run.parentWorkflowRunId &&
        runsUnderTarget.has(run.parentWorkflowRunId) &&
        !runsUnderTarget.has(run.workflowRunId)
      ) {
        runsUnderTarget.add(run.workflowRunId);
        grew = true;
      }
    }
  }
  for (const runId of runsUnderTarget) {
    for (const step of snapshot.stepsByRun.get(runId) ?? []) {
      mark(step.stepId);
    }
  }

  // parentWorkflowRunId chain: spawning parentStepId + path ancestors
  let walkRunId: string | null = S.workflowRunId;
  while (walkRunId) {
    const walkRun = snapshot.runs.get(walkRunId);
    if (!walkRun?.parentWorkflowRunId) {
      break;
    }
    const parentRunId = walkRun.parentWorkflowRunId;
    const spawnStepId = walkRun.parentStepId;
    if (spawnStepId) {
      mark(spawnStepId);
      const parentSteps = snapshot.stepsByRun.get(parentRunId) ?? [];
      const spawn = parentSteps.find((s) => s.stepId === spawnStepId);
      if (spawn) {
        for (const step of parentSteps) {
          if (isPathAncestorOrSelf(step.path, spawn.path) && step.path.length < spawn.path.length) {
            mark(step.stepId);
          }
        }
      }
    }
    walkRunId = parentRunId;
  }

  // Time-subsequent + impure across the linked forest
  for (const steps of snapshot.stepsByRun.values()) {
    for (const step of steps) {
      if (isTimeSubsequent(step)) {
        mark(step.stepId);
      }
      if (!step.pure) {
        mark(step.stepId);
        // Ancestors needed to re-enter impure steps
        const runSteps = snapshot.stepsByRun.get(step.workflowRunId) ?? [];
        for (const other of runSteps) {
          if (isPathAncestorOrSelf(other.path, step.path) && other.path.length < step.path.length) {
            mark(other.stepId);
          }
        }
        // Parent chain for impure in nested runs
        let impureRunId: string | null = step.workflowRunId;
        while (impureRunId) {
          const impureRun = snapshot.runs.get(impureRunId);
          if (!impureRun?.parentWorkflowRunId) {
            break;
          }
          if (impureRun.parentStepId) {
            mark(impureRun.parentStepId);
          }
          impureRunId = impureRun.parentWorkflowRunId;
        }
      }
    }
  }

  return reExec;
}

/**
 * Resolve the mapped child run id when nesting during an attempt.
 * Matches `(parentWorkflowRunId, parentStepId, workflowId)` against prior links
 * via run/step id maps, falling back to spawn path when the parent step re-executes.
 */
export function resolveAttemptChildRunId(
  attempt: RetryAttempt,
  args: {
    parentWorkflowRunId: string;
    parentStepId: string | null;
    workflowId: string;
    parentStepPath?: string[];
  },
): string | undefined {
  const reverseRun = new Map<string, string>();
  for (const [prior, next] of attempt.runIdMap) {
    reverseRun.set(next, prior);
  }
  const reverseStep = new Map<string, string>();
  for (const [prior, next] of attempt.stepIdMap) {
    reverseStep.set(next, prior);
  }

  const priorParentRunId = reverseRun.get(args.parentWorkflowRunId);
  if (priorParentRunId === undefined) {
    return undefined;
  }

  const candidates = attempt.priorChildLinks.filter(
    (link) => link.priorParentRunId === priorParentRunId && link.workflowId === args.workflowId,
  );
  if (candidates.length === 0) {
    return undefined;
  }

  if (args.parentStepId === null) {
    const nullCandidates = candidates.filter((link) => link.priorParentStepId === null);
    const key = `${priorParentRunId}\0${args.workflowId}`;
    const idx = attempt.rootSpawnCursor.get(key) ?? 0;
    const match = nullCandidates[idx];
    if (!match) {
      return undefined;
    }
    attempt.rootSpawnCursor.set(key, idx + 1);
    return attempt.runIdMap.get(match.priorChildRunId);
  }

  const priorStepId = reverseStep.get(args.parentStepId);
  if (priorStepId !== undefined) {
    const match = candidates.find((link) => link.priorParentStepId === priorStepId);
    return match ? attempt.runIdMap.get(match.priorChildRunId) : undefined;
  }

  if (args.parentStepPath) {
    const match = candidates.find((link) =>
      pathEquals(link.priorParentStepPath, args.parentStepPath!),
    );
    if (match) {
      return attempt.runIdMap.get(match.priorChildRunId);
    }
  }

  if (candidates.length === 1) {
    return attempt.runIdMap.get(candidates[0]!.priorChildRunId);
  }

  return undefined;
}

/**
 * Seed a new attempt on `store`: materialize replayed runs/steps, return attempt handle.
 */
export async function seedRetryAttemptOnStore(
  store: WorkflowStore,
  args: SeedRetryAttemptArgs,
): Promise<RetryAttempt> {
  const snapshot = await loadForestSnapshot(store, args.fromWorkflowRunId);

  if (!snapshot.stepById.has(args.fromStepId)) {
    throw new Error(`seedRetryAttempt: unknown stepId "${args.fromStepId}"`);
  }

  const reExecStepIds = computeReExecStepIds(snapshot, args.fromWorkflowRunId, args.fromStepId);

  const runIdMap = new Map<string, string>();
  const stepIdMap = new Map<string, string>();
  const newRootRunId = createId();
  runIdMap.set(snapshot.rootRunId, newRootRunId);

  for (const runId of snapshot.runs.keys()) {
    if (!runIdMap.has(runId)) {
      runIdMap.set(runId, createId());
    }
  }

  const attempt: RetryAttempt = {
    newRootRunId,
    retriesFromRunId: snapshot.rootRunId,
    runIdMap,
    stepIdMap,
    reExecStepIds,
    priorChildLinks: snapshot.childLinks,
    rootSpawnCursor: new Map(),
  };

  // Materialize each run
  for (const [priorRunId, priorRun] of snapshot.runs) {
    const newRunId = runIdMap.get(priorRunId)!;
    const steps = snapshot.stepsByRun.get(priorRunId) ?? [];
    const runHasReExec = steps.some((s) => reExecStepIds.has(s.stepId));
    const isRoot = priorRunId === snapshot.rootRunId;

    // Still-valid successful non-root run with no re-exec steps → replay copy.
    // Failed/cancelled siblings stay projected without replayOf so a re-entry re-runs.
    const isStillValidCopy = !runHasReExec && !isRoot;
    const fullyReplayedOk =
      isStillValidCopy && priorRun.status === "ok" && priorRun.finishedAt != null;

    let newParentWorkflowRunId: string | null = null;
    let newParentStepId: string | null = null;
    if (priorRun.parentWorkflowRunId) {
      newParentWorkflowRunId = runIdMap.get(priorRun.parentWorkflowRunId) ?? null;
      if (priorRun.parentStepId) {
        if (reExecStepIds.has(priorRun.parentStepId)) {
          // Parent spawn re-executes — child run id is reserved; parentStepId
          // will be the new runtime id. Leave null on the seeded row; nested
          // replay short-circuit patches it via materializeAttemptRun.
          newParentStepId = null;
        } else {
          // Ensure spawn step is mapped
          if (!stepIdMap.has(priorRun.parentStepId)) {
            stepIdMap.set(priorRun.parentStepId, createId());
          }
          newParentStepId = stepIdMap.get(priorRun.parentStepId) ?? null;
        }
      }
    }

    const input = snapshot.runInputs.get(priorRunId);
    const output = snapshot.runOutputs.get(priorRunId);

    let copyStatus: WorkflowRunSummary["status"] = "running";
    let copyFinishedAt: string | undefined;
    if (fullyReplayedOk) {
      copyStatus = "ok";
      copyFinishedAt = priorRun.finishedAt;
    } else if (isStillValidCopy) {
      copyStatus = priorRun.status === "running" ? "error" : priorRun.status;
      copyFinishedAt = priorRun.finishedAt;
    }

    await store.materializeAttemptRun({
      workflowRunId: newRunId,
      workflowId: priorRun.workflowId,
      status: copyStatus,
      startedAt: priorRun.startedAt,
      finishedAt: copyFinishedAt,
      input: input ?? undefined,
      output: fullyReplayedOk ? (output ?? undefined) : undefined,
      title: priorRun.title,
      tags: [...priorRun.tags],
      parentWorkflowRunId: newParentWorkflowRunId,
      parentStepId: newParentStepId,
      retriesFromRunId: isRoot ? snapshot.rootRunId : null,
      replayOfRunId: fullyReplayedOk ? priorRunId : null,
    });

    // Seed step copies for non-re-exec steps with ok output
    for (const step of steps) {
      if (reExecStepIds.has(step.stepId)) {
        continue;
      }
      if (step.status !== "ok" || step.output === undefined) {
        continue;
      }
      const newStepId = stepIdMap.get(step.stepId) ?? createId();
      stepIdMap.set(step.stepId, newStepId);

      let newStepParentId: string | null = null;
      if (step.parentStepId) {
        if (reExecStepIds.has(step.parentStepId)) {
          // Parent will re-enter; path-stable skip still works without parent id link
          newStepParentId = null;
        } else {
          if (!stepIdMap.has(step.parentStepId)) {
            stepIdMap.set(step.parentStepId, createId());
          }
          newStepParentId = stepIdMap.get(step.parentStepId)!;
        }
      }

      await store.materializeAttemptStep({
        workflowRunId: newRunId,
        stepId: newStepId,
        name: step.name,
        key: step.key,
        path: step.path,
        parentStepId: newStepParentId,
        output: step.output,
        status: "ok",
        pure: step.pure,
        replayOfStepId: step.stepId,
        memoryScopes: step.memoryScopes,
        memorySnapshots: step.memorySnapshots,
      });
    }
  }

  return attempt;
}
