# Typst Integration TODO for Bricriu

## MVP TODO

1. Add `.typ` files to vault discovery.

2. Add `.typ` to the file tree.

3. Add a document mode:

```ts
type DocumentMode = 'markdown' | 'track' | 'typst'
```

4. Open `.typ` files in CodeMirror as plain text first.

5. Add Typst-specific tab labels:

```text
paper.typ
paper.typ - Typst
```

6. Add Rust command to check whether `typst` CLI is available.

7. Add Rust command to compile a `.typ` file.

8. Compile to a generated preview artifact:

```text
.notesproject/typst-preview/<vault-relative-path>.svg
```

or:

```text
.notesproject/typst-preview/<vault-relative-path>.pdf
```

9. Prefer SVG preview for the first app preview path.

10. Add a Typst preview pane beside the editor.

11. Compile on save.

12. Later, compile after a debounce while editing.

13. Surface compile errors in the editor pane.

14. Hide `.notesproject/typst-preview/` from tree and search.

15. Add cleanup for preview artifacts when a `.typ` file is deleted.

16. Move preview artifacts when a `.typ` file or folder is renamed.

17. Add `typst` install/help messaging if CLI is missing.

18. Add manual tests for:

```text
open .typ
edit .typ
save .typ
compile preview
show compile error
rename .typ
delete .typ
rename folder containing .typ
delete folder containing .typ
```

## Later TODO

1. Add CodeMirror Typst syntax highlighting.

2. Add a richer Typst preview toolbar:

```text
refresh
zoom
open PDF externally
export PDF
export PNG
```

3. Add watch/debounce compilation.

4. Add external Typst CLI path setting.

5. Add support for embedded Typst blocks in Markdown:

````markdown
```typst
#rect(width: 4cm, height: 2cm)[Hello]
```
````

6. Add cached preview invalidation based on source modified time.

7. Consider embedded compiler or WASM rendering after CLI workflow is stable.

8. Add tests for compile command safety and path containment.

9. Track in-memory overlays for all open dirty Typst tabs, not only the active preview target. This would let an unsaved `.typ` file imported by another open `.typ` file participate in preview without requiring a save first.

## Bricriu Integration Plan

### Phase 1: File Support

1. Update `src-tauri/src/main.rs` file discovery to include `.typ`.

2. Update `TreeEntry` usage in `src/main.tsx` so `.typ` appears in the existing left file tree.

3. Add safe Rust read/save support for Typst files without weakening Markdown-only behavior where it matters.

4. Keep all frontend/backend paths vault-relative, matching the existing Bricriu rule.

### Phase 2: Editor Mode

1. Extend the existing tab/editor mode model in `src/main.tsx` with `typst`.

2. Reuse CodeMirror for `.typ` editing.

3. Keep Markdown preview/backlinks disabled for Typst tabs unless a Typst-specific preview is active.

4. Add Typst-specific header/actions in the existing editor pane.

### Phase 3: CLI Compile

1. Add Rust command in `src-tauri/src/main.rs`:

```rust
check_typst_cli() -> Result<TypstCliInfo, String>
```

2. Add Rust command in `src-tauri/src/main.rs`:

```rust
compile_typst(path: String, output: TypstOutputKind) -> Result<TypstCompileResult, String>
```

3. Resolve source paths under the vault and generated output paths under `.notesproject/typst-preview/`.

4. Run `typst compile` with hidden/no-window process behavior on Windows.

5. Return stdout/stderr, success/failure, and the generated vault-relative artifact path.

### Phase 4: Preview UI

1. Add a Typst preview pane inside the existing right editor workspace.

2. Render SVG output directly in the pane first.

3. Show compile errors inline.

4. Add `Compile` or `Preview` action beside the existing Save/Checkpoint controls.

5. Compile automatically on save.

### Phase 5: Artifact Lifecycle

1. Store preview files inside the vault under:

```text
.notesproject/typst-preview/
```

2. Hide preview artifacts from tree/search.

3. Delete preview artifacts when source `.typ` is deleted.

4. Move preview artifacts when source `.typ` or parent folders are renamed.

### Phase 6: Polish

1. Add syntax highlighting.

2. Add debounce compile.

3. Add zoom/export/open controls.

4. Add settings for Typst CLI path and output format.

5. Add tests.
