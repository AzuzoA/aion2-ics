"use client";

import { useEffect, useState } from "react";
import { api, CharacterSummary, ErrorBanner, type Member } from "./shared";

/** 레기온원 전체 현황 (읽기 전용). 캐릭터 등록/수정은 '내 캐릭터'에서 한다. */
export default function MemberTree({ currentUserId }: { currentUserId: number }) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ members: Member[] }>("GET", "/api/members")
      .then((d) => setMembers(d.members))
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <ErrorBanner message={error} />;
  if (!members) return <p className="text-zinc-500">불러오는 중…</p>;

  // 내 정보를 맨 위로
  const sorted = [...members].sort(
    (a, b) => Number(b.id === currentUserId) - Number(a.id === currentUserId),
  );

  return (
    <div className="flex flex-col gap-3">
      {sorted.map((m) => (
        <MemberNode key={m.id} member={m} isMe={m.id === currentUserId} />
      ))}
    </div>
  );
}

function MemberNode({ member, isMe }: { member: Member; isMe: boolean }) {
  const [open, setOpen] = useState(isMe);
  const all = member.accounts.flatMap((a) => a.characters);
  const main = all.find((c) => c.isMain);

  return (
    <section className="rounded-lg border border-zinc-200 dark:border-zinc-800">
      <button className="flex w-full items-center gap-3 px-4 py-3 text-left" onClick={() => setOpen(!open)}>
        <span className="w-4 text-zinc-400">{open ? "▾" : "▸"}</span>
        {member.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- Discord CDN 아바타
          <img src={member.avatarUrl} alt="" className="h-7 w-7 rounded-full" />
        ) : (
          <div className="h-7 w-7 rounded-full bg-zinc-200 dark:bg-zinc-700" />
        )}
        <span className="font-semibold">{member.name}</span>
        {isMe && (
          <span className="rounded bg-amber-100 px-1.5 text-xs text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">나</span>
        )}
        <span className="text-sm text-zinc-500">
          {main ? `★ ${main.name}` : "본캐 미등록"} · 캐릭터 {all.length} · 계정 {member.accounts.length}
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-2 border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
          {member.accounts.map((a) => (
            <div key={a.id} className="rounded-md border border-dashed border-zinc-300 dark:border-zinc-700">
              <div className="border-b border-dashed border-zinc-300 px-3 py-1 dark:border-zinc-700">
                <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium dark:bg-zinc-800">{a.label}</span>
              </div>
              <ul>
                {a.characters.length === 0 && <li className="px-3 py-2 text-sm text-zinc-400">캐릭터 없음</li>}
                {a.characters.map((c) => (
                  <li key={c.id} className="flex items-center gap-2 px-3 py-1.5">
                    <span className={`w-12 text-xs ${c.isMain ? "font-bold text-amber-500" : "text-zinc-400"}`}>
                      {c.isMain ? "★ 본캐" : "부캐"}
                    </span>
                    <CharacterSummary server={c.server} name={c.name} cls={c.class} level={c.level} combatPower={c.combatPower} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
