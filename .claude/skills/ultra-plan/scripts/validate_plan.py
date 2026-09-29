"""Validate a saved ultra-plan registry without modifying any artifact.

Exit codes: 0 valid; 1 invalid; 2 incomplete checkpoint (--allow-incomplete).
Checks structure, scope, references and dependencies, not requirement quality.
"""
import argparse
import json
from pathlib import Path
import re


def validate_plan(registry, *, allow_incomplete=False):
    registry = Path(registry).resolve()
    errors, pending, warnings = [], [], []

    def result(status):
        return {"status": status, "errors": errors, "pending": pending, "warnings": warnings}

    try:
        data = json.loads(registry.read_text(encoding="utf-8-sig"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        errors.append(f"Cannot read registry: {exc}")
        return result("invalid")
    if not isinstance(data, dict) or data.get("schema_version") != "1.0.0":
        errors.append("schema_version must be 1.0.0; migrate legacy scope explicitly, never infer confirmation.")
        return result("invalid")
    if registry.parent.name != "tasks" or registry.parent.parent.name != ".ultra":
        errors.append("Registry must be <project>/.ultra/tasks/tasks.json.")
        return result("invalid")
    root = registry.parent.parent.parent
    specs_dir = (root / ".ultra/specs").resolve()
    contexts_dir = (registry.parent / "contexts").resolve()
    if not contexts_dir.is_relative_to(registry.parent):
        errors.append("The contexts directory resolves outside the active task directory.")
        return result("invalid")
    planning, tasks = data.get("planning"), data.get("tasks")
    if not isinstance(planning, dict) or not isinstance(tasks, list):
        errors.append("planning must be an object and tasks must be an array.")
        return result("invalid")

    def strings(value, label):
        if not isinstance(value, list) or any(not isinstance(x, str) or not x for x in value):
            errors.append(f"{label} must be an array of nonempty strings.")
            return []
        if len(set(value)) != len(value):
            errors.append(f"{label} contains duplicates.")
        return value

    def check_ref(value, label):
        if not isinstance(value, str) or "#" not in value:
            errors.append(f"{label} requires a spec path and exact section anchor.")
            return
        relative, fragment = value.split("#", 1)
        target = (root / relative).resolve()
        if not target.is_relative_to(specs_dir) or target.suffix != ".md" or not fragment:
            errors.append(f"{label} must refer to an anchored Markdown section inside .ultra/specs.")
            return
        try:
            body = target.read_text(encoding="utf-8-sig")
        except (OSError, UnicodeError) as exc:
            errors.append(f"{label}: {exc}")
            return
        anchors = set(re.findall(r'<a\s+id=[\"\']([^\"\']+)[\"\']\s*>', body))
        # Support ordinary unique heading slugs; explicit anchors avoid duplicate-heading ambiguity.
        slugs = {}
        for heading in re.findall(r"^#{1,6}\s+(.+?)\s*#*\s*$", body, flags=re.MULTILINE):
            base = re.sub(r"[^\w\- ]", "", heading.lower()).replace(" ", "-")
            count = slugs.get(base, 0)
            anchors.add(base if count == 0 else f"{base}-{count}")
            slugs[base] = count + 1
        if not body.strip() or fragment not in anchors:
            errors.append(f"{label}: missing section {value}.")

    phase = planning.get("phase")
    if not isinstance(phase, str) or phase not in {"scope", "requirements", "codebase", "generation", "dependencies", "save", "verification", "complete"}:
        errors.append("planning.phase is missing or invalid.")
    elif phase != "complete":
        pending.append(f"Planning phase is {phase}; it is not complete.")
    if not isinstance(planning.get("scope_mode"), str) or planning["scope_mode"] not in {"EXPAND", "SELECTIVE", "HOLD", "REDUCE"}:
        errors.append("planning.scope_mode is missing or invalid.")
    included = set(strings(planning.get("included_story_ids"), "included_story_ids"))
    excluded = set(strings(planning.get("excluded_story_ids"), "excluded_story_ids"))
    if included & excluded:
        errors.append("A story cannot be both included and excluded.")
    story_refs = planning.get("story_refs")
    if not isinstance(story_refs, dict):
        errors.append("planning.story_refs must map all included/excluded IDs to their source sections.")
        story_refs = {}
    if set(story_refs) != included | excluded:
        errors.append("story_refs keys must exactly match included_story_ids plus excluded_story_ids.")
    for story_id, source in story_refs.items():
        check_ref(source, f"story {story_id}")
    required = strings(planning.get("required_spec_refs"), "required_spec_refs")
    if not required:
        errors.append("Declare at least one required spec section for this scope.")
    for source in required:
        check_ref(source, "required_spec_refs")
    gaps = planning.get("gaps")
    if not isinstance(gaps, list):
        errors.append("planning.gaps must be an explicit array (empty when there are no gaps).")
        gaps = []
    gap_ids = set()
    for gap in gaps:
        if not isinstance(gap, dict) or not all(isinstance(gap.get(k), str) and gap[k].strip() for k in ["id", "status", "reason"]):
            errors.append("Each gap requires nonempty id, status and reason.")
            continue
        if gap["id"] in gap_ids:
            errors.append(f"Duplicate gap id: {gap['id']}.")
        gap_ids.add(gap["id"])
        if gap["status"] == "blocker":
            errors.append(f"Unresolved blocker {gap['id']}: {gap['reason']}")
        elif gap["status"] == "accepted":
            if not all(isinstance(gap.get(k), str) and gap[k].strip() for k in ["decision_ref", "follow_up"]):
                errors.append(f"Accepted gap {gap['id']} requires decision_ref and follow_up.")
            else:
                warnings.append(f"Accepted gap {gap['id']}: {gap['reason']}")
        elif gap["status"] != "not_applicable":
            errors.append(f"Unknown gap status: {gap['status']}.")

    by_id, expected_contexts, covered = {}, set(), set()
    for task in tasks:
        if not isinstance(task, dict) or not isinstance(task.get("id"), str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]*", task["id"]):
            errors.append("Every task requires a portable nonempty string id.")
            continue
        task_id = task["id"]
        if task_id in by_id:
            errors.append(f"Duplicate task id: {task_id}.")
        by_id[task_id] = task
        if not isinstance(task.get("title"), str) or not task["title"].strip():
            errors.append(f"Task {task_id} requires a title.")
        if not isinstance(task.get("status"), str) or task["status"] not in {"pending", "in_progress", "completed", "blocked"}:
            errors.append(f"Task {task_id} has invalid status.")
        context = task.get("context_file")
        expected = f"contexts/task-{task_id}.md"
        if context != expected:
            errors.append(f"Task {task_id} context_file must be {expected}.")
        context_path = (registry.parent / expected).resolve()
        if not context_path.is_relative_to(contexts_dir):
            errors.append(f"Task {task_id} context resolves outside contexts (including symlinks).")
            continue
        expected_contexts.add(context_path)
        if not context_path.is_file() or not context_path.read_text(encoding="utf-8-sig").strip():
            pending.append(f"Task {task_id} context missing or empty: {expected}.")
        stories = set(strings(task.get("story_ids"), f"Task {task_id} story_ids"))
        if stories - included:
            errors.append(f"Task {task_id} includes stories outside scope: {sorted(stories - included)}.")
        covered.update(stories)
        check_ref(task.get("trace_to"), f"Task {task_id} trace_to")
        strings(task.get("dependencies"), f"Task {task_id} dependencies")
        if isinstance(task.get("complexity"), (int, float)) and task["complexity"] >= 7:
            warnings.append(f"Task {task_id} complexity >= 7: consider splitting; this is not a hard gate.")
    if not tasks:
        pending.append("No tasks have been generated.")
    if included - covered:
        pending.append(f"Uncovered included stories: {sorted(included - covered)}.")
    actual = {p.resolve() for p in contexts_dir.glob("*.md")} if contexts_dir.exists() else set()
    if actual - expected_contexts:
        errors.append("Unregistered context files: " + ", ".join(sorted(str(p) for p in actual - expected_contexts)))

    visited, active = set(), []

    def visit(task_id):
        if task_id in active:
            errors.append("Dependency cycle: " + " -> ".join(active[active.index(task_id):] + [task_id]))
            return
        if task_id in visited:
            return
        active.append(task_id)
        deps = by_id[task_id].get("dependencies", [])
        for dependency in deps if isinstance(deps, list) else []:
            if not isinstance(dependency, str) or dependency not in by_id:
                errors.append(f"Task {task_id} has unknown dependency: {dependency!r}.")
            else:
                visit(dependency)
        active.pop()
        visited.add(task_id)

    for task_id in by_id:
        visit(task_id)
    if pending and (not allow_incomplete or phase == "complete"):
        errors.extend(pending)
    return result("invalid" if errors else "incomplete" if pending else "valid")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("registry", type=Path)
    parser.add_argument("--allow-incomplete", action="store_true", help="Report a saved checkpoint as incomplete, never as valid")
    args = parser.parse_args()
    try:
        outcome = validate_plan(args.registry, allow_incomplete=args.allow_incomplete)
    except (OSError, UnicodeError, RecursionError) as exc:
        outcome = {"status": "invalid", "errors": [str(exc)], "pending": [], "warnings": []}
    print(json.dumps(outcome, ensure_ascii=False, indent=2))
    return {"valid": 0, "invalid": 1, "incomplete": 2}[outcome["status"]]


if __name__ == "__main__":
    raise SystemExit(main())
