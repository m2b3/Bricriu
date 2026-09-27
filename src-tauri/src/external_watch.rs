use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::{
    collections::{hash_map::DefaultHasher, BTreeSet},
    hash::Hasher,
    io::Read,
    path::{Path, PathBuf},
    sync::{mpsc, Arc},
    thread::{self, JoinHandle},
    time::Duration,
};

pub struct ExternalWatcher {
    _native: Option<RecommendedWatcher>,
    _poll: ContentPoller,
}

enum PollSignal {
    Stop,
    #[cfg(test)]
    Check(mpsc::Sender<()>),
}

struct ContentPoller {
    signal: mpsc::Sender<PollSignal>,
    thread: Option<JoinHandle<()>>,
}

impl ContentPoller {
    fn new(
        paths: Vec<PathBuf>,
        on_change: Arc<impl Fn(Vec<String>) + Send + Sync + 'static>,
    ) -> Result<Self, String> {
        // Keep every requested path, including missing/locked files. notify's
        // PollWatcher silently skips registration if initial metadata fails.
        let mut previous: Vec<_> = paths.iter().map(|path| content_hash(path)).collect();
        let (signal, receiver) = mpsc::channel();
        let thread = thread::Builder::new()
            .name("outside-file-checks".into())
            .spawn(move || loop {
                let signal = receiver.recv_timeout(Duration::from_secs(2));
                if matches!(
                    signal,
                    Ok(PollSignal::Stop) | Err(mpsc::RecvTimeoutError::Disconnected)
                ) {
                    break;
                }
                let mut changed = Vec::new();
                for (path, old) in paths.iter().zip(&mut previous) {
                    let current = content_hash(path);
                    if current != *old {
                        *old = current;
                        changed.push(super::display_path(path));
                    }
                }
                if !changed.is_empty() {
                    on_change(changed);
                }
                #[cfg(test)]
                if let Ok(PollSignal::Check(done)) = signal {
                    let _ = done.send(());
                }
            })
            .map_err(|err| format!("Could not start periodic outside-file checks: {err}"))?;
        Ok(Self {
            signal,
            thread: Some(thread),
        })
    }

    fn stop(&mut self) {
        let _ = self.signal.send(PollSignal::Stop);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }

    #[cfg(test)]
    fn poll(&self) {
        let (done, result) = mpsc::channel();
        self.signal.send(PollSignal::Check(done)).unwrap();
        result.recv_timeout(Duration::from_secs(5)).unwrap();
    }
}

impl Drop for ContentPoller {
    fn drop(&mut self) {
        self.stop();
    }
}

fn content_hash(path: &Path) -> Option<u64> {
    let mut file = std::fs::File::open(path).ok()?;
    let mut hasher = DefaultHasher::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        match file.read(&mut buffer) {
            Ok(0) => return Some(hasher.finish()),
            Ok(length) => hasher.write(&buffer[..length]),
            Err(err) if err.kind() == std::io::ErrorKind::Interrupted => continue,
            Err(_) => return None,
        }
    }
}

// Watch parent directories so replacing a document during an atomic save does
// not detach the watch from its name. Only report explicitly opened documents.
pub fn watch(
    paths: Vec<PathBuf>,
    on_change: impl Fn(Vec<String>) + Send + Sync + 'static,
) -> Result<(Option<ExternalWatcher>, Vec<String>), String> {
    if paths.is_empty() {
        return Ok((None, Vec::new()));
    }
    let parents = paths
        .iter()
        .filter_map(|path| path.parent().map(ToOwned::to_owned))
        .collect::<BTreeSet<_>>();
    let on_change = Arc::new(on_change);
    let native_paths = paths.clone();
    let native_change = on_change.clone();
    let native = RecommendedWatcher::new(
        move |result: notify::Result<Event>| {
            let changed = match result {
                Ok(event) => changed_paths(&native_paths, &event),
                // An overflow or backend error may mean events were lost.
                Err(_) => native_paths
                    .iter()
                    .map(|path| super::display_path(path))
                    .collect(),
            };
            if !changed.is_empty() {
                native_change(changed);
            }
        },
        Config::default(),
    );
    let mut errors = Vec::new();
    let native = match native {
        Ok(mut watcher) => {
            for parent in parents {
                if let Err(err) = watcher.watch(&parent, RecursiveMode::NonRecursive) {
                    errors.push(format!(
                        "Native watch unavailable for {}: {err}. Periodic checks remain active.",
                        super::display_path(&parent)
                    ));
                }
            }
            Some(watcher)
        }
        Err(err) => {
            errors.push(format!(
                "Native file notifications unavailable: {err}. Periodic checks remain active."
            ));
            None
        }
    };

    // Sync tools and some filesystems omit native events or preserve timestamps.
    // Hash only the open files, never every file in their parent directories.
    let poll = ContentPoller::new(paths, on_change)?;
    Ok((
        Some(ExternalWatcher {
            _native: native,
            _poll: poll,
        }),
        errors,
    ))
}

fn changed_paths(paths: &[PathBuf], event: &Event) -> Vec<String> {
    if matches!(event.kind, EventKind::Access(_)) {
        return Vec::new();
    }
    paths
        .iter()
        .filter(|path| {
            event.need_rescan()
                || event.paths.iter().any(|changed| {
                    let path = comparison_path(path);
                    let changed = comparison_path(changed);
                    path == changed || path.starts_with(&changed)
                })
        })
        .map(|path| super::display_path(path))
        .collect()
}

