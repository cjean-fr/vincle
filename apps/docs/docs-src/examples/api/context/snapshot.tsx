import { Scope, renderToString } from "@vincle/core";

const Theme = Scope.key<"light" | "dark">("app:theme");
const ChildPage = () => <div>{Scope.get(Theme)}</div>;

const childHtml = await Scope.with(async () => {
  Scope.set(Theme, "dark");
  const seed = Scope.snapshot();
  return Scope.with(() => renderToString(<ChildPage />), seed);
});
