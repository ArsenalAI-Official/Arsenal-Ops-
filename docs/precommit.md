# Pre-commit Hooks

## What is pre-commit?

Pre-commit is a framework that runs hooks (linters, formatters, secret detectors) on every commit **before** the code is staged. This catches common issues early — malformed YAML, trailing whitespace, accidentally-committed secrets, Python/JavaScript formatting — without waiting for CI to fail.

## Installation

Run this **once per clone** of the repository:

```bash
just precommit-install
```

(This runs `pre-commit install` under the hood and installs the `.pre-commit-config.yaml` hooks.)

## What hooks run?

- **ruff** (Python linter + formatter): checks style, import sorting, and applies formatting fixes
- **prettier** (JavaScript/TypeScript formatter): formats JS, TS, JSX, TSX, JSON, CSS, Markdown
- **detect-private-key**: prevents accidental commit of secrets (`.pem`, `.key`, AWS credentials, etc.)
- **trailing-whitespace**: removes spaces at line ends (except in Markdown, where trailing spaces are often intentional for line breaks)
- **end-of-file-fixer**: ensures files end with exactly one newline
- **check-yaml**: validates YAML syntax
- **check-json**: validates JSON syntax
- **check-merge-conflict**: detects merge conflict markers (leftover `<<<<<<<`, `=======`, `>>>>>>>`)
- **check-added-large-files**: blocks files larger than 500 KB (prevents accidental binary commits)
- **gitleaks**: scans for common secret patterns (API keys, tokens, etc.)

## Bypassing hooks (temporarily)

If a hook is blocking a commit and you're certain you need to proceed, you can skip the checks for that one commit:

```bash
git commit --no-verify
```

This disables **all** hooks. Use sparingly — usually the hook caught a real issue.

## Common workflow

```bash
# Edit files, stage them
git add src/pages/MyPage.tsx backend/routers/items.py

# Try to commit — pre-commit runs automatically
git commit -m "Add MyPage and items router"

# If hooks find issues, they auto-fix most (ruff formatting, prettier, etc.)
# Stage the fixes and commit again
git add .
git commit -m "Add MyPage and items router"
```

If a hook fails on something it can't auto-fix (e.g., a malformed YAML file), the error message will tell you what to fix.
