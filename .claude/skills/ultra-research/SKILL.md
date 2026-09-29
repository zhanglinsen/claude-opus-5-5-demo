---
name: ultra-research
description: "基于证据的研究，可选探索、产品、功能与架构步骤；产出范围明确的规格说明与可审计的规划交接文档。"
user-invocable: true
argument-hint: "[full|product|feature|architecture|custom] — 研究范围"
version: "2.0.0"
compatibility: Requires readable evidence and file read/write. Web search and documentation connectors are optional; current external claims require accessible current sources. No specific task API is required.
allowed-tools: Read, Write, Edit, Grep, Glob, WebSearch, WebFetch, AskUserQuestion, TaskCreate, TaskUpdate
---

# Ultra Research — Step-File Architecture

Turn the user's selected research scope into evidence-backed specifications. Load one step at a time. Preserve existing project decisions and authorized scope; do not repeat already answered questions or add rounds merely to fill a template.

## Capabilities and evidence

- Resolve `{SKILL_DIR}` from the actual loaded `SKILL.md`; step paths are relative to that directory. Do not search a home directory and select an arbitrary installed copy.
- File read/write is required. `AskUserQuestion` and task tracking APIs are optional host conveniences: use a normal question when information is missing, and the persisted state below when task APIs are absent.
- Use available official-documentation lookup capabilities, including Context7 when installed. Discover the available tool rather than assuming a tool name. Fall back to versioned local documentation, source code/lockfiles, or accessible official web documentation. If none supplies necessary evidence, mark that claim unknown and block only the dependent decision.
- Evidence may be an accessible URL with retrieval date, repository path plus revision/line, interview/transcript ID plus date, dataset/experiment output plus method, or an offline document plus edition/page. Cite the actual source location. Do not manufacture a URL for internal material.
- Web queries in step files are examples for gaps requiring external evidence. Adapt their domain and date to the question. No network is needed when suitable local evidence answers it; stale material cannot substantiate a current external claim.
- Separate observed facts, inferences and assumptions. State supporting evidence, limitations and unresolved questions. Use `direct evidence`, `supported inference`, or `unverified assumption`; do not invent confidence percentages. Measured rates may use percentages with numerator/denominator or a cited method.
- Language follows the user's request and existing project convention. Step templates default to English artifacts and Chinese conversation only when no preference exists.

## Scope and routing (single authority)

The entry point owns selection, transitions, skips and completion. Step files own only their analysis and output sections. Their prerequisites describe needed context, not an instruction to add every earlier step.

1. Read the user's request, existing `.ultra/specs/` and prior state. Reuse existing scope/decisions. If the scope cannot be inferred, ask once. Create only required output directories; `/ultra-init` is optional and is not supplied by this library.
2. Select the ordered steps below. Every mode ends with `99` (synthesis). Reused outputs may satisfy a selected step after their relevance is checked; record their source. Do not run unselected steps.
3. Persist `research-state.json` before starting. If a custom step needs missing upstream information, use existing material first. Otherwise record a blocker and obtain that information; do not silently expand the selected sequence.
4. Read the current step completely and execute applicable sections. Numerical counts and example technologies in templates guide breadth, not mandatory scope expansion. Mark inapplicable analysis with a reason.
5. Update only that step's owned sections, verify them, then checkpoint state. Continue to the first incomplete selected step. After the last non-synthesis step, load `99`; after `99`, end the workflow.
6. A user-requested interactive pause or an unresolved material decision requires input. Otherwise continue within existing authorization. `[C] Continue` in a step means accept this step and return control to this router, not a mandatory new confirmation at every step.

| Mode | `selected_steps` (ordered strings) |
|---|---|
| Full Project | `00,01,02,03,04,05,10,11,20,21,22,30,31,32,40,41,99` |
| Product Only | `00,01,02,03,04,05,10,11,20,21,22,99` |
| Feature Only | `10,11,20,21,22,99` |
| Architecture Change | `30,31,32,40,41,99` |
| Custom | A justified ordered subset of the above, followed by `99` |

Validated existing discovery can be reused or excluded explicitly. Architecture-only work may trace to an existing technical requirement instead of creating product stories. An internal tool need not invent TAM, competitors, personas, business metrics or hosting environments.

## Step map and section ownership

These are project-specific arc42-inspired headings; they are not a claim to reproduce the standard arc42 numbering exactly.

