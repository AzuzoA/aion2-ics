"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CLASSES, type CharacterClass } from "@/lib/classes";
import { roundUnit, SANCTUARY_RULES, splitParties, validateRounds } from "@/lib/raid/compose";
import {
  assignSlots,
  formatPhaseText,
  RAID_TYPES,
  raidTypeName,
  SLOTS_PER_PARTY,
  tacticsFor,
  usesSlots,
  type RaidType,
  type TacticPhase,
} from "@/lib/raid/tactics";
import { ModeBadge, TypeBadge, type RaidSummary } from "./RaidList";
import { api, btnCls, CharacterSummary, ErrorBanner, formatK, formatRaidDate, inputCls, type Member } from "./shared";

interface Participant {
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
interface RaidDetail extends RaidSummary {
  participants: Participant[];
  slotNotes: { round: number; party: number; slot: number; text: string; kind: NoteKind | null }[];
}

type Mutate = (method: string, url: string, body?: unknown) => Promise<boolean>;
type NoteKind = "melee" | "ranged";

/** 직업 → 남툴 높은 순 → 이름 (목록 정렬 규칙과 동일) */
const byClassThenPower = (a: Participant, b: Participant) =>
  CLASSES.indexOf(a.class) - CLASSES.indexOf(b.class) ||
  (b.combatPower ?? -1) - (a.combatPower ?? -1) ||
  a.name.localeCompare(b.name, "ko");

export default function RaidRoom({ raidId, currentUserId }: { raidId: number; currentUserId: number }) {
  const router = useRouter();
  const [raid, setRaid] = useState<RaidDetail | null>(null);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const captureRef = useRef<HTMLDivElement>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const showNotice = useCallback((msg: string) => {
    setNotice(msg);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 2500);
  }, []);

