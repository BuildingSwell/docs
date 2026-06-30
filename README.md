# BuildingSwell API docs (Mintlify)

Mintlify documentation for the BuildingSwell v2 Public API.

## Preview locally

Requires [Node.js 20.17+](https://nodejs.org/) and the Mintlify CLI:

```bash
npm i -g mint
mint dev
```

Open the URL printed by `mint dev` (typically `http://localhost:3000`).

## Validate

```bash
mint validate
mint broken-links
```

## Deploy to Mintlify

1. Sign in at [mintlify.com](https://mintlify.com) and create a project (or open an existing one).
2. Connect this GitHub repository.
3. Deploy — Mintlify builds from `docs.json` and `openapi.yaml` at the repository root.

### Mintlify dashboard MCP (optional)

If the Mintlify MCP server is enabled in Cursor Settings, you can use `checkout` → edit → `save` to open a PR from the editor. The server requires OAuth on first use.

## Structure

| Path | Purpose |
|------|---------|
| `docs.json` | Site config, navigation, API playground |
| `openapi.yaml` | OpenAPI 3.0 spec for the API reference tab |
| `index.mdx` | Landing page |
| `getting-started/` | Auth and rate limits |
| `guides/` | Querying, responses, standard endpoints |
| `resources/` | Per-resource field and endpoint docs |
| `concepts/` | Domain concepts layer |
| `api-reference/` | API reference tab overview |
| `images/logo/` | BuildingSwell logos |
