use keyring::{Entry, Error};

const SERVICE: &str = "dev.skriuw.app";
const ACCOUNT: &str = "cloud-session";
const MAX_TOKEN_BYTES: usize = 4_096;

fn credential() -> Result<Entry, String> {
    Entry::new(SERVICE, ACCOUNT).map_err(|error| error.to_string())
}

fn validate_token(token: &str) -> Result<(), String> {
    if token.is_empty() || token.len() > MAX_TOKEN_BYTES || token.chars().any(char::is_control) {
        return Err("invalid cloud session token".to_string());
    }
    Ok(())
}

#[tauri::command]
pub async fn load_auth_token() -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(load_auth_token_blocking)
        .await
        .map_err(|error| error.to_string())?
}

pub fn load_auth_token_blocking() -> Result<Option<String>, String> {
    match credential()?.get_password() {
        Ok(token) => {
            validate_token(&token)?;
            Ok(Some(token))
        }
        Err(Error::NoEntry) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
pub async fn store_auth_token(token: String) -> Result<(), String> {
    validate_token(&token)?;
    tauri::async_runtime::spawn_blocking(move || {
        credential()?
            .set_password(&token)
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn clear_auth_token() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(clear_auth_token_blocking)
        .await
        .map_err(|error| error.to_string())?
}

pub(crate) fn clear_auth_token_blocking() -> Result<(), String> {
    match credential()?.delete_credential() {
        Ok(()) | Err(Error::NoEntry) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::{MAX_TOKEN_BYTES, validate_token};

    #[test]
    fn session_tokens_are_bounded_before_entering_the_credential_store() {
        assert!(validate_token("signed-session-token").is_ok());
        assert!(validate_token("").is_err());
        assert!(validate_token("line\nbreak").is_err());
        assert!(validate_token(&"x".repeat(MAX_TOKEN_BYTES + 1)).is_err());
    }
}
