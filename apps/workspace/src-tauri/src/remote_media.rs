//! Fetches one remote image over HTTPS so it can be stored as a workspace
//! blob. Notes never load remote media themselves, so this is the only path
//! that turns a user-supplied URL into local bytes.
//!
//! The URL is attacker-influenced input: it arrives from a paste. Redirects
//! are therefore followed by hand, every hop is re-validated, and each request
//! is pinned to an address that passed the check so a second DNS answer cannot
//! swap in a private host between validation and connect.

use std::{
    io::Read,
    net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr, ToSocketAddrs},
    time::Duration,
};

use reqwest::{Url, blocking::Client, redirect::Policy};

const MAX_REDIRECTS: usize = 4;
const MAX_BYTES: u64 = 25 * 1024 * 1024;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(15);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(8);
const USER_AGENT: &str = "Skriuw";

/// Downloads the bytes at `url`, following a bounded number of redirects.
/// The returned bytes are unvalidated media; the caller decides whether they
/// are a supported format.
pub fn download(url: &str) -> Result<Vec<u8>, String> {
    let mut target = parse_target(url)?;
    for _ in 0..=MAX_REDIRECTS {
        let address = resolve_public_address(&target)?;
        let response = client_for(&target, address)?
            .get(target.clone())
            .send()
            .map_err(|error| format!("Could not reach {}: {error}", host_of(&target)))?;
        let status = response.status();
        if status.is_redirection() {
            target = redirect_target(&target, &response)?;
            continue;
        }
        if !status.is_success() {
            return Err(format!("The server answered {}.", status.as_u16()));
        }
        if response
            .content_length()
            .is_some_and(|length| length > MAX_BYTES)
        {
            return Err(size_error());
        }
        return read_capped(response);
    }
    Err("That address redirected too many times.".into())
}

fn parse_target(url: &str) -> Result<Url, String> {
    let parsed =
        Url::parse(url.trim()).map_err(|_| "That is not a valid web address.".to_string())?;
    if parsed.scheme() != "https" {
        return Err("Only https addresses can be downloaded.".into());
    }
    if parsed.host().is_none() {
        return Err("That address has no host.".into());
    }
    Ok(parsed)
}

fn host_of(url: &Url) -> String {
    url.host_str().unwrap_or_default().to_string()
}

fn client_for(url: &Url, address: SocketAddr) -> Result<Client, String> {
    Client::builder()
        .redirect(Policy::none())
        .timeout(REQUEST_TIMEOUT)
        .connect_timeout(CONNECT_TIMEOUT)
        .user_agent(USER_AGENT)
        .resolve(&host_of(url), address)
        .build()
        .map_err(|error| error.to_string())
}

fn redirect_target(current: &Url, response: &reqwest::blocking::Response) -> Result<Url, String> {
    let location = response
        .headers()
        .get(reqwest::header::LOCATION)
        .and_then(|value| value.to_str().ok())
        .ok_or_else(|| "The server redirected without a destination.".to_string())?;
    let next = current
        .join(location)
        .map_err(|_| "The server redirected to an invalid address.".to_string())?;
    parse_target(next.as_str())
}

/// Reads at most [`MAX_BYTES`], treating an over-long body as a failure rather
/// than silently truncating it into a corrupt blob.
fn read_capped(response: reqwest::blocking::Response) -> Result<Vec<u8>, String> {
    let mut bytes = Vec::new();
    response
        .take(MAX_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("The download failed: {error}"))?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err(size_error());
    }
    Ok(bytes)
}

fn size_error() -> String {
    format!(
        "That image is larger than {} MB.",
        MAX_BYTES / (1024 * 1024)
    )
}

