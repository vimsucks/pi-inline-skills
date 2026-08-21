import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CUSTOM_MESSAGE_TYPE, moveInvocationBeforeUser } from "../src/context.js";
import {
  collectActiveSkillDigests,
  createInvocationMessage,
  type InvocationDetails,
} from "../src/message.js";
import type { LoadedSkill } from "../src/skills.js";

const skill: LoadedSkill = {
  name: "code-review",
  description: "Review code",
  path: "/skills/code-review/SKILL.md",
  baseDir: "/skills/code-review",
  sourceInfo: {
    path: "/skills/code-review/SKILL.md",
    source: "test",
    scope: "temporary",
    origin: "top-level",
  },
  body: "# Code Review\n\nReview the change.",
  digest: "abc123",
};

describe("createInvocationMessage", () => {
  it("loads the full skill when it is absent from effective context", () => {
    const message = createInvocationMessage([skill], new Map());

    assert.equal(message.customType, CUSTOM_MESSAGE_TYPE);
    assert.equal(message.details.skills[0].mode, "loaded");
    assert.match(message.content, /<skill name="code-review"/);
    assert.match(message.content, /Review the change\./);
  });

  it("uses a lightweight reference when the same digest is active", () => {
    const message = createInvocationMessage([skill], new Map([[skill.name, skill.digest]]));

    assert.equal(message.details.skills[0].mode, "reused");
    assert.match(message.content, /<skill-ref name="code-review"/);
    assert.doesNotMatch(message.content, /Review the change\./);
  });
});

describe("collectActiveSkillDigests", () => {
  it("collects full definitions from custom messages", () => {
    assert.deepEqual(collectActiveSkillDigests([entry("loaded")]), new Map([[skill.name, skill.digest]]));
  });

  it("does not treat a surviving reference as a full definition", () => {
    assert.deepEqual(collectActiveSkillDigests([entry("reused")]), new Map());
  });

  function entry(mode: "loaded" | "reused") {
    const details: InvocationDetails = {
      version: 1,
      skills: [
        {
          name: skill.name,
          path: skill.path,
          baseDir: skill.baseDir,
          digest: skill.digest,
          mode,
        },
      ],
    };

    return {
      type: "custom_message",
      customType: CUSTOM_MESSAGE_TYPE,
      content: "skill context",
      details,
      display: true,
    };
  }
});

describe("moveInvocationBeforeUser", () => {
  it("places an injected invocation before its user request for model context", () => {
    const user = { role: "user", content: [{ type: "text", text: "Use /code-review" }], timestamp: 1 };
    const invocation = {
      role: "custom",
      customType: CUSTOM_MESSAGE_TYPE,
      content: "skill body",
      display: true,
      timestamp: 2,
    };

    assert.deepEqual(moveInvocationBeforeUser([user, invocation] as never), [invocation, user]);
  });

  it("does not move unrelated custom messages", () => {
    const user = { role: "user", content: [{ type: "text", text: "hello" }], timestamp: 1 };
    const custom = {
      role: "custom",
      customType: "other-extension",
      content: "context",
      display: true,
      timestamp: 2,
    };

    assert.deepEqual(moveInvocationBeforeUser([user, custom] as never), [user, custom]);
  });
});
