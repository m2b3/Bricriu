use serde::{Deserialize, Serialize};
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::{
    collections::BTreeMap,
    env, fs,
    io::{self, Read, Write},
    path::{Component, Path, PathBuf},
    process::Command,
};
use zip::{write::SimpleFileOptions, AesMode, CompressionMethod, ZipArchive, ZipWriter};

pub const PASSWORD_REQUIRED: &str = "PRIVATE_VAULT_PASSWORD_REQUIRED:";
const PRIVATE_DIR: &str = ".h";
const BASELINE_DIR: &str = ".horig";
const ARCHIVE_FILE: &str = ".h.zip";
const ARCHIVE_MARKER: &str = ".notesproject-private-marker";
const SETTINGS_FILE: &str = "private-vaults.json";
const HOOK_MARKER: &str = "# NotesProject private-vault hook";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrivateVaultInfo {
    pub enabled: bool,
    pub archive_updated: bool,
    pub hooks_installed: bool,
    pub message: String,
}

impl PrivateVaultInfo {
    pub fn disabled() -> Self {
        Self {
            enabled: false,
            archive_updated: false,
            hooks_installed: false,
            message: "No private .h vault is configured.".to_string(),
        }
    }

    pub fn pending() -> Self {
        Self {
            enabled: true,
            archive_updated: false,
            hooks_installed: false,
            message: "Opening the vault while the private .h folder is prepared in the background."
                .to_string(),
        }
    }
}

#[derive(Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct PrivateVaultSettings {
    #[serde(default)]
    default_password: Option<String>,
    #[serde(default)]
    vaults: BTreeMap<String, VaultPassword>,
}

#[derive(Deserialize, Serialize)]
struct VaultPassword {
    password: String,
}

pub fn prepare_on_open(
    root: &Path,
    supplied_password: Option<&str>,
    is_git_repo: bool,
) -> Result<PrivateVaultInfo, String> {
    if !private_artifacts_exist(root) {
        return Ok(PrivateVaultInfo::disabled());
    }

    let settings_path = settings_path()?;
    prepare_on_open_with_settings(root, supplied_password, is_git_repo, &settings_path)
}

fn prepare_on_open_with_settings(
    root: &Path,
    supplied_password: Option<&str>,
    is_git_repo: bool,
    settings_path: &Path,
) -> Result<PrivateVaultInfo, String> {
    let stored = read_password(settings_path, root)?;
    let password = supplied_password
        .filter(|password| !password.is_empty())
        .or(stored.as_deref())
        .ok_or_else(|| {
            format!(
                "{PASSWORD_REQUIRED} Enter the password for {}. It will be stored in the local, git-ignored {} file.",
                root.display(),
                SETTINGS_FILE
            )
        })?;

    let private = root.join(PRIVATE_DIR);
    let archive = root.join(ARCHIVE_FILE);
    if private.exists() && !private.is_dir() {
        return Err(format!("{} must be a directory.", private.display()));
    }

    // A new plaintext .h folder does not need an archive round-trip on open.
    // The first checkpoint or commit will create both .h.zip and .horig.
    if private.is_dir() && !archive.exists() {
        if supplied_password.is_some() && stored.as_deref() != Some(password) {
            write_password(settings_path, root, password)?;
        }
        let (hooks_installed, warnings) =
            configure_git_integration(root, settings_path, is_git_repo)?;
        let mut message =
            "Private .h folder detected. Its encrypted archive will be created at the next checkpoint or commit."
                .to_string();
        append_warnings(&mut message, &warnings);
        return Ok(PrivateVaultInfo {
            enabled: true,
            archive_updated: false,
            hooks_installed,
            message,
        });
    }

    // A missing working directory on startup is normally a closed/cleaned-up
    // private vault, not an instruction to replace the archive with emptiness.
    let archive_updated = if !private.exists() && archive.is_file() {
        false
    } else {
        preserve_plaintext_changes(root, password)?
    };
    if !archive_updated {
        extract_archive_to_working_copies(root, password)?;
    }

    if supplied_password.is_some() && stored.as_deref() != Some(password) {
        write_password(settings_path, root, password)?;
    }

    let (hooks_installed, warnings) = configure_git_integration(root, settings_path, is_git_repo)?;

    let mut message = if archive_updated {
        "Recovered private .h changes, refreshed .h.zip, and opened the private folder.".to_string()
    } else {
        "Opened the encrypted private .h folder.".to_string()
    };
    append_warnings(&mut message, &warnings);

    Ok(PrivateVaultInfo {
        enabled: true,
        archive_updated,
        hooks_installed,
        message,
    })
}

fn configure_git_integration(
    root: &Path,
    settings_path: &Path,
    is_git_repo: bool,
) -> Result<(bool, Vec<String>), String> {
    let mut hooks_installed = false;
    let mut warnings = Vec::new();
    if is_git_repo {
        ensure_local_git_excludes(root)?;
        match install_git_hooks(root, settings_path) {
            Ok(()) => hooks_installed = true,
            Err(err) => warnings.push(err),
        }
    }
    Ok((hooks_installed, warnings))
}

