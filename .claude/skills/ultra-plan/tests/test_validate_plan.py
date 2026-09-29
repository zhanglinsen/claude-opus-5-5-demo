"""Behavioral artifact checks; these do not simulate an LLM research run."""
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "validate_plan.py"
spec = importlib.util.spec_from_file_location("validate_plan", SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class PlanValidationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        (self.root / ".ultra/specs").mkdir(parents=True)
        self.tasks = self.root / ".ultra/tasks/tasks.json"
        (self.tasks.parent / "contexts").mkdir(parents=True)
        self.write_spec("product.md", '<a id="US-01"></a>\n## First story\nGiven X, when Y, then Z.\n<a id="US-02"></a>\n## Deferred story\nGiven A, when B, then C.\n')
        self.data = {
            "schema_version": "1.0.0",
            "planning": {
                "phase": "complete", "scope_mode": "SELECTIVE",
                "included_story_ids": ["US-01"], "excluded_story_ids": ["US-02"],
                "story_refs": {"US-01": ".ultra/specs/product.md#US-01", "US-02": ".ultra/specs/product.md#US-02"},
                "required_spec_refs": [".ultra/specs/product.md#US-01"], "gaps": [],
            },
            "tasks": [self.task("1", "US-01")],
        }
        self.context("1")

    def write_spec(self, name, body):
        (self.root / ".ultra/specs" / name).write_text(body, encoding="utf-8")

    def context(self, task_id):
        (self.tasks.parent / "contexts" / f"task-{task_id}.md").write_text(f"# Task {task_id}\n\n## Acceptance\nObservable result.\n", encoding="utf-8")

    @staticmethod
    def task(task_id, story_id):
        return {"id": task_id, "title": "Deliver observable result", "status": "pending", "complexity": 4,
                "dependencies": [], "story_ids": [story_id], "context_file": f"contexts/task-{task_id}.md",
                "trace_to": f".ultra/specs/product.md#{story_id}"}

    def validate(self, **kwargs):
        self.tasks.write_text(json.dumps(self.data), encoding="utf-8")
        return module.validate_plan(self.tasks, **kwargs)

    def test_feature_only_requires_no_architecture_or_discovery(self):
        self.assertEqual("valid", self.validate()["status"])

    def test_full_uses_all_declared_required_sections(self):
        for name in ["discovery", "architecture"]:
            self.write_spec(f"{name}.md", '<a id="scope"></a>\n## Scope\nEvidence.\n')
            self.data["planning"]["required_spec_refs"].append(f".ultra/specs/{name}.md#scope")
        self.assertEqual("valid", self.validate()["status"])
        (self.root / ".ultra/specs/architecture.md").unlink()
        self.assertEqual("invalid", self.validate()["status"])

    def test_accepted_gap_and_not_applicable_are_explicit(self):
        self.data["planning"]["gaps"] = [
            {"id": "G1", "status": "accepted", "reason": "Baseline will be measured", "decision_ref": "user message 2026-09-08", "follow_up": "Measure before rollout"},
            {"id": "G2", "status": "not_applicable", "reason": "CLI has no hosting"},
        ]
        self.assertEqual("valid", self.validate()["status"])
        del self.data["planning"]["gaps"][0]["decision_ref"]
        self.assertEqual("invalid", self.validate()["status"])

    def test_blocker_is_not_accepted_implicitly(self):
        self.data["planning"]["gaps"] = [{"id": "G1", "status": "blocker", "reason": "Undefined required behavior"}]
        self.assertEqual("invalid", self.validate()["status"])

    def test_reduce_does_not_reintroduce_excluded_story(self):
        self.data["planning"]["scope_mode"] = "REDUCE"
        self.assertEqual("valid", self.validate()["status"])
        self.data["tasks"].append(self.task("2", "US-02"))
        self.context("2")
        self.assertEqual("invalid", self.validate()["status"])

    def test_story_must_exist_even_if_a_task_claims_coverage(self):
        self.data["planning"]["story_refs"]["US-01"] = ".ultra/specs/product.md#missing"
        self.assertEqual("invalid", self.validate()["status"])

    def test_included_story_cannot_be_uncovered(self):
        self.data["planning"]["included_story_ids"].append("US-02")
        self.data["planning"]["excluded_story_ids"] = []
        self.assertEqual("invalid", self.validate()["status"])

    def test_resume_preserves_partial_registry_but_is_not_complete(self):
        self.data["planning"]["phase"] = "save"
        (self.tasks.parent / "contexts/task-1.md").unlink()
        self.assertEqual("incomplete", self.validate(allow_incomplete=True)["status"])
        self.assertEqual("invalid", self.validate()["status"])
        self.context("1")
        self.data["planning"]["phase"] = "complete"
        self.assertEqual("valid", self.validate()["status"])

    def test_equal_counts_do_not_hide_wrong_context_identity(self):
        (self.tasks.parent / "contexts/task-1.md").rename(self.tasks.parent / "contexts/task-9.md")
        self.assertEqual("invalid", self.validate()["status"])

    def test_context_cannot_escape_directory(self):
        self.data["tasks"][0]["context_file"] = "../specs/product.md"
        self.assertEqual("invalid", self.validate()["status"])

    def test_resolved_context_outside_directory_is_not_read(self):
        original_resolve, original_read = Path.resolve, Path.read_text
        outside = self.root / "outside.md"
        outside.write_text("Private content", encoding="utf-8")
        expected = self.tasks.parent / "contexts/task-1.md"

        def resolve(path, *args, **kwargs):
            return outside if path == expected else original_resolve(path, *args, **kwargs)

        def read(path, *args, **kwargs):
            if path == outside:
                self.fail("Out-of-scope resolved context was read")
            return original_read(path, *args, **kwargs)

        with patch.object(Path, "resolve", resolve), patch.object(Path, "read_text", read):
            self.assertEqual("invalid", self.validate()["status"])

    def test_resolved_context_directory_outside_project_is_rejected(self):
        original_resolve = Path.resolve
        expected = self.tasks.parent / "contexts"
        outside = self.root / "outside"

        def resolve(path, *args, **kwargs):
            return outside if path == expected else original_resolve(path, *args, **kwargs)

        with patch.object(Path, "resolve", resolve):
            outcome = self.validate()
        self.assertEqual("invalid", outcome["status"])
        self.assertTrue(any("contexts directory" in error for error in outcome["errors"]))

    def test_malformed_enum_types_return_invalid_instead_of_crashing(self):
        for field in ["phase", "scope_mode"]:
            old = self.data["planning"][field]
            for value in [[], {}]:
                with self.subTest(field=field, value=value):
                    self.data["planning"][field] = value
                    self.assertEqual("invalid", self.validate()["status"])
            self.data["planning"][field] = old
        for value in [[], {}]:
            self.data["tasks"][0]["status"] = value
            self.assertEqual("invalid", self.validate()["status"])

    def test_cycle_and_unknown_dependency_fail(self):
        self.data["tasks"][0]["dependencies"] = ["unknown"]
        self.assertEqual("invalid", self.validate()["status"])
        self.data["tasks"][0]["dependencies"] = ["1"]
        self.assertEqual("invalid", self.validate()["status"])

    def test_duplicate_ids_fail(self):
        self.data["tasks"].append(self.task("1", "US-01"))
        self.assertEqual("invalid", self.validate()["status"])

    def test_legacy_registry_is_not_silently_migrated(self):
        del self.data["schema_version"]
        self.assertEqual("invalid", self.validate()["status"])

    def test_empty_or_malformed_json_fails(self):
        self.tasks.write_text("{", encoding="utf-8")
        self.assertEqual("invalid", module.validate_plan(self.tasks)["status"])

    def test_cli_exit_codes_distinguish_valid_invalid_and_checkpoint(self):
        self.validate()
        command = [sys.executable, "-B", str(SCRIPT), str(self.tasks)]
        run = subprocess.run(command, capture_output=True, text=True)
        self.assertEqual(0, run.returncode, run.stdout + run.stderr)
        self.data["planning"]["phase"] = "save"
        self.validate()
        run = subprocess.run(command + ["--allow-incomplete"], capture_output=True, text=True)
        self.assertEqual(2, run.returncode, run.stdout + run.stderr)
        self.assertEqual("incomplete", json.loads(run.stdout)["status"])
        self.tasks.write_text("{}", encoding="utf-8")
        run = subprocess.run(command, capture_output=True, text=True)
        self.assertEqual(1, run.returncode, run.stdout + run.stderr)
        self.assertIn("schema_version", json.loads(run.stdout)["errors"][0])


if __name__ == "__main__":
    unittest.main()
