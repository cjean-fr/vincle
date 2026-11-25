// Entry point for browser playgrounds that run a file instead of `npm run dev`.
import { register } from "tsx/esm/api";

register();
await import("./server.tsx");