fn append_warnings(message: &mut String, warnings: &[String]) {
    if !warnings.is_empty() {
        message.push(' ');
        message.push_str(&warnings.join(" "));
    }
}

pub fn sync_if_needed(root: &Path) -> Result<bool, String> {
    if !private_artifacts_exist(root) {
        return Ok(false);
    }
    let settings = settings_path()?;
    sync_if_needed_with_settings(root, &settings)
}

fn sync_if_needed_with_settings(root: &Path, settings_path: &Path) -> Result<bool, String> {
    let password = read_password(settings_path, root)?.ok_or_else(|| {
        format!(
            "{PASSWORD_REQUIRED} No password is configured for {} in {}.",
            root.display(),
            settings_path.display()
        )
    })?;
    preserve_plaintext_changes(root, &password)
}

pub fn maybe_run_cli() -> Option<i32> {
    let args = env::args().collect::<Vec<_>>();
    let marker = args.iter().position(|arg| arg == "--private-vault-sync")?;
    if args.len() <= marker + 3 {
        eprintln!("Bricriu private-vault hook received invalid arguments.");
        return Some(2);
    }

    let root = PathBuf::from(&args[marker + 1]);
    let settings = PathBuf::from(&args[marker + 2]);
    let hook = &args[marker + 3];
    match sync_if_needed_with_settings(&root, &settings) {
        Ok(changed) if hook == "pre-push" && changed => {
            eprintln!("Bricriu refreshed .h.zip. Commit the updated archive before pushing.");
            Some(3)
        }
        Ok(_) => Some(0),
        Err(err) => {
            eprintln!("Bricriu private-vault sync failed: {err}");
            Some(2)
        }
    }
}

pub fn is_configured(root: &Path) -> bool {
    private_artifacts_exist(root)
}

fn private_artifacts_exist(root: &Path) -> bool {
    root.join(PRIVATE_DIR).exists()
        || root.join(BASELINE_DIR).exists()
        || root.join(ARCHIVE_FILE).exists()
}

pub fn is_plaintext_relative_path(path: &str) -> bool {
    let normalized = path.trim().replace('\\', "/");
    let normalized = normalized.trim_matches('/');
    normalized == PRIVATE_DIR
        || normalized.starts_with(&format!("{PRIVATE_DIR}/"))
        || normalized == BASELINE_DIR
        || normalized.starts_with(&format!("{BASELINE_DIR}/"))
}

fn preserve_plaintext_changes(root: &Path, password: &str) -> Result<bool, String> {
    let private = root.join(PRIVATE_DIR);
    let baseline = root.join(BASELINE_DIR);
    let archive = root.join(ARCHIVE_FILE);

    if !private.exists() && !baseline.exists() {
        if archive.exists() {
            return Ok(false);
        }
        return Ok(false);
    }

    if private.exists() && !private.is_dir() {
        return Err(format!("{} must be a directory.", private.display()));
    }
    if baseline.exists() && !baseline.is_dir() {
        return Err(format!("{} must be a directory.", baseline.display()));
    }

    let changed = !archive.exists()
        || !private.exists()
        || !baseline.exists()
        || !directories_equal(&private, &baseline)?;
    if !changed {
        return Ok(false);
    }

    let empty_source;
    let source = if private.is_dir() {
        private.as_path()
    } else {
        empty_source = unique_temp_dir("notesproject-private-empty")?;
        empty_source.as_path()
    };

    let temp_archive = unique_sibling_path(root, ".h.zip.notesproject-tmp");
    let result = (|| {
        write_encrypted_archive(source, &temp_archive, password)?;
        replace_file(&temp_archive, &archive)?;
        replace_baseline_from(source, &baseline)
    })();
    if source != private {
        let _ = fs::remove_dir_all(source);
    }
    if result.is_err() {
        let _ = fs::remove_file(&temp_archive);
    }
    result.map(|_| true)
}

fn extract_archive_to_working_copies(root: &Path, password: &str) -> Result<(), String> {
    let archive = root.join(ARCHIVE_FILE);
    if !archive.is_file() {
        return Err(format!(
            "Private archive {} does not exist.",
            archive.display()
        ));
    }

    let extracted = unique_temp_dir("notesproject-private-extract")?;
    let result = (|| {
        extract_encrypted_archive(&archive, &extracted, password)?;
        replace_directory_from(&extracted, &root.join(PRIVATE_DIR))?;
        replace_baseline_from(&extracted, &root.join(BASELINE_DIR))
    })();
    let _ = fs::remove_dir_all(&extracted);
    result
}

