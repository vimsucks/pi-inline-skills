import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { EditorComponent } from "@earendil-works/pi-tui";
import { wrapInlineAutocompleteEditor } from "../src/editor.js";

function createEditor(initialText: string) {
  let text = initialText;
  let triggerCount = 0;
  let showingAutocomplete = false;

  const editor = {
    handleInput(data: string) {
      text += data;
    },
    getText() {
      return text;
    },
    setText(value: string) {
      text = value;
    },
    getLines() {
      return text.split("\n");
    },
    getCursor() {
      const lines = text.split("\n");
      return { line: lines.length - 1, col: lines.at(-1)?.length ?? 0 };
    },
    isShowingAutocomplete() {
      return showingAutocomplete;
    },
    tryTriggerAutocomplete() {
      triggerCount += 1;
    },
    render() {
      return [];
    },
    invalidate() {},
  };

  return {
    editor: editor as unknown as EditorComponent,
    getTriggerCount: () => triggerCount,
    setShowingAutocomplete: (value: boolean) => {
      showingAutocomplete = value;
    },
  };
}

describe("wrapInlineAutocompleteEditor", () => {
  it("requests suggestions after an inline slash is entered", () => {
    const harness = createEditor("\u4ecb\u7ecd\u4e00\u4e0b ");
    const editor = wrapInlineAutocompleteEditor(harness.editor);

    editor.handleInput("/");

    assert.equal(harness.getTriggerCount(), 1);
  });

  it("does not request suggestions without preceding whitespace", () => {
    const harness = createEditor("\u4ecb\u7ecd\u4e00\u4e0b");
    const editor = wrapInlineAutocompleteEditor(harness.editor);

    editor.handleInput("/");

    assert.equal(harness.getTriggerCount(), 0);
  });

  it("does not request inline suggestions at the leading command position", () => {
    const harness = createEditor("");
    const editor = wrapInlineAutocompleteEditor(harness.editor);

    editor.handleInput("/");

    assert.equal(harness.getTriggerCount(), 0);
  });

  it("lets an open suggestion list handle subsequent characters", () => {
    const harness = createEditor("Use /");
    harness.setShowingAutocomplete(true);
    const editor = wrapInlineAutocompleteEditor(harness.editor);

    editor.handleInput("c");

    assert.equal(harness.getTriggerCount(), 0);
  });

  it("does not reopen suggestions after a non-text key", () => {
    const harness = createEditor("Use /code-");
    const editor = wrapInlineAutocompleteEditor(harness.editor);

    editor.handleInput("\u001b");

    assert.equal(harness.getTriggerCount(), 0);
  });
});
