# Step 11: User Scenarios

> Scope, evidence, language, confirmation and checkpoint rules: [entry contract](../SKILL.md). Run only when selected; return to its router when done. Reuse existing decisions and sources.

## MANDATORY EXECUTION RULES

- Define the relevant scenarios with trigger, flow and outcome; 3-5 is a guide for a broad scope, not a minimum
- SCENARIOS ARE USER JOURNEYS — not feature lists
- CONNECT each scenario to a specific persona from step-10
- Include emotional context only when supported and useful; do not invent it for technical actors
- WRITE output to spec file BEFORE presenting to user
- Follow the user/project language preference; English artifacts and Chinese conversation are only template defaults

## PREREQUISITES

- This step is selected in `research-state.json`.
- Needed input: Relevant personas/actors and their goals, from step 10 or existing product evidence.
- Read existing sources first. Missing necessary input becomes a scoped blocker; it does not automatically add skipped steps. Create the owned output section only when needed.

## CONTEXT BOUNDARIES

- Focus: In what situations do users encounter this problem? What's the journey?
- Scenarios describe WHEN and HOW users interact, not WHAT the product does
- Each scenario should be a story the user can picture happening
- Prioritize scenarios by frequency and pain severity

## EXECUTION SEQUENCE

### 1. Identify Key Scenarios

For each persona from step-10, ask:
- What triggers them to need a solution? (the "aha" moment)
- What's the most common situation? (daily/weekly use)
- What's the most painful situation? (highest frustration)
- What's the most valuable situation? (highest ROI)

If the answer is not already available, ask using the host question capability or normal conversation:
"For [Primary Persona], what's the most common situation where they hit this problem? Walk me through a typical day."

### 2. Map Scenario Details

For each scenario (3-5), capture:

| Element | Description |
|---------|-------------|
| Trigger | What event causes the user to need a solution? |
| Context | Where are they? What device? What time pressure? |
| Current flow | How they handle it today (the painful way) |
| Desired flow | How they WISH they could handle it |
| Success outcome | What does "done well" look like? |
| Failure outcome | What happens if they fail? |
| Frequency | How often does this scenario occur? |
| Emotional arc | Frustration → Action → Resolution |

### 3. Prioritize Scenarios

Score by:
- **Frequency** (1-5): How often does this happen?
- **Pain severity** (1-5): How painful is the current experience?
- **Value** (1-5): How much value does solving this create?

Priority Score = Frequency × Pain × Value

### 4. Write Output

**WRITE IMMEDIATELY** to `.ultra/specs/product.md` §3:

```markdown
## §3 User Scenarios

### Scenario Overview

| # | Scenario | Persona | Frequency | Pain | Value | Score |
|---|----------|---------|-----------|------|-------|-------|
| S1 | [Name] | [P1] | 5 | 4 | 5 | 100 |
| S2 | [Name] | [P1] | 4 | 5 | 4 | 80 |
| S3 | [Name] | [P2] | 3 | 4 | 4 | 48 |
| S4 | [Name] | [P2] | 2 | 3 | 3 | 18 |

### Scenario 1: [Descriptive Name] ⭐ Primary

**Persona**: [Persona Name]
**Frequency**: [Daily / Weekly / Monthly]

**Trigger**: [What event causes this scenario]
**Context**: [Where, when, device, time pressure]

**Current Flow** (painful):
1. [Step 1 — what they do today]
2. [Step 2 — where friction occurs]
3. [Step 3 — workaround they use]
4. [Step 4 — outcome and time wasted]

> 💬 *"[User quote or typical complaint that captures the frustration]"*

**Desired Flow** (with our product):
1. [Step 1 — trigger detected]
2. [Step 2 — streamlined action]
3. [Step 3 — fast resolution]
4. [Step 4 — outcome achieved in less time]

**Success Outcome**: [What "done well" looks like — specific and measurable]
**Failure Outcome**: [What happens if they fail — consequences]
**Emotional Arc**: [Frustration with X] → [Discovery of solution] → [Relief / satisfaction]

### Scenario 2: [Descriptive Name]
[Same structure]

### Scenario 3: [Descriptive Name]
[Same structure]

### Round 1 Summary

**User & Scenario Discovery Confidence**:
- **Persona accuracy**: [evidence status, source and limitation] — [One-line assessment]
- **Scenario coverage**: [evidence status, source and limitation] — [One-line assessment]
- **Overall R1 confidence**: [evidence status, source and limitation]
```

### 5. Write Round 1 Research Report

**WRITE** to `.ultra/docs/research/user-scenario-{date}.md`:

```markdown
# Round 1: User & Scenario Discovery

> **Confidence**: [evidence status, source and limitation]
> **Steps completed**: [actual selected and verified step IDs in this round]
> **Completed**: [date]

## Key Findings
[3-5 bullet points]

## Personas Defined
[Names and one-line descriptions]

## Scenarios Prioritized
[Top 3 with scores]

## Surprises
[What was unexpected]
```

### 6. Present to User and Gate

Show the User Scenarios summary. Ask:
- Do these scenarios feel realistic?
- Is anything missing from the journey?
- Is the prioritization right?

```
[C] Continue — Accept this step and return to the selected-step router
[R] Revise — Adjust scenario details or prioritization
[A] Add — Include additional scenario
```

**Pause only for an unresolved required decision or a user-requested interactive gate. Otherwise checkpoint and continue under the entry contract.**

### 7. Handle Response

- **[C]**: Verify owned output, checkpoint completion, and return to the router in `../SKILL.md`.
- **[R]**: Revise scenarios, update product.md §3, re-present
- **[A]**: Add a scenario only when it covers distinct in-scope behavior, update, re-present

## SUCCESS METRICS

- Relevant scenarios defined with enough detail to derive acceptance
- Each scenario connected to a persona
- Current flow AND desired flow documented
- Scenarios prioritized by Frequency × Pain × Value
- Round 1 research report written
- Output written to product.md §3

## FAILURE MODES

- Scenarios that describe features instead of user journeys
- Missing the "current flow" (how users cope today)
- Invented emotional claims without user evidence
- Missing a materially different in-scope actor; one actor may suffice for a narrow feature
- Not writing output before presenting to user

## NEXT STEP

Return to the entry router: choose the next incomplete `selected_steps` item. If this is the last selected analysis step, synthesize with `99`; never load a hardcoded neighboring step.
