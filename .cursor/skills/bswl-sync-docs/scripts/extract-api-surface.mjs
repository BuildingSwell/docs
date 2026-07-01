#!/usr/bin/env node
/**
 * Extract v2 Public API endpoints from buildingswell server source and diff
 * against this docs repo (openapi.yaml + docs.json navigation).
 *
 * Usage:
 *   node .cursor/skills/bswl-sync-docs/scripts/extract-api-surface.mjs
 *   BUILDINGSWELL_ROOT=/path/to/buildingswell node ...
 *   node ... --json
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_ROOT = path.resolve(__dirname, "../../../..");
const DEFAULT_BSWL_ROOT = path.resolve(DOCS_ROOT, "../buildingswell");

const PUBLIC_MOUNTS = new Set([
  "deliverable",
  "project",
  "comment",
  "notification",
  "qc-inspection-set",
  "qc-template",
  "stage",
  "document",
  "note",
  "timesheet",
  "worker",
  "role",
  "organization-member",
  "api-key",
  "concepts",
]);

/** Endpoints implemented in code but intentionally omitted from public docs */
const INTENTIONAL_DOC_OMISSIONS = new Set([
  "DELETE /worker/{id}",
  "DELETE /worker/bulk",
  "POST /notification",
  "PATCH /notification/{id}",
  "PUT /notification/{id}",
  "DELETE /notification/{id}",
  "POST /notification/query",
  "POST /notification/count",
  "GET /notification/count",
  "POST /notification/group-and-count",
  "PATCH /notification/bulk",
  "PUT /notification/bulk",
  "POST /role/test",
  "DELETE /role/test",
  "GET /qc-template/by-template",
  "GET /timesheet/count",
  "POST /timesheet/count",
  "GET /organization-member/export",
  "POST /organization-member/import",
  "GET /organization-member/export/json",
  "POST /organization-member/import/json",
  "DELETE /organization-member/{id}",
  "DELETE /organization-member/bulk",
  "PATCH /organization-member/bulk",
  "PUT /organization-member/bulk",
  "PUT /organization-member/{id}",
  "POST /api-key/count",
  "GET /api-key/count",
  "POST /api-key/query",
  "POST /api-key/group-and-count",
]);

const MOUNT_TO_ROUTER = {
  deliverable: "v2/features/deliverable/router.ts",
  project: "v2/features/project/router.ts",
  comment: "v2/features/comment/router.ts",
  notification: "v2/features/notification/router.ts",
  "qc-inspection-set": "v2/features/qc-inspection-set/router.ts",
  "qc-template": "v2/features/qc_template/router.ts",
  stage: "v2/features/stage/router.ts",
  document: "v2/features/document/router.ts",
  note: "v2/features/note/router.ts",
  timesheet: "v2/features/timesheet/router.ts",
  worker: "v2/features/worker/router.ts",
  role: "v2/features/role/router.ts",
  "organization-member": "v2/features/organization-member/router.ts",
  "api-key": "v2/features/api-key/router.ts",
  concepts: "v2/features/concepts/router.ts",
};

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"];

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function exists(filePath) {
  return fs.existsSync(filePath);
}

function normalizeOpenApiPath(routePath) {
  const withParams = routePath
    .replace(/:([A-Za-z0-9_]+)/g, "{$1}")
    .replace(/\/{2,}/g, "/");
  if (withParams.length > 1 && withParams.endsWith("/")) {
    return withParams.slice(0, -1);
  }
  return withParams;
}

function endpointKey(method, routePath) {
  return `${method.toUpperCase()} ${normalizeOpenApiPath(routePath)}`;
}

