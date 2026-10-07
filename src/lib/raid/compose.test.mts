import { test } from "node:test";
import assert from "node:assert/strict";
import type { CharacterClass } from "../classes";
import { compose, minRounds, SANCTUARY_RULES, splitParties, validateRounds, type ComposeInput } from "./compose.ts";

const DEALERS: CharacterClass[] = ["궁성", "마도", "정령", "살성", "권성"];

let nextId = 1;
function char(userId: number, cls: CharacterClass, combatPower = 3000, accountId = userId * 100): ComposeInput {
  const id = nextId++;
  return { id, userId, accountId, name: `u${userId}-${id}`, class: cls, combatPower };
}
/** userId마다 딜러 k개 */
function users(counts: number[], startUser = 1): ComposeInput[] {
  return counts.flatMap((k, i) => Array.from({ length: k }, (_, j) => char(startUser + i, DEALERS[j % DEALERS.length])));
}

/** 모든 제한 조건 검사 + 결과 반환 */
function composeChecked(ps: ComposeInput[]) {
  const result = compose(ps);
  // 모든 참가자가 정확히 한 번 배치
  assert.equal(result.size, ps.length);
  for (const p of ps) assert.ok(result.get(p.id)! >= 1, `${p.name} 미배치`);
  // 회차별 제한 조건
  const assigned = ps.map((p) => ({ ...p, round: result.get(p.id)! }));
  assert.deepEqual([...validateRounds(assigned)], [], "규칙 위반");
  const rounds = new Map<number, ComposeInput[]>();
  for (const p of assigned) rounds.set(p.round, [...(rounds.get(p.round) ?? []), p]);
  // 회차 번호는 1..R 빈틈 없이
  const roundNumbers = [...rounds.keys()].sort((a, b) => a - b);
  assert.deepEqual(roundNumbers, roundNumbers.map((_, i) => i + 1));
  return { result, rounds, assigned };
}

test("빈 참가자", () => {
  assert.equal(compose([]).size, 0);
});

test("10명 이하 → 1회차", () => {
  const { rounds } = composeChecked(users([1, 1, 1, 1, 1, 1, 1, 1, 1, 1]));
  assert.equal(rounds.size, 1);
});

test("인원은 고르게 나눈다 (23명 → 8/8/7)", () => {
  const { rounds } = composeChecked(users(Array(23).fill(1)));
  assert.equal(rounds.size, 3);
  assert.deepEqual([...rounds.values()].map((r) => r.length).sort(), [7, 8, 8]);
});

test("단판 13명 → 7/6", () => {
  const { rounds } = composeChecked(users(Array(13).fill(1)));
  assert.deepEqual([...rounds.values()].map((r) => r.length).sort(), [6, 7]);
});

test("같은 유저는 회차당 1캐릭, 회차 수 ≥ 최다 캐릭 수", () => {
  const ps = users([4, 1, 1, 2]);
  const { rounds } = composeChecked(ps);
  assert.equal(rounds.size, 4);
});

test("직업 제한: 수호 3명 → 최소 3회차, 치유 5명 → 최소 3회차", () => {
  const tanks = [char(1, "수호"), char(2, "수호"), char(3, "수호")];
  assert.equal(minRounds(tanks), 3);
  composeChecked(tanks);
  const healers = Array.from({ length: 5 }, (_, i) => char(10 + i, "치유"));
  assert.equal(minRounds(healers), 3);
  composeChecked(healers);
});

test("호법·치유 각 최대 2, 수호 최대 1이 섞여도 지킨다", () => {
  const ps = [
    ...Array.from({ length: 3 }, (_, i) => char(i + 1, "수호")),
    ...Array.from({ length: 5 }, (_, i) => char(i + 10, "치유")),
    ...Array.from({ length: 5 }, (_, i) => char(i + 20, "호법")),
    ...users(Array(15).fill(1), 30),
  ];
  composeChecked(ps);
});

test("캐릭 적은 유저가 먼저 채워져도 캐릭 많은 유저가 막히지 않는다", () => {
  // 1캐릭 유저 18명 + 3캐릭 유저 2명 = 24 → 3회차. 1캐릭 유저가 앞 회차를 꽉 채우면 3캐릭 유저가 실패하는 전형적 케이스
  const ps = [...users(Array(18).fill(1)), ...users([3, 3], 100)];
  const { rounds, result } = composeChecked(ps);
  assert.equal(rounds.size, 3);
  for (const p of ps.filter((p) => p.userId >= 100)) assert.ok(result.get(p.id)! <= 3);
});

test("우선순위 1: 캐릭 수가 적은 유저일수록 평균적으로 더 일찍 끝난다", () => {
  // 1캐릭 6명, 2캐릭 3명, 3캐릭 2명 = 18캐릭 → 3회차 (6/6/6)
  const ps = [...users(Array(6).fill(1)), ...users([2, 2, 2], 50), ...users([3, 3], 80)];
  const { assigned } = composeChecked(ps);
  const lastRound = (userId: number) => Math.max(...assigned.filter((p) => p.userId === userId).map((p) => p.round));
  const avgLast = (from: number, to: number) => {
    const ids = [...new Set(ps.filter((p) => p.userId >= from && p.userId < to).map((p) => p.userId))];
    return ids.reduce((s, u) => s + lastRound(u), 0) / ids.length;
  };
  const [one, two, three] = [avgLast(0, 50), avgLast(50, 80), avgLast(80, 999)];
  assert.ok(one < two && two <= three, `평균 마지막 회차: 1캐릭 ${one}, 2캐릭 ${two}, 3캐릭 ${three}`);
  assert.equal(avgLast(0, 50) <= 1.5, true, `1캐릭 유저 평균 마지막 회차 ${one}`);
});

