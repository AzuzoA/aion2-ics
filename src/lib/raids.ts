import "server-only";
import { getDb } from "./db";
import { audited } from "./audit";
import type { CharacterClass } from "./classes";
import { ConflictError, NotFoundError, ValidationError } from "./members";
import { compose, SANCTUARY_RULES, splitParties, type RaidMode } from "./raid/compose";
import { assignSlots, raidTypeName, slotKind, SLOTS_PER_PARTY, type RaidType } from "./raid/tactics";

// ---------- 타입 ----------

interface RaidRow {
  id: number;
  title: string;
  raid_date: string;
  raid_type: RaidType;
  mode: RaidMode;
  party_size: number;
  created_by: number | null;
  created_at: string;
}

export interface RaidSummary {
  id: number;
  title: string;
  raidDate: string;
  raidType: RaidType;
  mode: RaidMode;
  partySize: number;
  createdBy: string | null;
  participantCount: number;
}

export interface RaidParticipant {
  id: number;
  round: number | null;
  party: number | null;
  slot: number | null;
  characterId: number;
  name: string;
  class: CharacterClass;
  combatPower: number | null;
  isMain: boolean;
  accountId: number;
  accountLabel: string;
  userId: number;
  userName: string;
}

export type NoteKind = "melee" | "ranged";

export interface SlotNote {
  round: number;
  party: number;
  slot: number;
  text: string;
  kind: NoteKind | null;
}

export interface RaidDetail extends RaidSummary {
  participants: RaidParticipant[];
  slotNotes: SlotNote[];
}

// ---------- 조회 ----------

const SUMMARY_SQL = `
  SELECT r.*, u.name AS creator_name,
         (SELECT COUNT(*) FROM raid_participants p WHERE p.raid_id = r.id) AS participant_count
  FROM raids r LEFT JOIN users u ON u.id = r.created_by`;

type SummaryRow = RaidRow & { creator_name: string | null; participant_count: number };

function toSummary(r: SummaryRow): RaidSummary {
  return {
    id: r.id,
    title: r.title,
    raidDate: r.raid_date,
    raidType: r.raid_type,
    mode: r.mode,
    partySize: r.party_size,
    createdBy: r.creator_name,
    participantCount: r.participant_count,
  };
}

function getRaidRow(id: number): RaidRow {
  const raid = getDb().prepare("SELECT * FROM raids WHERE id = ?").get(id) as RaidRow | undefined;
  if (!raid) throw new NotFoundError("성역 방을 찾을 수 없습니다.");
  return raid;
}

/** 최근 일정 순 */
export function listRaids(): RaidSummary[] {
  const rows = getDb().prepare(`${SUMMARY_SQL} ORDER BY r.raid_date DESC, r.id DESC`).all() as unknown as SummaryRow[];
  return rows.map(toSummary);
}

export function getRaidDetail(id: number): RaidDetail | null {
  const row = getDb().prepare(`${SUMMARY_SQL} WHERE r.id = ?`).get(id) as SummaryRow | undefined;
  if (!row) return null;
  const participants = getDb()
    .prepare(
      `SELECT p.id, p.round, p.party, p.slot, c.id AS character_id, c.name, c.class, c.combat_power, c.is_main,
              a.id AS account_id, a.label AS account_label, u.id AS user_id, u.name AS user_name
       FROM raid_participants p
       JOIN characters c ON c.id = p.character_id
       JOIN accounts a ON a.id = c.account_id
       JOIN users u ON u.id = c.user_id
       WHERE p.raid_id = ?
       ORDER BY p.id`,
    )
    .all(id) as {
    id: number;
    round: number | null;
    party: number | null;
    slot: number | null;
    character_id: number;
    name: string;
    class: CharacterClass;
    combat_power: number | null;
    is_main: number;
    account_id: number;
    account_label: string;
    user_id: number;
    user_name: string;
  }[];
  const slotNotes = getDb()
    .prepare("SELECT round, party, slot, text, kind FROM raid_slot_notes WHERE raid_id = ?")
    .all(id) as unknown as SlotNote[];
  return {
    ...toSummary(row),
    slotNotes,
    participants: participants.map((p) => ({
      id: p.id,
      round: p.round,
      party: p.party,
      slot: p.slot,
      characterId: p.character_id,
      name: p.name,
      class: p.class,
      combatPower: p.combat_power,
      isMain: p.is_main === 1,
      accountId: p.account_id,
      accountLabel: p.account_label,
      userId: p.user_id,
      userName: p.user_name,
    })),
  };
}

