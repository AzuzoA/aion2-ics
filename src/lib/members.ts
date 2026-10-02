import "server-only";
import { getDb, transaction } from "./db";
import { audited, writeAuditLog } from "./audit";
import type { CharacterClass } from "./classes";
import type { NcCharacter } from "./nc";

// ---------- 타입 ----------

export interface UserRow {
  id: number;
  discord_id: string;
  name: string;
  avatar_url: string | null;
  onboarded_at: string | null;
}

export interface AccountRow {
  id: number;
  user_id: number;
  label: string;
}

export interface CharacterRow {
  id: number;
  user_id: number;
  account_id: number;
  server: string | null;
  name: string;
  class: CharacterClass;
  level: number | null;
  combat_power: number | null;
  is_main: number;
  synced_at: string | null;
}

export interface CharacterNode {
  id: number;
  accountId: number;
  server: string | null;
  name: string;
  class: CharacterClass;
  level: number | null;
  combatPower: number | null;
  isMain: boolean;
  syncedAt: string | null;
}

export interface MemberTree {
  id: number;
  name: string;
  avatarUrl: string | null;
  accounts: { id: number; label: string; characters: CharacterNode[] }[];
}

export class NotFoundError extends Error {}
export class ValidationError extends Error {}
export class ConflictError extends Error {}

const USER_COLUMNS = "id, discord_id, name, avatar_url, onboarded_at";

// ---------- 조회 ----------

