import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  findExpandedSkillNames,
  findInlineSkillCompletion,
  findInlineSkillInvocations,
} from "../src/invocations.js";

const known = new Set(["code-review", "semgrep", "skill"]);
const skills = Array.from(known, (name) => ({ name }));

describe("findInlineSkillInvocations", () => {
  it("finds known skills in the middle of a prompt", () => {
    assert.deepEqual(
      findInlineSkillInvocations("Use /code-review and /semgrep for this change", known).map(({ name }) => name),
      ["code-review", "semgrep"],
    );
  });

  it("leaves the leading slash position to Pi", () => {
    assert.deepEqual(findInlineSkillInvocations("/code-review check this change", known), []);
  });

  it("can still find a later skill after a native leading invocation", () => {
    assert.deepEqual(
      findInlineSkillInvocations("/code-review use /semgrep too", known).map(({ name }) => name),
      ["semgrep"],
    );
  });

  it("ignores pi-skillful syntax", () => {
    assert.deepEqual(findInlineSkillInvocations("Use /skill:code-review here", known), []);
  });

  it("ignores escaped, unknown, URL, and path-like markers", () => {
    const text = String.raw`Use \/code-review, /unknown, https://example.com, and src/code-review`;
    assert.deepEqual(findInlineSkillInvocations(text, known), []);
  });

  it("deduplicates repeated invocations while preserving order", () => {
    assert.deepEqual(
      findInlineSkillInvocations("Use /semgrep, /code-review, then /semgrep", known).map(({ name }) => name),
      ["semgrep", "code-review"],
    );
  });
});

describe("findInlineSkillCompletion", () => {
  it("offers completion for an inline skill prefix", () => {
    assert.deepEqual(findInlineSkillCompletion("Please use /code-r", skills), {
      fragment: "code-r",
      prefix: "/code-r",
      markerStart: 11,
    });
  });

  it("supports a prefix immediately after CJK text", () => {
    assert.equal(findInlineSkillCompletion("\u8bf7\u7528/code-", skills)?.prefix, "/code-");
  });

  it("does not replace Pi's leading command completion", () => {
    assert.equal(findInlineSkillCompletion("/code-r", skills), undefined);
  });

  it("falls through when no skill matches", () => {
    assert.equal(findInlineSkillCompletion("Open /usr/loc", skills), undefined);
  });

  it("ignores escaped prefixes", () => {
    assert.equal(findInlineSkillCompletion(String.raw`Use \/code-`, skills), undefined);
  });

  it("offers all skills when the inline slash trigger is typed", () => {
    assert.deepEqual(findInlineSkillCompletion("Use /", skills), {
      fragment: "",
      prefix: "/",
      markerStart: 4,
    });
  });
});

describe("findExpandedSkillNames", () => {
  it("extracts native skill blocks for duplicate protection", () => {
    const prompt = '<skill name="code-review" location="/tmp/SKILL.md">\nbody\n</skill>';
    assert.deepEqual(findExpandedSkillNames(prompt), new Set(["code-review"]));
  });
});
