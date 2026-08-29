use tauri::{AppHandle, Manager, Url, WebviewUrl, WebviewWindowBuilder};

const LINK_WINDOW_LABEL: &str = "link-browser";
const CLOSE_REQUEST_HOST: &str = "skriuw.invalid";
const CLOSE_REQUEST_PATH: &str = "/close-link-window";
const CLOSE_REQUEST_URL: &str = "https://skriuw.invalid/close-link-window";

/// The browser window shows remote pages, which have no IPC and never run the
/// renderer that owns Skriuw's shortcuts, so its close shortcut lives in the
/// page itself. Asking for the address below is how it reaches the shell:
/// `.invalid` never resolves and the navigation is cancelled before it leaves
/// the process. The keystroke is swallowed here, so it can never reach the app
/// and quit it.
fn close_shortcut_script() -> String {
    format!(
        "(function(){{window.addEventListener('keydown',function(event){{\
if(!(event.ctrlKey||event.metaKey)||event.shiftKey||event.altKey)return;\
if(String(event.key).toLowerCase()!=='q')return;\
event.preventDefault();event.stopImmediatePropagation();\
window.location.href='{CLOSE_REQUEST_URL}';}},true);}})();"
    )
}

fn is_close_request(url: &Url) -> bool {
    url.host_str() == Some(CLOSE_REQUEST_HOST) && url.path() == CLOSE_REQUEST_PATH
}

/// Queues the close onto the event loop: this runs inside the webview's own
/// navigation callback, and closing the window from there re-enters it.
fn close_link_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window(LINK_WINDOW_LABEL) else {
        return;
    };
    if let Err(error) = app.run_on_main_thread(move || {
        if let Err(error) = window.close() {
            eprintln!("link window close failed: {error}");
        }
    }) {
        eprintln!("link window close could not be scheduled: {error}");
    }
}

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
    let close_handle = app.clone();
    WebviewWindowBuilder::new(&app, LINK_WINDOW_LABEL, WebviewUrl::External(target))
        .title(title)
        .inner_size(1100.0, 800.0)
        .min_inner_size(480.0, 320.0)
        .initialization_script(close_shortcut_script())
        .on_navigation(move |url| {
            if !is_close_request(url) {
                return true;
            }
            close_link_window(&close_handle);
            false
        })
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
    fn recognises_only_the_close_request_address() {
        assert!(is_close_request(&Url::parse(CLOSE_REQUEST_URL).unwrap()));
        assert!(!is_close_request(
            &Url::parse("https://skriuw.invalid/other").unwrap()
        ));
        assert!(!is_close_request(
            &Url::parse("https://example.com/close-link-window").unwrap()
        ));
    }

    #[test]
    fn the_close_shortcut_script_navigates_to_the_close_request() {
        let script = close_shortcut_script();
        assert!(script.contains(CLOSE_REQUEST_URL));
        assert!(script.contains("preventDefault"));
    }

    #[test]
    fn titles_the_window_after_the_host() {
        let url = Url::parse("https://docs.rs/tauri").unwrap();
        assert_eq!(link_window_title(&url), "docs.rs — Skriuw");
    }
}