  const reload = useCallback(async () => {
    try {
      setRaid((await api<{ raid: RaidDetail }>("GET", `/api/raids/${raidId}`)).raid);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [raidId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 최초 로드
    reload();
    api<{ members: Member[] }>("GET", "/api/members")
      .then((d) => setMembers(d.members))
      .catch((e: Error) => setError(e.message));
  }, [reload]);

  const mutate: Mutate = useCallback(
    async (method, url, body) => {
      setError(null);
      try {
        await api(method, url, body);
        await reload();
        return true;
      } catch (e) {
        setError((e as Error).message);
        return false;
      }
    },
    [reload],
  );

  if (!raid) return <p className="text-zinc-500">{error ?? "불러오는 중…"}</p>;

  const unit = roundUnit(raid.mode);
  const roundCount = Math.max(0, ...raid.participants.map((p) => p.round ?? 0));
  const hasRounds = roundCount > 0;
  const fileName = `${raid.title}_${raid.raidDate.replace(/[:T]/g, "-")}.png`;

  /** 조합 영역을 PNG로 캡쳐해 클립보드에 복사하거나 파일로 저장 */
  async function capture(action: "copy" | "save") {
    const node = captureRef.current;
    if (!node) return;
    setCapturing(true); // 캡쳐용 제목 표시
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    try {
      const { toBlob } = await import("html-to-image");
      const blob = await toBlob(node, {
        pixelRatio: 2,
        backgroundColor: getComputedStyle(document.body).backgroundColor,
        filter: (n) => !(n instanceof HTMLElement && n.dataset.captureSkip !== undefined),
      });
      if (!blob) throw new Error("캡쳐에 실패했습니다.");
      if (action === "copy") {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        showNotice("조합 이미지를 복사했습니다. 디스코드 등에 붙여넣으세요.");
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(a.href);
        showNotice("조합 이미지를 저장했습니다.");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCapturing(false);
    }
  }

  async function runCompose() {
    if (hasRounds && !confirm("현재 조합(수동 조정 포함)을 지우고 다시 자동으로 짤까요?")) return;
    await mutate("POST", `/api/raids/${raidId}/compose`);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ---------- 방 정보 ---------- */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <TypeBadge type={raid.raidType} />
            <ModeBadge mode={raid.mode} />
            <h1 className="text-xl font-bold">{raid.title}</h1>
            <select
              aria-label="성역 종류 변경"
              title="성역 종류 변경 (조합은 그대로, 자리 공략만 바뀜)"
              className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs dark:bg-zinc-800"
              value={raid.raidType}
              onChange={(e) => mutate("PATCH", `/api/raids/${raidId}`, { raidType: e.target.value as RaidType })}
            >
              {RAID_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <p className="text-sm text-zinc-500">
            {formatRaidDate(raid.raidDate)} · 참가 {raid.participants.length}캐릭 · {unit}당 정원 {raid.partySize}명 · 수호 최대 1 ·
            치유 최대 2 · 호법 최대 2 · 개설 {raid.createdBy ?? "-"}
          </p>
        </div>
        <div className="flex gap-2">
          {hasRounds && (
            <>
              <button className={btnCls} disabled={capturing} onClick={() => capture("copy")} title="조합 화면을 이미지로 클립보드에 복사">
                캡쳐 복사
              </button>
              <button className={btnCls} disabled={capturing} onClick={() => capture("save")} title="조합 화면을 PNG 파일로 저장">
                캡쳐 저장
              </button>
            </>
          )}
          <button
            className="rounded bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-40"
            disabled={raid.participants.length === 0}
            onClick={runCompose}
          >
            {hasRounds ? "조합 다시 짜기" : "자동 조합 생성"}
          </button>
          <button
            className={`${btnCls} text-red-600`}
            onClick={async () => {
              if (!confirm(`"${raid.title}" 방을 삭제할까요?`)) return;
              if (await mutate("DELETE", `/api/raids/${raidId}`)) router.push("/raids");
            }}
          >
            방 삭제
          </button>
        </div>
      </div>

      <ErrorBanner message={error} />
      {notice && (
        <div className="fixed right-6 bottom-6 z-10 rounded-md bg-zinc-900 px-4 py-2 text-sm text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-900">
          {notice}
        </div>
      )}

      <div className="grid grid-cols-[1fr_380px] items-start gap-10">
        <div ref={captureRef} className="flex min-w-0 flex-col gap-3">
          {capturing && (
            <p className="text-lg font-bold">
              [{raidTypeName(raid.raidType)}] {raid.title} · {formatRaidDate(raid.raidDate)}
            </p>
          )}
          <Composition raid={raid} roundCount={roundCount} mutate={mutate} onCopied={showNotice} />
        </div>
        <ParticipantPicker raid={raid} members={members} currentUserId={currentUserId} mutate={mutate} />
      </div>
    </div>
  );
}

// ---------- 조합 ----------

const PARTIES = Array.from({ length: SANCTUARY_RULES.partiesPerRound }, (_, i) => i + 1);
const PARTY_SIZE = Math.ceil(SANCTUARY_RULES.partySize / SANCTUARY_RULES.partiesPerRound);
const SLOT_NUMBERS = Array.from({ length: SLOTS_PER_PARTY }, (_, i) => i + 1);

const avgPower = (ps: Participant[]) =>
  ps.length ? formatK(Math.round(ps.reduce((s, p) => s + (p.combatPower ?? 0), 0) / ps.length)) : "-";

/**
 * 한 회차 인원의 파티·자리. 저장된 값을 쓰고, 파티/자리가 없는 예전 데이터는 화면에서만 채운다
 * ('조합 다시 짜기'를 누르면 저장됨).
 */
function seat(members: Participant[]): { p: Participant; party: number; slot: number | null }[] {
  const parties = members.some((p) => p.party === null) ? splitParties(members) : null;
  const withParty = members.map((p) => ({ p, party: p.party ?? parties?.get(p.id) ?? 1 }));
  return PARTIES.flatMap((party) => {
    const inParty = withParty.filter((x) => x.party === party);
    const slots = inParty.some((x) => x.p.slot === null) ? assignSlots(inParty.map((x) => x.p)) : null;
    return inParty.map((x) => ({ ...x, slot: slots ? (slots.get(x.p.id) ?? null) : x.p.slot }));
  });
}

/** 빈자리 이름 입력. 포커스를 잃거나 Enter를 누르면 저장 */
function NoteInput({ initial, onSave }: { initial: string; onSave: (text: string) => void }) {
  const [text, setText] = useState(initial);
  const commit = () => text.trim() !== initial && onSave(text.trim());
  return (
    <input
      className={`w-40 rounded border px-2 py-0.5 text-sm placeholder:text-amber-500 ${
        initial
          ? "border-zinc-300 bg-white font-medium dark:border-zinc-700 dark:bg-zinc-950"
          : "border-dashed border-amber-300 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20"
      }`}
      placeholder="미정"
      maxLength={20}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
    />
  );
}

/** 공지 복사: 단계(2-1, 2-2 / 1넴 드리블, 2넴 신호등) 버튼을 누르면 그 단계 공지 텍스트가 복사된다 */
function PhaseCopyButtons({ phases, onCopied }: { phases: TacticPhase[]; onCopied: (msg: string) => void }) {
  return (
    <div data-capture-skip className="flex items-center gap-2 border-t border-zinc-200 px-4 py-2.5 dark:border-zinc-800">
      <span className="text-sm text-zinc-500">공지 복사</span>
      {phases.map((ph) => (
        <button
          key={ph.phase}
          className="rounded border border-amber-400 bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-900/50"
          title={formatPhaseText(ph)}
          onClick={async () => {
            await navigator.clipboard.writeText(formatPhaseText(ph));
            onCopied(`${ph.phase} 공지를 복사했습니다.`);
          }}
        >
          {ph.phase}
        </button>
      ))}
    </div>
  );
}

type DropTarget = { round: number | null; party?: number; slot?: number };
type DragMove = ReturnType<typeof useDragMove>;

/**
 * 드래그 앤 드롭으로 옮기기 (HTML5 기본 DnD).
 * - 캐릭터 위에 놓기: 두 사람의 회차·파티·자리 맞바꿈
 * - 파티 빈 곳 / 새 회차 / 대기에 놓기: 그곳으로 이동
 */
function useDragMove(raid: RaidDetail, mutate: Mutate) {
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const url = (id: number) => `/api/raids/${raid.id}/participants/${id}`;
  const end = () => {
    setDragging(null);
    setOver(null);
  };
  const dragged = (e: React.DragEvent) => Number(e.dataTransfer.getData("text/plain")) || dragging;

  return {
    dragging,
    isOver: (id: string) => dragging !== null && over === id,
    /** 끌 수 있는 캐릭터. 다른 캐릭터를 위에 놓으면 맞바꾼다. */
    item: (id: number) => ({
      draggable: true,
      onDragStart: (e: React.DragEvent) => {
        e.dataTransfer.setData("text/plain", String(id));
        e.dataTransfer.effectAllowed = "move";
        setDragging(id);
      },
      onDragEnd: end,
      onDragOver: (e: React.DragEvent) => {
        if (dragging === null || dragging === id) return;
        e.preventDefault();
        e.stopPropagation();
        setOver(`p:${id}`);
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const from = dragged(e);
        end();
        if (from && from !== id) mutate("PATCH", url(from), { swapWith: id });
      },
    }),
    /** 놓을 수 있는 영역 (파티, 새 회차, 대기) */
    zone: (zoneId: string, target: DropTarget) => ({
      onDragOver: (e: React.DragEvent) => {
        if (dragging === null) return;
        e.preventDefault();
        setOver(zoneId);
      },
      onDragLeave: (e: React.DragEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver((cur) => (cur === zoneId ? null : cur));
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        const from = dragged(e);
        end();
        if (!from) return;
        const p = raid.participants.find((x) => x.id === from);
        const same = (k: "party" | "slot") => target[k] === undefined || p?.[k] === target[k];
        if (p && p.round === target.round && same("party") && same("slot")) return; // 제자리
        mutate("PATCH", url(from), target);
      },
    }),
  };
}

/** 회차(공대)마다 한 줄: 왼쪽 1파티, 오른쪽 2파티. 다음 회차는 아래로. */
function Composition({
  raid,
  roundCount,
  mutate,
  onCopied,
}: {
  raid: RaidDetail;
  roundCount: number;
  mutate: Mutate;
  onCopied: (msg: string) => void;
}) {
  const unit = roundUnit(raid.mode);
  // 자리·공략(드리블, 신호등 등)은 단판 무스펠·비탄에서만. 다회차는 조합만 (캡쳐로 공유)
  const showSlots = raid.mode === "single" && usesSlots(raid.raidType);
  const dnd = useDragMove(raid, mutate);
  const warnings = useMemo(() => validateRounds(raid.participants), [raid.participants]);
  const waiting = raid.participants.filter((p) => p.round === null).sort(byClassThenPower);

  if (raid.participants.length === 0) {
    return (
      <p className="rounded-lg border-2 border-dashed border-zinc-200 p-8 text-center text-sm text-zinc-400 dark:border-zinc-800">
        오른쪽에서 참가할 캐릭터를 추가하세요.
      </p>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {Array.from({ length: roundCount }, (_, i) => i + 1).map((round) => {
        const seated = seat(raid.participants.filter((p) => p.round === round));
        const members = seated.map((x) => x.p);
        const w = warnings.get(round);
        // 캐릭터가 없는 자리에 직접 입력한 이름 (캐릭터가 앉으면 캐릭터가 우선)
        const occupied = new Set(seated.map((x) => `${x.party}-${x.slot}`));
        const notes = raid.slotNotes.filter((n) => n.round === round && !occupied.has(`${n.party}-${n.slot}`));
        const noteAt = (party: number, slot: number) => notes.find((n) => n.party === party && n.slot === slot);
        const tactics = showSlots
          ? tacticsFor(raid.raidType, [
              ...seated.map((x) => ({ name: x.p.name, class: x.p.class, party: x.party, slot: x.slot })),
              ...notes.map((n) => ({ name: n.text, class: null, kind: n.kind, party: n.party, slot: n.slot })),
            ])
          : [];
        const row = (p: Participant, party: number, slot: number | null) => (
          <ParticipantRow
            key={p.id}
            p={p}
            party={party}
            slot={slot}
            showSlot={showSlots}
            raid={raid}
            roundCount={roundCount}
            mutate={mutate}
            dnd={dnd}
          />
        );
        return (
          <section
            key={round}
            className={`flex flex-col rounded-lg border ${w ? "border-red-300 dark:border-red-800" : "border-zinc-200 dark:border-zinc-800"}`}
          >
            <header className="flex items-center gap-3 border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
              <span className="text-lg font-bold">
                {round}
                {unit}
              </span>
              <span className="text-sm text-zinc-500">
                {members.length}/{raid.partySize}명 · 평균 남툴 {avgPower(members)}
              </span>
            </header>
            {w && (
              <ul className="border-b border-red-200 bg-red-50 px-4 py-1.5 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
                {w.map((msg) => (
                  <li key={msg}>⚠ {msg}</li>
                ))}
              </ul>
            )}
            <div className="grid grid-cols-2 divide-x divide-zinc-200 dark:divide-zinc-800">
              {PARTIES.map((party) => {
                const ps = seated
                  .filter((x) => x.party === party)
                  .sort((a, b) => (showSlots ? (a.slot ?? 99) - (b.slot ?? 99) : 0) || byClassThenPower(a.p, b.p));
                return (
                  <div
                    key={party}
                    className={`flex flex-col transition-colors ${dnd.isOver(`party:${round}-${party}`) ? "bg-amber-50 dark:bg-amber-950/30" : ""}`}
                    {...dnd.zone(`party:${round}-${party}`, { round, party })}
                  >
                    <div className="flex items-center justify-between bg-zinc-50 px-4 py-1.5 text-sm dark:bg-zinc-900">
                      <span className="font-semibold">{party}파티</span>
                      <span className={ps.length > PARTY_SIZE ? "text-red-600" : "text-zinc-500"}>
                        {ps.length}/{PARTY_SIZE}명 · 평균 {avgPower(ps.map((x) => x.p))}
                      </span>
                    </div>
                    <ul className="flex flex-col divide-y divide-zinc-100 dark:divide-zinc-900">
                      {!showSlots && ps.length === 0 && <li className="px-4 py-2 text-sm text-zinc-400">비어 있음</li>}
                      {showSlots
                        ? [
                            ...SLOT_NUMBERS.map((slot) => {
                              const x = ps.find((y) => y.slot === slot);
                              if (x) return row(x.p, party, x.slot);
                              return (
                                <EmptySlotRow
                                  key={`empty-${slot}`}
                                  note={noteAt(party, slot)?.text ?? ""}
                                  kind={noteAt(party, slot)?.kind ?? null}
                                  at={{ round, party, slot }}
                                  dnd={dnd}
                                  onSave={(text, kind) =>
                                    mutate("PUT", `/api/raids/${raid.id}/slot-notes`, { round, party, slot, text, kind })
                                  }
                                />
                              );
                            }),
                            // 정원 초과 등 자리 밖 인원
                            ...ps.filter((x) => x.slot === null || x.slot > SLOTS_PER_PARTY).map((x) => row(x.p, party, x.slot)),
                          ]
                        : ps.map((x) => row(x.p, party, null))}
                    </ul>
                  </div>
                );
              })}
            </div>
            {tactics.length > 0 && <PhaseCopyButtons phases={tactics} onCopied={onCopied} />}
          </section>
        );
      })}

      {dnd.dragging && (
        <div
          data-capture-skip
          className={`rounded-lg border-2 border-dashed px-4 py-3 text-center text-sm ${
            dnd.isOver("new") ? "border-amber-400 bg-amber-50 dark:bg-amber-950/30" : "border-zinc-300 text-zinc-500 dark:border-zinc-700"
          }`}
          {...dnd.zone("new", { round: roundCount + 1 })}
        >
          여기에 놓으면 새 {unit}로
        </div>
      )}

      {(waiting.length > 0 || dnd.dragging) && (
        <section
          data-capture-skip
          className={`flex flex-col rounded-lg border border-dashed ${
            dnd.isOver("waiting") ? "border-amber-400 bg-amber-50 dark:bg-amber-950/30" : "border-zinc-300 dark:border-zinc-700"
          }`}
          {...dnd.zone("waiting", { round: null })}
        >
          <header className="flex items-center gap-3 border-b border-dashed border-zinc-300 px-4 py-2 dark:border-zinc-700">
            <span className="text-lg font-bold">대기</span>
            <span className="text-sm text-zinc-500">
              {dnd.dragging
                ? "여기에 놓으면 대기로"
                : `${waiting.length}캐릭 · ${roundCount > 0 ? `${unit}·파티를 고르거나 조합을 다시 짜세요` : "'자동 조합 생성'을 누르세요"}`}
            </span>
          </header>
          <ul className="grid grid-cols-2 divide-zinc-100 dark:divide-zinc-900">
            {waiting.map((p) => (
              <ParticipantRow
                key={p.id}
                p={p}
                party={null}
                slot={null}
                showSlot={false}
                raid={raid}
                roundCount={roundCount}
                mutate={mutate}
                dnd={dnd}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** 빈자리: 이름 직접 입력 (참가 캐릭터가 아닌 사람). 캐릭터를 끌어다 놓으면 그 자리로 이동 */
function EmptySlotRow({
  note,
  kind,
  at,
  dnd,
  onSave,
}: {
  note: string;
  kind: NoteKind | null;
  at: { round: number; party: number; slot: number };
  dnd: DragMove;
  onSave: (text: string, kind: NoteKind | null) => void;
}) {
  const healerSlot = at.slot === SLOTS_PER_PARTY;
  const zone = `slot:${at.round}-${at.party}-${at.slot}`;
  return (
    <li
      className={`flex items-center gap-2 px-4 py-1.5 ${
        dnd.isOver(zone) ? "bg-amber-100 ring-2 ring-amber-400 ring-inset dark:bg-amber-900/40" : ""
      }`}
      {...dnd.zone(zone, at)}
    >
      <span className="w-9 text-center text-xs font-bold text-zinc-400">{at.slot}</span>
      {/* 저장된 값이 바뀌면 새로 그린다 */}
      <NoteInput key={note} initial={note} onSave={(text) => onSave(text, kind)} />
      {healerSlot ? (
        <span className="text-xs text-zinc-400">치유 자리</span>
      ) : (
        // 근접/원거리: 공략(수정·쐐기, 드리블) 자동 배정에 사용. 이름을 입력해야 고를 수 있다
        <span className={`flex items-center gap-2 text-xs ${note ? "" : "opacity-40"}`} title="공략 자동 배정에 사용">
          {(["melee", "ranged"] as const).map((k) => (
            <label key={k} className="flex cursor-pointer items-center gap-1">
              <input
                type="radio"
                name={`kind-${at.round}-${at.party}-${at.slot}`}
                checked={kind === k}
                disabled={!note}
                onChange={() => onSave(note, k)}
              />
              {k === "melee" ? "근접" : "원거리"}
            </label>
          ))}
        </span>
      )}
    </li>
  );
}

/** 캐릭터 한 줄. 좁으면 오른쪽(소유자·이동)이 다음 줄로 내려가고 이름은 잘리지 않는다. */
function ParticipantRow({
  p,
  party,
  slot,
  showSlot,
  raid,
  roundCount,
  mutate,
  dnd,
}: {
  p: Participant;
  party: number | null;
  slot: number | null;
  showSlot: boolean;
  raid: RaidDetail;
  roundCount: number;
  mutate: Mutate;
  dnd: DragMove;
}) {
  const unit = roundUnit(raid.mode);
  // 값 형식: "회차-파티", 새 회차는 "회차-0"(파티 자동), 대기는 ""
  const value = p.round === null ? "" : `${p.round}-${party ?? 1}`;
  return (
    <li
      className={`flex cursor-grab flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-1.5 whitespace-nowrap active:cursor-grabbing ${
        dnd.dragging === p.id ? "opacity-40" : ""
      } ${dnd.isOver(`p:${p.id}`) ? "bg-amber-100 ring-2 ring-amber-400 ring-inset dark:bg-amber-900/40" : ""}`}
      title="끌어서 다른 캐릭터 위에 놓으면 자리를 맞바꿉니다"
      {...dnd.item(p.id)}
    >
      <div className="flex items-center gap-2">
        {showSlot && party !== null && (
          <select
            aria-label="자리 번호"
            title="파티 안 자리 (고르면 그 자리 사람과 맞바꿈)"
            className="w-9 rounded border border-zinc-300 bg-transparent py-0.5 text-center text-xs font-bold dark:border-zinc-700"
            value={slot ?? ""}
            onChange={(e) => mutate("PATCH", `/api/raids/${raid.id}/participants/${p.id}`, { slot: Number(e.target.value) })}
          >
            {slot === null && <option value="">-</option>}
            {Array.from({ length: SLOTS_PER_PARTY }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
        )}
        <CharacterSummary name={p.name} cls={p.class} combatPower={p.combatPower} />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-500">
          {p.userName}
          {raid.mode === "multi" && ` · ${p.accountLabel}`}
        </span>
        <select
          data-capture-skip
          aria-label={`${unit}·파티 이동`}
          className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs dark:bg-zinc-800"
          value={value}
          onChange={(e) => {
            const v = e.target.value;
            const [round, toParty] = v.split("-").map(Number);
            mutate("PATCH", `/api/raids/${raid.id}/participants/${p.id}`, {
              round: v ? round : null,
              ...(v && toParty > 0 && { party: toParty }),
            });
          }}
        >
          {Array.from({ length: roundCount }, (_, i) =>
            PARTIES.map((pt) => (
              <option key={`${i + 1}-${pt}`} value={`${i + 1}-${pt}`}>
                {i + 1}
                {unit} {pt}파티
              </option>
            )),
          )}
          <option value={`${roundCount + 1}-0`}>새 {unit}</option>
          <option value="">대기</option>
        </select>
        <button
          data-capture-skip
          className="px-1 text-zinc-400 hover:text-red-600"
          title="참가 취소"
          onClick={() => mutate("DELETE", `/api/raids/${raid.id}/participants/${p.id}`)}
        >
          ✕
        </button>
      </div>
    </li>
  );
}

// ---------- 참가자 선택 ----------

/** 레기온원의 등록된 캐릭터 중에서 참가자를 고른다. 단판은 1인 1캐릭. */
function ParticipantPicker({
  raid,
  members,
  currentUserId,
  mutate,
}: {
  raid: RaidDetail;
  members: Member[] | null;
  currentUserId: number;
  mutate: Mutate;
}) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const byCharacter = new Map(raid.participants.map((p) => [p.characterId, p]));
  const joinedUsers = new Set(raid.participants.map((p) => p.userId));

  async function toggle(characterId: number) {
    setBusy(characterId);
    const joined = byCharacter.get(characterId);
    if (joined) await mutate("DELETE", `/api/raids/${raid.id}/participants/${joined.id}`);
    else await mutate("POST", `/api/raids/${raid.id}/participants`, { characterId });
    setBusy(null);
  }

  const q = query.trim();
  const list = (members ?? [])
    .map((m) => {
      const chars = m.accounts.flatMap((a) => a.characters.map((c) => ({ ...c, accountLabel: a.label })));
      const matched = !q || m.name.includes(q) ? chars : chars.filter((c) => c.name.includes(q) || c.class.includes(q));
      return { member: m, chars: matched };
    })
    .filter((x) => x.chars.length > 0)
    // 나를 맨 위로
    .sort((a, b) => Number(b.member.id === currentUserId) - Number(a.member.id === currentUserId));

  return (
    <aside className="sticky top-6 flex max-h-[calc(100vh-3rem)] flex-col gap-3 rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
      <div>
        <h2 className="text-lg font-bold">참가자 추가</h2>
        <p className="text-xs text-zinc-500">
          {raid.mode === "single"
            ? "단판은 1인 1캐릭입니다. 다른 캐릭으로 바꾸려면 먼저 체크를 해제하세요."
            : "등록된 캐릭터 중 갈 캐릭터를 모두 체크하세요. 같은 사람은 회차당 1캐릭으로 배치됩니다."}
        </p>
      </div>
      <input className={inputCls} placeholder="이름·캐릭터·직업 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
      {!members ? (
        <p className="text-sm text-zinc-500">불러오는 중…</p>
      ) : (
        <ul className="-mx-2 flex flex-col gap-3 overflow-y-auto px-2">
          {list.length === 0 && <li className="text-sm text-zinc-400">검색 결과가 없습니다.</li>}
          {list.map(({ member, chars }) => {
            const lockedSingle = raid.mode === "single" && joinedUsers.has(member.id);
            return (
              <li key={member.id} className="flex flex-col gap-1">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  {member.name}
                  {member.id === currentUserId && (
                    <span className="rounded bg-amber-100 px-1.5 text-xs font-normal text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
                      나
                    </span>
                  )}
                </div>
                {chars.map((c) => {
                  const joined = byCharacter.has(c.id);
                  const disabled = busy !== null || (lockedSingle && !joined);
                  return (
                    <label
                      key={c.id}
                      className={`flex items-center gap-2 rounded px-2 py-1 ${
                        joined ? "bg-amber-50 dark:bg-amber-950/40" : ""
                      } ${disabled && !joined ? "opacity-40" : "cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-900"}`}
                    >
                      <input type="checkbox" checked={joined} disabled={disabled} onChange={() => toggle(c.id)} />
                      <CharacterSummary name={c.name} cls={c.class} combatPower={c.combatPower} />
                      {c.isMain && <span className="text-xs text-amber-500">★</span>}
                      {raid.mode === "multi" && member.accounts.length > 1 && (
                        <span className="text-xs text-zinc-400">{c.accountLabel}</span>
                      )}
                    </label>
                  );
                })}
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-zinc-400">
        {roundUnit(raid.mode)}당 정원 {SANCTUARY_RULES.partySize}명. 캐릭터는 &apos;내 캐릭터&apos;에 등록된 것만 고를 수 있습니다.
      </p>
    </aside>
  );
}
