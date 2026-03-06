---
name: security
description: Security conventions for application and LLM-assisted development. Load when implementing auth, data access, or any user-facing functionality.
disable-model-invocation: true
user-invocable: false
---

## Conventions

- Parameterized queries always: never concatenate user input into SQL or query strings (CSA + Van-LLM-Crew)
- Secrets in vaults, never in code: environment variables minimum; proper secret management preferred (CSA + Van-LLM-Crew)
- Least privilege everywhere: DB permissions, API scopes, agent tool access — grant minimum required (CSA + Van-LLM-Crew)
- LLM output = untrusted input: sanitize before execution or display; treat as user-submitted content (Goedecke)
- No unsafe functions: `eval()`, `exec()`, raw SQL string construction are banned (CSA)
- Dependency audit continuously: scan for CVEs; approve new dependencies explicitly (Van-LLM-Crew)
- Human in the loop for destructive operations: shell commands, DB writes, user impersonation (Goedecke)
- Validate and sanitize all user input at boundaries; escape output in HTML, JS, and SQL contexts (CSA)
- Store passwords using strong, salted hashes (Argon2 preferred, bcrypt with cost ≥ 12 acceptable) — never plaintext or reversible encryption (CSA)

## Quality Criteria

- Zero hardcoded secrets in source code or build artifacts (CSA + Van-LLM-Crew)
- All database queries use parameterized statements or ORM — no string concatenation (CSA + Van-LLM-Crew)
- Security headers set: CSP, HSTS, X-Content-Type-Options (CSA)
- No `eval()`, `exec()`, or dynamic code construction from user input in codebase (CSA)
- Dependency vulnerability scan passes with no critical or high CVEs (Van-LLM-Crew)
- LLM-generated outputs sanitized before DOM insertion or command execution (Goedecke)
- All authentication uses established frameworks — no custom JWT parsing or session management
- `gitleaks detect` or equivalent secret scan passes with zero findings on every PR

## Vocabulary

- **parameterized query**: a query with `?` or `$1` placeholders; values bound separately from the SQL string
- **least privilege**: granting only the permissions necessary for a specific operation, nothing more
- **prompt injection**: an attack where user-controlled content in an LLM prompt hijacks agent behavior
- **CSRF**: Cross-Site Request Forgery — an attacker tricks a user's browser into making an authenticated request
- **CSP**: Content Security Policy — HTTP header that restricts which scripts and resources a page can load
- **HSTS**: HTTP Strict Transport Security — forces HTTPS for a domain and all subdomains
- **CVE**: Common Vulnerabilities and Exposures — a numbered identifier for a known security vulnerability
- **RBAC**: Role-Based Access Control — permissions granted based on role, not per-user rules

## Anti-patterns

- String concatenation for SQL queries — use parameterized queries for all database access (CSA)
- Hardcoding API keys, passwords, or tokens in source files — use environment variables or vaults (CSA + Van-LLM-Crew)
- Trusting LLM output as safe for execution without sanitization — treat LLM output like user input (Goedecke)
- Exposing stack traces or internal error details to end users (CSA)
- Logging sensitive data, secrets, or session tokens in log output (Van-LLM-Crew)
- Custom authentication implementations when established frameworks exist (CSA)
- Granting LLM tools broader access than the end user would have (Goedecke)
- Using weak password hashing (MD5, SHA-1, bcrypt work factor < 10) — use Argon2 or bcrypt with cost ≥ 12
- Adding new dependencies without explicit security review and vulnerability scan (Van-LLM-Crew)

## Commands

- Node.js audit: `npm audit`
- Rust audit: `cargo audit`
- Python audit: `pip-audit`
- Container/filesystem scan: `trivy fs .`
- Secret scanning: `gitleaks detect`
