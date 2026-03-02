---
name: python
description: Python conventions for type-safe, idiomatic, and maintainable code. Load when writing or reviewing Python code.
disable-model-invocation: true
user-invocable: false
---

## Conventions

- Type hints on all public functions and methods: `def fetch(url: str) -> Response:`
- Use `dataclasses` or Pydantic models for data transfer objects — no raw dicts for structured data
- Use `pathlib.Path` over `os.path` for file system operations
- Use f-strings for string formatting: `f"Hello, {name}"` not `"Hello, %s" % name`
- Context managers for all resource access: `with open(path) as f:`, `with db.connect() as conn:`
- Use `__all__` in modules to declare the public API explicitly

## Quality Criteria

- `mypy --strict` passes with no errors on all production code
- No bare `except:` — always catch specific exception types
- Context managers used for file I/O, DB connections, locks
- All external data validated at boundaries (Pydantic models or explicit checks)
- No mutable default arguments in function signatures

## Vocabulary

- **protocol**: a structural interface defined with `typing.Protocol` — duck typing with type checking
- **generic**: a class or function parameterized over a type variable using `Generic[T]`
- **generator**: a function using `yield` that produces values lazily, one at a time
- **dataclass**: a class decorated with `@dataclass` that auto-generates `__init__`, `__repr__`, etc.

## Anti-patterns

- Mutable default arguments: `def add(items=[])` — use `None` as default and initialize inside
- Global mutable state — use dependency injection or class instances instead
- Bare `except:` — catches `KeyboardInterrupt`, `SystemExit`; always specify exception type
- `# type: ignore` without an explanatory comment — document why the suppression is necessary
- `os.path.join` when `pathlib.Path` is available
