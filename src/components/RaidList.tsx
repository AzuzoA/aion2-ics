"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { RAID_MODE_LABELS, SANCTUARY_RULES, type RaidMode } from "@/lib/raid/compose";
import { RAID_TYPES, raidTypeName, type RaidType } from "@/lib/raid/tactics";
import { api, btnCls, ErrorBanner, formatDayHeading, inputCls, todayString } from "./shared";

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

/** 날짜별로 묶는다. 날짜는 최근순, 같은 날 안에서는 시간순 */
function groupByDay(raids: RaidSummary[]): [string, RaidSummary[]][] {
  const days = new Map<string, RaidSummary[]>();
  for (const r of raids) {
    const day = r.raidDate.split("T")[0];
    days.set(day, [...(days.get(day) ?? []), r]);
  }
  return [...days.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([day, list]) => [day, list.sort((a, b) => a.raidDate.localeCompare(b.raidDate) || a.id - b.id)]);
}

const MODE_HINTS: Record<RaidMode, string> = {
  multi: "본캐·부캐, 여러 계정 캐릭으로 여러 번 갑니다. 같은 사람은 회차당 1캐릭.",
  single: "한 번만 갑니다. 1인 1캐릭, 정원(10명)이 넘으면 공대를 나눕니다.",
};

/** 성역 방 목록 + 개설 */
export default function RaidList() {
  const router = useRouter();
  const [raids, setRaids] = useState<RaidSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [raidType, setRaidType] = useState<RaidType>("rudra");
  const [title, setTitle] = useState("");
  const [raidDate, setRaidDate] = useState("");
  const [mode, setMode] = useState<RaidMode>("multi");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<{ raids: RaidSummary[] }>("GET", "/api/raids")
      .then((d) => setRaids(d.raids))
      .catch((e: Error) => setError(e.message));
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const { raid } = await api<{ raid: { id: number } }>("POST", "/api/raids", { title, raidDate, raidType, mode });
      router.push(`/raids/${raid.id}`);
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-[1fr_380px] items-start gap-10">
      <section className="flex flex-col gap-6">
        <ErrorBanner message={error} />
        {!raids ? (
          <p className="text-zinc-500">불러오는 중…</p>
        ) : raids.length === 0 ? (
          <p className="text-sm text-zinc-400">개설된 성역 방이 없습니다. 오른쪽에서 새로 만드세요.</p>
        ) : (
          groupByDay(raids).map(([day, list]) => (
            <div key={day} className="flex flex-col gap-2">
              <h2 className="flex items-center gap-2 border-b border-zinc-200 pb-1 text-lg font-bold dark:border-zinc-800">
                {formatDayHeading(day)}
                {day === todayString() && (
                  <span className="rounded bg-amber-500 px-1.5 py-0.5 text-xs font-semibold text-white">오늘</span>
                )}
              </h2>
              <ul className="grid grid-cols-2 gap-3">
                {list.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/raids/${r.id}`}
                      className="flex flex-col gap-1 rounded-lg border border-zinc-200 px-4 py-3 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                    >
                      <div className="flex items-center gap-2">
                        <TypeBadge type={r.raidType} />
                        <ModeBadge mode={r.mode} />
                        <span className="font-semibold">{r.title}</span>
                      </div>
                      <div className="text-sm text-zinc-500">
                        {r.raidDate.split("T")[1]} · 참가 {r.participantCount}캐릭 · 개설 {r.createdBy ?? "-"}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>

      <aside className="sticky top-6 flex flex-col gap-4 rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
        <h2 className="text-lg font-bold">새 성역 방</h2>
        <form className="flex flex-col gap-3" onSubmit={create}>
          <fieldset className="flex flex-col gap-1 text-sm">
            <legend className="mb-1">성역</legend>
            <div className="grid grid-cols-4 gap-1">
              {RAID_TYPES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setRaidType(t.id)}
                  className={`rounded-md border px-2 py-1.5 ${
                    raidType === t.id
                      ? "border-amber-400 bg-amber-50 font-semibold dark:border-amber-700 dark:bg-amber-950/40"
                      : "border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                  }`}
                >
                  {t.name}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="flex flex-col gap-1 text-sm">
            방 이름 <span className="text-xs text-zinc-500">비우면 &quot;{raidTypeName(raidType)}&quot;</span>
            <input
              maxLength={30}
              className={inputCls}
              placeholder={raidTypeName(raidType)}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            일시
            <input
              required
              type="datetime-local"
              className={inputCls}
              value={raidDate}
              onChange={(e) => setRaidDate(e.target.value)}
            />
          </label>
          <fieldset className="flex flex-col gap-2 text-sm">
            <legend className="mb-1">방식</legend>
            {(["multi", "single"] as const).map((m) => (
              <label
                key={m}
                className={`flex cursor-pointer gap-2 rounded-md border px-3 py-2 ${
                  mode === m ? "border-amber-400 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40" : "border-zinc-200 dark:border-zinc-800"
                }`}
              >
                <input type="radio" name="mode" checked={mode === m} onChange={() => setMode(m)} />
                <span className="flex flex-col">
                  <span className="font-medium">{RAID_MODE_LABELS[m]}</span>
                  <span className="text-xs text-zinc-500">{MODE_HINTS[m]}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <p className="text-xs text-zinc-500">
            정원 {SANCTUARY_RULES.partySize}명(1파티·2파티 각 5명) · 수호 최대 1 · 치유 최대 2 · 호법 최대 2. 방식은 개설 후 바꿀 수 없습니다.
          </p>
          <button className={`${btnCls} py-2 text-sm`} disabled={saving}>
            {saving ? "만드는 중…" : "성역 방 만들기"}
          </button>
        </form>
      </aside>
    </div>
  );
}

export function TypeBadge({ type }: { type: RaidType }) {
  return (
    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
      {raidTypeName(type)}
    </span>
  );
}

export function ModeBadge({ mode }: { mode: RaidMode }) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-xs ${
        mode === "multi"
          ? "bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200"
          : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
      }`}
    >
      {RAID_MODE_LABELS[mode]}
    </span>
  );
}
