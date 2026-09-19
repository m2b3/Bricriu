use serde::Serialize;
use std::{ffi::OsString, path::Path};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupNote {
    pub vault_path: String,
    pub path: String,
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
        return Err("Only existing Markdown and Typst files can be opened.".to_string());
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
}
