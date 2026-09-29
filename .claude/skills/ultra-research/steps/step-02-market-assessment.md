# Step 02: Market Assessment

> Scope, evidence, language, confirmation and checkpoint rules: [entry contract](../SKILL.md). Run only when selected; return to its router when done. Reuse existing decisions and sources.

## MANDATORY EXECUTION RULES

- VERIFY factual claims with accessible evidence under the entry contract; use web search when current external evidence is needed.
- Compare top-down and bottom-up estimates when meaningful evidence exists; otherwise explain the unavailable method and uncertainty
- CROSS-VALIDATE — if top-down and bottom-up differ by >3x, investigate why
- CITE EVERY NUMBER — no unsupported market figures
- WRITE output to spec file BEFORE presenting to user
- Follow the user/project language preference; English artifacts and Chinese conversation are only template defaults

## PREREQUISITES

- This step is selected in `research-state.json`.
- Needed input: The target problem, audience and market boundary, from prior selected work or existing evidence.
- Read existing sources first. Missing necessary input becomes a scoped blocker; it does not automatically add skipped steps. Create the owned output section only when needed.

## CONTEXT BOUNDARIES

- Focus: How big is this market? Is it worth pursuing?
- Use the prioritized opportunities from step-01 to scope the market
- This is about MARKET SIZE, not competitive positioning (that's step-03)

## EVIDENCE SEARCH (WHEN NEEDED)

If source gaps require web search, adapt these example queries; independent queries may run in parallel:

```
Search: "{{product_domain}} market size TAM {{current_year}}"
Search: "{{product_domain}} market growth rate CAGR forecast"
Search: "{{product_domain}} industry revenue report"
Search: "{{product_domain}} market segmentation analysis"
Search: "{{product_domain}} pricing model average revenue per user"
```

**Source selection**: Prefer sources whose population, date and method fit the market boundary, especially primary filings/data and transparent research. A commercial publisher name alone is not evidence quality.

## EXECUTION SEQUENCE

### 1. Top-Down Estimate (TAM → SAM → SOM)

Start with the broadest market definition and narrow down:

**TAM (Total Addressable Market)**:
- What is the total global market for this category?
- Search for industry reports with specific dollar figures
- Include year and source for every number

**SAM (Serviceable Available Market)**:
- What slice of TAM can we actually serve?
- Filter by: geography, customer segment, technology fit, regulatory access
- Show the filtering logic explicitly

**SOM (Serviceable Obtainable Market)**:
- What can we realistically capture in 1-3 years?
- Consider: team size, distribution, brand, competition
- Be honest — first-year SOM for a startup is tiny

### 2. Bottom-Up Estimate

Calculate independently from unit economics:

```
SOM = Target customers × Conversion rate × Average revenue per customer × Retention
```

For each variable:
- **Target customers**: How many potential users in your target segment? (Source required)
- **Conversion rate**: What % will actually adopt? (Industry benchmark required)
- **ARPU**: What will they pay? (Comparable pricing data required)
- **Retention**: Annual retention rate? (Industry benchmark required)

### 3. Cross-Validation

Compare top-down SOM vs bottom-up SOM:
- If within 2x: Good — use the average
- If 2-3x apart: Acceptable — note the range and explain the gap
- If >3x apart: Investigate — one of your assumptions is wrong

### 4. Growth Driver Analysis

Identify 3-5 factors that will grow or shrink this market:

For each driver:
- **Direction**: Expanding or contracting?
- **Magnitude**: How much impact?
- **Timeline**: When does this take effect?
- **Evidence**: Source reference

### 5. Write Output

**WRITE IMMEDIATELY** to `.ultra/specs/discovery.md` §2:

```markdown
## §2 Market Assessment

### Market Sizing Summary

| Metric | Current Estimate | 2-3 Year Projection | Source |
|--------|-----------------|---------------------|--------|
| TAM | $[X]B | $[X]B | [source reference] |
| SAM | $[X]M | $[X]M | [source reference] |
| SOM | $[X]M | $[X]M | Calculated |

### Top-Down Analysis

#### TAM: $[X]B ([Year])
- **Definition**: [What market category]
- **Source**: [Report name + URL]
- **Growth**: [X]% CAGR ([Year]-[Year])

#### SAM: $[X]M
- **TAM filter 1**: [Geographic] — reduces to $[X]B
- **TAM filter 2**: [Segment] — reduces to $[X]M
- **TAM filter 3**: [Technology fit] — reduces to $[X]M

#### SOM: $[X]M (Year 1-3)
- **Realistic capture**: [X]% of SAM
- **Basis**: [Why this share is achievable]
- **Comparable**: [Similar company achieved X% in Y time]

### Bottom-Up Analysis

| Variable | Value | Source |
|----------|-------|--------|
| Target customers | [N] | [URL or calculation] |
| Conversion rate | [X]% | [Industry benchmark + URL] |
| ARPU (annual) | $[X] | [Comparable pricing + URL] |
| Retention rate | [X]% | [Industry benchmark + URL] |
| **Year 1 Revenue** | **$[X]** | **Calculated** |
| **Year 3 Revenue** | **$[X]** | **Calculated** |

### Cross-Validation
- **Top-down SOM**: $[X]M
- **Bottom-up Year 3**: $[X]M
- **Ratio**: [X]x
- **Assessment**: [Within range / Gap explanation]

### Growth Drivers

| # | Driver | Direction | Impact | Timeline | Source |
|---|--------|-----------|--------|----------|--------|
| 1 | [Technology trend] | Expanding | High | 1-2yr | [source reference] |
| 2 | [Regulatory change] | Expanding | Medium | 2-3yr | [source reference] |
| 3 | [Demographic shift] | Expanding | Medium | 3-5yr | [source reference] |
| 4 | [Competitive pressure] | Contracting | Low | Now | [source reference] |

### Market Assessment Confidence
- **Overall confidence**: [evidence status, source and limitation]
- **Strongest data point**: [What we're most sure about]
- **Weakest assumption**: [What could be most wrong]
- **Recommendation**: [Market worth pursuing / Needs more validation / Too small]
```

### 6. Present to User and Gate

Show the Market Assessment summary. Highlight:
- Whether top-down and bottom-up estimates align
- The single biggest growth driver
- Any concerns about market size or timing

```
[C] Continue — Accept this step and return to the selected-step router
[R] Revise — Adjust assumptions or investigate discrepancies
[S] Search more — Need additional data on specific aspect
```

**Pause only for an unresolved required decision or a user-requested interactive gate. Otherwise checkpoint and continue under the entry contract.**

### 7. Handle Response

- **[C]**: Verify owned output, checkpoint completion, and return to the router in `../SKILL.md`.
- **[R]**: Revise assumptions, update discovery.md §2, re-present
- **[S]**: Execute targeted searches, update analysis, re-present

## SUCCESS METRICS

- Applicable market estimates recorded; unavailable comparison methods and resulting uncertainty are explicit
- Every dollar figure has a source citation
- Available independent estimates compared; unavailable cross-validation is recorded as a gap
- Material growth drivers identified with evidence; do not invent extra drivers to reach a count
- Confidence assessment is honest
- Output written to discovery.md §2

## FAILURE MODES

- Presenting one estimate as cross-validated when no independent comparison exists
- Market figures without source citations
- Inflating SOM to make the opportunity look bigger
- Ignoring >3x gap between top-down and bottom-up
- Using stale data (>2 years old) without noting limitations
- Not writing output before presenting to user

## NEXT STEP

Return to the entry router: choose the next incomplete `selected_steps` item. If this is the last selected analysis step, synthesize with `99`; never load a hardcoded neighboring step.
