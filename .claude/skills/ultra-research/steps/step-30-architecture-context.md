# Step 30: Architecture Context

> Scope, evidence, language, confirmation and checkpoint rules: [entry contract](../SKILL.md). Run only when selected; return to its router when done. Reuse existing decisions and sources.

## MANDATORY EXECUTION RULES

- VERIFY factual claims with accessible evidence under the entry contract; use web search when current external evidence is needed.
- Use an available official-documentation lookup if helpful; follow the entry contract for versioned local/docs fallback when unavailable.
- Architecture decisions trace to the current product or technical requirements
- WRITE output to spec file BEFORE presenting to user
- Follow the user/project language preference; English artifacts and Chinese conversation are only template defaults

## PREREQUISITES

- This step is selected in `research-state.json`.
- Needed input: Current product or technical requirements, existing system context and constraints.
- Read existing sources first. Missing necessary input becomes a scoped blocker; it does not automatically add skipped steps. Create the owned output section only when needed.

## CONTEXT BOUNDARIES

- Focus: Quality goals, constraints, and system context (project template §1-3, inspired by arc42)
- Decisions are grounded in selected product requirements or an existing technical change request
- This is about WHAT the system must achieve, not HOW to build it (that's step-31)

## EVIDENCE SEARCH (WHEN NEEDED)

```
Search: "{{product_domain}} architecture quality attributes"
Search: "{{product_domain}} system integration patterns"
Search: "{{product_domain}} technical constraints regulations"
```

Use available official documentation or versioned local sources. Context7 is optional; unavailable evidence becomes an explicit gap rather than an invented lookup.

## EXECUTION SEQUENCE

### 1. Define Quality Goals

Derive from applicable success metrics, scenarios or existing technical requirements; use only relevant quality attributes:

| Quality Attribute | Concrete Scenario | Priority |
|------------------|-------------------|----------|
| Performance | [e.g., "API response < 200ms for 95th percentile"] | [1-3] |
| Scalability | [e.g., "Handle 10K concurrent users"] | [1-3] |
| Security | [e.g., "SOC 2 compliance, encrypted at rest"] | [1-3] |
| Availability | [e.g., "99.9% uptime, < 5min recovery"] | [1-3] |
| Maintainability | [e.g., "New developer productive in < 1 week"] | [1-3] |

If the answer is not already available, ask using the host question capability or normal conversation: "Which quality attributes matter most? Performance? Security? Scalability?"

### 2. Identify Constraints

**Technical constraints**:
- Required platforms/browsers
- Mandatory integrations
- Technology restrictions (e.g., "must use Python for ML team compatibility")

**Organizational constraints**:
- Team size and skill profile
- Budget limitations
- Timeline constraints

**Regulatory constraints**:
- Data privacy (GDPR, CCPA)
- Industry regulations
- Compliance requirements

### 3. Map System Context

Identify all external systems and interfaces:

**Users**: Who interacts with the system?
**External systems**: What APIs, services, databases does it connect to?
**Data flows**: What data enters and leaves the system?

### 4. Write Output

**WRITE IMMEDIATELY** to `.ultra/specs/architecture.md` §1-3:

```markdown
## §1 Quality Goals

| Priority | Quality Attribute | Scenario | Metric |
|----------|------------------|----------|--------|
| 1 | [Attribute] | [Concrete scenario] | [Measurable target] |
| 2 | [Attribute] | [Concrete scenario] | [Measurable target] |
| 3 | [Attribute] | [Concrete scenario] | [Measurable target] |

## §2 Constraints

### Technical Constraints
| Constraint | Rationale | Impact |
|-----------|-----------|--------|
| [Constraint] | [Why this exists] | [What it limits] |

### Organizational Constraints
| Constraint | Rationale | Impact |
|-----------|-----------|--------|
| [Constraint] | [Why this exists] | [What it limits] |

### Regulatory Constraints
| Constraint | Rationale | Impact |
|-----------|-----------|--------|
| [Constraint] | [Why this exists] | [What it limits] |

## §3 System Context

### Context Diagram

**Users**:
- [User type 1]: [How they interact]
- [User type 2]: [How they interact]

**External Systems**:
| System | Direction | Data | Protocol | Notes |
|--------|-----------|------|----------|-------|
| [System A] | Inbound | [What data] | [REST/gRPC/etc] | [Notes] |
| [System B] | Outbound | [What data] | [Protocol] | [Notes] |
| [System C] | Bidirectional | [What data] | [Protocol] | [Notes] |

**Data Flows**:
- [User] → [System] → [External]: [Description of flow]
- [External] → [System] → [User]: [Description of flow]
```

### 5. Present to User and Gate

```
[C] Continue — Accept this step and return to the selected-step router
[R] Revise — Adjust quality goals, constraints, or context
```

**Pause only for an unresolved required decision or a user-requested interactive gate. Otherwise checkpoint and continue under the entry contract.**

### 6. Handle Response

- **[C]**: Verify owned output, checkpoint completion, and return to the router in `../SKILL.md`.
- **[R]**: Revise, update architecture.md §1-3, re-present

## SUCCESS METRICS

- Quality goals are specific and measurable (not "good performance")
- Constraints identified across technical/organizational/regulatory
- System context shows all external interfaces
- All quality goals trace to product requirements
- Output written to architecture.md §1-3

## FAILURE MODES

- Vague quality goals ("system should be fast")
- Missing regulatory constraints
- System context missing key external integrations
- Quality goals not derived from product requirements

## NEXT STEP

Return to the entry router: choose the next incomplete `selected_steps` item. If this is the last selected analysis step, synthesize with `99`; never load a hardcoded neighboring step.