fn write_encrypted_archive(
    source: &Path,
    destination: &Path,
    password: &str,
) -> Result<(), String> {
    let file = fs::File::create(destination)
        .map_err(|err| format!("Could not create private archive: {err}"))?;
    let mut writer = ZipWriter::new(file);
    let options = SimpleFileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .with_aes_encryption(AesMode::Aes256, password);

    writer
        .start_file(ARCHIVE_MARKER, options)
        .map_err(|err| format!("Could not start private archive marker: {err}"))?;
    writer
        .write_all(b"NotesProject private vault v1\n")
        .map_err(|err| format!("Could not write private archive marker: {err}"))?;

    for entry in directory_entries(source)? {
        let name = path_to_zip_name(&entry.relative)?;
        if entry.is_dir {
            writer
                .add_directory(format!("{name}/"), SimpleFileOptions::default())
                .map_err(|err| format!("Could not add private directory to archive: {err}"))?;
            continue;
        }
        writer
            .start_file(name, options)
            .map_err(|err| format!("Could not add private file to archive: {err}"))?;
        let mut input = fs::File::open(&entry.absolute)
            .map_err(|err| format!("Could not read private file: {err}"))?;
        io::copy(&mut input, &mut writer)
            .map_err(|err| format!("Could not compress private file: {err}"))?;
    }

    let finished = writer
        .finish()
        .map_err(|err| format!("Could not finish private archive: {err}"))?;
    finished
        .sync_all()
        .map_err(|err| format!("Could not flush private archive: {err}"))
}

fn extract_encrypted_archive(
    archive_path: &Path,
    destination: &Path,
    password: &str,
) -> Result<(), String> {
    let file = fs::File::open(archive_path)
        .map_err(|err| format!("Could not open private archive: {err}"))?;
    let mut archive =
        ZipArchive::new(file).map_err(|err| format!("Could not read private archive: {err}"))?;
    if archive
        .has_overlapping_files()
        .map_err(|err| format!("Could not validate private archive: {err}"))?
    {
        return Err("Private archive contains overlapping entries.".to_string());
    }

    let user_names = archive
        .file_names()
        .filter(|name| name.trim_end_matches('/') != ARCHIVE_MARKER)
        .collect::<Vec<_>>();
    let strip_private_root = !user_names.is_empty()
        && user_names.iter().all(|name| {
            *name == PRIVATE_DIR
                || name
                    .strip_prefix(PRIVATE_DIR)
                    .map(|rest| rest.starts_with('/'))
                    .unwrap_or(false)
        });

    let mut marker_found = false;
    let mut encrypted_payload_found = false;
    for index in 0..archive.len() {
        let mut entry = archive
            .by_index_decrypt(index, password.as_bytes())
            .map_err(|_| {
                format!(
                    "{PASSWORD_REQUIRED} The private-vault password is incorrect or the archive is damaged."
                )
            })?;
        let mut relative = entry
            .enclosed_name()
            .ok_or_else(|| "Private archive contains an unsafe path.".to_string())?;
        validate_archive_relative_path(&relative)?;
        if strip_private_root && relative != Path::new(ARCHIVE_MARKER) {
            relative = relative
                .strip_prefix(PRIVATE_DIR)
                .map_err(|_| "Private archive contains an inconsistent root.".to_string())?
                .to_path_buf();
            if relative.as_os_str().is_empty() {
                continue;
            }
        }
        if relative == Path::new(ARCHIVE_MARKER) {
            if !entry.encrypted() {
                return Err("The private archive marker must be encrypted.".to_string());
            }
            let mut marker = String::new();
            entry.read_to_string(&mut marker).map_err(|_| {
                format!("{PASSWORD_REQUIRED} Could not decrypt the private archive.")
            })?;
            if marker != "NotesProject private vault v1\n" {
                return Err(format!(
                    "{PASSWORD_REQUIRED} The private-vault password is incorrect or the archive is damaged."
                ));
            }
            marker_found = true;
            continue;
        }

        let output = destination.join(&relative);
        if entry.is_symlink() {
            return Err("Private archive may not contain symbolic links.".to_string());
        }
        if entry.is_dir() {
            fs::create_dir_all(&output)
                .map_err(|err| format!("Could not create private directory: {err}"))?;
        } else if entry.is_file() {
            if !entry.encrypted() {
                return Err("Every private archive file must be encrypted.".to_string());
            }
            encrypted_payload_found = true;
            if let Some(parent) = output.parent() {
                fs::create_dir_all(parent)
                    .map_err(|err| format!("Could not create private directory: {err}"))?;
            }
            let mut output_file = fs::File::create(&output)
                .map_err(|err| format!("Could not create private file: {err}"))?;
            io::copy(&mut entry, &mut output_file).map_err(|_| {
                format!(
                    "{PASSWORD_REQUIRED} The private-vault password is incorrect or the archive is damaged."
                )
            })?;
        } else {
            return Err("Private archive contains an unsupported entry type.".to_string());
        }
    }

    if !marker_found && !encrypted_payload_found {
        return Err(
            "Private archive has no encrypted files and no recognized private-vault marker."
                .to_string(),
        );
    }
    Ok(())
}

#[derive(Debug)]
struct DirectoryEntry {
    relative: PathBuf,
    absolute: PathBuf,
    is_dir: bool,
}