export function getUser(id: number): UserRow | undefined {
  return getDb().prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`).get(id) as
    | UserRow
    | undefined;
}

function getAccount(id: number): AccountRow | undefined {
  return getDb().prepare("SELECT id, user_id, label FROM accounts WHERE id = ?").get(id) as
    | AccountRow
    | undefined;
}

function getCharacter(id: number): CharacterRow | undefined {
  return getDb().prepare("SELECT * FROM characters WHERE id = ?").get(id) as
    | CharacterRow
    | undefined;
}

function toNode(c: CharacterRow): CharacterNode {
  return {
    id: c.id,
    accountId: c.account_id,
    server: c.server,
    name: c.name,
    class: c.class,
    level: c.level,
    combatPower: c.combat_power,
    isMain: c.is_main === 1,
    syncedAt: c.synced_at,
  };
}

/** 유저 → 계정 → 캐릭터 트리. userId를 주면 해당 유저만. 본캐가 먼저, 그다음 전투력 순. */
export function listMemberTrees(userId?: number): MemberTree[] {
  const db = getDb();
  const where = userId === undefined ? "" : "WHERE user_id = ?";
  const params = userId === undefined ? [] : [userId];
  const users = db
    .prepare(`SELECT ${USER_COLUMNS} FROM users ${userId === undefined ? "" : "WHERE id = ?"} ORDER BY name`)
    .all(...params) as unknown as UserRow[];
  const accounts = db
    .prepare(`SELECT id, user_id, label FROM accounts ${where} ORDER BY id`)
    .all(...params) as unknown as AccountRow[];
  const characters = db
    .prepare(`SELECT * FROM characters ${where} ORDER BY is_main DESC, combat_power DESC, id`)
    .all(...params) as unknown as CharacterRow[];

  const trees = new Map<number, MemberTree>(
    users.map((u) => [u.id, { id: u.id, name: u.name, avatarUrl: u.avatar_url, accounts: [] }]),
  );
  const accountNodes = new Map<number, MemberTree["accounts"][number]>();
  for (const a of accounts) {
    const node = { id: a.id, label: a.label, characters: [] };
    accountNodes.set(a.id, node);
    trees.get(a.user_id)?.accounts.push(node);
  }
  for (const c of characters) accountNodes.get(c.account_id)?.characters.push(toNode(c));
  // 본캐가 있는 계정을 맨 위로
  for (const t of trees.values()) {
    t.accounts.sort(
      (a, b) =>
        Number(b.characters.some((c) => c.isMain)) - Number(a.characters.some((c) => c.isMain)),
    );
  }
  return [...trees.values()];
}

// ---------- 유저 ----------

/**
 * Discord 로그인 시 호출. 신규 유저는 Discord 표시 이름으로 생성하고(온보딩 전),
 * 기존 유저는 아바타만 갱신한다. 별칭은 유저가 정한 값이므로 덮어쓰지 않는다.
 */
export function upsertUserByDiscord(discordId: string, discordName: string, avatarUrl: string | null): UserRow {
  const db = getDb();
  const existing = db.prepare("SELECT id FROM users WHERE discord_id = ?").get(discordId) as
    | { id: number }
    | undefined;
  if (existing) {
    db.prepare("UPDATE users SET avatar_url = ?, updated_at = datetime('now') WHERE id = ?").run(
      avatarUrl,
      existing.id,
    );
    return getUser(existing.id)!;
  }
  return transaction(() => {
    const { lastInsertRowid } = db
      .prepare("INSERT INTO users (discord_id, name, avatar_url) VALUES (?, ?, ?)")
      .run(discordId, discordName, avatarUrl);
    const id = Number(lastInsertRowid);
    // 신규 가입자는 기본 계정 1개를 가진다
    db.prepare("INSERT INTO accounts (user_id, label) VALUES (?, ?)").run(id, "계정 1");
    const user = getUser(id)!;
    writeAuditLog(id, { action: "create", targetType: "user", targetId: id, detail: user });
    return user;
  });
}

/** 메인 별칭 설정. 최초 호출 시 온보딩 완료 처리. */
export function setUserAlias(actorId: number, userId: number, name: string): UserRow {
  return audited(actorId, () => {
    const before = getUser(userId);
    if (!before) throw new NotFoundError("유저를 찾을 수 없습니다.");
    getDb()
      .prepare(
        `UPDATE users SET name = ?, onboarded_at = COALESCE(onboarded_at, datetime('now')),
           updated_at = datetime('now') WHERE id = ?`,
      )
      .run(name, userId);
    const after = getUser(userId)!;
    return {
      result: after,
      audit: { action: "update", targetType: "user", targetId: userId, detail: { before, after } },
    };
  });
}

// ---------- 계정 ----------

export function createAccount(actorId: number, userId: number, label: string): AccountRow {
  if (!getUser(userId)) throw new NotFoundError("유저를 찾을 수 없습니다.");
  return audited(actorId, () => {
    const { lastInsertRowid } = getDb()
      .prepare("INSERT INTO accounts (user_id, label) VALUES (?, ?)")
      .run(userId, label);
    const account = getAccount(Number(lastInsertRowid))!;
    return {
      result: account,
      audit: { action: "create", targetType: "account", targetId: account.id, detail: account },
    };
  });
}

export function renameAccount(actorId: number, accountId: number, label: string): AccountRow {
  return audited(actorId, () => {
    const before = getAccount(accountId);
    if (!before) throw new NotFoundError("계정을 찾을 수 없습니다.");
    getDb().prepare("UPDATE accounts SET label = ? WHERE id = ?").run(label, accountId);
    const after = getAccount(accountId)!;
    return {
      result: after,
      audit: { action: "update", targetType: "account", targetId: accountId, detail: { before, after } },
    };
  });
}

export function deleteAccount(actorId: number, accountId: number): void {
  audited(actorId, () => {
    const account = getAccount(accountId);
    if (!account) throw new NotFoundError("계정을 찾을 수 없습니다.");
    const { n } = getDb().prepare("SELECT COUNT(*) AS n FROM accounts WHERE user_id = ?").get(account.user_id) as { n: number };
    if (n <= 1) throw new ValidationError("계정은 최소 1개 필요합니다.");
    const characters = getDb()
      .prepare("SELECT * FROM characters WHERE account_id = ?")
      .all(accountId) as unknown as CharacterRow[];
    getDb().prepare("DELETE FROM accounts WHERE id = ?").run(accountId); // 캐릭터는 CASCADE
    return {
      result: undefined,
      audit: { action: "delete", targetType: "account", targetId: accountId, detail: { account, characters } },
    };
  });
}

// ---------- 캐릭터 ----------

/** 해당 유저의 기존 본캐를 부캐로 내린다. (트랜잭션 내부에서 호출) */
function clearMain(userId: number) {
  getDb().prepare("UPDATE characters SET is_main = 0 WHERE user_id = ? AND is_main = 1").run(userId);
}

/** NC API에서 조회한 캐릭터를 등록한다. isMain이면 기존 본캐는 부캐로 내려간다. */
export function registerCharacter(
  actorId: number,
  accountId: number,
  nc: NcCharacter,
  isMain: boolean,
): CharacterRow {
  return audited(actorId, () => {
    const db = getDb();
    const account = getAccount(accountId);
    if (!account) throw new NotFoundError("계정을 찾을 수 없습니다.");
    const dup = db.prepare("SELECT 1 FROM characters WHERE server = ? AND name = ?").get(nc.server, nc.name);
    if (dup) throw new ConflictError(`[${nc.server}] ${nc.name}은(는) 이미 등록된 캐릭터입니다.`);
    if (isMain) clearMain(account.user_id);
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO characters
           (user_id, account_id, server, name, class, level, combat_power, is_main, synced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      )
      .run(account.user_id, accountId, nc.server, nc.name, nc.class, nc.level, nc.combatPower, isMain ? 1 : 0);
    const character = getCharacter(Number(lastInsertRowid))!;
    return {
      result: character,
      audit: { action: "create", targetType: "character", targetId: character.id, detail: character },
    };
  });
}

/** 본캐 지정/해제, 계정 이동. 직업·레벨·전투력은 NC API 값이므로 직접 수정하지 않는다. */
export function updateCharacter(
  actorId: number,
  characterId: number,
  patch: { isMain?: boolean; accountId?: number },
): CharacterRow {
  return audited(actorId, () => {
    const before = getCharacter(characterId);
    if (!before) throw new NotFoundError("캐릭터를 찾을 수 없습니다.");

    let accountId = before.account_id;
    if (patch.accountId !== undefined && patch.accountId !== before.account_id) {
      const target = getAccount(patch.accountId);
      if (!target) throw new NotFoundError("계정을 찾을 수 없습니다.");
      // 다른 사람의 계정으로는 옮길 수 없다
      if (target.user_id !== before.user_id) {
        throw new ValidationError("같은 유저의 계정으로만 이동할 수 있습니다.");
      }
      accountId = target.id;
    }
    let isMain = before.is_main;
    if (patch.isMain === true && before.is_main === 0) {
      clearMain(before.user_id);
      isMain = 1;
    } else if (patch.isMain === false) {
      isMain = 0;
    }

    getDb()
      .prepare("UPDATE characters SET account_id = ?, is_main = ?, updated_at = datetime('now') WHERE id = ?")
      .run(accountId, isMain, characterId);
    const after = getCharacter(characterId)!;
    return {
      result: after,
      audit: { action: "update", targetType: "character", targetId: characterId, detail: { before, after } },
    };
  });
}

export function deleteCharacter(actorId: number, characterId: number): void {
  audited(actorId, () => {
    const character = getCharacter(characterId);
    if (!character) throw new NotFoundError("캐릭터를 찾을 수 없습니다.");
    getDb().prepare("DELETE FROM characters WHERE id = ?").run(characterId);
    return {
      result: undefined,
      audit: { action: "delete", targetType: "character", targetId: characterId, detail: character },
    };
  });
}

/** 등록 여부 확인용: 주어진 서버의 등록된 캐릭터 이름 집합 */
export function registeredNames(server: string): Set<string> {
  const rows = getDb().prepare("SELECT name FROM characters WHERE server = ?").all(server) as { name: string }[];
  return new Set(rows.map((r) => r.name));
}
