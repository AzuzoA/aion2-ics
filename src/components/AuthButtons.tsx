"use client";

import { signIn, signOut } from "next-auth/react";
import { useState } from "react";

export function DiscordLoginButton() {
  return (
    <button
      onClick={() => signIn("discord")}
      className="rounded-md bg-[#5865F2] px-5 py-2.5 font-medium text-white hover:bg-[#4752c4]"
    >
      Discord로 로그인
    </button>
  );
}

export function DevLoginForm() {
  const [name, setName] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) signIn("dev", { name: name.trim(), callbackUrl: "/" });
      }}
      className="flex gap-2"
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="테스트 유저 이름"
        className="rounded-md border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
      />
      <button className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700">
        개발용 로그인
      </button>
    </form>
  );
}

export function SignOutButton() {
  return (
    <button onClick={() => signOut()} className="text-sm text-zinc-500 hover:underline">
      로그아웃
    </button>
  );
}
