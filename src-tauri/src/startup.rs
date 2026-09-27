use serde::Serialize;
use std::{
    collections::VecDeque,
    ffi::OsString,
    path::{Path, PathBuf},
    sync::Mutex,
};

pub struct OpenRequest {
    pub args: Vec<OsString>,
    pub working_dir: PathBuf,
}

// Keep requests until the frontend is ready, including launches during startup.
#[derive(Default)]
pub struct OpenRequests(Mutex<VecDeque<OpenRequest>>);

impl OpenRequests {
    pub fn push(&self, args: Vec<OsString>, working_dir: PathBuf) {
        if !args.is_empty() {
            self.0
                .lock()
                .unwrap_or_else(|err| err.into_inner())
                .push_back(OpenRequest { args, working_dir });
        }
    }

    pub fn pop(&self) -> Option<OpenRequest> {
        self.0
            .lock()
            .unwrap_or_else(|err| err.into_inner())
            .pop_front()
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupNote {
    pub vault_path: String,
    pub path: String,
}

pub fn resolve_open_note(
    request: OpenRequest,
    current_vault: Option<&Path>,
    preferred_vault: Option<&Path>,
) -> Result<Option<StartupNote>, String> {
    let Some(mut note) = resolve_startup_note(
        request.args,
        &request.working_dir,
        current_vault.or(preferred_vault),
    )?
    else {
        return Ok(None);
    };
    if let Some(root) = current_vault {
        // Preserve the running session. Reuse the existing external-document
        // support for files outside its vault; in-vault paths stay relative.
        let absolute = Path::new(&note.vault_path).join(&note.path);
        let root = root
            .canonicalize()
            .map_err(|err| format!("Could not resolve the current vault: {err}"))?;
        let absolute = absolute
            .canonicalize()
            .map_err(|err| format!("Could not resolve the requested note: {err}"))?;
        note.path = super::document_display_path(
            &root,
            &absolute,
            !super::path_is_inside(&absolute, &root),
        )?;
        note.vault_path = super::display_path(&root);
    }
    Ok(Some(note))
}

pub fn resolve_startup_note(
    args: impl IntoIterator<Item = OsString>,
    working_dir: &Path,
    preferred_vault: Option<&Path>,
) -> Result<Option<StartupNote>, String> {
    let mut args = args.into_iter();
    let first = args.next();
    let file = if first.as_deref() == Some(std::ffi::OsStr::new("--")) {
        args.next()
    } else {
        first
    };
    let Some(file) = file else {
        return Ok(None);
    };
    if args.next().is_some() {
        return Err("Open one file at a time: b \"path to note.md\".".to_string());
    }

    // Resolve against the caller's directory before choosing a vault. In
    // particular, a relative CLI path must not be relative to the last vault.
    let requested = working_dir.join(&file);
    let absolute = requested
        .canonicalize()
        .map_err(|err| format!("Could not open {}: {err}", requested.display()))?;
    if !absolute.is_file() || !super::is_note_file(&absolute) {
        return Err(
            "Only existing Markdown, Typst, TXT, CSV, and JSON files can be opened.".to_string(),
        );
    }
    let root = preferred_vault
        .and_then(|root| root.canonicalize().ok())
        .filter(|root| root.is_dir() && super::path_is_inside(&absolute, root))
        .unwrap_or_else(|| {
            absolute
                .parent()
                .expect("A file has a parent")
                .to_path_buf()
        });

    Ok(Some(StartupNote {
        vault_path: super::display_path(&root),
        path: super::to_posix_relative(&root, &absolute)?,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs,
        path::PathBuf,
        sync::atomic::{AtomicUsize, Ordering},
    };

    static NEXT_ROOT: AtomicUsize = AtomicUsize::new(0);

    struct TestRoot(PathBuf);

    impl TestRoot {
        fn new() -> Self {
            let root = std::env::temp_dir().join(format!(
                "bricriu-startup-test-{}-{}-{}",
                std::process::id(),
                super::super::now_ms(),
                NEXT_ROOT.fetch_add(1, Ordering::Relaxed)
            ));
            fs::create_dir(&root).unwrap();
            Self(root.canonicalize().unwrap())
        }

        fn note(&self, path: &str) -> PathBuf {
            let file = self.0.join(path);
            fs::create_dir_all(file.parent().unwrap()).unwrap();
            fs::write(&file, "# Test note").unwrap();
            file
        }
    }

    impl Drop for TestRoot {
        fn drop(&mut self) {
            assert!(self
                .0
                .starts_with(std::env::temp_dir().canonicalize().unwrap()));
            fs::remove_dir_all(&self.0).unwrap();
        }
    }

    #[test]
    fn no_filename_leaves_startup_unchanged() {
        assert!(resolve_startup_note([], Path::new("."), None)
            .unwrap()
            .is_none());
    }

    #[test]
    fn relative_filename_uses_callers_directory_and_keeps_literal_characters() {
        let root = TestRoot::new();
        root.note("notes/résumé #1.md");
        let result = resolve_startup_note([OsString::from("notes/résumé #1.md")], &root.0, None)
            .unwrap()
            .unwrap();
        assert_eq!(
            result.vault_path,
            super::super::display_path(&root.0.join("notes"))
        );
        assert_eq!(result.path, "résumé #1.md");
    }

    #[test]
    fn absolute_filename_reuses_containing_vault_and_returns_relative_path() {
        let root = TestRoot::new();
        let file = root.note("nested/doc.MD");
        let result = resolve_startup_note(
            [file.into_os_string()],
            &root.0.join("elsewhere"),
            Some(&root.0),
        )
        .unwrap()
        .unwrap();
        assert_eq!(result.vault_path, super::super::display_path(&root.0));
        assert_eq!(result.path, "nested/doc.MD");
    }

    #[test]
    fn sibling_of_saved_vault_uses_its_own_folder() {
        let root = TestRoot::new();
        root.note("vault/old.md");
        root.note("vault-other/doc.md");
        let result = resolve_startup_note(
            [OsString::from("../vault-other/doc.md")],
            &root.0.join("vault"),
            Some(&root.0.join("vault")),
        )
        .unwrap()
        .unwrap();
        assert_eq!(
            result.vault_path,
            super::super::display_path(&root.0.join("vault-other"))
        );
        assert_eq!(result.path, "doc.md");
    }

    #[test]
    fn stale_saved_vault_does_not_block_opening() {
        let root = TestRoot::new();
        root.note("doc.markdown");
        let result = resolve_startup_note(
            [OsString::from("doc.markdown")],
            &root.0,
            Some(&root.0.join("missing")),
        )
        .unwrap()
        .unwrap();
        assert_eq!(result.path, "doc.markdown");
    }

    #[test]
    fn invalid_paths_are_rejected_without_creating_files() {
        let root = TestRoot::new();
        root.note("image.png");
        fs::create_dir(root.0.join("folder.md")).unwrap();
        for path in ["missing.md", "image.png", "folder.md"] {
            assert!(resolve_startup_note([OsString::from(path)], &root.0, None).is_err());
        }
        assert!(!root.0.join("missing.md").exists());
    }

    #[test]
    fn multiple_filenames_are_rejected() {
        assert!(resolve_startup_note(
            [OsString::from("first.md"), OsString::from("second.md")],
            Path::new("."),
            None,
        )
        .is_err());
    }

    #[test]
    fn accepts_option_separator_and_typst_files() {
        let root = TestRoot::new();
        root.note("--example.typ");
        let result = resolve_startup_note(
            [OsString::from("--"), OsString::from("--example.typ")],
            &root.0,
            None,
        )
        .unwrap()
        .unwrap();
        assert_eq!(result.path, "--example.typ");
    }

    #[test]
    fn running_instance_keeps_its_vault_for_external_documents() {
        let root = TestRoot::new();
        root.note("vault/edited.md");
        let external = root.note("other/résumé #1.typ");
        let result = resolve_open_note(
            OpenRequest {
                args: vec![OsString::from("other/résumé #1.typ")],
                working_dir: root.0.clone(),
            },
            Some(&root.0.join("vault")),
            Some(&root.0.join("other")),
        )
        .unwrap()
        .unwrap();
        assert_eq!(
            result.vault_path,
            super::super::display_path(&root.0.join("vault"))
        );
        assert_eq!(result.path, super::super::display_path(&external));
    }

    #[test]
    fn running_instance_returns_relative_paths_for_its_own_notes() {
        let root = TestRoot::new();
        let file = root.note("nested/note.markdown");
        let result = resolve_open_note(
            OpenRequest {
                args: vec![file.into_os_string()],
                working_dir: root.0.join("unrelated"),
            },
            Some(&root.0),
            None,
        )
        .unwrap()
        .unwrap();
        assert_eq!(result.vault_path, super::super::display_path(&root.0));
        assert_eq!(result.path, "nested/note.markdown");
    }

    #[test]
    fn text_documents_open_in_new_and_running_instances_and_keep_their_extensions() {
        let root = TestRoot::new();
        for name in ["résumé #1.txt", "table.CSV", "settings.json"] {
            let file = root.note(name);
            assert!(super::super::is_note_file(&file));
            assert_eq!(
                super::super::with_default_note_extension(file.clone()),
                file
            );
            assert_eq!(super::super::normalize_note_path(name).unwrap(), name);
            let (saved_name, _) = super::super::resolve_new_vault_note_path(&root.0, name).unwrap();
            assert_eq!(saved_name, name);
            for current_vault in [None, Some(root.0.as_path())] {
                let opened = resolve_open_note(
                    OpenRequest {
                        args: vec![file.clone().into_os_string()],
                        working_dir: root.0.clone(),
                    },
                    current_vault,
                    None,
                )
                .unwrap()
                .unwrap();
                assert_eq!(opened.path, name);
            }
        }
        let collected = super::super::collect_note_files(&root.0, false).unwrap();
        assert_eq!(collected.len(), 3);
    }

    #[test]
    fn plain_text_saves_preserve_content_without_reformatting() {
        let root = TestRoot::new();
        for (name, body) in [
            ("note.txt", "# literal text\r\n1. first\r\n[[not a link]]"),
            ("data.csv", "name,value\r\n\"one,two\",\"001\"\r\n"),
            (
                "settings.json",
                "{\r\n  \"items\": [[1, 2]], \"text\": \"$x$\"\r\n}\r\n",
            ),
        ] {
            let file = root.note(name);
            super::super::write_note_atomically(&file, body).unwrap();
            assert_eq!(fs::read_to_string(&file).unwrap(), body);
        }
    }

    #[test]
    fn queued_launches_keep_order_and_survive_an_invalid_request() {
        let root = TestRoot::new();
        root.note("first.md");
        root.note("second.typ");
        let queue = OpenRequests::default();
        queue.push(vec![], root.0.clone());
        for file in ["first.md", "missing.md", "second.typ"] {
            queue.push(vec![OsString::from(file)], root.0.clone());
        }
        let first = resolve_open_note(queue.pop().unwrap(), None, None)
            .unwrap()
            .unwrap();
        assert_eq!(first.path, "first.md");
        assert!(resolve_open_note(queue.pop().unwrap(), None, None).is_err());
        let second = resolve_open_note(queue.pop().unwrap(), None, None)
            .unwrap()
            .unwrap();
        assert_eq!(second.path, "second.typ");
        assert!(queue.pop().is_none());
    }
}
