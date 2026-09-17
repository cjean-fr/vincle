import { ExecutionContext, renderToString } from "@vincle/core";

const Theme = ExecutionContext.key<"light" | "dark">("app:theme");
const ChildPage = () => <div>{ExecutionContext.get(Theme)}</div>;

const childHtml = await ExecutionContext.withScope(async () => {
  ExecutionContext.set(Theme, "dark");
  const seed = ExecutionContext.snapshot();
  return ExecutionContext.withScope(() => renderToString(<ChildPage />), seed);
});
