import { CustomEditor, type ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import type { EditorComponent } from "@earendil-works/pi-tui";
import { findInlineSkillCompletion } from "./invocations.js";
export type InlineEditorFactory = NonNullable<Parameters<ExtensionUIContext["setEditorComponent"]>[0]>;

type InlineAutocompleteEditor = EditorComponent & {
  getLines?: () => string[];
  getCursor?: () => { line: number; col: number };
  isShowingAutocomplete?: () => boolean;
  tryTriggerAutocomplete?: (explicitTab?: boolean) => void;
};

const inlineEditorFactories = new WeakSet<InlineEditorFactory>();

export function isInlineAutocompleteEditorFactory(factory: InlineEditorFactory | undefined): boolean {
  return factory !== undefined && inlineEditorFactories.has(factory);
}

export function createInlineAutocompleteEditorFactory(
  current: InlineEditorFactory | undefined,
): InlineEditorFactory {
  const base = current ?? ((tui, theme, keybindings) => new CustomEditor(tui, theme, keybindings));
  const factory: InlineEditorFactory = (tui, theme, keybindings) =>
    wrapInlineAutocompleteEditor(base(tui, theme, keybindings));
  inlineEditorFactories.add(factory);
  return factory;
}

export function wrapInlineAutocompleteEditor(editor: EditorComponent): EditorComponent {
  const candidate = editor as InlineAutocompleteEditor;
  const handleInput = editor.handleInput.bind(editor);

  editor.handleInput = (data: string) => {
    handleInput(data);
    if (!/^[a-zA-Z0-9/-]$/.test(data)) return;

    if (
      typeof candidate.getLines !== "function" ||
      typeof candidate.getCursor !== "function" ||
      typeof candidate.tryTriggerAutocomplete !== "function" ||
      candidate.isShowingAutocomplete?.()
    ) {
      return;
    }

    const lines = candidate.getLines();
    const cursor = candidate.getCursor();
    const beforeCursor = (lines[cursor.line] ?? "").slice(0, cursor.col);
    if (findInlineSkillCompletion(beforeCursor)) {
      // Pi 0.84.2 filters "/" from custom triggerCharacters, so ask its editor
      // to run the already-registered provider when an inline token is present.
      candidate.tryTriggerAutocomplete();
    }
  };

  return editor;
}
