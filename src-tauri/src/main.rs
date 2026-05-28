#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use grep_matcher::Matcher;
use grep_regex::{RegexMatcher, RegexMatcherBuilder};
use grep_searcher::{SearcherBuilder, Sink, SinkMatch};
use ignore::WalkBuilder;
use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::{
    borrow::Cow,
    cmp::Ordering,
    collections::{hash_map::DefaultHasher, BTreeMap},
    env, fs,
    hash::{Hash, Hasher},
    path::{Component, Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tauri::Emitter;
use typst::{
    diag::{FileError, FileResult},
    foundations::Bytes,
    layout::{Abs, PagedDocument},
    syntax::{FileId, Source},
};
use typst_as_lib::{
    file_resolver::FileResolver, typst_kit_options::TypstKitFontOptions, TypstEngine,
};

#[derive(Default)]
struct AppState {
    vault_root: Mutex<Option<PathBuf>>,
    watcher: Mutex<Option<RecommendedWatcher>>,
    typst_preview: Mutex<Option<TypstPreviewSession>>,
    typst_embedded: Mutex<Option<EmbeddedTypstSession>>,
}

struct TypstPreviewSession {
    root: PathBuf,
    input: PathBuf,
    output: PathBuf,
    child: Child,
}

impl Drop for TypstPreviewSession {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
        let _ = fs::remove_file(&self.input);
    }
}

struct EmbeddedTypstSession {
    root: PathBuf,
    overlay: Arc<Mutex<Option<TypstOverlaySource>>>,
    engine: TypstEngine,
}

#[derive(Clone)]
struct TypstOverlaySource {
    rel: String,
    body: String,
}

#[derive(Clone)]
struct VaultTypstResolver {
    root: PathBuf,
    overlay: Arc<Mutex<Option<TypstOverlaySource>>>,
}

#[derive(Serialize)]
struct VaultInfo {
    root: String,
    name: String,
    git: GitInfo,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GitInfo {
    is_repo: bool,
    current_branch: Option<String>,
    inuse_branch: Option<String>,
    status: GitStatus,
    message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
enum GitStatus {
    NotRepo,
    Ready,
    DirtyOnInuse,
    NeedsCheckpoint,
    GitUnavailable,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TreeEntry {
    path: String,
    name: String,
    kind: EntryKind,
    children: Vec<TreeEntry>,
    updated_at: Option<u64>,
    size: Option<u64>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "lowercase")]
enum EntryKind {
    File,
    Dir,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NoteContent {
    path: String,
    body: String,
    updated_at: u64,
    size: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TypstPreview {
    format: TypstPreviewFormat,
    content: String,
    updated_at: u64,
}

#[derive(Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
enum TypstPreviewFormat {
    Svg,
    Html,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct TrackState {
    path: String,
    current_doc: serde_json::Value,
    snapshots: Vec<serde_json::Value>,
    resolved_changes: Vec<String>,
    comments: Vec<serde_json::Value>,
    updated_at: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ContentMatch {
    path: String,
    line_number: usize,
    line_text: String,
    offset: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BacklinkMatch {
    path: String,
    line_number: usize,
    line_text: String,
    offset: usize,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct VaultChangeEvent {
    paths: Vec<String>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppProfile {
    autosave_delay_ms: u64,
    checkpoint_interval_ms: u64,
    #[serde(default = "default_typst_preview_debounce_ms")]
    typst_preview_debounce_ms: u64,
    #[serde(default = "default_close_markdown_before_track")]
    close_markdown_before_track: bool,
}

#[tauri::command]
fn open_vault(state: tauri::State<AppState>, path: String) -> Result<VaultInfo, String> {
    let root = PathBuf::from(path.trim());
    if root.as_os_str().is_empty() {
        return Err("Vault path is required.".to_string());
    }
    let root = root
        .canonicalize()
        .map_err(|err| format!("Could not open vault: {err}"))?;
    if !root.is_dir() {
        return Err("Vault path must be a directory.".to_string());
    }

    let name = root
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("Vault")
        .to_string();
    let git = prepare_inuse_branch(&root)?;
    let root_string = root.to_string_lossy().to_string();
    *state
        .vault_root
        .lock()
        .map_err(|_| "Vault state is locked.")? = Some(root);
    *state
        .typst_preview
        .lock()
        .map_err(|_| "Typst preview state is locked.")? = None;
    *state
        .typst_embedded
        .lock()
        .map_err(|_| "Embedded Typst state is locked.")? = None;

    Ok(VaultInfo {
        root: root_string,
        name,
        git,
    })
}

#[tauri::command]
fn watch_vault(app: tauri::AppHandle, state: tauri::State<AppState>) -> Result<(), String> {
    let root = current_root(&state)?;
    let root_for_callback = root.clone();
    let app_for_callback = app.clone();

    let mut watcher = RecommendedWatcher::new(
        move |result: notify::Result<notify::Event>| {
            let Ok(event) = result else {
                return;
            };
            let paths = event
                .paths
                .iter()
                .filter_map(|path| to_posix_relative(&root_for_callback, path).ok())
                .collect::<Vec<_>>();
            if paths.is_empty() {
                return;
            }
            let _ = app_for_callback.emit("vault://changed", VaultChangeEvent { paths });
        },
        Config::default().with_poll_interval(Duration::from_secs(2)),
    )
    .map_err(|err| format!("Could not create vault watcher: {err}"))?;

    watcher
        .watch(&root, RecursiveMode::Recursive)
        .map_err(|err| format!("Could not watch vault: {err}"))?;

    *state
        .watcher
        .lock()
        .map_err(|_| "Watcher state is locked.")? = Some(watcher);
    Ok(())
}

#[tauri::command]
fn load_profile() -> Result<AppProfile, String> {
    let path = profile_path()?;
    if !path.exists() {
        let profile = default_profile();
        write_profile_file(&path, &profile)?;
        return Ok(profile);
    }
    let raw =
        fs::read_to_string(&path).map_err(|err| format!("Could not read profile.json: {err}"))?;
    let parsed = serde_json::from_str::<AppProfile>(&raw)
        .map_err(|err| format!("Could not parse profile.json: {err}"))?;
    let profile = normalize_profile(parsed);
    write_profile_file(&path, &profile)?;
    Ok(profile)
}

#[tauri::command]
fn checkpoint_and_switch_inuse(state: tauri::State<AppState>) -> Result<GitInfo, String> {
    let root = current_root(&state)?;
    if !is_git_repo(&root)? {
        return Ok(not_repo_git_info());
    }

    run_git_checked(
        &root,
        &["add", "-A"],
        "Could not stage current vault changes for checkpoint.",
    )?;
    let has_staged = !run_git_status(&root, &["diff", "--cached", "--quiet"])?.success;
    if has_staged {
        let message = format!(
            "NotesProject checkpoint before inuse: {}",
            checkpoint_timestamp()
        );
        run_git_checked(
            &root,
            &["commit", "-m", &message],
            "Could not create checkpoint commit. Check Git user.name/user.email.",
        )?;
    }

    switch_or_create_inuse(&root)?;
    inspect_git_info(&root, "Using inuse branch.")
}

#[tauri::command]
fn checkpoint_inuse(state: tauri::State<AppState>, paths: Vec<String>) -> Result<GitInfo, String> {
    let root = current_root(&state)?;
    if !is_git_repo(&root)? {
        return Ok(not_repo_git_info());
    }
    if current_branch(&root)?.as_deref() != Some("inuse") {
        return Err("Checkpoint commits are only enabled on the inuse branch.".to_string());
    }

    let mut staged_any = false;
    for path in paths {
        for normalized in checkpoint_paths_for(&root, &path)? {
            stage_checkpoint_path(&root, &normalized)?;
            staged_any = true;
        }
    }

    if !staged_any || run_git_status(&root, &["diff", "--cached", "--quiet"])?.success {
        return inspect_git_info(&root, "No checkpoint changes to commit.");
    }

    let message = format!("NotesProject checkpoint: {}", checkpoint_timestamp());
    run_git_checked(
        &root,
        &["commit", "-m", &message],
        "Could not create checkpoint commit. Check Git user.name/user.email.",
    )?;
    inspect_git_info(&root, "Checkpoint committed.")
}

#[tauri::command]
fn list_tree(state: tauri::State<AppState>) -> Result<Vec<TreeEntry>, String> {
    let root = current_root(&state)?;
    read_directory(&root, &root)
}

#[tauri::command]
fn read_note(state: tauri::State<AppState>, path: String) -> Result<NoteContent, String> {
    let root = current_root(&state)?;
    let abs = resolve_safe(&root, &path)?;
    if !is_note_file(&abs) {
        return Err("Only Markdown and Typst files can be opened.".to_string());
    }

    let body = fs::read_to_string(&abs).map_err(|err| format!("Could not read note: {err}"))?;
    let metadata = fs::metadata(&abs).map_err(|err| format!("Could not read metadata: {err}"))?;
    Ok(NoteContent {
        path: to_posix_relative(&root, &abs)?,
        body,
        updated_at: modified_ms(&metadata),
        size: metadata.len(),
    })
}

#[tauri::command]
fn save_note(
    state: tauri::State<AppState>,
    path: String,
    body: String,
) -> Result<NoteContent, String> {
    let root = current_root(&state)?;
    let abs = resolve_safe(&root, &path)?;
    if !is_note_file(&abs) {
        return Err("Only Markdown and Typst files can be saved.".to_string());
    }
    if let Some(parent) = abs.parent() {
        fs::create_dir_all(parent).map_err(|err| format!("Could not create folder: {err}"))?;
    }
    fs::write(&abs, body).map_err(|err| format!("Could not save note: {err}"))?;
    read_note(state, path)
}

#[tauri::command]
fn compile_typst_preview(
    state: tauri::State<AppState>,
    path: String,
    body: String,
    format: Option<TypstPreviewFormat>,
) -> Result<TypstPreview, String> {
    let format = format.unwrap_or(TypstPreviewFormat::Svg);
    let root = current_root(&state)?;
    let normalized = normalize_relative_input(&path)?;
    let source_abs = resolve_safe(&root, &normalized)?;
    if !is_typst_file(&source_abs) {
        return Err("Typst preview is only supported for .typ files.".to_string());
    }
    let source_dir = source_abs
        .parent()
        .ok_or_else(|| "Could not resolve Typst source folder.".to_string())?;
    fs::create_dir_all(source_dir)
        .map_err(|err| format!("Could not create source folder: {err}"))?;

    let output = typst_preview_path(&root, &normalized)?;
    if let Some(parent) = output.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| format!("Could not create Typst preview folder: {err}"))?;
    }

    let embedded_result = compile_typst_embedded(&state, &root, &normalized, &body, format);
    let embedded_error = embedded_result.as_ref().err().cloned();
    match embedded_result {
        Ok(content) => {
            *state
                .typst_preview
                .lock()
                .map_err(|_| "Typst preview state is locked.")? = None;
            return Ok(TypstPreview {
                format,
                content,
                updated_at: now_ms(),
            });
        }
        Err(_) => {
            if matches!(format, TypstPreviewFormat::Html) {
                return Err(
                    embedded_error.unwrap_or_else(|| "Typst HTML preview failed.".to_string())
                );
            }
            // Fall back to the CLI watcher while the embedded resolver path matures.
        }
    }

    let temp_source = typst_preview_source_path(source_dir, &normalized);
    let _ = fs::remove_file(&output);
    fs::write(&temp_source, body)
        .map_err(|err| format!("Could not write Typst preview source: {err}"))?;
    ensure_typst_watch(&state, &root, &temp_source, &output)?;
    wait_for_typst_output(&output, Duration::from_secs(8)).map_err(|watch_err| {
        format!(
            "{} Embedded compiler also failed: {}",
            watch_err,
            embedded_error.unwrap_or_else(|| "unknown error".to_string())
        )
    })?;

    let metadata =
        fs::metadata(&output).map_err(|err| format!("Could not read Typst preview: {err}"))?;
    let bytes = fs::read(&output).map_err(|err| format!("Could not read Typst preview: {err}"))?;
    let content = fallback_pdf_embed_svg(&bytes);
    Ok(TypstPreview {
        format,
        content,
        updated_at: modified_ms(&metadata),
    })
}

#[tauri::command]
fn read_track_state(
    state: tauri::State<AppState>,
    path: String,
) -> Result<Option<TrackState>, String> {
    let root = current_root(&state)?;
    let note_abs = resolve_safe(&root, &path)?;
    if !is_markdown_file(&note_abs) {
        return Err("Track state is only supported for Markdown files.".to_string());
    }
    let sidecar = track_sidecar_path(&root, &path)?;
    if !sidecar.exists() {
        return Ok(None);
    }
    let body =
        fs::read_to_string(&sidecar).map_err(|err| format!("Could not read track state: {err}"))?;
    serde_json::from_str(&body)
        .map(Some)
        .map_err(|err| format!("Could not parse track state: {err}"))
}

#[tauri::command]
fn save_track_state(
    state: tauri::State<AppState>,
    path: String,
    mut track_state: TrackState,
) -> Result<(), String> {
    let root = current_root(&state)?;
    let note_abs = resolve_safe(&root, &path)?;
    if !is_markdown_file(&note_abs) {
        return Err("Track state is only supported for Markdown files.".to_string());
    }
    let normalized = normalize_relative_input(&path)?;
    let sidecar = track_sidecar_path(&root, &normalized)?;
    if let Some(parent) = sidecar.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| format!("Could not create track folder: {err}"))?;
    }
    track_state.path = normalized;
    let body = serde_json::to_string_pretty(&track_state)
        .map_err(|err| format!("Could not serialize track state: {err}"))?;
    fs::write(sidecar, body).map_err(|err| format!("Could not save track state: {err}"))
}

#[tauri::command]
fn delete_track_state(state: tauri::State<AppState>, path: String) -> Result<(), String> {
    let root = current_root(&state)?;
    let sidecar = track_sidecar_path(&root, &path)?;
    if sidecar.exists() {
        recycle_or_delete_path(&sidecar, "Could not delete track state.")?;
    }
    Ok(())
}

#[tauri::command]
fn write_track_merge_candidate(
    state: tauri::State<AppState>,
    path: String,
    body: String,
) -> Result<NoteContent, String> {
    let root = current_root(&state)?;
    let abs = resolve_safe(&root, &path)?;
    if !is_markdown_file(&abs) {
        return Err("Merge candidates are only supported for Markdown files.".to_string());
    }

    let candidate_rel = merge_candidate_path(&path)?;
    let candidate_abs = resolve_safe(&root, &candidate_rel)?;
    if let Some(parent) = candidate_abs.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| format!("Could not create merge candidate folder: {err}"))?;
    }
    fs::write(&candidate_abs, body)
        .map_err(|err| format!("Could not write merge candidate: {err}"))?;
    read_note(state, candidate_rel)
}

#[tauri::command]
fn create_note(
    state: tauri::State<AppState>,
    path: String,
    body: Option<String>,
) -> Result<NoteContent, String> {
    let root = current_root(&state)?;
    let normalized = normalize_note_path(&path)?;
    let abs = resolve_safe(&root, &normalized)?;
    if abs.exists() {
        return Err("A note already exists at that path.".to_string());
    }
    if let Some(parent) = abs.parent() {
        fs::create_dir_all(parent).map_err(|err| format!("Could not create folder: {err}"))?;
    }
    fs::write(&abs, body.unwrap_or_default())
        .map_err(|err| format!("Could not create note: {err}"))?;
    read_note(state, normalized)
}

#[tauri::command]
fn rename_note(
    state: tauri::State<AppState>,
    old_path: String,
    new_path: String,
) -> Result<NoteContent, String> {
    let root = current_root(&state)?;
    let old_abs = resolve_safe(&root, &old_path)?;
    if !is_note_file(&old_abs) {
        return Err("Only Markdown and Typst files can be renamed.".to_string());
    }
    let normalized_new = normalize_note_path(&new_path)?;
    let new_abs = resolve_safe(&root, &normalized_new)?;
    if new_abs.exists() && !same_path_case_insensitive(&old_abs, &new_abs) {
        return Err("A note already exists at the target path.".to_string());
    }
    if let Some(parent) = new_abs.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| format!("Could not create target folder: {err}"))?;
    }
    rename_path(&old_abs, &new_abs).map_err(|err| format!("Could not rename note: {err}"))?;
    move_track_sidecar(&root, &old_path, &normalized_new)?;
    read_note(state, normalized_new)
}

#[tauri::command]
fn delete_note(state: tauri::State<AppState>, path: String) -> Result<(), String> {
    let root = current_root(&state)?;
    let abs = resolve_safe(&root, &path)?;
    if !is_note_file(&abs) {
        return Err("Only Markdown and Typst files can be deleted.".to_string());
    }
    recycle_or_delete_path(&abs, "Could not delete note.")?;
    remove_track_sidecar(&root, &path)?;
    Ok(())
}

#[tauri::command]
fn create_folder(state: tauri::State<AppState>, path: String) -> Result<(), String> {
    let root = current_root(&state)?;
    let normalized = normalize_folder_path(&path)?;
    let abs = resolve_safe(&root, &normalized)?;
    fs::create_dir_all(abs).map_err(|err| format!("Could not create folder: {err}"))
}

#[tauri::command]
fn rename_folder(
    state: tauri::State<AppState>,
    old_path: String,
    new_path: String,
) -> Result<(), String> {
    let root = current_root(&state)?;
    let old_abs = resolve_safe(&root, &old_path)?;
    let normalized_new = normalize_folder_path(&new_path)?;
    let new_abs = resolve_safe(&root, &normalized_new)?;
    if !old_abs.is_dir() {
        return Err("Source folder does not exist.".to_string());
    }
    if new_abs.exists() && !same_path_case_insensitive(&old_abs, &new_abs) {
        return Err("A folder already exists at the target path.".to_string());
    }
    if new_abs.starts_with(&old_abs) && new_abs != old_abs {
        return Err("Cannot move a folder into itself.".to_string());
    }
    if let Some(parent) = new_abs.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| format!("Could not create target folder: {err}"))?;
    }
    rename_path(&old_abs, &new_abs).map_err(|err| format!("Could not rename folder: {err}"))?;
    move_track_sidecar_folder(&root, &old_path, &normalized_new)?;
    Ok(())
}

