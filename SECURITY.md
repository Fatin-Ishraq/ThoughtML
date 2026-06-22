# Security Policy

## Supported versions

ThoughtML is at `0.1.x`; security fixes land on the latest release.

| Version | Supported |
|---------|-----------|
| 0.1.x   | ✅        |

## Reporting a vulnerability

The reference parser is hardened against malformed and hostile input — it should
never panic, hang, or exhaust memory on any byte sequence (see the
`malformed_inputs_never_panic` test). If you find input that makes it do any of
those, that's a security-relevant bug.

Please **do not open a public issue** for a vulnerability. Instead use GitHub's
private vulnerability reporting:

1. Open the repository's **Security** tab → **Report a vulnerability**.
2. Include the smallest input that triggers it and the behavior you observed
   (crash, hang, runaway memory).

You'll get a response as soon as possible. Thanks for helping keep ThoughtML
safe.
