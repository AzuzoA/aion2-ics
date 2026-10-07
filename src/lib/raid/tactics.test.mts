import { test } from "node:test";
import assert from "node:assert/strict";
import type { CharacterClass } from "../classes";
import { assignSlots, formatPhaseText, tacticsFor, type TacticMember } from "./tactics.ts";

let nextId = 1;
const m = (cls: CharacterClass, combatPower = 3000) => ({ id: nextId++, class: cls, combatPower, name: `${cls}${nextId}` });

test("자리: 치유 5번, 짝마다 근접(앞)+원거리(뒤)", () => {
  const ps = [m("궁성"), m("치유"), m("살성"), m("마도"), m("수호")];
  const slots = assignSlots(ps);
  const cls = (slot: number) => ps.find((p) => slots.get(p.id) === slot)?.class;
  assert.equal(cls(5), "치유");
  assert.ok(["살성", "수호"].includes(cls(1)!) && ["살성", "수호"].includes(cls(3)!));
  assert.ok(["궁성", "마도"].includes(cls(2)!) && ["궁성", "마도"].includes(cls(4)!));
});

test("자리: 근접만 있으면 빈자리를 앞 번호부터 채운다, 5명 넘으면 초과분은 자리 없음", () => {
  const ps = [m("살성"), m("권성"), m("검성"), m("호법"), m("수호"), m("살성")];
  const slots = assignSlots(ps);
  assert.deepEqual([...slots.values()].sort(), [1, 2, 3, 4, 5]);
  assert.equal(slots.size, 5);
});

const seat = (name: string, cls: CharacterClass, party: number, slot: number): TacticMember => ({ name, class: cls, party, slot });

test("무스펠 1넴: 짝 안 앞 번호 근접이 드리블, 근접 없으면 미정", () => {
  const ms = [
    seat("A", "살성", 1, 1),
    seat("B", "권성", 1, 2), // 둘 다 근접→앞 번호 A
    seat("C", "궁성", 1, 3),
    seat("D", "마도", 1, 4), // 근접 없음→미정
    seat("E", "궁성", 2, 1),
    seat("F", "호법", 2, 2), // 호법도 근접
  ];
  const [dribble, lights] = tacticsFor("muspel", ms);
  assert.deepEqual(
    dribble.duties.map((d) => [d.label, d.holder]),
    [
      ["3시→3시", "A"],
      ["9시→12시", null],
      ["12시→9시", "F"],
      ["6시→6시", null],
    ],
  );
  assert.deepEqual(lights.duties.slice(0, 4).map((d) => [d.label, d.holder]), [
    ["12시", "A"],
    ["11시", "B"],
    ["9시", "C"],
    ["7시", "D"],
  ]);
  assert.deepEqual(lights.duties.slice(4).map((d) => d.label), ["6시", "5시", "3시", "1시"]);
});

/** 단계 이름 → { 위치: 담당 } */
const byPhase = (phases: ReturnType<typeof tacticsFor>) =>
  Object.fromEntries(phases.map((p) => [p.phase, Object.fromEntries(p.duties.map((d) => [d.label, d.holder]))]));

test("비탄: 2-1/2-2 수정·쐐기 각각, 2-2는 쐐기만 반시계 이동, 짝이 안 맞으면 미정", () => {
  const ms = [
    seat("근1", "검성", 1, 1),
    seat("원1", "정령", 1, 2),
    seat("근2", "살성", 1, 3),
    seat("근3", "권성", 1, 4), // 원거리 없음→9시 쐐기 미정
    seat("근4", "수호", 2, 1),
    seat("원2", "궁성", 2, 2),
  ];
  const phases = tacticsFor("lament", ms);
  assert.deepEqual(
    phases.map((p) => p.phase),
    ["2-1 수정", "2-1 쐐기", "2-2 수정", "2-2 쐐기"],
  );
  const t = byPhase(phases);
  assert.deepEqual(t["2-1 수정"], { "12시": "근1", "9시": "근2", "6시": "근4", "3시": null });
  assert.deepEqual(t["2-1 쐐기"], { "12시": "원1", "9시": null, "6시": "원2", "3시": null });
  assert.deepEqual(t["2-2 수정"], t["2-1 수정"]);
  assert.deepEqual(t["2-2 쐐기"], { "11시": "원1", "7시": null, "5시": "원2", "1시": null });
  assert.equal(formatPhaseText(phases[1]), "쐐기 [1파티] 원1>12시/미정>9시 [2파티] 원2>6시/미정>3시");
});

