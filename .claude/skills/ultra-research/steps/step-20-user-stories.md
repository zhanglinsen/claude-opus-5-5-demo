# Step 20: User Stories & Acceptance Criteria

> Scope, evidence, language, confirmation and checkpoint rules: [entry contract](../SKILL.md). Run only when selected; return to its router when done. Reuse existing decisions and sources.

## MANDATORY EXECUTION RULES

- DERIVE stories from scenarios (step-11) — not invented from thin air
- EVERY story has acceptance criteria — no story ships without testable conditions
- USE standard format: "As a [persona], I want [action], so that [benefit]"
- PRIORITIZE using MoSCoW: Must / Should / Could / Won't
- WRITE output to spec file BEFORE presenting to user
- Follow the user/project language preference; English artifacts and Chinese conversation are only template defaults

## PREREQUISITES

- This step is selected in `research-state.json`.
- Needed input: Relevant scenarios and required behavior, from step 11 or an existing requirement.
- Read existing sources first. Missing necessary input becomes a scoped blocker; it does not automatically add skipped steps. Create the owned output section only when needed.

## CONTEXT BOUNDARIES

- Focus: What specific capabilities does the product need?
- Stories must trace back to scenarios and personas
- This is about WHAT the product does, not HOW it's built
- Acceptance criteria must be testable and specific

## EXECUTION SEQUENCE

### 1. Extract Stories from Scenarios

For each relevant scenario from step 11 or existing requirements, derive the smallest meaningful set of user stories:

**Mapping**: Scenario → stable story IDs. Preserve existing IDs, create only missing stories, and use the current scope rather than a fixed story count.

### 2. Write Stories with Acceptance Criteria

For each story:

```
As a [Persona Name],
I want [specific action],
so that [measurable benefit].

Acceptance Criteria:
- Given [context], when [action], then [expected result]
- Given [context], when [edge case], then [expected result]
- [Performance requirement if applicable]
```

### 3. Prioritize with MoSCoW

Reuse existing priorities; if a required choice is unresolved, discuss it with the user:
"Here are the stories I've derived from our scenarios. For MVP, which are Must-Have vs Nice-to-Have?"

| Priority | Definition | Guidance |
|----------|-----------|---------|
| **Must** | Product is useless without this | Blocks primary scenario |
| **Should** | Important but workaround exists | Enhances primary scenario |
| **Could** | Nice to have if time allows | Supports secondary scenarios |
| **Won't** | Explicitly excluded for now | Out of scope (with rationale) |

### 4. Write Output

**WRITE IMMEDIATELY** to `.ultra/specs/product.md` §4:

```markdown
## §4 User Stories & Features

### Story Map Overview

| ID | Story | Persona | Scenario | Priority | Complexity |
|----|-------|---------|----------|----------|-----------|
| US-01 | [Short title] | [P1] | S1 | Must | [S/M/L] |
| US-02 | [Short title] | [P1] | S1 | Must | [S/M/L] |
| US-03 | [Short title] | [P1] | S2 | Must | [S/M/L] |
| US-04 | [Short title] | [P2] | S2 | Should | [S/M/L] |
| ... | ... | ... | ... | ... | ... |

### Must-Have Stories

<a id="US-01"></a>
#### US-01: [Title]
**As a** [Persona], **I want** [action], **so that** [benefit].

**Acceptance Criteria**:
- [ ] Given [context], when [action], then [result]
- [ ] Given [context], when [edge case], then [result]
- [ ] [Performance: response time < Xms]

**Traces to**: Scenario [S#], Opportunity [O#]
**Complexity**: [S/M/L] — [Brief rationale]

<a id="US-02"></a>
#### US-02: [Title]
[Same structure]

<a id="US-03"></a>
#### US-03: [Title]
[Same structure]

### Should-Have Stories

<a id="US-04"></a>
#### US-04: [Title]
[Same structure]

### Could-Have Stories

<a id="US-07"></a>
#### US-07: [Title]
[Same structure]

### Story Statistics
- **Total stories**: [N]
- **Must-have**: [N] ([X]%)
- **Should-have**: [N] ([X]%)
- **Could-have**: [N] ([X]%)
- **Traceability**: [X]% of stories trace to scenarios
```

### 5. Present to User and Gate

Show the User Stories summary. Resolve only unanswered acceptance questions:
- Are the Must-Have stories correct?
- Any stories missing?
- Are acceptance criteria testable?

```
[C] Continue — Accept this step and return to the selected-step router
[R] Revise — Adjust stories, priorities, or acceptance criteria
[A] Add — Include additional stories
```

**Pause only for an unresolved required decision or a user-requested interactive gate. Otherwise checkpoint and continue under the entry contract.**

### 6. Handle Response

- **[C]**: Verify owned output, checkpoint completion, and return to the router in `../SKILL.md`.
- **[R]**: Revise stories, update product.md §4, re-present
- **[A]**: Add stories, update, re-present

## SUCCESS METRICS

- All included behavior is represented by stable, traceable stories without adding scope to meet a count
- Every story has testable acceptance criteria
- MoSCoW prioritization applied with user input
- Stories trace back to scenarios and personas
- Output written to product.md §4

## FAILURE MODES

- Stories not connected to any scenario
- Acceptance criteria are vague ("it should work well")
- Labeling stories Must-Have without scope rationale; a minimal slice may legitimately include only essentials
- Adding stories outside the agreed slice; a large count is a prompt to review scope, not automatic failure
- Not writing output before presenting to user

## NEXT STEP

Return to the entry router: choose the next incomplete `selected_steps` item. If this is the last selected analysis step, synthesize with `99`; never load a hardcoded neighboring step.