fn comparison_path(path: &std::path::Path) -> PathBuf {
    let path = super::display_path(path);
    if super::paths_case_sensitive() {
        PathBuf::from(path)
    } else {
        PathBuf::from(path.to_lowercase())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use notify::event::{AccessKind, ModifyKind, RenameMode};

    #[test]
    fn filters_reads_and_unrelated_files() {
        let paths = vec![PathBuf::from("/outside/note.md")];
        let read = Event::new(EventKind::Access(AccessKind::Any)).add_path(paths[0].clone());
        assert!(changed_paths(&paths, &read).is_empty());
        let unrelated = Event::new(EventKind::Modify(ModifyKind::Any))
            .add_path(PathBuf::from("/outside/other.md"));
        assert!(changed_paths(&paths, &unrelated).is_empty());
    }

    #[test]
    fn detects_atomic_replacement_and_parent_removal() {
        let paths = vec![PathBuf::from("/outside/note.md")];
        let replaced = Event::new(EventKind::Modify(ModifyKind::Name(RenameMode::Both)))
            .add_path(PathBuf::from("/outside/.temp"))
            .add_path(paths[0].clone());
        assert_eq!(changed_paths(&paths, &replaced).len(), 1);
        let removed = Event::new(EventKind::Remove(notify::event::RemoveKind::Folder))
            .add_path(PathBuf::from("/outside"));
        assert_eq!(changed_paths(&paths, &removed).len(), 1);
    }

    #[test]
    fn native_watch_survives_file_replacement_and_recreation() {
        use std::{fs, sync::mpsc, time::Duration};
        let root = std::env::temp_dir().join(format!(
            "bricriu-watch-{}-{}",
            std::process::id(),
            super::super::now_ms()
        ));
        fs::create_dir_all(&root).unwrap();
        let root = root.canonicalize().unwrap();
        let path = root.join("note.md");
        fs::write(&path, "initial").unwrap();
        let (sender, receiver) = mpsc::channel();
        let (watcher, errors) = watch(vec![path.clone()], move |paths| {
            let _ = sender.send(paths);
        })
        .unwrap();
        assert!(errors.is_empty());
        let mut watcher = watcher.unwrap();
        watcher._poll.stop();
        let wait_for_change = || {
            let paths = receiver.recv_timeout(Duration::from_secs(5)).unwrap();
            assert_eq!(paths, vec![super::super::display_path(&path)]);
            // Drain duplicate native events before the next operation so an old
            // notification cannot make the next assertion pass accidentally.
            while receiver.recv_timeout(Duration::from_millis(100)).is_ok() {}
        };
        fs::write(&path, "edited").unwrap();
        wait_for_change();
        let replacement = root.join("replacement.tmp");
        fs::write(&replacement, "replaced").unwrap();
        super::super::replace_file(&replacement, &path).unwrap();
        wait_for_change();
        fs::remove_file(&path).unwrap();
        wait_for_change();
        fs::write(&path, "recreated").unwrap();
        wait_for_change();
        drop(watcher);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn polling_detects_preserved_timestamps_and_recovers_without_native_events() {
        use std::{fs, sync::mpsc};
        let root = std::env::temp_dir().join(format!(
            "bricriu-poll-{}-{}",
            std::process::id(),
            super::super::now_ms()
        ));
        fs::create_dir_all(&root).unwrap();
        let root = root.canonicalize().unwrap();
        let path = root.join("note.md");
        fs::write(&path, "initial").unwrap();
        let modified = fs::metadata(&path).unwrap().modified().unwrap();
        let (sender, receiver) = mpsc::channel();
        let (watcher, errors) = watch(vec![path.clone()], move |paths| {
            let _ = sender.send(paths);
        })
        .unwrap();
        assert!(errors.is_empty());
        let mut watcher = watcher.unwrap();
        // Prove the fallback detects changes with native notifications disabled.
        watcher._native = None;
        fs::write(&path, "changed").unwrap();
        fs::File::options()
            .write(true)
            .open(&path)
            .unwrap()
            .set_modified(modified)
            .unwrap();
        watcher._poll.poll();
        assert_eq!(
            receiver.recv_timeout(Duration::from_secs(5)).unwrap(),
            vec![super::super::display_path(&path)]
        );
        fs::remove_file(&path).unwrap();
        watcher._poll.poll();
        receiver.recv_timeout(Duration::from_secs(5)).unwrap();
        while receiver.recv_timeout(Duration::from_millis(100)).is_ok() {}
        // Restore even the parent folder to exercise a detached directory watch.
        fs::remove_dir(&root).unwrap();
        fs::create_dir(&root).unwrap();
        fs::write(&path, "recreated").unwrap();
        watcher._poll.poll();
        assert_eq!(
            receiver.recv_timeout(Duration::from_secs(5)).unwrap(),
            vec![super::super::display_path(&path)]
        );
        drop(watcher);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn polling_tracks_a_file_missing_when_the_watch_starts() {
        use std::fs;
        let root = std::env::temp_dir().join(format!(
            "bricriu-poll-missing-{}-{}",
            std::process::id(),
            super::super::now_ms()
        ));
        fs::create_dir_all(&root).unwrap();
        let path = root.canonicalize().unwrap().join("note.md");
        let (sender, receiver) = mpsc::channel();
        let (watcher, errors) = watch(vec![path.clone()], move |paths| {
            let _ = sender.send(paths);
        })
        .unwrap();
        assert!(errors.is_empty());
        let mut watcher = watcher.unwrap();
        watcher._native = None;
        fs::write(&path, "restored").unwrap();
        watcher._poll.poll();
        assert_eq!(
            receiver.recv_timeout(Duration::from_secs(5)).unwrap(),
            vec![super::super::display_path(&path)]
        );
        watcher._poll.poll();
        assert!(receiver.try_recv().is_err());
        drop(watcher);
        fs::remove_dir_all(root).unwrap();
    }
}
