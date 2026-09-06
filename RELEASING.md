# Release Checklist

This project is not ready to publish merely because it builds. Use this checklist for the first GitHub release and adapt it as the release process matures.

## Legal and repository hygiene

- [ ] Choose an open-source license and add the complete `LICENSE` file. Update README and contribution language to match.
- [ ] Confirm that vendored sources may be redistributed and retain all required license and NOTICE files.
- [ ] Run `npm run notices`, review the diff, and perform a real dependency-license audit for source and binary distribution.
- [ ] Run current JavaScript and Rust vulnerability audits and assess every finding.
- [ ] Audit the entire Git history—not only the current checkout—for passwords, tokens, private notes, personal paths, archives, binaries, and large generated files.
- [ ] Confirm `private-vaults.json`, real vault data, `.h/`, `.horig/`, build output, and reference-only local repositories are not tracked.
- [ ] Decide whether a Code of Conduct, issue templates, and a contributor license policy are appropriate before accepting contributions.

## Product identity and documentation

- [ ] Replace the generated placeholder icon with owned or correctly licensed Windows, macOS, and Linux assets.
- [ ] Review `productName`, bundle identifier, version, authorship, repository URLs, and package metadata.
- [ ] Create a synthetic demo vault and capture `docs/images/bricriu.png` with no personal notes, usernames, paths, remotes, or secrets. Uncomment the prepared README image line.
- [ ] Re-read README, install guide, user guide, security policy, and experimental warnings against the exact release commit.
- [ ] Add release notes or a changelog describing known data risks, supported platforms, migrations, and breaking behavior.

## Verification

- [ ] Run `npm ci` from a clean checkout.
- [ ] Run `npm run build`.
- [ ] Run `cargo check --manifest-path src-tauri/Cargo.toml`.
- [ ] Run `cargo test --manifest-path src-tauri/Cargo.toml`.
- [ ] Test a production build with a disposable vault containing representative Markdown syntax.
- [ ] Test create, manual save, autosave, conflict handling, rename, delete, search, external changes, close/reopen, and recovery from backup.
- [ ] Separately test every experimental feature claimed in the release notes.
- [ ] Test Git behavior in clean, dirty, nested, detached, non-Git, hook-customized, and Git-unavailable cases before advertising it.
- [ ] Test private-note creation, archive update, wrong password, crash recovery, clone/restore, hooks, and inspection of staged files using synthetic secrets only.

## Platform packaging

- [ ] Build each platform on that platform or a documented, trusted platform-native CI runner.
- [ ] Install, upgrade, launch, edit, and uninstall on clean supported machines—not only development machines.
- [ ] Add code signing/notarization where appropriate and document any remaining operating-system warnings.
- [ ] Verify package icons, identifiers, permissions, WebView/runtime prerequisites, and artifact architecture.
- [ ] Generate checksums and retain build provenance for published artifacts.
- [ ] Label macOS and Linux artifacts **untested** unless they have actually completed the release test matrix.

## Publish

- [ ] Tag the exact audited commit with the matching semantic version.
- [ ] Attach only verified artifacts and checksums to the repository's Releases page.
- [ ] State the tested OS versions and architectures, known issues, optional-tool requirements, and absence of warranty.
- [ ] After publishing, download the public artifacts and repeat a smoke test to catch upload or packaging mistakes.
