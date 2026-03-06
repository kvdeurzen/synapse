---
name: pytest
description: Python testing conventions using pytest. Load when writing or reviewing Python tests.
disable-model-invocation: true
user-invocable: false
---

## Conventions

- Test function naming: `test_<behavior>_<condition>`: `test_login_returns_token_when_credentials_valid()`
- Arrange-Act-Assert structure in every test — group sections with blank lines
- `@pytest.fixture` for shared setup — prefer function-scoped fixtures (default) over session-scoped
- `@pytest.mark.parametrize` for table-driven tests with multiple input/output pairs
- `conftest.py` for shared fixtures accessible across a test directory — no imports needed
- `unittest.mock.patch` (or `pytest-mock`'s `mocker.patch`) for mocking at module boundaries
- Test files in `tests/` directory; filename matches source module: `src/auth.py` → `tests/test_auth.py`
- Use `pytest.raises(ExcType, match=r"pattern")` to assert expected exceptions
- Use `@pytest.mark.asyncio` for async tests; install `pytest-asyncio` for async fixture support

## Quality Criteria

- `pytest` passes with zero failures
- Each test covers one behavior — multiple asserts only when checking a single compound outcome
- Fixtures are the smallest scope needed — don't use `session` scope unless truly necessary
- External dependencies (HTTP, DB, filesystem) mocked in unit tests
- `pytest -x` fails fast on first failure during development
- Coverage target: `--cov=src --cov-fail-under=80`
- Test collection time under 5 seconds — if slower, check for expensive imports in test modules

## Vocabulary

- **fixture**: a function decorated with `@pytest.fixture` that provides test setup/teardown
- **parametrize**: `@pytest.mark.parametrize` decorator for running one test with multiple input sets
- **conftest.py**: special pytest file for shared fixtures and plugins; auto-discovered in test directories
- **marker**: a decorator like `@pytest.mark.integration` for grouping and filtering tests
- **monkeypatch**: pytest built-in fixture for temporarily replacing attributes, env vars, or functions
- **tmp_path**: pytest built-in fixture providing a temporary directory unique to each test invocation
- **capsys**: pytest fixture for capturing stdout/stderr output during a test

## Anti-patterns

- Fixtures with broad scope (`session`) when `function` scope suffices — creates test order dependencies
- Mocking the code under test — creates false positives; mock external dependencies only
- Tests that modify global state without cleanup — use `monkeypatch` or context managers
- Assert on exception messages with `str(exc)` — use `pytest.raises(ExcType, match="pattern")`
- Importing fixtures from test files — put shared fixtures in `conftest.py` instead
- `setup_method` / `teardown_method` — prefer fixtures for clearer scope control
- Hardcoding file paths in tests — use `tmp_path` fixture for temporary files
- Tests that call `print()` to understand failures — use `assert` with descriptive messages instead

## Commands

- Run all: `pytest`
- Fail fast: `pytest -x`
- Specific file: `pytest tests/unit/test_auth.py`
- Run by marker: `pytest -m integration`
- Coverage: `pytest --cov=src --cov-report=html`
- Verbose: `pytest -v`
- Show locals on failure: `pytest -l`
- Last failed only: `pytest --lf`
