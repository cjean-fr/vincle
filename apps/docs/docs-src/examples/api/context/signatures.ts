import type { Context } from "@vincle/core";

// Create a typed context key — `key` must be a
// non-empty namespaced string
// (e.g. "@org/pkg:purpose"). Same key → same Symbol
// across module instances.
declare function context<T>(key: string): Context<T>;

// Provide a value inside a withScope
declare function setContext<T>(ctx: Context<T>, value: T): void;

// Read a value set by setContext
declare function useContext<T>(ctx: Context<T>): T;

// Create an isolated async scope
declare function withScope<T>(
  fn: () => T | Promise<T>,
  options?: { seed?: Map<Context<unknown>, unknown> },
): Promise<T>;

// Capture current scope values for passing to child scopes
declare function snapshot(): Map<Context<unknown>, unknown>;
