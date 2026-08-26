# SE paper framing — design philosophy as the contribution

Assessment of whether ADL's design philosophy can carry a software engineering
paper, grounded in the mechanisms implemented in `packages/core` and the
framework landscape as of **August 2026**. Companion to the study-protocol and
related-work planning notes; the study protocol itself is not duplicated here.

**Short answer: yes, conditionally.** The philosophy can be the contribution,
but not in the form "ADL strikes the balance better." Reviewers cannot evaluate
"better balance" — they can evaluate a named rule for where a framework is
allowed to have opinions, four principles derived from it, and measured
consequences of violating them. The philosophy decomposes cleanly into exactly
that. The strongest single move available: anchor it in the
exploratory-programming literature, which already established that researchers
need low-commitment structure and that rigid tools measurably impede them.

At a glance: **1 rule** (where opinions belong) · **4 principles** (each
falsifiable) · **2-sided baseline** (the study requirement the balance claim
forces).

---

## 1. The philosophy, stated precisely

The starting intuition — researchers must build novel things quickly, so
flexibility is key, but common engineering (UI, debugging, observability)
should be free — is a design-space position, not yet a claim. The sharpened
version a paper can defend:

> **The rule: opinionate the commodity layer, free the novelty layer.**
> A framework for research may impose structure only on concerns that every
> agentic method shares — step identity, persistence, observation, transcript
> storage. It must stay transparent on concerns where methods differ — control
> flow, prompting strategy, when and how the model is consulted. Existing
> frameworks fail in one of two directions: they opinionate the novelty layer
> (graph DSLs own control flow), or they provide no commodity layer at all
> (plain scripts rebuild observability per experiment).

This formulation converts "balance" from a matter of taste into a **two-sided
failure model**. Each side predicts observable behavior:

- **Over-structured** frameworks should produce workarounds and framework
  escapes when researchers implement genuinely novel methods.
- **Under-supported** scripts should produce rebuilt-per-project logging,
  ad-hoc dump files, and long debugging sessions without run history.

Both predictions can be checked against real artifacts (GitHub issues,
research codebases) before any user study runs.

### The claimed position in the design space

Axes: control-flow flexibility (x) vs. agent-research infrastructure for free
(y). Placements are the paper's **claim, not measurements** — the evaluation
exists to put numbers on both axes.

| System                  | Control-flow flexibility | Infrastructure for free |
| ----------------------- | ------------------------ | ----------------------- |
| Plain AI SDK scripts    | very high                | none                    |
| Graflow (define-by-run) | medium                   | low–medium              |
| Temporal / Inngest      | medium                   | low (durability only)   |
| Mastra                  | medium                   | medium–high             |
| LangGraph + LangSmith   | low                      | high                    |
| DSPy                    | low (declarative)        | medium                  |
| PARNESS (YAML DAG)      | very low                 | medium                  |
| **ADL (claimed)**       | **high**                 | **high**                |

### The academic anchor currently missing

The philosophy is a special case of a lens SE and HCI already accept:
**exploratory programming**. Kery & Myers (VL/HCC 2017) define it by two
features — the goal evolves during coding, and code is the medium of
experimentation — and document that conventional tools are too rigid for it.
Variolite (CHI 2017) and Verdant showed that data scientists need history and
observability captured **automatically, without manual effort**, because
exploration is non-linear and backtracking is constant.

Framing ADL as _exploratory-programming support for agentic workflows_ does
three things at once:

1. Explains why the population is researchers rather than production engineers.
2. Imports established measures (ease of exploration, backtracking cost,
   history sensemaking).
3. Makes the graph-DSL critique principled — a compiled graph is a commitment,
   and exploration is hostile to commitments.

References: Kery & Myers, "Exploring exploratory programming," VL/HCC 2017 ·
Kery, Horvath & Myers, Variolite, CHI 2017 · Kery, Verdant (CMU-HCII-21-106) ·
Yoon & Myers on backtracking, VL/HCC 2014.

---

## 2. Design choices as consequences of the philosophy

