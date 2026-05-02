/**
 * Read/write `ARTICLES_DIR` in repo-root `.env` (parent of `ui/`).
 */

import fs from "fs";
import path from "path";
import { getRepoRoot } from "@/lib/repo-root";

const PARENT_ENV = path.join(getRepoRoot(), ".env");

export function readParentEnvArticlesDir(): string | null {
  if (!fs.existsSync(PARENT_ENV)) return null;
  try {
    const text = fs.readFileSync(PARENT_ENV, "utf-8");
    const m = text.match(/^\s*ARTICLES_DIR\s*=\s*(.*)$/m);
    if (!m) return null;
    let v = m[1].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    return v || null;
  } catch {
    return null;
  }
}

export function writeParentEnvArticlesDir(dir: string): boolean {
  try {
    let lines: string[] = [];
    if (fs.existsSync(PARENT_ENV)) {
      lines = fs.readFileSync(PARENT_ENV, "utf-8").split(/\r?\n/);
    }
    const esc = dir.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const newLine = `ARTICLES_DIR="${esc}"`;
    let found = false;
    lines = lines.map((line) => {
      if (/^\s*ARTICLES_DIR\s*=/.test(line)) {
        found = true;
        return newLine;
      }
      return line;
    });
    if (!found) {
      if (lines.length && lines[lines.length - 1] !== "") lines.push("");
      lines.push(newLine);
    }
    fs.writeFileSync(PARENT_ENV, lines.join("\n") + (lines[lines.length - 1] === "" ? "" : "\n"), "utf-8");
    return true;
  } catch (e) {
    console.error("writeParentEnvArticlesDir:", e);
    return false;
  }
}