#[tauri::command]
fn delete_folder(state: tauri::State<AppState>, path: String) -> Result<(), String> {
    let root = current_root(&state)?;
    let normalized = normalize_folder_path(&path)?;
    let abs = resolve_safe(&root, &normalized)?;
    if abs == root {
        return Err("Cannot delete the vault root.".to_string());
    }
    if !abs.is_dir() {
        return Err("Folder does not exist.".to_string());
    }
    recycle_or_delete_path(&abs, "Could not delete folder.")?;
    remove_track_sidecar_folder(&root, &normalized)?;
    Ok(())
}

#[tauri::command]
fn search_content(
    state: tauri::State<AppState>,
    query: String,
    paths: Option<Vec<String>>,
    limit: Option<usize>,
) -> Result<Vec<ContentMatch>, String> {
    let query = query.trim().to_string();
    if query.is_empty() {
        return Ok(Vec::new());
    }

    let root = current_root(&state)?;
    let files = match paths {
        Some(paths) if !paths.is_empty() => paths
            .into_iter()
            .map(|path| resolve_safe(&root, &path))
            .collect::<Result<Vec<_>, _>>()?
            .into_iter()
            .filter(|path| is_note_file(path))
            .collect::<Vec<_>>(),
        _ => collect_note_files(&root)?,
    };

    let mut matches = Vec::new();
    let max = limit.unwrap_or(80).clamp(1, 250);
    let matcher = RegexMatcherBuilder::new()
        .case_insensitive(true)
        .line_terminator(Some(b'\n'))
        .build(&regex::escape(&query))
        .map_err(|err| format!("Could not build search matcher: {err}"))?;
    for file in files {
        if matches.len() >= max {
            break;
        }
        let rel = to_posix_relative(&root, &file)?;
        let mut sink = NoteSearchSink {
            matcher: &matcher,
            rel_path: rel,
            out: &mut matches,
            limit: max,
        };
        let _ = SearcherBuilder::new()
            .line_number(true)
            .multi_line(false)
            .build()
            .search_path(&matcher, &file, &mut sink);
    }

    Ok(matches)
}

