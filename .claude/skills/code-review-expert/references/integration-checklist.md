# Integration Checklist

Review boundaries and acceptance criteria actually touched by this change.
Choose severity from concrete impact and evidence; this checklist does not
require a particular architecture or test tool.

## Entry Point Tracing

- Trace the entry point to an observable result using the project's structure.
  A library can expose a function; a CLI need not involve persistence.
- Before flagging orphan code, check public exports, registration, dynamic
  discovery and explicitly staged delivery.
- Report required behavior that is unreachable, identifying the missing link.

## Contract Validation

- Identify types/schema, protocol, errors and compatibility promises. A shared
  type is one option, not the only valid contract.
- Inspect tests at changed or risky boundaries. Explain the failure current
  tests would miss instead of assigning severity solely for a missing test.

## Verification Choices

| Boundary | Useful verification | Scope |
|---|---|---|
| HTTP | Request/response integration | Routing, middleware or serialization changed |
| Database | Real adapter with a representative database | SQL, constraints or transactions; existing test DB or container |
| Queue/event | Publish/consume or protocol contract | Transport/delivery behavior |
| External API | Deterministic double plus contract fixture | Avoid uncontrolled live calls in routine tests |
| Application logic | Public API with suitable in-memory adapters | Behavior independent of real transport/storage |

## End-to-End Continuity

- Check an observable path for the requested scenario and relevant failures.
- A single-layer fix can complete a scenario in an existing system. Do not add
  layers or a walking skeleton merely to make the diff cross layers.
- An intermediate increment should identify its consumer and remaining work;
  being intermediate does not automatically make it a high-severity defect.
- Trace recovery where failure could lose data, hide errors or leave partial state.
