---
name: ultra-plan
description: "将已确认的规格范围拆解为可执行任务，含依赖、验收与来源检查；支持完整项目、既有功能、架构改造与精简交付切片。"
user-invocable: true
argument-hint: "[EXPAND|SELECTIVE|HOLD|REDUCE|功能/模块范围]"
version: "2.0.0"
compatibility: Requires readable specifications, project files and file write access. Python 3.9+ runs the optional bundled artifact validator; no host task API or other ultra command is required.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob, Task, AskUserQuestion
---

# /ultra-plan

Turn the agreed specification scope into `.ultra/tasks/tasks.json` and one context file per task. Preserve requirements, acceptance criteria and source references. Plan the user's current slice; do not turn deferred work into mandatory tasks to satisfy an artificial coverage target.

## Inputs and capabilities

Use `.ultra/specs/research-distillate.md` as a reading aid, verified against source sections and `research-state.json` when present. Specifications can also be supplied directly; `/ultra-research` is helpful, not a required prior command. Reuse existing architecture and repository conventions.

Resolve `{SKILL_DIR}` from this loaded `SKILL.md`. File read/write is required; host `TaskCreate`/`TaskUpdate`/question tools are optional mirrors/conveniences. Use normal conversation for missing information. Do not read or write unrelated projects. No network or external-model capability is needed to decompose adequate local specifications.

## 0. Select and record scope

Use the explicit user posture/scope or an existing confirmed decision. Default to `SELECTIVE` within the current request. Ask only if missing information materially changes the plan; do not require a repeat confirmation.

| Mode | Behavior |
|---|---|
| EXPAND | Explore additional value, label each proposed expansion and its costs. Include it only when authorized. |
| SELECTIVE | Keep the agreed baseline; offer optional extensions only when useful. |
| HOLD | Keep scope fixed; cover relevant failure modes and acceptance boundaries. |
| REDUCE | Identify the minimum useful delivery; carry excluded stories and rationale forward. |

Persist `planning.included_story_ids`, `excluded_story_ids`, and `story_refs` before generating tasks. Coverage applies only to the included set. Architecture or infrastructure work may have an empty story set and trace directly to agreed technical requirements. Changing scope updates this record and the decision source; it never silently changes source specs.

Effort estimates should be ranges with assumptions and analogous evidence where available. LOC and model wall-clock guesses are not reliable promises. Complexity is a relative aid, not a formula for context use or an automatic gate.

## 1. Validate applicable specifications

Read only selected and required prerequisite sections. `planning.required_spec_refs` records that set. A feature-only plan can use `product.md` plus existing code without a new architecture/discovery file. Full project work checks all relevant selected outputs. A file existing is insufficient: inspect the behavior, constraints, acceptance and evidence it contains.

Useful source coordinates from the bundled Research templates:

| File | Relevant sections |
|---|---|
| discovery.md, when applicable | §0 Problem, §1 Opportunities, §2 Market, §3 Competition, §4 Strategy, §5 Assumptions |
| product.md, when applicable | §1 Problem, §2 Personas, §3 Scenarios, §4 Stories, §5 Included/Excluded Scope, §6 Metrics |
| architecture.md, when applicable | §1 Goals, §2 Constraints, §3 Context, §4 Strategy, §5 Modules, §6 Runtime, §7 Deployment, §8 Crosscutting Concerns, §9 Cost, §10 Quality Scenarios, §11 Risks, §12 Decisions |

Check that included requirements have testable acceptance, constraints are consistent, and referenced facts have retrievable sources. Internal code, interviews, experiment results and offline materials are valid evidence; URL-only rules, a minimum number of personas/competitors and invented numerical targets are not completeness criteria.

Copy relevant gaps from the research handoff without reinterpreting their acceptance:

- `blocker`: missing or contradictory behavior/evidence needed for this scope. Pause dependent planning and name the exact information needed.
- `accepted`: bounded assumption with `id`, `reason`, `decision_ref` and `follow_up`. Preserve and report it; do not reopen an existing decision without new contradictory evidence.
- `not_applicable`: `id`, `reason` and why it is outside this scope. Do not generate filler.

