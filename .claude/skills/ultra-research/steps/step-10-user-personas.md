# Step 10: User Personas

> Scope, evidence, language, confirmation and checkpoint rules: [entry contract](../SKILL.md). Run only when selected; return to its router when done. Reuse existing decisions and sources.

## MANDATORY EXECUTION RULES

- VERIFY factual claims with accessible evidence under the entry contract; use web search when current external evidence is needed.
- Define the fewest evidence-backed personas/actors that explain materially different goals; one may suffice for a narrow feature
- PERSONAS ARE ABOUT GOALS AND PAIN POINTS — not demographics
- Connect to selected problem/opportunity evidence or existing user context
- WRITE output to spec file BEFORE presenting to user
- Follow the user/project language preference; English artifacts and Chinese conversation are only template defaults

## PREREQUISITES

- This step is selected in `research-state.json`.
- Needed input: Problem and user/actor context, including existing personas or interview evidence when available.
- Read existing sources first. Missing necessary input becomes a scoped blocker; it does not automatically add skipped steps. Create the owned output section only when needed.

## CONTEXT BOUNDARIES

- Focus: WHO are we building for? What drives them? What blocks them?
- Personas represent real archetypes, not fictional characters
- Each persona connects to actual user needs from selected steps or existing evidence
- This is Round 1 start — user scenarios follow in step-11

## EVIDENCE SEARCH (WHEN NEEDED)

If source gaps require web search, adapt these example queries; independent queries may run in parallel:

```
Search: "{{product_domain}} user persona research"
Search: "{{product_domain}} target audience profile behavior"
Search: "{{product_domain}} user needs pain points survey"
Search: "{{product_domain}} jobs to be done customer segment"
```

## EXECUTION SEQUENCE

### 1. Gather User Context

If the answer is not already available, ask using the host question capability or normal conversation:
"Based on our discovery work, who are the 2-3 types of people who would use this most? What do you already know about them?"

Cross-reference with:
- Step-00 §0: Target User Profile
- Step-01 §1: Prioritized Opportunities
- Step-04 §4: Target Segments

### 2. Research Real User Behavior

For each potential persona, search for:
- How they currently solve the problem (workflows, tools)
- What frustrates them most (forums, reviews, social media)
- What motivates their work (career goals, KPIs)
- How they discover and adopt new tools

### 3. Build Persona Profiles

For each persona (2-3), define:

| Element | What to capture |
|---------|----------------|
| Name & Role | Descriptive title, not a real name |
| Context | Where they work, team size, industry |
| Goals | What they're trying to achieve (2-3) |
| Pain points | What blocks them (2-3, connected to opportunities) |
| Current workflow | How they solve the problem today |
| Success metric | How THEY measure their own success |
| Adoption trigger | What would make them try a new solution |
| Objections | Why they might NOT adopt (barriers) |

### 4. Write Output

**WRITE IMMEDIATELY** to `.ultra/specs/product.md` §1-2:

```markdown
## §1 Problem Statement

### Core Problem
[One paragraph describing the problem, grounded in step-00 validation]

### Who It Affects
[Brief overview connecting problem to specific user types]

### Current Impact
- **Time cost**: [Hours/week wasted on workarounds]
- **Money cost**: [$ lost to inefficiency]
- **Opportunity cost**: [What they can't do because of this problem]

## §2 User Personas

### Persona 1: [Descriptive Name] (Primary)

**Role**: [Job title / context]
**Context**: [Where they work, team dynamics, industry]

**Goals**:
1. [Primary goal — what gets them promoted]
2. [Secondary goal — what they care about daily]
3. [Tertiary goal — nice to have]

**Pain Points**:
1. [Pain 1] — Connects to Opportunity [O#] in discovery.md §1 or an existing evidence reference
2. [Pain 2] — Connects to Opportunity [O#] in discovery.md §1 or an existing evidence reference
3. [Pain 3] — Source: [retrievable source or dated user quote]

**Current Workflow**:
> [Step-by-step description of how they solve this today]
> Tools used: [List of current tools/processes]
> Time spent: [X hours/week]

**Success Metric**: [How they measure their own success]
**Adoption Trigger**: [What would make them try our solution]
**Objections**: [Why they might resist — e.g., "too busy to learn new tool"]

### Persona 2: [Descriptive Name] (Secondary)
[Same structure]

### Persona 3: [Descriptive Name] (Tertiary — optional)
[Same structure]

### Persona Prioritization

| Persona | Urgency | Willingness to Pay | Reachability | Priority |
|---------|---------|-------------------|-------------|----------|
| [P1] | High | High | Medium | **Primary** |
| [P2] | Medium | Medium | High | **Secondary** |
| [P3] | Low | Low | High | **Tertiary** |
```

### 5. Present to User and Gate

Show the Persona profiles. Ask user to validate:
- Do these feel like real people they know?
- Is anything missing from the profiles?
- Is the prioritization correct?

```
[C] Continue — Accept this step and return to the selected-step router
[R] Revise — Adjust persona details or prioritization
[A] Add — Include an additional persona
```

**Pause only for an unresolved required decision or a user-requested interactive gate. Otherwise checkpoint and continue under the entry contract.**

### 6. Handle Response

- **[C]**: Verify owned output, checkpoint completion, and return to the router in `../SKILL.md`.
- **[R]**: Revise personas, update product.md §1-2, re-present
- **[A]**: Add a persona only if it adds a distinct in-scope need, update, re-present

## SUCCESS METRICS

- Relevant personas/actors defined with goals, pain points and current workflows
- Each persona connects to selected opportunities or existing user evidence
- Personas grounded in accessible user evidence, not pure imagination
- Clear prioritization with rationale
- Output written to product.md §1-2

## FAILURE MODES

- Demographic-only personas ("25-35 year old male in tech")
- Redundant personas that do not explain distinct in-scope needs
- Pain points not connected to validated opportunities
- No current workflow description
- Missing adoption triggers and objections
- Not writing output before presenting to user

## NEXT STEP

Return to the entry router: choose the next incomplete `selected_steps` item. If this is the last selected analysis step, synthesize with `99`; never load a hardcoded neighboring step.
