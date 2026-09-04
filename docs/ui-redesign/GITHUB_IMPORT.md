# Registering the Backlog on GitHub

**No GitHub issues were created by this package.** RUI identifiers are stable planning IDs. The default import is **38 launch issues**; the 4 deferred issues are opt-in. This guide uses official GitHub CLI issue/API commands. [S20](https://cli.github.com/manual/gh_issue_create) [S21](https://cli.github.com/manual/gh_api)

## 1. Publish the documentation first

Copy the extracted package contents into a documentation directory such as `docs/ui-redesign/` in `ther12k/robocon`. Include `assets/reference-dashboard.png` and the issue bodies. Follow the repository's ordinary branch/PR/review policy; do not bypass branch protection.

Once the documentation is pushed, record the full commit SHA containing those exact files. This is the **documentation publication SHA**, not the planning baseline `f5092ff` unless the package truly exists there. The helper checks that published PRD and task index bytes match the local pack before creating issues.

Do not post issue bodies containing unresolved relative links such as `../PRD.md`: GitHub issue pages do not resolve those as repository file paths. Replace them with immutable blob URLs, or use the helper below.

## 2. Review and import manually

Each `issues/RUI-*.md` is a complete issue body. Use its H1 as the issue title, apply its suggested labels/milestone, and keep the hidden stable marker. Replace dependency planning IDs with the actual issue numbers after registration. A manual creation command is:

```bash
gh issue create --repo ther12k/robocon \
  --title "[RUI-001] Pin the implementation baseline and publish reference evidence" \
  --body-file /path/to/RUI-001-with-absolute-links.md
```

Create milestones using [Epics](EPICS.md), then register issues in the order in [Task Index](TASK_INDEX.md). Proposed labels are `project:robocon-light-ui`, `type:*`, `area:*`, `priority:*` and `scope:launch`/`scope:deferred`. Existing labels do not have to be recolored or replaced.

## 3. Optional bulk registration helper

The code block below is intentionally embedded in Markdown so all written deliverables remain `.md`. Save just that block as `import_ui_issues.py` in a working directory. It requires Python **3.10+** and an authenticated GitHub CLI with permission to create issues, labels and milestones on the selected repository. It never reads or prints authentication tokens.

Dry run is the default and does not invoke GitHub:

```bash
python import_ui_issues.py --root /path/to/robocon-light-ui-implementation
```

Publish the documentation first. Then set `DOCS_SHA` to its actual full commit and explicitly authorize writes:

```bash
export DOCS_SHA="$(git rev-parse HEAD)"  # run in the checkout containing the pushed docs commit
python import_ui_issues.py \
  --root /path/to/robocon-light-ui-implementation \
  --repo ther12k/robocon \
  --docs-path docs/ui-redesign \
  --docs-sha "$DOCS_SHA" \
  --apply
```

The helper creates missing labels/milestones only, converts local documentation links to immutable repository URLs, substitutes dependency references, and records actual issue numbers in `REGISTRATION_RESULTS.md`. It scans open **and closed** issues for `<!-- robocon-light-ui:RUI-... -->` to avoid duplicates. It does not overwrite existing issue bodies, reopen issues, change source files or deploy anything. It does not configure GitHub Projects or native dependency relationships; dependency links are in issue bodies.

Run only one importer at a time. The operation is **not transactional**: a rate limit, permission error or network failure can occur after some issues are created. Rerun serially to recover by stable markers. Duplicate markers, stale published docs and closed target milestones for new issues cause an explicit stop. Edited existing issues are deliberately not overwritten; update them by review rather than silently treating a new body as equivalent.

To opt into the 4 future-capability issues, add `--include-deferred` after reviewing their scope. They are not release blockers for the light UI.

## 4. Helper source

```python
#!/usr/bin/env python3
"""Register the Markdown issue pack using gh. Read-only dry run is the default."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import posixpath
import re
import subprocess
import sys
import tempfile
from urllib.parse import quote

MARKER = re.compile(r"<!-- robocon-light-ui:(RUI-\d{3}) -->")
REPO_NAME = re.compile(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+\Z")


def gh(*args: str) -> str:
    result = subprocess.run(
        ["gh", *args], text=True, capture_output=True, check=False,
        env={**os.environ, "GH_PROMPT_DISABLED": "1"},
    )
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or "GitHub CLI command failed")
    return result.stdout.strip()


def api(endpoint: str, **fields: str) -> object:
    args = ["api", "--hostname", "github.com", endpoint]
    if fields:
        args += ["--method", "POST"]
        for key, value in fields.items():
            args += ["-f", f"{key}={value}"]
    return json.loads(gh(*args))


def pages(endpoint: str) -> list[dict]:
    collected: list[dict] = []
    separator = "&" if "?" in endpoint else "?"
    page = 1
    while True:
        batch = api(f"{endpoint}{separator}per_page=100&page={page}")
        if not isinstance(batch, list):
            raise RuntimeError(f"Expected an API list: {endpoint}")
        collected.extend(batch)
        if len(batch) < 100:
            return collected
        page += 1


def metadata(text: str, key: str) -> str:
    match = re.search(rf"^\*\*{re.escape(key)}:\*\* (.+)$", text, re.M)
    if not match:
        raise ValueError(f"Missing issue metadata: {key}")
    return match.group(1).strip()


def read_pack(root: Path, include_deferred: bool) -> list[dict]:
    records: list[dict] = []
    for path in sorted((root / "issues").glob("RUI-*.md")):
        text = path.read_text(encoding="utf-8")
        marker = MARKER.search(text)
        title = re.search(r"^# (.+)$", text, re.M)
        if not marker or not title:
            raise ValueError(f"Missing stable marker or title in {path}")
        scope = metadata(text, "Scope").strip("`")
        if scope not in {"launch", "deferred"}:
            raise ValueError(f"Invalid scope in {path}")
        if scope == "deferred" and not include_deferred:
            continue
        records.append({
            "id": marker.group(1), "title": title.group(1),
            "body": text, "path": path, "scope": scope,
            "labels": re.findall(r"`([^`]+)`", metadata(text, "Labels")),
            "milestone": metadata(text, "Milestone").strip("`"),
            "deps": re.findall(r"RUI-\d{3}", metadata(text, "Depends on")),
        })
    if not records:
        raise ValueError("No issue files found. --root must name the extracted package.")
    seen: set[str] = set()
    for record in records:
        if record["id"] in seen:
            raise ValueError(f"Duplicate issue ID: {record['id']}")
        unknown = set(record["deps"]) - seen
        if unknown:
            raise ValueError(f"Missing or out-of-order dependencies: {unknown}")
        seen.add(record["id"])
    return records


def render_body(record: dict, repo: str, sha: str, docs_path: str,
                mapping: dict[str, int]) -> str:
    prefix = f"https://github.com/{repo}/blob/{sha}"

    def replace_link(match: re.Match) -> str:
        target = match.group(1)
        if re.match(r"(?:[A-Za-z][A-Za-z0-9+.-]*:|#)", target):
            return match.group(0)
        path, separator, fragment = target.partition("#")
        resolved = posixpath.normpath(posixpath.join(docs_path, "issues", path))
        if not (resolved == docs_path or resolved.startswith(docs_path + "/")):
            raise ValueError(f"Relative link escapes the published pack: {target}")
        url = f"{prefix}/{quote(resolved, safe='/')}"
        if separator:
            url += "#" + fragment
        return "](" + url + ")"

    body = re.sub(r"\]\(([^)]+)\)", replace_link, record["body"])
    if record["deps"]:
        deps = ", ".join(f"#{mapping[dep]} (`{dep}`)" for dep in record["deps"])
        body = re.sub(r"^\*\*Depends on:\*\* .+$",
                      f"**Depends on:** {deps}", body, flags=re.M)
    return body


def verify_published(root: Path, repo: str, sha: str, docs_path: str) -> None:
    # Compare two sentinel files to prevent registration against unpublished/stale docs.
    for relative in ("PRD.md", "TASK_INDEX.md"):
        raw = (root / relative).read_bytes()
        expected = hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest()
        remote = api(f"repos/{repo}/contents/{quote(docs_path + '/' + relative, safe='/')}?ref={sha}")
        if not isinstance(remote, dict) or remote.get("sha") != expected:
            raise RuntimeError(f"Published {relative} differs from the local pack at --docs-sha.")


def write_mapping(path: Path, repo: str, sha: str, mapping: dict[str, int]) -> None:
    rows = ["# GitHub Registration Results", "", f"Repository: `{repo}`", "",
            f"Published documentation SHA: `{sha}`", "",
            "These are real results from this helper, not preassigned issue numbers.", "",
            "| Planning ID | GitHub issue |", "|---|---|"]
    rows += [f"| {key} | [#{value}](https://github.com/{repo}/issues/{value}) |"
             for key, value in sorted(mapping.items())]
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text("\n".join(rows) + "\n", encoding="utf-8")
    temporary.replace(path)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--repo", default="ther12k/robocon")
    parser.add_argument("--docs-sha", help="Full commit SHA containing the published pack")
    parser.add_argument("--docs-path", default="docs/ui-redesign")
    parser.add_argument("--include-deferred", action="store_true")
    parser.add_argument("--apply", action="store_true", help="Create missing issues/labels/milestones")
    args = parser.parse_args(argv)
    if not REPO_NAME.fullmatch(args.repo):
        parser.error("--repo must be owner/repository on github.com")
    docs_path = posixpath.normpath(args.docs_path.strip("/"))
    if docs_path in {"", ".", ".."} or docs_path.startswith("../"):
        parser.error("--docs-path must be a relative documentation directory")
    records = read_pack(args.root.resolve(), args.include_deferred)
    if not args.apply:
        print(f"DRY RUN: {len(records)} issue bodies; no GitHub reads or writes.")
        for item in records:
            print(f"{item['title']} | {item['milestone']} | {item['scope']}")
        print("Review the plan, publish its docs, then use --apply with --docs-sha.")
        return 0
    if not args.docs_sha or not re.fullmatch(r"[0-9a-fA-F]{40}", args.docs_sha):
        parser.error("--apply requires a full 40-character --docs-sha")
    sha = args.docs_sha.lower()
    gh("auth", "status", "--hostname", "github.com")
    verify_published(args.root, args.repo, sha, docs_path)
    existing = pages(f"repos/{args.repo}/issues?state=all")
    mapping: dict[str, int] = {}
    for issue in existing:
        if "pull_request" in issue:
            continue
        ids = set(MARKER.findall(issue.get("body") or ""))
        for identifier in ids:
            if identifier in mapping:
                raise RuntimeError(f"Multiple existing issues contain {identifier}; reconcile manually.")
            mapping[identifier] = issue["number"]
    pending = [x for x in records if x["id"] not in mapping]
    milestones = {x["title"]: x for x in pages(f"repos/{args.repo}/milestones?state=all")}
    for title in sorted({x["milestone"] for x in pending}):
        if title in milestones and milestones[title]["state"] != "open":
            raise RuntimeError(f"Milestone is closed: {title}. Resolve manually before import.")
    labels = {x["name"] for x in pages(f"repos/{args.repo}/labels")}
    for name in sorted({label for x in pending for label in x["labels"]} - labels):
        api(f"repos/{args.repo}/labels", name=name, color="246BFD",
            description="Robocon light-dashboard implementation planning")
    for title in sorted({x["milestone"] for x in pending} - milestones.keys()):
        api(f"repos/{args.repo}/milestones", title=title,
            description="Proposed milestone from the Robocon light UI implementation pack")
    output = args.root / "REGISTRATION_RESULTS.md"
    for item in records:
        if item["id"] in mapping:
            print(f"SKIP {item['id']}: existing #{mapping[item['id']]}")
            continue
        body = render_body(item, args.repo, sha, docs_path, mapping)
        fd, temporary = tempfile.mkstemp(suffix=".md")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                handle.write(body)
            command = ["issue", "create", "--repo", args.repo,
                       "--title", item["title"], "--body-file", temporary,
                       "--milestone", item["milestone"]]
            for label in item["labels"]:
                command += ["--label", label]
            result = gh(*command)
            match = re.search(r"/issues/(\d+)", result)
            if not match:
                raise RuntimeError("Issue may have been created but no URL was returned; rerun to recover by marker.")
            mapping[item["id"]] = int(match.group(1))
            write_mapping(output, args.repo, sha, mapping)
            print(f"CREATED {item['id']}: {result}")
        finally:
            Path(temporary).unlink(missing_ok=True)
    write_mapping(output, args.repo, sha, mapping)
    print(f"Saved registration mapping: {output}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, RuntimeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
```

## 5. After registration

Commit or otherwise preserve the generated registration map as real planning evidence. Link real issue numbers in implementation PRs, retain RUI IDs for traceability, and do not mark implementation tasks complete merely because registration succeeded. The final release uses RUI-038 and [Release Gates](RELEASE_GATES.md).

The helper can be checked offline with dry runs and rendering tests. Live GitHub creation must be reviewed and executed by an authorized maintainer; no live registration is claimed here.
