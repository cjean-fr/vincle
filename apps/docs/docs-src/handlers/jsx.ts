import { defaultHandlers } from "@vincle/ssg";

/** Docs use the same JSX handler as every other SSG consumer. */
export const JsxHandler = defaultHandlers[".tsx"]!;