| Step | File in `steps/` | Owned output |
|---|---|---|
| 00 | `step-00-problem-validation.md` | discovery.md §0 Problem |
| 01 | `step-01-opportunity-discovery.md` | discovery.md §1 Opportunities |
| 02 | `step-02-market-assessment.md` | discovery.md §2 Market |
| 03 | `step-03-competitive-landscape.md` | discovery.md §3 Competition |
| 04 | `step-04-product-strategy.md` | discovery.md §4 Strategy |
| 05 | `step-05-assumptions-validation.md` | discovery.md §5 Assumptions |
| 10 | `step-10-user-personas.md` | product.md §1 Problem, §2 Personas |
| 11 | `step-11-user-scenarios.md` | product.md §3 Scenarios |
| 20 | `step-20-user-stories.md` | product.md §4 Stories |
| 21 | `step-21-features-scope.md` | product.md §5 Scope |
| 22 | `step-22-success-metrics.md` | product.md §6 Metrics |
| 30 | `step-30-architecture-context.md` | architecture.md §1–3 Goals, Constraints, Context |
| 31 | `step-31-solution-strategy.md` | architecture.md §4 Strategy |
| 32 | `step-32-building-blocks.md` | architecture.md §5–6 Modules, Runtime |
| 40 | `step-40-deployment.md` | architecture.md §7–9 Deployment, Crosscutting Concerns, Cost |
| 41 | `step-41-quality-risks.md` | architecture.md §10–12 Quality, Risks, Decisions |
| 99 | `step-99-synthesis.md` | research-distillate.md |

## Persisted state and recovery

`.ultra/specs/research-state.json` is the routing and handoff authority, with `schema_version: "1.0.0"`. Native host task lists are a convenience mirror. Example checkpoint for feature research:

```json
{
  "schema_version": "1.0.0",
  "scope": "feature",
  "selected_steps": ["10", "11", "20", "21", "22", "99"],
  "completed_steps": ["10"],
  "excluded_steps": {"00-05": "Existing validated strategy", "30-41": "Feature research only"},
  "included_story_ids": [],
  "excluded_story_ids": [],
  "story_refs": {},
  "required_spec_refs": [".ultra/specs/product.md#personas"],
  "step_outputs": {"10": [".ultra/specs/product.md#problem", ".ultra/specs/product.md#personas"]},
  "decisions": [{"ref": "user request 2026-09-08", "decision": "Research this feature only"}],
  "gaps": []
}
```

- IDs in `selected_steps` are unique and from the map; `99` is last. `completed_steps` is a prefix of the selected sequence and may include reused steps with evidence. Compute the next step from these arrays; do not maintain a competing cursor.
- `required_spec_refs` lists the exact sections needed for this scope, populated from selected outputs and necessary existing prerequisites. Every completed step has real `step_outputs`. List omitted/inapplicable sections with reasons; do not claim they were researched.
- Give stories stable IDs and source anchors (`<a id="US-01"></a>` is unambiguous). At scope definition, fill `included_story_ids`, `excluded_story_ids` and `story_refs`. The two sets are disjoint; the mapping covers their union. Architecture-only work may leave both empty and use technical `required_spec_refs`.
- Write a section by locating its heading/anchor and replacing only its owned body, or create it once if absent. Re-reading and rerunning a step must not append duplicate headings or overwrite neighboring sections. If ownership is ambiguous, resolve it before editing.
- Write artifact files before state. Save state through a sibling temporary file and atomic replace. On recovery, read state plus referenced sections, reconcile a section written just before interruption, and resume the first incomplete step. A missing or changed completed output invalidates that checkpoint; do not trust an old task UI alone.
- Old specs remain valid evidence. If no state/schema exists, derive a proposed scope from existing artifacts and the current user request, citing the decision source. Unknown acceptance stays unknown; do not fabricate `completed_steps` or accepted gaps. Unknown schema versions require explicit migration before resuming, preserving the old file.

## Gap and planning handoff contract

`gaps` is an explicit array (empty is allowed). Every entry has `id`, `status`, `reason`, and preferably its affected `spec_ref`/story IDs.

| Status | Meaning | Required evidence | Effect |
|---|---|---|---|
| `blocker` | Required behavior or evidence is missing/contradictory | Specific question and affected scope | Research may continue independently; dependent planning cannot pass |
| `accepted` | A bounded assumption or deferred validation was accepted | `decision_ref` to existing authorization and `follow_up` with owner/condition | Preserve and surface it in Plan; it is not a blanket failure |
| `not_applicable` | Requirement/section does not apply to the selected work | Concrete reason | Do not create filler or extra tasks |

Bare `[NEEDS CLARIFICATION]` text must be mapped to a gap entry; it is neither automatic approval nor a reason to reject an unrelated scope. In-scope executable behavior and a verifiable source cannot be waived by relabeling a blocker. Ask only when a decision needed for this scope has no existing authorization.

## Completion

Complete when selected outputs are verified, synthesis records the included/excluded scope and all gaps, and there is no unresolved blocker for the handoff. Step `99` reports evidence and limits; it does not manufacture confidence. Preserve accepted assumptions and follow-ups in the distillate. Recommend `/ultra-plan` only for the described scope; never imply unselected research is complete.