test("루드라·침식은 정할 것 없음", () => {
  assert.deepEqual(tacticsFor("rudra", []), []);
  assert.deepEqual(tacticsFor("erosion", []), []);
});

test("공지 텍스트(단계별): [1파티] 이름>위치/… [2파티] …, 담당 없으면 미정", () => {
  const ms = [
    seat("땋", "살성", 1, 1),
    seat("닭닭", "궁성", 1, 2),
    seat("힐", "치유", 1, 5),
    seat("슥삭쇽", "검성", 2, 1),
  ];
  const [dribble, lights] = tacticsFor("muspel", ms).map(formatPhaseText);
  assert.equal(dribble, "드리블 [1파티] 땋>3시→3시/미정>9시→12시 [2파티] 슥삭쇽>12시→9시/미정>6시→6시");
  assert.equal(lights, "신호등 [1파티] 땋>12시/닭닭>11시/미정>9시/미정>7시 [2파티] 슥삭쇽>6시/미정>5시/미정>3시/미정>1시");
});

test("직접 입력(직업 모름): 짝에서 남은 역할을 맡고, 둘 다 비면 앞 번호 근접·뒤 번호 원거리", () => {
  const typed = (name: string, party: number, slot: number): TacticMember => ({ name, class: null, party, slot });
  const ms = [
    seat("근1", "검성", 1, 1),
    typed("용병A", 1, 2), // 짝에 근접 있음 → 쐐기
    typed("용병B", 1, 3),
    typed("용병C", 1, 4), // 둘 다 입력 → 3번 수정, 4번 쐐기
    seat("원1", "궁성", 2, 1),
    typed("용병D", 2, 2), // 앞 번호가 원거리 → 뒤 입력이 수정
  ];
  const t = byPhase(tacticsFor("lament", ms));
  assert.deepEqual(t["2-1 수정"], { "12시": "근1", "9시": "용병B", "6시": "용병D", "3시": null });
  assert.deepEqual(t["2-1 쐐기"], { "12시": "용병A", "9시": "용병C", "6시": "원1", "3시": null });
  assert.equal(t["2-2 쐐기"]["11시"], "용병A");
  assert.equal(t["2-2 쐐기"]["7시"], "용병C");
  // 무스펠: 근접 없는 짝은 입력한 사람이 드리블, 신호등은 자리 그대로
  const [dribble, lights] = tacticsFor("muspel", ms);
  assert.equal(dribble.duties[2].holder, "용병D");
  assert.equal(lights.duties[1].holder, "용병A");
});

test("직접 입력 + 근접/원거리 선택: 고른 대로 배정 (고르지 않으면 남은 역할)", () => {
  const typed = (name: string, party: number, slot: number, kind: "melee" | "ranged" | null): TacticMember => ({
    name,
    class: null,
    kind,
    party,
    slot,
  });
  const ms = [
    typed("원거리입력", 1, 1, "ranged"), // 앞 번호지만 원거리로 골랐음 → 쐐기
    typed("근접입력", 1, 2, "melee"), // 뒤 번호지만 근접 → 수정
    seat("궁", "궁성", 1, 3),
    typed("미선택", 1, 4, null), // 짝에 원거리 있음 → 수정
  ];
  const t = byPhase(tacticsFor("lament", ms));
  assert.equal(t["2-1 수정"]["12시"], "근접입력");
  assert.equal(t["2-1 쐐기"]["12시"], "원거리입력");
  assert.equal(t["2-1 수정"]["9시"], "미선택");
  assert.equal(t["2-1 쐐기"]["9시"], "궁");
  // 무스펠 드리블도 근접으로 고른 사람이 맡는다
  assert.equal(tacticsFor("muspel", ms)[0].duties[0].holder, "근접입력");
});
