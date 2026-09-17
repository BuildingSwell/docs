# Maintaining the API reference

The API implementation lives in `BuildingSwell/buildingswell`; this repository publishes independently. Update both the resource guide and `openapi.yaml`, then register pages and operations in `docs.json`.

For a resource change, check:

1. The v2 route mount, custom routes, and factory options (`readOnly`, `deleteArchives`, request-schema overrides).
2. Read/create schemas, inherited fields, model hooks, and database views. A schema accepting a field does not prove that every write is allowed.
3. Feature flags, API-key permissions, ownership rules, archive behavior, and response envelopes.
4. Query examples, nested fields, units, and computed/read-only fields. Keep examples compatible with the implementation revision being documented.
5. `mint validate` and `mint broken-links`, plus OpenAPI schema/reference validation. Use an isolated preview workspace when a shared Mintlify cache is in use.

The September 17, 2026 audit compared docs commit `79b4566` with product commit `1cea24f27` and the BUFI-4147 brief. It added custom properties, materials/inventory, delivery, and organization lists; corrected rounded-time semantics, archived timestamps, Documents Hub, deliverable groups, and query behavior; and included item-vendor/project-contact relationships.

One requested product change is still outstanding at that revision: order writes silently drop `data.properties` when `customPropertiesEnabled` is disabled. The public guide documents that behavior. Change the guide to promise an error only when the server-side fix ships. Documentation validation does not verify deployment state or exercise a live customer API.
