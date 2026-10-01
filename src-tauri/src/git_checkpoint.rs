#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::{
    path::Path,
    process::{Command, Output},
};

pub const PUBLIC_CHECKPOINT_ROOT: &str = "BRICRIU_PUBLIC_CHECKPOINT_ROOT";

// These exclusions apply to both staging and committing. In particular, an
// already-staged private file must not sneak into a public checkpoint.
// The single-character globs keep the names exact while preventing `git add`
// from treating excluded, ignored paths as explicitly requested files. Each
// directory also needs a separate glob for its contents.
const PUBLIC_PATHS: &[&str] = &[
    ".",
    ":(exclude,glob).[h]",
    ":(exclude,glob).[h]/**",
    ":(exclude,glob).[h]orig",
    ":(exclude,glob).[h]orig/**",
    ":(exclude,glob).[h].zip",
    ":(exclude,glob).[n]otesproject/track/.h",
    ":(exclude,glob).[n]otesproject/track/.h/**",
    ":(exclude,glob).[h].notesproject-new*",
    ":(exclude,glob).[h].notesproject-new*/**",
    ":(exclude,glob).[h]orig.notesproject-new*",
    ":(exclude,glob).[h]orig.notesproject-new*/**",
    ":(exclude,glob).[h].zip.notesproject-tmp*",
];

pub fn checkpoint_public(root: &Path) -> Result<bool, String> {
    checked(
        root,
        &["add", "-A", "--"],
        "Could not stage public vault changes.",
    )?;
    let diff = run(root, &["diff", "--cached", "--quiet", "--"])?;
    match diff.status.code() {
        Some(0) => return Ok(false),
        Some(1) => {}
        _ => return Err(failure("Could not inspect public vault changes.", &diff)),
    }
    checked(
        root,
        &["commit", "--only", "-m", "Bricriu public checkpoint", "--"],
        "Could not create public checkpoint commit.",
    )?;
    Ok(true)
}

fn run(root: &Path, args: &[&str]) -> Result<Output, String> {
    let mut command = Command::new("git");
    command.current_dir(root).args(args).args(PUBLIC_PATHS);
    // Only our generated private-vault hook reads this. Existing user hooks
    // still execute and may reject the commit normally.
    command.env(PUBLIC_CHECKPOINT_ROOT, root);
    #[cfg(windows)]
    command.creation_flags(0x08000000);
    command
        .output()
        .map_err(|err| format!("Could not run Git: {err}"))
}

fn checked(root: &Path, args: &[&str], context: &str) -> Result<(), String> {
    let output = run(root, args)?;
    if output.status.success() {
        Ok(())
    } else {
        Err(failure(context, &output))
    }
}

