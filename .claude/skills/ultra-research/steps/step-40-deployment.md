# Step 40: Deployment & Infrastructure

> Scope, evidence, language, confirmation and checkpoint rules: [entry contract](../SKILL.md). Run only when selected; return to its router when done. Reuse existing decisions and sources.

## MANDATORY EXECUTION RULES

- VERIFY factual claims with accessible evidence under the entry contract; use web search when current external evidence is needed.
- INCLUDE cost estimates with sources
- Define actual execution/deployment environments; a local CLI or library need not invent staging or production hosting
- WRITE output to spec file BEFORE presenting to user
- Follow the user/project language preference; English artifacts and Chinese conversation are only template defaults

## PREREQUISITES

- This step is selected in `research-state.json`.
- Needed input: Actual operating needs, existing environment and relevant technology constraints.
- Read existing sources first. Missing necessary input becomes a scoped blocker; it does not automatically add skipped steps. Create the owned output section only when needed.

## EVIDENCE SEARCH (WHEN NEEDED)

```
Search: "{{chosen_hosting}} pricing calculator {{product_domain}}"
Search: "{{chosen_hosting}} deployment best practices"
Search: "{{chosen_tech_stack}} CI/CD pipeline setup"
Search: "{{chosen_tech_stack}} docker deployment production"
```

## EXECUTION SEQUENCE

### 1. Define Deployment Topology

Map only the environments and infrastructure this project uses. For a local CLI/library, document its runtime/distribution needs instead.

### 2. Define CI/CD Pipeline

Build → Test → Deploy stages with quality gates.

### 3. Estimate Costs

Use web search for real pricing data.

### 4. Write Output

**WRITE IMMEDIATELY** to `.ultra/specs/architecture.md` §7-9:

```markdown
## §7 Deployment View

### Environments

| Environment | Purpose | Infrastructure | URL Pattern |
|------------|---------|---------------|-------------|
| Development | Local dev | [Docker Compose / local] | localhost:X |
| Staging | Pre-prod testing | [Cloud provider details] | staging.X |
| Production | Live users | [Cloud provider details] | X.com |

### Production Topology
- **Compute**: [Service type, instance size, count]
- **Database**: [Managed service, tier, backup]
- **Cache**: [Service, tier]
- **CDN**: [Provider]
- **DNS**: [Provider]

### CI/CD Pipeline

| Stage | Tool | Trigger | Quality Gate |
|-------|------|---------|-------------|
| Build | [Tool] | Push to branch | Compilation success |
| Unit Test | [Runner] | Post-build | 80%+ coverage, 0 failures |
| Integration Test | [Runner] | Post-unit | All green |
| Security Scan | [Tool] | Post-test | No critical/high |
| Deploy Staging | [Tool] | Merge to main | All gates passed |
| Deploy Production | [Tool] | Manual approval | Staging verified |

## §8 Crosscutting Concerns

### Logging
- **Format**: Structured JSON
- **Fields**: timestamp, level, service, traceId, message, context
- **Tool**: [Logging framework]

### Authentication
- **Method**: [JWT / OAuth2 / etc]
- **Provider**: [Auth service]
- **Session**: [Strategy]

### Error Handling
- **Pattern**: Result/Either in domain, global handler in infrastructure
- **Alerting**: [When and how]

## §9 Cost Estimate

| Service | Monthly Cost | Annual Cost | Source |
|---------|-------------|------------|--------|
| Compute | $[X] | $[X] | [source reference] |
| Database | $[X] | $[X] | [source reference] |
| Other | $[X] | $[X] | [source reference] |
| **Total** | **$[X]** | **$[X]** | |

_Assumptions: [user count, traffic, storage]_
```

### 5. Present to User and Gate

```
[C] Continue — Accept this step and return to the selected-step router
[R] Revise — Adjust infrastructure or costs
```

**Pause only for an unresolved required decision or a user-requested interactive gate. Otherwise checkpoint and continue under the entry contract.**

### 6. Handle Response

- **[C]**: Verify owned output, checkpoint completion, and return to the router in `../SKILL.md`.
- **[R]**: Revise, update architecture.md §7-9, re-present

## SUCCESS METRICS

- All environments defined
- CI/CD pipeline with quality gates
- Cost estimates with sources
- Crosscutting concerns (logging, auth, errors) addressed

## NEXT STEP

Return to the entry router: choose the next incomplete `selected_steps` item. If this is the last selected analysis step, synthesize with `99`; never load a hardcoded neighboring step.
