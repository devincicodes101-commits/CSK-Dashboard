/**
 * Applies supabase/migrations/*.sql in order, once each.
 *
 *   npm run migrate
 *
 * Needs SUPABASE_DB_URL in .env.local — the connection string from
 * Supabase's Settings -> Database, which carries the password. That string
 * never leaves the machine it is run from and is not needed in Vercel; the
 * app talks to Supabase over HTTP with the service role key instead.
 *
 * Applied migrations are recorded in schema_migrations, so running this twice
 * is safe and adding a new file only runs that one. Each file runs inside a
 * transaction: a migration that fails half way leaves nothing behind, which
 * matters far more than speed when the alternative is a half-created schema
 * nobody can reason about.
 */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = path.join(HERE, "..", "supabase", "migrations");

/** Minimal .env.local reader; the app itself gets these from Vercel. */
function loadEnv() {
  const file = path.join(HERE, "..", ".env.local");
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return;
  }
  for (const line of text.split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const [, key, raw] = match;
    if (process.env[key]) continue;
    process.env[key] = raw.replace(/^["']|["']$/g, "").trim();
  }
}

loadEnv();

const url = process.env.SUPABASE_DB_URL?.trim();
if (!url) {
  console.error(
    "SUPABASE_DB_URL is not set.\n\n" +
      "Copy it from Supabase -> Settings -> Database -> Connection string\n" +
      "(URI, with your database password filled in) into .env.local as:\n\n" +
      "  SUPABASE_DB_URL=postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres\n",
  );
  process.exit(1);
}

const client = new pg.Client({
  connectionString: url,
  // Supabase terminates TLS with a certificate this client will not chain to
  // a local root. The connection is still encrypted.
  ssl: { rejectUnauthorized: false },
});

await client.connect();

await client.query(`
  create table if not exists schema_migrations (
    name       text primary key,
    applied_at timestamptz not null default now()
  );
`);

const { rows } = await client.query("select name from schema_migrations");
const done = new Set(rows.map((r) => r.name));

const files = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith(".sql"))
  .sort();

let applied = 0;

for (const file of files) {
  if (done.has(file)) {
    console.log(`  skip  ${file}`);
    continue;
  }

  const sql = readFileSync(path.join(MIGRATIONS, file), "utf8");
  try {
    await client.query("begin");
    await client.query(sql);
    await client.query("insert into schema_migrations (name) values ($1)", [file]);
    await client.query("commit");
    console.log(`  ok    ${file}`);
    applied += 1;
  } catch (error) {
    await client.query("rollback");
    console.error(`\n  FAIL  ${file}\n        ${error.message}\n`);
    await client.end();
    process.exit(1);
  }
}

await client.end();
console.log(
  applied === 0
    ? "\nNothing to apply; the schema is up to date."
    : `\n${applied} migration${applied === 1 ? "" : "s"} applied.`,
);