fn directory_entries(root: &Path) -> Result<Vec<DirectoryEntry>, String> {
    if !root.is_dir() {
        return Err(format!("Private folder {} is missing.", root.display()));
    }
    let mut pending = vec![root.to_path_buf()];
    let mut entries = Vec::new();
    while let Some(directory) = pending.pop() {
        let children = fs::read_dir(&directory)
            .map_err(|err| format!("Could not read private folder: {err}"))?;
        for child in children {
            let child = child.map_err(|err| format!("Could not read private entry: {err}"))?;
            let kind = child
                .file_type()
                .map_err(|err| format!("Could not inspect private entry: {err}"))?;
            if kind.is_symlink() {
                return Err(format!(
                    "Private folder may not contain symbolic links: {}",
                    child.path().display()
                ));
            }
            let absolute = child.path();
            let relative = absolute
                .strip_prefix(root)
                .map_err(|_| "Private path escaped its root.".to_string())?
                .to_path_buf();
            if kind.is_dir() {
                pending.push(absolute.clone());
                entries.push(DirectoryEntry {
                    relative,
                    absolute,
                    is_dir: true,
                });
            } else if kind.is_file() {
                entries.push(DirectoryEntry {
                    relative,
                    absolute,
                    is_dir: false,
                });
            } else {
                return Err("Private folder contains an unsupported entry type.".to_string());
            }
        }
    }
    entries.sort_by(|a, b| a.relative.cmp(&b.relative));
    Ok(entries)
}

fn directories_equal(left: &Path, right: &Path) -> Result<bool, String> {
    if !left.is_dir() || !right.is_dir() {
        return Ok(false);
    }
    let left_entries = directory_entries(left)?;
    let right_entries = directory_entries(right)?;
    if left_entries.len() != right_entries.len() {
        return Ok(false);
    }
    for (left_entry, right_entry) in left_entries.iter().zip(right_entries.iter()) {
        if left_entry.relative != right_entry.relative || left_entry.is_dir != right_entry.is_dir {
            return Ok(false);
        }
        if !left_entry.is_dir && !files_equal(&left_entry.absolute, &right_entry.absolute)? {
            return Ok(false);
        }
    }
    Ok(true)
}

fn files_equal(left: &Path, right: &Path) -> Result<bool, String> {
    let left_meta =
        fs::metadata(left).map_err(|err| format!("Could not inspect private file: {err}"))?;
    let right_meta =
        fs::metadata(right).map_err(|err| format!("Could not inspect baseline file: {err}"))?;
    if left_meta.len() != right_meta.len() {
        return Ok(false);
    }
    let mut left_file =
        fs::File::open(left).map_err(|err| format!("Could not read private file: {err}"))?;
    let mut right_file =
        fs::File::open(right).map_err(|err| format!("Could not read baseline file: {err}"))?;
    let mut left_buffer = [0_u8; 64 * 1024];
    let mut right_buffer = [0_u8; 64 * 1024];
    loop {
        let left_read = left_file
            .read(&mut left_buffer)
            .map_err(|err| format!("Could not compare private file: {err}"))?;
        let right_read = right_file
            .read(&mut right_buffer)
            .map_err(|err| format!("Could not compare baseline file: {err}"))?;
        if left_read != right_read || left_buffer[..left_read] != right_buffer[..right_read] {
            return Ok(false);
        }
        if left_read == 0 {
            return Ok(true);
        }
    }
}

fn replace_baseline_from(source: &Path, baseline: &Path) -> Result<(), String> {
    replace_directory_from(source, baseline)
}

fn replace_directory_from(source: &Path, destination: &Path) -> Result<(), String> {
    let parent = destination
        .parent()
        .ok_or_else(|| "Could not resolve private folder parent.".to_string())?;
    let name = destination
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("private");
    let staged = unique_sibling_path(parent, &format!("{name}.notesproject-new"));
    copy_directory(source, &staged)?;

    if destination.exists() {
        fs::remove_dir_all(destination)
            .map_err(|err| format!("Could not replace private folder: {err}"))?;
    }
    if let Err(err) = fs::rename(&staged, destination) {
        let _ = fs::remove_dir_all(&staged);
        return Err(format!("Could not install private folder: {err}"));
    }
    Ok(())
}

fn copy_directory(source: &Path, destination: &Path) -> Result<(), String> {
    fs::create_dir_all(destination)
        .map_err(|err| format!("Could not create private folder copy: {err}"))?;
    for entry in directory_entries(source)? {
        let target = destination.join(&entry.relative);
        if entry.is_dir {
            fs::create_dir_all(&target)
                .map_err(|err| format!("Could not copy private directory: {err}"))?;
        } else {
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent)
                    .map_err(|err| format!("Could not copy private directory: {err}"))?;
            }
            fs::copy(&entry.absolute, &target)
                .map_err(|err| format!("Could not copy private file: {err}"))?;
        }
    }
    Ok(())
}

fn validate_archive_relative_path(path: &Path) -> Result<(), String> {
    for component in path.components() {
        match component {
            Component::Normal(_) | Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err("Private archive contains an unsafe path.".to_string())
            }
        }
    }
    Ok(())
}