// ---------- 방 ----------

export function createRaid(
  actorId: number,
  input: { title: string | null; raidDate: string; raidType: RaidType; mode: RaidMode },
): RaidRow {
  return audited(actorId, () => {
    const { lastInsertRowid } = getDb()
      .prepare("INSERT INTO raids (title, raid_date, raid_type, mode, party_size, created_by) VALUES (?, ?, ?, ?, ?, ?)")
      .run(input.title ?? raidTypeName(input.raidType), input.raidDate, input.raidType, input.mode, SANCTUARY_RULES.partySize, actorId);
    const raid = getRaidRow(Number(lastInsertRowid));
    return { result: raid, audit: { action: "create", targetType: "raid", targetId: raid.id, detail: raid } };
  });
}

/** 성역 종류 변경 (자리 규칙·공략 표시만 바뀌고 조합은 유지) */
export function setRaidType(actorId: number, raidId: number, raidType: RaidType): void {
  audited(actorId, () => {
    const before = getRaidRow(raidId);
    getDb().prepare("UPDATE raids SET raid_type = ? WHERE id = ?").run(raidType, raidId);
    return {
      result: undefined,
      audit: { action: "update", targetType: "raid", targetId: raidId, detail: { before: before.raid_type, after: raidType } },
    };
  });
}

export function deleteRaid(actorId: number, raidId: number): void {
  audited(actorId, () => {
    const detail = getRaidDetail(raidId);
    if (!detail) throw new NotFoundError("성역 방을 찾을 수 없습니다.");
    getDb().prepare("DELETE FROM raids WHERE id = ?").run(raidId); // 참가자는 CASCADE
    return { result: undefined, audit: { action: "delete", targetType: "raid", targetId: raidId, detail } };
  });
}

// ---------- 참가자 ----------

/** 등록된 캐릭터만 참가 가능. 단판은 1인 1캐릭. */
export function addParticipant(actorId: number, raidId: number, characterId: number): void {
  audited(actorId, () => {
    const db = getDb();
    const raid = getRaidRow(raidId);
    const character = db.prepare("SELECT id, user_id, name FROM characters WHERE id = ?").get(characterId) as
      | { id: number; user_id: number; name: string }
      | undefined;
    if (!character) throw new NotFoundError("등록된 캐릭터가 아닙니다.");
    if (db.prepare("SELECT 1 FROM raid_participants WHERE raid_id = ? AND character_id = ?").get(raidId, characterId)) {
      throw new ConflictError(`${character.name}은(는) 이미 참가 중입니다.`);
    }
    if (raid.mode === "single") {
      const same = db
        .prepare(
          `SELECT c.name FROM raid_participants p JOIN characters c ON c.id = p.character_id
           WHERE p.raid_id = ? AND c.user_id = ?`,
        )
        .get(raidId, character.user_id) as { name: string } | undefined;
      if (same) throw new ConflictError(`단판은 1인 1캐릭입니다. 이미 ${same.name}(으)로 참가 중입니다.`);
    }
    const { lastInsertRowid } = db
      .prepare("INSERT INTO raid_participants (raid_id, character_id, added_by) VALUES (?, ?, ?)")
      .run(raidId, characterId, actorId);
    return {
      result: undefined,
      audit: {
        action: "create",
        targetType: "raid_participant",
        targetId: Number(lastInsertRowid),
        detail: { raidId, characterId, name: character.name },
      },
    };
  });
}

function getParticipant(raidId: number, participantId: number) {
  const p = getDb()
    .prepare("SELECT * FROM raid_participants WHERE id = ? AND raid_id = ?")
    .get(participantId, raidId) as
    | { id: number; character_id: number; round: number | null; party: number | null; slot: number | null }
    | undefined;
  if (!p) throw new NotFoundError("참가자를 찾을 수 없습니다.");
  return p;
}

export function removeParticipant(actorId: number, raidId: number, participantId: number): void {
  audited(actorId, () => {
    const before = getParticipant(raidId, participantId);
    getDb().prepare("DELETE FROM raid_participants WHERE id = ?").run(participantId);
    return { result: undefined, audit: { action: "delete", targetType: "raid_participant", targetId: participantId, detail: before } };
  });
}

/**
 * 수동 조정: 회차·파티 이동 (round null = 대기).
 * party를 생략하면 그 회차에서 인원이 적은 파티로 넣는다. slot을 주면 그 자리가 비었을 때 그 자리로(빈자리에 드롭).
 * 규칙 위반은 막지 않고 화면에서 경고한다.
 */