function expandFactoryRoutes(options = {}) {
  const {
    readOnly = false,
    enableImportExport = false,
    enableJsonImportExport = false,
    includeDelete = true,
  } = options;

  const routes = [];

  routes.push(
    { method: "get", path: "/" },
    { method: "post", path: "/query" },
    { method: "get", path: "/:id" },
    { method: "get", path: "/count" },
    { method: "post", path: "/count" },
    { method: "post", path: "/group-and-count" }
  );

  if (!readOnly) {
    routes.push(
      { method: "post", path: "/" },
      { method: "patch", path: "/bulk" },
      { method: "patch", path: "/:id" },
      { method: "put", path: "/bulk" },
      { method: "put", path: "/:id" }
    );
    if (includeDelete) {
      routes.push({ method: "delete", path: "/:id" });
    }
    if (enableImportExport) {
      routes.push(
        { method: "get", path: "/export" },
        { method: "post", path: "/import" }
      );
    }
    if (enableJsonImportExport) {
      routes.push(
        { method: "get", path: "/export/json" },
        { method: "post", path: "/import/json" }
      );
    }
  }

  return routes;
}

function parseFactoryOptions(source) {
  const options = {
    readOnly: /\breadOnly:\s*true\b/.test(source),
    enableImportExport: /\benableImportExport:\s*true\b/.test(source),
    enableJsonImportExport: /\benableJsonImportExport:\s*true\b/.test(source),
    includeDelete: !/\bforbidHardDelete\b/.test(source),
  };
  return options;
}

function parseFactoryRoutesForSymbol(source) {
  const factoryBySymbol = new Map();
  const add = (sym, route) => {
    if (!factoryBySymbol.has(sym)) factoryBySymbol.set(sym, []);
    factoryBySymbol.get(sym).push(route);
  };

  for (const m of source.matchAll(
    /const\s+(\w+)\s*=\s*buildModelRouter\(\{([\s\S]*?)\}\)/g
  )) {
    const block = m[2];
    const targetSym = block.match(/\brouter:\s*(\w+)/)?.[1] ?? m[1];
    const opts = parseFactoryOptions(block);
    for (const r of expandFactoryRoutes(opts)) add(targetSym, r);
  }

  for (const m of source.matchAll(/buildModelRouter\(\{([\s\S]*?)\}\)/g)) {
    const before = source.slice(Math.max(0, m.index - 40), m.index);
    if (/const\s+\w+\s*=\s*$/.test(before)) continue;
    const block = m[1];
    const routerSym = block.match(/\brouter:\s*(\w+)/)?.[1] ?? "router";
    const opts = parseFactoryOptions(block);
    for (const r of expandFactoryRoutes(opts)) add(routerSym, r);
  }

  return factoryBySymbol;
}

