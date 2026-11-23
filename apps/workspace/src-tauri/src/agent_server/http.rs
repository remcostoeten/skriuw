use std::io::{BufRead, BufReader, Read, Write};

pub(crate) const ENDPOINT_PATH: &str = "/mcp";
pub(crate) const MAX_HEADER_BYTES: usize = 16 * 1024;
pub(crate) const MAX_BODY_BYTES: usize = 4 * 1024 * 1024;

#[derive(Debug, PartialEq, Eq)]
pub(crate) struct Request {
    pub(crate) method: String,
    pub(crate) path: String,
    pub(crate) headers: Vec<(String, String)>,
    pub(crate) body: Vec<u8>,
}

impl Request {
    pub(crate) fn header(&self, name: &str) -> Option<&str> {
        self.headers
            .iter()
            .find(|(key, _)| key.eq_ignore_ascii_case(name))
            .map(|(_, value)| value.as_str())
    }
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) struct Response {
    pub(crate) status: u16,
    pub(crate) headers: Vec<(&'static str, String)>,
    pub(crate) body: String,
}

impl Response {
    pub(crate) fn json(status: u16, body: String) -> Self {
        Self {
            status,
            headers: vec![("Content-Type", "application/json".to_owned())],
            body,
        }
    }

    pub(crate) fn empty(status: u16) -> Self {
        Self {
            status,
            headers: Vec::new(),
            body: String::new(),
        }
    }

    fn with_header(mut self, name: &'static str, value: &str) -> Self {
        self.headers.push((name, value.to_owned()));
        self
    }
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum ReadError {
    Malformed,
    HeadersTooLarge,
    BodyTooLarge,
    LengthRequired,
    Io,
}

impl ReadError {
    pub(crate) fn response(&self) -> Response {
        match self {
            Self::Malformed => Response::empty(400),
            Self::HeadersTooLarge => Response::empty(431),
            Self::BodyTooLarge => Response::empty(413),
            Self::LengthRequired => Response::empty(411),
            Self::Io => Response::empty(400),
        }
    }
}

/// What the router needs to know about the running server to admit a request.
pub(crate) struct Admission<'a> {
    pub(crate) port: u16,
    pub(crate) token: &'a str,
}

/// The renderer's answer to one forwarded JSON-RPC request.
pub(crate) enum Forwarded {
    Answer(String),
    Unavailable(String),
}

pub(crate) fn read_request(stream: impl Read) -> Result<Request, ReadError> {
    let mut reader = BufReader::new(stream.take((MAX_HEADER_BYTES + MAX_BODY_BYTES + 1) as u64));
    let mut header_bytes = 0usize;
    let mut lines = Vec::new();
    loop {
        let mut line = String::new();
        let read = reader.read_line(&mut line).map_err(|_| ReadError::Io)?;
        if read == 0 {
            return Err(ReadError::Malformed);
        }
        header_bytes += read;
        if header_bytes > MAX_HEADER_BYTES {
            return Err(ReadError::HeadersTooLarge);
        }
        let trimmed = line.trim_end_matches(['\r', '\n']);
        if trimmed.is_empty() {
            break;
        }
        lines.push(trimmed.to_owned());
    }
    let mut lines = lines.into_iter();
    let request_line = lines.next().ok_or(ReadError::Malformed)?;
    let mut parts = request_line.split(' ');
    let method = parts.next().ok_or(ReadError::Malformed)?.to_owned();
    let target = parts.next().ok_or(ReadError::Malformed)?;
    let path = target.split('?').next().unwrap_or(target).to_owned();
    let headers = lines
        .map(|line| {
            let (name, value) = line.split_once(':').ok_or(ReadError::Malformed)?;
            Ok((name.trim().to_owned(), value.trim().to_owned()))
        })
        .collect::<Result<Vec<_>, ReadError>>()?;
    let mut request = Request {
        method,
        path,
        headers,
        body: Vec::new(),
    };
    if request
        .header("transfer-encoding")
        .is_some_and(|value| !value.eq_ignore_ascii_case("identity"))
    {
        return Err(ReadError::LengthRequired);
    }
    let length = match request.header("content-length") {
        Some(value) => value.parse::<usize>().map_err(|_| ReadError::Malformed)?,
        None if request.method == "POST" => return Err(ReadError::LengthRequired),
        None => 0,
    };
    if length > MAX_BODY_BYTES {
        return Err(ReadError::BodyTooLarge);
    }
    request.body = vec![0; length];
    reader
        .read_exact(&mut request.body)
        .map_err(|_| ReadError::Io)?;
    Ok(request)
}

pub(crate) fn write_response(mut stream: impl Write, response: &Response) -> std::io::Result<()> {
    let mut head = format!(
        "HTTP/1.1 {} {}\r\n",
        response.status,
        reason(response.status)
    );
    for (name, value) in &response.headers {
        head.push_str(&format!("{name}: {value}\r\n"));
    }
    head.push_str(&format!(
        "Content-Length: {}\r\nConnection: close\r\n\r\n",
        response.body.len()
    ));
    stream.write_all(head.as_bytes())?;
    stream.write_all(response.body.as_bytes())?;
    stream.flush()
}

/// Admits one request and answers it. A JSON-RPC request is handed to
/// `forward`; notifications and client responses need no answer from the
/// workspace, so they are accepted without reaching it.
pub(crate) fn route(
    request: &Request,
    admission: &Admission<'_>,
    forward: impl FnOnce(String) -> Forwarded,
) -> Response {
    if request.path != ENDPOINT_PATH {
        return Response::empty(404);
    }
    if !loopback_host(request.header("host"), admission.port) {
        return Response::empty(403);
    }
    if let Some(origin) = request.header("origin")
        && !loopback_origin(origin, admission.port)
    {
        return Response::empty(403);
    }
    if !authorized(request.header("authorization"), admission.token) {
        return Response::empty(401).with_header("WWW-Authenticate", "Bearer");
    }
    if request.method != "POST" {
        return Response::empty(405).with_header("Allow", "POST");
    }
    let Ok(text) = std::str::from_utf8(&request.body) else {
        return Response::json(400, rpc_error(None, -32700, "Parse error"));
    };
    let Ok(message) = serde_json::from_str::<serde_json::Value>(text) else {
        return Response::json(400, rpc_error(None, -32700, "Parse error"));
    };
    let Some(object) = message.as_object() else {
        return Response::json(
            400,
            rpc_error(None, -32600, "Batched JSON-RPC messages are not supported"),
        );
    };
    let id = object.get("id").cloned();
    if !object.contains_key("method") || id.is_none() {
        return Response::empty(202);
    }
    match forward(text.to_owned()) {
        Forwarded::Answer(body) => Response::json(200, body),
        Forwarded::Unavailable(reason) => Response::json(200, rpc_error(id, -32000, &reason)),
    }
}

pub(crate) fn rpc_error(id: Option<serde_json::Value>, code: i64, message: &str) -> String {
    serde_json::json!({
        "jsonrpc": "2.0",
        "id": id.unwrap_or(serde_json::Value::Null),
        "error": { "code": code, "message": message },
    })
    .to_string()
}

fn loopback_host(host: Option<&str>, port: u16) -> bool {
    let Some(host) = host else {
        return false;
    };
    ["127.0.0.1", "localhost", "[::1]"]
        .iter()
        .any(|name| host.eq_ignore_ascii_case(&format!("{name}:{port}")))
}

fn loopback_origin(origin: &str, port: u16) -> bool {
    ["http://", "https://"].iter().any(|scheme| {
        origin
            .strip_prefix(scheme)
            .is_some_and(|host| loopback_host(Some(host), port))
    })
}

fn authorized(header: Option<&str>, token: &str) -> bool {
    let Some(presented) = header.and_then(|value| {
        value
            .split_once(' ')
            .filter(|(scheme, _)| scheme.eq_ignore_ascii_case("bearer"))
            .map(|(_, credential)| credential.trim())
    }) else {
        return false;
    };
    !token.is_empty() && constant_time_equal(presented.as_bytes(), token.as_bytes())
}

fn constant_time_equal(left: &[u8], right: &[u8]) -> bool {
    if left.len() != right.len() {
        return false;
    }
    left.iter()
        .zip(right)
        .fold(0u8, |difference, (a, b)| difference | (a ^ b))
        == 0
}

fn reason(status: u16) -> &'static str {
    match status {
        200 => "OK",
        202 => "Accepted",
        400 => "Bad Request",
        401 => "Unauthorized",
        403 => "Forbidden",
        404 => "Not Found",
        405 => "Method Not Allowed",
        411 => "Length Required",
        413 => "Payload Too Large",
        431 => "Request Header Fields Too Large",
        503 => "Service Unavailable",
        _ => "",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const PORT: u16 = 41783;
    const TOKEN: &str = "secret-token";

    fn admission() -> Admission<'static> {
        Admission {
            port: PORT,
            token: TOKEN,
        }
    }

    fn post(body: &str) -> Request {
        Request {
            method: "POST".into(),
            path: ENDPOINT_PATH.into(),
            headers: vec![
                ("Host".into(), format!("127.0.0.1:{PORT}")),
                ("Authorization".into(), format!("Bearer {TOKEN}")),
            ],
            body: body.as_bytes().to_vec(),
        }
    }

    fn unreachable_forward(_: String) -> Forwarded {
        panic!("this request must not reach the workspace")
    }

    #[test]
    fn forwards_a_request_and_returns_the_answer() {
        let response = route(
            &post(r#"{"jsonrpc":"2.0","id":1,"method":"tools/list"}"#),
            &admission(),
            |message| {
                assert!(message.contains("tools/list"));
                Forwarded::Answer(r#"{"jsonrpc":"2.0","id":1,"result":{}}"#.into())
            },
        );
        assert_eq!(response.status, 200);
        assert_eq!(response.body, r#"{"jsonrpc":"2.0","id":1,"result":{}}"#);
    }

    #[test]
    fn accepts_notifications_without_forwarding() {
        let response = route(
            &post(r#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#),
            &admission(),
            unreachable_forward,
        );
        assert_eq!(response.status, 202);
    }

    #[test]
    fn reports_an_unavailable_workspace_as_a_json_rpc_error() {
        let response = route(
            &post(r#"{"jsonrpc":"2.0","id":"a","method":"tools/list"}"#),
            &admission(),
            |_| Forwarded::Unavailable("Skriuw is still opening".into()),
        );
        assert_eq!(response.status, 200);
        let body: serde_json::Value = serde_json::from_str(&response.body).unwrap();
        assert_eq!(body["id"], "a");
        assert_eq!(body["error"]["code"], -32000);
    }

    #[test]
    fn refuses_a_missing_or_wrong_token() {
        let mut request = post("{}");
        request.headers.retain(|(name, _)| name != "Authorization");
        assert_eq!(
            route(&request, &admission(), unreachable_forward).status,
            401
        );
        request
            .headers
            .push(("Authorization".into(), "Bearer secret-tokeX".into()));
        assert_eq!(
            route(&request, &admission(), unreachable_forward).status,
            401
        );
    }

    #[test]
    fn refuses_foreign_hosts_and_origins() {
        let mut rebound = post("{}");
        rebound.headers[0].1 = format!("attacker.example:{PORT}");
        assert_eq!(
            route(&rebound, &admission(), unreachable_forward).status,
            403
        );

        let mut cross_origin = post("{}");
        cross_origin
            .headers
            .push(("Origin".into(), "https://attacker.example".into()));
        assert_eq!(
            route(&cross_origin, &admission(), unreachable_forward).status,
            403
        );

        let mut local_origin = post(r#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#);
        local_origin
            .headers
            .push(("Origin".into(), format!("http://localhost:{PORT}")));
        assert_eq!(
            route(&local_origin, &admission(), unreachable_forward).status,
            202
        );
    }

    #[test]
    fn offers_no_event_stream() {
        let mut request = post("");
        request.method = "GET".into();
        let response = route(&request, &admission(), unreachable_forward);
        assert_eq!(response.status, 405);
        assert!(response.headers.contains(&("Allow", "POST".to_owned())));
    }

    #[test]
    fn rejects_batches_and_invalid_json() {
        assert_eq!(
            route(&post("[]"), &admission(), unreachable_forward).status,
            400
        );
        assert_eq!(
            route(&post("{"), &admission(), unreachable_forward).status,
            400
        );
    }

    #[test]
    fn answers_other_paths_with_not_found() {
        let mut request = post("{}");
        request.path = "/".into();
        assert_eq!(
            route(&request, &admission(), unreachable_forward).status,
            404
        );
    }

    #[test]
    fn reads_a_request_with_a_body() {
        let raw = b"POST /mcp?x=1 HTTP/1.1\r\nHost: 127.0.0.1:1\r\nContent-Length: 2\r\n\r\n{}";
        let request = read_request(&raw[..]).unwrap();
        assert_eq!(request.method, "POST");
        assert_eq!(request.path, "/mcp");
        assert_eq!(request.header("HOST"), Some("127.0.0.1:1"));
        assert_eq!(request.body, b"{}");
    }

    #[test]
    fn refuses_unbounded_or_oversized_bodies() {
        let chunked = b"POST /mcp HTTP/1.1\r\nTransfer-Encoding: chunked\r\n\r\n";
        assert_eq!(read_request(&chunked[..]), Err(ReadError::LengthRequired));
        let missing = b"POST /mcp HTTP/1.1\r\nHost: x\r\n\r\n";
        assert_eq!(read_request(&missing[..]), Err(ReadError::LengthRequired));
        let oversized = format!(
            "POST /mcp HTTP/1.1\r\nContent-Length: {}\r\n\r\n",
            MAX_BODY_BYTES + 1
        );
        assert_eq!(
            read_request(oversized.as_bytes()),
            Err(ReadError::BodyTooLarge)
        );
    }

    #[test]
    fn writes_a_closed_response() {
        let mut out = Vec::new();
        write_response(&mut out, &Response::json(200, "{}".into())).unwrap();
        let text = String::from_utf8(out).unwrap();
        assert!(text.starts_with("HTTP/1.1 200 OK\r\n"));
        assert!(text.contains("Content-Type: application/json\r\n"));
        assert!(text.contains("Content-Length: 2\r\nConnection: close\r\n\r\n{}"));
    }
}