Unclassified in-scope `[NEEDS CLARIFICATION]` markers are blockers until classified with evidence. Accepted assumptions cannot excuse nonexistent source sections or undefined executable behavior. Missing unrelated files or markers outside scope do not block this plan.

If prior `tasks.json` exists, resume it by default for a continuation request. For a different slice, preserve the existing registry/context set in a named archive before producing a separate cycle; do not replace existing work without authorization. Ask only when append/replace intent cannot be inferred.

## 2. Analyze requirements and code

Extract functional requirements from included stories, technical constraints from architecture §2, quality scenarios from §10, and applicable metrics from product §6. Compare the summary with original sections so omissions in a distillate do not silently delete requirements.

Inspect actual source/test/config patterns, analogous implementations, versions, test commands and integration boundaries. Preserve those choices unless a change is necessary for this scope. Record uncertainty instead of inventing a new stack.

## 3. Generate tasks

Each task delivers an observable result and has a stable ID, source, acceptance and minimal useful context.

| Field | Meaning |
|---|---|
| `id`, `title` | Stable string ID and action-oriented title |
| `type`, `priority` | architecture / feature / bugfix; P0–P3 |
| `complexity` | Relative 1–10 estimate with rationale in the context |
| `status` | pending / in_progress / completed / blocked; authoritative in JSON |
| `dependencies` | Existing prerequisite IDs, no cycles |
| `estimated_days` | Optional range/estimate with assumptions in context |
| `context_file` | Exactly `contexts/task-{id}.md` |
| `trace_to` | Real source path plus exact heading or explicit anchor |
| `story_ids` | Included story IDs covered by this task; empty for justified supporting technical work |

Use small coherent tasks. Complexity ≥7, >8 touched files, or >20 tasks in one cycle are review warnings: split when it improves execution, or document why the scope is still coherent. Do not force tiny fixes to meet a minimum complexity score. Estimate context from the actual files and required excerpts; if unavailable, say unknown rather than computing `complexity × percent`.

Integration work is conditional:

- Add a minimal end-to-end skeleton only if a new execution path must be proven or it resolves an actual integration risk. Use the layers this project has. A pure function may need only an API and behavior test; a CLI may not need persistence.
- Define a contract before competing implementations when an actual cross-component boundary requires it. Reuse an existing valid contract.
- Add an integration checkpoint where independent changes create a real interaction risk. Do not add one every fixed number of tasks.
- Prefer useful vertical slices, but a focused UI fix, library function or technical contract may legitimately touch one layer. No universal Task #1 or dependency on an unnecessary skeleton exists.

Context template:

````markdown
# Task {id}: {title}

Status source: `../tasks.json`, task `{id}`. Do not maintain another status field here.

## Context
What: [observable behavior]
Why: [user value or required technical outcome]
Constraints: [scope, assumptions and excluded work]

## Implementation
Target files: [actual create/modify paths]
Existing pattern: [source location]
Technical notes: [only what this task needs]
Effort/complexity rationale: [assumptions and limits]

## Acceptance
- [Observable passing case]
- [Relevant failure/boundary case]
- Command: `[existing test/verification command]`

## Trace
Source: `.ultra/specs/product.md#US-01`
Story IDs: [included IDs, or explanation for supporting technical work]
Accepted gaps: [IDs and follow-ups, if relevant]

## Change Log
[Date, reason, source decisions; preserve earlier entries]

## Completion
[Evidence, command outcome and commit when completed; task status lives in JSON]
````

## 4. Analyze dependencies

Validate every dependency exists, reject cycles with their chain, and determine a topological order. Identify useful parallel work. Contract providers precede consumers when that dependency is real; a supporting task need not block unrelated features.

## 5. Save and recover