function parseExplicitRoutesForSymbol(source) {
  const explicitBySymbol = new Map();
  for (const m of source.matchAll(
    /\b(\w+)\.(get|post|put|patch|delete)\(\s*["']([^"']+)["']/g
  )) {
    const sym = m[1];
    if (!explicitBySymbol.has(sym)) explicitBySymbol.set(sym, []);
    explicitBySymbol.get(sym).push({ method: m[2], path: m[3] });
  }
  return explicitBySymbol;
}

function resolveNestedRouterFile(parentSource, symbol, bswlRoot, parentFile) {
  const importRe = new RegExp(
    `import\\s+\\{[^}]*\\b${symbol}\\b[^}]*\\}\\s+from\\s+["']([^"']+)["']`
  );
  const match = parentSource.match(importRe);
  if (!match) return null;

  const relImport = match[1].replace(/\.js$/, ".ts");
  const parentDir = path.dirname(parentFile);
  const resolved = path.normalize(path.join(parentDir, relImport));
  if (exists(resolved)) return resolved;

  const tail = relImport.replace(/^\.\//, "");
  const featuresRoot = path.join(bswlRoot, "packages/server/src/v2/features");
  for (const dir of fs.readdirSync(featuresRoot)) {
    const full = path.join(featuresRoot, dir, tail);
    if (exists(full)) return full;
  }
  return null;
}

function emitSymbolRoutes(
  sym,
  pathBase,
  factoryBySymbol,
  explicitBySymbol,
  endpoints
) {
  const routes = [
    ...(factoryBySymbol.get(sym) ?? []),
    ...(explicitBySymbol.get(sym) ?? []),
  ];
  for (const route of routes) {
    endpoints.add(endpointKey(route.method, joinPaths(pathBase, route.path)));
  }
}

function collectRoutesFromFile(
  filePath,
  basePath,
  bswlRoot,
  visited = new Set(),
  { factory = true, explicit = true } = {}
) {
  const abs = path.resolve(filePath);
  if (visited.has(abs)) return [];
  visited.add(abs);

  const source = read(abs);
  const endpoints = new Set();
  const factoryBySymbol = factory ? parseFactoryRoutesForSymbol(source) : new Map();
  const explicitBySymbol = explicit
    ? parseExplicitRoutesForSymbol(source)
    : new Map();

  if (factory || explicit) {
    emitSymbolRoutes(
      "router",
      basePath,
      factoryBySymbol,
      explicitBySymbol,
      endpoints
    );
  }

  for (const m of source.matchAll(
    /\brouter\.use\(\s*["']([^"']+)["']\s*,\s*(\w+)/g
  )) {
    const subPath = m[1];
    const sym = m[2];
    const nestedBase = joinPaths(basePath, subPath);
    const nestedFile = resolveNestedRouterFile(source, sym, bswlRoot, abs);

    if (nestedFile) {
      for (const ep of collectRoutesFromFile(
        nestedFile,
        nestedBase,
        bswlRoot,
        visited,
        { factory, explicit }
      )) {
        endpoints.add(ep);
      }
    } else if (
      factoryBySymbol.has(sym) ||
      explicitBySymbol.has(sym)
    ) {
      emitSymbolRoutes(
        sym,
        nestedBase,
        factoryBySymbol,
        explicitBySymbol,
        endpoints
      );
    }
  }

  // Routers that merge into router via buildModelRouter({ router: baseRouter })
  for (const [sym] of factoryBySymbol) {
    if (sym === "router" || sym === "dependencyRouter") continue;
    if (source.includes(`router: ${sym}`)) {
      emitSymbolRoutes(sym, basePath, factoryBySymbol, explicitBySymbol, endpoints);
    }
  }

  return [...endpoints];
}

function isFactoryRoute(endpoint) {
  const [method, pathPart] = endpoint.split(" ");
  const factorySuffixes = [
    "/count",
    "/query",
    "/group-and-count",
    "/bulk",
    "/export",
    "/import",
    "/export/json",
    "/import/json",
  ];
  if (method === "GET" && pathPart.endsWith("/{id}")) return true;
  if (method === "GET" && !pathPart.includes("{")) {
    const segments = pathPart.split("/").filter(Boolean);
    if (segments.length === 1) return true;
  }
  if (method === "POST" && pathPart.match(/\/[^/]+$/)) {
    const last = pathPart.split("/").pop();
    if (!last?.includes("{") && last !== "query" && last !== "count") {
      if (pathPart.endsWith("/import") || pathPart.endsWith("/group-and-count"))
        return true;
      const depth = pathPart.split("/").filter(Boolean).length;
      if (depth === 1) return true;
    }
  }
  if (
    ["PATCH", "PUT", "DELETE"].includes(method) &&
    (pathPart.endsWith("/{id}") || pathPart.endsWith("/bulk"))
  ) {
    return true;
  }
  if (factorySuffixes.some((s) => pathPart.endsWith(s))) return true;
  return false;
}

function joinPaths(base, segment) {
  const joined = `${base}${segment.startsWith("/") ? "" : "/"}${segment}`;
  return joined.replace(/\/{2,}/g, "/") || "/";
}

function extractCodeEndpoints(bswlRoot, mode = "all") {
  const serverSrc = path.join(bswlRoot, "packages/server/src");
  const all = new Set();
  const opts =
    mode === "custom"
      ? { factory: false, explicit: true }
      : mode === "factory"
        ? { factory: true, explicit: false }
        : { factory: true, explicit: true };

  for (const mount of PUBLIC_MOUNTS) {
    const rel = MOUNT_TO_ROUTER[mount];
    if (!rel) continue;
    const file = path.join(serverSrc, rel);
    if (!exists(file)) {
      throw new Error(`Router file not found: ${file}`);
    }
    const base = `/${mount}`;
    for (const ep of collectRoutesFromFile(file, base, bswlRoot, new Set(), opts)) {
      all.add(ep);
    }
  }

  return [...all].sort();
}

function parseOpenApiEndpoints(docsRoot) {
  const yaml = read(path.join(docsRoot, "openapi.yaml"));
  const endpoints = new Set();
  const pathRe = /^ {2}(\/[^:]+):$/gm;
  let pathMatch;
  while ((pathMatch = pathRe.exec(yaml)) !== null) {
    const routePath = pathMatch[1];
    const sliceStart = pathMatch.index;
    const nextPath = yaml.slice(sliceStart + 1).search(/^ {2}\//m);
    const block =
      nextPath === -1
        ? yaml.slice(sliceStart)
        : yaml.slice(sliceStart, sliceStart + 1 + nextPath);
    for (const method of HTTP_METHODS) {
      if (new RegExp(`^ {4}${method}:`, "m").test(block)) {
        endpoints.add(endpointKey(method, routePath));
      }
    }
  }
  return [...endpoints].sort();
}

function parseDocsJsonNav(docsRoot) {
  const docs = JSON.parse(read(path.join(docsRoot, "docs.json")));
  const pages = [];
  for (const tab of docs.navigation?.tabs ?? []) {
    for (const group of tab.groups ?? []) {
      for (const page of group.pages ?? []) {
        if (typeof page === "string" && /^[A-Z]+ \//.test(page)) {
          pages.push(page);
        }
      }
    }
  }
  return pages.sort();
}

function listResourceMdx(docsRoot) {
  const dir = path.join(docsRoot, "resources");
  if (!exists(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".mdx"))
    .map((f) => f.replace(/\.mdx$/, ""))
    .sort();
}

function mountToResourceMdx(mount) {
  const map = {
    deliverable: "deliverable",
    project: "project",
    comment: "comment",
    notification: "notification",
    "qc-inspection-set": "qc-inspection-set",
    "qc-template": "qc-template",
    stage: "stage",
    document: "document",
    note: "note",
    timesheet: "timesheet",
    worker: "worker",
    role: "role",
    "organization-member": "organization-member",
    "api-key": "api-key",
  };
  return map[mount] ?? null;
}

function modelPathForMount(bswlRoot, mount) {
  const map = {
    deliverable: "v2/features/deliverable/model.ts",
    project: "v2/features/project/model.ts",
    comment: "v2/features/comment/model.ts",
    notification: "v2/features/notification/model.ts",
    "qc-inspection-set": "v2/features/qc-inspection-set/model.ts",
    "qc-template": "v2/features/qc_template/model.ts",
    stage: "v2/features/stage/model.ts",
    document: "v2/features/document/model.ts",
    note: "v2/features/note/model.ts",
    timesheet: "v2/features/timesheet/model.ts",
    worker: "v2/features/worker/model.ts",
    role: "v2/features/role/model.ts",
    "organization-member": "v2/features/organization-member/model.ts",
    "api-key": "v2/features/api-key/model.ts",
  };
  const rel = map[mount];
  return rel
    ? path.join(bswlRoot, "packages/server/src", rel)
    : null;
}

function main() {
  const jsonOut = process.argv.includes("--json");
  const fullMode = process.argv.includes("--full");
  const bswlRoot = process.env.BUILDINGSWELL_ROOT ?? DEFAULT_BSWL_ROOT;

  if (!exists(bswlRoot)) {
    console.error(
      `buildingswell repo not found at ${bswlRoot}. Set BUILDINGSWELL_ROOT.`
    );
    process.exit(1);
  }

  const codeEndpoints = extractCodeEndpoints(bswlRoot, "all");
  const codeCustomEndpoints = extractCodeEndpoints(bswlRoot, "custom");
  const openApiEndpoints = parseOpenApiEndpoints(DOCS_ROOT);
  const navPages = parseDocsJsonNav(DOCS_ROOT);
  const resourceMdx = listResourceMdx(DOCS_ROOT);

  const codeSet = new Set(codeEndpoints);
  const openApiSet = new Set(openApiEndpoints);
  const navSet = new Set(navPages);

  const missingCustomFromOpenApi = codeCustomEndpoints.filter(
    (ep) => !openApiSet.has(ep) && !INTENTIONAL_DOC_OMISSIONS.has(ep)
  );
  const missingFactoryFromOpenApi = codeEndpoints
    .filter((ep) => isFactoryRoute(ep))
    .filter((ep) => !openApiSet.has(ep) && !INTENTIONAL_DOC_OMISSIONS.has(ep));
  const extraInOpenApi = openApiEndpoints.filter((ep) => !codeSet.has(ep));
  const missingFromNav = openApiEndpoints.filter((ep) => !navSet.has(ep));
  const extraInNav = navPages.filter((ep) => !openApiSet.has(ep));

  const missingFromOpenApi = fullMode
    ? codeEndpoints.filter(
        (ep) => !openApiSet.has(ep) && !INTENTIONAL_DOC_OMISSIONS.has(ep)
      )
    : missingCustomFromOpenApi;

  const mountsWithModels = [...PUBLIC_MOUNTS].filter((m) => m !== "concepts");
  const missingResourcePages = mountsWithModels
    .map((m) => mountToResourceMdx(m))
    .filter((name) => name && !resourceMdx.includes(name));
  const deliverableNested = [
    "deliverable-dependencies",
    "deliverable-work-sessions",
  ];
  const missingNestedResources = deliverableNested.filter(
    (name) => !resourceMdx.includes(name)
  );

  const report = {
    buildingswellRoot: bswlRoot,
    docsRoot: DOCS_ROOT,
    counts: {
      codeEndpoints: codeEndpoints.length,
      codeCustomEndpoints: codeCustomEndpoints.length,
      openApiEndpoints: openApiEndpoints.length,
      navPages: navPages.length,
      resourceMdxPages: resourceMdx.length,
    },
    missingCustomFromOpenApi,
    missingFactoryFromOpenApi,
    missingFromOpenApi,
    extraInOpenApi,
    missingFromDocsJsonNav: missingFromNav,
    extraInDocsJsonNav: extraInNav,
    missingResourceMdx: [...missingResourcePages, ...missingNestedResources],
    modelFiles: Object.fromEntries(
      mountsWithModels
        .map((m) => [m, modelPathForMount(bswlRoot, m)])
        .filter(([, p]) => p && exists(p))
    ),
    conceptsRegistry: path.join(
      bswlRoot,
      "packages/shared/src/v2/deliverable/concepts/registry.ts"
    ),
  };

  if (jsonOut) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log("BuildingSwell API docs sync report");
  console.log(`  buildingswell: ${bswlRoot}`);
  console.log(`  docs:          ${DOCS_ROOT}`);
  console.log("");
  console.log(
    `Code: ${report.counts.codeEndpoints} total (${report.counts.codeCustomEndpoints} custom) | OpenAPI: ${report.counts.openApiEndpoints} | docs.json nav: ${report.counts.navPages}`
  );
  console.log("");

  const sections = [
    [
      "Action required — custom endpoints missing from openapi.yaml",
      missingCustomFromOpenApi,
    ],
    ["Action required — in openapi.yaml but not found in code", extraInOpenApi],
    [
      "Informational — standard factory routes not in openapi.yaml (use --full to treat as drift)",
      missingFactoryFromOpenApi,
    ],
    [
      "In openapi.yaml but missing from docs.json API reference nav",
      missingFromNav,
    ],
    ["In docs.json nav but not in openapi.yaml", extraInNav],
    ["Expected resource MDX pages missing", report.missingResourceMdx],
  ];

  for (const [title, items] of sections) {
    console.log(`## ${title}`);
    if (items.length === 0) {
      console.log("  (none)");
    } else {
      for (const item of items) console.log(`  - ${item}`);
    }
    console.log("");
  }

  const hasDrift =
    missingCustomFromOpenApi.length > 0 ||
    extraInOpenApi.length > 0 ||
    missingFromNav.length > 0 ||
    extraInNav.length > 0 ||
    (fullMode && missingFromOpenApi.length > 0);

  process.exit(hasDrift ? 2 : 0);
}

main();
