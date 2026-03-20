# Database Verification Recipe

Use this recipe when `subject: database` — verifying data state in a sandbox database environment.

## Step 1: Detect the Database Engine

Check for database indicators in the project:

```bash
# Check for SQLite
ls *.db *.sqlite *.sqlite3 2>/dev/null

# Check package.json for ORM/driver clues
cat package.json 2>/dev/null | grep -E '"(sqlite|pg|mysql|mongodb|redis|prisma|sequelize|typeorm)"'

# Check for Prisma schema
ls prisma/schema.prisma 2>/dev/null

# Check for migration files
ls db/migrate/ migrations/ database/migrate/ 2>/dev/null | head -5

# Check for docker-compose with DB service
ls docker-compose.yml docker-compose.yaml 2>/dev/null && grep -E "image: (postgres|mysql|mongo|redis)" docker-compose.yml docker-compose.yaml 2>/dev/null
```

Determine engine from the above:
- `.db`/`.sqlite` file found: use **SQLite**
- `pg` dependency or `postgres` image: use **PostgreSQL**
- `mysql` dependency or `mysql` image: use **MySQL/MariaDB**
- `mongodb` dependency or `mongo` image: use **MongoDB**
- `redis` dependency or `redis` image: use **Redis**

## Step 2: Verify Database Connection

Test that the database is reachable before running queries.

**SQLite:**
```bash
DB_FILE=$(ls *.db *.sqlite *.sqlite3 2>/dev/null | head -1)
echo "Using SQLite file: $DB_FILE"
sqlite3 "$DB_FILE" "SELECT 1;" 2>&1
```
Exit code non-zero: FAIL with reason "SQLite file not accessible: $DB_FILE"

**PostgreSQL:**
```bash
psql "$DATABASE_URL" -c "SELECT 1;" 2>&1
# or without DATABASE_URL:
psql -h localhost -p 5432 -U <DB_USER> -d <DB_NAME> -c "SELECT 1;" 2>&1
```
Exit code non-zero: FAIL with reason "PostgreSQL not reachable. Check DATABASE_URL or connection params."

**MySQL/MariaDB:**
```bash
mysql -h localhost -P 3306 -u <DB_USER> -p<DB_PASS> <DB_NAME> -e "SELECT 1;" 2>&1
```

**MongoDB:**
```bash
mongosh "$MONGODB_URI" --eval "db.runCommand({ping: 1})" 2>&1
# or:
mongosh --host localhost --port 27017 --eval "db.runCommand({ping: 1})" 2>&1
```

**Redis:**
```bash
redis-cli ping 2>&1 | grep -i "PONG"
```

If the connection fails: FAIL. Do not proceed to Step 3.

## Step 3: Run the Verification Query

Derive the query from the scenario's `then` clause. The query must verify actual data state — not behavior.

**SQLite — query a table:**
```bash
sqlite3 "$DB_FILE" "SELECT <columns> FROM <table> WHERE <condition>;" 2>&1
```

**SQLite — count rows:**
```bash
sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM <table> WHERE <condition>;" 2>&1
```

**PostgreSQL — query:**
```bash
psql "$DATABASE_URL" -t -c "SELECT <columns> FROM <table> WHERE <condition>;" 2>&1
```

**MySQL — query:**
```bash
mysql -h localhost -u <DB_USER> -p<DB_PASS> <DB_NAME> -e "SELECT <columns> FROM <table> WHERE <condition>;" 2>&1
```

**MongoDB — find document:**
```bash
mongosh "$MONGODB_URI" --eval "printjson(db.<collection>.findOne({<filter>}))" 2>&1
```

**Redis — get key:**
```bash
redis-cli GET "<KEY>" 2>&1
```

Save output:
```bash
QUERY_RESULT=$(sqlite3 "$DB_FILE" "SELECT <columns> FROM <table> WHERE <condition>;" 2>&1)
echo "Query result: $QUERY_RESULT"
```

## Step 4: Assert Data State

**Assert a row exists:**
```bash
COUNT=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM <table> WHERE <condition>;")
[ "$COUNT" -gt 0 ] && echo "PASS: row exists" || echo "FAIL: no matching row found"
```

**Assert a row does NOT exist (e.g., deleted):**
```bash
COUNT=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM <table> WHERE <condition>;")
[ "$COUNT" -eq 0 ] && echo "PASS: row correctly absent" || echo "FAIL: row still exists ($COUNT rows)"
```

**Assert a field value:**
```bash
ACTUAL=$(sqlite3 "$DB_FILE" "SELECT <field> FROM <table> WHERE <id_condition>;")
EXPECTED="<expected_value>"
[ "$ACTUAL" = "$EXPECTED" ] && echo "PASS" || echo "FAIL: expected '$EXPECTED', got '$ACTUAL'"
```

**Assert row count equals expected:**
```bash
COUNT=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM <table>;")
EXPECTED_COUNT=<N>
[ "$COUNT" -eq "$EXPECTED_COUNT" ] && echo "PASS: $COUNT rows" || echo "FAIL: expected $EXPECTED_COUNT rows, got $COUNT"
```

**Assert JSON/text field contains substring (SQLite):**
```bash
sqlite3 "$DB_FILE" "SELECT <field> FROM <table> WHERE <condition>;" | grep -F "<EXPECTED_SUBSTRING>"
```
Exit code 0 = found. Non-zero = FAIL.

## Step 5: Assert Schema State (If Required)

If the scenario verifies migrations or schema changes:

**SQLite — assert table exists:**
```bash
sqlite3 "$DB_FILE" ".tables" | grep -w "<TABLE_NAME>"
```

**SQLite — assert column exists:**
```bash
sqlite3 "$DB_FILE" "PRAGMA table_info(<TABLE_NAME>);" | grep -w "<COLUMN_NAME>"
```

**PostgreSQL — assert table exists:**
```bash
psql "$DATABASE_URL" -t -c "\dt <TABLE_NAME>" | grep -w "<TABLE_NAME>"
```

**PostgreSQL — assert column exists:**
```bash
psql "$DATABASE_URL" -t -c "SELECT column_name FROM information_schema.columns WHERE table_name='<TABLE_NAME>' AND column_name='<COLUMN_NAME>';" | grep -w "<COLUMN_NAME>"
```

## Step 6: Record Result

- If all assertions pass: status = PASS
- If any assertion fails: status = FAIL. Include the query run, actual result, and expected result.

## Failure Template

```
FAIL: <assertion description>
Engine: <sqlite|postgres|mysql|mongodb|redis>
Query: <query_text>
Actual: <actual_query_result>
Expected: <expected_value>
```