fn path_to_zip_name(path: &Path) -> Result<String, String> {
    let mut parts = Vec::new();
    for component in path.components() {
        let Component::Normal(part) = component else {
            return Err("Private folder contains an unsafe path.".to_string());
        };
        let part = part
            .to_str()
            .ok_or_else(|| "Private filenames must be valid UTF-8.".to_string())?;
        parts.push(part);
    }
    Ok(parts.join("/"))
}

fn replace_file(source: &Path, destination: &Path) -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        use windows_sys::Win32::Storage::FileSystem::{
            MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
        };
        let source = source
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect::<Vec<_>>();
        let destination = destination
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect::<Vec<_>>();
        let ok = unsafe {
            MoveFileExW(
                source.as_ptr(),
                destination.as_ptr(),
                MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
            )
        };
        if ok == 0 {
            return Err(format!(
                "Could not replace private archive: {}",
                io::Error::last_os_error()
            ));
        }
        Ok(())
    }
    #[cfg(not(windows))]
    {
        fs::rename(source, destination)
            .map_err(|err| format!("Could not replace private archive: {err}"))
    }
}

fn settings_path() -> Result<PathBuf, String> {
    let current =
        env::current_dir().map_err(|err| format!("Could not locate private settings: {err}"))?;
    if current.join("package.json").is_file() {
        return Ok(current.join(SETTINGS_FILE));
    }
    if let Some(parent) = current.parent() {
        if parent.join("package.json").is_file() {
            return Ok(parent.join(SETTINGS_FILE));
        }
    }
    Ok(current.join(SETTINGS_FILE))
}

fn read_password(settings_path: &Path, root: &Path) -> Result<Option<String>, String> {
    if !settings_path.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(settings_path)
        .map_err(|err| format!("Could not read {}: {err}", settings_path.display()))?;
    let settings = serde_json::from_str::<PrivateVaultSettings>(&raw)
        .map_err(|err| format!("Could not parse {}: {err}", settings_path.display()))?;
    Ok(settings
        .vaults
        .get(&vault_key(root))
        .map(|entry| entry.password.clone())
        .or(settings.default_password)
        .filter(|password| !password.is_empty()))
}

fn write_password(settings_path: &Path, root: &Path, password: &str) -> Result<(), String> {
    let mut settings = if settings_path.exists() {
        let raw = fs::read_to_string(settings_path)
            .map_err(|err| format!("Could not read {}: {err}", settings_path.display()))?;
        serde_json::from_str::<PrivateVaultSettings>(&raw)
            .map_err(|err| format!("Could not parse {}: {err}", settings_path.display()))?
    } else {
        PrivateVaultSettings::default()
    };
    settings.vaults.insert(
        vault_key(root),
        VaultPassword {
            password: password.to_string(),
        },
    );
    let payload = serde_json::to_string_pretty(&settings)
        .map_err(|err| format!("Could not serialize private settings: {err}"))?;
    fs::write(settings_path, format!("{payload}\n"))
        .map_err(|err| format!("Could not write {}: {err}", settings_path.display()))?;
    restrict_settings_permissions(settings_path)
}

#[cfg(unix)]
fn restrict_settings_permissions(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o600))
        .map_err(|err| format!("Could not restrict private settings permissions: {err}"))
}

#[cfg(not(unix))]
fn restrict_settings_permissions(_path: &Path) -> Result<(), String> {
    Ok(())
}

fn vault_key(root: &Path) -> String {
    let value = root.to_string_lossy().replace('\\', "/");
    #[cfg(windows)]
    {
        value.to_lowercase()
    }
    #[cfg(not(windows))]
    {
        value
    }
}

fn ensure_local_git_excludes(root: &Path) -> Result<(), String> {
    let git_dir = git_path(root, ".")?;
    let vault_prefix = git_vault_prefix(root)?;
    let info = git_dir.join("info");
    fs::create_dir_all(&info)
        .map_err(|err| format!("Could not create Git info directory: {err}"))?;
    let exclude = info.join("exclude");
    let existing = fs::read_to_string(&exclude).unwrap_or_default();
    let required = vec![
        "# NotesProject private-vault plaintext".to_string(),
        anchored_git_pattern(&vault_prefix, ".h/"),
        anchored_git_pattern(&vault_prefix, ".horig/"),
        anchored_git_pattern(&vault_prefix, ".h.notesproject-new*"),
        anchored_git_pattern(&vault_prefix, ".horig.notesproject-new*"),
        anchored_git_pattern(&vault_prefix, ".notesproject/track/.h/"),
    ];
    if required
        .iter()
        .all(|line| existing.lines().any(|item| item == line))
    {
        return Ok(());
    }
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&exclude)
        .map_err(|err| format!("Could not update Git exclude file: {err}"))?;
    if !existing.is_empty() && !existing.ends_with('\n') {
        writeln!(file).map_err(|err| format!("Could not update Git exclude file: {err}"))?;
    }
    for line in required {
        if !existing.lines().any(|item| item == line) {
            writeln!(file, "{line}")
                .map_err(|err| format!("Could not update Git exclude file: {err}"))?;
        }
    }
    Ok(())
}