`tasks.json` is the authoritative plan and task-status registry. Native task UI and context summaries derive from it. Use `schema_version: "1.0.0"` for the new explicit scope contract; preserve any existing legacy `version` field as provenance rather than treating it as this schema.

```json
{
  "schema_version": "1.0.0",
  "created": "YYYY-MM-DD",
  "planning": {
    "phase": "save",
    "scope_mode": "SELECTIVE",
    "decision_ref": "user request or existing scope decision",
    "included_story_ids": ["US-01"],
    "excluded_story_ids": ["US-02"],
    "story_refs": {
      "US-01": ".ultra/specs/product.md#US-01",
      "US-02": ".ultra/specs/product.md#US-02"
    },
    "required_spec_refs": [".ultra/specs/product.md#US-01"],
    "gaps": []
  },
  "tasks": [{
    "id": "1", "title": "Implement the included observable behavior",
    "type": "feature", "priority": "P1", "complexity": 4,
    "status": "pending", "dependencies": [], "story_ids": ["US-01"],
    "context_file": "contexts/task-1.md",
    "trace_to": ".ultra/specs/product.md#US-01"
  }]
}
```

`planning.phase` is one of `scope`, `requirements`, `codebase`, `generation`, `dependencies`, `save`, `verification`, `complete`. Save each phase before/after its work and preserve existing task IDs/status. A phase is a checkpoint, not proof of completion.

Write each context section in place, preserving unrelated user content and history. Do not append a second copy on retry. Write context files first, then publish JSON through a sibling temporary file and atomic replace. On recovery, reconcile task IDs against actual context paths/content and resume incomplete work; missing artifacts or a half-written context cannot be treated as completed. Archive stale contexts deliberately outside the active `contexts/` directory; never delete them just to make counts match.

Legacy artifacts without `schema_version` are rejected by the validator. They may be migrated after inspecting their actual sources: preserve a copy, retain IDs/status/evidence, record the current included/excluded scope from real decisions, and add explicit mappings. Never silently infer accepted gaps or completion from a legacy file existing. Unknown schema versions require a documented migration.

## 6. Verify the saved plan

Run the bundled validator from the project root (quote the actual skill path):

```text
uv run --offline --no-project --no-cache python -B "{SKILL_DIR}/scripts/validate_plan.py" .ultra/tasks/tasks.json
```

If `uv` is unavailable, use an available Python 3.9+ interpreter without installing dependencies. If no interpreter is available, perform the checks manually, report that the executable validator was not run, and do not claim automated validation.

The validator checks schema, story/source existence, scope coverage/exclusions, duplicate IDs, exact task/context sets, context path boundaries, source anchors, missing dependencies, cycles and gap status. Use explicit `<a id="US-01"></a>` anchors in new specs or the exact existing heading slug; do not invent a fragment. Missing/broken references are **errors**, not warnings.

- Exit `0`: structural artifacts valid; still inspect acceptance quality, source meaning and scope decisions.
- Exit `1`: invalid, with specific reasons; fix within scope before presenting a complete plan.
- Exit `2` with `--allow-incomplete`: recoverable checkpoint, explicitly not complete. This flag never bypasses malformed IDs, unsafe paths or scope violations.

During drafting use `--allow-incomplete` and inspect remaining work. Once all artifacts and semantic checks are complete, set `planning.phase` to `complete`, run the strict validator, and revert to `verification` if it fails. No text/JSON validator proves the specification or acceptance is good; read the relevant contexts and verify the planned commands suit the project.

## 7. Report and handoff

Report the included and excluded stories, tasks/priority/dependencies, estimated effort with assumptions, accepted gaps, validation actually performed, and the first ready task. Ask for input only on a remaining required decision; a planning request already authorizes preparing this reviewable output.

`/ultra-dev`, `/ultra-test`, `/ultra-deliver`, `/ultra-init` and `/ultra-status` are optional external commands not distributed here. If unavailable, the concrete continuation is to implement the first dependency-ready task from its context using the project's normal development and test workflow. Do not invent or install missing commands to continue.