The argument structure a design-rationale paper needs: not a feature list, but
**principle → mechanism → the falsifiable bet the mechanism encodes**. All
mechanisms below are implemented in `@agent-dev-lab/core` today.

| Mechanism (as built)                                                                                                                                                                 | Layer                         | The bet it encodes                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workflows are plain typed async functions: `run(input, ctx)` with native `if` / `for` / `try` / `Promise.all`. No graph DSL, no compile step.                                        | Novelty layer — freed         | Novel methods are novel control flow. Any DSL is a prediction about which patterns matter, and research exists to invalidate such predictions. Falsified if researchers express novel methods just as easily in a graph API.                  |
| `ctx.step(name, fn, { key })` is the only point of contact between researcher code and the framework. React-style `(parent, name, key)` identity; skip-on-retry from stored outputs. | Commodity layer — opinionated | One declared boundary is sufficient to buy observability, retry, and the waterfall — without the framework owning execution. Falsified if step-identity errors dominate, or researchers skip `ctx.step` and lose the infrastructure silently. |
| `MessageStore` is not `WorkflowStore`. Conversation transcripts (`memoryScope`) are a different store from run progress and step outputs; docs forbid rebuilding memory from events. | Commodity layer — opinionated | Conflating chat memory with run state causes characteristic bugs (accidental re-prompting, lost transcripts, wrong retries). Falsified if experienced developers already keep the split unaided.                                              |
| Agents are configuration that run one episode: `streamText` hard-capped with `stopWhen: stepCountIs(1)`. Tool loops are written in workflow TypeScript.                              | Boundary case — see risk      | The loop is the method, so the researcher must own it. This is the one place ADL opinionates something researchers vary. Falsified if methods that want model-owned multi-step episodes (ReAct-style) become awkward.                         |
| Interop over abstraction: AI SDK primitives re-exported not wrapped, raw `StreamTextResult` exposed as `.sdk`, OTel used natively with no parallel tracing API.                      | Novelty layer — freed         | Researchers always need the layer below. Escape hatches are load-bearing for a research tool. Weak as a claim alone; strong as evidence the flexibility principle is applied consistently.                                                    |
| Inspection is a projection: headless runtime emits versioned append-only `RunEvent`s; the UI is a reducer over SSE with `seq`/`afterSeq`; wrappers never injected into user code.    | Commodity layer — opinionated | A debugging UI can be free without constraining the program. Architecturally clean but contested ground (LangSmith, AGDebugger) — position as evidence the model is inspectable, not as a standalone contribution.                            |

> **The internal tension to address head-on.** A reviewer will notice that a
> framework preaching flexibility ships opinions: one-episode agents, mandatory
> step keys, a forbidden pattern (memory from events). The where-opinions-belong
> rule is the answer — every constraint sits on a concern all methods share,
> none on a concern where methods differ — but the one-episode agent rule sits
> closest to the line. Either document the escape hatch for model-owned loops
> or make the rule itself a measured question in the study. Naming this tension
> in the paper is far stronger than having a reviewer name it.

---

## 3. Making "balance" falsifiable

As stated, the thesis compares a vector (flexibility, infrastructure) with no
metric on either axis. The fix: decompose into three hypotheses, each with its
own instrument. The first two need no human subjects and can be built before
the study — they are also the best answer to the novelty question, because
they measure the whole-system position rather than any single feature.

### H1 — flexibility (no humans needed)

Recent published agentic methods (Reflexion, tree-of-thoughts, multi-agent
debate, self-refine, search-guided workflows) can be expressed in ADL without
escape hatches or framework fights. **Instrument:** implement 6–10 methods
from the literature in ADL, LangGraph, and plain AI SDK scripts; count
framework-imposed structure, workarounds, and escape-hatch uses per method.

### H2 — infrastructure (no humans needed)

Observability, retry, persistence, and the inspection UI arrive at near-zero
marginal researcher code. **Instrument:** on the same corpus, measure
instrumentation effort — lines and files touched to get equivalent run
history, waterfall, and retry — in each condition.

### H3 — researcher outcomes (the user study)

