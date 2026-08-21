import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { escapeAttribute, listSkills, loadSkill, stripFrontmatter } from "../src/skills.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("listSkills", () => {
  it("returns sorted skill commands with canonical source paths", () => {
    const sourceInfo = {
      path: "/skills/zeta/SKILL.md",
      source: "test",
      scope: "temporary" as const,
      origin: "top-level" as const,
      baseDir: "/skills/zeta",
    };
    const commands = [
      { name: "skill:zeta", source: "skill", description: "Zeta", sourceInfo },
      {
        name: "skill:alpha",
        source: "skill",
        description: "Alpha",
        sourceInfo: { ...sourceInfo, path: "/skills/alpha/SKILL.md", baseDir: "/skills/alpha" },
      },
      { name: "model", source: "extension", description: "Not a skill", sourceInfo },
    ];

    assert.deepEqual(listSkills(commands).map((skill) => skill.name), ["alpha", "zeta"]);
  });
});

describe("skill file loading", () => {
  it("normalizes line endings, strips frontmatter, and hashes the body", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-inline-skills-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "SKILL.md");
    await writeFile(path, "---\r\nname: test\r\ndescription: Test\r\n---\r\n# Test\r\n\r\nBody\r\n");

    const loaded = await loadSkill({
      name: "test",
      description: "Test",
      path,
      baseDir: directory,
      sourceInfo: {
        path,
        source: "test",
        scope: "temporary",
        origin: "top-level",
        baseDir: directory,
      },
    });

    assert.equal(loaded.body, "# Test\n\nBody");
    assert.match(loaded.digest, /^[a-f0-9]{64}$/);
  });

  it("leaves markdown without frontmatter intact", () => {
    assert.equal(stripFrontmatter("# Skill\r\nBody\r\n"), "# Skill\nBody\n");
  });
});

describe("escapeAttribute", () => {
  it("escapes XML-sensitive characters", () => {
    assert.equal(escapeAttribute('a&b"<c>'), "a&amp;b&quot;&lt;c&gt;");
  });
});
