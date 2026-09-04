/**
 * 产品统一时区日期格式化（Asia/Singapore）。
 *
 * 之前 UI 各处直接用 `toLocaleString()` / `toISOString().slice(0, 10)`，
 * 前者跟浏览器时区走、后者是 UTC 日历日，都不保证显示新加坡时间。
 * 所有面向用户的日期/时间展示统一走这里（对应 Python 侧 lib/tz.py）。
 *
 * 服务端与客户端都可用（只依赖 Intl）。
 */

/** 产品时区（IANA 名）。与 Python 侧 APP_TIMEZONE 默认值保持一致。 */
export const APP_TIME_ZONE = "Asia/Singapore";

type DateInput = string | number | Date | null | undefined;

function toDate(input: DateInput): Date | null {
  if (input === null || input === undefined || input === "") return null;
  const d = input instanceof Date ? input : new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

const dateTimeFmt = new Intl.DateTimeFormat("zh-CN", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

const dateFmt = new Intl.DateTimeFormat("zh-CN", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const timeFmt = new Intl.DateTimeFormat("zh-CN", {
  timeZone: APP_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** 完整日期时间，如 `2026/09/05 01:56:00`（新加坡时间）。无效输入返回 fallback。 */
export function formatDateTime(input: DateInput, fallback = "—"): string {
  const d = toDate(input);
  return d ? dateTimeFmt.format(d) : fallback;
}

/** 仅日期，如 `2026/09/05`（新加坡时间）。 */
export function formatDate(input: DateInput, fallback = "—"): string {
  const d = toDate(input);
  return d ? dateFmt.format(d) : fallback;
}

/** 仅时分，如 `01:56`（新加坡时间）。 */
export function formatTime(input: DateInput, fallback = "—"): string {
  const d = toDate(input);
  return d ? timeFmt.format(d) : fallback;
}

/**
 * 新加坡时区下的 `YYYY-MM-DD`，用于文件名、日志按日切分等。
 * 替代 `toISOString().slice(0, 10)`（那是 UTC 日）。
 */
export function localDateStamp(input: DateInput = new Date()): string {
  const d = toDate(input) ?? new Date();
  // zh-CN 输出 2026/09/05，统一成 2026-09-05
  return dateFmt.format(d).replace(/\//g, "-");
}

/** 新加坡时区下的 {hour, minute}（24 小时制），用于服务端算下一次触发点。 */
export function localHourMinute(input: DateInput = new Date()): { hour: number; minute: number } {
  const d = toDate(input) ?? new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return { hour, minute };
}
