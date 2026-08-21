import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { CUSTOM_MESSAGE_TYPE, moveInvocationBeforeUser } from "../src/context.js";
import { createInlineAutocompleteEditorFactory, isInlineAutocompleteEditorFactory } from "../src/editor.js";
import {
  findExpandedSkillNames,
  findInlineSkillCompletion,
  findInlineSkillInvocations,
} from "../src/invocations.js";
import {
  collectActiveSkillDigests,
  createInvocationMessage,
  isInvocationDetails,
  type InvocationMessage,
} from "../src/message.js";
import { listSkills, loadSkill, type SkillInfo } from "../src/skills.js";

export default function piInlineSkills(pi: ExtensionAPI) {
  let pendingSkillNames: string[] = [];

  pi.registerMessageRenderer(CUSTOM_MESSAGE_TYPE, (message, { expanded }, theme) => {
    if (!isInvocationDetails(message.details)) {
      return new Text(theme.fg("warning", "[skills] Invalid invocation metadata"), 0, 0);
    }

    const names = message.details.skills.map((skill) => skill.name).join(", ");
    if (!expanded) {
      return new Text(
        theme.fg("customMessageLabel", "[skills] ") + theme.fg("customMessageText", names),
        0,
        0,
      );
    }

    const summary = message.details.skills
      .map((skill) => `${skill.name} (${skill.mode})\n  ${skill.path}\n  sha256:${skill.digest}`)
      .join("\n\n");
    return new Text(
      `${theme.fg("customMessageLabel", "[skills]")}\n${theme.fg("customMessageText", summary)}\n\n${contentToText(message.content)}`,
      0,
      0,
    );
  });

  pi.on("session_start", (_event, ctx) => {
    pendingSkillNames = [];
    if (ctx.mode !== "tui") return;

    const currentEditorFactory = ctx.ui.getEditorComponent();
    if (!isInlineAutocompleteEditorFactory(currentEditorFactory)) {
      ctx.ui.setEditorComponent(
        createInlineAutocompleteEditorFactory(currentEditorFactory, () => listSkills(pi.getCommands())),
      );
    }

    ctx.ui.addAutocompleteProvider((current) => ({
      triggerCharacters: ["/"],

      async getSuggestions(lines, line, col, options) {
        const skills = listSkills(pi.getCommands());
        const beforeCursor = (lines[line] ?? "").slice(0, col);
        const completion = findInlineSkillCompletion(beforeCursor, skills);

        if (!completion) {
          return current.getSuggestions(lines, line, col, options);
        }

        const items = skills
          .filter((skill) => skill.name.startsWith(completion.fragment))
          .map((skill) => ({
            value: `/${skill.name}`,
            label: `/${skill.name}`,
            description: skill.description || "Pi skill",
          }));

        return items.length > 0
          ? { prefix: completion.prefix, items }
          : current.getSuggestions(lines, line, col, options);
      },

      applyCompletion(lines, line, col, item, prefix) {
        return current.applyCompletion(lines, line, col, item, prefix);
      },

      shouldTriggerFileCompletion(lines, line, col) {
        return current.shouldTriggerFileCompletion?.(lines, line, col) ?? true;
      },
    }));
  });

  pi.on("input", async (event, ctx) => {
    if (event.source === "extension") return { action: "continue" };

    const skills = listSkills(pi.getCommands());
    const knownNames = new Set(skills.map((skill) => skill.name));
    const names = findInlineSkillInvocations(event.text, knownNames).map((invocation) => invocation.name);

    pendingSkillNames = [];
    if (names.length === 0) return { action: "continue" };

    if (event.streamingBehavior) {
      if (ctx.hasUI) {
        ctx.ui.notify(
          "Inline skills are not injected into steering or follow-up messages; submit the prompt when Pi is idle.",
          "warning",
        );
      }
      return { action: "continue" };
    }

    pendingSkillNames = names;

    // Preserve the exact user text in the session and fork editor.
    return { action: "continue" };
  });

  pi.on("before_agent_start", async (event, ctx) => {
    const names = pendingSkillNames;
    pendingSkillNames = [];
    if (names.length === 0) return;

    const expandedNames = findExpandedSkillNames(event.prompt);
    const namesToInject = names.filter((name) => !expandedNames.has(name));
    if (namesToInject.length === 0) return;

    const skills = listSkills(pi.getCommands());
    const message = await buildMessage(namesToInject, skills, ctx.sessionManager.buildContextEntries(), ctx);
    return message ? { message } : undefined;
  });

  pi.on("context", (event) => {
    const messages = moveInvocationBeforeUser(event.messages);
    return arraysEqual(messages, event.messages) ? undefined : { messages };
  });
}

async function buildMessage(
  names: readonly string[],
  skills: readonly SkillInfo[],
  contextEntries: readonly unknown[],
  ctx: { hasUI: boolean; ui: { notify(message: string, level: "warning"): void } },
): Promise<InvocationMessage | undefined> {
  const byName = new Map(skills.map((skill) => [skill.name, skill]));
  const loaded = [];

  for (const name of names) {
    const skill = byName.get(name);
    if (!skill) continue;

    try {
      loaded.push(await loadSkill(skill));
    } catch (error) {
      if (ctx.hasUI) {
        ctx.ui.notify(
          `Failed to load inline skill ${name}: ${error instanceof Error ? error.message : String(error)}`,
          "warning",
        );
      }
    }
  }

  if (loaded.length === 0) return undefined;
  return createInvocationMessage(loaded, collectActiveSkillDigests(contextEntries));
}

function contentToText(content: string | Array<{ type: string; text?: string }>): string {
  if (typeof content === "string") return content;
  return content
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text as string)
    .join("\n");
}

function arraysEqual(left: readonly AgentMessage[], right: readonly AgentMessage[]): boolean {
  return left.length === right.length && left.every((message, index) => message === right[index]);
}
