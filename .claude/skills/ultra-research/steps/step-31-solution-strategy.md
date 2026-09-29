# Step 31: Solution Strategy & Tech Stack

> Scope, evidence, language, confirmation and checkpoint rules: [entry contract](../SKILL.md). Run only when selected; return to its router when done. Reuse existing decisions and sources.

## MANDATORY EXECUTION RULES

- VERIFY factual claims with accessible evidence under the entry contract; use web search when current external evidence is needed.
- Use an available official-documentation lookup if helpful; follow the entry contract for versioned local/docs fallback when unavailable.
- Compare plausible alternatives for a new material decision; retain validated existing choices unless this scope requires reconsideration
- EVERY CHOICE needs RATIONALE — "it's popular" is not enough
- WRITE output to spec file BEFORE presenting to user
- Follow the user/project language preference; English artifacts and Chinese conversation are only template defaults

## PREREQUISITES

- This step is selected in `research-state.json`.
- Needed input: Applicable quality goals, constraints and system context from step 30 or existing architecture.
- Read existing sources first. Missing necessary input becomes a scoped blocker; it does not automatically add skipped steps. Create the owned output section only when needed.

## CONTEXT BOUNDARIES

- Focus: Tech stack selection with evidence-based rationale (project template §4, inspired by arc42)
- Decisions must satisfy quality goals from §1
- Decisions must respect constraints from §2
- Explain changed choices with alternatives and rationale; do not reopen settled choices without a reason

## EVIDENCE SEARCH (WHEN NEEDED)

For each major technology decision:

```
Search: "[option A] vs [option B] vs [option C] {{product_domain}} {{current_year}}"
Search: "[chosen framework] production performance benchmarks"
Search: "[chosen framework] scalability limitations"
Search: "[chosen database] vs alternatives for {{use_case}}"
```

Use available official documentation or versioned local sources. Context7 is optional; unavailable evidence becomes an explicit gap rather than an invented lookup.

## EXECUTION SEQUENCE

### 1. Identify Key Technology Decisions

Based on system context (§3) and quality goals (§1):

| Decision Area | What to Decide |
|--------------|---------------|
| Language/Runtime | Primary programming language |
| Web Framework | API/web framework |
| Database | Primary data store |
| Caching | Caching layer (if needed) |
| Authentication | Auth approach |
| Hosting | Cloud/infrastructure |
| CI/CD | Build and deploy pipeline |
| Monitoring | Observability stack |

### 2. Compare Relevant Options

For each new material decision, compare plausible options (often 2-3). Skip decision areas the project does not need, such as a database for a pure function library:

| Criterion | Option A | Option B | Option C |
|-----------|---------|---------|---------|
| Quality goal fit | [How it meets §1 goals] | ... | ... |
| Constraint fit | [How it respects §2] | ... | ... |
| Community/maturity | [Stars, contributors, releases] | ... | ... |
| Performance | [Benchmarks with source] | ... | ... |
| Learning curve | [Team skill match] | ... | ... |
| Cost | [Licensing, hosting costs] | ... | ... |

### 3. Make Decisions with Rationale

For each decision:
- **Chosen**: [Option]
- **Rationale**: [Why this one — reference quality goals and constraints]
- **Trade-off accepted**: [What we give up]
- **Risk**: [What could go wrong]
- **Migration path**: [How to change if this doesn't work]

### 4. Write Output

**WRITE IMMEDIATELY** to `.ultra/specs/architecture.md` §4:

```markdown
## §4 Solution Strategy

### Technology Decisions

#### Language & Runtime
- **Chosen**: [Language/Runtime]
- **Alternatives considered**: [Option B], [Option C]
- **Rationale**: [Why — reference §1 quality goals]
- **Trade-off**: [What we give up]
- **Source**: [Benchmark/doc URL]

#### Web Framework
- **Chosen**: [Framework]
- **Alternatives considered**: [Option B], [Option C]
- **Rationale**: [Why]
- **Trade-off**: [What we give up]
- **Source**: [source reference]

#### Database
- **Chosen**: [Database]
- **Alternatives considered**: [Option B], [Option C]
- **Rationale**: [Why]
- **Trade-off**: [What we give up]
- **Source**: [source reference]

#### Authentication
- **Chosen**: [Approach]
- **Alternatives considered**: [Option B], [Option C]
- **Rationale**: [Why]
- **Source**: [source reference]

#### Hosting & Infrastructure
- **Chosen**: [Platform]
- **Alternatives considered**: [Option B], [Option C]
- **Rationale**: [Why]
- **Estimated cost**: [$X/month at launch scale]
- **Source**: [source reference]

### Tech Stack Summary

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| Frontend | [Tech] | [Ver] | [What it does] |
| Backend | [Tech] | [Ver] | [What it does] |
| Database | [Tech] | [Ver] | [What it does] |
| Cache | [Tech] | [Ver] | [What it does] |
| Auth | [Tech] | [Ver] | [What it does] |
| Hosting | [Tech] | - | [What it does] |
| CI/CD | [Tech] | - | [What it does] |
| Monitoring | [Tech] | - | [What it does] |

### Decision Confidence
- **Overall**: [evidence status, source and limitation]
- **Most confident**: [Decision] — [Why]
- **Least confident**: [Decision] — [Risk]
```

### 5. Present to User and Gate

```
[C] Continue — Accept this step and return to the selected-step router
[R] Revise — Reconsider specific technology choices
[D] Discuss — Deep-dive on a specific decision
```

**Pause only for an unresolved required decision or a user-requested interactive gate. Otherwise checkpoint and continue under the entry contract.**

### 6. Handle Response

- **[C]**: Verify owned output, checkpoint completion, and return to the router in `../SKILL.md`.
- **[R]**: Revise decisions, update architecture.md §4, re-present
- **[D]**: Deep-dive with additional research, then re-present

## SUCCESS METRICS

- New material choices have relevant alternatives and rationale; reused choices have a source
- Every choice has explicit rationale referencing quality goals
- Trade-offs stated honestly
- Factual claims linked to accessible evidence; unavailable evidence recorded as a gap
- Output written to architecture.md §4

## FAILURE MODES

- Unsupported new technology choice with no rationale or relevant comparison
- No rationale beyond popularity
- Ignoring constraints from §2
- Not verifying version compatibility
- Technology choices that conflict with quality goals

## NEXT STEP

Return to the entry router: choose the next incomplete `selected_steps` item. If this is the last selected analysis step, synthesize with `99`; never load a hardcoded neighboring step.
