# Security policy

Please report security issues privately through GitHub's security-advisory interface for this repository. Do not open a public issue for an undisclosed vulnerability.

Supported releases receive security fixes on the latest minor line. Reports should include the affected version, a minimal reproducer, expected impact, and any relevant provider profile.

`tool-name-codec` validates and allocates names. It does not authenticate MCP servers, authorize tools, persist manifests, migrate stored transcripts, or verify that a caller-owned stable ID still represents the same application behavior. Those responsibilities remain with the integrating host.
