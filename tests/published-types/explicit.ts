import type { JSX as PublicJSX } from "@vincle/core";
import type { JSX as DevelopmentJSX } from "@vincle/core/jsx-dev-runtime";
import type { JSX as ProductionJSX } from "@vincle/core/jsx-runtime";

const attributes: PublicJSX.TemplateHTMLAttributes = { src: "/fragment", buffer: true };
const production: ProductionJSX.TemplateHTMLAttributes = attributes;
const development: DevelopmentJSX.TemplateHTMLAttributes = production;
const frame: PublicJSX.IntrinsicElements["turbo-frame"] = { src: "/fragment", target: "main" };
const productionFrame: ProductionJSX.IntrinsicElements["turbo-frame"] = frame;
const developmentFrame: DevelopmentJSX.IntrinsicElements["turbo-frame"] = productionFrame;

// @ts-expect-error Explicit types must carry the augmentation's constraints too.
const invalid: DevelopmentJSX.TemplateHTMLAttributes = { buffer: "yes" };
// @ts-expect-error An unaugmented custom-element index would accept this.
const invalidFrame: ProductionJSX.IntrinsicElements["turbo-frame"] = { src: 123 };
export { development, developmentFrame, invalid, invalidFrame };
