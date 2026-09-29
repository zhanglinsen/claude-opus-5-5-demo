# Step 41: Quality Scenarios & Risks

> Scope, evidence, language, confirmation and checkpoint rules: [entry contract](../SKILL.md). Run only when selected; return to its router when done. Reuse existing decisions and sources.

## MANDATORY EXECUTION RULES

- QUALITY SCENARIOS must be specific and testable
- RISKS need probability AND impact AND mitigation
- BE HONEST — don't minimize risks to make the plan look good
- WRITE output to spec file BEFORE presenting to user
- Follow the user/project language preference; English artifacts and Chinese conversation are only template defaults

## PREREQUISITES

- This step is selected in `research-state.json`.
- Needed input: Applicable quality goals, operating context and known risks from selected or existing evidence.
- Read existing sources first. Missing necessary input becomes a scoped blocker; it does not automatically add skipped steps. Create the owned output section only when needed.

## EXECUTION SEQUENCE

### 1. Define Quality Scenarios

For each quality goal from §1, create testable scenarios:

| Quality Goal | Scenario | Stimulus | Response | Measure |
|-------------|---------|----------|----------|---------|
| Performance | Load test | 1000 concurrent users | Response time | p95 < 200ms |
| Availability | Node failure | One server dies | Auto-recovery | < 30s downtime |
| Security | Injection | SQL injection attempt | Blocked | 0 success |

### 2. Identify Risks

Categories: Technical, Business, Operational, External.

For each risk:
- **Probability**: High / Medium / Low
- **Impact**: High / Medium / Low
- **Mitigation**: What we'll do to reduce it
- **Contingency**: What we'll do if it happens anyway

### 3. Identify Technical Debt

What are we knowingly deferring? Document it now so it doesn't get forgotten.

### 4. Write Output

**WRITE IMMEDIATELY** to `.ultra/specs/architecture.md` §10-12:

```markdown
## §10 Quality Scenarios

| # | Quality Attribute | Scenario | Stimulus | Expected Response | Metric |
|---|------------------|---------|----------|------------------|--------|
| Q1 | Performance | [Scenario] | [Stimulus] | [Response] | [Target] |
| Q2 | Scalability | [Scenario] | [Stimulus] | [Response] | [Target] |
| Q3 | Security | [Scenario] | [Stimulus] | [Response] | [Target] |
| Q4 | Availability | [Scenario] | [Stimulus] | [Response] | [Target] |
| Q5 | Maintainability | [Scenario] | [Stimulus] | [Response] | [Target] |

## §11 Risks & Technical Debt

### Risk Register

| # | Risk | Category | Probability | Impact | Score | Mitigation | Contingency |
|---|------|----------|------------|--------|-------|-----------|-------------|
| R1 | [Risk] | Technical | High | High | 9 | [Action] | [Fallback] |
| R2 | [Risk] | Business | Medium | High | 6 | [Action] | [Fallback] |
| R3 | [Risk] | External | Low | Medium | 2 | [Action] | [Fallback] |

### Known Technical Debt

| # | Debt Item | Reason for Deferral | Impact if Not Addressed | Address By |
|---|----------|--------------------|-----------------------|-----------|
| TD1 | [Item] | [Why deferred] | [Consequence] | [Timeline] |
| TD2 | [Item] | [Why deferred] | [Consequence] | [Timeline] |

## §12 Architecture Decision Records

| # | Decision | Context | Options | Chosen | Rationale |
|---|---------|---------|---------|--------|-----------|
| ADR-1 | [Decision] | [Why needed] | [A, B, C] | [Choice] | [Why] |
| ADR-2 | [Decision] | [Why needed] | [A, B, C] | [Choice] | [Why] |

### Round 4 Summary

**Quality & Deployment Confidence**:
- **Deployment readiness**: [evidence status, source and limitation]
- **Risk coverage**: [evidence status, source and limitation]
- **Quality scenario coverage**: [evidence status, source and limitation]
- **Overall R4 confidence**: [evidence status, source and limitation]
```

### 5. Write Round 4 Research Report

**WRITE** to `.ultra/docs/research/quality-deployment-{date}.md`:

```markdown
# Round 4: Quality & Deployment

> **Confidence**: [evidence status, source and limitation]
> **Steps completed**: [actual selected and verified step IDs in this round]
> **Completed**: [date]

## Key Findings
[Infrastructure decisions + cost summary]

## Top Risks
[Top 3 risks with scores]

## Technical Debt
[Items knowingly deferred]
```

### 6. Present to User and Gate

```
[C] Continue — Accept this step and return to the selected-step router
[R] Revise — Adjust quality scenarios or risks
```

**Pause only for an unresolved required decision or a user-requested interactive gate. Otherwise checkpoint and continue under the entry contract.**

### 7. Handle Response

- **[C]**: Verify owned output, checkpoint completion, and return to the router in `../SKILL.md`.
- **[R]**: Revise, update architecture.md §10-12, re-present

## SUCCESS METRICS

- Quality scenarios are specific and testable
- At least 5 risks identified with mitigation
- Technical debt documented with timelines
- ADRs capture key architecture decisions
- Round 4 research report written

## NEXT STEP

Return to the entry router: choose the next incomplete `selected_steps` item. If this is the last selected analysis step, synthesize with `99`; never load a hardcoded neighboring step.
