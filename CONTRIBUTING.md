# Contributing

Thanks for considering a contribution. Bricriu is a small, pre-release, Markdown-first Tauri app. Focused bug reports, tests, documentation improvements, and narrowly scoped fixes are the most useful contributions at this stage.

By submitting a contribution, you represent that you have the right to submit it and agree that it is licensed under the project's [GNU Affero General Public License, version 3 or later](LICENSE) (`AGPL-3.0-or-later`). Third-party material must retain its own notices and use a license compatible with the project.

## Before reporting a problem

- Reproduce it with a disposable vault containing synthetic notes.
- Search existing issues when the repository is published.
- Record the commit or version, operating system, steps, expected result, and actual result.
- Remove usernames, absolute vault paths, note contents, branch names, remotes, and other identifying information from screenshots and logs.
- Never publish passwords, `private-vaults.json`, `.h/`, `.horig/`, real `.h.zip` archives, or sensitive Git history.

Security issues belong in the private process described in [SECURITY.md](SECURITY.md), not a public bug report.

## Development setup

Follow [install.md](install.md), then run:

```sh
npm ci
npm run tauri:dev
```

Before submitting a change, run the checks relevant to it:

```sh
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
```

The first Rust build is heavy. A large Vite chunk warning is currently expected because the editor dependencies are bundled with the frontend.

## Project boundaries

- Keep frontend/backend paths vault-relative unless the operation is explicitly the outside-vault file workflow.
- Resolve and validate backend paths beneath the vault root before filesystem operations.
- Prefer Rust for filesystem, search, watcher, Git, encryption, and compilation behavior.
- Prefer TypeScript/React for interface and editor behavior.
- Keep the Markdown workflow dependable before expanding experimental features.
- Do not add Electron dependencies or replace the Tauri/Rust architecture without an explicitly approved architectural change.
- Do not copy third-party source code into the project without reviewing licence compatibility and preserving all required notices.
- Avoid proprietary storage for ordinary notes; saved Markdown should remain useful in other editors.
- Add tests for path safety, data conversion, and destructive behavior where practical.

## Pull requests

Keep a pull request small enough to review. Explain:

- the user-visible problem and intended behavior;
- data-loss, privacy, path-safety, and compatibility implications;
- how it was tested and on which operating system;
- any generated or vault-internal files it adds;
- screenshots made only from a synthetic demo vault, when the interface changes.

Do not combine broad formatting, dependency updates, and functional work without a compelling reason. Preserve unrelated worktree changes.

If dependencies change, commit the relevant lockfile, run `npm run notices`, review the resulting inventory, and call out new license or security implications. Generated inventory is not a substitute for a proper release license audit.

## Documentation style

Be candid about maturity and platform coverage. Use **experimental** or **untested** where warranted. Do not describe a compiled artifact as supported until it has been installed and exercised on that platform.
