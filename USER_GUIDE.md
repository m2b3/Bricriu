# Bricriu User Guide

> [!CAUTION]
> Use a disposable test vault first. Keep important notes in an independent versioned backup and commit them regularly if the vault uses Git. File deletion, autosave, Git automation, and private-note encryption can all change data on disk.

The ordinary Markdown editor is the only workflow with approximately six months of single-user testing. Every feature explicitly marked **experimental** below, plus all macOS and Linux behavior, has much less assurance.

## Open a vault

A vault is an ordinary folder containing notes. Enter its path and select **Open**. To choose a folder with the system folder picker instead, leave the path field blank and select **Open**. Bricriu recursively shows supported files beneath that folder:

- `.md` and `.markdown` — the primary, somewhat-tested path;
- `.typ` — experimental Typst support.

Hidden folders are normally omitted. Search can reveal that a matching note exists under a hidden folder, after which the interface can explicitly reveal that folder. The special private `.h/` folder has separate behavior described below.

**File → Open file** can open a supported individual file outside the current vault. The app labels it **Outside vault** and disables vault-only behavior such as checkpoints, backlinks, and private-vault handling for that file.

## Files and folders

- **New note** creates a Markdown file by default. Supplying `.typ` creates an experimental Typst document.
- **New folder** creates a folder within the vault.
- Tree-row actions pin, open in Track mode, rename, or delete a note; folder rows can be renamed or deleted.
- Pinned notes remain near the top of the sidebar.
- The file tree and backend guard vault-relative operations against `..` path traversal.

Treat delete as permanent unless you have independently confirmed recovery through Git, backups, or operating-system facilities. Test rename and delete behavior on copied files before using it on a real vault.

## Tabs, panes, and recent files

- Open notes appear in tabs; a modified marker identifies dirty tabs.
- **Split** opens a resizable second editor pane. **Move right** moves the main tab into it.
- `Ctrl+W` / `Cmd+W` closes the focused split pane or current tab.
- Switch main tabs with `Ctrl+Tab`, `Ctrl+Shift+Tab`, `Ctrl+PageUp`, `Ctrl+PageDown`, `Ctrl+[`, or `Ctrl+]` (use `Cmd` where the platform maps it).
- **File → Recent** reopens recently closed files. **Persist recent files** controls whether that history survives an app restart.

## Editing Markdown

The Text view is a CodeMirror 6 source editor. Markdown remains visible and the saved file stays plain text.

- Save with **Save** or `Ctrl+S` / `Cmd+S`.
- Create a note with `Ctrl+N` / `Cmd+N`.
- Open a file with `Ctrl+O` / `Cmd+O`.
- Undo/redo uses CodeMirror history and remains available while the tab is open.
- **Count** reports words and characters for the selection or full document.
- **Bullets** and **Numbers** turn selected lines into Markdown lists.
- `Ctrl+L` / `Cmd+L` toggles Markdown links around URLs in the selection.
- Canadian-English spellcheck underlines unknown words and offers suggestions or a personal dictionary entry.

Saving uses the file's last-known modification information to detect likely external conflicts. A conflict is shown for review rather than silently replacing the newer disk version. This protection is useful but should not be treated as infallible backup or merge logic.

## Autosave and external changes

Dirty notes autosave after a configurable delay; the default is five seconds. Autosave writes directly to disk but does not clear the editor's in-memory undo history.

The vault watcher refreshes the tree and marks open notes changed or deleted when another program modifies them. Review these warnings carefully. Concurrent editing from two programs remains a risk even with conflict checks.

On close, Bricriu asks about dirty tabs, attempts to save them, and—when applicable—attempts a Git checkpoint before exiting. Do not assume a successful window close is an independent backup.

## Search

The sidebar has two separate searches:

- **File name** filters visible paths in the current tree.
- **Content** scans supported note text in the current vault.
- **Search filtered files only** limits content search to files currently matching the path filter.

Content search is deliberately non-indexed and is limited to a bounded result set. Clicking a result opens the note at the matching text and highlights visible occurrences.

## Wiki links and backlinks

Supported Obsidian-style wiki-link forms include:

```md
[[Project Ideas]]
[[folder/Project Ideas]]
[[Project Ideas|custom label]]
[[Project Ideas#section]]
```

- Wiki links are highlighted in the Markdown editor.
- `Ctrl+click` opens a matching note.
- `Ctrl+Enter` opens the wiki link under the cursor.
- Typing `[[` plus part of a filename offers note-name completion.
- Wiki links in Preview are clickable.
- **View → Backlinks** lists Markdown notes that wiki-link to the current note.

Missing wiki-link targets are not created automatically. Backlinks detect wiki links, not ordinary Markdown links.

## Callouts and math

Common callout types are highlighted and rendered in Preview:

```md
> [!NOTE]
> This is a note.

> [!WARNING]
> This is important.
```

KaTeX renders common inline and block math:

```md
Inline: $x^2 + y^2 = z^2$

$$
E = mc^2
$$
```

KaTeX is not a complete TeX distribution and does not support every LaTeX package or construct.

## Preview, print, and PDF

Use **View → Preview** to toggle the resizable rendered pane. It renders Markdown, wiki links, callouts, and KaTeX math. Raw HTML from notes is escaped rather than executed.

- **File → Print preview / PDF** prints the rendered preview through the system print dialog, which may offer a save-to-PDF destination.
- `Ctrl+P` / `Cmd+P` prints Preview; add `Shift` to print raw Markdown.
- **File → Export PDF** on a Markdown file invokes Pandoc with Typst as the PDF engine. Both `pandoc` and `typst` must be installed and available on `PATH`.

