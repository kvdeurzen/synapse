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

## Anti-Rationalization

| Rationalization | Why It's Wrong | What To Do Instead |
|----------------|----------------|-------------------|
| "Security can be added as a layer later once the feature works" | Security is an architectural property, not a feature. Adding authentication, parameterized queries, or input sanitization after the fact requires touching every data path — the retrofit cost is 10-100x higher than building it in. (OWASP: "security must be designed in, not bolted on") | Address the security properties (who can call this, what input is allowed, what is logged) when designing the feature, not after. |
| "This is an internal API, so authentication isn't necessary" | Internal APIs become external APIs when services are compromised, credentials are phished, or the network boundary changes. The absence of auth on internal APIs is the primary amplifier in lateral movement attacks. (OWASP: "assume breach; defense in depth") | Authenticate all APIs. Internal callers can use service credentials. The auth cost is minimal compared to breach response cost. |
| "Logging this sensitive value makes debugging easier" | Sensitive values in logs propagate to log aggregators, backup systems, monitoring dashboards, and log exports — all of which have broader access than the application itself. Once in logs, sensitive values are nearly impossible to fully remove. (Van-LLM-Crew: "log destinations have wider access than application memory") | Log identifiers (user ID, session ID) not values (tokens, passwords, PII). If you need to debug, redact in the log formatter. |
| "LLM-generated code is cleaner than what I'd write, no need to review for security" | LLMs reproduce patterns from training data, including patterns with known vulnerabilities. LLM-generated code is statistically likely to include the most common vulnerability patterns. (Goedecke: "LLM output is untrusted input") | Review LLM-generated code for the same vulnerabilities you would review in any PR: injection, auth bypass, information disclosure, missing validation. |

## Commands

- Node.js audit: `npm audit`
- Rust audit: `cargo audit`
- Python audit: `pip-audit`
- Container/filesystem scan: `trivy fs .`
- Secret scanning: `gitleaks detect`