export function setParticipantRound(
  actorId: number,
  raidId: number,
  participantId: number,
  round: number | null,
  party?: number,
  slot?: number,
): void {
  if (slot !== undefined && (!Number.isInteger(slot) || slot < 1 || slot > SLOTS_PER_PARTY)) {
    throw new ValidationError(`자리는 1~${SLOTS_PER_PARTY}번 중 하나여야 합니다.`);
  }
  if (round !== null && (!Number.isInteger(round) || round < 1 || round > 100)) {
    throw new ValidationError("회차는 1 이상의 정수여야 합니다.");
  }
  const parties = SANCTUARY_RULES.partiesPerRound;
  if (party !== undefined && (!Number.isInteger(party) || party < 1 || party > parties)) {
    throw new ValidationError(`파티는 1~${parties} 중 하나여야 합니다.`);
  }
  audited(actorId, () => {
    const before = getParticipant(raidId, participantId);
    let target: number | null = null;
    if (round !== null) {
      if (party !== undefined) target = party;
      else {
        const counts = getDb()
          .prepare("SELECT party, COUNT(*) AS n FROM raid_participants WHERE raid_id = ? AND round = ? AND id != ? GROUP BY party")
          .all(raidId, round, participantId) as { party: number | null; n: number }[];
        const size = (p: number) => counts.find((c) => c.party === p)?.n ?? 0;
        target = Array.from({ length: parties }, (_, i) => i + 1).sort((a, b) => size(a) - size(b) || a - b)[0];
      }
    }
    const placed = round === null || target === null ? null : (requestedSlot(raidId, round, target, participantId, slot) ?? freeSlot(raidId, round, target, participantId));
    getDb().prepare("UPDATE raid_participants SET round = ?, party = ?, slot = ? WHERE id = ?").run(round, target, placed, participantId);
    return {
      result: undefined,
      audit: {
        action: "update",
        targetType: "raid_participant",
        targetId: participantId,
        detail: { before: { round: before.round, party: before.party, slot: before.slot }, after: { round, party: target, slot: placed } },
      },
    };
  });
}

/** 요청한 자리가 비어 있으면 그 자리, 아니면 null */
function requestedSlot(raidId: number, round: number, party: number, participantId: number, slot: number | undefined) {
  if (slot === undefined) return null;
  const taken = getDb()
    .prepare("SELECT 1 FROM raid_participants WHERE raid_id = ? AND round = ? AND party = ? AND slot = ? AND id != ?")
    .get(raidId, round, party, slot, participantId);
  return taken ? null : slot;
}

/** 이동해 온 캐릭터의 자리: 치유성은 5번 우선, 아니면 빈자리 중 앞 번호. 빈자리가 없으면 null. */
function freeSlot(raidId: number, round: number, party: number, participantId: number): number | null {
  const db = getDb();
  const taken = new Set(
    (
      db
        .prepare("SELECT slot FROM raid_participants WHERE raid_id = ? AND round = ? AND party = ? AND id != ?")
        .all(raidId, round, party, participantId) as { slot: number | null }[]
    ).map((r) => r.slot),
  );
  const me = db
    .prepare("SELECT c.class FROM raid_participants p JOIN characters c ON c.id = p.character_id WHERE p.id = ?")
    .get(participantId) as { class: CharacterClass };
  const order = Array.from({ length: SLOTS_PER_PARTY }, (_, i) => i + 1);
  if (slotKind(me.class) === "healer") order.unshift(SLOTS_PER_PARTY);
  return order.find((s) => !taken.has(s)) ?? null;
}

/** 수동 조정: 파티 안 자리 지정. 그 자리에 누가 있으면 서로 맞바꾼다. */
export function setParticipantSlot(actorId: number, raidId: number, participantId: number, slot: number): void {
  if (!Number.isInteger(slot) || slot < 1 || slot > SLOTS_PER_PARTY) {
    throw new ValidationError(`자리는 1~${SLOTS_PER_PARTY}번 중 하나여야 합니다.`);
  }
  audited(actorId, () => {
    const me = getParticipant(raidId, participantId);
    if (me.round === null || me.party === null) throw new ValidationError("회차·파티에 배치된 캐릭터만 자리를 정할 수 있습니다.");
    const db = getDb();
    const other = db
      .prepare("SELECT id FROM raid_participants WHERE raid_id = ? AND round = ? AND party = ? AND slot = ? AND id != ?")
      .get(raidId, me.round, me.party, slot, participantId) as { id: number } | undefined;
    if (other) db.prepare("UPDATE raid_participants SET slot = ? WHERE id = ?").run(me.slot, other.id);
    db.prepare("UPDATE raid_participants SET slot = ? WHERE id = ?").run(slot, participantId);
    return {
      result: undefined,
      audit: {
        action: "update",
        targetType: "raid_participant",
        targetId: participantId,
        detail: { slot: { before: me.slot, after: slot }, swappedWith: other?.id ?? null },
      },
    };
  });
}