/// Picks the first address the host resolves to that is routable on the public
/// internet. Hosts that only resolve to loopback, private, or otherwise
/// reserved ranges are refused so a pasted URL cannot probe the local network.
fn resolve_public_address(url: &Url) -> Result<SocketAddr, String> {
    let host = host_of(url);
    let port = url.port_or_known_default().unwrap_or(443);
    let mut addresses = (host.as_str(), port)
        .to_socket_addrs()
        .map_err(|_| format!("{host} could not be found."))?;
    addresses
        .find(|address| is_public(address.ip()))
        .ok_or_else(|| format!("{host} points at a private address."))
}

fn is_public(address: IpAddr) -> bool {
    match address {
        IpAddr::V4(address) => is_public_v4(address),
        IpAddr::V6(address) => is_public_v6(address),
    }
}

fn is_public_v4(address: Ipv4Addr) -> bool {
    let [first, second, ..] = address.octets();
    let shared = first == 100 && (64..128).contains(&second);
    let benchmarking = first == 198 && (18..20).contains(&second);
    let reserved = first == 0 || first >= 240;
    !(address.is_private()
        || address.is_loopback()
        || address.is_link_local()
        || address.is_broadcast()
        || address.is_documentation()
        || address.is_multicast()
        || address.is_unspecified()
        || shared
        || benchmarking
        || reserved)
}

fn is_public_v6(address: Ipv6Addr) -> bool {
    if let Some(mapped) = address.to_ipv4_mapped() {
        return is_public_v4(mapped);
    }
    let leading = address.segments()[0];
    let unique_local = leading & 0xfe00 == 0xfc00;
    let link_local = leading & 0xffc0 == 0xfe80;
    !(address.is_loopback()
        || address.is_unspecified()
        || address.is_multicast()
        || unique_local
        || link_local)
}

#[cfg(test)]
mod tests {
    use std::net::{Ipv4Addr, Ipv6Addr};

    use super::{download, is_public_v4, is_public_v6, parse_target};

    #[test]
    fn accepts_only_https_addresses() {
        assert!(parse_target("https://example.com/a.png").is_ok());
        assert!(parse_target("  https://example.com/a.png  ").is_ok());
        assert!(parse_target("http://example.com/a.png").is_err());
        assert!(parse_target("file:///etc/passwd").is_err());
        assert!(parse_target("data:image/png;base64,AAAA").is_err());
        assert!(parse_target("not a url").is_err());
    }

    #[test]
    fn rejects_reserved_ipv4_ranges() {
        for reserved in [
            [127, 0, 0, 1],
            [10, 0, 0, 5],
            [172, 16, 3, 4],
            [192, 168, 1, 1],
            [169, 254, 169, 254],
            [100, 64, 0, 1],
            [198, 18, 0, 1],
            [0, 0, 0, 0],
            [255, 255, 255, 255],
            [240, 0, 0, 1],
        ] {
            let address = Ipv4Addr::from(reserved);
            assert!(!is_public_v4(address), "{address} must be refused");
        }
        assert!(is_public_v4(Ipv4Addr::new(93, 184, 216, 34)));
        assert!(is_public_v4(Ipv4Addr::new(8, 8, 8, 8)));
        assert!(is_public_v4(Ipv4Addr::new(99, 255, 255, 255)));
    }

    #[test]
    fn rejects_reserved_ipv6_ranges() {
        for reserved in [
            "::1",
            "::",
            "fc00::1",
            "fd12:3456::1",
            "fe80::1",
            "ff02::1",
            "::ffff:127.0.0.1",
            "::ffff:10.0.0.1",
        ] {
            let address: Ipv6Addr = reserved.parse().expect("parse address");
            assert!(!is_public_v6(address), "{reserved} must be refused");
        }
        assert!(is_public_v6("2606:4700:4700::1111".parse().expect("parse")));
        assert!(is_public_v6("::ffff:93.184.216.34".parse().expect("parse")));
    }

    #[test]
    fn refuses_to_reach_loopback_hosts() {
        let error = download("https://localhost/secret.png").expect_err("must refuse");
        assert!(error.contains("private address"), "{error}");
    }
}