Researchers implement and debug agentic workflows faster and with fewer
characteristic failure modes in ADL than in either baseline. The planned
measures — efficiency, failure taxonomy, interviews — live here. The failure
taxonomy should be derived from the two-sided failure model, so the study
tests the philosophy rather than general niceness.

> **The balance claim forces a two-baseline study.** "Balance" asserts you
> beat both failure modes, so one baseline cannot support it. Against only
> LangGraph, you have shown flexibility, not that your infrastructure earns
> its constraints. Against only plain scripts, the reverse. The study needs a
> high-structure arm (LangGraph or Mastra) **and** a no-framework arm (plain
> AI SDK scripts) — or, at minimum, planted tasks that expose each failure
> mode within one baseline. Budget for this now; it roughly doubles
> task-authoring work.

A useful pre-study check that costs one afternoon: mine LangGraph and Mastra
GitHub issues for the predicted over-structure failures (fighting the graph,
checkpoint confusion, memory-vs-state bugs), and public research agent repos
for the predicted under-support failures (hand-rolled logging, print
debugging, no run history). If the characteristic failures are not out there,
the philosophy is in trouble — better to know before recruiting participants.

---

## 4. Landscape check (Aug 2026)

A literal "no real peer" claim will not survive review in 2026. Several
systems now pitch one half of the position, and their emergence is favorable:
independent evidence the tension is real. The defensible claim is
**positional** — no system simultaneously holds (a) host-language control
flow, (b) separated agent-native stores, (c) inspection as a pure projection,
and (d) researchers as the target population. Argue it dimension by dimension,
not as a feature matrix.

| System                | Position it occupies                                                          | Why it does not hold ADL's point                                                                                                                                                               |
| --------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LangGraph + LangSmith | Production stateful agent graphs with checkpoints and a studio                | Graph owns control flow even in the Functional API; checkpoint bundles memory with progress; population is production app developers. Primary over-structure baseline.                         |
| Mastra                | TypeScript agents + workflows + tracing — the industrial nearest neighbor     | High primitive overlap; the wedge is the explicit store split, step-key retry semantics, and the researcher population. This comparison must be honest or reviewers will do it for you.        |
| DSPy                  | The research-population framework — but declarative                           | Proof that targeting researchers is viable, and the counter-position on flexibility: it opinionates prompting and control so an optimizer can own them. Ideal foil for the philosophy section. |
| Graflow (2026)        | Define-by-run Python; "control flow is just if/return; debug with pdb"        | Pitches the flexibility axis almost verbatim — but a close read shows it is still a graph engine with framework-owned scheduling and dataflow. See §5; the most instructive comparison.        |
| Overseer (2026)       | "Runtime, observability, and quality control in one place" with a built-in UI | Pitches the infrastructure axis. Graph-declared workflows and verifier gates — opinionated exactly where the thesis argues research needs freedom.                                             |
| PARNESS (2026)        | Explicitly for academic research pipelines — via declarative YAML DAGs        | Shares the population, takes the opposite stance on flexibility. The cleanest evidence that the research niche exists and the design question within it is open.                               |
| Temporal / Inngest    | Workflow-as-code with durable replay / step memoization                       | Solves crash-safe execution, not agent research: no transcripts, no episode semantics, no inspection of LLM behavior. Do not claim their durability guarantees.                                |

The academic side (ENCOMPASS, AGDebugger, Source Code Agent, LLM-as-Code) is
covered in the earlier related-work planning material and is not repeated here.

---

## 5. Graflow, examined closely

Graflow's README (read Aug 25, 2026) markets exactly the flexibility rhetoric:
"think in Python, not framework concepts," define-by-run vs define-and-compile,
"debug with pdb, not a graph inspector." **Cite it prominently** — pretending
the rhetoric is unique would be caught. But its own code examples show the
substance is different: branching is `context.next_task(..., goto=True)`,
loops are `context.next_iteration()` bounded by `max_cycles`, termination is
`context.terminate_workflow()`, the agent loop is an edge declaration
(`agent >> tool >> agent`), and execution starts with `ctx.execute("fetch")`
feeding an engine with queue backends. The graph is constructed at runtime
instead of compile time — but it is still the execution substrate, and the
framework still owns scheduling and data passing.

