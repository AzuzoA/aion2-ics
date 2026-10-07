// 성역 종류별 파티 안 자리(1~5번) 배치와 공략 배정 (순수 함수).
// 파티는 1·2번, 3·4번이 각각 짝이고 5번은 치유성 자리다.
import type { CharacterClass } from "../classes";

export type RaidType = "rudra" | "erosion" | "muspel" | "lament";

export const RAID_TYPES: { id: RaidType; name: string }[] = [
  { id: "rudra", name: "루드라" },
  { id: "erosion", name: "침식" },
  { id: "muspel", name: "무스펠" },
  { id: "lament", name: "비탄" },
];
export const raidTypeName = (t: RaidType) => RAID_TYPES.find((x) => x.id === t)?.name ?? t;
export const isRaidType = (v: unknown): v is RaidType => RAID_TYPES.some((x) => x.id === v);
/** 파티 안 자리·공략을 정하는 성역 (무스펠·비탄). 루드라·침식은 조합만 짠다. */
export const usesSlots = (t: RaidType) => t === "muspel" || t === "lament";

export const SLOTS_PER_PARTY = 5;
const HEALER_SLOT = 5;
/** 짝: [앞 번호, 뒤 번호] */
const PAIRS = [
  [1, 2],
  [3, 4],
] as const;

const MELEE: CharacterClass[] = ["살성", "권성", "검성", "호법", "수호"];
export type SlotKind = "healer" | "melee" | "ranged";
export function slotKind(cls: CharacterClass): SlotKind {
  if (cls === "치유") return "healer";
  return MELEE.includes(cls) ? "melee" : "ranged";
}

interface SlotInput {
  id: number;
  class: CharacterClass;
  combatPower: number | null;
}

/**
 * 한 파티 안 자리 배치. 반환: 참가 ID → 자리(1~5), 정원 초과분은 없음.
 * - 치유성은 5번
 * - 짝(1·2, 3·4)마다 근접 1명 + 원거리 1명 (근접이 앞 번호)
 *   → 무스펠 드리블(짝마다 근접 필요)과 비탄 수정·쐐기(짝마다 근접+원거리)를 함께 만족
 * - 모자라면 남은 사람으로 빈자리를 앞 번호부터 채운다
 */
export function assignSlots(members: SlotInput[]): Map<number, number> {
  const byPower = (a: SlotInput, b: SlotInput) => (b.combatPower ?? 0) - (a.combatPower ?? 0) || a.id - b.id;
  const pool = {
    healer: members.filter((m) => slotKind(m.class) === "healer").sort(byPower),
    melee: members.filter((m) => slotKind(m.class) === "melee").sort(byPower),
    ranged: members.filter((m) => slotKind(m.class) === "ranged").sort(byPower),
  };
  const result = new Map<number, number>();
  const put = (slot: number, m: SlotInput | undefined) => m && result.set(m.id, slot);

  put(HEALER_SLOT, pool.healer.shift());
  for (const [front, back] of PAIRS) {
    put(front, pool.melee.shift());
    put(back, pool.ranged.shift());
  }
  // 남은 사람 → 빈자리 (근접 남으면 원거리 자리로, 원거리 남으면 근접 자리로, 치유 둘이면 1~4번으로)
  const rest = [...pool.melee, ...pool.ranged, ...pool.healer];
  for (let slot = 1; slot <= SLOTS_PER_PARTY && rest.length; slot++) {
    if (![...result.values()].includes(slot)) put(slot, rest.shift());
  }
  return result;
}

// ---------- 공략 배정 ----------

export interface TacticMember {
  name: string;
  /** null = 빈자리에 이름만 직접 입력한 사람 (직업 모름) */
  class: CharacterClass | null;
  /** 직접 입력한 사람의 근접/원거리 (고르지 않았으면 없음 → 짝에서 남은 역할) */
  kind?: "melee" | "ranged" | null;
  party: number | null;
  slot: number | null;
}
export interface Duty {
  /** 담당 칸 식별자. 같은 사람이 맡는 칸(비탄 2-1·2-2 쐐기 등)은 같은 key → 직접 입력이 함께 적용된다 */
  key: string;
  party: number;
  label: string;
  holder: string | null; // null = 미정
}
export interface TacticPhase {
  phase: string;
  /** 공지 텍스트 맨 앞에 붙는 이름 (수정, 쐐기, 드리블, 신호등) */
  title: string;
  duties: Duty[];
}

const at = (ms: TacticMember[], party: number, slot: number) => ms.find((m) => m.party === party && m.slot === slot);
/**
 * 짝 안의 근접·원거리 담당.
 * 직업(또는 직접 입력 때 고른 근접/원거리)이 있는 사람이 먼저 (같은 종류가 둘이면 앞 번호).
 * 근접/원거리를 고르지 않은 입력은 남은 역할을 맡는다 (둘 다 남으면 앞 번호 = 근접, 뒤 번호 = 원거리).
 */
