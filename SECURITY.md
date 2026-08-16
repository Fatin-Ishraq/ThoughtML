# Security Policy

## Supported versions

Security fixes land on the latest release.

| Version | Supported |
|---------|-----------|
| 0.4.x   | ✅        |
| < 0.4   | ❌        |

## The threat model

**A ThoughtML document is untrusted input.** That is the assumption the parser and
the viewer are written against, and it is the one that matters: documents are
meant to be written by AI agents, pulled from repositories, shared as
self-contained `--html` exports, and streamed to other people. "The author wrote
it" is not a trust boundary.

Concretely, that means:

* **The parser should not panic, hang, exhaust memory, or abort** on any byte
  sequence. Recursive passes carry explicit depth budgets and report a diagnostic
  instead of running off the stack. A stack overflow counts as a security bug: it
  is not unwindable, so it takes down `thoughtml stream`, the wasm worker behind
  the playground, and any host embedding the library.
* **No document content may become markup or script** in any rendering. Fields
  that are echoed back to a reader — ids, units, `expects`, `status`, declared
  vocabulary — are lexically constrained at the parser, and the viewer builds
  nodes with `textContent` rather than interpolating into `innerHTML`. Either
  layer alone would be one refactor from breaking; both is the contract.
* **Analysis passes are bounded.** A superlinear pass that turns a large document
  into minutes of CPU is a denial of service wherever the compiler runs on input
  someone else supplies, so it degrades with a warning instead.

### What `thoughtml stream` does and does not promise

The viewer link is an unguessable capability — 192 bits of OS randomness,
compared without an early exit. It is **not** encrypted and **not** an identity:

* The transport is plain HTTP and the token sits in the URL path, so it also
  reaches browser history, proxy logs, and `Referer`. Anyone who can see the
  traffic can read the document.
* Anyone holding the link has full read access, and a single recipient cannot be
  revoked short of restarting the session.

Binding a public address requires `--expose-public`. The server refuses requests
whose `Host` is a name it does not serve (DNS-rebinding defence), `/health` answers
over loopback only, and session records are written to a per-user directory with
owner-only permissions. Treat a `--lan` session as readable by that whole network.

## Reporting a vulnerability

Please **do not open a public issue** for a vulnerability. Use GitHub's private
vulnerability reporting:

1. Open the repository's **Security** tab → **Report a vulnerability**.
2. Include the smallest input or steps that trigger it and what you observed
   (crash, hang, runaway memory, script execution, disclosure).

Input that makes the parser crash, hang, or exhaust memory is in scope even
without a further exploit, and so is any path by which document content reaches a
DOM sink as markup.

You'll get a response as soon as possible. Thanks for helping keep ThoughtML safe.
