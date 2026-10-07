"use client";

import { useLayoutEffect } from "react";
import { btnCls } from "./shared";

type Theme = "light" | "dark";

/** 저장된 테마, 없으면 OS 설정. layout.tsx의 THEME_SCRIPT와 같은 규칙. */
function resolveTheme(): Theme {
  try {
    const t = localStorage.getItem("theme");
    if (t === "light" || t === "dark") return t;
  } catch {}
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** 라이트/다크 전환. 아이콘은 data-theme 기준 CSS로 바뀌므로 React 상태가 필요 없다. */
export default function ThemeToggle() {
  // dev 모드 Strict Mode 재마운트 시 React가 <html> 속성을 지우므로 다시 적용한다 (프로덕션에선 no-op)
  useLayoutEffect(() => {
    document.documentElement.setAttribute("data-theme", resolveTheme());
  }, []);

  function toggle() {
    const next: Theme = resolveTheme() === "dark" ? "light" : "dark";
    try {
      localStorage.setItem("theme", next);
    } catch {}
    document.documentElement.setAttribute("data-theme", next);
  }

  return (
    <button className={btnCls} onClick={toggle} title="라이트/다크 모드 전환">
      <span className="dark:hidden">☾ 다크 모드</span>
      <span className="hidden dark:inline">☀ 라이트 모드</span>
    </button>
  );
}
