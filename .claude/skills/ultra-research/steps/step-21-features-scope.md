# Step 21: Features & Scope Definition

> Scope, evidence, language, confirmation and checkpoint rules: [entry contract](../SKILL.md). Run only when selected; return to its router when done. Reuse existing decisions and sources.

## MANDATORY EXECUTION RULES

- EXPLICITLY DEFINE what is OUT of scope — this prevents scope creep
- GROUP stories into features — features are implementable units
- EVERY exclusion needs a RATIONALE — "not now" is not enough
- WRITE output to spec file BEFORE presenting to user
- Follow the user/project language preference; English artifacts and Chinese conversation are only template defaults

## PREREQUISITES

- This step is selected in `research-state.json`.
- Needed input: Stable story IDs and acceptance criteria for the current requested scope.
- Read existing sources first. Missing necessary input becomes a scoped blocker; it does not automatically add skipped steps. Create the owned output section only when needed.

## CONTEXT BOUNDARIES

- Focus: Group stories into features, define scope boundaries
- Features are clusters of related stories that deliver a capability
- "Features Out" is as important as "Features In"
- Reference step 04 when selected or existing strategy/current user decisions for scope boundaries

## EXECUTION SEQUENCE

### 1. Group Stories into Features

Cluster related user stories into features:

```
Feature A: [Name]
├── US-01: [Story]
├── US-02: [Story]
└── US-03: [Story]

Feature B: [Name]
├── US-04: [Story]
└── US-05: [Story]
```

Each feature should be:
- Independently valuable (delivers user value on its own)
- Estimable (can assess complexity)
- Testable (can verify it works end-to-end)

### 2. Define Scope Boundaries

For each potential feature, classify:

| Classification | Meaning |
|---------------|---------|
| **Included this cycle** | Stories authorized for this delivery slice |
| **Deferred** | Candidate future stories, excluded from the current plan |
| **Excluded** | Not part of this cycle, with explicit rationale |

### 3. Document "Features Out"

For each excluded feature, document:
- What it is
- Why it's excluded (reference strategic trade-offs from step-04)
- When it might be reconsidered
- What users should do instead

This prevents:
- Future scope creep ("but we said we'd do X")
- Re-debating settled decisions
- Building things that conflict with strategy

### 4. Write Output

**WRITE IMMEDIATELY** to `.ultra/specs/product.md` §5:

```markdown
## §5 Feature Scope

### Features Included This Cycle

#### Feature 1: [Name]
- **Description**: [What this feature does]
- **Stories**: US-01, US-02, US-03
- **User value**: [What user can do with this]
- **Priority**: Must-Have
- **Complexity**: [S/M/L]

#### Feature 2: [Name]
- **Description**: [What this feature does]
- **Stories**: US-04, US-05
- **User value**: [What user can do with this]
- **Priority**: Must-Have
- **Complexity**: [S/M/L]

#### Feature 3: [Name]
[Same structure]

### Deferred Features (Excluded This Cycle)

#### Feature 4: [Name]
- **Description**: [What this feature does]
- **Stories**: US-07, US-08
- **Rationale for deferral**: [Why not MVP]
- **Trigger to build**: [When to reconsider]

### Features Out (Explicitly Excluded)

| Feature | Rationale | Reconsider When | Alternative |
|---------|-----------|----------------|-------------|
| [Feature X] | [Why excluded — reference strategy §4] | [Condition] | [What users do instead] |
| [Feature Y] | [Why excluded] | [Condition] | [Alternative] |
| [Feature Z] | [Why excluded] | [Condition] | [Alternative] |

### Scope Summary
- **Included story IDs**: [IDs selected for this cycle]
- **Excluded story IDs**: [deferred and excluded IDs]
- **Decision source**: [existing user/strategy reference]
- **MVP features**: [N] features, [N] stories
- **v2 features**: [N] features, [N] stories
- **Excluded features**: [N] features
- **Scope confidence**: [evidence status, source and limitation]
```

Synchronize `research-state.json` with included/excluded story IDs, exact `story_refs`, scope rationale and decision references. Priority alone does not decide inclusion. Deferred stories stay excluded until an authorized scope change.

### 5. Present to User and Gate

Show the Feature Scope summary. Resolve only unanswered scope questions:
- Is the MVP scope right? Too big? Too small?
- Are the exclusions correct?
- Any missing features?

```
[C] Continue — Accept this step and return to the selected-step router
[R] Revise — Adjust feature grouping or scope boundaries
[E] Expand — Move something from v2 to MVP
[T] Trim — Move something from MVP to v2
```

**Pause only for an unresolved required decision or a user-requested interactive gate. Otherwise checkpoint and continue under the entry contract.**

### 6. Handle Response

- **[C]**: Verify owned output, checkpoint completion, and return to the router in `../SKILL.md`.
- **[R]**: Revise features, update product.md §5, re-present
- **[E]/[T]**: Adjust scope, update, re-present

## SUCCESS METRICS

- Stories grouped into coherent features
- Clear MVP vs v2 scope boundary
- Every exclusion has a rationale and reconsideration trigger
- Features trace to user stories and scenarios
- Output written to product.md §5

## FAILURE MODES

- No "Features Out" section (everything is in scope)
- Features that don't map to any user stories
- Exclusion rationale is just "not now" (needs specific reason)
- Current scope exceeds the user's objective or budget; feature count alone is not a gate
- Not writing output before presenting to user

## NEXT STEP

Return to the entry router: choose the next incomplete `selected_steps` item. If this is the last selected analysis step, synthesize with `99`; never load a hardcoded neighboring step.
