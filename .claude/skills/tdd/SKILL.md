---
name: tdd
description: '测试驱动开发。当用户希望以测试优先的方式开发功能或修复 Bug、提到"红-绿-重构"，或需要集成测试时使用。'
user-invocable: true
version: "1.0.1"
compatibility: 无外部 CLI/网络依赖；建议在已配备测试框架（jest/vitest/pytest 等）的项目中使用，可独立执行；设计与评审参考按宿主已安装能力选用。
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Test-Driven Development

TDD is the red → green → refactor loop. This skill is the reference that makes that loop produce tests worth keeping: what a good test is, where tests go, the anti-patterns, and the rules of the loop. Every section applies on every cycle: consult them before and during the loop, not after.

When exploring the codebase, read `CONTEXT.md` (if it exists) so test names and interface vocabulary match the project's domain language, and respect ADRs in the area you're touching.

## What a good test is

Tests verify behavior through public interfaces, not implementation details. Code can change entirely; tests shouldn't. A good test reads like a specification: "user can checkout with valid cart" tells you exactly what capability exists, and it survives refactors because it doesn't care about internal structure.

See [tests.md](references/tests.md) for examples and [mocking.md](references/mocking.md) for mocking guidelines.

## Seams: where tests go

A **seam** is the public boundary you test at: the interface where you observe behavior without reaching inside. Tests live at seams, never against internals.

**Choose the seams from the task and existing contracts.** Reuse already agreed acceptance criteria and public interfaces. Ask the user only when a material behavior or scope decision is unresolved; routine test placement does not require another approval.

Identify the public interface and critical behavior before the first test.

When the interface is unclear, inspect existing callers, domain vocabulary and nearby contracts. A module should expose the behavior its callers need and keep changeable implementation details inside. Consult an installed design skill only if it adds relevant guidance; no other skill is required.

## Anti-patterns

- **Implementation-coupled**: mocks internal collaborators, tests private methods, or verifies through a side channel (querying the database instead of using the interface). The tell: the test breaks when you refactor but behavior hasn't changed.
- **Tautological**: the assertion recomputes the expected value the way the code does (`expect(add(a, b)).toBe(a + b)`, a snapshot derived by hand the same way, a constant asserted equal to itself), so it passes by construction and can never disagree with the code. Expected values must come from an independent source of truth: a known-good literal, a worked example, the spec.
- **Horizontal slicing**: writing all tests first, then all implementation. Bulk tests verify _imagined_ behavior: you test the _shape_ of things rather than user-facing behavior, the tests go insensitive to real changes, and you commit to test structure before understanding the implementation. Work in **vertical slices** instead: one test → one implementation → repeat, each test a **tracer bullet** that responds to what the last cycle taught you.

## Rules of the loop

- **Red before green.** Write the failing test first, then only enough code to pass it. Don't anticipate future tests or add speculative features.
- **One slice at a time.** One seam, one test, one minimal implementation per cycle.
- **Refactor while green.** Improve the tested code when needed without changing behavior, then rerun the affected tests. Keep broader redesign outside the current slice unless the task requires it.

## 相关资源（References）

- `references/tests.md` —— 好 / 坏测试示例（集成式 vs 实现细节耦合、同义反复）
- `references/mocking.md` —— 何时及如何 mock（只在系统边界 mock，依赖注入与 SDK 风格接口设计）