function pairRoles(ms: TacticMember[], party: number, pair: readonly [number, number]) {
  const seats = pair.map((s) => at(ms, party, s));
  const kindOf = (m: TacticMember | undefined) => (m?.class ? slotKind(m.class) : (m?.kind ?? null));
  const known = (kind: SlotKind) => seats.find((m) => kindOf(m) === kind)?.name ?? null;
  const roles: Record<"melee" | "ranged", string | null> = { melee: known("melee"), ranged: known("ranged") };
  seats.forEach((m, i) => {
    if (!m || kindOf(m)) return;
    const preference = i === 0 ? (["melee", "ranged"] as const) : (["ranged", "melee"] as const);
    const role = preference.find((r) => roles[r] === null);
    if (role) roles[role] = m.name;
  });
  return roles;
}

// 무스펠: 1넴 드리블 (파티, 짝, 방향), 2넴 신호등 (파티별 1~4번 위치)
const MUSPEL_DRIBBLE = [
  { party: 1, pair: PAIRS[0], label: "3시→3시" },
  { party: 1, pair: PAIRS[1], label: "9시→12시" },
  { party: 2, pair: PAIRS[0], label: "12시→9시" },
  { party: 2, pair: PAIRS[1], label: "6시→6시" },
];
const MUSPEL_LIGHTS: Record<number, number[]> = { 1: [12, 11, 9, 7], 2: [6, 5, 3, 1] };

// 비탄 2넴: 짝별 시각. 2-2에서 쐐기만 반시계로 이동
const LAMENT_PAIRS = [
  { party: 1, pair: PAIRS[0], hour: 12 },
  { party: 1, pair: PAIRS[1], hour: 9 },
  { party: 2, pair: PAIRS[0], hour: 6 },
  { party: 2, pair: PAIRS[1], hour: 3 },
];
const LAMENT_WEDGE_SHIFT: Record<number, number> = { 12: 11, 9: 7, 6: 5, 3: 1 };

/** 한 회차(공대) 인원의 공략 배정. 정할 게 없는 성역은 빈 배열. */
export function tacticsFor(type: RaidType, ms: TacticMember[]): TacticPhase[] {
  if (type === "muspel") {
    return [
      {
        phase: "1넴 드리블",
        title: "드리블",
        duties: MUSPEL_DRIBBLE.map((d, i) => ({
          key: `dribble-${i}`,
          party: d.party,
          label: d.label,
          holder: pairRoles(ms, d.party, d.pair).melee,
        })),
      },
      {
        phase: "2넴 신호등",
        title: "신호등",
        duties: [1, 2].flatMap((party) =>
          MUSPEL_LIGHTS[party].map((hour, i) => ({
            key: `light-${party}-${i + 1}`,
            party,
            label: `${hour}시`,
            holder: at(ms, party, i + 1)?.name ?? null,
          })),
        ),
      },
    ];
  }
  if (type === "lament") {
    const pairs = LAMENT_PAIRS.map((p, i) => ({
      ...p,
      i,
      crystal: pairRoles(ms, p.party, p.pair).melee,
      wedge: pairRoles(ms, p.party, p.pair).ranged,
    }));
    // 수정·쐐기를 따로 공지하므로 단계를 나눈다. 2-2에서 수정은 그대로, 쐐기만 이동
    const crystal = (phase: string) => ({
      phase,
      title: "수정",
      duties: pairs.map((p) => ({ key: `crystal-${p.i}`, party: p.party, label: `${p.hour}시`, holder: p.crystal })),
    });
    const wedge = (phase: string, hour: (h: number) => number) => ({
      phase,
      title: "쐐기",
      duties: pairs.map((p) => ({ key: `wedge-${p.i}`, party: p.party, label: `${hour(p.hour)}시`, holder: p.wedge })),
    });
    return [
      crystal("2-1 수정"),
      wedge("2-1 쐐기", (h) => h),
      crystal("2-2 수정"),
      wedge("2-2 쐐기", (h) => LAMENT_WEDGE_SHIFT[h]),
    ];
  }
  return [];
}

/**
 * 한 단계(2-1, 2-2 등)의 공지 텍스트. 디스코드 등에 바로 붙여넣는다:
 * "쐐기 [1파티] 땋>12시/닭닭>9시 [2파티] 슥삭쇽>6시/..."  (맨 앞에 무엇인지, 담당 없으면 "미정>…")
 */
export function formatPhaseText(phase: TacticPhase): string {
  const parties = [...new Set(phase.duties.map((d) => d.party))].sort((a, b) => a - b);
  const body = parties
    .map((party) => {
      const items = phase.duties.filter((d) => d.party === party).map((d) => `${d.holder ?? "미정"}>${d.label}`);
      return `[${party}파티] ${items.join("/")}`;
    })
    .join(" ");
  return `${phase.title} ${body}`;
}
