# Security Policy

Bricriu is pre-release personal software. No version currently receives a formal security-support commitment, and the project has not had an independent security audit.

## Reporting a vulnerability

If the GitHub repository has private vulnerability reporting enabled, use **Security → Report a vulnerability**. Do not post passwords, private notes, exploit details, personal vault paths, or decrypted `.h/` contents in a public issue.

If private reporting is not available, open a minimal public issue asking the maintainer to establish a private contact channel. Include no sensitive details until that channel exists.

Useful non-sensitive context includes the Bricriu version or commit, operating system, affected feature, and whether the issue reproduces with a synthetic disposable vault.

## Data-loss and disclosure warning

Keep an independent, versioned backup of every important vault. Bricriu writes directly to files, can rename and delete paths, can create Git branches and commits, and can install Git-hook integration for private notes. Autosave, checkpoints, sidecars, and encrypted archives are not backups.

Reproduce problems with fake data. Never attach a real vault, `private-vaults.json`, `.h/`, `.horig/`, `.h.zip`, Git history containing private data, screenshots of personal notes, or logs containing personal paths unless you have deliberately sanitized them.

## Security boundaries

- Ordinary note operations receive vault-relative paths. The Rust backend normalizes them, rejects traversal components, and resolves filesystem operations against the opened vault.
- **File → Open file** deliberately permits a supported file outside the vault and labels it accordingly. Vault-only features are disabled for that file.
- Markdown Preview escapes raw HTML. This reduces one obvious injection path but is not a complete application-security guarantee.
- The current Tauri configuration has no Content Security Policy (`csp` is `null`). Treat hardening the CSP as release work.
- External links are handed to the operating system. Opening one leaves Bricriu's local trust boundary.
- Embedded Typst compilation enables package resolution and system fonts. A Typst document that imports packages may cause package retrieval or consume untrusted compiler input; do not compile untrusted Typst documents.
- Search, preview, spellcheck, Track Changes, Canvas, and Calendar process note content locally, but operating-system services, the WebView, Git, Pandoc, Typst, backups, indexing, crash reporting, or other installed tools may retain their own copies or metadata.

## Experimental private notes

The `.h/` feature is designed to keep an encrypted AES-256 ZIP in Git while retaining plaintext working directories during use. It is not full-disk encryption and has not been security-audited.

- Passwords are plaintext in the local, Git-ignored `private-vaults.json` file.
- `.h/` and `.horig/` are plaintext, as can be editor memory, filesystem caches, swap, backups, and search/indexing performed by other software.
- ZIP entry names are visible without the password.
- Password strength determines resistance to offline guessing.
- Lost passwords cannot be recovered.
- `.git/info/exclude` is local configuration, not a guarantee that another command or program cannot stage plaintext.
- Git hooks can be bypassed with `--no-verify`, replaced, misconfigured, or skipped through a custom `core.hooksPath`.
- A crash or partial filesystem failure can interrupt archive/baseline synchronization.

Test archive creation, reopening, password failure, plaintext exclusion, and restoration with synthetic data. Inspect staged content before every push. Do not entrust the feature with data whose disclosure or loss would be unacceptable.

## Dependencies

The app embeds a large Tauri, WebView, JavaScript, Rust, and Typst dependency graph. Run `npm run notices` after dependency changes and review [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Release maintainers should also run current vulnerability and license-audit tooling and review its output rather than treating the inventory as a security scan.

## Supported versions

Until a stable release and security-maintenance policy exist, only the current default branch is eligible for best-effort fixes. Old commits, local builds, forks, and generated binaries are unsupported.
