# auth.md

## Authentication

The Vincle documentation is a fully public static site. No authentication,
registration, API key, or credential of any kind is required to read or
machine-read any of its content.

## Agent access

- All content is public over HTTPS; `User-agent: *` is allowed in `robots.txt`.
- AI training crawlers are blocked, and usage preferences are declared with
  `Content-Signal: ai-train=no, search=yes, ai-input=no`.
- No OAuth, OIDC, bearer tokens, or session state are used anywhere on this
  site, so there is nothing to register, request, or present.

## Machine-readable content

| Path                                   | Content                                                          |
| -------------------------------------- | ---------------------------------------------------------------- |
| `/llms.txt`                            | Index of all documentation pages                                 |
| `/llms-full.txt`                       | Every page as plain text                                         |
| `/search-index.json`                   | Full-text search index (`{ url, title, text }`)                  |
| `/<page>.md`                           | Any page as Markdown, e.g. `/guide/views.md` (home: `/index.md`) |
| `/.well-known/ai-catalog.json`         | ARD manifest of the site's agentic resources                     |
| `/.well-known/agent-skills/index.json` | Agent skills discovery index                                     |
