/**
 * 词典定义工具：每个命名空间一个文件，英文为基准，中文必须逐键对应。
 * 中文缺键或多键都会在 tsc 阶段报错，保证双语不漏翻。
 */

export type Locale = "en" | "zh";

export const LOCALES: Locale[] = ["en", "zh"];

export function defineMessages<T extends Record<string, string>>(messages: {
  en: T;
  zh: { [K in keyof T]: string };
}) {
  return messages;
}
