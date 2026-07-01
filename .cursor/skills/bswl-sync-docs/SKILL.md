---
name: bswl-sync-docs
description: >-
  Sync BuildingSwell v2 Public API docs from server route code in the buildingswell
  repo. Extracts endpoints from Express routers and Zod models (not public-api.md),
  diffs against openapi.yaml and Mintlify pages, and applies updates to this docs repo.
  Use when API endpoints change, after merging server PRs, or when the user asks to
  bswl-sync-docs, update, regenerate, or sync API documentation.
---

# bswl-sync-docs

Keep this Mintlify site aligned with **live server code** in `BuildingSwell/buildingswell`.

## Hard rules

1. **Never use** `packages/server/docs/public-api.md` as source of truth.
2. **Always read** route files under `packages/server/src/v2/features/*/router.ts` and `packages/server/src/routes/v2.routes.ts`.
3. **Expand** `buildModelRouter()` calls using the factory rules in [reference.md](reference.md).
4. **Scope** to the public API surface documented today — exclude internal mounts (`insights`, `labs`, `dashboard`, `form-triggers`, `page-view`, `category`, `system-log`).
5. **Validate** after edits: `mint validate` (Node 20.17+).

## Repos

| Repo | Path (default) | Role |
|------|----------------|------|
| buildingswell | `../buildingswell` or `BUILDINGSWELL_ROOT` | API implementation |
| docs (this repo) | workspace root | Mintlify site |

## Workflow

Copy this checklist and track progress:

```
Sync progress:
- [ ] 1. Run extract-api-surface.mjs
- [ ] 2. Review drift report
- [ ] 3. Update openapi.yaml (paths, methods, schemas)
- [ ] 4. Update docs.json API reference navigation
- [ ] 5. Update resources/*.mdx field tables from Zod models
- [ ] 6. Update concepts/overview.mdx from concept registry if needed
- [ ] 7. mint validate
- [ ] 8. Summarize diff for the user
```

### Step 1 — Extract and diff

```bash
node .cursor/skills/bswl-sync-docs/scripts/extract-api-surface.mjs
# JSON output:
node .cursor/skills/bswl-sync-docs/scripts/extract-api-surface.mjs --json
# Include all factory CRUD routes in drift check:
node .cursor/skills/bswl-sync-docs/scripts/extract-api-surface.mjs --full
```

Exit code `0` = no actionable drift; `2` = custom endpoint or nav mismatch found.

Set `BUILDINGSWELL_ROOT` if the sibling clone is elsewhere.

### Step 2 — Interpret the report

| Report section | Action |
|----------------|--------|
| `missingCustomFromOpenApi` | **Priority** — add to `openapi.yaml` + `docs.json` nav |
| `extraInOpenApi` | Remove stale paths or verify code wasn't deleted |
| `missingFactoryFromOpenApi` | Informational unless `--full` — expand standard CRUD docs if desired |
| `missingFromDocsJsonNav` | Add `"METHOD /path"` entries to the matching API reference group in `docs.json` |
| `missingResourceMdx` | Create or restore `resources/<name>.mdx` |

See [reference.md](reference.md) for intentional omissions (e.g. worker hard-delete, notification writes).

### Step 3 — Update openapi.yaml

For each new endpoint:

1. Find the handler in the feature `router.ts` (and inline Zod in that file for custom bodies).
2. Add path + method under `paths:` following existing patterns in `openapi.yaml`.
3. Reuse shared parameters (`page`, `pageSize`, `filter`, …) and response schemas (`ListResponse`, `SingleResponse`, …).
4. **Quote YAML descriptions** that contain colons (e.g. `` 'Use `isArchived: true` to archive.' ``).
5. Use `app.buildingswell.com` as the server URL — not `<your-instance>`.

Factory-backed resources share CRUD shapes — copy from a sibling resource (e.g. `project`) and rename schemas.

### Step 4 — Update docs.json navigation

API reference groups live under `navigation.tabs` → tab `"API reference"`. Each group has:

```json
{
  "group": "Projects",
  "openapi": "openapi.yaml",
  "pages": ["GET /project", "POST /project", ...]
}
```

Keep page strings in sync with `openapi.yaml` paths. Use `{id}` param style matching OpenAPI.

### Step 5 — Update resource MDX pages

For each resource in `report.modelFiles`:

1. Read `packages/server/src/v2/features/<resource>/model.ts`.
2. Extract `schema` (response fields) and `createSchema` (writable fields) Zod shapes.
3. Also read `packages/server/src/v2/core/model/bswl-entity-model.ts` for base entity fields (`name`, `identifier`, `isArchived`).
4. Update the field table in `resources/<resource>.mdx` — preserve narrative prose, update tables.
5. For custom endpoints, read the handler's inline Zod in `router.ts`.

**Deliverable** also has nested resources:
- `deliverable-dependencies` → `v2/features/deliverable/dependency/model.ts`
- `deliverable-work-sessions` → `v2/features/deliverable/work-session/model.ts`

**Concepts** → read `packages/shared/src/v2/deliverable/concepts/registry.ts` and `describe.ts`, not a single model file. Update `concepts/overview.mdx`.

### Step 6 — Guides (only when behavior changes)

Update guide pages when query/filter/import semantics change in:
- `packages/server/src/v2/core/api/factory/index.ts`
- `packages/server/src/v2/core/api/factory/utils.ts`
- `packages/server/src/v2/core/api/filter-parser/`

Guides: `guides/querying.mdx`, `guides/standard-endpoints.mdx`, `guides/response-format.mdx`, `guides/group-and-count.mdx`, `guides/import-export.mdx`.

### Step 7 — Validate

```bash
mint validate
mint broken-links
```

Fix YAML syntax errors before committing.

## What to update vs leave alone

| Artifact | Auto-sync scope |
|----------|-----------------|
| `openapi.yaml` | Paths, methods, request/response schemas |
| `docs.json` | API reference `pages` arrays |
| `resources/*.mdx` | Field tables, endpoint lists |
| `concepts/overview.mdx` | Concept grammar, endpoints, data fields |
| `examples.mdx` | Add examples for notable new endpoints |
| `index.mdx`, guides | Only when user-facing behavior changes |

Do not rewrite narrative docs unless the underlying behavior changed.

## Applying the diff

When the user wants changes committed:

1. Show a concise summary: endpoints added/removed, files touched.
2. Group `openapi.yaml` + `docs.json` changes together (they must stay in sync).
3. Commit message format: `docs(api): sync <resource> endpoints from server`

## Additional resources

- Factory expansion rules, file map, intentional omissions: [reference.md](reference.md)
