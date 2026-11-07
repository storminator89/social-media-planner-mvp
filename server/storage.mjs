import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

/** Local-only D1-compatible adapter. No hosted storage or authentication implied. */
export class LocalDatabase {
  constructor(directory) {
    mkdirSync(directory, { recursive: true });
    this.sql = new DatabaseSync(join(directory, 'planner.sqlite'));
    this.sql.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
    this.sql.exec('CREATE TABLE IF NOT EXISTS local_migrations (version INTEGER PRIMARY KEY, digest TEXT NOT NULL)');
    // Validate the entire known ledger before any upgrade. Never rewrite old SQL.
    const migrations = ['0001_planner.sql', '0002_variant_inheritance.sql', '0003_provider_jobs.sql', '0004_oauth_state.sql'].map((name, index) => {
      const source = readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
      return { version: index + 1, source, digest: createHash('sha256').update(source).digest('hex') };
    });
    try {
      this.sql.exec('BEGIN IMMEDIATE');
      const applied = this.sql.prepare('SELECT version, digest FROM local_migrations ORDER BY version').all();
      for (const [index, row] of applied.entries()) {
        if (row.version !== index + 1 || migrations[index]?.digest !== row.digest)
          throw new Error('Unknown, incomplete or changed local migration history. Upgrade aborted.');
      }
      for (const migration of migrations.slice(applied.length)) {
        this.sql.exec(migration.source);
        this.sql.prepare('INSERT INTO local_migrations (version, digest) VALUES (?, ?)').run(migration.version, migration.digest);
      }
      this.sql.exec('COMMIT');
    } catch (error) { this.sql.exec('ROLLBACK'); this.sql.close(); throw error; }
  }
  prepare(query) {
    const db = this.sql; let values = [];
    return {
      bind(...args) { values = args; return this; },
      async all() { return { results: db.prepare(query).all(...values) }; },
      async first() { return db.prepare(query).get(...values) ?? null; },
      async run() { return { meta: { changes: Number(db.prepare(query).run(...values).changes) } }; },
      _exec() {
        const statement = db.prepare(query);
        return /^\s*SELECT/i.test(query)
          ? { results: statement.all(...values), meta: { changes: 0 } }
          : { results: [], meta: { changes: Number(statement.run(...values).changes) } };
      }
    };
  }
  async batch(statements) {
    this.sql.exec('BEGIN');
    try { const result = statements.map(s => s._exec()); this.sql.exec('COMMIT'); return result; }
    catch (error) { this.sql.exec('ROLLBACK'); throw error; }
  }
  close() { this.sql.close(); }
}

/** File-backed local R2 interface. User-controlled object paths are never used. */
export class LocalBucket {
  constructor(directory) { this.directory = directory; mkdirSync(directory, { recursive: true }); }
  path(key) { return join(this.directory, createHash('sha256').update(key).digest('hex')); }
  async put(key, content) {
    const target = this.path(key), temporary = `${target}.${crypto.randomUUID()}.tmp`;
    try { await writeFile(temporary, content, { flag: 'wx' }); await rename(temporary, target); }
    catch (error) { await unlink(temporary).catch(() => {}); throw error; }
  }
  async get(key) {
    try { return { body: new Blob([await readFile(this.path(key))]).stream() }; }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  async delete(key) { try { await unlink(this.path(key)); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
}