#[tauri::command]
fn get_backlinks(
    state: tauri::State<AppState>,
    path: String,
    limit: Option<usize>,
) -> Result<Vec<BacklinkMatch>, String> {
    let root = current_root(&state)?;
    let target_abs = resolve_safe(&root, &path)?;
    if !is_markdown_file(&target_abs) {
        return Err("Backlinks are only supported for Markdown files.".to_string());
    }
    let target_rel = to_posix_relative(&root, &target_abs)?;
    let files = collect_markdown_files(&root)?;
    let note_paths = files
        .iter()
        .map(|file| to_posix_relative(&root, file))
        .collect::<Result<Vec<_>, _>>()?;
    let max = limit.unwrap_or(100).clamp(1, 500);
    let wiki_regex = regex::Regex::new(r"\[\[([^\]\n|#]+)(?:#[^\]\n|]+)?(?:\|[^\]\n]+)?\]\]")
        .map_err(|err| format!("Could not build backlinks matcher: {err}"))?;
    let mut out = Vec::new();

    for file in files {
        if out.len() >= max {
            break;
        }
        let rel = to_posix_relative(&root, &file)?;
        if rel == target_rel {
            continue;
        }
        let Ok(body) = fs::read_to_string(&file) else {
            continue;
        };
        let mut byte_offset = 0usize;
        for (line_index, line) in body.lines().enumerate() {
            for captures in wiki_regex.captures_iter(line) {
                let Some(label) = captures.get(1).map(|label| label.as_str().trim()) else {
                    continue;
                };
                if resolve_wiki_path(label, &note_paths).as_deref() != Some(target_rel.as_str()) {
                    continue;
                }
                let match_offset = captures.get(0).map(|mat| mat.start()).unwrap_or(0);
                out.push(BacklinkMatch {
                    path: rel.clone(),
                    line_number: line_index + 1,
                    line_text: collapse_whitespace(line).chars().take(220).collect(),
                    offset: byte_offset + match_offset,
                });
                if out.len() >= max {
                    break;
                }
            }
            if out.len() >= max {
                break;
            }
            byte_offset += line.len() + 1;
        }
    }

    Ok(out)
}

