"use client";

import { useEffect, useState } from "react";
import { api, btnCls, CharacterSummary, inputCls, type NcSearchResult } from "./shared";

// 서버 목록은 페이지 안에서 한 번만 불러온다
let serversPromise: Promise<string[]> | null = null;
function loadServers() {
  serversPromise ??= api<{ servers: string[] }>("GET", "/api/nc/servers")
    .then((d) => d.servers)
    .catch((e) => {
      serversPromise = null;
      throw e;
    });
  return serversPromise;
}

/**
 * 서버 + 캐릭터명으로 NC API(현재 Mock)를 검색하고 결과 중 하나를 고른다.
 * 직접 입력 대신 검색 결과에서 선택하는 방식.
 */
export default function CharacterSearch({
  pickLabel,
  onPick,
  onCancel,
}: {
  pickLabel: string;
  onPick: (r: NcSearchResult) => Promise<boolean>;
  onCancel?: () => void;
}) {
  const [servers, setServers] = useState<string[]>([]);
  const [server, setServer] = useState("");
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState<NcSearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [picking, setPicking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadServers()
      .then((s) => {
        setServers(s);
        setServer((cur) => cur || s[0] || "");
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({ server, name: keyword });
      const data = await api<{ results: NcSearchResult[] }>("GET", `/api/nc/search?${q}`);
      setResults(data.results);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
      <form onSubmit={search} className="flex flex-wrap gap-2">
        <select className={inputCls} value={server} onChange={(e) => setServer(e.target.value)} aria-label="서버">
          {servers.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input
          autoFocus
          required
          maxLength={20}
          className={`${inputCls} flex-1`}
          placeholder="캐릭터명 검색"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <button className={btnCls} disabled={loading || !server || !keyword.trim()}>
          {loading ? "검색 중…" : "검색"}
        </button>
        {onCancel && (
          <button type="button" className={btnCls} onClick={onCancel}>
            닫기
          </button>
        )}
      </form>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {results && (
        <ul className="flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
          {results.length === 0 && <li className="py-2 text-sm text-zinc-500">검색 결과가 없습니다.</li>}
          {results.map((r) => (
            <li key={r.name} className="flex items-center justify-between gap-2 py-2">
              <CharacterSummary server={r.server} name={r.name} cls={r.class} level={r.level} combatPower={r.combatPower} />
              {r.registered ? (
                <span className="text-xs text-zinc-400">등록됨</span>
              ) : (
                <button
                  className={btnCls}
                  disabled={picking !== null}
                  onClick={async () => {
                    setPicking(r.name);
                    const ok = await onPick(r);
                    setPicking(null);
                    if (ok) setResults((cur) => cur?.map((x) => (x.name === r.name ? { ...x, registered: true } : x)) ?? null);
                  }}
                >
                  {picking === r.name ? "등록 중…" : pickLabel}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-zinc-400">※ 현재 NC API 대신 Mock 데이터로 동작합니다.</p>
    </div>
  );
}
