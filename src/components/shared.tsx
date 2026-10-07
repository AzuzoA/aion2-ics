"use client";

import { CLASS_ROLES, ROLE_LABELS, type CharacterClass } from "@/lib/classes";

// ---------- API 응답 타입 ----------

export interface Character {
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
export interface Account {
  id: number;
  label: string;
  characters: Character[];
}
export interface Member {
  id: number;
  name: string;
  avatarUrl: string | null;
  accounts: Account[];
}

// ---------- fetch 헬퍼 ----------

export async function api<T = unknown>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? `요청 실패 (${res.status})`);
  }
  // 본문 없는 성공 응답(204, 201 등)도 있으므로 비어 있으면 null
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

// ---------- 남툴 (k 단위) ----------
// DB에는 원래 값(3200)을 저장하고, 입력·표시는 k 단위(3.2k)로 한다.

/** 3200 → "3.2k" */
export function formatK(raw: number | null): string {
  return raw === null ? "-" : `${Number((raw / 1000).toFixed(2))}k`;
}
/** 3200 → "3.2" (입력칸 초기값) */
export const rawToKInput = (raw: number | null) => (raw === null ? "" : String(Number((raw / 1000).toFixed(2))));
/** "3.2" → 3200 */
export const kInputToRaw = (k: string) => Math.round(Number(k) * 1000);

// ---------- 날짜 ----------

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
/** "2026-10-08T21:00" → "10/8 (목) 21:00" */
export function formatRaidDate(value: string): string {
  const [date, time] = value.split("T");
  const [y, m, d] = date.split("-").map(Number);
  return `${m}/${d} (${WEEKDAYS[new Date(y, m - 1, d).getDay()]}) ${time}`;
}

/** "2026-10-07" → "2026년 10월 7일 (수)" */
export function formatDayHeading(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return `${y}년 ${m}월 ${d}일 (${WEEKDAYS[new Date(y, m - 1, d).getDay()]})`;
}

/** 오늘 날짜 "YYYY-MM-DD" (브라우저 기준) */
export function todayString(): string {
  const now = new Date();
  return [now.getFullYear(), now.getMonth() + 1, now.getDate()].map((n) => String(n).padStart(2, "0")).join("-");
}

// ---------- 스타일 ----------

export const inputCls =
  "rounded border border-zinc-300 bg-transparent px-2 py-1.5 text-sm dark:border-zinc-700";
export const btnCls =
  "rounded border border-zinc-300 px-2.5 py-1 text-xs hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:hover:bg-zinc-800";

const ROLE_BADGE: Record<string, string> = {
  tank: "bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200",
  dealer: "bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200",
  support: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200",
};

export function ClassBadge({ cls }: { cls: CharacterClass }) {
  const role = CLASS_ROLES[cls];
  return (
    <span className={`inline-block w-20 shrink-0 rounded px-1.5 py-0.5 text-center text-xs whitespace-nowrap ${ROLE_BADGE[role]}`}>
      {cls} · {ROLE_LABELS[role]}
    </span>
  );
}

/** 직업 · 남툴 · 캐릭터명 한 줄 요약. 직업/남툴은 고정 폭이라 목록에서 열이 맞는다. */
export function CharacterSummary({
  name,
  cls,
  combatPower,
}: {
  name: string;
  cls: CharacterClass;
  combatPower: number | null;
}) {
  return (
    <span className="flex items-center gap-3 text-sm">
      <ClassBadge cls={cls} />
      <span className="w-20 shrink-0 text-zinc-500 tabular-nums">남툴 {formatK(combatPower)}</span>
      <span className="font-medium">{name}</span>
    </span>
  );
}

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
      {message}
    </div>
  );
}
