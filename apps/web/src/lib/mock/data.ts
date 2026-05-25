import type {
  EpisodeArtifacts,
  MockAgentSummary,
  MockConversation,
  MockProject,
  MockRunSummary,
  MockWorkflowSummary,
  RunEvent,
} from "./types";

export const mockProject: MockProject = {
  name: "playground-research",
  root: "/workspace/apps/playground",
  configPath: "adl.config.ts",
  devMode: "framework-dev",
  coreVersion: "0.0.0-workspace",
  workflowIds: ["literature-review", "quick-summary"],
  agentIds: ["researcher", "writer"],
};

export const mockWorkflows: MockWorkflowSummary[] = [
  {
    id: "literature-review",
    description: "Multi-step literature review with nested search and synthesis.",
  },
  {
    id: "quick-summary",
    description: "Single-pass summary for a topic string.",
  },
];

export const mockAgents: MockAgentSummary[] = [
  {
    id: "researcher",
    description: "Search and cite papers; one model episode per run.",
  },
  {
    id: "writer",
    description: "Draft prose from prior research context.",
  },
];

export const mockRuns: MockRunSummary[] = [
  {
    runId: "run_01H9ZK",
    workflowId: "literature-review",
    status: "completed",
    startedAt: "2026-05-25T14:02:11.000Z",
    finishedAt: "2026-05-25T14:08:44.000Z",
    inputPreview: '{"topic":"CRISPR delivery"}',
  },
  {
    runId: "run_01H9ZL",
    workflowId: "literature-review",
    status: "running",
    startedAt: "2026-05-25T15:10:00.000Z",
    inputPreview: '{"topic":"base editing safety"}',
  },
  {
    runId: "run_01H9ZM",
    workflowId: "quick-summary",
    status: "failed",
    startedAt: "2026-05-24T09:15:00.000Z",
    finishedAt: "2026-05-24T09:15:42.000Z",
    inputPreview: '{"topic":"…"}',
  },
];

/** Completed literature-review run — drives waterfall + transcript mock. */
export const mockRunEventsLiteratureReview: RunEvent[] = [
  {
    seq: 1,
    runId: "run_01H9ZK",
    type: "run_started",
    at: "2026-05-25T14:02:11.000Z",
    workflowId: "literature-review",
    input: { topic: "CRISPR delivery" },
  },
  {
    seq: 2,
    runId: "run_01H9ZK",
    type: "step_started",
    at: "2026-05-25T14:02:11.100Z",
    stepId: "step_outline",
    parentStepId: null,
    name: "outline",
    path: ["outline"],
  },
  {
    seq: 3,
    runId: "run_01H9ZK",
    type: "step_finished",
    at: "2026-05-25T14:02:45.000Z",
    stepId: "step_outline",
    durationMs: 33800,
    output: { sections: ["Background", "Delivery vectors", "Clinical trials"] },
  },
  {
    seq: 4,
    runId: "run_01H9ZK",
    type: "step_started",
    at: "2026-05-25T14:02:45.100Z",
    stepId: "step_lr",
    parentStepId: null,
    name: "literature-review",
    path: ["literature-review"],
  },
  {
    seq: 5,
    runId: "run_01H9ZK",
    type: "step_started",
    at: "2026-05-25T14:02:45.200Z",
    stepId: "step_search_a",
    parentStepId: "step_lr",
    name: "search",
    key: "CRISPR delivery",
    path: ["literature-review", "search:CRISPR delivery"],
  },
  {
    seq: 6,
    runId: "run_01H9ZK",
    type: "agent_started",
    at: "2026-05-25T14:02:45.300Z",
    stepId: "step_search_a",
    agentId: "researcher",
    memoryScope: "run_01H9ZK:search:CRISPR delivery",
    episodeId: "ep_1",
  },
  {
    seq: 7,
    runId: "run_01H9ZK",
    type: "text_delta",
    at: "2026-05-25T14:02:46.000Z",
    stepId: "step_search_a",
    episodeId: "ep_1",
    delta: "Found 12 papers on lipid nanoparticle delivery.",
  },
  {
    seq: 8,
    runId: "run_01H9ZK",
    type: "messages_committed",
    at: "2026-05-25T14:03:20.000Z",
    stepId: "step_search_a",
    memoryScope: "run_01H9ZK:search:CRISPR delivery",
    messageCount: 4,
  },
  {
    seq: 9,
    runId: "run_01H9ZK",
    type: "agent_finished",
    at: "2026-05-25T14:03:20.100Z",
    stepId: "step_search_a",
    episodeId: "ep_1",
    durationMs: 34800,
  },
  {
    seq: 10,
    runId: "run_01H9ZK",
    type: "step_finished",
    at: "2026-05-25T14:03:20.200Z",
    stepId: "step_search_a",
    durationMs: 35000,
    output: { papers: ["pmid:1", "pmid:2"] },
  },
  {
    seq: 11,
    runId: "run_01H9ZK",
    type: "step_started",
    at: "2026-05-25T14:03:20.300Z",
    stepId: "step_search_b",
    parentStepId: "step_lr",
    name: "search",
    key: "off-target",
    path: ["literature-review", "search:off-target"],
  },
  {
    seq: 12,
    runId: "run_01H9ZK",
    type: "step_finished",
    at: "2026-05-25T14:04:10.000Z",
    stepId: "step_search_b",
    durationMs: 49700,
    output: { papers: ["pmid:9"] },
  },
  {
    seq: 13,
    runId: "run_01H9ZK",
    type: "step_finished",
    at: "2026-05-25T14:08:30.000Z",
    stepId: "step_lr",
    durationMs: 344900,
    output: { summary: "…" },
  },
  {
    seq: 14,
    runId: "run_01H9ZK",
    type: "run_finished",
    at: "2026-05-25T14:08:44.000Z",
    output: { reportPath: "./out/report.md" },
  },
];

