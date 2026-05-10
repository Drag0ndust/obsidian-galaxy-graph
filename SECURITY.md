# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

Galaxy Graph is a client-side Obsidian plugin that reads only local vault data and performs no network requests. The attack surface is minimal, but we take security seriously.

If you discover a security vulnerability, please report it responsibly:

1. **Do not** open a public GitHub issue.
2. Email **[INSERT EMAIL ADDRESS]** with:
   - A description of the vulnerability
   - Steps to reproduce
   - Potential impact
3. You will receive a response within **48 hours** acknowledging receipt.
4. We will work with you to understand and resolve the issue before any public disclosure.

## Scope

Security concerns for this plugin include:

- **Code injection** via malicious note content being executed during graph rendering
- **Cross-plugin data leakage** if vault data is exposed outside the plugin scope
- **Denial of service** via crafted vault structures that crash the renderer or consume excessive resources
- **Dependency vulnerabilities** in Three.js or other npm packages

## Out of Scope

- Obsidian's own security model and sandboxing
- Issues that require physical access to the user's machine
- Social engineering
