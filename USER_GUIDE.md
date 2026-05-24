# NotesProject User Guide

## Open A Vault

Enter a folder path in the left pane and press **Open**.

The vault is the root folder for your notes. The app shows Markdown files from this folder and its subfolders.

## Files And Folders

- **New note** creates a Markdown file.
- **New folder** creates a folder.
- Hover a file or folder in the tree to rename or delete it.
- Click a Markdown file to open it in the editor.

## Tabs

- Multiple notes can be open at once.
- Click a tab to switch files.
- Close the current tab with `Ctrl+W`.
- Switch tabs with `Ctrl+Tab`, `Ctrl+Shift+Tab`, `Ctrl+PageUp`, or `Ctrl+PageDown`.

## Editing

The editor is a CodeMirror Markdown editor. Your files stay as plain `.md` files.

- Save with **Save** or `Ctrl+S`.
- Undo/redo uses CodeMirror history and is preserved while the tab remains open.
- Saving does not clear editor undo.
- Dirty tabs show a modified marker.

## Search

There are two search boxes in the left pane.

- **File name** filters the visible file tree.
- **Content** searches note text inside the current vault.
- **Search filtered files only** makes content search search only files currently matching the file-name filter.

Content search is non-indexed and uses embedded ripgrep-style matching. Simple terms work as literal text searches.

Clicking a content-search result opens the note at the match. The editor highlights visible occurrences of the active search term, with the clicked match emphasized.

## Wiki Links

Use Obsidian-style wiki links:

```md
[[Project Ideas]]
[[folder/Project Ideas]]
[[Project Ideas|custom label]]
[[Project Ideas#section]]
```

Current behavior:

- Wiki links are highlighted in the editor.
- `Ctrl+click` opens a matching note.
- `Ctrl+Enter` opens the wiki link under the cursor.
- Type `[[` and part of a filename to get filename suggestions.
- Matching works against Markdown filenames with or without `.md`.

## Callouts

Use callout lines like:

```md
> [!NOTE]
> This is a note.

> [!WARNING]
> This is important.

> [!TIP]
> A useful hint.
```

The editor highlights common callout types, including `NOTE`, `INFO`, `TIP`, `SUCCESS`, `WARNING`, `CAUTION`, `IMPORTANT`, `DANGER`, `ERROR`, and `FAILURE`.

## Math With KaTeX

Inline math:

```md
The equation $x^2 + y^2 = z^2$ is rendered beside the source.
```

Block math:

```md
$$
E = mc^2
$$
```

The source text remains editable Markdown. KaTeX previews are shown as editor widgets.

## Preview Pane

Use **Preview** in the editor header to toggle split view.

The preview pane renders:

- normal Markdown
- wiki links
- callouts
- inline KaTeX math
- block KaTeX math

Click a wiki link in the preview to open the matching note.

Raw HTML inside notes is escaped in the preview.

## Backlinks

Use **Backlinks** in the editor header to toggle the backlinks panel.

The panel shows notes that link to the current note with wiki links, for example:

```md
[[Current Note]]
[[Current Note.md]]
[[folder/Current Note]]
```

Each result shows the source note, line number, and matching line text. Click a result to open the source note at that link.

## Autosave

Dirty notes autosave after a delay. The default is:

```json
{
  "autosaveDelayMs": 5000
}
```

Autosave writes the file to disk but does not clear CodeMirror undo.

## Git Checkpoints

If the vault is a Git repository, the app uses an `inuse` branch for active work.

On open:

- If already on `inuse`, it stays there.
- If clean and `inuse` exists, it switches to `inuse`.
- If clean and `inuse` does not exist, it creates `inuse`.
- If dirty on another branch, it asks before creating a checkpoint and switching.

Checkpoint behavior:

- Autosave writes files.
- Checkpoints create Git commits later.
- Manual checkpoint is available with **Checkpoint**.
- Periodic checkpoint default is 3 minutes when changed files exist.
- On app close, dirty tabs are saved and touched files are checkpointed before exit.

Defaults are stored in `profile.json`:

```json
{
  "autosaveDelayMs": 5000,
  "checkpointIntervalMs": 180000
}
```

## Session Restore

The app remembers:

- last vault
- open tabs
- active tab
- expanded folders
- filename filter
- whether content search uses the file filter

## Current Limits

- Wiki links open existing matching files; automatic creation of missing links is not implemented yet.
- Backlinks currently detect wiki links, not ordinary Markdown links.
- Math preview is for common KaTeX syntax, not every LaTeX package.
- Search has no persistent index by design.
