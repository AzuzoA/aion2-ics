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
export interface NcSearchResult {
  server: string;
  name: string;
  class: CharacterClass;
  level: number;
  combatPower: number;
  registered: boolean;
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
  return (res.status === 204 ? null : await res.json()) as T;
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
    <span className={`rounded px-1.5 py-0.5 text-xs whitespace-nowrap ${ROLE_BADGE[role]}`}>
      {cls} · {ROLE_LABELS[role]}
    </span>
  );
}

/** 서버 · 이름 · 직업 · 레벨 · 전투력 한 줄 요약 */
export function CharacterSummary({
  server,
  name,
  cls,
  level,
  combatPower,
}: {
  server: string | null;
  name: string;
  cls: CharacterClass;
  level: number | null;
  combatPower: number | null;
}) {
  return (
    <span className="flex flex-wrap items-center gap-2 text-sm">
      {server && <span className="text-xs text-zinc-500">[{server}]</span>}
      <span className="font-medium">{name}</span>
      <ClassBadge cls={cls} />
      <span className="text-zinc-500">Lv.{level ?? "-"}</span>
      <span className="text-zinc-500">GS {combatPower?.toLocaleString() ?? "-"}</span>
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