fn current_root(state: &tauri::State<AppState>) -> Result<PathBuf, String> {
    state
        .vault_root
        .lock()
        .map_err(|_| "Vault state is locked.")?
        .clone()
        .ok_or_else(|| "Open a vault first.".to_string())
}

fn resolve_safe(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let rel_path = Path::new(rel);
    let mut clean = PathBuf::new();
    for component in rel_path.components() {
        match component {
            Component::Normal(part) => clean.push(part),
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err(format!("Path escapes vault: {rel}"));
            }
        }
    }
    Ok(root.join(clean))
}

fn normalize_note_path(path: &str) -> Result<String, String> {
    let mut normalized = normalize_relative_input(path)?;
    if !normalized.to_lowercase().ends_with(".md")
        && !normalized.to_lowercase().ends_with(".markdown")
        && !normalized.to_lowercase().ends_with(".typ")
    {
        normalized.push_str(".md");
    }
    Ok(normalized)
}

fn normalize_folder_path(path: &str) -> Result<String, String> {
    normalize_relative_input(path).map(|path| path.trim_matches('/').to_string())
}

fn normalize_relative_input(path: &str) -> Result<String, String> {
    let normalized = path.trim().replace('\\', "/");
    let normalized = normalized.trim_matches('/').to_string();
    if normalized.is_empty() {
        return Err("Path is required.".to_string());
    }
    if normalized
        .split('/')
        .any(|part| part.is_empty() || part == "." || part == "..")
    {
        return Err("Path must stay inside the vault.".to_string());
    }
    Ok(normalized)
}

fn checkpoint_paths_for(root: &Path, rel: &str) -> Result<Vec<String>, String> {
    let normalized = normalize_relative_input(rel)?;
    let mut paths = vec![normalized.clone()];
    if is_markdown_relative_path(&normalized) {
        let sidecar = to_posix_relative(root, &track_sidecar_path(root, &normalized)?)?;
        if !paths.contains(&sidecar) {
            paths.push(sidecar);
        }
    }
    Ok(paths)
}

fn stage_checkpoint_path(root: &Path, rel: &str) -> Result<(), String> {
    let abs = resolve_safe(root, rel)?;
    if abs.exists() {
        run_git_checked(root, &["add", "--", rel], "Could not stage changed file.")?;
    } else {
        run_git_checked(
            root,
            &["rm", "--ignore-unmatch", "--", rel],
            "Could not stage deleted file.",
        )?;
    }
    Ok(())
}

fn merge_candidate_path(path: &str) -> Result<String, String> {
    let normalized = normalize_note_path(path)?;
    let marker = ".track-merge";
    if let Some(stem) = normalized
        .strip_suffix(".markdown")
        .or_else(|| normalized.strip_suffix(".MARKDOWN"))
    {
        return Ok(format!("{stem}{marker}.markdown"));
    }
    if let Some(stem) = normalized
        .strip_suffix(".md")
        .or_else(|| normalized.strip_suffix(".MD"))
    {
        return Ok(format!("{stem}{marker}.md"));
    }
    Ok(format!("{normalized}{marker}.md"))
}

fn track_root(root: &Path) -> PathBuf {
    root.join(".notesproject").join("track")
}

fn typst_preview_root(root: &Path) -> PathBuf {
    root.join(".notesproject").join("typst-preview")
}

fn typst_preview_path(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let normalized = normalize_relative_input(rel)?;
    let mut path = typst_preview_root(root);
    for part in normalized.split('/') {
        path.push(part);
    }
    path.set_extension("pdf");
    Ok(path)
}

fn typst_preview_source_path(source_dir: &Path, rel: &str) -> PathBuf {
    let mut hasher = DefaultHasher::new();
    rel.hash(&mut hasher);
    source_dir.join(format!(
        ".notesproject-typst-preview-{:016x}.typ",
        hasher.finish()
    ))
}

fn track_sidecar_path(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let normalized = normalize_relative_input(rel)?;
    let mut path = track_root(root);
    for part in normalized.split('/') {
        path.push(part);
    }
    path.set_extension(format!(
        "{}.json",
        path.extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or_default()
    ));
    Ok(path)
}

