# Step 32: Building Blocks & Runtime Scenarios

> Scope, evidence, language, confirmation and checkpoint rules: [entry contract](../SKILL.md). Run only when selected; return to its router when done. Reuse existing decisions and sources.

## MANDATORY EXECUTION RULES

- Keep responsibilities cohesive and dependencies explicit; separate pure logic from IO where applicable and preserve the project's architecture
- Every added module traces to an included feature or justified technical requirement
- Runtime scenarios cover the relevant included behavior and actual boundary/error paths
- WRITE output to spec file BEFORE presenting to user
- Follow the user/project language preference; English artifacts and Chinese conversation are only template defaults

## PREREQUISITES

- This step is selected in `research-state.json`.
- Needed input: Included requirements and current/chosen technology, from selected steps or existing architecture.
- Read existing sources first. Missing necessary input becomes a scoped blocker; it does not automatically add skipped steps. Create the owned output section only when needed.

## CONTEXT BOUNDARIES

- Focus: Module decomposition and runtime behavior (project template §5-6, inspired by arc42)
- Structure follows existing project boundaries; the layered example below is illustrative, not a required folder layout
- Domain logic is pure (no IO); Infrastructure handles IO
- This step bridges product (WHAT) to code (HOW)

## EXECUTION SEQUENCE

### 1. Module Decomposition

Based on included features or technical requirements and the existing/chosen stack:

**Example layered service structure** (omit unused layers; a CLI, library or UI-only change may be much smaller):
```
src/
├── domain/           # Functional Core (pure logic)
│   ├── entities/     # Domain objects
│   ├── values/       # Value objects
│   └── services/     # Domain services (pure functions)
├── application/      # Use cases (orchestration)
│   └── usecases/     # One file per use case
├── infrastructure/   # Imperative Shell (IO)
│   ├── http/         # HTTP handlers/routes
│   ├── persistence/  # Database repositories
│   └── external/     # External API clients
└── config/           # Configuration
```

Map each feature to modules:
- Feature 1 → domain/entities/X, application/usecases/Y, infrastructure/http/Z

### 2. Define Key Interfaces

For each module boundary, define the contract:

| Interface | Provider | Consumer | Data |
|-----------|---------|----------|------|
| [Interface A] | [Module] | [Module] | [DTO/Entity] |

### 3. Runtime Scenarios

For the included scenarios or technical change paths, describe runtime flow. The HTTP/database example applies only when these components exist:

**Scenario S1**: [Name]
```
User → HTTP Handler → Use Case → Domain Service → Repository → Database
                                                              ↓
User ← HTTP Response ← Use Case ← Domain Entity ← Repository ← Query Result
```

### 4. Write Output

**WRITE IMMEDIATELY** to `.ultra/specs/architecture.md` §5-6:

```markdown
## §5 Building Block View

### Level 1: System Decomposition

| Module | Layer | Responsibility | Dependencies |
|--------|-------|---------------|-------------|
| [Module A] | Domain | [What it does] | None (pure) |
| [Module B] | Application | [What it orchestrates] | [Module A] |
| [Module C] | Infrastructure | [What IO it handles] | [Module B] |

### Module Details

#### domain/
- **entities/[Entity]**: [Description, key fields, business rules]
- **values/[ValueObject]**: [Description, validation rules]
- **services/[Service]**: [Pure functions, input → output]

#### application/usecases/
- **[UseCase1]**: [Input → orchestration → output]
- **[UseCase2]**: [Input → orchestration → output]

#### infrastructure/
- **http/[Handler]**: [Routes, request/response mapping]
- **persistence/[Repository]**: [Database operations]
- **external/[Client]**: [External API integration]

### Feature → Module Mapping

| Feature | Domain | Application | Infrastructure |
|---------|--------|------------|---------------|
| [Feature 1] | [Entities] | [UseCases] | [Handlers, Repos] |
| [Feature 2] | [Entities] | [UseCases] | [Handlers, Repos] |

## §6 Runtime Scenarios

### Scenario 1: [S1 Name from product.md]

**Trigger**: [User action]
**Flow**:
1. User sends [request type] to [endpoint]
2. [Handler] validates input, maps to [DTO]
3. [UseCase] orchestrates: loads [Entity] via [Repository]
4. [DomainService] applies business logic (pure)
5. [Repository] persists result
6. [Handler] returns [response]

**Data flow**: [Input] → [Transformation] → [Output]
**Error paths**: [What can go wrong and how it's handled]

### Scenario 2: [S2 Name]
[Same structure]

### Scenario 3: [S3 Name]
[Same structure]

### Round 3 Summary

**Architecture Design Confidence**:
- **Quality goal coverage**: [evidence status, source and limitation]
- **Tech stack confidence**: [evidence status, source and limitation]
- **Module clarity**: [evidence status, source and limitation]
- **Overall R3 confidence**: [evidence status, source and limitation]
```

### 5. Write Round 3 Research Report

**WRITE** to `.ultra/docs/research/architecture-design-{date}.md`:

```markdown
# Round 3: Architecture Design

> **Confidence**: [evidence status, source and limitation]
> **Steps completed**: [actual selected and verified step IDs in this round]
> **Completed**: [date]

## Key Decisions
[Tech stack choices with rationale]

## Architecture Pattern
[Actual chosen or retained architecture and why it fits]

## Risk Areas
[Where architecture is weakest]
```

### 6. Present to User and Gate

```
[C] Continue — Accept this step and return to the selected-step router
[R] Revise — Adjust modules or scenarios
```

**Pause only for an unresolved required decision or a user-requested interactive gate. Otherwise checkpoint and continue under the entry contract.**

### 7. Handle Response

- **[C]**: Verify owned output, checkpoint completion, and return to the router in `../SKILL.md`.
- **[R]**: Revise, update architecture.md §5-6, re-present

## SUCCESS METRICS

- Every added module traces to an included feature or technical requirement
- Responsibilities and dependency direction fit the project; pure logic/IO separation is clear where applicable
- Relevant runtime scenarios documented with data flow and boundary behavior
- Error paths identified
- Round 3 research report written

## FAILURE MODES

- Modules without an included feature or justified technical requirement
- Business logic in infrastructure layer
- Missing error paths in runtime scenarios
- No interface contracts between modules

## NEXT STEP

Return to the entry router: choose the next incomplete `selected_steps` item. If this is the last selected analysis step, synthesize with `99`; never load a hardcoded neighboring step.
