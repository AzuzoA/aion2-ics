// 성역 공대 조합 (순수 함수). 서버(조합 생성)·클라이언트(규칙 위반 경고)·단위 테스트에서 함께 쓴다.
// node --test로 바로 실행되도록 런타임 import는 .ts 확장자를 붙인다.
import { CLASS_ROLES, type CharacterClass } from "../classes.ts";
import { slotKind } from "./tactics.ts";

export type RaidMode = "multi" | "single";

export const RAID_MODE_LABELS: Record<RaidMode, string> = {
  multi: "다회차",
  single: "단판",
};

/** 회차(다회차) / 공대(단판, 정원 초과 시 나뉘는 단위) 이름. 그 안은 1파티·2파티로 나뉜다. */
export const roundUnit = (mode: RaidMode) => (mode === "multi" ? "회차" : "공대");

/** 성역 규칙 (PRD 2장 조합 규칙) */
export const SANCTUARY_RULES = {
  partySize: 10, // 회차(공대) 정원
  partiesPerRound: 2, // 1파티·2파티, 파티당 partySize / 2 = 5명
  classLimits: { 수호: 1, 치유: 2, 호법: 2 } as Partial<Record<CharacterClass, number>>,
};

export interface ComposeInput {
  id: number; // 참가 ID
  userId: number;
  accountId: number;
  name: string;
  class: CharacterClass;
  combatPower: number | null;
}

interface Rules {
  partySize: number;
  partiesPerRound: number;
  classLimits: Partial<Record<CharacterClass, number>>;
}

interface RoundState {
  members: ComposeInput[];
  users: Set<number>;
  classCount: Map<CharacterClass, number>;
}

/**
 * 참가 캐릭터를 회차에 배치한다. 반환: 참가 ID → 회차(1부터).
 *
 * 제한 조건 (반드시 지킴)
 * - 회차당 최대 partySize명, 직업 제한(classLimits), 같은 유저는 회차당 1캐릭
 * 우선순위 (PRD 2장)
 * 1. 캐릭터 수가 적은 유저부터 이른 회차에 배치 → 일찍 끝나고 쉴 수 있게
 * 2. 같은 유저의 캐릭터는 계정별로 묶어 연속으로 배치 → 계정 전환 최소화
 * 3. 남툴 평균이 회차끼리 고르게 (1·2를 해치지 않는 교체만 허용)
 *
 * 회차 수는 가능한 최소로 하고, 회차 인원은 고르게 나눈다 (23명 → 8/8/7, 10/10/3 아님).
 */
export function compose(participants: ComposeInput[], rules: Rules = SANCTUARY_RULES): Map<number, number> {
  const result = new Map<number, number>();
  const n = participants.length;
  if (n === 0) return result;

  for (let rounds = minRounds(participants, rules); rounds <= n; rounds++) {
    // 고르게 나눈 인원 상한으로 먼저 시도하고, 안 되면 정원까지 허용
    for (const cap of new Set([Math.ceil(n / rounds), rules.partySize])) {
      const placed = tryPlace(participants, rules, rounds, cap);
      if (placed) {
        balanceCombatPower(placed);
        placed.forEach((round, i) => round.members.forEach((p) => result.set(p.id, i + 1)));
        return result;
      }
    }
  }
  // rounds = n, cap = 1이면 항상 배치 가능하므로 여기 오지 않는다
  throw new Error("조합을 만들 수 없습니다.");
}

/** 제한 조건만으로 계산한 최소 회차 수 */
export function minRounds(participants: ComposeInput[], rules: Rules = SANCTUARY_RULES): number {
  let rounds = Math.ceil(participants.length / rules.partySize);
  for (const k of countBy(participants, (p) => p.userId).values()) rounds = Math.max(rounds, k);
  for (const [cls, k] of countBy(participants, (p) => p.class)) {
    const limit = rules.classLimits[cls];
    if (limit !== undefined) rounds = Math.max(rounds, limit === 0 ? Infinity : Math.ceil(k / limit));
  }
  return rounds;
}