fn move_track_sidecar(root: &Path, old_rel: &str, new_rel: &str) -> Result<(), String> {
    let old_sidecar = track_sidecar_path(root, old_rel)?;
    if !old_sidecar.exists() {
        return Ok(());
    }
    let new_sidecar = track_sidecar_path(root, new_rel)?;
    if let Some(parent) = new_sidecar.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| format!("Could not create track folder: {err}"))?;
    }
    rename_path(&old_sidecar, &new_sidecar)
        .map_err(|err| format!("Could not move track sidecar: {err}"))
}

fn remove_track_sidecar(root: &Path, rel: &str) -> Result<(), String> {
    let sidecar = track_sidecar_path(root, rel)?;
    if sidecar.exists() {
        recycle_or_delete_path(&sidecar, "Could not remove track sidecar.")?;
    }
    prune_empty_track_dirs(root);
    Ok(())
}

fn move_track_sidecar_folder(root: &Path, old_rel: &str, new_rel: &str) -> Result<(), String> {
    let old_root = track_folder_path(root, old_rel)?;
    if !old_root.exists() {
        return Ok(());
    }
    let new_root = track_folder_path(root, new_rel)?;
    if let Some(parent) = new_root.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| format!("Could not create track folder: {err}"))?;
    }
    rename_path(&old_root, &new_root).map_err(|err| format!("Could not move track folder: {err}"))
}

fn remove_track_sidecar_folder(root: &Path, rel: &str) -> Result<(), String> {
    let sidecar_folder = track_folder_path(root, rel)?;
    if sidecar_folder.exists() {
        recycle_or_delete_path(&sidecar_folder, "Could not remove track folder.")?;
    }
    prune_empty_track_dirs(root);
    Ok(())
}

fn track_folder_path(root: &Path, rel: &str) -> Result<PathBuf, String> {
    let normalized = normalize_folder_path(rel)?;
    let mut path = track_root(root);
    for part in normalized.split('/') {
        path.push(part);
    }
    Ok(path)
}

fn prune_empty_track_dirs(root: &Path) {
    let track = track_root(root);
    let _ = prune_empty_dir(&track, &track);
}

fn prune_empty_dir(root: &Path, dir: &Path) -> std::io::Result<bool> {
    if !dir.exists() {
        return Ok(true);
    }
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() && prune_empty_dir(root, &path)? {
            let _ = fs::remove_dir(&path);
        }
    }
    if dir != root && fs::read_dir(dir)?.next().is_none() {
        fs::remove_dir(dir)?;
        return Ok(true);
    }
    Ok(false)
}

fn same_path_case_insensitive(left: &Path, right: &Path) -> bool {
    left.to_string_lossy().to_lowercase() == right.to_string_lossy().to_lowercase()
}

fn rename_path(old_abs: &Path, new_abs: &Path) -> std::io::Result<()> {
    if same_path_case_insensitive(old_abs, new_abs) && old_abs != new_abs {
        let tmp = old_abs.with_file_name(format!(
            "{}.rename-tmp-{}",
            old_abs
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("tmp"),
            checkpoint_timestamp()
        ));
        fs::rename(old_abs, &tmp)?;
        fs::rename(tmp, new_abs)?;
        return Ok(());
    }
    fs::rename(old_abs, new_abs)
}

fn recycle_or_delete_path(path: &Path, context: &str) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }
    recycle_or_delete_existing_path(path).map_err(|err| format!("{context} {err}"))
}

