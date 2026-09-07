# Development TODO

## Markdown preview dependency follow-up

- [ ] Re-evaluate upgrading KaTeX from `0.18.4` to `0.18.5`.

Current known-good preview stack:

- `markdown-it` `15.0.1`
- `@mdit/plugin-katex` `1.1.0`
- `katex` `0.18.4`
- Build runtime: Node.js `22.14.0`, selected locally by `build-exe.bat` without changing the user's active NVM version

The KaTeX plugin is already on the Markdown-it 15-compatible release: plugin `1.1.0` declares `markdown-it ^15.0.0`. It also declares `katex ^0.18.4`, so KaTeX `0.18.5` is semver-compatible; the current `0.18.4` pin is a conservative baseline rather than a plugin or Markdown-it restriction.

KaTeX `0.18.5` pulls Commander 15 for its command-line utility. That raises the effective build-tool requirement to Node.js `22.12.0` or newer. Bricriu's isolated build runtime (`22.14.0`) satisfies that requirement, but `package.json`, `README.md`, and `install.md` should be updated from Node `>=22` to `>=22.12.0` if the upgrade is adopted.

Before adopting the upgrade:

1. Update and lock KaTeX, then confirm the resolved Commander version and dependency tree.
2. Regenerate `THIRD_PARTY_NOTICES.md`.
3. Run the TypeScript and Vite production build under the isolated Node runtime.
4. Run math-preview regression cases for dollar, bracket, and fenced delimiters; inline/fenced code; currency; malformed `$$` blocks; and bare-domain linkification.
5. Recheck `open_psychophysics_sdt_pre_miyoshi_technical.md` from Downloads: expected baseline is 88 rendered expressions, 15 display blocks, and zero KaTeX errors.
6. Run `build-exe.bat` and confirm the parent terminal's active Node version remains unchanged.
