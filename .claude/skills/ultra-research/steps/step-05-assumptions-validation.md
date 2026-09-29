# Step 05: Assumptions & Validation Plan

> Scope, evidence, language, confirmation and checkpoint rules: [entry contract](../SKILL.md). Run only when selected; return to its router when done. Reuse existing decisions and sources.

## MANDATORY EXECUTION RULES

- Extract assumptions from relevant selected discovery steps and existing sources, including less obvious ones
- PRIORITIZE by Impact × Uncertainty — focus on "leap of faith" assumptions
- DESIGN cheap, fast experiments — not "build it and see"
- WRITE output to spec file BEFORE presenting to user
- Follow the user/project language preference; English artifacts and Chinese conversation are only template defaults

## PREREQUISITES

- This step is selected in `research-state.json`.
- Needed input: Assumptions in the selected discovery sections or existing strategy materials.
- Read existing sources first. Missing necessary input becomes a scoped blocker; it does not automatically add skipped steps. Create the owned output section only when needed.

## CONTEXT BOUNDARIES

- Focus: What are we assuming? What's riskiest? How do we validate cheaply?
- This is the LAST step of Round 0 — it synthesizes everything discovered so far
- After this step, return to the selected-step router; investigate further only for a relevant unresolved decision
- Based on Alberto Savoia (Pretotyping) and Marty Cagan methodologies

## EVIDENCE SEARCH (WHEN NEEDED)

If source gaps require web search, adapt these example queries:

```
Search: "{{product_domain}} validation methods pretotype MVP"
Search: "{{product_domain}} common startup mistakes failed assumptions"
Search: "landing page test fake door validation {{product_domain}}"
Search: "{{product_domain}} customer interview validation techniques"
```

## EXECUTION SEQUENCE

### 1. Extract Assumptions from Previous Steps

Review available selected discovery sections or existing sources; consider the relevant categories below:

| Category | Source | What to look for |
|----------|--------|-----------------|
| **Value** | §0, §1 | Will users actually want this? |
| **Usability** | §1 | Can users figure it out without help? |
| **Feasibility** | §1 (solutions) | Can we build it with current technology? |
| **Viability** | §2 | Does the business case work at these numbers? |
| **Go-to-Market** | §3, §4 | Can we reach and convert our target users? |

### 2. Prioritize Assumptions

Map each assumption on Impact × Uncertainty:

```
                    High Impact
                        │
    VALIDATE FIRST ─────┼───── MONITOR
    (Leap of Faith)     │     (Important but clear)
                        │
   Low Uncertainty ─────┼───── High Uncertainty
                        │
    IGNORE ─────────────┼───── INVESTIGATE
    (Low stakes)        │     (Uncertain but low impact)
                        │
                    Low Impact
```

Focus on "Leap of Faith" quadrant: **High Impact + High Uncertainty**

### 3. Design Validation Experiments

For top 3-5 leap-of-faith assumptions, design cheap, fast experiments:

**Experiment Design Framework:**

| Element | Description |
|---------|-------------|
| Assumption | What exactly are we assuming? |
| Category | Value / Usability / Feasibility / Viability / GTM |
| Method | How will we test this? |
| Success criteria | What result validates the assumption? |
| Failure criteria | What result invalidates it? |
| Effort | Hours/days to execute |
| Timeline | When can we have results? |

**Preferred Methods** (cheapest first):
1. **Data analysis**: Existing data that proves/disproves the assumption
2. **Customer interviews**: 5-10 targeted conversations
3. **Fake door test**: Landing page with sign-up / "notify me" button
4. **Concierge MVP**: Manually deliver the value to 3-5 users
5. **Pretotype**: Mechanical Turk version of the product
6. **Prototype**: Clickable mockup tested with real users
7. **MVP**: Minimum viable version with real functionality

### 4. Define Decision Framework

For each experiment:

```
If experiment SUCCEEDS → [Next action]
If experiment FAILS → [Pivot / Investigate / Kill]
If results are AMBIGUOUS → [How to get clarity]
```

### 5. Write Output

**WRITE IMMEDIATELY** to `.ultra/specs/discovery.md` §5:

```markdown
## §5 Key Assumptions & Validation Plan

### Assumption Inventory

| # | Assumption | Category | Impact | Uncertainty | Priority |
|---|-----------|----------|--------|-------------|----------|
| A1 | [Statement] | Value | High | High | **Validate First** |
| A2 | [Statement] | Viability | High | High | **Validate First** |
| A3 | [Statement] | GTM | High | Medium | **Validate First** |
| A4 | [Statement] | Feasibility | Medium | High | Investigate |
| A5 | [Statement] | Usability | Medium | Medium | Monitor |
| A6 | [Statement] | Value | Low | Low | Ignore |

### Leap-of-Faith Assumptions (Top 3-5)

#### A1: [Assumption Statement]
- **Category**: [Value / Viability / GTM / Feasibility / Usability]
- **Why it matters**: [What happens if this is wrong]
- **Current evidence**: [What we know from steps 00-04]
- **Evidence gap**: [What we don't know]

**Validation Experiment:**
- **Method**: [Specific method]
- **Success criteria**: [Measurable outcome that validates]
- **Failure criteria**: [Measurable outcome that invalidates]
- **Effort**: [Hours/days]
- **Timeline**: [When results expected]

**Decision Framework:**
- ✅ If validated → [Continue the selected scope]
- ❌ If invalidated → [Pivot to X / Investigate Y / Kill]
- ⚠️ If ambiguous → [Additional experiment Z]

#### A2: [Assumption Statement]
[Same structure]

#### A3: [Assumption Statement]
[Same structure]

### Validation Roadmap

| Week | Experiment | Assumption | Expected Result |
|------|-----------|-----------|----------------|
| 1 | [Experiment 1] | A1 | [What we'll learn] |
| 1-2 | [Experiment 2] | A2 | [What we'll learn] |
| 2-3 | [Experiment 3] | A3 | [What we'll learn] |

### Round 0 Summary

**Product Discovery Confidence**:
- **Problem validation**: [evidence status, source and limitation] — [One-line summary]
- **Opportunity space**: [evidence status, source and limitation] — [One-line summary]
- **Market size**: [evidence status, source and limitation] — [One-line summary]
- **Competitive position**: [evidence status, source and limitation] — [One-line summary]
- **Strategy clarity**: [evidence status, source and limitation] — [One-line summary]
- **Overall R0 confidence**: [evidence status, source and limitation]

**Recommendation**: [Continue selected scope / Validate assumptions first / Reconsider scope]
```

### 6. Write Round 0 Research Report

**WRITE** to `.ultra/docs/research/product-discovery-{date}.md`:

```markdown
# Round 0: Product Discovery & Strategy

> **Confidence**: [evidence status, source and limitation]
> **Steps completed**: [actual selected and verified step IDs in this round]
> **Completed**: [date]

## Key Findings
[3-5 bullet points of most important discoveries]

## Decisions Made
[Strategic choices and their rationale]

## Open Questions
[What remains uncertain]

## Assumptions to Validate
[Top 3 from §5]
```

### 7. Present to User and Gate

Show the complete Round 0 summary. Highlight:
- The top 3 leap-of-faith assumptions
- Overall confidence level
- Recommendation (proceed / validate / pivot)

```
[C] Continue — Accept this step and return to the selected-step router
[V] Validate — Pause to run validation experiments before continuing
[P] Pivot — Rethink the product direction based on findings
```

**Pause only for an unresolved required decision or a user-requested interactive gate. Otherwise checkpoint and continue under the entry contract.**

### 8. Handle Response

- **[C]**: Verify owned output, checkpoint completion, and return to the router in `../SKILL.md`.
- **[V]**: Help design validation experiments in detail, then re-present gate when done
- **[P]**: Restart from step-00 with revised direction

## SUCCESS METRICS

- Assumptions extracted from ALL previous steps (not just surface-level)
- Each assumption categorized and prioritized
- Top 3-5 have detailed validation experiments
- Each experiment has clear success/failure criteria
- Decision framework defined for each outcome
- Round 0 research report written
- Output written to discovery.md §5

## FAILURE MODES

- Only extracting obvious assumptions (missing viability, GTM)
- Designing expensive experiments ("build an MVP") when cheaper options exist
- No clear success/failure criteria for experiments
- Missing the decision framework (what do we DO with the results?)
- Overly optimistic confidence assessment
- Not writing both spec file AND research report

## NEXT STEP

Return to the entry router: choose the next incomplete `selected_steps` item. If this is the last selected analysis step, synthesize with `99`; never load a hardcoded neighboring step.