function tryPlace(participants: ComposeInput[], rules: Rules, roundCount: number, cap: number): RoundState[] | null {
  const rounds: RoundState[] = Array.from({ length: roundCount }, () => ({
    members: [],
    users: new Set(),
    classCount: new Map(),
  }));

  // 유저별 캐릭터: 계정별로 묶고(캐릭터 많은 계정 먼저), 계정 안에서는 남툴 높은 순
  const byUser = new Map<number, ComposeInput[]>();
  for (const p of participants) byUser.set(p.userId, [...(byUser.get(p.userId) ?? []), p]);
  for (const chars of byUser.values()) {
    const accountSize = countBy(chars, (c) => c.accountId);
    chars.sort(
      (a, b) =>
        accountSize.get(b.accountId)! - accountSize.get(a.accountId)! ||
        a.accountId - b.accountId ||
        (b.combatPower ?? 0) - (a.combatPower ?? 0) ||
        a.id - b.id,
    );
  }
  // 우선순위 1: 캐릭터 수가 적은 유저부터 (이른 회차를 먼저 차지)
  const users = [...byUser.entries()].sort(([ua, a], [ub, b]) => a.length - b.length || ua - ub);

  for (let u = 0; u < users.length; u++) {
    const [userId, chars] = users[u];
    for (let c = 0; c < chars.length; c++) {
      const ch = chars[c];
      // 앞으로 배치할 수요: 이 유저의 남은 캐릭터 + 뒤 유저들
      const demands = [chars.length - c - 1, ...users.slice(u + 1).map(([, cs]) => cs.length)];
      const target = rounds.find((r) => {
        if (r.members.length >= cap || r.users.has(userId)) return false;
        const limit = rules.classLimits[ch.class];
        if (limit !== undefined && (r.classCount.get(ch.class) ?? 0) >= limit) return false;
        // 이른 회차를 다 채워 뒤 유저(캐릭 많은 유저)가 배치 불가능해지지 않게 미리 확인
        const free = rounds.map((x) => cap - x.members.length - (x === r ? 1 : 0));
        return canDistribute(demands, free);
      });
      if (!target) return null;
      target.members.push(ch);
      target.users.add(userId);
      target.classCount.set(ch.class, (target.classCount.get(ch.class) ?? 0) + 1);
    }
  }
  return rounds;
}

/**
 * 각 유저가 서로 다른 회차에 k개씩 들어갈 수 있는지 (Gale–Ryser 조건, 직업 제한은 무시한 필요조건).
 * 수요 상위 j명의 합 ≤ Σ min(회차 남은 자리, j) 가 모든 j에 대해 성립해야 한다.
 */
function canDistribute(demands: number[], free: number[]): boolean {
  const sorted = demands.filter((d) => d > 0).sort((a, b) => b - a);
  let sum = 0;
  for (let j = 1; j <= sorted.length; j++) {
    sum += sorted[j - 1];
    if (sorted[j - 1] > free.length) return false;
    const supply = free.reduce((s, f) => s + Math.min(Math.max(f, 0), j), 0);
    if (sum > supply) return false;
  }
  return true;
}

/**
 * 우선순위 3: 회차별 남툴 평균 편차를 줄이는 교체.
 * 1·2를 해치지 않도록 '캐릭터 1개짜리 유저'끼리, 같은 직업끼리만 교체한다
 * (회차 인원·직업 구성·유저 중복이 그대로 유지됨).
 */
function balanceCombatPower(rounds: RoundState[]) {
  const userCharCount = countBy(
    rounds.flatMap((r) => r.members),
    (p) => p.userId,
  );
  const cp = (p: ComposeInput) => p.combatPower ?? 0;
  const spread = () => {
    const avgs = rounds.filter((r) => r.members.length).map((r) => r.members.reduce((s, p) => s + cp(p), 0) / r.members.length);
    const mean = avgs.reduce((s, a) => s + a, 0) / avgs.length;
    return avgs.reduce((s, a) => s + (a - mean) ** 2, 0);
  };

  for (let iter = 0; iter < 200; iter++) {
    let best = spread();
    let swap: [number, number, number, number] | null = null;
    for (let i = 0; i < rounds.length; i++) {
      for (let j = i + 1; j < rounds.length; j++) {
        for (let a = 0; a < rounds[i].members.length; a++) {
          const pa = rounds[i].members[a];
          if (userCharCount.get(pa.userId) !== 1) continue;
          for (let b = 0; b < rounds[j].members.length; b++) {
            const pb = rounds[j].members[b];
            if (userCharCount.get(pb.userId) !== 1 || pa.class !== pb.class || cp(pa) === cp(pb)) continue;
            rounds[i].members[a] = pb;
            rounds[j].members[b] = pa;
            const s = spread();
            rounds[i].members[a] = pa;
            rounds[j].members[b] = pb;
            if (s < best - 1e-9) {
              best = s;
              swap = [i, a, j, b];
            }
          }
        }
      }
    }
    if (!swap) break;
    const [i, a, j, b] = swap;
    const pa = rounds[i].members[a];
    const pb = rounds[j].members[b];
    rounds[i].members[a] = pb;
    rounds[j].members[b] = pa;
    rounds[i].users.delete(pa.userId);
    rounds[i].users.add(pb.userId);
    rounds[j].users.delete(pb.userId);
    rounds[j].users.add(pa.userId);
  }
}

