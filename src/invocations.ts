import type { SkillInfo } from "./skills.js";

export interface SkillInvocation {
  name: string;
  index: number;
  length: number;
}

const INLINE_SKILL_PATTERN = /(^|[^\w/.:~-])\/([a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?)(?=$|[^a-z0-9-])/g;
const EXPANDED_SKILL_PATTERN = /<skill\s+name="([^"]+)"(?:\s|>)/g;

export function findInlineSkillInvocations(text: string, knownSkillNames: ReadonlySet<string>): SkillInvocation[] {
  const result: SkillInvocation[] = [];
  const pattern = new RegExp(INLINE_SKILL_PATTERN.source, "g");

  for (const match of text.matchAll(pattern)) {
    const prefix = match[1] ?? "";
    const name = match[2];
    const index = (match.index ?? 0) + prefix.length;

    // Position zero belongs to Pi's native slash-command dispatcher.
    if (index === 0) continue;
    // pi-skillful owns /skill:name; this extension only owns /name.
    if (text.startsWith("/skill:", index)) continue;
    // Allow users to escape a mention as \/name.
    if (index > 0 && text[index - 1] === "\\") continue;
    if (!knownSkillNames.has(name)) continue;

    result.push({ name, index, length: name.length + 1 });
  }

  return deduplicateInvocations(result);
}

export function findExpandedSkillNames(text: string): Set<string> {
  const names = new Set<string>();
  const pattern = new RegExp(EXPANDED_SKILL_PATTERN.source, "g");

  for (const match of text.matchAll(pattern)) {
    names.add(match[1]);
  }

  return names;
}

export interface InlineCompletion {
  fragment: string;
  prefix: string;
  markerStart: number;
}

export function findInlineSkillCompletion(
  beforeCursor: string,
  skills: readonly Pick<SkillInfo, "name">[],
): InlineCompletion | undefined {
  const match = beforeCursor.match(/(^|[^\w/.:~-])\/([a-z0-9-]*)$/);
  if (!match) return undefined;

  const fragment = match[2] ?? "";
  const markerStart = beforeCursor.length - fragment.length - 1;

  if (markerStart === 0) return undefined;
  if (markerStart > 0 && beforeCursor[markerStart - 1] === "\\") return undefined;
  if (beforeCursor.startsWith("/skill:", markerStart)) return undefined;
  if (!skills.some((skill) => skill.name.startsWith(fragment))) return undefined;

  return {
    fragment,
    prefix: `/${fragment}`,
    markerStart,
  };
}

function deduplicateInvocations(invocations: SkillInvocation[]): SkillInvocation[] {
  const seen = new Set<string>();
  return invocations.filter((invocation) => {
    if (seen.has(invocation.name)) return false;
    seen.add(invocation.name);
    return true;
  });
}
