import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  findExpandedSkillNames,
  findInlineSkillCompletion,
  findInlineSkillInvocations,
} from "../src/invocations.js";

const known = new Set(["code-review", "semgrep", "skill"]);

describe("findInlineSkillInvocations", () => {
  it("finds known skills in the middle of a prompt", () => {
    assert.deepEqual(
      findInlineSkillInvocations("Use /code-review and /semgrep for this change", known).map(({ name }) => name),
      ["code-review", "semgrep"],
    );
  });

  it("requires whitespace before an inline invocation", () => {
    assert.deepEqual(findInlineSkillInvocations("\u4ecb\u7ecd\u4e00\u4e0b/code-review", known), []);
    assert.deepEqual(findInlineSkillInvocations("\u4ecb\u7ecd\u4e00\u4e0b /code-review", known).map(({ name }) => name), [
      "code-review",
    ]);
  });

  it("leaves the leading slash position to Pi", () => {
    assert.deepEqual(findInlineSkillInvocations("/code-review check this change", known), []);
    assert.deepEqual(findInlineSkillInvocations("  /code-review check this change", known), []);
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
    const text = String.raw`Use \/code-review, /unknown, https://example.com, src/code-review, ./code-review, ~/code-review, and http:/code-review`;
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
    assert.deepEqual(findInlineSkillCompletion("Please use /code-r"), {
      fragment: "code-r",
      prefix: "/code-r",
      markerStart: 11,
    });
  });

  it("requires whitespace before an inline completion", () => {
    assert.equal(findInlineSkillCompletion("\u4ecb\u7ecd\u4e00\u4e0b/code-"), undefined);
    assert.equal(findInlineSkillCompletion("\u4ecb\u7ecd\u4e00\u4e0b /code-")?.prefix, "/code-");
  });

  it("does not replace Pi's leading command completion", () => {
    assert.equal(findInlineSkillCompletion("/code-r"), undefined);
    assert.equal(findInlineSkillCompletion("  /code-r"), undefined);
  });

  it("recognizes an inline token before skill filtering", () => {
    assert.equal(findInlineSkillCompletion("Open /unknown")?.prefix, "/unknown");
  });

  it("ignores escaped prefixes", () => {
    assert.equal(findInlineSkillCompletion(String.raw`Use \/code-`), undefined);
  });

  it("ignores path-like and URL-like prefixes", () => {
    for (const input of ["Open ./code-", "Open ~/code-", "See http:/code-"]) {
      assert.equal(findInlineSkillCompletion(input), undefined);
    }
  });

  it("offers all skills when the inline slash trigger is typed", () => {
    assert.deepEqual(findInlineSkillCompletion("Use /"), {
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
