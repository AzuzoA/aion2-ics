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

-- 성역 레이드 방
CREATE TABLE IF NOT EXISTS raids (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT    NOT NULL,
  raid_date   TEXT    NOT NULL,     -- YYYY-MM-DDTHH:mm (KST)
  raid_type   TEXT    NOT NULL DEFAULT 'rudra',  -- rudra/erosion/muspel/lament (루드라/침식/무스펠/비탄)
  mode        TEXT    NOT NULL CHECK (mode IN ('multi', 'single')),  -- 다회차 / 단판
  party_size  INTEGER NOT NULL DEFAULT 10,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- 참가 캐릭터. round가 조합 결과 (NULL이면 대기)
CREATE TABLE IF NOT EXISTS raid_participants (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  raid_id       INTEGER NOT NULL REFERENCES raids(id) ON DELETE CASCADE,
  character_id  INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  round         INTEGER,
  party         INTEGER,             -- 회차 안의 1파티/2파티
  slot          INTEGER,             -- 파티 안 자리 1~5번 (5번 = 치유성)
  added_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (raid_id, character_id)
);

-- 빈자리에 직접 입력한 이름 (참가 캐릭터가 없는 회차·파티·자리). 캐릭터가 앉으면 캐릭터가 우선
CREATE TABLE IF NOT EXISTS raid_slot_notes (
  raid_id  INTEGER NOT NULL REFERENCES raids(id) ON DELETE CASCADE,
  round    INTEGER NOT NULL,
  party    INTEGER NOT NULL,
  slot     INTEGER NOT NULL,
  text     TEXT    NOT NULL,
  kind     TEXT,                -- melee / ranged / NULL(안 고름)
  PRIMARY KEY (raid_id, round, party, slot)
);
-- 공략 칸 단위 입력(raid_slot_notes 이전 방식, 데이터 없이 바로 교체됨)
DROP TABLE IF EXISTS raid_duty_notes;
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
  addColumnIfMissing(db, "raid_participants", "party", "party INTEGER");
  addColumnIfMissing(db, "raid_participants", "slot", "slot INTEGER");
  addColumnIfMissing(db, "raid_slot_notes", "kind", "kind TEXT");
  addColumnIfMissing(db, "raids", "raid_type", "raid_type TEXT NOT NULL DEFAULT 'rudra'");
  // 직업명 2자 통일 (수호성 → 수호 등)
  db.exec(`UPDATE characters SET class = CASE class
    WHEN '수호성' THEN '수호' WHEN '마도성' THEN '마도' WHEN '정령성' THEN '정령'
    WHEN '호법성' THEN '호법' WHEN '치유성' THEN '치유' ELSE class END
    WHERE class IN ('수호성', '마도성', '정령성', '호법성', '치유성')`);
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
