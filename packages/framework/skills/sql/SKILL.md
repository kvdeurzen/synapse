---
name: sql
description: SQL conventions for safe, readable, and performant queries. Load when writing or reviewing SQL queries or database schema.
disable-model-invocation: true
user-invocable: false
---

## Conventions

- SQL keywords in UPPERCASE: `SELECT`, `FROM`, `WHERE`, `JOIN`, `INSERT`, `UPDATE`
- Table names singular and snake_case: `user`, `task_dependency`, `audit_log`
- Column names snake_case: `created_at`, `user_id`, `is_active`
- Explicit JOIN types — never rely on implicit cross joins: use `INNER JOIN`, `LEFT JOIN`
- Always name constraints: `CONSTRAINT fk_task_user FOREIGN KEY (user_id) REFERENCES user(id)`
- Use CTEs for complex queries — prefer readability over one-liner cleverness
- Parameterized queries always — never concatenate user input into SQL strings

## Quality Criteria

- All queries parameterized — zero string interpolation of user-controlled values
- Foreign key columns have indexes: if `task.user_id` references `user.id`, index `task.user_id`
- No `SELECT *` in production queries — list columns explicitly
- N+1 queries eliminated — use JOINs or subqueries to batch related data
- Transactions used for multi-statement writes that must be atomic

## Vocabulary

- **CTE** (Common Table Expression): a named subquery defined with `WITH name AS (...)` for readability
- **window function**: an aggregate computed over a sliding frame: `ROW_NUMBER() OVER (PARTITION BY ...)`
- **materialized view**: a precomputed query result stored on disk, refreshed on schedule or trigger
- **index scan**: query execution using an index to avoid full table scan; check with `EXPLAIN`

## Anti-patterns

- N+1 queries: fetching a list then querying each item individually in a loop
- Implicit joins: `FROM a, b WHERE a.id = b.a_id` — use explicit `JOIN` syntax
- Unparameterized queries: `"SELECT * FROM user WHERE name = '" + name + "'"` — SQL injection risk
- `SELECT *` in application queries — brittle to schema changes and wastes bandwidth
- Missing index on foreign key columns — causes full table scans on joins