fn failure(context: &str, output: &Output) -> String {
    let detail = if output.stderr.is_empty() {
        &output.stdout
    } else {
        &output.stderr
    };
    format!("{context} {}", String::from_utf8_lossy(detail).trim())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    struct Repo(PathBuf);
    impl Repo {
        fn new() -> Self {
            let root = std::env::temp_dir().join(format!(
                "bricriu-public-checkpoint-{}-{}",
                std::process::id(),
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            ));
            fs::create_dir_all(&root).unwrap();
            let repo = Self(root);
            repo.git(&["init", "-b", "inuse"]);
            repo.git(&["config", "user.name", "Checkpoint Test"]);
            repo.git(&["config", "user.email", "checkpoint@example.invalid"]);
            repo.git(&["config", "commit.gpgSign", "false"]);
            repo.git(&["config", "core.hooksPath", ".git/hooks"]);
            repo
        }

        fn git(&self, args: &[&str]) -> String {
            let result = Command::new("git")
                .current_dir(&self.0)
                .args(args)
                .output()
                .unwrap();
            assert!(
                result.status.success(),
                "{:?}: {}",
                args,
                String::from_utf8_lossy(&result.stderr)
            );
            String::from_utf8(result.stdout).unwrap()
        }

        fn write(&self, path: &str, body: &str) {
            let path = self.0.join(path);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(path, body).unwrap();
        }
    }

    impl Drop for Repo {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn public_checkpoint_handles_ignored_private_paths_at_root_and_in_nested_vaults() {
        let private_paths = [
            ".h/secret.md",
            ".horig/secret.md",
            ".h.zip",
            ".notesproject/track/.h/secret.json",
            ".h.notesproject-new-1/secret.md",
            ".horig.notesproject-new-1/secret.md",
            ".h.zip.notesproject-tmp-1",
        ];
        let public_paths = [".h.zip.md", ".history.md", ".horiginal.md", "public.md"];
        for prefix in ["", "mydocs/"] {
            for ignore_file in [".gitignore", ".git/info/exclude"] {
                let repo = Repo::new();
                repo.write("README.md", "initial");
                repo.write(
                    ignore_file,
                    ".h/\n.horig/\n.h.zip\n.notesproject/\n.h.notesproject-new*/\n.horig.notesproject-new*/\n.h.zip.notesproject-tmp*\n",
                );
                repo.git(&["add", "."]);
                repo.git(&["commit", "-m", "initial"]);
                for path in private_paths {
                    let path = format!("{prefix}{path}");
                    repo.write(&path, "private bytes");
                    repo.git(&["check-ignore", "--", &path]);
                }
                for path in public_paths {
                    repo.write(&format!("{prefix}{path}"), "public bytes");
                }
                let root = repo.0.join(prefix);
                assert!(checkpoint_public(&root).unwrap());
                let expected = public_paths
                    .iter()
                    .map(|path| format!("{prefix}{path}"))
                    .collect::<Vec<_>>()
                    .join("\n");
                assert_eq!(
                    repo.git(&["show", "--format=", "--name-only", "HEAD"])
                        .trim(),
                    expected
                );
                assert!(repo.git(&["diff", "--cached", "--name-only"]).is_empty());
                for path in private_paths {
                    assert_eq!(fs::read(root.join(path)).unwrap(), b"private bytes");
                }
                assert!(!checkpoint_public(&root).unwrap());
            }
        }
    }

    #[test]
    fn public_checkpoint_excludes_staged_private_files_and_preserves_the_archive() {
        let repo = Repo::new();
        repo.write("public.md", "public");
        for path in [
            ".h/secret.md",
            ".horig/secret.md",
            ".h.zip",
            ".notesproject/track/.h/secret.json",
            ".h.notesproject-new-1/secret.md",
            ".horig.notesproject-new-1/secret.md",
            ".h.zip.notesproject-tmp-1",
        ] {
            repo.write(path, "private bytes");
        }
        repo.git(&["add", "-f", "."]);
        assert!(checkpoint_public(&repo.0).unwrap());
        assert_eq!(
            repo.git(&["ls-tree", "-r", "--name-only", "HEAD"]).trim(),
            "public.md"
        );
        let staged = repo.git(&["diff", "--cached", "--name-only"]);
        assert!(staged.contains(".h/secret.md"));
        assert!(staged.contains(".h.zip"));
        assert_eq!(fs::read(repo.0.join(".h.zip")).unwrap(), b"private bytes");
        assert!(!checkpoint_public(&repo.0).unwrap());
    }

    #[test]
    fn nested_vault_checkpoint_includes_public_deletions_but_no_sibling_or_private_changes() {
        let repo = Repo::new();
        repo.write("vault/public.md", "old");
        repo.write("vault/deleted.md", "remove me");
        repo.write("vault/.h.zip", "old archive");
        repo.write("sibling.md", "old sibling");
        repo.git(&["add", "."]);
        repo.git(&["commit", "-m", "initial"]);
        repo.write("vault/public.md", "new");
        fs::remove_file(repo.0.join("vault/deleted.md")).unwrap();
        repo.write("vault/.h.zip", "new archive");
        repo.write("sibling.md", "new sibling");
        repo.git(&["add", "."]);
        assert!(checkpoint_public(&repo.0.join("vault")).unwrap());
        assert_eq!(
            repo.git(&["show", "--format=", "--name-only", "HEAD"])
                .trim(),
            "vault/deleted.md\nvault/public.md"
        );
        assert_eq!(repo.git(&["show", "HEAD:vault/.h.zip"]), "old archive");
        assert_eq!(
            fs::read(repo.0.join("vault/.h.zip")).unwrap(),
            b"new archive"
        );
        assert_eq!(
            repo.git(&["diff", "--cached", "--name-only"]).trim(),
            "sibling.md\nvault/.h.zip"
        );
    }

    #[test]
    fn locked_vault_with_only_private_changes_has_nothing_to_commit() {
        let repo = Repo::new();
        repo.write(".h/secret.md", "no password supplied");
        assert!(!checkpoint_public(&repo.0).unwrap());
        assert!(repo.git(&["diff", "--cached", "--name-only"]).is_empty());
        assert!(!repo.0.join(".h.zip").exists());
        assert!(!repo.0.join(".horig").exists());
    }
}
