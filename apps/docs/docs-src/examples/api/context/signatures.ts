import type { ContextKey } from "@vincle/core";

// Create a typed context key — `key` must be a
// non-empty namespaced string
// (e.g. "@org/pkg:purpose"). Same key → same Symbol
// across module instances.
declare function context<T>(key: string): ContextKey<T>;

// Provide a value inside a withScope
declare function setContext<T>(ctx: ContextKey<T>, value: T): void;

// Read a value set by setContext
declare function useContext<T>(ctx: ContextKey<T>): T;

// Create an isolated async scope
declare function withScope<T>(
  fn: () => T | Promise<T>,
  parentCtx?: Map<ContextKey<unknown>, unknown>,
): Promise<T>;

// Capture current scope values for passing to child scopes
declare function snapshot(): Map<ContextKey<unknown>, unknown>;