| Dimension                | Graflow (as shipped)                                                                                                              | ADL                                                                                                                                 | Substantive?                                                                                       |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Execution substrate      | Runtime-constructed task graph; an engine dequeues and schedules tasks (local, Redis workers, Docker/K8s handlers)                | No substrate. `run()` is one host-language function; nothing is scheduled; the framework only observes at declared boundaries       | **Yes** — the orchestrator-vs-observer split, the deepest difference                               |
| Control flow             | Framework API despite the pitch: `next_task(goto)`, `next_iteration` + `max_cycles`, `terminate_workflow`, edges via `>>` / `\|`  | Host language: `if` / `for` / `while` / `try` / `Promise.all`. `ctx.step` is an annotation on a region of code, not a jump target   | **Yes** — quote their README examples against their own tagline                                    |
| Dataflow                 | Implicit channels: task parameters auto-resolved by name from upstream outputs. Convention-based, dynamic, unchecked              | Lexical scope: values flow through typed variables and closures; the compiler checks the pipeline end to end                        | **Yes** — deeper than the language choice: Graflow rebuilt in TypeScript would still have channels |
| Unit of identity / retry | The task node; cycles capped by `max_cycles`; checkpoint serializes engine state                                                  | `(parent, name, key)` step slots inside arbitrary code; skip-on-retry from stored outputs. Identity without being a scheduling unit | **Yes** — identity decoupled from scheduling is the mechanism a PL/SE reviewer can bite into       |
| Agent / memory semantics | None. Third-party agents (LiteLLM, Pydantic AI, Google ADK) injected as opaque objects; conversation state is the agent's problem | Episode semantics, `memoryScope`, and the `MessageStore` / `WorkflowStore` split as framework-level concepts                        | **Yes** — Graflow takes no position on the concern the dual-store thesis is about                  |
| Observability            | Langfuse integration; the README's debugging story is pdb                                                                         | Event log is part of the semantics: the runtime itself reads it back (step skip) and the UI is a projection of it                   | Mostly — "integration vs semantics" is real, but LangSmith-adjacent, so argue carefully            |
| Direction of scaling     | Out: Redis queues, worker pools, per-task Docker images — production operations                                                   | In: inspection UI, test runtime, fast iteration loop — the research workflow                                                        | Population signal rather than semantics; use as framing, not as a claim                            |

> **The argument this hands the paper.** A define-by-run graph is still a
> graph. Runtime construction removes the compile-time commitment but keeps
> the run-time one: the program must be expressed as schedulable units wired
> through framework channels, so the framework re-acquires control flow and
> dataflow at exactly the moment of execution. ADL's position is categorically
> different — there are no schedulable units, only observed regions of
> ordinary code. That yields a classification axis for the whole landscape:
> **framework-as-orchestrator** (compile-time graph: LangGraph; runtime graph:
> Graflow; replayed code: Temporal) versus **framework-as-observer** (annotated
> code: ADL). The axis is itself a small conceptual contribution, and it
> prevents the related-work section from degenerating into a feature matrix.

### Differences not to lean on