fn install_git_hooks(root: &Path, settings_path: &Path) -> Result<(), String> {
    let configured_hooks = git_command(root)
        .args(["config", "--get", "core.hooksPath"])
        .output()
        .map_err(|err| format!("Could not inspect Git hook configuration: {err}"))?;
    if configured_hooks.status.success()
        && !String::from_utf8_lossy(&configured_hooks.stdout)
            .trim()
            .is_empty()
    {
        return Err(
            "Git core.hooksPath is already configured; Bricriu left it untouched, so command-line commits and pushes need equivalent private-vault hooks there."
                .to_string(),
        );
    }

    let hooks = git_path(root, "hooks")?;
    let archive_git_path = git_vault_path(root, ARCHIVE_FILE)?;
    fs::create_dir_all(&hooks)
        .map_err(|err| format!("Could not create Git hooks folder: {err}"))?;
    let executable = env::current_exe()
        .map_err(|err| format!("Could not locate the Bricriu executable: {err}"))?;
    install_hook(
        &hooks,
        "pre-commit",
        root,
        settings_path,
        &executable,
        &archive_git_path,
    )?;
    install_hook(
        &hooks,
        "pre-push",
        root,
        settings_path,
        &executable,
        &archive_git_path,
    )
}

fn install_hook(
    hooks: &Path,
    name: &str,
    root: &Path,
    settings_path: &Path,
    executable: &Path,
    archive_git_path: &str,
) -> Result<(), String> {
    let hook = hooks.join(name);
    let backup = hooks.join(format!("{name}.notesproject-existing"));
    let mut preserved_existing = false;
    if hook.exists() {
        let existing = fs::read_to_string(&hook).unwrap_or_default();
        if !existing.contains(HOOK_MARKER) {
            if backup.exists() {
                return Err(format!(
                    "Could not install the {name} hook because both it and its compatibility backup already exist."
                ));
            }
            fs::rename(&hook, &backup)
                .map_err(|err| format!("Could not preserve existing {name} hook: {err}"))?;
            preserved_existing = true;
        }
    }

    let original = if backup.exists() {
        format!(
            "\"$(dirname \"$0\")/{}\" \"$@\" || exit $?\n",
            backup
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or_default()
        )
    } else {
        String::new()
    };
    let sync = format!(
        "{} --private-vault-sync {} {} {}",
        shell_quote(executable),
        shell_quote(root),
        shell_quote(settings_path),
        name
    );
    let action = if name == "pre-commit" {
        format!(
            "{sync} || exit $?\ngit add -f -- {} || exit $?\n",
            shell_quote_value(archive_git_path)
        )
    } else {
        format!("{sync} || exit $?\n")
    };
    let body = format!("#!/bin/sh\n{HOOK_MARKER}\n{original}{action}");
    let temporary = unique_sibling_path(hooks, &format!(".{name}.notesproject-tmp"));
    if let Err(err) = fs::write(&temporary, body) {
        if preserved_existing && !hook.exists() {
            let _ = fs::rename(&backup, &hook);
        }
        return Err(format!("Could not write {name} hook: {err}"));
    }
    if let Err(err) = make_executable(&temporary).and_then(|_| replace_file(&temporary, &hook)) {
        let _ = fs::remove_file(&temporary);
        if preserved_existing && !hook.exists() {
            let _ = fs::rename(&backup, &hook);
        }
        return Err(err);
    }
    Ok(())
}

fn git_path(root: &Path, name: &str) -> Result<PathBuf, String> {
    let output = git_command(root)
        .args(["rev-parse", "--git-path", name])
        .output()
        .map_err(|err| format!("Could not locate Git metadata: {err}"))?;
    if !output.status.success() {
        return Err("Could not locate Git metadata for private-vault hooks.".to_string());
    }
    let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let path = PathBuf::from(value);
    Ok(if path.is_absolute() {
        path
    } else {
        root.join(path)
    })
}

fn git_vault_prefix(root: &Path) -> Result<String, String> {
    let output = git_command(root)
        .args(["rev-parse", "--show-toplevel"])
        .output()
        .map_err(|err| format!("Could not locate Git worktree: {err}"))?;
    if !output.status.success() {
        return Err("Could not locate Git worktree for private-vault paths.".to_string());
    }
    let worktree = PathBuf::from(String::from_utf8_lossy(&output.stdout).trim().to_string())
        .canonicalize()
        .map_err(|err| format!("Could not resolve Git worktree: {err}"))?;
    let vault = root
        .canonicalize()
        .map_err(|err| format!("Could not resolve vault path: {err}"))?;
    let relative = vault
        .strip_prefix(&worktree)
        .map_err(|_| "Vault is outside its detected Git worktree.".to_string())?;
    path_to_zip_name(relative)
}

fn git_vault_path(root: &Path, name: &str) -> Result<String, String> {
    let prefix = git_vault_prefix(root)?;
    Ok(if prefix.is_empty() {
        name.to_string()
    } else {
        format!("{prefix}/{name}")
    })
}