/** 드래그 앤 드롭: 두 참가자의 회차·파티·자리를 맞바꾼다. */
export function swapParticipants(actorId: number, raidId: number, participantId: number, otherId: number): void {
  if (participantId === otherId) return;
  audited(actorId, () => {
    const a = getParticipant(raidId, participantId);
    const b = getParticipant(raidId, otherId);
    const update = getDb().prepare("UPDATE raid_participants SET round = ?, party = ?, slot = ? WHERE id = ?");
    update.run(b.round, b.party, b.slot, a.id);
    update.run(a.round, a.party, a.slot, b.id);
    return {
      result: undefined,
      audit: {
        action: "update",
        targetType: "raid_participant",
        targetId: a.id,
        detail: { swap: [a, b].map((p) => ({ id: p.id, round: p.round, party: p.party, slot: p.slot })) },
      },
    };
  });
}

/** 빈자리 직접 입력 (참가 캐릭터가 아닌 사람)과 근접/원거리. 이름이 빈 문자열이면 지운다. */
export function setSlotNote(
  actorId: number,
  raidId: number,
  at: { round: number; party: number; slot: number },
  text: string,
  kind: NoteKind | null,
): void {
  const { round, party, slot } = at;
  if (!Number.isInteger(round) || round < 1) throw new ValidationError("회차가 올바르지 않습니다.");
  if (!Number.isInteger(party) || party < 1 || party > SANCTUARY_RULES.partiesPerRound) {
    throw new ValidationError("파티가 올바르지 않습니다.");
  }
  if (!Number.isInteger(slot) || slot < 1 || slot > SLOTS_PER_PARTY) throw new ValidationError("자리가 올바르지 않습니다.");
  audited(actorId, () => {
    getRaidRow(raidId);
    const db = getDb();
    if (text) {
      db.prepare(
        `INSERT INTO raid_slot_notes (raid_id, round, party, slot, text, kind) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (raid_id, round, party, slot) DO UPDATE SET text = excluded.text, kind = excluded.kind`,
      ).run(raidId, round, party, slot, text, kind);
    } else {
      db.prepare("DELETE FROM raid_slot_notes WHERE raid_id = ? AND round = ? AND party = ? AND slot = ?").run(raidId, round, party, slot);
    }
    return { result: undefined, audit: { action: "update", targetType: "raid", targetId: raidId, detail: { slotNote: { ...at, text, kind } } } };
  });
}

/** 자동 조합: 모든 참가자의 회차를 다시 계산해 덮어쓴다. */
export function composeRaid(actorId: number, raidId: number): void {
  audited(actorId, () => {
    const detail = getRaidDetail(raidId);
    if (!detail) throw new NotFoundError("성역 방을 찾을 수 없습니다.");
    const rounds = compose(detail.participants);
    // 회차마다 1파티·2파티로 나누고, 파티마다 자리(1~5번)를 정한다
    const parties = new Map<number, number>();
    const slots = new Map<number, number>();
    for (const round of new Set(rounds.values())) {
      const members = detail.participants.filter((p) => rounds.get(p.id) === round);
      const split = splitParties(members);
      split.forEach((party, id) => parties.set(id, party));
      for (const party of new Set(split.values())) {
        assignSlots(members.filter((p) => split.get(p.id) === party)).forEach((slot, id) => slots.set(id, slot));
      }
    }
    // 조합이 바뀌면 미정 칸 직접 입력도 의미가 없어지므로 지운다
    getDb().prepare("DELETE FROM raid_slot_notes WHERE raid_id = ?").run(raidId);
    const update = getDb().prepare("UPDATE raid_participants SET round = ?, party = ?, slot = ? WHERE id = ?");
    for (const p of detail.participants) {
      update.run(rounds.get(p.id) ?? null, parties.get(p.id) ?? null, slots.get(p.id) ?? null, p.id);
    }
    return {
      result: undefined,
      audit: {
        action: "update",
        targetType: "raid",
        targetId: raidId,
        detail: { rounds: Object.fromEntries(rounds), parties: Object.fromEntries(parties), slots: Object.fromEntries(slots) },
      },
    };
  });
}