test("인원 균등이 우선: 3캐릭 유저가 매 회차를 차지하면 1캐릭 유저도 나뉜다 (10/4/4 대신 6/6/6)", () => {
  const ps = [...users(Array(6).fill(1)), ...users([3, 3, 3, 3], 50)];
  const { rounds } = composeChecked(ps);
  assert.deepEqual([...rounds.values()].map((r) => r.length), [6, 6, 6]);
});

test("우선순위 2: 같은 계정 캐릭터는 연속으로 묶인다", () => {
  // 유저 1: 계정 A 2캐릭, 계정 B 2캐릭 (입력 순서는 섞어서)
  const ps = [
    char(1, "궁성", 3000, 1),
    char(1, "마도", 3000, 2),
    char(1, "정령", 3000, 1),
    char(1, "살성", 3000, 2),
    ...users(Array(8).fill(1), 10),
  ];
  const { assigned } = composeChecked(ps);
  const order = assigned
    .filter((p) => p.userId === 1)
    .sort((a, b) => a.round - b.round)
    .map((p) => p.accountId);
  const switches = order.filter((a, i) => i > 0 && a !== order[i - 1]).length;
  assert.equal(switches, 1, `계정 전환은 1번이어야 함: ${order}`);
});

test("우선순위 3: 남툴 평균이 회차끼리 고르게", () => {
  // 20명, 남툴 1000~20000 → 2회차. 정렬된 순서로 넣어도 평균 차이가 작아야 함
  const ps = Array.from({ length: 20 }, (_, i) => char(i + 1, DEALERS[0], (i + 1) * 1000));
  const { rounds } = composeChecked(ps);
  const avgs = [...rounds.values()].map((r) => r.reduce((s, p) => s + (p.combatPower ?? 0), 0) / r.length);
  assert.ok(Math.abs(avgs[0] - avgs[1]) <= 1000, `평균 차이 ${avgs}`);
});

test("남툴 null은 0으로 취급하고 배치된다", () => {
  composeChecked([char(1, "궁성", 0), { ...char(2, "마도"), combatPower: null }]);
});

test("validateRounds: 수동 배치 규칙 위반을 잡는다", () => {
  const a = char(1, "수호");
  const b = char(1, "수호");
  const w = validateRounds([
    { ...a, round: 1 },
    { ...b, round: 1 },
    ...users(Array(9).fill(1), 10).map((p) => ({ ...p, round: 1 })),
  ]);
  const msgs = w.get(1)!.join(" / ");
  assert.match(msgs, /정원 초과 \(11\/10\)/);
  assert.match(msgs, /수호 2명 \(최대 1\)/);
  assert.match(msgs, /같은 사람/);
});

test("규모 테스트: 무작위 60캐릭도 규칙을 지킨다", () => {
  let seed = 42;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const classes = Object.keys({ 수호: 1, 검성: 1, 궁성: 1, 마도: 1, 정령: 1, 살성: 1, 권성: 1, 호법: 1, 치유: 1 }) as CharacterClass[];
  for (let trial = 0; trial < 20; trial++) {
    const ps: ComposeInput[] = [];
    for (let u = 1; ps.length < 60; u++) {
      const k = 1 + Math.floor(rand() * 4);
      for (let j = 0; j < k; j++) ps.push(char(u, classes[Math.floor(rand() * classes.length)], Math.floor(rand() * 5000), u * 10 + (j % 2)));
    }
    const { rounds } = composeChecked(ps);
    for (const r of rounds.values()) assert.ok(r.length <= SANCTUARY_RULES.partySize);
  }
});

test("파티 나누기: 10명 → 5/5, 치유·호법·탱커가 파티마다 고르게", () => {
  const ps = [
    char(1, "치유", 3000),
    char(2, "치유", 3100),
    char(3, "호법", 2900),
    char(4, "호법", 2800),
    char(5, "수호", 3300),
    char(6, "검성", 3200),
    ...users([1, 1, 1, 1], 10),
  ];
  const parties = splitParties(ps);
  assert.equal(parties.size, 10);
  const of = (party: number) => ps.filter((p) => parties.get(p.id) === party);
  assert.equal(of(1).length, 5);
  assert.equal(of(2).length, 5);
  for (const party of [1, 2]) {
    assert.equal(of(party).filter((p) => p.class === "치유").length, 1, `${party}파티 치유 1명`);
    assert.equal(of(party).filter((p) => p.class === "호법").length, 1, `${party}파티 호법 1명`);
    assert.equal(of(party).filter((p) => p.class === "수호" || p.class === "검성").length, 1, `${party}파티 탱커 1명`);
  }
});

test("파티 나누기: 7명 → 4/3, 남툴 합이 고르게", () => {
  const ps = Array.from({ length: 7 }, (_, i) => char(i + 1, DEALERS[0], (i + 1) * 1000));
  const parties = splitParties(ps);
  const sums = [1, 2].map((party) => ps.filter((p) => parties.get(p.id) === party).reduce((s, p) => s + (p.combatPower ?? 0), 0));
  const sizes = [1, 2].map((party) => ps.filter((p) => parties.get(p.id) === party).length);
  assert.deepEqual(sizes.sort(), [3, 4]);
  assert.ok(Math.abs(sums[0] - sums[1]) <= 7000, `남툴 합 ${sums}`);
});

test("validateRounds: 파티 정원(5) 초과 경고", () => {
  const ps = users(Array(6).fill(1)).map((p) => ({ ...p, round: 1, party: 1 }));
  assert.match(validateRounds(ps).get(1)!.join(), /1파티 정원 초과 \(6\/5\)/);
});
