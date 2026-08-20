// `@better-auth/infra` reaches for `@better-auth/scim` and `@better-auth/sso`
// through dynamic imports on its directory-sync paths. Neither plugin is
// mounted here and the Workers bundler cannot leave an unresolved import in the
// graph, so both specifiers are aliased to this empty module in
// `wrangler.jsonc`. The module stays inert rather than throwing on import,
// because the bundler inlines dynamic imports and a top-level throw would take
// down the Worker at startup instead of the one unreachable code path.
// Enabling directory sync means installing the real packages and dropping the
// alias, not filling in this file.
export {};
