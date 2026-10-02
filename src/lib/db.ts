import "server-only";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  discord_id    TEXT    NOT NULL UNIQUE,
  name          TEXT    NOT NULL,     -- 메인 별칭 (최초 로그인 시 확정)
  avatar_url    TEXT,
  api_key       TEXT,                 -- Phase 2에서 암호화 저장
  onboarded_at  TEXT,                 -- 별칭 확정 시각. NULL이면 온보딩 필요
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS accounts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label       TEXT    NOT NULL,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, label)
);

CREATE TABLE IF NOT EXISTS characters (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id    INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  server        TEXT,
  name          TEXT    NOT NULL,
  class         TEXT    NOT NULL,
  level         INTEGER,
  combat_power  INTEGER,
  is_main       INTEGER NOT NULL DEFAULT 0,
  synced_at     TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS characters_account ON characters (account_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action       TEXT    NOT NULL,
  target_type  TEXT    NOT NULL,
  target_id    INTEGER,
  detail       TEXT,                -- JSON
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS audit_logs_created ON audit_logs (created_at);
`;

// 컬럼 추가에 의존하는 인덱스는 마이그레이션 이후에 만든다
const INDEXES = `
-- 유저당 본캐는 최대 1개
CREATE UNIQUE INDEX IF NOT EXISTS characters_one_main_per_user
  ON characters (user_id) WHERE is_main = 1;
-- 같은 서버의 같은 캐릭터는 한 번만 등록 가능
CREATE UNIQUE INDEX IF NOT EXISTS characters_server_name ON characters (server, name);
`;

/** 기존 DB에 없는 컬럼을 추가한다. */
function addColumnIfMissing(db: DatabaseSync, table: string, column: string, ddl: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}

function open(): DatabaseSync {
  const file = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "app.db");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file, { timeout: 5000 });
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  addColumnIfMissing(db, "users", "onboarded_at", "onboarded_at TEXT");
  addColumnIfMissing(db, "characters", "server", "server TEXT");
  db.exec(INDEXES);
  return db;
}

// 빌드 시 병렬 워커가 동시에 열지 않도록 첫 사용 시점에 연다.
// dev 서버 HMR 시 커넥션이 중복 생성되지 않도록 global에 보관한다.
const globalForDb = globalThis as unknown as { db?: DatabaseSync };
export function getDb(): DatabaseSync {
  return (globalForDb.db ??= open());
}

export function transaction<T>(fn: () => T): T {
  getDb().exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    getDb().exec("COMMIT");
    return result;
  } catch (e) {
    getDb().exec("ROLLBACK");
    throw e;
  }
}
