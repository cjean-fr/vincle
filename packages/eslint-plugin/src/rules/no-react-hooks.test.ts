import { noReactHooks } from "./no-react-hooks";
import * as parser from "@typescript-eslint/parser";
import { RuleTester } from "@typescript-eslint/rule-tester";

const ruleTester = new RuleTester({
  languageOptions: {
    parser,
  },
});

ruleTester.run("no-react-hooks", noReactHooks, {
  valid: [
    "const data = fetchData();",
    "function MyComp() { return null; }",
    // @vincle/core's own context API and other non-React `use*` helpers.
    "const theme = useContext(ThemeContext);",
    "const docs = useDocs();",
  ],
  invalid: [
    {
      code: "const [state, setState] = useState(0);",
      errors: [{ messageId: "useState" }],
    },
    {
      code: "useEffect(() => {}, []);",
      errors: [{ messageId: "useEffect" }],
    },

    {
      code: "const ref = useRef();",
      errors: [{ messageId: "noHook", data: { name: "useRef" } }],
    },
  ],
});
