# Git Notes

## Orphan Branch Cleanup Caution

`git switch --orphan <branch>` creates a new branch with no parent commit. It is useful when you want a clean one-commit history, but it does not preserve the normal tracked-file/history relationship from the old branch.

Do not assume `.gitignore` and the intended app files are safely present before running `git add -A`. If `.gitignore` is missing, `git add -A` can stage generated folders such as `node_modules/`, `dist/`, or `src-tauri/target/`.

Safer pattern when creating an orphan branch that should match `main` except for one removed folder:

```powershell
git switch --orphan clean-main
git checkout main -- . ':!zennotes'
git status --short
git ls-files | Select-String -Pattern 'node_modules|dist/|target|zennotes'
git commit -m "Initial commit"
```

The key step is:

```powershell
git checkout main -- . ':!zennotes'
```

That explicitly restores the tracked files from `main`, including `.gitignore`, while excluding `zennotes/`.

Before force-pushing an orphan replacement, compare against a backup branch:

```powershell
git diff --cached --name-status backup -- . ':!zennotes'
git diff --cached --name-status backup -- zennotes
```

The first command should print nothing. The second should show only deleted files under the folder intentionally removed.

Prefer `git filter-repo --path zennotes/ --invert-paths` when you want to preserve commit history while removing one path from every commit.
