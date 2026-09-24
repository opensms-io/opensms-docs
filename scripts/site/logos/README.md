Brand logos vendored from [SVGL](https://svgl.app), one file per logo, used through the
`logo()` and `themedLogo()` helpers in `../logos.mjs`. They are served as content-hashed files
and drawn with `<img>`, never inlined. Retrieved on 2026-09-24 from
`https://api.svgl.app/svg/<file>` (the API needs a `User-Agent` header). All trademarks belong to
their owners; the logos only identify the language or product named next to them.

Every file had `xmlns="http://www.w3.org/2000/svg"` added to its root element (SVGL omits it,
and an `<img>` will not draw an SVG without it). Other changes are listed per file.

## `lang/`: code block headers

Code blocks are dark in both site themes, so where SVGL has a dark-surface variant, that is the
file vendored.

| File | SVGL title | Source file | Changes |
|---|---|---|---|
| `bash.svg` | Bash | `bash_dark.svg` | none |
| `csharp.svg` | C# | `csharp.svg` | none |
| `dotnet.svg` | Microsoft .NET | `dotnet.svg` | none |
| `go.svg` | Go | `golang_dark.svg` | none |
| `java.svg` | Java | `java.svg` | none |
| `javascript.svg` | JavaScript | `javascript.svg` | none |
| `json.svg` | JSON | `json.svg` | none |
| `kotlin.svg` | Kotlin | `kotlin.svg` | none |
| `nodejs.svg` | Node.js | `nodejs.svg` | none |
| `php.svg` | Php | `php_dark.svg` | none |
| `python.svg` | Python | `python.svg` | none |
| `ruby.svg` | Ruby | `ruby.svg` | none |
| `rust.svg` | Rust | `rust_dark.svg` | none |
| `swift.svg` | Swift | `swift.svg` | none |
| `typescript.svg` | TypeScript | `typescript.svg` | none |

Formats with no brand mark (`http`, `text`, `csv`) use the Iconsax `document-code` icon from
`../icons` instead. cURL has no SVGL logo; shell samples use the Bash mark.

## `ai/`: AI assistants on the MCP setup page

Used only where a page tells readers how to connect that assistant (`integrate/mcp.md`). A
`-dark` file is shown in the dark theme.

| File | SVGL title | Source file | Changes |
|---|---|---|---|
| `claude.svg` | Claude AI | `claude-ai-icon.svg` | none (also used for Claude Code) |
| `openai.svg` | OpenAI | `openai.svg` | none (ChatGPT) |
| `openai-dark.svg` | OpenAI | `openai_dark.svg` | none |
| `cursor.svg` | Cursor | `cursor_light.svg` | none |
| `cursor-dark.svg` | Cursor | `cursor_light.svg` | SVGL serves the same black mark as `cursor_dark.svg`; `fill="#fff"` added to the path |
| `vscode.svg` | Visual Studio Code | `vscode.svg` | none |
| `windsurf.svg` | Windsurf | `windsurf-light.svg` | none |
| `windsurf-dark.svg` | Windsurf | `windsurf-dark.svg` | none |
| `zed.svg` | Zed | `zed-logo.svg` | `fill="currentColor"` set to `#000` (an `<img>` has no current colour) |
| `zed-dark.svg` | Zed | `zed-logo_dark.svg` | none |
