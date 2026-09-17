import { createContext, useContext, ExecutionContext } from "@vincle/core";

// Tree context: the default is returned outside any Provider.
const Locale = createContext("en");
const locale: string = useContext(Locale);

// Execution context: a named key inside an isolated async scope.
const RequestId = ExecutionContext.key<string>("app:request-id");
await ExecutionContext.withScope(() => {
  ExecutionContext.set(RequestId, "123");
  const id: string = ExecutionContext.get(RequestId);
  return id;
});
