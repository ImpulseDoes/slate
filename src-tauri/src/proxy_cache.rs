use std::{
    cmp::Reverse,
    fs,
    path::{Path, PathBuf},
    time::{Duration, SystemTime},
};

const DAY: Duration = Duration::from_secs(24 * 60 * 60);
const MAX_AGE: Duration = Duration::from_secs(30 * 24 * 60 * 60);
const MAX_BYTES: u64 = 20 * 1024 * 1024 * 1024;

struct Entry {
    path: PathBuf,
    bytes: u64,
    used: SystemTime,
}

/// What can go, newest first kept. The newest always stays, however big, since a project is using it.
fn stale(mut entries: Vec<Entry>, now: SystemTime) -> Vec<PathBuf> {
    entries.sort_by_key(|entry| Reverse(entry.used));
    let mut total = 0;
    let mut doomed = Vec::new();
    for (index, entry) in entries.into_iter().enumerate() {
        total += entry.bytes;
        let unfinished = entry.path.to_string_lossy().contains(".part.");
        let limit = if unfinished { DAY } else { MAX_AGE };
        let old = now.duration_since(entry.used).is_ok_and(|age| age > limit);
        if old || (index > 0 && total > MAX_BYTES) {
            doomed.push(entry.path);
        }
    }
    doomed
}

/// Every copy can be made again, so losing one only costs the time to make it.
pub fn trim(dir: &Path) {
    let Ok(listing) = fs::read_dir(dir) else { return };
    let entries = listing
        .filter_map(Result::ok)
        .filter_map(|file| {
            let meta = file.metadata().ok()?;
            Some(Entry { path: file.path(), bytes: meta.len(), used: meta.modified().ok()? })
        })
        .collect();
    for path in stale(entries, SystemTime::now()) {
        let _ = fs::remove_file(path);
    }
}

/// The modified date doubles as the last use, so that a project in use keeps its copies.
pub fn touch(path: &Path) {
    let _ = fs::File::options().write(true).open(path).and_then(|file| file.set_modified(SystemTime::now()));
}

#[cfg(test)]
mod tests {
    use super::*;

    const GB: u64 = 1024 * 1024 * 1024;

    fn entry(name: &str, bytes: u64, days_ago: u64, now: SystemTime) -> Entry {
        Entry { path: PathBuf::from(name), bytes, used: now - DAY * days_ago as u32 }
    }

    #[test]
    fn unused_copies_expire() {
        let now = SystemTime::now();
        let doomed = stale(vec![entry("new.mp4", GB, 29, now), entry("old.mp4", GB, 31, now)], now);
        assert_eq!(doomed, [PathBuf::from("old.mp4")]);
    }

    #[test]
    fn over_the_limit_the_longest_unused_go_first() {
        let now = SystemTime::now();
        let doomed = stale(vec![entry("c.mp4", 8 * GB, 3, now), entry("a.mp4", 8 * GB, 1, now), entry("b.mp4", 8 * GB, 2, now)], now);
        assert_eq!(doomed, [PathBuf::from("c.mp4")]);
    }

    #[test]
    fn the_newest_stays_even_when_it_alone_is_over_the_limit() {
        let now = SystemTime::now();
        assert!(stale(vec![entry("huge.mp4", 50 * GB, 0, now)], now).is_empty());
    }

    #[test]
    fn an_unfinished_copy_goes_after_a_day_but_not_while_it_may_be_running() {
        let now = SystemTime::now();
        let doomed = stale(vec![entry("a.part.mp4", 1, 0, now), entry("b.part.mp4", 1, 2, now)], now);
        assert_eq!(doomed, [PathBuf::from("b.part.mp4")]);
    }

    #[test]
    fn trim_only_touches_what_is_stale() {
        let dir = std::env::temp_dir().join(format!("slate-trim-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let (old, new) = (dir.join("old.mp4"), dir.join("new.mp4"));
        fs::write(&old, b"x").unwrap();
        fs::write(&new, b"x").unwrap();
        let file = fs::File::options().write(true).open(&old).unwrap();
        file.set_modified(SystemTime::now() - MAX_AGE - DAY).unwrap();
        drop(file);
        trim(&dir);
        assert!(!old.exists());
        assert!(new.exists());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn touching_counts_as_use() {
        let path = std::env::temp_dir().join(format!("slate-touch-{}.mp4", std::process::id()));
        fs::write(&path, b"x").unwrap();
        let file = fs::File::options().write(true).open(&path).unwrap();
        let long_ago = SystemTime::now() - MAX_AGE * 2;
        file.set_modified(long_ago).unwrap();
        drop(file);
        touch(&path);
        let used = fs::metadata(&path).unwrap().modified().unwrap();
        fs::remove_file(path).unwrap();
        assert!(used.duration_since(long_ago).unwrap() > MAX_AGE);
    }
}