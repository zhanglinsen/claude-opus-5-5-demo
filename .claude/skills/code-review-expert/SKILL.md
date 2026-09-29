---
name: code-review-expert
description: "结构化代码评审清单与工作流：SOLID、安全、性能、边界条件、集成连通性、移除规划；注入 code-reviewer agent 使用，也可在用户要求「代码审查 / CR / review / 挑毛病」时独立执行。"
user-invocable: false
version: "1.1.1"
compatibility: 需要可读代码与 git；工具名按宿主能力映射，独立评审无需后台 Agent。
allowed-tools: Read, Grep, Glob, Bash(git *), Task
---

# Code Review Expert Checklists

Provides structured review workflow and reference checklists for the code-reviewer agent.

## 用途（Purpose）

为代码评审提供**统一的严重级别定义 + 分步检查流程 + 结构化输出模板**，
使不同 agent / 不同人执行评审时结论口径一致。

## 触发条件（When to Use）

- 用户要求「代码审查 / code review / CR / review / 挑毛病 / 过一遍改动」
- 需要评审 `git diff`、某个 PR、或某个提交范围
- 作为评审清单被编排型技能注入（本技能 `user-invocable: false`，通常由
  `ultra-review` 等编排技能调用，而非用户直接 `/` 触发）

> **与 `ultra-review` 的分工**（避免重复）：`ultra-review` 负责**并行编排与
> 上下文隔离**（多 agent 后台跑、结果写 JSON、减少重复上下文）；本技能负责
> **评审口径本身**（严重级别、检查项、输出模板）。二者互补，不重复建设。

## Severity Levels

| Level | Name | Description | Action |
|-------|------|-------------|--------|
| **P0** | Critical | Demonstrated critical security exposure, data loss, or comparable impact | Must block merge |
| **P1** | High | Material correctness, security, or performance defect with a concrete trigger | Should fix before merge |
| **P2** | Medium | Code smell, maintainability concern, minor SOLID violation | Fix in this PR or create follow-up |
| **P3** | Low | Style, naming, minor suggestion | Optional improvement |

Severity follows demonstrated impact and evidence, not a keyword, pattern name, or tool preference. Project-specific bans apply only when an applicable project rule declares them. Explain the triggering scenario; separate confirmed defects from unverified risks.

## Review Workflow

### Step 1: Preflight Context

- Run `git status -sb`, `git diff --stat`, and `git diff` to scope changes
- Use `git diff --cached` to include staged changes
- If needed, use Grep to find related modules, usages, and contracts

**Edge cases:**
- **No changes**: Inform user, ask if they want to review staged changes or a specific commit range
- **Large diff (>500 lines)**: Summarize by file first, then review in batches by module/feature area
- **Mixed concerns**: Group findings by logical feature, not just file order

### Step 2: SOLID + Architecture Smells

Load `references/solid-checklist.md` for detailed prompts.

Look for SRP/OCP/LSP/ISP/DIP violations and common code smells. When proposing refactor, explain *why* it improves cohesion/coupling. Non-trivial refactors get incremental plans, not large rewrites.

### Step 3: Removal Candidates

Load `references/removal-plan.md` for template.

Identify unused, redundant, or feature-flagged-off code. Distinguish **safe delete now** vs **defer with plan**. Provide follow-up steps with concrete checkpoints.

### Step 4: Security and Reliability

Load `references/security-checklist.md` for coverage.

Check injection, auth gaps, secrets, race conditions, crypto, supply chain. Call out both **exploitability** and **impact**.

### Step 5: Code Quality

Load `references/code-quality-checklist.md` for coverage.

Check error handling, performance/caching, boundary conditions. Flag issues that may cause silent failures or production incidents.

### Step 5.5: Integration & Connectivity

Load `references/integration-checklist.md` for detailed prompts.

Check entry point tracing, contract validation, vertical slice assessment, integration test coverage, and data flow continuity. Flag orphan code, missing contracts, and horizontal-only changes.

### Step 6: Output Format

```markdown
## Code Review Summary

**Files reviewed**: X files, Y lines changed
**Overall assessment**: [APPROVE / REQUEST_CHANGES / COMMENT]

---

## Findings

### P0 - Critical
(none or list)

### P1 - High
- **[file:line]** Brief title
  - Description of issue
  - Suggested fix

### P2 - Medium
...

### P3 - Low
...

---

## Removal/Iteration Plan
(if applicable)

## Additional Suggestions
(optional improvements, not blocking)
```

### Step 7: Next Steps Confirmation

After presenting findings, ask how to proceed:

1. **Fix all** - Implement all suggested fixes
2. **Fix P0/P1 only** - Address critical and high priority issues
3. **Fix specific items** - User specifies which issues to fix
4. **No changes** - Review complete, no implementation needed

**Important**: A review-only request does not authorize fixes. If the user has already asked to fix the findings, proceed within that scope without asking again; request a decision only for a material ambiguity or additional permission.

## Additional Resources

### Reference Files

For detailed patterns and checklists, consult:
- **`references/solid-checklist.md`** - SOLID violation detection and refactor heuristics
- **`references/security-checklist.md`** - Security, reliability, and race condition checks
- **`references/code-quality-checklist.md`** - Error handling, performance, boundary conditions
- **`references/removal-plan.md`** - Deletion candidates and iteration planning template
- **`references/integration-checklist.md`** - Entry point tracing, contract validation, data flow continuity
