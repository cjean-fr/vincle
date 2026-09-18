import { createContext, useContext, Scope } from "@vincle/core";

// Tree context: the default is returned outside any Provider.
const Locale = createContext("en");
const locale: string = useContext(Locale);

// Execution context: a named key inside an isolated async scope.
const RequestId = Scope.key<string>("app:request-id");
await Scope.with(() => {
  Scope.set(RequestId, "123");
  const id: string = Scope.get(RequestId);
  return id;
});