Always inspect an exported document before relying on it; print and PDF behavior varies by platform and is experimental.

## Git checkpoints (experimental)

If the vault is inside a Git worktree and Git is available, Bricriu uses an `inuse` branch for active editing.

On open:

- If already on `inuse`, the app remains there.
- If the worktree is clean and `inuse` exists, it switches to that branch.
- If the worktree is clean and `inuse` does not exist, it creates the branch.
- If another branch is dirty, the app asks before checkpointing and switching.

Autosave writes files; checkpoints are separate Git commits. A manual **Checkpoint** action is available, and the default periodic interval is three minutes when touched files exist. Close handling also attempts to save and checkpoint.

> [!WARNING]
> The app can switch branches, stage paths, install or modify hooks for private notes, and create commits. Inspect the repository with command-line Git, keep a remote or separate backup, and do not enable this first in a complex worktree. Checkpoints are convenience history, not a backup strategy.

## Private `.h/` notes (highly experimental)

This feature protects a committed archive; it is not full-disk encryption, a hardened secret manager, or a substitute for a tested backup.

1. Create `.h/` directly in the opened vault and add private notes beneath it.
2. Open the vault and enter a password when prompted.
3. The first checkpoint or commit creates an AES-256 encrypted `.h.zip` and a plaintext `.horig/` comparison baseline.
4. Commit `.h.zip`. Never force-add `.h/` or `.horig/`.

If the vault is a subfolder of a larger Git repository, paths are adjusted relative to that worktree. Bricriu adds plaintext paths to the repository's local `.git/info/exclude` and may install local pre-commit/pre-push hook integration. Existing hooks are preserved and run first. If `core.hooksPath` is already customized, the app reports a warning instead of modifying that location.

On open, public notes appear first while an existing `.h.zip` is decrypted in a background worker. Private files remain out of the tree and content search until preparation completes, and checkpoints wait. Before later checkpoints or integrated command-line commits, `.h/` is compared byte-for-byte with `.horig/`; changes cause `.h.zip` to be replaced and the baseline refreshed. A pre-push that discovers an uncommitted archive update stops the push.

Important boundaries:

- Passwords are stored as plaintext in the local, Git-ignored `private-vaults.json` file.
- `.h/`, `.horig/`, editor memory, caches, backups, and swap can contain plaintext while in use.
- ZIP entry names remain visible without the password.
- Weak passwords remain vulnerable to offline guessing.
- Losing the password means the encrypted archive cannot be recovered.
- Git hooks can be bypassed, fail, or be replaced; independently verify the archive before deleting plaintext or sharing a repository.

Keep a separate secure password backup and test both encryption and restoration using disposable data before considering this feature.

## Typst (highly experimental)

`.typ` files open with vendored Typst syntax support. Preview can render embedded SVG or HTML, and PDF export uses the embedded Typst compiler. Compilation may create preview output below `.notesproject/typst-preview/` in the vault.

Typst packages, fonts, SVG/HTML parity, error reporting, export fidelity, and all platform behavior require more testing. Do not assume Markdown-specific features such as wiki links, Track Changes, backlinks, or Canvas apply to Typst.

## Track Changes (highly experimental)

Use the track action on a Markdown tree row to open the rich Track Changes editor. It supports snapshots, review, and accepting or rejecting detected block changes. State is stored as sidecar JSON below `.notesproject/track/`, and merge candidates may be written beside a note with `.track-merge` in the filename.

Track mode converts between Markdown and a ProseMirror/Tiptap document model. Round trips may not preserve every Markdown construct exactly. Keep source control and test with copied notes containing the syntax you care about before using it.

## Canvas (highly experimental)

Canvas interprets a fenced `canvas` YAML block inside a Markdown document as nodes, edges, positions, sizes, colors, and viewport state. Moving or editing nodes rewrites that YAML in the note. The rest of the Markdown document can appear as a node or panel.

Because Canvas directly rewrites source, review the Markdown diff after every experiment and keep recoverable history.

## Calendar (highly experimental)

Calendar stores events and recurrence settings in `.vault-calendar/events.json` inside the vault. It is not derived from note dates, is not a CalDAV client, and does not synchronize with an external calendar service. Back up or commit the calendar JSON if the data matters.

## Session and preference storage

The app uses WebView local storage to remember workspace state such as the last vault, tabs, active file, split layout, expanded folders, pins, filters, recent files, window placement, and panel sizes. `profile.json` stores timing and history settings, including:

```json
{
  "autosaveDelayMs": 5000,
  "checkpointIntervalMs": 180000,
  "gitStatusPollIntervalMs": 300000,
  "typstPreviewDebounceMs": 250,
  "closeMarkdownBeforeTrack": true,
  "persistRecentFiles": true
}
```

The backend normalizes timing values into bounded ranges. Delete local state only after recording anything you need to restore manually.

For compatibility with earlier development versions, these settings and the `.notesproject/` vault metadata directory retain their original internal namespace.

## Known limits

- Only Markdown has modest single-user, Windows-oriented real-world testing.
- Search scans files and has no persistent content index.
- Wiki-link resolution and backlinks are intentionally narrower than a full knowledge-base application.
- The app has no built-in cloud sync or backup.
- Packaging, signing, installer upgrades, and clean uninstallation are not release-tested.
- macOS and Linux are untested.
- Accessibility, internationalization, and high-DPI/multi-monitor combinations need broader review.
- The application icon is a generated Windows-oriented placeholder.
- Track Changes, Canvas, Calendar, Typst, Git automation, and private notes remain highly experimental.
