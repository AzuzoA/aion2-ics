"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import CharacterSearch from "./CharacterSearch";
import {
  api,
  btnCls,
  CharacterSummary,
  ErrorBanner,
  inputCls,
  type Account,
  type Character,
  type Member,
  type NcSearchResult,
} from "./shared";

interface MeResponse {
  user: { id: number; name: string };
  tree: Member;
}

export default function MyCharacters() {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setMe(await api<MeResponse>("GET", "/api/me"));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 최초 로드
    reload();
  }, [reload]);

  /** 변경 요청 실행 후 다시 불러온다. 성공 여부 반환. */
  const mutate = useCallback(
    async (method: string, url: string, body?: unknown) => {
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

  if (!me) return <p className="text-zinc-500">{error ?? "불러오는 중…"}</p>;

  const accounts = me.tree.accounts;
  const all = accounts.flatMap((a) => a.characters);
  const main = all.find((c) => c.isMain);
  const alts = all.filter((c) => !c.isMain);
  const accountLabel = (id: number) => accounts.find((a) => a.id === id)?.label ?? "";

  const register = (accountId: number, isMain: boolean) => (r: NcSearchResult) =>
    mutate("POST", "/api/characters", { accountId, server: r.server, name: r.name, isMain });

  return (
    <div className="flex flex-col gap-8">
      <ErrorBanner message={error} />

      <AliasSection
        name={me.user.name}
        onSave={async (name) => {
          const ok = await mutate("PATCH", "/api/me", { name });
          if (ok) router.refresh(); // 헤더의 이름 갱신
          return ok;
        }}
      />

      {/* ---------- 본캐 ---------- */}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">★ 본캐</h2>
        <MainSlot
          main={main}
          accounts={accounts}
          accountLabel={accountLabel}
          register={register}
          mutate={mutate}
        />
      </section>

      {/* ---------- 부캐 ---------- */}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">부캐 <span className="text-sm font-normal text-zinc-500">{alts.length}</span></h2>
        <ul className="flex flex-col gap-2">
          {alts.length === 0 && <li className="text-sm text-zinc-400">등록된 부캐가 없습니다.</li>}
          {alts.map((c) => (
            <CharacterCard key={c.id} character={c} accounts={accounts} accountLabel={accountLabel} mutate={mutate}>
              <button className={btnCls} onClick={() => mutate("PATCH", `/api/characters/${c.id}`, { isMain: true })}>
                본캐로 지정
              </button>
            </CharacterCard>
          ))}
        </ul>
        <AddPanel buttonLabel="+ 부캐 추가" pickLabel="부캐로 등록" accounts={accounts} onPick={(accId) => register(accId, false)} />
      </section>

      {/* ---------- 계정 ---------- */}
      <AccountsSection accounts={accounts} userId={me.user.id} mutate={mutate} />
    </div>
  );
}

type Mutate = (method: string, url: string, body?: unknown) => Promise<boolean>;
type Register = (accountId: number, isMain: boolean) => (r: NcSearchResult) => Promise<boolean>;

function AliasSection({ name, onSave }: { name: string; onSave: (name: string) => Promise<boolean> }) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <section className="flex items-center gap-3">
      <span className="text-sm text-zinc-500">메인 별칭</span>
      {editing === null ? (
        <>
          <span className="text-lg font-semibold">{name}</span>
          <button className={btnCls} onClick={() => setEditing(name)}>
            수정
          </button>
        </>
      ) : (
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await onSave(editing)) setEditing(null);
          }}
        >
          <input autoFocus required maxLength={20} className={inputCls} value={editing} onChange={(e) => setEditing(e.target.value)} />
          <button className={btnCls}>저장</button>
          <button type="button" className={btnCls} onClick={() => setEditing(null)}>
            취소
          </button>
        </form>
      )}
    </section>
  );
}

function MainSlot({
  main,
  accounts,
  accountLabel,
  register,
  mutate,
}: {
  main: Character | undefined;
  accounts: Account[];
  accountLabel: (id: number) => string;
  register: Register;
  mutate: Mutate;
}) {
  if (!main) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border-2 border-dashed border-amber-300 p-4 dark:border-amber-800">
        <p className="text-sm text-zinc-500">본캐를 검색해서 등록하세요.</p>
        <AddPanel initiallyOpen pickLabel="본캐로 등록" accounts={accounts} onPick={(accId) => register(accId, true)} />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-lg border-2 border-amber-300 p-4 dark:border-amber-800">
      <ul>
        <CharacterCard character={main} accounts={accounts} accountLabel={accountLabel} mutate={mutate} bare>
          <button className={btnCls} onClick={() => mutate("PATCH", `/api/characters/${main.id}`, { isMain: false })}>
            부캐로 내리기
          </button>
        </CharacterCard>
      </ul>
      <AddPanel
        buttonLabel="다른 캐릭터로 본캐 변경"
        pickLabel="본캐로 등록"
        hint="새로 등록하는 캐릭터가 본캐가 되고, 기존 본캐는 부캐로 이동합니다. 이미 등록된 부캐는 아래 목록에서 '본캐로 지정'을 누르세요."
        accounts={accounts}
        onPick={(accId) => register(accId, true)}
      />
    </div>
  );
}

