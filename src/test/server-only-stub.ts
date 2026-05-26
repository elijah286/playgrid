// Empty stub for Next.js's `server-only` marker so files that import
// it (e.g. server-side helpers gated against client-bundle leakage)
// can be unit-tested under vitest's jsdom environment. Aliased in
// vitest.config.ts. Production builds still hit the real package
// from node_modules and enforce the boundary.
export {};
