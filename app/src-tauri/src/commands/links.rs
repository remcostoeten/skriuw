use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindowBuilder};

const LINK_WINDOW_LABEL: &str = "link-browser";

fn parse_openable_link(url: &str) -> Result<Url, String> {
    let parsed = Url::parse(url).map_err(|error| format!("link is not a valid URL: {error}"))?;
    match parsed.scheme() {
        "http" | "https" => Ok(parsed),
        scheme => Err(format!(
            "only http and https links can open in Skriuw, not {scheme}:"
        )),
    }
}

fn link_window_title(url: &Url) -> String {
    match url.host_str() {
        Some(host) => format!("{host} — Skriuw"),
        None => "Skriuw".to_string(),
    }
}

/// Opens the link in Skriuw's own browser window. One window is shared by every
/// link: opening a second link navigates the existing window and brings it to
/// the front, the way a browser tab would, instead of stacking windows.
#[tauri::command]
pub fn open_link_window(url: String, app: AppHandle) -> Result<(), String> {
    let target = parse_openable_link(&url)?;
    let title = link_window_title(&target);
    if let Some(window) = app.get_webview_window(LINK_WINDOW_LABEL) {
        window.navigate(target).map_err(|error| error.to_string())?;
        window
            .set_title(&title)
            .map_err(|error| error.to_string())?;
        window.unminimize().map_err(|error| error.to_string())?;
        window.set_focus().map_err(|error| error.to_string())?;
        return Ok(());
    }
    WebviewWindowBuilder::new(&app, LINK_WINDOW_LABEL, WebviewUrl::External(target))
        .title(title)
        .inner_size(1100.0, 800.0)
        .min_inner_size(480.0, 320.0)
        .build()
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_http_and_https_links() {
        assert!(parse_openable_link("https://example.com/path?q=1").is_ok());
        assert!(parse_openable_link("http://localhost:8787").is_ok());
    }

    #[test]
    fn rejects_other_schemes_and_garbage() {
        assert!(parse_openable_link("javascript:alert(1)").is_err());
        assert!(parse_openable_link("file:///etc/passwd").is_err());
        assert!(parse_openable_link("data:text/html,hi").is_err());
        assert!(parse_openable_link("not a url").is_err());
    }

    #[test]
    fn titles_the_window_after_the_host() {
        let url = Url::parse("https://docs.rs/tauri").unwrap();
        assert_eq!(link_window_title(&url), "docs.rs — Skriuw");
    }
}
