import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import type { AutocompleteProviderFactory, ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AutocompleteProvider } from "@earendil-works/pi-tui";
import piInlineSkills from "../extensions/index.js";
import { CUSTOM_MESSAGE_TYPE } from "../src/context.js";
import type { InlineEditorFactory } from "../src/editor.js";
import type { InvocationMessage } from "../src/message.js";

type Handler = (event: any, context: any) => Promise<any> | any;

const handlers = new Map<string, Handler>();
const sentMessages: InvocationMessage[] = [];
const notifications: string[] = [];
let skillPath = "";
let directory = "";
let autocompleteProvider: AutocompleteProvider | undefined;
let editorFactory: InlineEditorFactory | undefined;

const baseAutocompleteProvider: AutocompleteProvider = {
  async getSuggestions() {
    return { prefix: "/", items: [{ value: "/tmp/file", label: "/tmp/file" }] };
  },
  applyCompletion(lines, cursorLine, cursorCol) {
    return { lines, cursorLine, cursorCol };
  },
};

const pi = {
  registerMessageRenderer() {},
  on(event: string, handler: Handler) {
    handlers.set(event, handler);
  },
  getCommands() {
    return [
      {
        name: "skill:code-review",
        source: "skill",
        description: "Review code",
        sourceInfo: {
          path: skillPath,
          source: "test",
          scope: "temporary",
          origin: "top-level",
          baseDir: directory,
        },
      },
    ];
  },
  sendMessage(message: InvocationMessage) {
    sentMessages.push(message);
  },
} as unknown as ExtensionAPI;

const context = (entries: unknown[] = []) => ({
  hasUI: true,
  mode: "tui",
  sessionManager: {
    buildContextEntries: () => entries,
  },
  ui: {
    getEditorComponent() {
      return editorFactory;
    },
    setEditorComponent(factory: InlineEditorFactory | undefined) {
      editorFactory = factory;
    },
    addAutocompleteProvider(factory: AutocompleteProviderFactory) {
      autocompleteProvider = factory(baseAutocompleteProvider);
    },
    notify(message: string) {
      notifications.push(message);
    },
  },
});

before(async () => {
  directory = await mkdtemp(join(tmpdir(), "pi-inline-skills-integration-"));
  skillPath = join(directory, "SKILL.md");
  await writeFile(skillPath, "---\nname: code-review\ndescription: Review code\n---\n# Review\n\nInspect the change.\n");
  piInlineSkills(pi);
});

after(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe("extension event wiring", () => {
  it("opens skill suggestions when the inline slash trigger is typed", async () => {
    const sessionStart = handlers.get("session_start");
    assert.ok(sessionStart);

    await sessionStart({ reason: "startup" }, context());
    assert.ok(autocompleteProvider);
    assert.ok(editorFactory);

    const line = "\u4ecb\u7ecd\u4e00\u4e0b /";
    const suggestions = await autocompleteProvider.getSuggestions([line], 0, line.length, {
      signal: AbortSignal.timeout(1_000),
    });

    assert.deepEqual(suggestions?.items.map((item) => item.label), ["/code-review"]);
    assert.deepEqual(suggestions?.items.map((item) => item.value), ["code-review"]);
    assert.equal(suggestions?.prefix, "");
    assert.equal(autocompleteProvider.shouldTriggerFileCompletion?.([line], 0, line.length), true);

    const completed = autocompleteProvider.applyCompletion(
      ["\u4ecb\u7ecd\u4e00\u4e0b /code-"],
      0,
      "\u4ecb\u7ecd\u4e00\u4e0b /code-".length,
      suggestions!.items[0],
      "code-",
    );
    assert.deepEqual(completed, {
      lines: ["\u4ecb\u7ecd\u4e00\u4e0b /code-review "],
      cursorLine: 0,
      cursorCol: "\u4ecb\u7ecd\u4e00\u4e0b /code-review ".length,
    });

    const completedFromBareSlash = autocompleteProvider.applyCompletion(
      [line],
      0,
      line.length,
      suggestions!.items[0],
      "",
    );
    assert.deepEqual(completedFromBareSlash, {
      lines: ["\u4ecb\u7ecd\u4e00\u4e0b /code-review "],
      cursorLine: 0,
      cursorCol: "\u4ecb\u7ecd\u4e00\u4e0b /code-review ".length,
    });
  });

  it("preserves suffix text without adding a second space", () => {
    assert.ok(autocompleteProvider);
    const line = "Use /code- for this";
    const cursorCol = "Use /code-".length;

    const completed = autocompleteProvider.applyCompletion(
      [line],
      0,
      cursorCol,
      { value: "code-review", label: "/code-review" },
      "code-",
    );

    assert.deepEqual(completed, {
      lines: ["Use /code-review for this"],
      cursorLine: 0,
      cursorCol: "Use /code-review".length,
    });
  });

  it("does not fall back to file suggestions for an inline skill token", async () => {
    assert.ok(autocompleteProvider);
    const line = "Use /missing";

    const suggestions = await autocompleteProvider.getSuggestions([line], 0, line.length, {
      signal: AbortSignal.timeout(1_000),
    });

    assert.equal(suggestions, null);
  });

  it("preserves input and injects a full custom message before an idle run", async () => {
    const input = handlers.get("input");
    const beforeAgentStart = handlers.get("before_agent_start");
    assert.ok(input && beforeAgentStart);

    const inputResult = await input(
      {
        source: "interactive",
        text: "Use /code-review for this change",
        streamingBehavior: undefined,
      },
      context(),
    );
    assert.deepEqual(inputResult, { action: "continue" });

    const result = await beforeAgentStart(
      { prompt: "Use /code-review for this change" },
      context(),
    );
    assert.equal(result.message.customType, CUSTOM_MESSAGE_TYPE);
    assert.equal(result.message.details.skills[0].mode, "loaded");
    assert.match(result.message.content, /Inspect the change\./);
  });

  it("reuses a full definition that remains in effective context", async () => {
    const input = handlers.get("input");
    const beforeAgentStart = handlers.get("before_agent_start");
    assert.ok(input && beforeAgentStart);

    await input(
      {
        source: "interactive",
        text: "Again use /code-review",
        streamingBehavior: undefined,
      },
      context(),
    );

    const first = await beforeAgentStart({ prompt: "Again use /code-review" }, context());
    const entry = {
      type: "custom_message",
      customType: first.message.customType,
      content: first.message.content,
      details: first.message.details,
      display: true,
    };

    await input(
      {
        source: "interactive",
        text: "One more /code-review pass",
        streamingBehavior: undefined,
      },
      context([entry]),
    );
    const reused = await beforeAgentStart(
      { prompt: "One more /code-review pass" },
      context([entry]),
    );

    assert.equal(reused.message.details.skills[0].mode, "reused");
    assert.match(reused.message.content, /<skill-ref/);
    assert.doesNotMatch(reused.message.content, /Inspect the change\./);
  });

  it("does not split streaming input into separate queue messages", async () => {
    const input = handlers.get("input");
    const beforeAgentStart = handlers.get("before_agent_start");
    assert.ok(input && beforeAgentStart);

    const sentBefore = sentMessages.length;
    const result = await input(
      {
        source: "interactive",
        text: "Steer with /code-review",
        streamingBehavior: "steer",
      },
      context(),
    );

    assert.deepEqual(result, { action: "continue" });
    assert.equal(sentMessages.length, sentBefore);
    assert.match(notifications.at(-1) ?? "", /not injected into steering or follow-up/);
    assert.equal(await beforeAgentStart({ prompt: "next idle prompt" }, context()), undefined);
  });
});
