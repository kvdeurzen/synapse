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
- Use transactions for multi-statement writes to ensure atomicity on failure
- Migration files use sequential naming: `001_create_users.sql`, `002_add_index.sql`

## Quality Criteria

- All queries parameterized — zero string interpolation of user-controlled values
- Foreign key columns have indexes: if `task.user_id` references `user.id`, index `task.user_id`
- No `SELECT *` in production queries — list columns explicitly
- N+1 queries eliminated — use JOINs or subqueries to batch related data
- Transactions used for multi-statement writes that must be atomic
- `EXPLAIN ANALYZE` run on all queries that touch more than 1,000 rows
- All enum-like columns use CHECK constraints or enum types — no magic string values

## Vocabulary

- **CTE** (Common Table Expression): a named subquery defined with `WITH name AS (...)` for readability
- **window function**: an aggregate computed over a sliding frame: `ROW_NUMBER() OVER (PARTITION BY ...)`
- **materialized view**: a precomputed query result stored on disk, refreshed on schedule or trigger
- **index scan**: query execution using an index to avoid full table scan; check with `EXPLAIN`
- **migration**: a versioned SQL file applied in sequence to evolve the schema; never edit past migrations
- **deadlock**: circular wait between two transactions each holding a lock the other needs
- **upsert**: an `INSERT ... ON CONFLICT DO UPDATE` statement that inserts or updates depending on conflict
- **composite index**: an index on multiple columns; useful when queries filter or sort on the same column combination

## Anti-patterns

- N+1 queries: fetching a list then querying each item individually in a loop
- Implicit joins: `FROM a, b WHERE a.id = b.a_id` — use explicit `JOIN` syntax
- Unparameterized queries: `"SELECT * FROM user WHERE name = '" + name + "'"` — SQL injection risk
- `SELECT *` in application queries — brittle to schema changes and wastes bandwidth
- Missing index on foreign key columns — causes full table scans on joins
- Schema changes without migration files — all changes must be versioned and reproducible
- `DROP TABLE` without `IF EXISTS` in migrations — causes failure on fresh environments
- Unindexed `WHERE` clauses on large tables — check with `EXPLAIN ANALYZE`

## Commands

- PostgreSQL CLI: `psql -d <database> -f <file.sql>`
- SQLite CLI: `sqlite3 <database.db> ".read <file.sql>"`
- Explain query: `EXPLAIN ANALYZE <query>;`
- List tables: `\dt` (psql) or `.tables` (sqlite3)
- Connect to DB: `psql -h <host> -U <user> -d <database>`
- Show table schema: `\d <table_name>` (psql) or `.schema <table>` (sqlite3)
- Export data: `psql -d <database> -c "COPY <table> TO STDOUT WITH CSV HEADER" > export.csv`