/** In-progress run — partial tree for live UI demo. */
export const mockRunEventsRunning: RunEvent[] = [
  {
    seq: 1,
    runId: "run_01H9ZL",
    type: "run_started",
    at: "2026-05-25T15:10:00.000Z",
    workflowId: "literature-review",
    input: { topic: "base editing safety" },
  },
  {
    seq: 2,
    runId: "run_01H9ZL",
    type: "step_started",
    at: "2026-05-25T15:10:00.100Z",
    stepId: "step_outline_z",
    parentStepId: null,
    name: "outline",
    path: ["outline"],
  },
  {
    seq: 3,
    runId: "run_01H9ZL",
    type: "step_started",
    at: "2026-05-25T15:10:30.000Z",
    stepId: "step_search_z",
    parentStepId: null,
    name: "search",
    key: "base editing",
    path: ["search:base editing"],
  },
  {
    seq: 4,
    runId: "run_01H9ZL",
    type: "agent_started",
    at: "2026-05-25T15:10:30.100Z",
    stepId: "step_search_z",
    agentId: "researcher",
    memoryScope: "run_01H9ZL:search:base editing",
    episodeId: "ep_z1",
  },
  {
    seq: 5,
    runId: "run_01H9ZL",
    type: "text_delta",
    at: "2026-05-25T15:10:31.000Z",
    stepId: "step_search_z",
    episodeId: "ep_z1",
    delta: "Scanning PubMed for base editor off-target studies…",
  },
];

const eventsByRunId: Record<string, RunEvent[]> = {
  run_01H9ZK: mockRunEventsLiteratureReview,
  run_01H9ZL: mockRunEventsRunning,
  run_01H9ZM: [
    {
      seq: 1,
      runId: "run_01H9ZM",
      type: "run_started",
      at: "2026-05-24T09:15:00.000Z",
      workflowId: "quick-summary",
      input: { topic: "test" },
    },
    {
      seq: 2,
      runId: "run_01H9ZM",
      type: "step_started",
      at: "2026-05-24T09:15:01.000Z",
      stepId: "step_fail",
      parentStepId: null,
      name: "summarize",
      path: ["summarize"],
    },
  ],
};

export function getMockRunEvents(runId: string): RunEvent[] {
  return eventsByRunId[runId] ?? [];
}

