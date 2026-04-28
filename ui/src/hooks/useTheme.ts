"use client";

/**
 * useTheme — Theme toggle with localStorage + system preference
 */

import { useEffect, useCallback, useState } from "react";
import type { Theme } from "@/types/api";

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getResolvedTheme(theme: Theme): "light" | "dark" {
  return theme === "system" ? getSystemTheme() : theme;
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("system");
  const [resolved, setResolved] = useState<"light" | "dark">("light");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem("theme") as Theme | null;
    const initial = stored || "system";
    setThemeState(initial);
    setResolved(getResolvedTheme(initial));

    const root = document.documentElement;
    if (getResolvedTheme(initial) === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const listener = (e: MediaQueryListEvent) => {
      if (theme === "system") {
        const r = e.matches ? "dark" : "light";
        setResolved(r);
        document.documentElement.classList.toggle("dark", r === "dark");
      }
    };
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", listener);
    return () => mq.removeEventListener("change", listener);
  }, [theme]);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem("theme", newTheme);
    const r = getResolvedTheme(newTheme);
    setResolved(r);
    document.documentElement.classList.toggle("dark", r === "dark");
  }, []);

  const toggle = useCallback(() => {
    const next =
      theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
    setTheme(next);
  }, [theme, setTheme]);

  return { theme, resolved, setTheme, toggle };
}
