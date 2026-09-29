# Step 99: Research Synthesis & Distillate

## Execution contract

Follow the scope, evidence, gap and recovery contract in [SKILL.md](../SKILL.md). This is the terminal selected step. It summarizes existing evidence; it does not add unselected research or change the user's scope.

Prerequisites: all preceding `selected_steps` are verified in `research-state.json`, with actual `step_outputs`; required prerequisite sections are available. Only files required by that scope must exist. Feature-only research does not require discovery.md or architecture.md.

## 1. Validate the selected scope

Read the state and referenced sections. For each selected step, verify its applicable output contains real content and evidence; no success based only on file existence. Use the entry point's section map rather than a fixed all-file checklist.

| Selected work | Check where applicable |
|---|---|
| 00–05 | Problem evidence, opportunities, sourced market assumptions, alternatives, strategy trade-offs and validation plan |
| 10–11 | Actual user/actor needs and scenarios with trigger, flow and outcome |
| 20–22 | Stable story IDs, testable acceptance, included/excluded scope with reasons, measurable success and honest baselines |
| 30–32 | Quality goals, constraints, system context, justified choices, modules and meaningful runtime/error paths |
| 40–41 | Relevant operating/deployment conditions, cost assumptions, quality checks, risks and decisions |

Template counts and models are aids, not a requirement to invent extra personas, competitors, layers or environments. A selected section that does not apply must have a specific `not_applicable` reason. A necessary source or missing executable behavior remains a blocker.

Check that `included_story_ids` and `excluded_story_ids` are disjoint, `story_refs` covers their union, and every mapping resolves to a real source section. Check `required_spec_refs` against the selected outputs and actual prerequisites so a missing file cannot be hidden by omitting it from the list.

Classify every relevant unresolved question using the entry point's gap statuses:

- `blocker`: report the affected decision and information required; continue independent synthesis, but do not claim this scope is ready for planning.
- `accepted`: retain the existing `decision_ref`, reason and `follow_up`. If an acceptance is needed and not already authorized, obtain that decision before changing the status.
- `not_applicable`: record why it does not apply; do not generate filler.

Do not reopen accepted gaps just because a generic checklist has an unchecked box. Do not label unknowns accepted by default. Retain unresolved markers with gap IDs or replace their owned text with the classified record; never blanket-delete them.

## 2. Write the distillate

Update `.ultra/specs/research-distillate.md`. Keep it concise, normally around 2,000 tokens when the scope permits; preserve critical constraints, exclusions, evidence and risks even if that needs more space. State is the routing authority; the distillate is a readable summary and must agree with it.

```markdown
# Research Distillate

Generated: [date]
State schema: 1.0.0
Scope: [selected scope and current request/decision reference]
Selected steps: [IDs]
Completed steps: [verified IDs]
Excluded/reused steps: [IDs, reasons and evidence]

## Core outcome
[Problem, actor, desired result and applicable success measure]

## Current scope
Included story IDs: [list or none for technical-only work]
Excluded story IDs: [list plus rationale]
Required spec references: [real paths/anchors]
Must-build: [capability and source reference]
Explicitly out: [deferred capability and reason]

## Relevant architecture and constraints
[Existing or chosen design, rationale and source; omit unrelated stack fields]
[Technical, organizational or regulatory constraints actually applicable]

## Evidence and limits
[Direct evidence / supported inference / unverified assumption, with sources]
[No invented confidence score; retain measured values with method]

## Gaps and follow-ups
| ID | Status | Affected scope | Reason | Decision reference | Follow-up |
|---|---|---|---|---|---|
| [G1] | [blocker/accepted/not_applicable] | [source/story] | [reason] | [actual authorization when accepted] | [owner/condition when accepted] |

## Rejected alternatives
[Relevant alternatives and why rejected]

## Quality targets and risks
[Applicable measurable behavior, risk, evidence and mitigation]
```

Verify referenced files/sections before marking `99` complete. Update only the owned distillate and state; do not overwrite source specifications to make the summary appear consistent.

## 3. Report actual status

List only selected steps, their verified output locations, evidence limits and unresolved/accepted gaps. Report validation counts with a denominator drawn from applicable checks; never average invented confidence scores. List actual output files rather than promising every possible artifact.

- Ready: all selected outputs and handoff requirements verified, no applicable blocker. End here and identify `/ultra-plan` for the recorded scope.
- Blocked: preserve the partial distillate and state, identify the exact dependent decision and continue only independent work. Do not mark `99` complete.
- Revisions: revisit the relevant selected step, update its owned sections and rerun synthesis; if scope changes, update the router's selection explicitly first.

A `[D] Done` acknowledgement is optional unless the user requested interactive gates. Existing authorization remains valid. Export another format only if requested; no automatic expansion to a new workflow.
