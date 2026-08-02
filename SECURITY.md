# Security Policy

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability.

Use GitHub's private vulnerability reporting:

1. Open the repository's **Security** tab.
2. Select **Report a vulnerability**.
3. Include the affected version or commit, reproduction steps, expected impact, and any suggested mitigation.

If private reporting is unavailable, contact the maintainer through the address listed in the repository's `package.json`. Avoid including secrets or personal data in the first message.

You should receive an acknowledgement within seven days. Confirmed issues will be investigated privately, with fixes and disclosure coordinated according to severity.

## Scope

Security reports may cover the current v2 desktop application, the hosted or self-hosted v1 application, release artifacts, update infrastructure, authentication, import/export handling, and repository automation.

Third-party services and dependencies should normally be reported to their maintainers unless Skriuw uses them in a way that creates a project-specific vulnerability.

## Supported versions

Security fixes target the latest v2 release and the currently deployed v1 web application. Historical desktop releases may not receive fixes; users should upgrade to the latest release when possible.
