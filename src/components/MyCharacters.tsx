"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CLASSES, type CharacterClass } from "@/lib/classes";
import {
  api,
  btnCls,
  CharacterSummary,
  ErrorBanner,
  inputCls,
  kInputToRaw,
  rawToKInput,
  type Account,
  type Character,
  type Member,
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

  const register: Register = (accountId, isMain) => (input) =>
    mutate("POST", "/api/characters", { accountId, ...input, isMain });

  return (
    <div className="flex flex-col gap-6">
      <ErrorBanner message={error} />

      <div className="grid grid-cols-[1fr_380px] items-start gap-10">
        <div className="flex flex-col gap-8">
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
            <ul className="grid grid-cols-2 gap-2">
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
        </div>

        {/* ---------- 사이드바: 별칭 · 계정 ---------- */}
        <aside className="sticky top-6 flex flex-col gap-8 rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
          <AliasSection
            name={me.user.name}
            onSave={async (name) => {
              const ok = await mutate("PATCH", "/api/me", { name });
              if (ok) router.refresh(); // 헤더의 이름 갱신
              return ok;
            }}
          />
          <AccountsSection accounts={accounts} userId={me.user.id} mutate={mutate} />
        </aside>
      </div>
    </div>
  );
}

type Mutate = (method: string, url: string, body?: unknown) => Promise<boolean>;
interface CharacterInput {
  name: string;
  class: CharacterClass;
  combatPower: number;
}
type Register = (accountId: number, isMain: boolean) => (input: CharacterInput) => Promise<boolean>;

function AliasSection({ name, onSave }: { name: string; onSave: (name: string) => Promise<boolean> }) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <section className="flex flex-wrap items-center gap-3">
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
        <p className="text-sm text-zinc-500">본캐 정보를 입력해서 등록하세요.</p>
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
  const [editing, setEditing] = useState<{ class: CharacterClass; combatPower: string } | null>(null);
  return (
    <li
      className={`flex flex-wrap items-center justify-between gap-2 ${
        bare ? "" : "rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-800"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        {editing ? (
          <form
            className="flex items-center gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              // 남툴을 건드리지 않았으면 보내지 않는다 (3125 → "3.13" → 3130 반올림 방지)
              const changed = editing.combatPower !== rawToKInput(c.combatPower);
              const body = { class: editing.class, ...(changed && { combatPower: kInputToRaw(editing.combatPower) }) };
              if (await mutate("PATCH", `/api/characters/${c.id}`, body)) setEditing(null);
            }}
          >
            <ClassSelect value={editing.class} onChange={(cls) => setEditing({ ...editing, class: cls })} />
            <CombatPowerInput value={editing.combatPower} onChange={(v) => setEditing({ ...editing, combatPower: v })} />
            <span className="text-sm font-medium">{c.name}</span>
            <button className={btnCls}>저장</button>
            <button type="button" className={btnCls} onClick={() => setEditing(null)}>
              취소
            </button>
          </form>
        ) : (
          <CharacterSummary name={c.name} cls={c.class} combatPower={c.combatPower} />
        )}
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
        {!editing && (
          <button className={btnCls} onClick={() => setEditing({ class: c.class, combatPower: rawToKInput(c.combatPower) })}>
            수정
          </button>
        )}
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

function ClassSelect({ value, onChange }: { value: CharacterClass; onChange: (cls: CharacterClass) => void }) {
  return (
    <select aria-label="직업" className={inputCls} value={value} onChange={(e) => onChange(e.target.value as CharacterClass)}>
      {CLASSES.map((cls) => (
        <option key={cls} value={cls}>
          {cls}
        </option>
      ))}
    </select>
  );
}

/** 남툴 입력 (k 단위). 3,200이면 3.2 입력 */
function CombatPowerInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-1 text-sm" title="k 단위로 입력 (예: 3,200 → 3.2)">
      <input
        required
        type="number"
        min={0}
        step={0.01}
        aria-label="남툴 (k 단위)"
        placeholder="남툴 예: 3.2"
        className={`${inputCls} w-32`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <span className="text-zinc-500">k</span>
    </label>
  );
}

/** 등록할 계정 선택 + 직업·남툴·캐릭터명 직접 입력 패널 (버튼으로 열고 닫음) */
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
  onPick: (accountId: number) => (input: CharacterInput) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const [accountId, setAccountId] = useState(accounts[0]?.id);
  const [cls, setCls] = useState<CharacterClass>(CLASSES[0]);
  const [combatPower, setCombatPower] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  if (!open) {
    return (
      <button className={`${btnCls} self-start`} onClick={() => setOpen(true)}>
        {buttonLabel}
      </button>
    );
  }
  const selected = accounts.some((a) => a.id === accountId) ? accountId! : accounts[0]?.id;
  return (
    <div className="flex flex-col gap-2 rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
      {hint && <p className="text-xs text-zinc-500">{hint}</p>}
      <p className="text-xs text-zinc-500">남툴은 k 단위로 입력하세요. 예: 3,200 → 3.2 (소수점 둘째 자리까지)</p>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          const ok = await onPick(selected)({ name, class: cls, combatPower: kInputToRaw(combatPower) });
          setSaving(false);
          if (ok) {
            setName("");
            setCombatPower("");
          }
        }}
      >
        {accounts.length > 1 && (
          <select aria-label="등록할 계정" className={inputCls} value={selected} onChange={(e) => setAccountId(Number(e.target.value))}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        )}
        <ClassSelect value={cls} onChange={setCls} />
        <CombatPowerInput value={combatPower} onChange={setCombatPower} />
        <input
          autoFocus
          required
          maxLength={20}
          className={`${inputCls} w-48`}
          placeholder="캐릭터명"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button className={btnCls} disabled={saving}>
          {saving ? "등록 중…" : pickLabel}
        </button>
        {!initiallyOpen && (
          <button type="button" className={btnCls} onClick={() => setOpen(false)}>
            닫기
          </button>
        )}
      </form>
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
