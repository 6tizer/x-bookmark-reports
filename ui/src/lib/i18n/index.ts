"use client";

/**
 * 中英双语：轻量 i18n（无第三方依赖）
 *
 * - 语言存 localStorage("locale")；首次访问按浏览器语言自动选择
 * - useT() 返回 t(key, vars)，key 形如 "common.nav.dashboard"，{name} 占位符替换
 * - 键名有类型约束，写错键 tsc 会报错；动态键用 `as MessageKey`
 */

import { useCallback, useEffect } from "react";
import { create } from "zustand";
import { LOCALES, type Locale } from "./define";
import { registry } from "./messages";

export type { Locale };
export { LOCALES };

type Registry = typeof registry;
export type MessageKey = {
  [NS in keyof Registry]: `${NS & string}.${keyof Registry[NS]["en"] & string}`;
}[keyof Registry];

export type TranslateVars = Record<string, string | number>;
export type TFunction = (key: MessageKey, vars?: TranslateVars) => string;

const STORAGE_KEY = "locale";

// 启动时展平成 { en: { "ns.key": text }, zh: {...} }
const flat: Record<Locale, Record<string, string>> = { en: {}, zh: {} };
for (const [ns, messages] of Object.entries(registry)) {
  for (const locale of LOCALES) {
    for (const [key, text] of Object.entries(messages[locale] as Record<string, string>)) {
      flat[locale][`${ns}.${key}`] = text;
    }
  }
}

export function translate(locale: Locale, key: MessageKey, vars?: TranslateVars): string {
  const text = flat[locale][key] ?? flat.en[key] ?? key;
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

/** 判断某个动态键是否存在（用于服务端返回的 code 找不到翻译时回退原文） */
export function hasMessage(key: string): boolean {
  return key in flat.en;
}

interface LocaleStore {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

function applyHtmlLang(locale: Locale) {
  if (typeof document !== "undefined") {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  }
}

export const useLocaleStore = create<LocaleStore>((set) => ({
  locale: "en",
  setLocale: (locale) => {
    set({ locale });
    try {
      localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      /* 隐私模式等写不进 localStorage 时只影响本次会话 */
    }
    applyHtmlLang(locale);
  },
}));

export function useT(): TFunction {
  const locale = useLocaleStore((s) => s.locale);
  return useCallback((key, vars) => translate(locale, key, vars), [locale]);
}

export function useI18n() {
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);
  const t = useT();
  const toggleLocale = useCallback(() => setLocale(locale === "en" ? "zh" : "en"), [locale, setLocale]);
  return { locale, setLocale, toggleLocale, t };
}

/** 挂在根布局：客户端首次加载时恢复语言偏好（SSR 统一按英文渲染，避免水合不一致） */
export function LocaleSync() {
  useEffect(() => {
    let initial: Locale = "en";
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "en" || stored === "zh") {
        initial = stored;
      } else if (navigator.language.toLowerCase().startsWith("zh")) {
        initial = "zh";
      }
    } catch {
      /* 读不到 localStorage 时用英文 */
    }
    useLocaleStore.setState({ locale: initial });
    applyHtmlLang(initial);
  }, []);
  return null;
}
