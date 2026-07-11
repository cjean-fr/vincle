// Augmentation intentionally removed.
//
// Vincle derives its JSX types FROM @types/react via the `FromReact<T>` mapped
// type (see types-jsx.ts), which automatically:
//   - adds `class` alongside `className`
//   - converts event handlers from function refs to string attributes
//   - strips React-only props (ref, suppressHydrationWarning, etc.)
//
// Augmenting `declare module "react"` here interferes with TypeScript 6's
// module resolution for `export =` modules. If you need to register custom
// elements or attributes, augment `React.JSX.IntrinsicElements` in your own
// project — it flows through to vincle's types automatically.
