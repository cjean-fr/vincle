import { createContext, useContext, renderToString } from "@vincle/core";

const Theme = createContext("light");
const Page = async () => {
  await Promise.resolve();
  return <div>{useContext(Theme)}</div>;
};

const [lightHtml, darkHtml] = await Promise.all([
  renderToString(
    <Theme.Provider value="light">
      <Page />
    </Theme.Provider>,
  ),
  renderToString(
    <Theme.Provider value="dark">
      <Page />
    </Theme.Provider>,
  ),
]);
