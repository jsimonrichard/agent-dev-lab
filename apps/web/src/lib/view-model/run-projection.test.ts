import { describe, expect, it } from "bun:test";

import { findEpisodeInTree, resolveRunSelection } from "./run-projection";
import type { AgentEpisode, StepNode } from "./types";

function episode(id: string): AgentEpisode {
  return {
    episodeId: id,
    agentId: "researcher",
    memoryScope: `${id}:notes`,
    status: "completed",
    streamingText: "",
    warnings: [],
  };
}

function step(id: string, extra: Partial<StepNode> = {}): StepNode {
  return {
    stepId: id,
    parentStepId: null,
    name: id,
    path: [id],
    status: "completed",
    children: [],
    agentEpisodes: [],
    ...extra,
  };
}

describe("findEpisodeInTree", () => {
  it("finds a nested episode", () => {
    const notes = episode("ep-notes");
    const tree = [
      step("research", {
        children: [step("child", { parentStepId: "research", agentEpisodes: [notes] })],
      }),
    ];
    expect(findEpisodeInTree(tree, "ep-notes")).toEqual({
      step: tree[0]?.children[0],
      episode: notes,
    });
  });
});

describe("resolveRunSelection", () => {
  const notes = episode("ep-notes");
  const critique = episode("ep-critique");
  const tree = [
    step("research", {
      agentEpisodes: [notes, critique],
    }),
    step("empty"),
  ];

  it("prefers the requested episode", () => {
    expect(resolveRunSelection(tree, { stepId: "empty", episodeId: "ep-critique" })).toEqual({
      stepId: "research",
      episodeId: "ep-critique",
    });
  });

  it("falls back to the requested step", () => {
    expect(resolveRunSelection(tree, { stepId: "empty" })).toEqual({
      stepId: "empty",
      episodeId: null,
    });
  });

  it("defaults to the first step that has a conversation", () => {
    expect(resolveRunSelection(tree)).toEqual({
      stepId: "research",
      episodeId: null,
    });
  });
});