const ROLE_ORDER = { support: 0, tank: 1, dealer: 2 } as const;

/**
 * 한 회차(공대) 인원을 1파티·2파티로 나눈다. 반환: 참가 ID → 파티(1부터).
 * 치유·근접·원거리 수를 먼저 고르게 하고(파티 안 짝마다 근접+원거리를 맞추기 위함),
 * 그다음 역할(탱커·서포터·딜러), 인원, 남툴 합이 낮은 파티 순으로 보내 균형을 맞춘다.
 */
export function splitParties(members: ComposeInput[], rules: Rules = SANCTUARY_RULES): Map<number, number> {
  const count = rules.partiesPerRound;
  const cap = Math.ceil(members.length / count);
  const parties = Array.from({ length: count }, () => ({ size: 0, power: 0, kinds: new Map<string, number>(), roles: new Map<string, number>() }));
  const result = new Map<number, number>();
  const sorted = [...members].sort(
    (a, b) =>
      ROLE_ORDER[CLASS_ROLES[a.class]] - ROLE_ORDER[CLASS_ROLES[b.class]] ||
      (b.combatPower ?? 0) - (a.combatPower ?? 0) ||
      a.id - b.id,
  );
  for (const m of sorted) {
    const role = CLASS_ROLES[m.class];
    const kind = slotKind(m.class);
    const target = parties
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => p.size < cap)
      .sort(
        (x, y) =>
          (x.p.kinds.get(kind) ?? 0) - (y.p.kinds.get(kind) ?? 0) ||
          (x.p.roles.get(role) ?? 0) - (y.p.roles.get(role) ?? 0) ||
          x.p.size - y.p.size || x.p.power - y.p.power || x.i - y.i,
      )[0];
    target.p.size++;
    target.p.power += m.combatPower ?? 0;
    target.p.kinds.set(kind, (target.p.kinds.get(kind) ?? 0) + 1);
    target.p.roles.set(role, (target.p.roles.get(role) ?? 0) + 1);
    result.set(m.id, target.i + 1);
  }
  return result;
}

/** 회차별 규칙 위반 경고 (수동 조정 후 표시용). round → 경고 문구 목록 */
export function validateRounds(
  assigned: (ComposeInput & { round: number | null; party?: number | null })[],
  rules: Rules = SANCTUARY_RULES,
): Map<number, string[]> {
  const warnings = new Map<number, string[]>();
  const byRound = new Map<number, typeof assigned>();
  for (const p of assigned) if (p.round !== null) byRound.set(p.round, [...(byRound.get(p.round) ?? []), p]);

  for (const [round, members] of byRound) {
    const list: string[] = [];
    if (members.length > rules.partySize) list.push(`정원 초과 (${members.length}/${rules.partySize})`);
    const perParty = Math.ceil(rules.partySize / rules.partiesPerRound);
    for (const [party, k] of countBy(members, (p) => p.party ?? null)) {
      if (party !== null && k > perParty) list.push(`${party}파티 정원 초과 (${k}/${perParty})`);
    }
    for (const [cls, k] of countBy(members, (p) => p.class)) {
      const limit = rules.classLimits[cls];
      if (limit !== undefined && k > limit) list.push(`${cls} ${k}명 (최대 ${limit})`);
    }
    const seen = new Map<number, string[]>();
    for (const p of members) seen.set(p.userId, [...(seen.get(p.userId) ?? []), p.name]);
    for (const names of seen.values()) {
      if (names.length > 1) list.push(`같은 사람의 캐릭터 중복: ${names.join(", ")}`);
    }
    if (list.length) warnings.set(round, list);
  }
  return warnings;
}

function countBy<T, K>(items: T[], key: (item: T) => K): Map<K, number> {
  const m = new Map<K, number>();
  for (const it of items) m.set(key(it), (m.get(key(it)) ?? 0) + 1);
  return m;
}