export const mockConversations: Record<string, MockConversation> = {
  "run_01H9ZK:search:CRISPR delivery": {
    memoryScope: "run_01H9ZK:search:CRISPR delivery",
    agentId: "researcher",
    messages: [
      {
        id: "m1",
        role: "system",
        content: "You are a research assistant focused on biomedical literature.",
      },
      {
        id: "m2",
        role: "user",
        content: "Find recent papers on CRISPR delivery via lipid nanoparticles.",
      },
      {
        id: "m3",
        role: "assistant",
        content: `Found **12 papers** on lipid nanoparticle delivery.

### Key themes
- Liver targeting and biodistribution
- Extrahepatic delivery challenges
- Formulation stability under storage

Top hit: [LNP-CRISPR review (2024)](https://example.org/lnp-crispr) — see \`delivery.assay\` metadata in the tool output tab.`,
      },
    ],
  },
  "run_01H9ZL:search:base editing": {
    memoryScope: "run_01H9ZL:search:base editing",
    agentId: "researcher",
    messages: [
      {
        id: "m1",
        role: "system",
        content: "You are a research assistant focused on biomedical literature.",
      },
      {
        id: "m2",
        role: "user",
        content: "Survey base editing safety and off-target editing rates.",
      },
      {
        id: "m3",
        role: "assistant",
        content: `Scanning PubMed for base editor off-target studies…

| Metric | Early studies | Recent meta-analysis |
| --- | --- | --- |
| Off-target rate | ~2–5% | **<1%** with optimized editors |
| Sample size | n < 50 | n > 200 |

> Still streaming citations — check the **Tools** tab for live \`search_pubmed\` calls.`,
      },
    ],
  },
  "playground:researcher:local": {
    memoryScope: "playground:researcher:local",
    agentId: "researcher",
    messages: [
      {
        id: "m1",
        role: "system",
        content: "You are a research assistant.",
      },
      {
        id: "m2",
        role: "user",
        content: "What is a good starting prompt for literature review?",
      },
    ],
  },
};

export function getMockWorkflow(id: string): MockWorkflowSummary | undefined {
  return mockWorkflows.find((w) => w.id === id);
}

export function getMockAgent(id: string): MockAgentSummary | undefined {
  return mockAgents.find((a) => a.id === id);
}

export function getMockRun(runId: string): MockRunSummary | undefined {
  return mockRuns.find((r) => r.runId === runId);
}

/** Mock tool + structured output per agent episode. */
export const mockEpisodeArtifacts: Record<string, EpisodeArtifacts> = {
  ep_1: {
    episodeId: "ep_1",
    toolCalls: [
      {
        id: "tc_1",
        name: "search_pubmed",
        args: { query: "CRISPR lipid nanoparticle delivery", maxResults: 12 },
      },
      {
        id: "tc_2",
        name: "fetch_abstracts",
        args: { pmids: ["12345678", "23456789"] },
      },
    ],
    toolResults: [
      {
        toolCallId: "tc_1",
        result: {
          papers: [
            { pmid: "12345678", title: "LNP-mediated CRISPR delivery to liver" },
            { pmid: "23456789", title: "Extrahepatic LNP formulations" },
          ],
        },
      },
      {
        toolCallId: "tc_2",
        result: { abstractsLoaded: 2 },
      },
    ],
    structuredOutput: {
      schemaName: "PaperSearchResult",
      value: {
        papers: ["pmid:12345678", "pmid:23456789"],
        themes: ["liver targeting", "formulation stability"],
      },
    },
  },
  ep_z1: {
    episodeId: "ep_z1",
    toolCalls: [
      {
        id: "tc_z1",
        name: "search_pubmed",
        args: { query: "base editor off-target", maxResults: 8 },
      },
    ],
    toolResults: [
      {
        toolCallId: "tc_z1",
        result: { papers: [{ pmid: "99887766", title: "Off-target rates in BE3" }] },
      },
    ],
  },
};

export function getEpisodeArtifacts(episodeId: string): EpisodeArtifacts | undefined {
  return mockEpisodeArtifacts[episodeId];
}
