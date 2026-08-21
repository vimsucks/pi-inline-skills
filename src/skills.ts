import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { SourceInfo } from "@earendil-works/pi-coding-agent";

export interface SkillInfo {
  name: string;
  description: string;
  path: string;
  baseDir: string;
  sourceInfo: SourceInfo;
}

export interface LoadedSkill extends SkillInfo {
  body: string;
  digest: string;
}

interface CommandLike {
  name: string;
  description?: string;
  source: string;
  sourceInfo: SourceInfo;
}

export function listSkills(commands: Iterable<CommandLike>): SkillInfo[] {
  const byName = new Map<string, SkillInfo>();

  for (const command of commands) {
    if (command.source !== "skill" || !command.name.startsWith("skill:")) continue;

    const name = command.name.slice("skill:".length);
    if (!name) continue;

    byName.set(name, {
      name,
      description: command.description ?? "",
      path: command.sourceInfo.path,
      baseDir: command.sourceInfo.baseDir ?? dirname(command.sourceInfo.path),
      sourceInfo: command.sourceInfo,
    });
  }

  return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export async function loadSkill(skill: SkillInfo): Promise<LoadedSkill> {
  const markdown = await readFile(skill.path, "utf-8");
  const body = stripFrontmatter(markdown).trim();
  const digest = createHash("sha256").update(body).digest("hex");
  return { ...skill, body, digest };
}

export function stripFrontmatter(markdown: string): string {
  const normalized = markdown.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const match = normalized.match(/^---\n[\s\S]*?\n---\n?/);
  return match ? normalized.slice(match[0].length) : normalized;
}

export function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
