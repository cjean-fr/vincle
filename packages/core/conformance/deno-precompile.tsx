/** @jsxImportSource @vincle/core */
import { createContext, renderToString, useContext } from "@vincle/core";

const Locale = createContext("fr");
const Reader = () => <b>{useContext(Locale)}</b>;
const Page = () => (
  <Locale.Provider value="en">
    <ul>
      {[0, 1].map(() => (
        <Reader />
      ))}
    </ul>
  </Locale.Provider>
);

const html = await renderToString(<Page />);
if (html !== "<ul><b>en</b><b>en</b></ul>")
  throw new Error(`Deno precompile lost Provider context: ${html}`);
console.log("[conformance] deno precompile Provider: 1/1");
