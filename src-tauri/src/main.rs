#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use grep_matcher::Matcher;
use grep_regex::{RegexMatcher, RegexMatcherBuilder};
use grep_searcher::{SearcherBuilder, Sink, SinkMatch};
use ignore::WalkBuilder;
use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use tauri::Emitter;
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::{
    collections::BTreeMap,
    cmp::Ordering,
    fs,
    path::{Component, Path, PathBuf},
    process::Command,
    sync::Mutex,
    time::Duration,
};

#[derive(Default)]
struct AppState {
    vault_root: Mutex<Option<PathBuf>>,
    watcher: Mutex<Option<RecommendedWatcher>>,
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
    let raw = fs::read_to_string(&path).map_err(|err| format!("Could not read profile.json: {err}"))?;
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
        let message = format!("NotesProject checkpoint before inuse: {}", checkpoint_timestamp());
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
        let normalized = normalize_relative_input(&path)?;
        let abs = resolve_safe(&root, &normalized)?;
        if abs.exists() {
            run_git_checked(
                &root,
                &["add", "--", &normalized],
                "Could not stage changed file.",
            )?;
        } else {
            run_git_checked(
                &root,
                &["rm", "--ignore-unmatch", "--", &normalized],
                "Could not stage deleted file.",
            )?;
        }
        staged_any = true;
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
    if !is_markdown_file(&abs) {
        return Err("Only Markdown files can be opened.".to_string());
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
    if !is_markdown_file(&abs) {
        return Err("Only Markdown files can be saved.".to_string());
    }
    if let Some(parent) = abs.parent() {
        fs::create_dir_all(parent).map_err(|err| format!("Could not create folder: {err}"))?;
    }
    fs::write(&abs, body).map_err(|err| format!("Could not save note: {err}"))?;
    read_note(state, path)
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
    if !is_markdown_file(&old_abs) {
        return Err("Only Markdown files can be renamed.".to_string());
    }
    let normalized_new = normalize_note_path(&new_path)?;
    let new_abs = resolve_safe(&root, &normalized_new)?;
    if new_abs.exists() && !same_path_case_insensitive(&old_abs, &new_abs) {
        return Err("A note already exists at the target path.".to_string());
    }
    if let Some(parent) = new_abs.parent() {
        fs::create_dir_all(parent).map_err(|err| format!("Could not create target folder: {err}"))?;
    }
    rename_path(&old_abs, &new_abs).map_err(|err| format!("Could not rename note: {err}"))?;
    read_note(state, normalized_new)
}

#[tauri::command]
fn delete_note(state: tauri::State<AppState>, path: String) -> Result<(), String> {
    let root = current_root(&state)?;
    let abs = resolve_safe(&root, &path)?;
    if !is_markdown_file(&abs) {
        return Err("Only Markdown files can be deleted.".to_string());
    }
    fs::remove_file(abs).map_err(|err| format!("Could not delete note: {err}"))
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
        fs::create_dir_all(parent).map_err(|err| format!("Could not create target folder: {err}"))?;
    }
    rename_path(&old_abs, &new_abs).map_err(|err| format!("Could not rename folder: {err}"))
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
    fs::remove_dir_all(abs).map_err(|err| format!("Could not delete folder: {err}"))
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
            .filter(|path| is_markdown_file(path))
            .collect::<Vec<_>>(),
        _ => collect_markdown_files(&root)?,
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

fn read_directory(root: &Path, dir: &Path) -> Result<Vec<TreeEntry>, String> {
    if dir != root {
        return Err("Only root tree listing is supported.".to_string());
    }
    build_tree_from_files(root, collect_markdown_files(root)?)
}

fn collect_markdown_files(root: &Path) -> Result<Vec<PathBuf>, String> {
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
        if entry.file_type().map(|file_type| file_type.is_file()).unwrap_or(false)
            && is_markdown_file(path)
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

    fn matched(&mut self, _searcher: &grep_searcher::Searcher, mat: &SinkMatch<'_>) -> Result<bool, Self::Error> {
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
        let line_text = String::from_utf8_lossy(bytes).trim_end_matches(['\r', '\n']).to_string();
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
    Ok(run_git_status(root, &["show-ref", "--verify", "--quiet", &format!("refs/heads/{branch}")])?
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
        run_git_checked(root, &["switch", "inuse"], "Could not switch to inuse branch.")?;
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
    }
}

fn normalize_profile(profile: AppProfile) -> AppProfile {
    AppProfile {
        autosave_delay_ms: profile.autosave_delay_ms.clamp(1_000, 60_000),
        checkpoint_interval_ms: profile.checkpoint_interval_ms.clamp(60_000, 60 * 60 * 1000),
    }
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
