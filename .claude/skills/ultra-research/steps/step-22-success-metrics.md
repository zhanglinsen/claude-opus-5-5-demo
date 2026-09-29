# Step 22: Success Metrics

> Scope, evidence, language, confirmation and checkpoint rules: [entry contract](../SKILL.md). Run only when selected; return to its router when done. Reuse existing decisions and sources.

## MANDATORY EXECUTION RULES

- Define verifiable success targets; use numerical thresholds when meaningful, or explicit behavioral pass/fail conditions
- Include business and user metrics only where relevant to the requested outcome
- DEFINE how each metric is MEASURED — not just what to measure
- State the measured baseline or mark it unknown with a measurement follow-up; never invent a baseline
- WRITE output to spec file BEFORE presenting to user
- Follow the user/project language preference; English artifacts and Chinese conversation are only template defaults

## PREREQUISITES

- This step is selected in `research-state.json`.
- Needed input: Included features, desired outcomes and available baseline evidence.
- Read existing sources first. Missing necessary input becomes a scoped blocker; it does not automatically add skipped steps. Create the owned output section only when needed.

## CONTEXT BOUNDARIES

- Focus: How will we know if this product is succeeding?
- Metrics must be measurable, specific, and time-bound
- Connect metrics to selected strategy or existing user goals
- This is the LAST step of Round 2

## EVIDENCE SEARCH (WHEN NEEDED)

If source gaps require web search, adapt these example queries:

```
Search: "{{product_domain}} key metrics KPIs benchmarks"
Search: "{{product_domain}} SaaS metrics success benchmarks"
Search: "{{product_domain}} user engagement retention benchmarks"
Search: "{{product_domain}} north star metric examples"
```

## EXECUTION SEQUENCE

### 1. Define North Star Metric

If the answer is not already available, ask using the host question capability or normal conversation:
"What single metric best captures whether this product is delivering value? (e.g., 'Weekly active workflows completed', 'Time saved per user per week')"

The North Star Metric should:
- Reflect core value delivery
- Be leading (not lagging)
- Be actionable (team can influence it)

### 2. Define Business Metrics

| Metric | What to define |
|--------|---------------|
| Revenue/adoption targets | Month 1, 3, 6, 12 |
| Growth rate | MoM or WoW targets |
| Retention | Day 1, Day 7, Day 30 |
| Conversion | Free → Paid (if applicable) |
| Unit economics | CAC, LTV, LTV/CAC ratio |

Use relevant measured baselines or cited benchmarks to support targets. An external benchmark is not the project's measured baseline.

### 3. Define User Metrics

| Metric | What to define |
|--------|---------------|
| Task completion | Success rate for key scenarios |
| Time on task | vs baseline (current workflow) |
| User satisfaction | NPS or CSAT target |
| Feature adoption | % of users using key features |
| Error rate | Failure frequency |

### 4. Write Output

**WRITE IMMEDIATELY** to `.ultra/specs/product.md` §6:

```markdown
## §6 Success Metrics

### North Star Metric
- **Metric**: [Name]
- **Definition**: [Exactly what is measured]
- **Current baseline**: [Measured current state, or unknown plus measurement plan]
- **Comparison benchmark**: [Optional external benchmark and source; distinct from baseline]
- **Target**: [Specific number]
- **Timeline**: [When to achieve]
- **Measurement method**: [How to collect this data]

### Business Metrics

| Metric | Baseline | Target (M3) | Target (M6) | Target (M12) | How Measured |
|--------|----------|-------------|-------------|--------------|-------------|
| [Revenue/Users] | [N/A or current] | [Target] | [Target] | [Target] | [Method] |
| [Growth rate] | [Benchmark] | [Target] | [Target] | [Target] | [Method] |
| [Retention D30] | [Benchmark] | [Target] | [Target] | [Target] | [Method] |
| [Conversion] | [Benchmark] | [Target] | [Target] | [Target] | [Method] |

_Benchmark sources: [retrievable references with date/method]_

### User Metrics

| Metric | Baseline | Target | How Measured |
|--------|----------|--------|-------------|
| Task completion rate | [Current %] | [Target %] | [Method] |
| Time on task | [Current min] | [Target min] | [Method] |
| User satisfaction (NPS) | [Industry avg] | [Target] | [Survey] |
| Feature adoption | [N/A] | [Target %] | [Analytics] |
| Error rate | [Current %] | [Target %] | [Logging] |

### Metric Prioritization

| Priority | Metric | Why |
|----------|--------|-----|
| P0 (check daily) | [North Star] | [Core value signal] |
| P0 (check daily) | [Critical metric] | [Business health] |
| P1 (check weekly) | [Important metric] | [Growth signal] |
| P2 (check monthly) | [Supporting metric] | [Quality signal] |

### Anti-Metrics (What NOT to Optimize)

| Anti-Metric | Why Not | What It Could Sacrifice |
|------------|---------|------------------------|
| [e.g., Page views] | [Vanity metric] | [Could sacrifice quality for clicks] |
| [e.g., Time in app] | [Could mean confusion] | [Could sacrifice efficiency] |

### Round 2 Summary

**Feature Definition Confidence**:
- **Story completeness**: [evidence status, source and limitation] — [One-line assessment]
- **Scope clarity**: [evidence status, source and limitation] — [One-line assessment]
- **Metric measurability**: [evidence status, source and limitation] — [One-line assessment]
- **Overall R2 confidence**: [evidence status, source and limitation]
```

### 5. Write Round 2 Research Report

**WRITE** to `.ultra/docs/research/feature-definition-{date}.md`:

```markdown
# Round 2: Feature Definition

> **Confidence**: [evidence status, source and limitation]
> **Steps completed**: [actual selected and verified step IDs in this round]
> **Completed**: [date]

## Key Findings
[3-5 bullet points]

## Stories Created
[Count by priority: Must/Should/Could]

## Scope Decisions
[Key inclusions and exclusions]

## Metrics Defined
[North Star + top 3 metrics]
```

### 6. Present to User and Gate

Show the Success Metrics summary. Ask:
- Are the targets realistic?
- Is the North Star metric right?
- Any metrics missing?

```
[C] Continue — Accept this step and return to the selected-step router
[R] Revise — Adjust targets or metrics
[D] Discuss — Explore specific metric benchmarks
```

**Pause only for an unresolved required decision or a user-requested interactive gate. Otherwise checkpoint and continue under the entry contract.**

### 7. Handle Response

- **[C]**: Verify owned output, checkpoint completion, and return to the router in `../SKILL.md`.
- **[R]**: Revise metrics, update product.md §6, re-present
- **[D]**: Deep-dive specific benchmarks, then re-present gate

## SUCCESS METRICS

- Core success measure defined with target and an honest baseline or measurement follow-up
- Applicable business metrics have meaningful targets and timelines
- Applicable user metrics have targets and measured baselines or explicit follow-ups
- Any benchmarks have retrievable sources and dates/methods
- Anti-metrics defined (what NOT to optimize)
- Round 2 research report written
- Output written to product.md §6

## FAILURE MODES

- Metrics without specific targets ("improve retention")
- Unknown baselines concealed or substituted with unrelated benchmarks
- Missing a success dimension necessary for the selected outcome
- Targets unsupported by the intended measurement and operating conditions
- Not writing output before presenting to user

## NEXT STEP

Return to the entry router: choose the next incomplete `selected_steps` item. If this is the last selected analysis step, synthesize with `99`; never load a hardcoded neighboring step.