#[cfg(windows)]
fn recycle_or_delete_existing_path(path: &Path) -> Result<(), String> {
    let script = r#"
Add-Type -AssemblyName Microsoft.VisualBasic
$path = $args[0]
if (Test-Path -LiteralPath $path -PathType Container) {
  [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory(
    $path,
    [Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs,
    [Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin
  )
} else {
  [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile(
    $path,
    [Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs,
    [Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin
  )
}
"#;
    let mut command = Command::new("powershell");
    command
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .arg(path)
        .stdout(Stdio::null());
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    command.creation_flags(CREATE_NO_WINDOW);
    let output = command
        .output()
        .map_err(|err| format!("Could not send item to Recycle Bin: {err}"))?;
    if output.status.success() {
        return Ok(());
    }
    let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if detail.is_empty() {
        Err("Could not send item to Recycle Bin.".to_string())
    } else {
        Err(format!("Could not send item to Recycle Bin: {detail}"))
    }
}

#[cfg(not(windows))]
fn recycle_or_delete_existing_path(path: &Path) -> Result<(), String> {
    if path.is_dir() {
        fs::remove_dir_all(path).map_err(|err| err.to_string())
    } else {
        fs::remove_file(path).map_err(|err| err.to_string())
    }
}

fn read_directory(root: &Path, dir: &Path) -> Result<Vec<TreeEntry>, String> {
    if dir != root {
        return Err("Only root tree listing is supported.".to_string());
    }
    build_tree_from_files(root, collect_note_files(root)?)
}

fn collect_note_files(root: &Path) -> Result<Vec<PathBuf>, String> {
    collect_files(root, is_note_file)
}

fn collect_markdown_files(root: &Path) -> Result<Vec<PathBuf>, String> {
    collect_files(root, is_markdown_file)
}

fn collect_files(root: &Path, include: fn(&Path) -> bool) -> Result<Vec<PathBuf>, String> {
    let mut files = Vec::new();
    let walker = WalkBuilder::new(root)
        .hidden(true)
        .parents(true)
        .git_ignore(true)
        .git_global(true)
        .git_exclude(true)
        .filter_entry(|entry| {
            entry
                .file_name()
                .to_str()
                .map(|name| !should_skip_name(name))
                .unwrap_or(true)
        })
        .build();

    for entry in walker {
        let entry = entry.map_err(|err| format!("Could not walk vault: {err}"))?;
        let path = entry.path();
        if entry
            .file_type()
            .map(|file_type| file_type.is_file())
            .unwrap_or(false)
            && include(path)
        {
            files.push(path.to_path_buf());
        }
    }
    files.sort();
    Ok(files)
}

#[derive(Default)]
struct TreeNode {
    files: Vec<TreeEntry>,
    dirs: BTreeMap<String, TreeNode>,
}

fn build_tree_from_files(root: &Path, files: Vec<PathBuf>) -> Result<Vec<TreeEntry>, String> {
    let mut tree = TreeNode::default();
    for file in files {
        let rel = to_posix_relative(root, &file)?;
        let parts = rel.split('/').collect::<Vec<_>>();
        if parts.is_empty() {
            continue;
        }
        let file_name = parts[parts.len() - 1].to_string();
        let mut node = &mut tree;
        for part in &parts[..parts.len().saturating_sub(1)] {
            node = node.dirs.entry((*part).to_string()).or_default();
        }
        let metadata = fs::metadata(&file).ok();
        node.files.push(TreeEntry {
            path: rel,
            name: file_name,
            kind: EntryKind::File,
            children: Vec::new(),
            updated_at: metadata.as_ref().map(modified_ms),
            size: metadata.as_ref().map(|meta| meta.len()),
        });
    }
    Ok(tree_node_entries("", tree))
}

fn tree_node_entries(prefix: &str, node: TreeNode) -> Vec<TreeEntry> {
    let mut out = Vec::new();
    for (name, child) in node.dirs {
        let path = if prefix.is_empty() {
            name.clone()
        } else {
            format!("{prefix}/{name}")
        };
        let children = tree_node_entries(&path, child);
        if children.is_empty() {
            continue;
        }
        out.push(TreeEntry {
            path,
            name,
            kind: EntryKind::Dir,
            children,
            updated_at: None,
            size: None,
        });
    }
    out.extend(node.files);
    out.sort_by(compare_tree_entries);
    out
}

fn should_skip_name(name: &str) -> bool {
    if name.starts_with('.') {
        return true;
    }
    matches!(
        name,
        "node_modules" | "target" | "dist" | "build" | "__pycache__"
    )
}

fn is_markdown_file(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.eq_ignore_ascii_case("md") || ext.eq_ignore_ascii_case("markdown"))
        .unwrap_or(false)
}

fn is_markdown_relative_path(path: &str) -> bool {
    path.to_lowercase().ends_with(".md") || path.to_lowercase().ends_with(".markdown")
}

fn is_typst_file(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.eq_ignore_ascii_case("typ"))
        .unwrap_or(false)
}

fn is_note_file(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| {
            ext.eq_ignore_ascii_case("md")
                || ext.eq_ignore_ascii_case("markdown")
                || ext.eq_ignore_ascii_case("typ")
        })
        .unwrap_or(false)
}

impl FileResolver for VaultTypstResolver {
    fn resolve_binary(&self, id: FileId) -> FileResult<Cow<'_, Bytes>> {
        let path = id
            .vpath()
            .resolve(&self.root)
            .ok_or_else(|| FileError::NotFound(self.root.clone()))?;
        let bytes = fs::read(&path).map_err(|err| FileError::from_io(err, &path))?;
        Ok(Cow::Owned(Bytes::new(bytes)))
    }

    fn resolve_source(&self, id: FileId) -> FileResult<Cow<'_, Source>> {
        let rel = id
            .vpath()
            .as_rootless_path()
            .components()
            .map(|component| component.as_os_str().to_string_lossy())
            .collect::<Vec<_>>()
            .join("/");
        if let Ok(guard) = self.overlay.lock() {
            if let Some(overlay) = guard.as_ref() {
                if overlay.rel == rel {
                    return Ok(Cow::Owned(Source::new(id, overlay.body.clone())));
                }
            }
        }

        let path = id
            .vpath()
            .resolve(&self.root)
            .ok_or_else(|| FileError::NotFound(self.root.clone()))?;
        let body = fs::read_to_string(&path).map_err(|err| FileError::from_io(err, &path))?;
        Ok(Cow::Owned(Source::new(id, body)))
    }
}

fn compile_typst_embedded(
    state: &tauri::State<AppState>,
    root: &Path,
    rel: &str,
    body: &str,
    format: TypstPreviewFormat,
) -> Result<String, String> {
    let mut session = state
        .typst_embedded
        .lock()
        .map_err(|_| "Embedded Typst state is locked.")?;
    if session
        .as_ref()
        .map(|current| current.root != root)
        .unwrap_or(true)
    {
        *session = Some(start_embedded_typst(root));
    }
    let session = session
        .as_mut()
        .ok_or_else(|| "Embedded Typst state is unavailable.".to_string())?;
    *session
        .overlay
        .lock()
        .map_err(|_| "Embedded Typst overlay is locked.")? = Some(TypstOverlaySource {
        rel: rel.to_string(),
        body: body.to_string(),
    });

    match format {
        TypstPreviewFormat::Svg => {
            let doc: PagedDocument = session
                .engine
                .compile(rel)
                .output
                .map_err(|err| format!("Typst compile failed. {err}"))?;
            Ok(typst_svg::svg_merged(&doc, Abs::pt(12.0)))
        }
        TypstPreviewFormat::Html => {
            let doc: typst_html::HtmlDocument = session
                .engine
                .compile(rel)
                .output
                .map_err(|err| format!("Typst HTML compile failed. {err}"))?;
            typst_html::html(&doc).map_err(|err| format!("Typst HTML export failed. {err:?}"))
        }
    }
}

fn fallback_pdf_embed_svg(pdf: &[u8]) -> String {
    format!(
        r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 180" role="img" aria-label="Typst preview fallback">
<rect width="720" height="180" fill="#f8fafc"/>
<text x="32" y="64" font-family="system-ui, sans-serif" font-size="22" fill="#111827">SVG preview unavailable.</text>
<text x="32" y="104" font-family="system-ui, sans-serif" font-size="15" fill="#4b5563">Compiled PDF fallback is ready ({} bytes), but live preview needs the embedded SVG path.</text>
</svg>"##,
        pdf.len()
    )
}

fn start_embedded_typst(root: &Path) -> EmbeddedTypstSession {
    let overlay = Arc::new(Mutex::new(None));
    let resolver = VaultTypstResolver {
        root: root.to_path_buf(),
        overlay: overlay.clone(),
    };
    let engine = TypstEngine::builder()
        .add_file_resolver(resolver)
        .with_package_file_resolver()
        .search_fonts_with(
            TypstKitFontOptions::default()
                .include_system_fonts(true)
                .include_embedded_fonts(true),
        )
        .build();
    EmbeddedTypstSession {
        root: root.to_path_buf(),
        overlay,
        engine,
    }
}

fn ensure_typst_watch(
    state: &tauri::State<AppState>,
    root: &Path,
    input: &Path,
    output: &Path,
) -> Result<(), String> {
    let mut session = state
        .typst_preview
        .lock()
        .map_err(|_| "Typst preview state is locked.")?;

    let needs_new_session = match session.as_mut() {
        Some(current)
            if current.root == root && current.input == input && current.output == output =>
        {
            match current.child.try_wait() {
                Ok(None) => false,
                Ok(Some(_)) | Err(_) => true,
            }
        }
        Some(_) | None => true,
    };

    if needs_new_session {
        *session = None;
        *session = Some(start_typst_watch(root, input, output)?);
    }

    Ok(())
}

fn start_typst_watch(
    root: &Path,
    input: &Path,
    output: &Path,
) -> Result<TypstPreviewSession, String> {
    let typst = resolve_typst_executable().unwrap_or_else(|| PathBuf::from("typst"));
    let mut command = Command::new(typst);
    command
        .current_dir(root)
        .arg("watch")
        .arg(input)
        .arg(output)
        .arg("--root")
        .arg(root)
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    let child = command.spawn().map_err(|err| {
        format!("Could not run Typst. Make sure typst is installed and on PATH. {err}")
    })?;
    Ok(TypstPreviewSession {
        root: root.to_path_buf(),
        input: input.to_path_buf(),
        output: output.to_path_buf(),
        child,
    })
}

fn wait_for_typst_output(output: &Path, timeout: Duration) -> Result<(), String> {
    let started = Instant::now();
    loop {
        if let Ok(metadata) = fs::metadata(output) {
            if metadata.len() > 0 {
                return Ok(());
            }
        }
        if started.elapsed() >= timeout {
            return Err("Typst preview did not finish compiling in time.".to_string());
        }
        std::thread::sleep(Duration::from_millis(40));
    }
}

fn resolve_typst_executable() -> Option<PathBuf> {
    find_executable_on_path("typst", env::var_os("PATH").as_deref())
        .or_else(resolve_typst_from_platform_path)
}

#[cfg(windows)]
fn resolve_typst_from_platform_path() -> Option<PathBuf> {
    windows_registry_path_values()
        .iter()
        .find_map(|path| find_executable_on_path("typst", Some(path.as_ref())))
}

#[cfg(not(windows))]
fn resolve_typst_from_platform_path() -> Option<PathBuf> {
    None
}

fn find_executable_on_path(name: &str, path: Option<&std::ffi::OsStr>) -> Option<PathBuf> {
    let path = path?;
    env::split_paths(path)
        .flat_map(|dir| {
            executable_names(name)
                .into_iter()
                .map(move |exe| dir.join(exe))
        })
        .find(|candidate| candidate.is_file())
}

#[cfg(windows)]
fn executable_names(name: &str) -> Vec<String> {
    if Path::new(name).extension().is_some() {
        return vec![name.to_string()];
    }
    env::var("PATHEXT")
        .unwrap_or_else(|_| ".COM;.EXE;.BAT;.CMD".to_string())
        .split(';')
        .filter(|ext| !ext.is_empty())
        .map(|ext| format!("{name}{ext}"))
        .collect()
}

#[cfg(not(windows))]
fn executable_names(name: &str) -> Vec<String> {
    vec![name.to_string()]
}

#[cfg(windows)]
fn windows_registry_path_values() -> Vec<std::ffi::OsString> {
    [
        (r"HKCU\Environment", true),
        (
            r"HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment",
            true,
        ),
    ]
    .iter()
    .filter_map(|(key, expand)| windows_registry_path_value(key).map(|path| (path, *expand)))
    .map(|(path, expand)| {
        if expand {
            std::ffi::OsString::from(expand_windows_env_vars(&path))
        } else {
            std::ffi::OsString::from(path)
        }
    })
    .collect()
}

#[cfg(windows)]
fn windows_registry_path_value(key: &str) -> Option<String> {
    let mut command = Command::new("reg");
    command.args(["query", key, "/v", "Path"]);
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    let output = command.output().ok()?;
    if !output.status.success() {
        return None;
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    stdout.lines().find_map(|line| {
        ["REG_EXPAND_SZ", "REG_SZ"].iter().find_map(|marker| {
            line.find(marker)
                .map(|index| line[index + marker.len()..].trim().to_string())
                .filter(|value| !value.is_empty())
        })
    })
}

#[cfg(windows)]
fn expand_windows_env_vars(value: &str) -> String {
    let mut expanded = String::new();
    let mut rest = value;
    while let Some(start) = rest.find('%') {
        expanded.push_str(&rest[..start]);
        let after_start = &rest[start + 1..];
        if let Some(end) = after_start.find('%') {
            let name = &after_start[..end];
            if let Ok(replacement) = env::var(name) {
                expanded.push_str(&replacement);
            } else {
                expanded.push('%');
                expanded.push_str(name);
                expanded.push('%');
            }
            rest = &after_start[end + 1..];
        } else {
            expanded.push_str(&rest[start..]);
            return expanded;
        }
    }
    expanded.push_str(rest);
    expanded
}

fn to_posix_relative(root: &Path, abs: &Path) -> Result<String, String> {
    let rel = abs
        .strip_prefix(root)
        .map_err(|_| "Path is outside the vault.".to_string())?;
    Ok(rel
        .components()
        .map(|component| component.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/"))
}

fn compare_tree_entries(a: &TreeEntry, b: &TreeEntry) -> Ordering {
    match (&a.kind, &b.kind) {
        (EntryKind::Dir, EntryKind::File) => Ordering::Less,
        (EntryKind::File, EntryKind::Dir) => Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    }
}

fn modified_ms(metadata: &fs::Metadata) -> u64 {
    metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn collapse_whitespace(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn resolve_wiki_path(label: &str, note_paths: &[String]) -> Option<String> {
    let normalized = normalize_wiki_label(label);
    if normalized.is_empty() {
        return None;
    }
    note_paths
        .iter()
        .find(|path| normalize_wiki_label(path) == normalized)
        .cloned()
        .or_else(|| {
            note_paths
                .iter()
                .find(|path| normalize_wiki_label(strip_markdown_extension(path)) == normalized)
                .cloned()
        })
        .or_else(|| {
            note_paths
                .iter()
                .find(|path| normalize_wiki_label(&wiki_label(path)) == normalized)
                .cloned()
        })
}

fn wiki_label(path: &str) -> String {
    let normalized = path.replace('\\', "/");
    let name = normalized.rsplit('/').next().unwrap_or(path);
    strip_markdown_extension(name).to_string()
}

fn strip_markdown_extension(value: &str) -> &str {
    value
        .strip_suffix(".md")
        .or_else(|| value.strip_suffix(".MD"))
        .or_else(|| value.strip_suffix(".markdown"))
        .or_else(|| value.strip_suffix(".MARKDOWN"))
        .unwrap_or(value)
}

fn normalize_wiki_label(label: &str) -> String {
    strip_markdown_extension(label)
        .replace('\\', "/")
        .trim()
        .to_lowercase()
}

struct NoteSearchSink<'a> {
    matcher: &'a RegexMatcher,
    rel_path: String,
    out: &'a mut Vec<ContentMatch>,
    limit: usize,
}

impl Sink for NoteSearchSink<'_> {
    type Error = std::io::Error;

    fn matched(
        &mut self,
        _searcher: &grep_searcher::Searcher,
        mat: &SinkMatch<'_>,
    ) -> Result<bool, Self::Error> {
        if self.out.len() >= self.limit {
            return Ok(false);
        }

        let bytes = mat.bytes();
        let range = self
            .matcher
            .find(bytes)
            .map_err(|err| std::io::Error::new(std::io::ErrorKind::Other, err.to_string()))?;
        let Some(range) = range else {
            return Ok(true);
        };
        let line_text = String::from_utf8_lossy(bytes)
            .trim_end_matches(['\r', '\n'])
            .to_string();
        self.out.push(ContentMatch {
            path: self.rel_path.clone(),
            line_number: mat.line_number().unwrap_or(0) as usize,
            line_text: collapse_whitespace(&line_text).chars().take(220).collect(),
            offset: mat.absolute_byte_offset() as usize + range.start(),
        });

        Ok(self.out.len() < self.limit)
    }
}

struct GitRun {
    success: bool,
    stdout: String,
    stderr: String,
}

fn prepare_inuse_branch(root: &Path) -> Result<GitInfo, String> {
    if !git_available(root)? {
        return Ok(GitInfo {
            is_repo: false,
            current_branch: None,
            inuse_branch: None,
            status: GitStatus::GitUnavailable,
            message: "Git is not available on PATH.".to_string(),
        });
    }
    if !is_git_repo(root)? {
        return Ok(not_repo_git_info());
    }

    let branch = current_branch(root)?;
    let dirty = is_worktree_dirty(root)?;
    if branch.as_deref() == Some("inuse") {
        return inspect_git_info(
            root,
            if dirty {
                "Already on inuse branch with uncommitted changes."
            } else {
                "Already on inuse branch."
            },
        );
    }

    if dirty {
        return Ok(GitInfo {
            is_repo: true,
            current_branch: branch,
            inuse_branch: branch_exists(root, "inuse")?.then(|| "inuse".to_string()),
            status: GitStatus::NeedsCheckpoint,
            message: "Uncommitted changes found. Checkpoint before switching to inuse.".to_string(),
        });
    }

    switch_or_create_inuse(root)?;
    inspect_git_info(root, "Using inuse branch.")
}

fn inspect_git_info(root: &Path, message: &str) -> Result<GitInfo, String> {
    let branch = current_branch(root)?;
    let dirty = is_worktree_dirty(root)?;
    Ok(GitInfo {
        is_repo: true,
        current_branch: branch.clone(),
        inuse_branch: branch_exists(root, "inuse")?.then(|| "inuse".to_string()),
        status: if branch.as_deref() == Some("inuse") && dirty {
            GitStatus::DirtyOnInuse
        } else {
            GitStatus::Ready
        },
        message: message.to_string(),
    })
}

fn not_repo_git_info() -> GitInfo {
    GitInfo {
        is_repo: false,
        current_branch: None,
        inuse_branch: None,
        status: GitStatus::NotRepo,
        message: "Vault is not a Git repository.".to_string(),
    }
}

fn git_available(root: &Path) -> Result<bool, String> {
    Ok(run_git_status(root, &["--version"])?.success)
}

fn is_git_repo(root: &Path) -> Result<bool, String> {
    let result = run_git_status(root, &["rev-parse", "--is-inside-work-tree"])?;
    Ok(result.success && result.stdout.trim() == "true")
}

fn current_branch(root: &Path) -> Result<Option<String>, String> {
    let result = run_git_status(root, &["branch", "--show-current"])?;
    if !result.success {
        return Ok(None);
    }
    let branch = result.stdout.trim();
    Ok((!branch.is_empty()).then(|| branch.to_string()))
}

fn branch_exists(root: &Path, branch: &str) -> Result<bool, String> {
    Ok(run_git_status(
        root,
        &[
            "show-ref",
            "--verify",
            "--quiet",
            &format!("refs/heads/{branch}"),
        ],
    )?
    .success)
}

fn is_worktree_dirty(root: &Path) -> Result<bool, String> {
    let result = run_git_checked(
        root,
        &["status", "--porcelain"],
        "Could not inspect Git working tree.",
    )?;
    Ok(!result.stdout.trim().is_empty())
}

fn switch_or_create_inuse(root: &Path) -> Result<(), String> {
    if branch_exists(root, "inuse")? {
        run_git_checked(
            root,
            &["switch", "inuse"],
            "Could not switch to inuse branch.",
        )?;
    } else {
        run_git_checked(
            root,
            &["switch", "-c", "inuse"],
            "Could not create inuse branch.",
        )?;
    }
    Ok(())
}

fn run_git_checked(root: &Path, args: &[&str], context: &str) -> Result<GitRun, String> {
    let result = run_git_status(root, args)?;
    if result.success {
        return Ok(result);
    }
    let detail = if result.stderr.trim().is_empty() {
        result.stdout.trim()
    } else {
        result.stderr.trim()
    };
    if detail.is_empty() {
        Err(context.to_string())
    } else {
        Err(format!("{context} {detail}"))
    }
}

fn run_git_status(root: &Path, args: &[&str]) -> Result<GitRun, String> {
    let mut command = Command::new("git");
    command.current_dir(root).args(args);
    #[cfg(windows)]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    let output = command
        .output()
        .map_err(|err| format!("Could not run Git: {err}"))?;
    Ok(GitRun {
        success: output.status.success(),
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
    })
}

fn checkpoint_timestamp() -> String {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs().to_string())
        .unwrap_or_else(|_| "unknown-time".to_string())
}

fn profile_path() -> Result<PathBuf, String> {
    std::env::current_dir()
        .map(|dir| dir.join("profile.json"))
        .map_err(|err| format!("Could not resolve current directory for profile.json: {err}"))
}

fn default_profile() -> AppProfile {
    AppProfile {
        autosave_delay_ms: 5_000,
        checkpoint_interval_ms: 3 * 60 * 1000,
        typst_preview_debounce_ms: default_typst_preview_debounce_ms(),
        close_markdown_before_track: default_close_markdown_before_track(),
    }
}

fn normalize_profile(profile: AppProfile) -> AppProfile {
    AppProfile {
        autosave_delay_ms: profile.autosave_delay_ms.clamp(1_000, 60_000),
        checkpoint_interval_ms: profile.checkpoint_interval_ms.clamp(60_000, 60 * 60 * 1000),
        typst_preview_debounce_ms: profile.typst_preview_debounce_ms.clamp(50, 5_000),
        close_markdown_before_track: profile.close_markdown_before_track,
    }
}

fn default_typst_preview_debounce_ms() -> u64 {
    250
}

fn default_close_markdown_before_track() -> bool {
    true
}

fn write_profile_file(path: &Path, profile: &AppProfile) -> Result<(), String> {
    let payload = serde_json::to_string_pretty(profile)
        .map_err(|err| format!("Could not serialize profile.json: {err}"))?;
    fs::write(path, format!("{payload}\n"))
        .map_err(|err| format!("Could not write profile.json: {err}"))
}

fn main() {
    tauri::Builder::default()
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            open_vault,
            load_profile,
            watch_vault,
            checkpoint_and_switch_inuse,
            checkpoint_inuse,
            list_tree,
            read_note,
            save_note,
            compile_typst_preview,
            read_track_state,
            save_track_state,
            delete_track_state,
            write_track_merge_candidate,
            create_note,
            rename_note,
            delete_note,
            create_folder,
            rename_folder,
            delete_folder,
            search_content,
            get_backlinks
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
