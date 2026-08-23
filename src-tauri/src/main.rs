#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod private_vault;

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
    private_vault_ready: Mutex<bool>,
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PdfExportResult {
    path: String,
}

#[derive(Clone)]
struct VaultTypstResolver {
    root: PathBuf,
    overlay: Arc<Mutex<Option<TypstOverlaySource>>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct VaultInfo {
    root: String,
    name: String,
    paths_case_sensitive: bool,
    git: GitInfo,
    private_vault: private_vault::PrivateVaultInfo,
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
    out_of_vault: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CreateNoteResult {
    note: NoteContent,
    created_folder: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase", tag = "status")]
enum SaveNoteResult {
    Saved { note: NoteContent },
    Conflict { current: NoteContent },
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DirtyGitFile {
    path: String,
    status: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct CalendarEvent {
    id: String,
    date: String,
    title: String,
    #[serde(default)]
    time: String,
    #[serde(default)]
    notes: String,
    #[serde(default = "default_calendar_recurrence")]
    recurrence: String,
    #[serde(default)]
    recurrence_end_date: String,
}

fn default_calendar_recurrence() -> String {
    "none".to_string()
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
    #[serde(default = "default_git_status_poll_interval_ms")]
    git_status_poll_interval_ms: u64,
    #[serde(default = "default_typst_preview_debounce_ms")]
    typst_preview_debounce_ms: u64,
    #[serde(default = "default_close_markdown_before_track")]
    close_markdown_before_track: bool,
    #[serde(default = "default_persist_recent_files")]
    persist_recent_files: bool,
}

#[tauri::command]
async fn open_vault(state: tauri::State<'_, AppState>, path: String) -> Result<VaultInfo, String> {
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
    let private_configured = private_vault::is_configured(&root);
    let work_root = root.clone();
    let git = tauri::async_runtime::spawn_blocking(move || prepare_inuse_branch(&work_root))
        .await
        .map_err(|err| format!("Vault-opening worker failed: {err}"))??;
    let root_string = display_path(&root);
    *state
        .vault_root
        .lock()
        .map_err(|_| "Vault state is locked.")? = Some(root);
    *state
        .private_vault_ready
        .lock()
        .map_err(|_| "Private-vault state is locked.")? = !private_configured;
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
        paths_case_sensitive: paths_case_sensitive(),
        git,
        private_vault: if private_configured {
            private_vault::PrivateVaultInfo::pending()
        } else {
            private_vault::PrivateVaultInfo::disabled()
        },
    })
}

#[tauri::command]
async fn prepare_private_vault(
    state: tauri::State<'_, AppState>,
    path: String,
    private_password: Option<String>,
) -> Result<private_vault::PrivateVaultInfo, String> {
    let root = current_root(&state)?;
    let requested = PathBuf::from(path.trim())
        .canonicalize()
        .map_err(|err| format!("Could not resolve private vault: {err}"))?;
    if requested != root {
        return Err("The open vault changed before its private folder was ready.".to_string());
    }
    if !private_vault::is_configured(&root) {
        *state
            .private_vault_ready
            .lock()
            .map_err(|_| "Private-vault state is locked.")? = true;
        return Ok(private_vault::PrivateVaultInfo::disabled());
    }

    let work_root = root.clone();
    let prepared = tauri::async_runtime::spawn_blocking(move || {
        let is_git_repo = git_available(&work_root)? && is_git_repo(&work_root)?;
        private_vault::prepare_on_open(&work_root, private_password.as_deref(), is_git_repo)
    })
    .await
    .map_err(|err| format!("Private-vault worker failed: {err}"))??;

    if current_root(&state)? != root {
        return Err(
            "The open vault changed while its private folder was being prepared.".to_string(),
        );
    }
    *state
        .private_vault_ready
        .lock()
        .map_err(|_| "Private-vault state is locked.")? = true;
    Ok(prepared)
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
fn save_profile(profile: AppProfile) -> Result<AppProfile, String> {
    let path = profile_path()?;
    let profile = normalize_profile(profile);
    write_profile_file(&path, &profile)?;
    Ok(profile)
}

#[tauri::command]
async fn checkpoint_and_switch_inuse(state: tauri::State<'_, AppState>) -> Result<GitInfo, String> {
    ensure_private_vault_ready(&state)?;
    let root = current_root(&state)?;
    tauri::async_runtime::spawn_blocking(move || checkpoint_and_switch_inuse_at(&root))
        .await
        .map_err(|err| format!("Checkpoint worker failed: {err}"))?
}

fn checkpoint_and_switch_inuse_at(root: &Path) -> Result<GitInfo, String> {
    if !is_git_repo(root)? {
        return Ok(not_repo_git_info());
    }

    private_vault::sync_if_needed(root)?;
    run_git_checked(
        root,
        &["add", "-A"],
        "Could not stage current vault changes for checkpoint.",
    )?;
    stage_private_archive(root)?;
    let has_staged = !run_git_status(root, &["diff", "--cached", "--quiet"])?.success;
    if has_staged {
        let message = format!(
            "NotesProject checkpoint before inuse: {}",
            checkpoint_timestamp()
        );
        run_git_checked(
            root,
            &["commit", "-m", &message],
            "Could not create checkpoint commit. Check Git user.name/user.email.",
        )?;
    }

    switch_or_create_inuse(root)?;
    inspect_git_info(root, "Using inuse branch.")
}

#[tauri::command]
async fn checkpoint_inuse(
    state: tauri::State<'_, AppState>,
    paths: Vec<String>,
) -> Result<GitInfo, String> {
    ensure_private_vault_ready(&state)?;
    let root = current_root(&state)?;
    tauri::async_runtime::spawn_blocking(move || checkpoint_inuse_at(&root, paths))
        .await
        .map_err(|err| format!("Checkpoint worker failed: {err}"))?
}

fn checkpoint_inuse_at(root: &Path, paths: Vec<String>) -> Result<GitInfo, String> {
    if !is_git_repo(root)? {
        return Ok(not_repo_git_info());
    }
    if current_branch(root)?.as_deref() != Some("inuse") {
        return Err("Checkpoint commits are only enabled on the inuse branch.".to_string());
    }

    private_vault::sync_if_needed(root)?;
    let mut staged_any = stage_private_archive(root)?;
    for path in paths {
        for normalized in checkpoint_paths_for(root, &path)? {
            stage_checkpoint_path(root, &normalized)?;
            staged_any = true;
        }
    }

    if !staged_any || run_git_status(root, &["diff", "--cached", "--quiet"])?.success {
        return inspect_git_info(root, "No checkpoint changes to commit.");
    }

    let message = format!("NotesProject checkpoint: {}", checkpoint_timestamp());
    run_git_checked(
        root,
        &["commit", "-m", &message],
        "Could not create checkpoint commit. Check Git user.name/user.email.",
    )?;
    inspect_git_info(root, "Checkpoint committed.")
}

#[tauri::command]
async fn checkpoint_vault(state: tauri::State<'_, AppState>) -> Result<GitInfo, String> {
    ensure_private_vault_ready(&state)?;
    let root = current_root(&state)?;
    tauri::async_runtime::spawn_blocking(move || checkpoint_vault_at(&root))
        .await
        .map_err(|err| format!("Checkpoint worker failed: {err}"))?
}

fn checkpoint_vault_at(root: &Path) -> Result<GitInfo, String> {
    if !is_git_repo(root)? {
        return Ok(not_repo_git_info());
    }

    private_vault::sync_if_needed(root)?;
    run_git_checked(root, &["add", "."], "Could not stage vault changes.")?;
    stage_private_archive(root)?;
    if run_git_status(root, &["diff", "--cached", "--quiet"])?.success {
        return inspect_git_info(root, "No checkpoint changes to commit.");
    }

    run_git_checked(
        root,
        &["commit", "-m", "auto"],
        "Could not create checkpoint commit. Check Git user.name/user.email.",
    )?;
    inspect_git_info(root, "Checkpoint committed.")
}

#[tauri::command]
fn refresh_git_info(state: tauri::State<AppState>) -> Result<GitInfo, String> {
    let root = current_root(&state)?;
    if !git_available(&root)? {
        return Ok(GitInfo {
            is_repo: false,
            current_branch: None,
            inuse_branch: None,
            status: GitStatus::GitUnavailable,
            message: "Git is not available on PATH.".to_string(),
        });
    }
    if !is_git_repo(&root)? {
        return Ok(not_repo_git_info());
    }
    inspect_git_info(&root, "Git status refreshed.")
}

#[tauri::command]
fn dirty_git_files(state: tauri::State<AppState>) -> Result<Vec<DirtyGitFile>, String> {
    let root = current_root(&state)?;
    if !git_available(&root)? {
        return Err("Git is not available on PATH.".to_string());
    }
    if !is_git_repo(&root)? {
        return Ok(Vec::new());
    }
    let result = run_git_checked(
        &root,
        &["status", "--porcelain"],
        "Could not inspect Git working tree.",
    )?;
    Ok(result
        .stdout
        .lines()
        .map(str::trim_end)
        .filter(|line| !line.trim().is_empty())
        .map(parse_dirty_git_file)
        .collect())
}

#[tauri::command]
fn list_tree(state: tauri::State<AppState>) -> Result<Vec<TreeEntry>, String> {
    let root = current_root(&state)?;
    read_directory(&root, &root, private_vault_is_ready(&state)?)
}

#[tauri::command]
fn read_calendar_events(state: tauri::State<AppState>) -> Result<Vec<CalendarEvent>, String> {
    let root = current_root(&state)?;
    let path = calendar_events_path(&root);
    if !path.exists() {
        return Ok(Vec::new());
    }
    let body = fs::read_to_string(&path)
        .map_err(|err| format!("Could not read calendar events: {err}"))?;
    if body.trim().is_empty() {
        return Ok(Vec::new());
    }
    serde_json::from_str(&body).map_err(|err| format!("Could not parse calendar events: {err}"))
}

#[tauri::command]
fn save_calendar_events(
    state: tauri::State<AppState>,
    events: Vec<CalendarEvent>,
) -> Result<(), String> {
    let root = current_root(&state)?;
    let path = calendar_events_path(&root);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| format!("Could not create calendar folder: {err}"))?;
    }
    let body = serde_json::to_string_pretty(&events)
        .map_err(|err| format!("Could not serialize calendar events: {err}"))?;
    fs::write(path, format!("{body}\n"))
        .map_err(|err| format!("Could not save calendar events: {err}"))
}

#[tauri::command]
fn read_note(state: tauri::State<AppState>, path: String) -> Result<NoteContent, String> {
    ensure_private_path_ready(&state, &path)?;
    let root = current_root(&state)?;
    let resolved = resolve_document_path(&root, &path)?;
    let abs = resolved.abs;
    if !is_note_file(&abs) {
        return Err("Only Markdown and Typst files can be opened.".to_string());
    }

    let abs = abs
        .canonicalize()
        .map_err(|err| format!("Could not resolve note path: {err}"))?;
    let body = fs::read_to_string(&abs).map_err(|err| format!("Could not read note: {err}"))?;
    let metadata = fs::metadata(&abs).map_err(|err| format!("Could not read metadata: {err}"))?;
    Ok(NoteContent {
        path: document_display_path(&root, &abs, resolved.out_of_vault)?,
        body,
        updated_at: modified_ms(&metadata),
        size: metadata.len(),
        out_of_vault: resolved.out_of_vault,
    })
}

#[tauri::command]
fn save_note(
    state: tauri::State<AppState>,
    path: String,
    body: String,
) -> Result<NoteContent, String> {
    ensure_private_path_ready(&state, &path)?;
    let root = current_root(&state)?;
    let resolved = resolve_document_path_for_write(&root, &path)?;
    let abs = resolved.abs;
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
fn save_note_if_unchanged(
    state: tauri::State<AppState>,
    path: String,
    body: String,
    expected_body: String,
) -> Result<SaveNoteResult, String> {
    ensure_private_path_ready(&state, &path)?;
    let root = current_root(&state)?;
    let resolved = resolve_document_path_for_write(&root, &path)?;
    let abs = resolved.abs;
    if !is_note_file(&abs) {
        return Err("Only Markdown and Typst files can be saved.".to_string());
    }

    let current_body =
        fs::read_to_string(&abs).map_err(|err| format!("Could not read note: {err}"))?;
    if current_body != expected_body {
        return Ok(SaveNoteResult::Conflict {
            current: read_note(state, path)?,
        });
    }

    write_note_atomically(&abs, &body)?;
    Ok(SaveNoteResult::Saved {
        note: read_note(state, path)?,
    })
}

#[tauri::command]
fn compile_typst_preview(
    state: tauri::State<AppState>,
    path: String,
    body: String,
    format: Option<TypstPreviewFormat>,
) -> Result<TypstPreview, String> {
    ensure_private_path_ready(&state, &path)?;
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
fn export_pdf(
    state: tauri::State<AppState>,
    path: String,
    body: String,
) -> Result<PdfExportResult, String> {
    ensure_private_path_ready(&state, &path)?;
    let root = current_root(&state)?;
    let normalized = normalize_relative_input(&path)?;
    let source_abs = resolve_safe(&root, &normalized)?;
    if !is_note_file(&source_abs) {
        return Err("Only Markdown and Typst notes can be exported.".to_string());
    }

    let output_rel = pdf_export_path_for(&normalized)?;
    let output_abs = resolve_safe(&root, &output_rel)?;
    let parent = output_abs
        .parent()
        .ok_or_else(|| "Could not resolve PDF export folder.".to_string())?;
    fs::create_dir_all(parent).map_err(|err| format!("Could not create PDF folder: {err}"))?;

    if is_typst_file(&source_abs) {
        export_typst_pdf(&state, &root, &normalized, &body, &output_abs)?;
    } else {
        export_markdown_pdf_with_pandoc(&root, &source_abs, &body, &output_abs)?;
    }

    Ok(PdfExportResult { path: output_rel })
}

#[tauri::command]
fn read_track_state(
    state: tauri::State<AppState>,
    path: String,
) -> Result<Option<TrackState>, String> {
    ensure_private_path_ready(&state, &path)?;
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
    ensure_private_path_ready(&state, &path)?;
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
    ensure_private_path_ready(&state, &path)?;
    let root = current_root(&state)?;
    let sidecar = track_sidecar_path(&root, &path)?;
    if sidecar.exists() {
        delete_path(&sidecar, "Could not delete track state.")?;
    }
    Ok(())
}

#[tauri::command]
fn write_track_merge_candidate(
    state: tauri::State<AppState>,
    path: String,
    body: String,
) -> Result<NoteContent, String> {
    ensure_private_path_ready(&state, &path)?;
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
) -> Result<CreateNoteResult, String> {
    ensure_private_path_ready(&state, &path)?;
    let root = current_root(&state)?;
    let candidate = with_default_note_extension(document_path_candidate(&root, &path)?);
    let resolved = resolve_document_candidate_for_write(&root, candidate)?;
    let abs = resolved.abs;
    if abs.exists() {
        return Err("A note already exists at that path.".to_string());
    }
    let mut parent_created = false;
    if let Some(parent) = abs.parent() {
        parent_created = !parent.exists();
        fs::create_dir_all(parent).map_err(|err| format!("Could not create folder: {err}"))?;
    }
    fs::write(&abs, body.unwrap_or_default())
        .map_err(|err| format!("Could not create note: {err}"))?;
    let display = document_display_path(&root, &abs, resolved.out_of_vault)?;
    let created_folder = if !resolved.out_of_vault {
        display
            .rsplit_once('/')
            .and_then(|(folder, _)| (!folder.is_empty()).then(|| folder.to_string()))
    } else {
        None
    };
    Ok(CreateNoteResult {
        note: read_note(state, display)?,
        created_folder: parent_created.then_some(created_folder).flatten(),
    })
}

#[tauri::command]
fn rename_note(
    state: tauri::State<AppState>,
    old_path: String,
    new_path: String,
) -> Result<NoteContent, String> {
    ensure_private_path_ready(&state, &old_path)?;
    ensure_private_path_ready(&state, &new_path)?;
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
    ensure_private_path_ready(&state, &path)?;
    let root = current_root(&state)?;
    let abs = resolve_safe(&root, &path)?;
    if !is_note_file(&abs) {
        return Err("Only Markdown and Typst files can be deleted.".to_string());
    }
    delete_path(&abs, "Could not delete note.")?;
    remove_track_sidecar(&root, &path)?;
    Ok(())
}

#[tauri::command]
fn create_folder(state: tauri::State<AppState>, path: String) -> Result<String, String> {
    ensure_private_path_ready(&state, &path)?;
    let root = current_root(&state)?;
    let normalized = normalize_folder_path(&path)?;
    let abs = resolve_safe(&root, &normalized)?;
    if abs.exists() {
        return Err(if abs.is_dir() {
            "A folder already exists at that path.".to_string()
        } else {
            "A file already exists at that path.".to_string()
        });
    }
    fs::create_dir_all(abs).map_err(|err| format!("Could not create folder: {err}"))?;
    Ok(normalized)
}

#[tauri::command]
fn rename_folder(
    state: tauri::State<AppState>,
    old_path: String,
    new_path: String,
) -> Result<(), String> {
    ensure_private_path_ready(&state, &old_path)?;
    ensure_private_path_ready(&state, &new_path)?;
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
    ensure_private_path_ready(&state, &path)?;
    let root = current_root(&state)?;
    let normalized = normalize_folder_path(&path)?;
    let abs = resolve_safe(&root, &normalized)?;
    if abs == root {
        return Err("Cannot delete the vault root.".to_string());
    }
    if !abs.is_dir() {
        return Err("Folder does not exist.".to_string());
    }
    delete_path(&abs, "Could not delete folder.")?;
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
    let private_ready = private_vault_is_ready(&state)?;
    let files = match paths {
        Some(paths) if !paths.is_empty() => paths
            .into_iter()
            .filter(|path| private_ready || !private_vault::is_plaintext_relative_path(path))
            .map(|path| resolve_safe(&root, &path))
            .collect::<Result<Vec<_>, _>>()?
            .into_iter()
            .filter(|path| is_note_file(path))
            .collect::<Vec<_>>(),
        _ => collect_note_files(&root, private_ready)?,
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
    ensure_private_path_ready(&state, &path)?;
    let root = current_root(&state)?;
    let private_ready = private_vault_is_ready(&state)?;
    let target_abs = resolve_safe(&root, &path)?;
    if !is_markdown_file(&target_abs) {
        return Err("Backlinks are only supported for Markdown files.".to_string());
    }
    let target_rel = to_posix_relative(&root, &target_abs)?;
    let files = collect_markdown_files(&root, private_ready)?;
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

fn private_vault_is_ready(state: &tauri::State<AppState>) -> Result<bool, String> {
    state
        .private_vault_ready
        .lock()
        .map(|ready| *ready)
        .map_err(|_| "Private-vault state is locked.".to_string())
}

fn ensure_private_vault_ready(state: &tauri::State<AppState>) -> Result<(), String> {
    if private_vault_is_ready(state)? {
        Ok(())
    } else {
        Err("The private .h folder is still being prepared.".to_string())
    }
}

fn ensure_private_path_ready(state: &tauri::State<AppState>, path: &str) -> Result<(), String> {
    if private_vault::is_plaintext_relative_path(path) {
        ensure_private_vault_ready(state)
    } else {
        Ok(())
    }
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

struct ResolvedDocumentPath {
    abs: PathBuf,
    out_of_vault: bool,
}

fn resolve_document_path(root: &Path, path: &str) -> Result<ResolvedDocumentPath, String> {
    let candidate = document_path_candidate(root, path)?;
    let abs = candidate
        .canonicalize()
        .map_err(|err| format!("Could not resolve note path: {err}"))?;
    Ok(ResolvedDocumentPath {
        out_of_vault: !path_is_inside(&abs, root),
        abs,
    })
}

fn resolve_document_path_for_write(
    root: &Path,
    path: &str,
) -> Result<ResolvedDocumentPath, String> {
    let candidate = document_path_candidate(root, path)?;
    resolve_document_candidate_for_write(root, candidate)
}

fn resolve_document_candidate_for_write(
    root: &Path,
    candidate: PathBuf,
) -> Result<ResolvedDocumentPath, String> {
    if candidate.exists() {
        let abs = candidate
            .canonicalize()
            .map_err(|err| format!("Could not resolve note path: {err}"))?;
        return Ok(ResolvedDocumentPath {
            out_of_vault: !path_is_inside(&abs, root),
            abs,
        });
    }
    let parent = candidate
        .parent()
        .ok_or_else(|| "Could not resolve note folder.".to_string())?;
    let parent = parent
        .canonicalize()
        .map_err(|err| format!("Could not resolve note folder: {err}"))?;
    let file_name = candidate
        .file_name()
        .ok_or_else(|| "Note path must include a file name.".to_string())?;
    let abs = parent.join(file_name);
    Ok(ResolvedDocumentPath {
        out_of_vault: !path_is_inside(&abs, root),
        abs,
    })
}

fn document_path_candidate(root: &Path, path: &str) -> Result<PathBuf, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("Path is required.".to_string());
    }
    let raw = PathBuf::from(trimmed);
    if raw.is_absolute() {
        Ok(raw)
    } else {
        Ok(root.join(raw))
    }
}

fn with_default_note_extension(path: PathBuf) -> PathBuf {
    let lower = path.to_string_lossy().to_lowercase();
    if lower.ends_with(".md") || lower.ends_with(".markdown") || lower.ends_with(".typ") {
        return path;
    }
    let mut path = path;
    path.set_extension("md");
    path
}

fn document_display_path(root: &Path, abs: &Path, out_of_vault: bool) -> Result<String, String> {
    if out_of_vault {
        Ok(display_path(abs))
    } else {
        to_posix_relative(root, abs)
    }
}

fn path_is_inside(path: &Path, root: &Path) -> bool {
    path.starts_with(root)
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
    if private_vault::is_plaintext_relative_path(&normalized) {
        return Ok(Vec::new());
    }
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

fn stage_private_archive(root: &Path) -> Result<bool, String> {
    if !root.join(".h.zip").is_file() {
        return Ok(false);
    }
    run_git_checked(
        root,
        &["add", "-f", "--", ".h.zip"],
        "Could not stage encrypted private archive.",
    )?;
    Ok(true)
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

fn calendar_events_path(root: &Path) -> PathBuf {
    root.join(".vault-calendar").join("events.json")
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

fn pdf_export_path_for(rel: &str) -> Result<String, String> {
    let normalized = normalize_relative_input(rel)?;
    let mut path = PathBuf::new();
    for part in normalized.split('/') {
        path.push(part);
    }
    path.set_extension("pdf");
    Ok(path
        .components()
        .map(|component| component.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/"))
}

fn temp_export_source_path(source: &Path, extension: &str) -> PathBuf {
    let parent = source.parent().unwrap_or_else(|| Path::new("."));
    let stem = source
        .file_stem()
        .and_then(|name| name.to_str())
        .unwrap_or("note");
    let stamp = now_ms();
    let mut counter = 0u32;
    loop {
        let candidate = parent.join(format!(".{stem}.export.{stamp}.{counter}.{extension}"));
        if !candidate.exists() {
            return candidate;
        }
        counter += 1;
    }
}

fn temp_export_output_path(output: &Path) -> PathBuf {
    let parent = output.parent().unwrap_or_else(|| Path::new("."));
    let stem = output
        .file_stem()
        .and_then(|name| name.to_str())
        .unwrap_or("export");
    let stamp = now_ms();
    let mut counter = 0u32;
    loop {
        let candidate = parent.join(format!(".{stem}.export.{stamp}.{counter}.tmp.pdf"));
        if !candidate.exists() {
            return candidate;
        }
        counter += 1;
    }
}

fn export_markdown_pdf_with_pandoc(
    root: &Path,
    source: &Path,
    body: &str,
    output: &Path,
) -> Result<(), String> {
    ensure_command_available(
        "pandoc",
        "Pandoc is required to export Markdown notes to PDF.",
    )?;
    let temp_source = temp_export_source_path(source, "md");
    let temp_output = temp_export_output_path(output);
    let result = (|| -> Result<(), String> {
        fs::write(&temp_source, body)
            .map_err(|err| format!("Could not write temporary Markdown export source: {err}"))?;
        let source_dir = source
            .parent()
            .ok_or_else(|| "Could not resolve note folder.".to_string())?;
        let resource_path = env::join_paths([source_dir, root])
            .map_err(|err| format!("Could not build Pandoc resource path: {err}"))?;
        let mut command = Command::new("pandoc");
        hide_command_window(&mut command);
        let output_result = command
            .current_dir(source_dir)
            .arg(&temp_source)
            .arg("--from")
            .arg("markdown+tex_math_dollars+tex_math_single_backslash")
            .arg("--pdf-engine=typst")
            .arg("--resource-path")
            .arg(&resource_path)
            .arg("-o")
            .arg(&temp_output)
            .output()
            .map_err(|err| format!("Could not run pandoc: {err}"))?;
        if !output_result.status.success() {
            return Err(format_command_failure("pandoc", &output_result));
        }
        replace_file(&temp_output, output)
            .map_err(|err| format!("Could not replace PDF: {err}"))?;
        Ok(())
    })();
    let _ = fs::remove_file(&temp_source);
    if result.is_err() {
        let _ = fs::remove_file(&temp_output);
    }
    result
}

fn ensure_command_available(command: &str, context: &str) -> Result<(), String> {
    let mut command_process = Command::new(command);
    hide_command_window(&mut command_process);
    let output = command_process
        .arg("--version")
        .output()
        .map_err(|_| format!("{context} Install {command} and make sure it is on PATH."))?;
    if output.status.success() {
        Ok(())
    } else {
        Err(format_command_failure(command, &output))
    }
}

fn hide_command_window(command: &mut Command) {
    #[cfg(windows)]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
}

fn export_typst_pdf(
    state: &tauri::State<AppState>,
    root: &Path,
    rel: &str,
    body: &str,
    output: &Path,
) -> Result<(), String> {
    let temp_output = temp_export_output_path(output);
    let result = (|| -> Result<(), String> {
        let pdf = compile_typst_pdf_embedded(state, root, rel, body)?;
        fs::write(&temp_output, pdf).map_err(|err| format!("Could not write PDF: {err}"))?;
        replace_file(&temp_output, output)
            .map_err(|err| format!("Could not replace PDF: {err}"))?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temp_output);
    }
    result
}

fn format_command_failure(command: &str, output: &std::process::Output) -> String {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if !stderr.is_empty() {
        format!("{command} failed: {stderr}")
    } else if !stdout.is_empty() {
        format!("{command} failed: {stdout}")
    } else {
        format!("{command} failed with status {}", output.status)
    }
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
        delete_path(&sidecar, "Could not remove track sidecar.")?;
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
        delete_path(&sidecar_folder, "Could not remove track folder.")?;
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

fn delete_path(path: &Path, context: &str) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }
    if path.is_dir() {
        fs::remove_dir_all(path).map_err(|err| format!("{context} {err}"))
    } else {
        fs::remove_file(path).map_err(|err| format!("{context} {err}"))
    }
}

fn read_directory(
    root: &Path,
    dir: &Path,
    include_private: bool,
) -> Result<Vec<TreeEntry>, String> {
    if dir != root {
        return Err("Only root tree listing is supported.".to_string());
    }
    build_tree(
        root,
        collect_note_files(root, include_private)?,
        collect_folders(root, include_private)?,
    )
}

fn collect_note_files(root: &Path, include_private: bool) -> Result<Vec<PathBuf>, String> {
    collect_files(root, is_note_file, include_private)
}

fn collect_markdown_files(root: &Path, include_private: bool) -> Result<Vec<PathBuf>, String> {
    collect_files(root, is_markdown_file, include_private)
}

fn collect_folders(root: &Path, include_private: bool) -> Result<Vec<PathBuf>, String> {
    let mut folders = Vec::new();
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
        if path != root
            && entry
                .file_type()
                .map(|file_type| file_type.is_dir())
                .unwrap_or(false)
        {
            folders.push(path.to_path_buf());
        }
    }
    let private_root = root.join(".h");
    if include_private && private_root.is_dir() {
        let walker = WalkBuilder::new(&private_root)
            .hidden(false)
            .parents(false)
            .git_ignore(false)
            .git_global(false)
            .git_exclude(false)
            .build();
        for entry in walker {
            let entry =
                entry.map_err(|err| format!("Could not walk private vault folder: {err}"))?;
            if entry
                .file_type()
                .map(|file_type| file_type.is_dir())
                .unwrap_or(false)
            {
                folders.push(entry.path().to_path_buf());
            }
        }
    }
    folders.sort();
    folders.dedup();
    Ok(folders)
}

fn collect_files(
    root: &Path,
    include: fn(&Path) -> bool,
    include_private: bool,
) -> Result<Vec<PathBuf>, String> {
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
    let private_root = root.join(".h");
    if include_private && private_root.is_dir() {
        let walker = WalkBuilder::new(&private_root)
            .hidden(false)
            .parents(false)
            .git_ignore(false)
            .git_global(false)
            .git_exclude(false)
            .build();
        for entry in walker {
            let entry =
                entry.map_err(|err| format!("Could not walk private vault folder: {err}"))?;
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
    }
    files.sort();
    files.dedup();
    Ok(files)
}

#[derive(Default)]
struct TreeNode {
    files: Vec<TreeEntry>,
    dirs: BTreeMap<String, TreeNode>,
}

fn build_tree(
    root: &Path,
    files: Vec<PathBuf>,
    folders: Vec<PathBuf>,
) -> Result<Vec<TreeEntry>, String> {
    let mut tree = TreeNode::default();
    for folder in folders {
        let rel = to_posix_relative(root, &folder)?;
        let mut node = &mut tree;
        for part in rel.split('/').filter(|part| !part.is_empty()) {
            node = node.dirs.entry(part.to_string()).or_default();
        }
    }
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
    with_embedded_typst_session(state, root, rel, body, |session| match format {
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
    })
}

fn compile_typst_pdf_embedded(
    state: &tauri::State<AppState>,
    root: &Path,
    rel: &str,
    body: &str,
) -> Result<Vec<u8>, String> {
    with_embedded_typst_session(state, root, rel, body, |session| {
        let doc: PagedDocument = session
            .engine
            .compile(rel)
            .output
            .map_err(|err| format!("Typst compile failed. {err}"))?;
        typst_pdf::pdf(&doc, &typst_pdf::PdfOptions::default())
            .map_err(|err| format!("Typst PDF export failed. {err:?}"))
    })
}

fn with_embedded_typst_session<T>(
    state: &tauri::State<AppState>,
    root: &Path,
    rel: &str,
    body: &str,
    f: impl FnOnce(&mut EmbeddedTypstSession) -> Result<T, String>,
) -> Result<T, String> {
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
    f(session)
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

fn write_note_atomically(path: &Path, body: &str) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "Could not resolve note folder.".to_string())?;
    fs::create_dir_all(parent).map_err(|err| format!("Could not create folder: {err}"))?;

    let temp = temp_note_path(path);
    let write_result = (|| -> Result<(), String> {
        {
            let mut file = fs::File::create(&temp)
                .map_err(|err| format!("Could not create temporary note file: {err}"))?;
            use std::io::Write;
            file.write_all(body.as_bytes())
                .map_err(|err| format!("Could not write temporary note file: {err}"))?;
            file.sync_all()
                .map_err(|err| format!("Could not flush temporary note file: {err}"))?;
        }
        replace_file(&temp, path)
    })();

    if write_result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    write_result
}

fn temp_note_path(path: &Path) -> PathBuf {
    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("note");
    let stamp = now_ms();
    let mut counter = 0u32;
    loop {
        let candidate = parent.join(format!(".{file_name}.{stamp}.{counter}.tmp"));
        if !candidate.exists() {
            return candidate;
        }
        counter += 1;
    }
}

#[cfg(windows)]
fn replace_file(temp: &Path, target: &Path) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };

    let temp_wide = temp
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let target_wide = target
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();

    let ok = unsafe {
        MoveFileExW(
            temp_wide.as_ptr(),
            target_wide.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if ok == 0 {
        Err(format!(
            "Could not replace note: {}",
            std::io::Error::last_os_error()
        ))
    } else {
        Ok(())
    }
}

#[cfg(not(windows))]
fn replace_file(temp: &Path, target: &Path) -> Result<(), String> {
    fs::rename(temp, target).map_err(|err| format!("Could not replace note: {err}"))
}

fn display_path(path: &Path) -> String {
    strip_windows_extended_path_prefix(&path.to_string_lossy())
}

fn strip_windows_extended_path_prefix(path: &str) -> String {
    if let Some(rest) = path.strip_prefix(r"\\?\UNC\") {
        return format!(r"\\{rest}");
    }
    path.strip_prefix(r"\\?\").unwrap_or(path).to_string()
}

#[cfg(windows)]
fn paths_case_sensitive() -> bool {
    false
}

#[cfg(not(windows))]
fn paths_case_sensitive() -> bool {
    true
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

fn parse_dirty_git_file(line: &str) -> DirtyGitFile {
    let raw_status = line.get(..2).unwrap_or(line).trim();
    let status = if raw_status.contains('D') {
        "deleted"
    } else if raw_status.contains('A') || raw_status.contains('?') {
        "added"
    } else if raw_status.contains('R') {
        "renamed"
    } else {
        "modified"
    };
    let path = line.get(3..).unwrap_or(line).trim();
    DirtyGitFile {
        path: path
            .rsplit_once(" -> ")
            .map(|(_, next)| next)
            .unwrap_or(path)
            .trim_matches('"')
            .to_string(),
        status: status.to_string(),
    }
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
        git_status_poll_interval_ms: default_git_status_poll_interval_ms(),
        typst_preview_debounce_ms: default_typst_preview_debounce_ms(),
        close_markdown_before_track: default_close_markdown_before_track(),
        persist_recent_files: default_persist_recent_files(),
    }
}

fn normalize_profile(profile: AppProfile) -> AppProfile {
    AppProfile {
        autosave_delay_ms: profile.autosave_delay_ms.clamp(1_000, 60_000),
        checkpoint_interval_ms: profile.checkpoint_interval_ms.clamp(60_000, 60 * 60 * 1000),
        git_status_poll_interval_ms: profile
            .git_status_poll_interval_ms
            .clamp(60_000, 60 * 60 * 1000),
        typst_preview_debounce_ms: profile.typst_preview_debounce_ms.clamp(50, 5_000),
        close_markdown_before_track: profile.close_markdown_before_track,
        persist_recent_files: profile.persist_recent_files,
    }
}

fn default_git_status_poll_interval_ms() -> u64 {
    5 * 60 * 1000
}

fn default_typst_preview_debounce_ms() -> u64 {
    250
}

fn default_close_markdown_before_track() -> bool {
    true
}

fn default_persist_recent_files() -> bool {
    true
}

fn write_profile_file(path: &Path, profile: &AppProfile) -> Result<(), String> {
    let payload = serde_json::to_string_pretty(profile)
        .map_err(|err| format!("Could not serialize profile.json: {err}"))?;
    fs::write(path, format!("{payload}\n"))
        .map_err(|err| format!("Could not write profile.json: {err}"))
}

#[cfg(test)]
mod private_checkpoint_tests {
    use super::*;

    fn test_root(name: &str) -> PathBuf {
        let root = env::temp_dir().join(format!(
            "notesproject-main-test-{name}-{}-{}",
            std::process::id(),
            now_ms()
        ));
        fs::create_dir_all(&root).unwrap();
        root
    }

    #[test]
    fn private_notes_are_hidden_from_collection_until_ready() {
        let root = test_root("private-pending");
        fs::write(root.join("public.md"), "public").unwrap();
        fs::create_dir(root.join(".h")).unwrap();
        fs::write(root.join(".h/secret.md"), "secret").unwrap();

        let pending = collect_note_files(&root, false).unwrap();
        assert_eq!(pending, vec![root.join("public.md")]);

        let ready = collect_note_files(&root, true).unwrap();
        assert!(ready.contains(&root.join("public.md")));
        assert!(ready.contains(&root.join(".h/secret.md")));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn private_vault_archive_is_force_staged_even_when_dotfiles_are_ignored() {
        let root = test_root("private-stage");
        let initialized = Command::new("git")
            .current_dir(&root)
            .arg("init")
            .output()
            .unwrap();
        assert!(initialized.status.success());
        fs::write(root.join(".gitignore"), ".*\n").unwrap();
        fs::write(root.join(".h.zip"), b"encrypted archive placeholder").unwrap();

        assert!(
            run_git_status(&root, &["status", "--short", "--", ".h.zip"])
                .unwrap()
                .stdout
                .trim()
                .is_empty()
        );
        assert!(stage_private_archive(&root).unwrap());
        assert_eq!(
            run_git_checked(
                &root,
                &["diff", "--cached", "--name-only", "--", ".h.zip"],
                "Could not inspect staged archive."
            )
            .unwrap()
            .stdout
            .trim(),
            ".h.zip"
        );
        fs::remove_dir_all(root).unwrap();
    }
}

fn main() {
    if let Some(code) = private_vault::maybe_run_cli() {
        std::process::exit(code);
    }
    tauri::Builder::default()
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            open_vault,
            prepare_private_vault,
            load_profile,
            save_profile,
            watch_vault,
            checkpoint_and_switch_inuse,
            checkpoint_inuse,
            checkpoint_vault,
            refresh_git_info,
            dirty_git_files,
            list_tree,
            read_calendar_events,
            save_calendar_events,
            read_note,
            save_note,
            save_note_if_unchanged,
            compile_typst_preview,
            export_pdf,
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
