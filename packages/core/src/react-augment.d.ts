// Augment React's types when @types/react is installed,
// so Vincle attributes (class, string event handlers) are accepted there too.
declare module "react" {
  interface HTMLAttributes<T> {
    class?: string;
    [key: `on${string}`]: any;
  }
  interface SVGAttributes<T> {
    class?: string;
    [key: `on${string}`]: any;
  }
}
