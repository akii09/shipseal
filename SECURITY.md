# Security policy

## Supported versions

Shipseal is pre-1.0. Only the latest published version receives fixes.

## Reporting a vulnerability

Report privately through GitHub: open the repository's **Security** tab and choose
**Report a vulnerability**. Do not open a public issue for a security problem.

Expect an acknowledgement within a week. If a report is valid, the fix ships in the next
patch release and the advisory credits you unless you ask otherwise.

## Scope

Shipseal runs locally and in CI. It reads your repository, calls the GitHub and npm APIs, and
writes image files. It has no server and collects no telemetry.

Things worth reporting:

- A path that writes outside the configured output directory.
- A way to make the renderer execute code from repository content.
- A token or API key leaking into an image, a manifest, a log line, or an LLM request.
- Build or publish pipeline weaknesses, including the trusted publishing setup.

Things that are not vulnerabilities:

- A card that looks wrong, or text that overflows. Those are bugs, so open an issue.
- Anything requiring an attacker to already control the repository being read. Shipseal trusts
  the repository it runs in.
