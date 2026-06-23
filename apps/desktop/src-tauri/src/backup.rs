use std::fs::{self, File};
use std::io;
use std::path::Path;

use zip::write::SimpleFileOptions;
use zip::ZipArchive;

/// Backup is a portable `.zip` of the markdown vault (note `.md` files plus the
/// `.skriuw/` metadata). The SQLite index is NOT included — it is a derived
/// cache the app rebuilds from the vault on import, so a backup stays a plain,
/// inspectable folder of markdown.

fn map_zip(error: zip::result::ZipError) -> io::Error {
	io::Error::new(io::ErrorKind::Other, error)
}

/// Recursively zip everything under `src_dir` into `out_path`, storing entries
/// with paths relative to `src_dir`.
pub fn zip_dir(src_dir: &Path, out_path: &Path) -> io::Result<()> {
	let file = File::create(out_path)?;
	let mut zip = zip::ZipWriter::new(file);
	let options = SimpleFileOptions::default();
	add_dir(&mut zip, src_dir, src_dir, options)?;
	zip.finish().map_err(map_zip)?;
	Ok(())
}

fn add_dir(
	zip: &mut zip::ZipWriter<File>,
	base: &Path,
	dir: &Path,
	options: SimpleFileOptions,
) -> io::Result<()> {
	for entry in fs::read_dir(dir)? {
		let path = entry?.path();
		let rel = path
			.strip_prefix(base)
			.map_err(|error| io::Error::new(io::ErrorKind::Other, error))?
			.to_string_lossy()
			.replace('\\', "/");
		if path.is_dir() {
			zip.add_directory(format!("{rel}/"), options).map_err(map_zip)?;
			add_dir(zip, base, &path, options)?;
		} else {
			zip.start_file(rel, options).map_err(map_zip)?;
			let bytes = fs::read(&path)?;
			io::Write::write_all(zip, &bytes)?;
		}
	}
	Ok(())
}

/// Extract every entry of `zip_path` under `dest_dir` (created if missing).
/// Entries are confined to `dest_dir`; any path that would escape it (zip-slip)
/// is rejected.
pub fn unzip_into(zip_path: &Path, dest_dir: &Path) -> io::Result<()> {
	fs::create_dir_all(dest_dir)?;
	let file = File::open(zip_path)?;
	let mut archive = ZipArchive::new(file).map_err(map_zip)?;
	for index in 0..archive.len() {
		let mut entry = archive.by_index(index).map_err(map_zip)?;
		let rel = match entry.enclosed_name() {
			Some(name) => name,
			None => continue,
		};
		let out = dest_dir.join(&rel);
		if !out.starts_with(dest_dir) {
			return Err(io::Error::new(io::ErrorKind::InvalidData, "zip entry escapes destination"));
		}
		if entry.is_dir() {
			fs::create_dir_all(&out)?;
		} else {
			if let Some(parent) = out.parent() {
				fs::create_dir_all(parent)?;
			}
			let mut writer = File::create(&out)?;
			io::copy(&mut entry, &mut writer)?;
		}
	}
	Ok(())
}

/// Remove every entry inside `dir` while keeping `dir` itself.
pub fn clear_dir_contents(dir: &Path) -> io::Result<()> {
	if !dir.exists() {
		return Ok(());
	}
	for entry in fs::read_dir(dir)? {
		let path = entry?.path();
		if path.is_dir() {
			fs::remove_dir_all(&path)?;
		} else {
			fs::remove_file(&path)?;
		}
	}
	Ok(())
}

#[cfg(test)]
mod tests {
	use super::*;

	fn write(path: &Path, body: &str) {
		if let Some(parent) = path.parent() {
			fs::create_dir_all(parent).unwrap();
		}
		fs::write(path, body).unwrap();
	}

	#[test]
	fn zip_then_unzip_roundtrips_nested_files() {
		let src = tempfile::tempdir().unwrap();
		write(&src.path().join("note.md"), "# Hello");
		write(&src.path().join(".skriuw/folders.json"), "[]");
		write(&src.path().join("sub/child.md"), "child");

		let zip_path = tempfile::tempdir().unwrap().path().join("backup.zip");
		fs::create_dir_all(zip_path.parent().unwrap()).unwrap();
		zip_dir(src.path(), &zip_path).unwrap();
		assert!(zip_path.exists());

		let dest = tempfile::tempdir().unwrap();
		unzip_into(&zip_path, dest.path()).unwrap();
		assert_eq!(fs::read_to_string(dest.path().join("note.md")).unwrap(), "# Hello");
		assert_eq!(
			fs::read_to_string(dest.path().join(".skriuw/folders.json")).unwrap(),
			"[]"
		);
		assert_eq!(fs::read_to_string(dest.path().join("sub/child.md")).unwrap(), "child");
	}

	#[test]
	fn clear_dir_contents_empties_but_keeps_root() {
		let dir = tempfile::tempdir().unwrap();
		write(&dir.path().join("a.md"), "a");
		write(&dir.path().join("nested/b.md"), "b");
		clear_dir_contents(dir.path()).unwrap();
		assert!(dir.path().exists());
		assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 0);
	}
}
