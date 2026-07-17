use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};

#[cfg_attr(not(test), allow(dead_code))]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum AtomicWriteStage {
    Write,
    Flush,
    Replace,
}

pub(crate) fn atomic_write(path: &Path, bytes: &[u8]) -> io::Result<()> {
    atomic_write_inner(path, bytes, None)
}

#[cfg(test)]
pub(crate) fn atomic_write_failing(
    path: &Path,
    bytes: &[u8],
    stage: AtomicWriteStage,
) -> io::Result<()> {
    atomic_write_inner(path, bytes, Some(stage))
}

fn atomic_write_inner(
    path: &Path,
    bytes: &[u8],
    #[cfg_attr(not(test), allow(unused_variables))] fail_at: Option<AtomicWriteStage>,
) -> io::Result<()> {
    let parent = path
        .parent()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "file has no parent"))?;
    fs::create_dir_all(parent)?;
    let (temp_path, mut temp_file) = create_temp_sibling(path)?;

    let result = (|| {
        #[cfg(test)]
        if fail_at == Some(AtomicWriteStage::Write) {
            return Err(io::Error::other("injected temporary write failure"));
        }
        temp_file.write_all(bytes)?;

        #[cfg(test)]
        if fail_at == Some(AtomicWriteStage::Flush) {
            return Err(io::Error::other("injected temporary flush failure"));
        }
        temp_file.sync_all()?;
        drop(temp_file);

        #[cfg(test)]
        if fail_at == Some(AtomicWriteStage::Replace) {
            return Err(io::Error::other("injected atomic replace failure"));
        }
        replace_file(&temp_path, path)?;
        sync_parent(parent)?;
        Ok(())
    })();

    if result.is_err() {
        let _ = fs::remove_file(&temp_path);
    }
    result
}

fn create_temp_sibling(path: &Path) -> io::Result<(PathBuf, File)> {
    let parent = path
        .parent()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "file has no parent"))?;
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("settings");
    for _ in 0..16 {
        let candidate = parent.join(format!(
            ".{file_name}.{}.{}.tmp",
            std::process::id(),
            uuid::Uuid::new_v4()
        ));
        match OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&candidate)
        {
            Ok(file) => return Ok((candidate, file)),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error),
        }
    }
    Err(io::Error::new(
        io::ErrorKind::AlreadyExists,
        "could not allocate unique sibling temporary file",
    ))
}

#[cfg(windows)]
fn replace_file(source: &Path, destination: &Path) -> io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };

    let source: Vec<u16> = source.as_os_str().encode_wide().chain(Some(0)).collect();
    let destination: Vec<u16> = destination
        .as_os_str()
        .encode_wide()
        .chain(Some(0))
        .collect();
    let result = unsafe {
        MoveFileExW(
            source.as_ptr(),
            destination.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if result == 0 {
        Err(io::Error::last_os_error())
    } else {
        Ok(())
    }
}

#[cfg(not(windows))]
fn replace_file(source: &Path, destination: &Path) -> io::Result<()> {
    fs::rename(source, destination)
}

#[cfg(unix)]
fn sync_parent(parent: &Path) -> io::Result<()> {
    File::open(parent)?.sync_all()
}

#[cfg(not(unix))]
fn sync_parent(_parent: &Path) -> io::Result<()> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_entries(dir: &Path) -> Vec<PathBuf> {
        fs::read_dir(dir)
            .unwrap()
            .map(|entry| entry.unwrap().path())
            .filter(|path| path.extension().and_then(|ext| ext.to_str()) == Some("tmp"))
            .collect()
    }

    #[test]
    fn writes_new_and_replaces_existing_file_without_temp_files() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("settings.json");
        atomic_write(&path, b"old").unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"old");
        atomic_write(&path, b"new").unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"new");
        assert!(temp_entries(dir.path()).is_empty());
    }

    #[test]
    fn injected_failures_keep_old_file_and_clean_temp_file() {
        for stage in [
            AtomicWriteStage::Write,
            AtomicWriteStage::Flush,
            AtomicWriteStage::Replace,
        ] {
            let dir = tempfile::tempdir().unwrap();
            let path = dir.path().join("settings.json");
            fs::write(&path, b"old").unwrap();
            atomic_write_failing(&path, b"new", stage).unwrap_err();
            assert_eq!(fs::read(&path).unwrap(), b"old");
            assert!(temp_entries(dir.path()).is_empty());
        }
    }
}
