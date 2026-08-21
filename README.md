# pi-inline-skills

Invoke [Pi](https://pi.dev/) skills anywhere in a prompt with short `/skill-name` mentions.

```text
Use /code-review and /semgrep to inspect this change.
```

`pi-inline-skills` keeps the original user message intact, injects the selected skill instructions as a separate context message, renders that message compactly in the TUI, and completes skill names while you type.

## Features

- Invoke one or more loaded skills anywhere except the leading slash-command position.
- Keep the exact prompt text in session history and when forking back to a message.
- Render invoked skills as a compact `[skills] code-review, semgrep` context message.
- Complete inline skill names without taking over Pi's command or file-path completion.
- Reuse an active skill by content digest instead of injecting its full body repeatedly.
- Reinject a skill after compaction, branching, or a file change removes or invalidates the active definition.
- Coexist with [`pi-skillful`](https://pi.dev/packages/pi-skillful).

## Installation

Install directly from GitHub:

```bash
pi install git:github.com/vimsucks/pi-inline-skills
```

Install for one project only:

```bash
pi install -l git:github.com/vimsucks/pi-inline-skills
```

Run without installing:

```bash
pi -e git:github.com/vimsucks/pi-inline-skills
```

## Usage

Mention any loaded skill by its name:

```text
Please use /code-review to review the current branch.
```

Invoke multiple skills in one request:

```text
Use /code-review and /semgrep to inspect this change.
```

Inline skill mentions must be preceded by a space or tab. Start typing a known skill name to open completion:

```text
Review this with /code-r
```

Selecting the suggestion inserts `/code-review `, including a trailing space. Once an inline skill token starts, its completion list contains only matching skills and never falls back to file suggestions.

Pi 0.84.2 does not expose inline `/` as a custom autocomplete trigger. The extension therefore wraps the active editor component and requests the registered provider when an inline skill token is typed. Existing custom editor factories registered before this extension are preserved; editors without Pi's autocomplete request capability still retain manual Tab completion.

### Command ownership

The leading slash-command position is reserved for Pi and other command providers. Inline positions belong to this extension.

| Input | Owner |
| --- | --- |
| `/skill:code-review check this change` | Pi's native skill command |
| `Use /code-review for this change` | `pi-inline-skills` |
| `/some-command also use /semgrep` | Command provider for the leading token; this extension for `semgrep` |
| `Explain/code-review` | Plain text; missing whitespace before `/` |
| `Use /skill:code-review` | `pi-skillful` |

This extension only recognizes whitespace-delimited `/<known-skill-name>` mentions after non-whitespace text on the same line. Standard Pi registers skills as `/skill:name`; a direct leading alias such as `/code-review` works only when another installed command provider supplies it. The extension deliberately ignores `/skill:name`, unknown names, escaped mentions such as `\/code-review`, URLs, and path-like tokens.

## How it works

1. The `input` event detects known inline skill mentions and returns `continue`, preserving the exact user text.
2. `before_agent_start` loads the requested `SKILL.md` files and injects one `pi-inline-skills` custom message.
3. A `context` handler places that custom message immediately before its request in model context while leaving transcript order unchanged.
4. A message renderer displays the invocation as a compact `[skills] ...` row.
5. An autocomplete provider offers matching skills only in inline positions and delegates every other case to Pi.

Pi converts custom messages to user-role messages before provider serialization, so the injected instructions participate in model context and session compaction.

### Deduplication

Each loaded skill body receives a SHA-256 digest. The first invocation injects the full skill:

```xml
<skill name="code-review" digest="sha256:...">
  ...skill instructions...
</skill>
```

A later invocation reuses the active definition with a small reference:

```xml
<skill-ref name="code-review" digest="sha256:...">
  Apply the previously loaded skill to the current request.
</skill-ref>
```

Only full definitions in Pi's effective, compaction-aware context count as active. If compaction removes the definition, a branch predates it, or the file digest changes, the extension injects the full skill again.

## Compatibility with pi-skillful

The packages use separate inline syntaxes:

- `pi-inline-skills`: `/code-review`
- `pi-skillful`: `/skill:code-review`

`pi-inline-skills` never handles `/skill:name`, so both packages can remain installed. When Pi expands a leading native skill command, duplicate protection also prevents this extension from injecting the same skill again.

## Streaming prompts

Steering and follow-up messages are already inside an active agent run. Pi currently has no public API for atomically queueing a custom context message together with its user message, and separate queue items are unsafe in `one-at-a-time` mode.

When an inline mention appears in a steering or follow-up message, the extension leaves the text unchanged and shows a warning in the TUI. Submit requests that require inline skill injection when Pi is idle.

## Development

Requirements:

- Node.js 22.19 or newer
- npm

```bash
npm install
npm run check
npm test
npm run pack:dry-run
```

For local testing:

```bash
pi -e ./extensions/index.ts
```

## Security

Pi extensions run with the user's full system permissions. Review extension source before installation. This extension reads only `SKILL.md` files already registered by Pi and does not execute skill files itself.

## License

MIT
