"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AliasForm({ initialName }: { initialName: string }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  return (
    <form
      className="flex w-full max-w-sm flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        const res = await fetch("/api/me", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        if (res.ok) {
          router.replace("/me");
          router.refresh();
        } else {
          setError((await res.json().catch(() => null))?.error ?? "저장에 실패했습니다.");
          setSaving(false);
        }
      }}
    >
      <label className="text-sm font-medium" htmlFor="alias">
        메인 별칭
      </label>
      <input
        id="alias"
        autoFocus
        required
        maxLength={20}
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        disabled={saving || !name.trim()}
        className="rounded-md bg-zinc-900 px-4 py-2 font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {saving ? "저장 중…" : "시작하기"}
      </button>
    </form>
  );
}
