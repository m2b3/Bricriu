# Bricriu User Guide

[README](README.md) · [Download and installation](install.md) · [Troubleshooting](install.md#troubleshooting)

Start with [Getting started](#getting-started) for your first note, or use the contents to go directly to a task. This guide covers the desktop app; developer setup and packaging are in the [installation and build guide](install.md).

## Contents

- [Getting started](#getting-started)
- [Open a vault](#open-a-vault)
  - [Vault, no vault, and outside files](#vault-no-vault-and-outside-files)
  - [Open an individual file](#open-an-individual-file)
- [Supported file types](#supported-file-types)
- [Files and folders](#files-and-folders)
- [Tabs, panes, and recent files](#tabs-panes-and-recent-files)
- [Appearance](#appearance)
- [Editing Markdown](#editing-markdown)
- [Autosave and external changes](#autosave-and-external-changes)
- [Search](#search)
- [Wiki links and backlinks](#wiki-links-and-backlinks)
- [Callouts and math](#callouts-and-math)
- [Preview, print, and PDF](#preview-print-and-pdf)
- [Git checkpoints (experimental)](#git-checkpoints-experimental)
- [Private `.h/` notes (highly experimental)](#private-h-notes-highly-experimental)
- [Typst (highly experimental)](#typst-highly-experimental)
- [Track Changes (highly experimental)](#track-changes-highly-experimental)
- [Canvas (highly experimental)](#canvas-highly-experimental)
- [Calendar (highly experimental)](#calendar-highly-experimental)
- [Session and preference storage](#session-and-preference-storage)
- [Known limits](#known-limits)

> [!CAUTION]
> Use a disposable test vault first. Keep important notes in an independent versioned backup and commit them regularly if the vault uses Git. File deletion, autosave, Git automation, and private-note encryption can all change data on disk.

The ordinary Markdown editor is the only workflow with approximately six months of single-user testing. Every feature explicitly marked **experimental** below, plus all macOS and Linux behavior, has much less assurance.

## Getting started

On 64-bit Windows 10/11, [download the installer](install.md#install-on-windows-1011-x64), double-click it, and follow the prompts. Developer tools are not needed to use the installer.

1. **Launch the app.** Open **Bricriu** from the Start menu, or double-click its desktop shortcut if you created one during installation.
2. **Create a folder for notes.** Use File Explorer to create a folder such as `Documents\Bricriu Notes`. This ordinary folder will be your *vault*. It can start empty, or contain copied `.md` notes. You can also choose an existing notes folder; files stay where they are and are not imported into a database.
3. **Choose the folder in Bricriu.** Clear the sidebar's **Vault folder path** field and click **Open** to use the folder picker. Select the folder you just created. Alternatively, enter its full path and click **Open**. Opening a vault requires an existing folder; entering a new name here does not create it.
4. **Make your first note.** Click **New note**, enter `First note.md` in **Path**, and click **Create**. Type `# My first note`, then a few lines of text. Click **Save** or press `Ctrl+S`.
5. **Read and find it.** Choose **View → Preview** to see the formatted note. Select the note in the sidebar to reopen it; use **File name** to filter names or **Content** to search the vault's text.

Your note is saved as `First note.md` inside the folder you chose and can also be opened in another text editor. Autosave normally writes edits after five seconds; keep an independent backup of important notes. No account or Git setup is required for ordinary editing.

## Open a vault

A vault is an ordinary folder containing notes and any subfolders. To create one, make a folder in File Explorer and open it in Bricriu; there is no special vault file to create. Enter its full path in **Vault folder path** and select **Open**. To choose a folder with the system folder picker instead, clear that field and select **Open**. Bricriu recursively shows [supported files](#supported-file-types) beneath that folder. **New folder** creates a subfolder inside the open vault.

Hidden folders are normally omitted. Search can reveal that a matching note exists under a hidden folder, after which the interface can explicitly reveal that folder. The special private `.h/` folder has separate behavior described below.

### Vault, no vault, and outside files

| State | Available behavior |
| --- | --- |
| **Vault open** | The selected folder supplies the file tree, vault-wide search, note creation, and relationships between notes. Git checkpoints are optional and require a Git repository. |
| **No vault open** | No workspace folder has been selected or restored. **New note** and **File → Open file** are unavailable until you open a folder. This is a starting state, not a separate editor mode. |
| **Outside vault** | A file elsewhere is open in a tab while your selected vault stays open. You can edit and save it in place, but it is not included in that vault's tree, search, backlinks, checkpoints, or private-vault handling. |

### Open an individual file

With a vault open, choose **File → Open file** (`Ctrl+O`) and select a supported document. If it is outside the selected folder, Bricriu labels it **Outside vault** (also shown as **OUT** on the tab). Opening it does not copy or move the file into the vault.

After installing on Windows, you can also right-click a document in File Explorer and choose **Open with → Bricriu**, or **Choose another app → Bricriu**. If Bricriu is running, the file opens as a tab in that window; an already-open file selects its tab and keeps unsaved edits. If no vault is open, Bricriu uses the last vault if it contains the document, or the document's parent folder otherwise. You do not need to create a separate notes folder for this route, but Bricriu still opens a folder as its workspace.

Installing Bricriu does not change your default editor. Double-clicking a document opens Bricriu only if you have chosen it as that file type's default app in Windows. The app's own shortcut launches Bricriu regardless. [Command-line opening](install.md#open-a-file-from-the-command-line) follows the same folder-selection rules.

## Supported file types

| Format | Extensions | Editing behavior |
| --- | --- | --- |
| Markdown | `.md`, `.markdown` | Source editing with formatted preview, wiki links, backlinks, callouts, and KaTeX math. The primary, somewhat-tested workflow. |
| Typst | `.typ` | Typesetting source with embedded preview and PDF export. [Highly experimental](#typst-highly-experimental). |
| Plain text | `.txt` | Raw text editing; Markdown syntax stays literal. |
| CSV | `.csv` | Raw text editing with the original extension, rather than a spreadsheet grid. |
| JSON | `.json` | Raw text editing with the original extension; no dedicated structured editor. |

These extensions are recognized in the vault and when opening individual documents. Other file types can remain in the folder, but are not general-purpose editable documents in Bricriu. In particular, PDF is an export format, not a supported document editor.

[Canvas](#canvas-highly-experimental) stores a YAML block inside a Markdown file. [Track Changes](#track-changes-highly-experimental) uses Markdown plus separate review state, and [Calendar](#calendar-highly-experimental) keeps its own event data inside the vault. These are experimental features, not additional import formats.

## Files and folders

- **New note** creates a Markdown file by default. Supplying `.typ` creates an experimental Typst document.
- **File → Save As** opens the system save dialog, starting in the current file’s folder (or the vault root for a file without a saved path). Choose a filename and any folder, including outside the vault. The system dialog confirms replacement of an existing file. Bricriu continues editing the chosen file; outside files use the Text view without vault-only features or Track Changes metadata.
- **New folder** creates a folder within the vault.
- Tree-row actions pin, open in Track mode, rename, or delete a note; folder rows can be renamed or deleted.
- Pinned notes remain near the top of the sidebar.
- The file tree and backend guard vault-relative operations against `..` path traversal.

Treat delete as permanent unless you have independently confirmed recovery through Git, backups, or operating-system facilities. Test rename and delete behavior on copied files before using it on a real vault.

## Tabs, panes, and recent files

- Open notes appear in tabs; a modified marker identifies dirty tabs.
- **Split** opens a resizable second editor pane. **Move right** moves the main tab into it.
- `Ctrl+W` / `Cmd+W` closes the document in the focused pane and keeps the pane open. Each split pane also has a **Close document** button. Unsaved edits require confirmation before discarding.
- **Close pane** and **Close split** remove a pane without closing its document tab. Closing a document leaves the other pane unchanged; an empty pane stays available for another document.
- Switch main tabs with `Ctrl+Tab`, `Ctrl+Shift+Tab`, `Ctrl+PageUp`, `Ctrl+PageDown`, `Ctrl+[`, or `Ctrl+]` (use `Cmd` where the platform maps it). `Ctrl+Tab` moves right and `Ctrl+Shift+Tab` moves left, wrapping at either end.
- The sidebar lists open tabs after pinned notes and filename/content search results, above the regular file directory. Files already shown as pins or search results are omitted from this open-tab list; files in the regular directory remain in it.
- Use the top-bar Back/Forward buttons or `Alt+Left` / `Alt+Right` to move through the focused pane's document history. Closed documents are reopened from disk when revisited.
- **File → Recent** reopens recently closed files. **Persist recent files** controls whether that history survives an app restart.

## Appearance

Choose an interface palette under **Options → Theme**:

- **Classic** preserves Bricriu's original cream-and-green appearance.
- **Bright contrast** keeps the editor light while using stronger borders, deeper green accents, darker surrounding chrome, and clearer surface separation.
- **Dark — VS Code Dark+** uses neutral charcoal surfaces, gray borders, blue accents, and syntax colors adapted from VS Code Dark+. It applies across the app chrome, Markdown editor, preview, calendar, canvas, and Track Changes surfaces. Typst output remains paper-white because it represents the rendered document.

The selected theme is stored locally and restored the next time Bricriu starts.

### Where to get themes

VS Code color themes are the easiest source of additional palettes. Some starting points:

- [One Dark Pro](https://marketplace.visualstudio.com/items?itemName=zhuangtongfa.Material-theme) uses dark blue-gray surfaces. Its [JSON theme file](https://raw.githubusercontent.com/Binaryify/OneDark-Pro/master/themes/OneDark-Pro.json) can be downloaded directly.
- [GitHub Theme](https://marketplace.visualstudio.com/items?itemName=GitHub.github-vscode-theme) includes **Dark Default** and **Dark Dimmed** variants.
- [Dracula](https://draculatheme.com/visual-studio-code) uses purple-gray surfaces with colorful highlighting.

To try One Dark Pro without installing VS Code:

1. Open the **JSON theme file** link above.
2. Use your browser's **Save as** command (`Ctrl+S` on Windows) and save it as `OneDark-Pro.json`, keeping the `.json` extension.
3. In Bricriu, choose **Options → Import theme…** and select that file.

For themes obtained through the VS Code Marketplace, follow [Export a theme from VS Code](#export-a-theme-from-vs-code) below. Bricriu imports the theme's colors rather than installing its VS Code extension. The built-in Dark+ palette needs no download.

### Import theme files

**Options → Import theme…** loads a palette immediately, without restarting or rebuilding the app. Choose either:

- A VS Code `.json` / `.jsonc` color theme. The importer maps common interface colors and broad syntax scopes to Bricriu; it does not reproduce every VS Code token rule, semantic token, or font style. Themes that reference other files need to be [exported from VS Code](#export-a-theme-from-vs-code) first.
- A Bricriu `.css` palette, such as [public/themes/dark-plus.css](public/themes/dark-plus.css). Edit a copy, then import it. Palette files use one `:root` block containing `color-scheme: dark` (or `light`) and Bricriu color variables with hex values. Arbitrary stylesheets from other editors use different selectors and need adapting.

For example:

```css
:root {
  color-scheme: dark;
  --editor-bg: #1e1e1e;
  --editor-bg-alt: #1e1e1e;
  --code-editor-bg: #1e1e1e;
  --panel: #252526;
  --text: #d4d4d4;
  --accent: #75beff;
}
```

The most recently imported palette appears in the Theme list. Its colors are saved locally, so the original file is not needed on later launches. Edit and reimport a file to reload it; files are not watched automatically. Select any built-in theme to remove its overrides. Invalid imports leave the current theme unchanged. Theme files must be at most 512 KB.

If **Options → Import theme…** is missing, update Bricriu to a build that includes theme importing. Once the feature is available, changing palettes needs no recompilation.

### Export a theme from VS Code

1. Install the theme in VS Code and select it through **Preferences: Color Theme**. For a theme with several variants, select the variant you want to export.
2. Press **Ctrl+Shift+P** on Windows/Linux or **Cmd+Shift+P** on macOS to open the Command Palette.
3. Run **Developer: Generate Color Theme From Current Settings** and save the generated document as a `.json` file.
4. In Bricriu, choose **Options → Import theme…** and select the saved file.

This produces a self-contained palette, including colors inherited from other theme files. The export command is documented in the [VS Code theme guide](https://code.visualstudio.com/api/extension-guides/color-theme).

## Editing Markdown

The Text view is a CodeMirror 6 source editor. Markdown remains visible and the saved file stays plain text.

- **Raw** switches the CodeMirror editor to source-only display by hiding in-editor processed widgets such as rendered math and Canvas summaries. It does not disable syntax highlighting or change the separately rendered Preview pane.
- Save with **Save** or `Ctrl+S` / `Cmd+S`.
- Choose a filename and folder with **File → Save As** or `Ctrl+Shift+S` / `Cmd+Shift+S`.
- Create a note with `Ctrl+N` / `Cmd+N`.
- Open a file with `Ctrl+O` / `Cmd+O`.
- Undo/redo uses CodeMirror history and remains available while the tab is open.
- **Count** reports words and characters for the selection or full document.
- **Bullets** and **Numbers** turn selected lines into Markdown lists.
- `Ctrl+L` / `Cmd+L` toggles Markdown links around URLs in the selection.
- Canadian-English spellcheck underlines unknown words and offers suggestions or a personal dictionary entry.

For Save and autosave, Bricriu compares the current disk text with the version last loaded or saved. If they differ, the save is blocked; an unreadable or missing file also blocks the save. For Markdown files inside the vault, a conflict saves your editor version to a separate merge candidate. For outside files, use **Save As** to preserve your version separately.

## Autosave and external changes

Dirty notes autosave after a configurable delay; the default is five seconds. Autosave writes directly to disk but does not clear the editor's in-memory undo history.

The vault watcher refreshes the tree and marks open notes changed or deleted when another program modifies them. Review these warnings carefully. Concurrent editing from two programs remains a risk even with conflict checks.

Files opened outside the vault are watched while their tabs remain open. Native file notifications are backed up by content checks every two seconds and another check when Bricriu regains focus. These checks cover changes from other editors or sync services, including replacements that preserve timestamps.

If the disk text differs from both the last saved version and your current text, a pop-up offers **Reload from disk** or **Keep editing**. It explicitly says whether there are unsaved edits when Bricriu detects the change. Reloading refreshes the file's open views and discards those edits. Keep editing preserves your text and leaves a **Changed on disk** indicator. Autosave pauses for that file while the conflict remains unresolved. Use **Save As** to keep a separate copy; pressing **Save** checks the disk again and offers the reload choice if it still conflicts, without overwriting the disk version.

Duplicate notifications for the same disk contents do not repeat a dismissed prompt, even after a temporary lock or read failure. A new disk revision or an explicit Save can ask again. If the file is deleted or cannot be read, the editor keeps its text, pauses autosave, and shows **Unavailable on disk** until it becomes readable again.

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

Markdown Preview uses bundled **IBM Plex Sans** for prose and **Lilex** for code, with Zed-style typography: 16px body text, 1.5 line spacing, semibold headings, and a centered reading width up to 800px. The fonts work offline and also apply to Markdown printing. Preview keeps the current Bricriu theme colours; the editor and app interface keep their existing fonts.

Click a position in the Markdown editor to scroll Preview to the corresponding passage while keeping keyboard focus in the editor. This works in either editor pane, including outside-vault Markdown files. Long wrapped paragraphs and code blocks use an approximate position within the rendered block. You can still scroll Preview independently; it follows again on the next editor click.

This behavior is enabled by default. To disable it, close Bricriu, set `"markdownPreviewFollowCursor": false` in its `profile.json`, and reopen the app. This is a configuration-file option with no GUI control.

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

The sidebar **Checkpoint** saves open vault notes and checkpoints all vault changes on the current branch. The toolbar and menu **Checkpoint** select files changed through Bricriu during the current session and require the `inuse` branch.

If `.h/` is locked because no password was supplied, all manual Checkpoint buttons instead save and checkpoint public vault changes on the current branch. They leave `.h/`, `.horig/`, private review sidecars, and `.h.zip` unchanged, including any private paths already staged in Git.

> [!WARNING]
> The app can switch branches, stage paths, install or modify hooks for private notes, and create commits. Inspect the repository with command-line Git, keep a remote or separate backup, and do not enable this first in a complex worktree. Checkpoints are convenience history, not a backup strategy.

## Private `.h/` notes (highly experimental)

This feature protects a committed archive; it is not full-disk encryption, a hardened secret manager, or a substitute for a tested backup.

1. Create `.h/` directly in the opened vault and add private notes beneath it.
2. Open the vault, search for `.h` in the filename filter, and enter its password when prompted.
3. The first checkpoint or commit creates an AES-256 encrypted `.h.zip` and a plaintext `.horig/` comparison baseline.
4. Commit `.h.zip`. Never force-add `.h/` or `.horig/`.

If the vault is a subfolder of a larger Git repository, paths are adjusted relative to that worktree. Bricriu adds rules for private folder names, temporary private files, password settings, and the local vault identifier to the repository's `.git/info/exclude`. These rules apply at every folder depth, survive vault renames, and leave the encrypted `.h.zip` archive trackable. Bricriu may install local pre-commit/pre-push hook integration. Existing hooks are preserved and run first. If `core.hooksPath` is already customized, the app reports a warning instead of modifying that location.

Unlocking the private folder upgrades Bricriu's hooks to resolve the vault relative to the repository at runtime. After that, moving or renaming the enclosing repository preserves private-note commits and pushes, provided the Bricriu executable and local password settings remain accessible. Paths to either of those inside the repository also move with it. A local, Git-ignored `.notesproject/private-vault-id` lets saved passwords follow the vault; existing path-based password entries are migrated on successful unlock. Keep that identifier when moving the vault. Passwords remain in `private-vaults.json`, not in the identifier file.

Once these repository-wide exclusions are installed, private files stay ignored when you rename a vault subfolder, even before reopening or unlocking it. Reopen its new location and unlock `.h/` before committing or pushing so Bricriu refreshes the hook paths used to synchronize the archive. Ignore rules do not unstage or untrack files that were already added. The app's remembered vault path, tabs, and layout still use the full path and do not automatically migrate after a move.

Opening a vault leaves `.h/` locked, even if a password was previously saved. There is no startup password prompt or automatic decryption. Search for `.h` in the filename filter or open a private note directly to request the password. Content searches silently skip locked private notes and never prompt for a password; they include private notes only after you explicitly unlock. Cancel leaves private notes locked; successful unlock refreshes the tree and search results and resumes any requested private note. Automatic checkpoints wait; manual checkpoints can commit public changes while the private folder is locked. When private notes are unlocked, checkpoints and integrated command-line commits compare `.h/` byte-for-byte with `.horig/`; changes cause `.h.zip` to be replaced and the baseline refreshed. A pre-push that discovers an uncommitted archive update stops the push.

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
  "persistRecentFiles": true,
  "markdownPreviewFollowCursor": true
}
```

The backend normalizes timing values into bounded ranges. Delete local state only after recording anything you need to restore manually.

For compatibility with earlier development versions, these settings and the `.notesproject/` vault metadata directory retain their original internal namespace.

## Known limits

- Only Markdown has modest single-user, Windows-oriented real-world testing.
- Search scans files and has no persistent content index.
- Wiki-link resolution and backlinks are intentionally narrower than a full knowledge-base application.
- The app has no built-in cloud sync or backup.
- An unsigned Windows x64 installer is available, but signing, upgrades, and clean uninstallation have not received broad release testing. macOS and Linux packages are not provided.
- macOS and Linux are untested.
- Accessibility, internationalization, and high-DPI/multi-monitor combinations need broader review.
- The application icon is a generated Windows-oriented placeholder.
- Track Changes, Canvas, Calendar, Typst, Git automation, and private notes remain highly experimental.
