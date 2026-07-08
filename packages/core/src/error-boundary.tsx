import type { VincleNode } from "./core/types.js";
import {
  context,
  getCurrentScopeMap,
  type ContextKey,
} from "./core/context.js";

export const ERROR_BOUNDARY_SYMBOL = Symbol("vincle/error-boundary");

export const boundaryStackCtx = context<Array<{ fallback: unknown }>>(
  "@vincle/core/error-boundary-stack",
);

export function ErrorBoundary({
  children,
}: {
  children?: VincleNode;
  fallback: VincleNode | ((error: unknown) => VincleNode);
}): VincleNode {
  return children;
}
ErrorBoundary[ERROR_BOUNDARY_SYMBOL] = true;

export function createBoundarySeed(): Map<ContextKey<unknown>, unknown> {
  const scope = getCurrentScopeMap();
  const seed = new Map(scope);
  seed.set(boundaryStackCtx, []);
  return seed;
}