fn anchored_git_pattern(prefix: &str, suffix: &str) -> String {
    if prefix.is_empty() {
        format!("/{suffix}")
    } else {
        format!("/{prefix}/{suffix}")
    }
}

fn git_command(root: &Path) -> Command {
    let mut command = Command::new("git");
    command.current_dir(root);
    #[cfg(windows)]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
}

#[cfg(unix)]
fn make_executable(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    let mut permissions = fs::metadata(path)
        .map_err(|err| format!("Could not inspect Git hook: {err}"))?
        .permissions();
    permissions.set_mode(permissions.mode() | 0o111);
    fs::set_permissions(path, permissions)
        .map_err(|err| format!("Could not make Git hook executable: {err}"))
}

#[cfg(not(unix))]
fn make_executable(_path: &Path) -> Result<(), String> {
    Ok(())
}

fn shell_quote(path: &Path) -> String {
    shell_quote_value(&path.to_string_lossy())
}

fn shell_quote_value(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

fn unique_temp_dir(prefix: &str) -> Result<PathBuf, String> {
    let base = env::temp_dir();
    for counter in 0..1000_u32 {
        let candidate = base.join(format!(
            "{prefix}-{}-{}-{counter}",
            std::process::id(),
            timestamp()
        ));
        match fs::create_dir(&candidate) {
            Ok(()) => return Ok(candidate),
            Err(err) if err.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(err) => return Err(format!("Could not create private temporary folder: {err}")),
        }
    }
    Err("Could not allocate a private temporary folder.".to_string())
}

fn unique_sibling_path(parent: &Path, prefix: &str) -> PathBuf {
    for counter in 0..1000_u32 {
        let candidate = parent.join(format!("{prefix}-{}-{counter}", timestamp()));
        if !candidate.exists() {
            return candidate;
        }
    }
    parent.join(format!("{prefix}-fallback"))
}

fn timestamp() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_root(name: &str) -> PathBuf {
        let path = env::temp_dir().join(format!(
            "notesproject-private-test-{name}-{}-{}",
            std::process::id(),
            timestamp()
        ));
        fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn encrypted_archive_round_trip_and_wrong_password() {
        let root = test_root("round-trip");
        let source = root.join(PRIVATE_DIR);
        fs::create_dir_all(source.join("nested/empty")).unwrap();
        fs::write(source.join("secret.md"), "top secret\n").unwrap();
        fs::write(source.join("nested/note.md"), "nested\n").unwrap();
        let archive = root.join(ARCHIVE_FILE);

        write_encrypted_archive(&source, &archive, "correct horse battery staple").unwrap();
        let extracted = root.join("extracted");
        fs::create_dir(&extracted).unwrap();
        extract_encrypted_archive(&archive, &extracted, "correct horse battery staple").unwrap();
        assert!(directories_equal(&source, &extracted).unwrap());

        let wrong = root.join("wrong");
        fs::create_dir(&wrong).unwrap();
        assert!(extract_encrypted_archive(&archive, &wrong, "wrong password").is_err());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn accepts_encrypted_zip_with_h_as_its_root_folder() {
        let root = test_root("external-root");
        let archive_path = root.join(ARCHIVE_FILE);
        let file = fs::File::create(&archive_path).unwrap();
        let mut archive = ZipWriter::new(file);
        let options = SimpleFileOptions::default()
            .compression_method(CompressionMethod::Deflated)
            .with_aes_encryption(AesMode::Aes256, "external password");
        archive.start_file(".h/secret.md", options).unwrap();
        archive.write_all(b"external secret").unwrap();
        archive.finish().unwrap();

        let extracted = root.join("extracted");
        fs::create_dir(&extracted).unwrap();
        extract_encrypted_archive(&archive_path, &extracted, "external password").unwrap();
        assert_eq!(
            fs::read_to_string(extracted.join("secret.md")).unwrap(),
            "external secret"
        );
        assert!(!extracted.join(PRIVATE_DIR).exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn sync_only_rewrites_when_working_copy_deviates() {
        let root = test_root("sync");
        let private = root.join(PRIVATE_DIR);
        fs::create_dir(&private).unwrap();
        fs::write(private.join("secret.md"), "v1").unwrap();

        assert!(preserve_plaintext_changes(&root, "test password").unwrap());
        assert!(!preserve_plaintext_changes(&root, "test password").unwrap());
        fs::write(private.join("secret.md"), "v2").unwrap();
        assert!(preserve_plaintext_changes(&root, "test password").unwrap());
        assert_eq!(
            fs::read_to_string(root.join(BASELINE_DIR).join("secret.md")).unwrap(),
            "v2"
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn opening_a_new_private_folder_defers_archive_until_sync() {
        let root = test_root("deferred-first-archive");
        let private = root.join(PRIVATE_DIR);
        fs::create_dir(&private).unwrap();
        fs::write(private.join("secret.md"), "new private note").unwrap();
        let settings = root.join("test-private-vaults.json");

        let info =
            prepare_on_open_with_settings(&root, Some("test password"), false, &settings).unwrap();
        assert!(info.enabled);
        assert!(!info.archive_updated);
        assert!(!root.join(ARCHIVE_FILE).exists());
        assert!(!root.join(BASELINE_DIR).exists());
        assert_eq!(
            fs::read_to_string(private.join("secret.md")).unwrap(),
            "new private note"
        );

        assert!(sync_if_needed_with_settings(&root, &settings).unwrap());
        assert!(root.join(ARCHIVE_FILE).is_file());
        assert!(root.join(BASELINE_DIR).is_dir());
        assert_eq!(
            fs::read_to_string(root.join(BASELINE_DIR).join("secret.md")).unwrap(),
            "new private note"
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn directory_comparison_includes_empty_directories() {
        let root = test_root("compare");
        let left = root.join("left");
        let right = root.join("right");
        fs::create_dir_all(left.join("empty")).unwrap();
        fs::create_dir_all(&right).unwrap();
        assert!(!directories_equal(&left, &right).unwrap());
        fs::create_dir(right.join("empty")).unwrap();
        assert!(directories_equal(&left, &right).unwrap());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn installs_hooks_and_preserves_an_existing_hook() {
        let root = test_root("hooks");
        let initialized = Command::new("git")
            .current_dir(&root)
            .arg("init")
            .output()
            .unwrap();
        assert!(initialized.status.success());
        let hooks = git_path(&root, "hooks").unwrap();
        fs::create_dir_all(&hooks).unwrap();
        let original = hooks.join("pre-commit");
        fs::write(&original, "#!/bin/sh\necho original\n").unwrap();
        let settings = root.join("test-private-vaults.json");

        install_git_hooks(&root, &settings).unwrap();
        assert_eq!(
            fs::read_to_string(hooks.join("pre-commit.notesproject-existing")).unwrap(),
            "#!/bin/sh\necho original\n"
        );
        let wrapper = fs::read_to_string(&original).unwrap();
        assert!(wrapper.contains(HOOK_MARKER));
        assert!(wrapper.contains("--private-vault-sync"));
        assert!(wrapper.contains("git add -f -- '.h.zip'"));
        assert!(fs::read_to_string(hooks.join("pre-push"))
            .unwrap()
            .contains("pre-push"));

        install_git_hooks(&root, &settings).unwrap();
        assert_eq!(
            fs::read_to_string(hooks.join("pre-commit.notesproject-existing")).unwrap(),
            "#!/bin/sh\necho original\n"
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn nested_vault_uses_repository_relative_git_paths() {
        let repository = test_root("nested-git-paths");
        let vault = repository.join("mydocs");
        fs::create_dir(&vault).unwrap();
        let initialized = Command::new("git")
            .current_dir(&repository)
            .arg("init")
            .output()
            .unwrap();
        assert!(initialized.status.success());
        let settings = repository.join("test-private-vaults.json");

        ensure_local_git_excludes(&vault).unwrap();
        install_git_hooks(&vault, &settings).unwrap();

        let git_dir = git_path(&vault, ".").unwrap();
        let exclude = fs::read_to_string(git_dir.join("info/exclude")).unwrap();
        assert!(exclude.lines().any(|line| line == "/mydocs/.h/"));
        assert!(exclude.lines().any(|line| line == "/mydocs/.horig/"));
        assert!(exclude
            .lines()
            .any(|line| line == "/mydocs/.notesproject/track/.h/"));
        assert!(!exclude.lines().any(|line| line == "/.h/"));

        let hook = fs::read_to_string(git_dir.join("hooks/pre-commit")).unwrap();
        assert!(hook.contains("git add -f -- 'mydocs/.h.zip'"));
        fs::remove_dir_all(repository).unwrap();
    }

    #[test]
    fn recognizes_only_private_plaintext_paths() {
        assert!(is_plaintext_relative_path(".h"));
        assert!(is_plaintext_relative_path(".h/secret.md"));
        assert!(is_plaintext_relative_path(r".horig\secret.md"));
        assert!(!is_plaintext_relative_path(".h.zip"));
        assert!(!is_plaintext_relative_path("notes/.h/secret.md"));
    }

    #[test]
    fn vault_password_overrides_the_default_password() {
        let root = test_root("default-password");
        let settings = root.join("private-vaults.json");
        fs::write(
            &settings,
            r#"{
  "defaultPassword": "default secret",
  "vaults": {}
}"#,
        )
        .unwrap();

        assert_eq!(
            read_password(&settings, &root).unwrap().as_deref(),
            Some("default secret")
        );
        write_password(&settings, &root, "vault secret").unwrap();
        assert_eq!(
            read_password(&settings, &root).unwrap().as_deref(),
            Some("vault secret")
        );
        assert!(fs::read_to_string(&settings)
            .unwrap()
            .contains("\"defaultPassword\": \"default secret\""));
        fs::remove_dir_all(root).unwrap();
    }
}
