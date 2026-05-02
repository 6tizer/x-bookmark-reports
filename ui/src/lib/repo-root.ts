/**
 * Resolve repo root and `ui/` package root regardless of Next.js `process.cwd()`.
 * Supports `npm run dev` from `ui/` or from `x-bookmark-reports/` (monorepo-style).
 */

import * as fs from "fs";
import * as path from "path";

export function getRepoRoot(): string {
  const cwd = process.cwd();
  try {
    if (path.basename(cwd) === "ui" && fs.existsSync(path.join(cwd, "package.json"))) {
      return path.resolve(cwd, "..");
    }
    if (fs.existsSync(path.join(cwd, "ui", "package.json"))) {
      return cwd;
    }
  } catch {
    /* ignore */
  }
  return path.resolve(cwd, "..");
}

export function getUiPackageRoot(): string {
  const cwd = process.cwd();
  if (path.basename(cwd) === "ui") {
    return cwd;
  }
  return path.join(getRepoRoot(), "ui");
}
