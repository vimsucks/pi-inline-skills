import type { LoadedSkill } from "./skills.js";
import { CUSTOM_MESSAGE_TYPE } from "./context.js";
import { escapeAttribute } from "./skills.js";

export interface InvocationSkillDetails {
  name: string;
  path: string;
  baseDir: string;
  digest: string;
  mode: "loaded" | "reused";
}

export interface InvocationDetails {
  version: 1;
  skills: InvocationSkillDetails[];
}

export interface InvocationMessage {
  customType: string;
  content: string;
  display: boolean;
  details: InvocationDetails;
}

export function createInvocationMessage(
  skills: readonly LoadedSkill[],
  activeDigests: ReadonlyMap<string, string>,
): InvocationMessage {
  const details: InvocationDetails = {
    version: 1,
    skills: skills.map((skill) => ({
      name: skill.name,
      path: skill.path,
      baseDir: skill.baseDir,
      digest: skill.digest,
      mode: activeDigests.get(skill.name) === skill.digest ? "reused" : "loaded",
    })),
  };

  const blocks = skills.map((skill, index) => {
    const detail = details.skills[index];
    if (detail.mode === "reused") {
      return `<skill-ref name="${escapeAttribute(skill.name)}" digest="sha256:${skill.digest}">\nApply the previously loaded skill to the current request.\n</skill-ref>`;
    }

    return `<skill name="${escapeAttribute(skill.name)}" location="${escapeAttribute(skill.path)}" digest="sha256:${skill.digest}">\nReferences are relative to ${skill.baseDir}.\n\n${skill.body}\n</skill>`;
  });

  return {
    customType: CUSTOM_MESSAGE_TYPE,
    content: [
      "The user explicitly invoked the following skills for the current request.",
      "",
      ...blocks.flatMap((block) => [block, ""]),
    ].join("\n").trim(),
    display: true,
    details,
  };
}

export function collectActiveSkillDigests(entries: readonly unknown[]): Map<string, string> {
  const active = new Map<string, string>();

  for (const entry of entries) {
    const message = getInvocationMessage(entry);
    if (!message) continue;

    for (const skill of message.details.skills) {
      // A lightweight reference is only valid if its full definition is already
      // present earlier in the effective, compaction-aware context.
      if (skill.mode === "loaded") active.set(skill.name, skill.digest);
    }
  }

  return active;
}

export function isInvocationDetails(value: unknown): value is InvocationDetails {
  if (!value || typeof value !== "object") return false;
  const details = value as Partial<InvocationDetails>;
  if (details.version !== 1 || !Array.isArray(details.skills)) return false;

  return details.skills.every((skill) => {
    if (!skill || typeof skill !== "object") return false;
    const candidate = skill as Partial<InvocationSkillDetails>;
    return (
      typeof candidate.name === "string" &&
      typeof candidate.path === "string" &&
      typeof candidate.baseDir === "string" &&
      typeof candidate.digest === "string" &&
      (candidate.mode === "loaded" || candidate.mode === "reused")
    );
  });
}

function getInvocationMessage(entry: unknown): { details: InvocationDetails } | undefined {
  if (!entry || typeof entry !== "object") return undefined;
  const candidate = entry as {
    type?: unknown;
    customType?: unknown;
    details?: unknown;
  };

  if (
    candidate.type !== "custom_message" ||
    candidate.customType !== CUSTOM_MESSAGE_TYPE ||
    !isInvocationDetails(candidate.details)
  ) {
    return undefined;
  }

  return { details: candidate.details };
}