/** 캐릭터 한 줄: 요약 + 계정 표시/이동 + 추가 버튼(children) + 삭제 */
function CharacterCard({
  character: c,
  accounts,
  accountLabel,
  mutate,
  bare,
  children,
}: {
  character: Character;
  accounts: Account[];
  accountLabel: (id: number) => string;
  mutate: Mutate;
  bare?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <li
      className={`flex flex-wrap items-center justify-between gap-2 ${
        bare ? "" : "rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-800"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <CharacterSummary server={c.server} name={c.name} cls={c.class} level={c.level} combatPower={c.combatPower} />
        {accounts.length > 1 ? (
          <select
            aria-label="계정"
            className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs dark:bg-zinc-800"
            value={c.accountId}
            onChange={(e) => mutate("PATCH", `/api/characters/${c.id}`, { accountId: Number(e.target.value) })}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        ) : (
          <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs dark:bg-zinc-800">{accountLabel(c.accountId)}</span>
        )}
      </div>
      <div className="flex gap-1">
        {children}
        <button
          className={`${btnCls} text-red-600`}
          onClick={() => confirm(`"${c.name}" 캐릭터를 삭제할까요?`) && mutate("DELETE", `/api/characters/${c.id}`)}
        >
          삭제
        </button>
      </div>
    </li>
  );
}

/** 등록할 계정 선택 + 캐릭터 검색 패널 (버튼으로 열고 닫음) */
function AddPanel({
  buttonLabel,
  pickLabel,
  hint,
  initiallyOpen = false,
  accounts,
  onPick,
}: {
  buttonLabel?: string;
  pickLabel: string;
  hint?: string;
  initiallyOpen?: boolean;
  accounts: Account[];
  onPick: (accountId: number) => (r: NcSearchResult) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const [accountId, setAccountId] = useState(accounts[0]?.id);

  if (!open) {
    return (
      <button className={`${btnCls} self-start`} onClick={() => setOpen(true)}>
        {buttonLabel}
      </button>
    );
  }
  const selected = accounts.some((a) => a.id === accountId) ? accountId! : accounts[0]?.id;
  return (
    <div className="flex flex-col gap-2">
      {hint && <p className="text-xs text-zinc-500">{hint}</p>}
      {accounts.length > 1 && (
        <label className="flex items-center gap-2 text-sm">
          등록할 계정
          <select className={inputCls} value={selected} onChange={(e) => setAccountId(Number(e.target.value))}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <CharacterSearch
        pickLabel={pickLabel}
        onPick={onPick(selected)}
        onCancel={initiallyOpen ? undefined : () => setOpen(false)}
      />
    </div>
  );
}

function AccountsSection({ accounts, userId, mutate }: { accounts: Account[]; userId: number; mutate: Mutate }) {
  const [newLabel, setNewLabel] = useState("");
  const [renaming, setRenaming] = useState<{ id: number; label: string } | null>(null);

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-bold">계정</h2>
        <p className="text-xs text-zinc-500">다른 계정의 캐릭터가 있다면 계정을 추가해서 구분하세요.</p>
      </div>
      <ul className="flex flex-col gap-1">
        {accounts.map((a) => (
          <li key={a.id} className="flex items-center gap-2 text-sm">
            {renaming?.id === a.id ? (
              <form
                className="flex gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (await mutate("PATCH", `/api/accounts/${a.id}`, { label: renaming.label })) setRenaming(null);
                }}
              >
                <input autoFocus required className={inputCls} value={renaming.label} onChange={(e) => setRenaming({ id: a.id, label: e.target.value })} />
                <button className={btnCls}>저장</button>
                <button type="button" className={btnCls} onClick={() => setRenaming(null)}>
                  취소
                </button>
              </form>
            ) : (
              <>
                <span className="min-w-20 rounded bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800">{a.label}</span>
                <span className="text-xs text-zinc-500">캐릭터 {a.characters.length}</span>
                <button className={btnCls} onClick={() => setRenaming({ id: a.id, label: a.label })}>
                  이름변경
                </button>
                <button
                  className={`${btnCls} text-red-600`}
                  disabled={accounts.length === 1}
                  title={accounts.length === 1 ? "계정은 최소 1개 필요합니다" : undefined}
                  onClick={() =>
                    confirm(`"${a.label}" 계정과 소속 캐릭터 ${a.characters.length}개를 삭제할까요?`) &&
                    mutate("DELETE", `/api/accounts/${a.id}`)
                  }
                >
                  삭제
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await mutate("POST", "/api/accounts", { userId, label: newLabel })) setNewLabel("");
        }}
      >
        <input className={inputCls} required maxLength={30} placeholder={`계정 ${accounts.length + 1}`} value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
        <button className={btnCls}>계정 추가</button>
      </form>
    </section>
  );
}