Real but non-substantive; a reviewer will discount any argument built on them:
TypeScript vs Python; Graflow's missing UI or ADL's missing distributed
execution and human-in-the-loop (both are "not built yet," not "cannot be
built"); repo maturity, stars, docs polish. **If a difference would disappear
given six months of engineering on either side, it is not a design
difference.** Re-verify against their docs before submission; define-by-run
projects move fast.

---

## 6. Novelty beyond the study

The user study should be the confirmatory layer of the paper, not its only
novel content. Stacked below it are four contributions publishable in their
own right — which also de-risks the plan: if the study numbers come out noisy,
the paper degrades gracefully instead of collapsing.

1. **The design theory (conceptual).** The where-opinions-belong rule, the
   two-sided failure model, and the orchestrator-vs-observer axis for
   classifying frameworks. Plus the resume taxonomy: conversation continuity,
   run retry, inspection, and crash durability as four distinct concerns that
   existing systems bundle into one "state." Citable design theory — the
   React-named-a-model move — and no current paper names it for agentic
   systems.
2. **Step-identity semantics (semi-formal).** A precise account of
   `(parent, name, key)` slot identity inside ordinary control flow: what is
   persisted, when a callback is skipped, how identity survives loops and
   `Promise.all`, what is explicitly not durable (closure locals between
   steps). Written as a small-step semantics or rigorous prose, this is
   OOPSLA/Onward!-adjacent machinery — and exactly the piece Graflow, Mastra,
   and Inngest leave informal.
3. **The expressiveness corpus (artifact + method).** The H1/H2 instrument is
   reusable beyond this paper: a benchmark of published agentic methods, with
   per-framework measures of imposed structure, workarounds, and
   instrumentation effort. Framework evaluation today is vibes and feature
   tables; a corpus others can run against their own systems is a
   methodological contribution with an artifact badge attached.
4. **The failure-mode taxonomy (empirical, no lab).** Mined from
   LangGraph/Mastra issue trackers and public research agent repos: the
   over-structure failures (fighting the graph, checkpoint-memory confusion)
   and under-support failures (hand-rolled logging, no run history, print
   debugging). Observational evidence for the failure model that requires no
   participants and doubles as the study's coding rubric.

> **How the layers compose into one paper.** Theory (1) predicts failures; the
> mined taxonomy (4) shows they occur in the wild; the semantics (2) shows the
> proposed point in the design space is precisely constructible; the corpus
> (3) shows it is habitable for real methods at low cost; the study confirms
> it changes researcher outcomes. A reviewer skeptical of small-N studies
> still has layers 1–4 to accept. Conversely, shipping only the study leaves
> the paper one noisy experiment away from a reject.

Fallback shapes if the study slips: layers 1+4 alone fit Onward! or ICSE NIER;
layers 1+2 fit Onward!/pattern-language venues; layers 1+3+4 fit a full
tools-track submission with the study deferred to future work.

---

## 7. Verdict and risks

Starting from the philosophy is the right call, and it resolves the novelty
problem. Individually, the mechanisms have peers; the contribution is the
position — a named rule for where framework opinions belong in research
tooling, four principles that follow from it, an implementation demonstrating
the point in the design space is habitable, and evidence that the two
predicted failure modes are real and that occupying the point avoids them.
That is a legitimate and recognized SE paper shape: design rationale plus
measured consequences, evaluated on the programmer. React did not invent
components and Temporal did not invent retries; both named a model and showed
its consequences.

| Risk                                                                                  | Countermeasure                                                                                                                                                               |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "This is DX preference, not science" — the default reviewer read of any balance claim | H1/H2 corpus numbers in the paper body, formative-interview quotes establishing the problem without mentioning ADL, and the exploratory-programming literature as the frame. |
| One-baseline study — supports only half the thesis                                    | Two arms (high-structure + no-framework) or planted tasks covering both failure modes. Decide before task authoring begins.                                                  |
| "Mastra / Graflow already does this"                                                  | The orchestrator-vs-observer axis (§5) turns the comparison semantic instead of feature-based, plus the H1 corpus implemented in the competitor so the difference is shown.  |
| Own opinions contradict the flexibility pitch (one-episode agents)                    | State the where-opinions-belong rule explicitly, treat the agent-episode rule as its hardest test, and report participants who wanted model-owned loops.                     |
| Overclaiming maturity — cancellation is partial, mid-closure resume does not exist    | Scope claims to what is built (same-runId step skip, dual stores, event-sourced inspection). A limitations section that names Temporal-class durability as out of scope.     |

### Concrete next artifact

Write the philosophy section of the paper first — roughly two pages: the rule,
the four principles, the two-sided failure model, and the DSPy/PARNESS foils.
It doubles as the coding rubric for the formative interviews and the failure
taxonomy for the study, so nothing in it is wasted even if the framing shifts.
The study protocol and venue sequencing from earlier planning remain valid
underneath this framing; the only structural change this analysis forces is
the second baseline arm.
