# Programming language logos

Brand marks for the languages shown in the docs: on code block headers and
language tabs, in the SDK table and on the SDK card of the docs home. The build
copies this folder to `site/languages/` (served at `/docs/languages/`), and pages
load each mark as an `<img>`, so nothing points at a third-party host at runtime.

The local icon library (`hicon/icon-library`) was checked first. It has line
icons for Python, Java and JavaScript only, drawn in the Iconsax style rather
than the official marks, so every language uses its brand mark instead.

Every file comes from SVGL (https://svgl.app), fetched with
`https://api.svgl.app/svg/<file>.svg` after finding the entry with
`https://api.svgl.app?search=<name>`. The one change to each file is an added
`xmlns="http://www.w3.org/2000/svg"` on the root element (SVGL serves them
without it, and a browser will not draw an SVG in an `<img>` without it).
`<name>_dark.svg` is SVGL's variant for dark backgrounds: code block headers are
dark in both themes, so they always use it; light surfaces switch with the theme.

| File | Language | SVGL entry | Trademark note |
| --- | --- | --- | --- |
| `typescript.svg` | TypeScript | https://api.svgl.app/svg/typescript.svg | TypeScript is a trademark of Microsoft Corporation. |
| `javascript.svg` | JavaScript | https://api.svgl.app/svg/javascript.svg | JavaScript is a trademark of Oracle Corporation; the JS logo is the community mark. |
| `python.svg` | Python | https://api.svgl.app/svg/python.svg | "Python" and the Python logos are trademarks of the Python Software Foundation (https://www.python.org/psf/trademarks/). |
| `golang.svg`, `golang_dark.svg` | Go | https://api.svgl.app/svg/golang.svg, https://api.svgl.app/svg/golang_dark.svg (search "Go") | The Go logo is a trademark of Google LLC (https://go.dev/brand). |
| `dotnet.svg` | .NET | https://api.svgl.app/svg/dotnet.svg (search ".net", entry "Microsoft .NET") | .NET is a trademark of Microsoft Corporation. |
| `java.svg` | Java | https://api.svgl.app/svg/java.svg | Java is a registered trademark of Oracle and/or its affiliates. |
| `rust.svg`, `rust_dark.svg` | Rust | https://api.svgl.app/svg/rust.svg, https://api.svgl.app/svg/rust_dark.svg | The Rust logo is a trademark of the Rust Foundation (https://rustfoundation.org/policy/rust-trademark-policy/). |
| `ruby.svg` | Ruby | https://api.svgl.app/svg/ruby.svg | The Ruby logo is (c) Yukihiro Matsumoto, licensed under CC BY-SA 2.5. |
| `php.svg`, `php_dark.svg` | PHP | https://api.svgl.app/svg/php.svg, https://api.svgl.app/svg/php_dark.svg | The PHP logo is by Colin Viebrock, licensed under CC BY-SA 4.0. |
| `swift.svg` | Swift | https://api.svgl.app/svg/swift.svg | Swift and the Swift logo are trademarks of Apple Inc. |

Each mark is a trademark of its owner, used only to say which language a code
sample or SDK is for. It does not imply endorsement of OpenSMS by any of them.

Downloaded 2026-09-24. To refresh a mark, fetch it again from its SVGL URL and
add the `xmlns` attribute back.
