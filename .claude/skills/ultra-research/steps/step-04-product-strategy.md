# Step 04: Product Strategy

> Scope, evidence, language, confirmation and checkpoint rules: [entry contract](../SKILL.md). Run only when selected; return to its router when done. Reuse existing decisions and sources.

## MANDATORY EXECUTION RULES

- STRATEGY IS ABOUT TRADE-OFFS — what we choose NOT to do matters more
- Ground strategy in relevant problem, market and alternative evidence from selected steps or existing sources
- Use relevant evidence for comparable strategies; external search is optional when local sources suffice
- WRITE output to spec file BEFORE presenting to user
- Follow the user/project language preference; English artifacts and Chinese conversation are only template defaults

## PREREQUISITES

- This step is selected in `research-state.json`.
- Needed input: Known problem, opportunities, constraints and relevant market/alternative evidence.
- Read existing sources first. Missing necessary input becomes a scoped blocker; it does not automatically add skipped steps. Create the owned output section only when needed.

## CONTEXT BOUNDARIES

- Focus: Define strategic direction — vision, segments, value prop, trade-offs, defensibility
- This is a CONDENSED strategy canvas, not a full business plan
- Must be grounded in evidence from previous steps
- Strategy should be opinionated — "we serve everyone" is not a strategy

## EVIDENCE SEARCH (WHEN NEEDED)

If source gaps require web search, adapt these example queries:

```
Search: "{{product_domain}} product strategy examples successful"
Search: "{{product_domain}} go-to-market strategy startup"
Search: "{{product_domain}} defensibility moat competitive advantage"
Search: "{{product_domain}} pricing strategy models"
```

## EXECUTION SEQUENCE

### 1. Vision Statement

Collaborate with user to craft a 2-3 sentence vision that:
- Inspires people (emotional, memorable)
- Is specific enough to guide decisions
- Is ambitious enough to attract talent and investment

**Test**: Would someone quit their job to work on this? If not, it's too boring.

If the answer is not already available, ask using the host question capability or normal conversation: "In 2-3 sentences, how can we inspire people? What are we aspiring to achieve?"

### 2. Target Segments

Define WHO we serve and WHO we explicitly do NOT serve.

Using personas from step-00 (Q3: Desperate Specificity):

**Serve** (defined by problems/JTBD, not demographics):
- Segment 1: [Description] — [Why they need us most]
- Segment 2: [Description] — [Why they need us]

**Do NOT serve** (equally important):
- Anti-segment 1: [Description] — [Why not]
- Anti-segment 2: [Description] — [Why not]

### 3. Value Proposition

For each target segment, use the JTBD format:

```
When [situation], they want [motivation], so they can [outcome]
```

Connect this to relevant opportunities from step 01 or an existing source; do not require unselected discovery.

### 4. Strategic Trade-offs

**This is the most important section.** A strategy without trade-offs is a wish list.

Identify 3-5 strategic trade-offs:

| We Choose | Over | Because |
|-----------|------|---------|
| [Focus A] | [Alternative A] | [Reasoning grounded in evidence] |
| [Focus B] | [Alternative B] | [Reasoning grounded in evidence] |
| [Focus C] | [Alternative C] | [Reasoning grounded in evidence] |

Each trade-off should reference competitive analysis from step-03 — we avoid competing head-to-head on competitor strengths.

### 5. Defensibility Analysis

What makes this hard to copy? Evaluate each:

| Moat Type | Applicability | Strength | Timeline to Build |
|-----------|-------------|----------|-------------------|
| Network effects | [Yes/No] | [Assessment] | [Time] |
| Data advantage | [Yes/No] | [Assessment] | [Time] |
| Switching costs | [Yes/No] | [Assessment] | [Time] |
| Brand / trust | [Yes/No] | [Assessment] | [Time] |
| Technical IP | [Yes/No] | [Assessment] | [Time] |
| Speed / execution | [Yes/No] | [Assessment] | [Time] |

Be honest — most startups have weak defensibility early. That's okay if the execution advantage is strong.

### 6. Write Output

**WRITE IMMEDIATELY** to `.ultra/specs/discovery.md` §4:

```markdown
## §4 Product Strategy

### Vision
[2-3 sentences — inspiring, specific, ambitious]

### Target Segments

#### Primary: [Segment Name]
- **Description**: [Who they are, defined by problem/JTBD]
- **Why them**: [Why they need us most urgently]
- **Value Proposition**: When [situation], they want [motivation], so they can [outcome]

#### Secondary: [Segment Name]
- **Description**: [Who they are]
- **Why them**: [Why they need us]
- **Value Proposition**: When [situation], they want [motivation], so they can [outcome]

#### Explicitly NOT Serving
- **[Anti-segment 1]**: [Why not — e.g., "Too enterprise for our current capabilities"]
- **[Anti-segment 2]**: [Why not — e.g., "Their problem is different enough to require a different product"]

### Strategic Trade-offs

| # | We Choose | Over | Because |
|---|-----------|------|---------|
| 1 | [Focus] | [Alternative] | [Evidence-based reasoning] |
| 2 | [Focus] | [Alternative] | [Evidence-based reasoning] |
| 3 | [Focus] | [Alternative] | [Evidence-based reasoning] |
| 4 | [Focus] | [Alternative] | [Evidence-based reasoning] |

### Defensibility

| Moat Type | Applicable | Strength (1-5) | Timeline |
|-----------|-----------|----------------|----------|
| Network effects | [Yes/No] | [X] | [Time] |
| Data advantage | [Yes/No] | [X] | [Time] |
| Switching costs | [Yes/No] | [X] | [Time] |
| Brand / trust | [Yes/No] | [X] | [Time] |
| Technical IP | [Yes/No] | [X] | [Time] |
| Speed / execution | [Yes/No] | [X] | [Time] |

**Primary moat**: [Which moat type is strongest and why]
**Moat timeline**: [When defensibility becomes meaningful]

### Strategy Confidence
- **Overall confidence**: [evidence status, source and limitation]
- **Strongest element**: [What part of strategy is most grounded]
- **Riskiest bet**: [What strategic choice is most uncertain]
```

### 7. Present to User and Gate

Show the Product Strategy summary. Highlight:
- Whether the trade-offs feel right
- The defensibility assessment
- Any concerns about the strategic direction

```
[C] Continue — Accept this step and return to the selected-step router
[R] Revise — Adjust strategy elements
[D] Discuss — Explore specific trade-offs in more depth
```

**Pause only for an unresolved required decision or a user-requested interactive gate. Otherwise checkpoint and continue under the entry contract.**

### 8. Handle Response

- **[C]**: Verify owned output, checkpoint completion, and return to the router in `../SKILL.md`.
- **[R]**: Revise strategy, update discovery.md §4, re-present
- **[D]**: Deep-dive specific trade-offs, then re-present gate

## SUCCESS METRICS

- Vision is inspiring and specific (not generic)
- Target segments defined by problems, not demographics
- Anti-segments explicitly stated
- At least 3 strategic trade-offs with evidence-based reasoning
- Defensibility honestly assessed
- Output written to discovery.md §4

## FAILURE MODES

- Generic vision ("We make the world better with AI")
- "We serve everyone" (no segment focus)
- No trade-offs stated (strategy without trade-offs is not strategy)
- Defensibility assessment is all 5/5 (unrealistic)
- Strategy not grounded in evidence from steps 00-03
- Not writing output before presenting to user

## NEXT STEP

Return to the entry router: choose the next incomplete `selected_steps` item. If this is the last selected analysis step, synthesize with `99`; never load a hardcoded neighboring step.
