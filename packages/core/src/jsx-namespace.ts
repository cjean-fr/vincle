/**
 * The `JSX` namespace TypeScript reads when it type-checks JSX syntax.
 *
 * It lives here, once, because it has to be *exported by the module named in
 * `jsxImportSource`* — that module is where the compiler looks, and a global
 * `declare global { namespace JSX }` is only a fallback it does not always
 * consult. So `jsx-runtime`, `jsx-dev-runtime` and the package root each
 * re-export this one declaration rather than restating it; four copies of the
 * same members is four chances to disagree about what a `<div>` accepts.
 *
 * The regions between the `@generated` markers are owned by
 * `scripts/codegen.ts` (source: `@types/react`) — never edit them by hand.
 *
 * @module
 */

import type { VNode } from "./jsx-runtime.js";
import type { Awaitable, ClassValue, RawString, Renderable } from "./types.js";

// @generated:start
type CSSGlobals = "-moz-initial" | "inherit" | "initial" | "revert" | "revert-layer" | "unset";
type CSSNamedColor =
  | "aliceblue"
  | "antiquewhite"
  | "aqua"
  | "aquamarine"
  | "azure"
  | "beige"
  | "bisque"
  | "black"
  | "blanchedalmond"
  | "blue"
  | "blueviolet"
  | "brown"
  | "burlywood"
  | "cadetblue"
  | "chartreuse"
  | "chocolate"
  | "coral"
  | "cornflowerblue"
  | "cornsilk"
  | "crimson"
  | "cyan"
  | "darkblue"
  | "darkcyan"
  | "darkgoldenrod"
  | "darkgray"
  | "darkgreen"
  | "darkgrey"
  | "darkkhaki"
  | "darkmagenta"
  | "darkolivegreen"
  | "darkorange"
  | "darkorchid"
  | "darkred"
  | "darksalmon"
  | "darkseagreen"
  | "darkslateblue"
  | "darkslategray"
  | "darkslategrey"
  | "darkturquoise"
  | "darkviolet"
  | "deeppink"
  | "deepskyblue"
  | "dimgray"
  | "dimgrey"
  | "dodgerblue"
  | "firebrick"
  | "floralwhite"
  | "forestgreen"
  | "fuchsia"
  | "gainsboro"
  | "ghostwhite"
  | "gold"
  | "goldenrod"
  | "gray"
  | "green"
  | "greenyellow"
  | "grey"
  | "honeydew"
  | "hotpink"
  | "indianred"
  | "indigo"
  | "ivory"
  | "khaki"
  | "lavender"
  | "lavenderblush"
  | "lawngreen"
  | "lemonchiffon"
  | "lightblue"
  | "lightcoral"
  | "lightcyan"
  | "lightgoldenrodyellow"
  | "lightgray"
  | "lightgreen"
  | "lightgrey"
  | "lightpink"
  | "lightsalmon"
  | "lightseagreen"
  | "lightskyblue"
  | "lightslategray"
  | "lightslategrey"
  | "lightsteelblue"
  | "lightyellow"
  | "lime"
  | "limegreen"
  | "linen"
  | "magenta"
  | "maroon"
  | "mediumaquamarine"
  | "mediumblue"
  | "mediumorchid"
  | "mediumpurple"
  | "mediumseagreen"
  | "mediumslateblue"
  | "mediumspringgreen"
  | "mediumturquoise"
  | "mediumvioletred"
  | "midnightblue"
  | "mintcream"
  | "mistyrose"
  | "moccasin"
  | "navajowhite"
  | "navy"
  | "oldlace"
  | "olive"
  | "olivedrab"
  | "orange"
  | "orangered"
  | "orchid"
  | "palegoldenrod"
  | "palegreen"
  | "paleturquoise"
  | "palevioletred"
  | "papayawhip"
  | "peachpuff"
  | "peru"
  | "pink"
  | "plum"
  | "powderblue"
  | "purple"
  | "rebeccapurple"
  | "red"
  | "rosybrown"
  | "royalblue"
  | "saddlebrown"
  | "salmon"
  | "sandybrown"
  | "seagreen"
  | "seashell"
  | "sienna"
  | "silver"
  | "skyblue"
  | "slateblue"
  | "slategray"
  | "slategrey"
  | "snow"
  | "springgreen"
  | "steelblue"
  | "tan"
  | "teal"
  | "thistle"
  | "tomato"
  | "turquoise"
  | "violet"
  | "wheat"
  | "white"
  | "whitesmoke"
  | "yellow"
  | "yellowgreen";
type CSSColorBase = CSSNamedColor | "transparent" | (string & {});
type CSSSystemColor =
  | "AccentColor"
  | "AccentColorText"
  | "ActiveText"
  | "ButtonBorder"
  | "ButtonFace"
  | "ButtonText"
  | "Canvas"
  | "CanvasText"
  | "Field"
  | "FieldText"
  | "GrayText"
  | "Highlight"
  | "HighlightText"
  | "LinkText"
  | "Mark"
  | "MarkText"
  | "SelectedItem"
  | "SelectedItemText"
  | "VisitedText";
type CSSDeprecatedSystemColor =
  | "ActiveBorder"
  | "ActiveCaption"
  | "AppWorkspace"
  | "Background"
  | "ButtonHighlight"
  | "ButtonShadow"
  | "CaptionText"
  | "InactiveBorder"
  | "InactiveCaption"
  | "InactiveCaptionText"
  | "InfoBackground"
  | "InfoText"
  | "Menu"
  | "MenuText"
  | "Scrollbar"
  | "ThreeDDarkShadow"
  | "ThreeDFace"
  | "ThreeDHighlight"
  | "ThreeDLightShadow"
  | "ThreeDShadow"
  | "Window"
  | "WindowFrame"
  | "WindowText";
type CSSColor =
  | CSSColorBase
  | CSSSystemColor
  | CSSDeprecatedSystemColor
  | "currentColor"
  | (string & {});
type CSSContentDistribution = "space-around" | "space-between" | "space-evenly" | "stretch";
type CSSContentPosition = "center" | "end" | "flex-end" | "flex-start" | "start";
type CSSSelfPosition =
  | "center"
  | "end"
  | "flex-end"
  | "flex-start"
  | "self-end"
  | "self-start"
  | "start";
type CSSSingleAnimationComposition = "accumulate" | "add" | "replace";
type CSSSingleAnimationDirection = "alternate" | "alternate-reverse" | "normal" | "reverse";
type CSSSingleAnimationFillMode = "backwards" | "both" | "forwards" | "none";
type CSSTimelineRangeName =
  | "contain"
  | "cover"
  | "entry"
  | "entry-crossing"
  | "exit"
  | "exit-crossing";
type CSSSingleAnimationTimeline = "auto" | "none" | (string & {});
type CSSCubicBezierEasingFunction = "ease" | "ease-in" | "ease-in-out" | "ease-out" | (string & {});
type CSSStepEasingFunction = "step-end" | "step-start" | (string & {});
type CSSEasingFunction =
  | CSSCubicBezierEasingFunction
  | CSSStepEasingFunction
  | "linear"
  | (string & {});
type CSSCompatAuto =
  | "button"
  | "checkbox"
  | "listbox"
  | "menulist"
  | "meter"
  | "progress-bar"
  | "radio"
  | "searchfield"
  | "textarea";
type CSSAttachment = "fixed" | "local" | "scroll";
type CSSBlendMode =
  | "color"
  | "color-burn"
  | "color-dodge"
  | "darken"
  | "difference"
  | "exclusion"
  | "hard-light"
  | "hue"
  | "lighten"
  | "luminosity"
  | "multiply"
  | "normal"
  | "overlay"
  | "saturation"
  | "screen"
  | "soft-light";
type CSSVisualBox = "border-box" | "content-box" | "padding-box";
type CSSBgClip = CSSVisualBox | "border-area" | "text";
type CSSRepeatStyle =
  | "no-repeat"
  | "repeat"
  | "repeat-x"
  | "repeat-y"
  | "round"
  | "space"
  | (string & {});
type CSSBgSize = string | number | "auto" | "contain" | "cover" | (string & {});
type CSSLineStyle =
  | "dashed"
  | "dotted"
  | "double"
  | "groove"
  | "hidden"
  | "inset"
  | "none"
  | "outset"
  | "ridge"
  | "solid";
type CSSLineWidth = string | number | "medium" | "thick" | "thin";
type CSSGeometryBox = CSSVisualBox | "fill-box" | "margin-box" | "stroke-box" | "view-box";
type CSSQuote = "close-quote" | "no-close-quote" | "no-open-quote" | "open-quote";
type CSSCursorPredefined =
  | "-moz-grab"
  | "-moz-zoom-in"
  | "-moz-zoom-out"
  | "-webkit-grab"
  | "-webkit-grabbing"
  | "-webkit-zoom-in"
  | "-webkit-zoom-out"
  | "alias"
  | "all-scroll"
  | "auto"
  | "cell"
  | "col-resize"
  | "context-menu"
  | "copy"
  | "crosshair"
  | "default"
  | "e-resize"
  | "ew-resize"
  | "grab"
  | "grabbing"
  | "help"
  | "move"
  | "n-resize"
  | "ne-resize"
  | "nesw-resize"
  | "no-drop"
  | "none"
  | "not-allowed"
  | "ns-resize"
  | "nw-resize"
  | "nwse-resize"
  | "pointer"
  | "progress"
  | "row-resize"
  | "s-resize"
  | "se-resize"
  | "sw-resize"
  | "text"
  | "vertical-text"
  | "w-resize"
  | "wait"
  | "zoom-in"
  | "zoom-out";
type CSSDisplayOutside = "block" | "inline" | "run-in";
type CSSDisplayInside =
  | "-ms-flexbox"
  | "-ms-grid"
  | "-webkit-flex"
  | "flex"
  | "flow"
  | "flow-root"
  | "grid"
  | "ruby"
  | "table";
type CSSDisplayInternal =
  | "ruby-base"
  | "ruby-base-container"
  | "ruby-text"
  | "ruby-text-container"
  | "table-caption"
  | "table-cell"
  | "table-column"
  | "table-column-group"
  | "table-footer-group"
  | "table-header-group"
  | "table-row"
  | "table-row-group";
type CSSDisplayLegacy =
  | "-ms-inline-flexbox"
  | "-ms-inline-grid"
  | "-webkit-inline-flex"
  | "inline-block"
  | "inline-flex"
  | "inline-grid"
  | "inline-list-item"
  | "inline-table";
type CSSPaint = CSSColor | "context-fill" | "context-stroke" | "none" | (string & {});
type CSSGenericComplete =
  | "-apple-system"
  | "cursive"
  | "fantasy"
  | "math"
  | "monospace"
  | "sans-serif"
  | "serif"
  | "system-ui";
type CSSGenericIncomplete = "ui-monospace" | "ui-rounded" | "ui-sans-serif" | "ui-serif";
type CSSGenericFamily = CSSGenericComplete | CSSGenericIncomplete | "emoji" | "fangsong";
type CSSAbsoluteSize =
  | "large"
  | "medium"
  | "small"
  | "x-large"
  | "x-small"
  | "xx-large"
  | "xx-small"
  | "xxx-large";
type CSSEastAsianVariantValues =
  | "jis04"
  | "jis78"
  | "jis83"
  | "jis90"
  | "simplified"
  | "traditional";
type CSSFontWeightAbsolute = "bold" | "normal" | (number & {}) | (string & {});
type CSSTrackBreadth = string | number | "auto" | "max-content" | "min-content" | (string & {});
type CSSGridLine = "auto" | (string & {}) | (number & {});
type CSSPaintBox = CSSVisualBox | "fill-box" | "stroke-box";
type CSSCompositingOperator = "add" | "exclude" | "intersect" | "subtract";
type CSSMaskingMode = "alpha" | "luminance" | "match-source";
type CSSPosition = string | number | "bottom" | "center" | "left" | "right" | "top" | (string & {});
type CSSOutlineLineStyle =
  | "dashed"
  | "dotted"
  | "double"
  | "groove"
  | "inset"
  | "none"
  | "outset"
  | "ridge"
  | "solid";
type CSSPositionArea =
  | "block-end"
  | "block-start"
  | "bottom"
  | "center"
  | "end"
  | "inline-end"
  | "inline-start"
  | "left"
  | "right"
  | "self-block-end"
  | "self-block-start"
  | "self-end"
  | "self-inline-end"
  | "self-inline-start"
  | "self-start"
  | "span-all"
  | "span-block-end"
  | "span-block-start"
  | "span-bottom"
  | "span-end"
  | "span-inline-end"
  | "span-inline-start"
  | "span-left"
  | "span-right"
  | "span-self-block-end"
  | "span-self-block-start"
  | "span-self-end"
  | "span-self-inline-end"
  | "span-self-inline-start"
  | "span-self-start"
  | "span-start"
  | "span-top"
  | "span-x-end"
  | "span-x-self-end"
  | "span-x-self-start"
  | "span-x-start"
  | "span-y-end"
  | "span-y-self-end"
  | "span-y-self-start"
  | "span-y-start"
  | "start"
  | "top"
  | "x-end"
  | "x-self-end"
  | "x-self-start"
  | "x-start"
  | "y-end"
  | "y-self-end"
  | "y-self-start"
  | "y-start"
  | (string & {});
type CSSTryTactic = "flip-block" | "flip-inline" | "flip-start" | (string & {});
type CSSTrySize = "most-block-size" | "most-height" | "most-inline-size" | "most-width";
type CSSDasharray = string | number | (string & {}) | (number & {});
type CSSAutospace =
  | "ideograph-alpha"
  | "ideograph-numeric"
  | "insert"
  | "no-autospace"
  | "punctuation"
  | "replace"
  | (string & {});
type CSSTextEdge = "cap" | "ex" | "ideographic" | "ideographic-ink" | "text" | (string & {});
type CSSAnimateableFeature = "contents" | "scroll-position" | (string & {});
type CSSSingleAnimation =
  | CSSEasingFunction
  | CSSSingleAnimationDirection
  | CSSSingleAnimationFillMode
  | CSSSingleAnimationTimeline
  | (string & {})
  | "auto"
  | "infinite"
  | "none"
  | "paused"
  | "running"
  | (number & {});
type CSSBgPosition =
  | string
  | number
  | "bottom"
  | "center"
  | "left"
  | "right"
  | "top"
  | (string & {});
type CSSBgLayer =
  | CSSBgPosition
  | CSSRepeatStyle
  | CSSAttachment
  | CSSVisualBox
  | "none"
  | (string & {});
type CSSFinalBgLayer =
  | CSSBgPosition
  | CSSRepeatStyle
  | CSSAttachment
  | CSSVisualBox
  | CSSColor
  | "none"
  | (string & {});
type CSSSystemFamilyName =
  | "caption"
  | "icon"
  | "menu"
  | "message-box"
  | "small-caption"
  | "status-bar";
type CSSMaskLayer =
  | CSSPosition
  | CSSRepeatStyle
  | CSSGeometryBox
  | CSSCompositingOperator
  | CSSMaskingMode
  | "no-clip"
  | "none"
  | (string & {});
type CSSSingleTransition =
  | CSSEasingFunction
  | (string & {})
  | "all"
  | "allow-discrete"
  | "none"
  | "normal";
type CSSCompositeStyle =
  | "clear"
  | "copy"
  | "destination-atop"
  | "destination-in"
  | "destination-out"
  | "destination-over"
  | "source-atop"
  | "source-in"
  | "source-out"
  | "source-over"
  | "xor";
type CSSFontStretchAbsolute =
  | "condensed"
  | "expanded"
  | "extra-condensed"
  | "extra-expanded"
  | "normal"
  | "semi-condensed"
  | "semi-expanded"
  | "ultra-condensed"
  | "ultra-expanded"
  | (string & {});

export type CSSProperties = {
  accentColor?: CSSGlobals | CSSColor | "auto" | undefined;
  alignContent?:
    | CSSGlobals
    | CSSContentDistribution
    | CSSContentPosition
    | "baseline"
    | "normal"
    | (string & {})
    | undefined;
  alignItems?:
    | CSSGlobals
    | CSSSelfPosition
    | "anchor-center"
    | "baseline"
    | "normal"
    | "stretch"
    | (string & {})
    | undefined;
  alignSelf?:
    | CSSGlobals
    | CSSSelfPosition
    | "anchor-center"
    | "auto"
    | "baseline"
    | "normal"
    | "stretch"
    | (string & {})
    | undefined;
  alignTracks?:
    | CSSGlobals
    | CSSContentDistribution
    | CSSContentPosition
    | "baseline"
    | "normal"
    | (string & {})
    | undefined;
  alignmentBaseline?:
    | CSSGlobals
    | "alphabetic"
    | "baseline"
    | "central"
    | "ideographic"
    | "mathematical"
    | "middle"
    | "text-after-edge"
    | "text-before-edge"
    | undefined;
  anchorName?: CSSGlobals | "none" | (string & {}) | undefined;
  anchorScope?: CSSGlobals | "all" | "none" | (string & {}) | undefined;
  animationComposition?: CSSGlobals | CSSSingleAnimationComposition | (string & {}) | undefined;
  animationDelay?: CSSGlobals | (string & {}) | undefined;
  animationDirection?: CSSGlobals | CSSSingleAnimationDirection | (string & {}) | undefined;
  animationDuration?: CSSGlobals | (string & {}) | "auto" | undefined;
  animationFillMode?: CSSGlobals | CSSSingleAnimationFillMode | (string & {}) | undefined;
  animationIterationCount?: CSSGlobals | "infinite" | (string & {}) | (number & {}) | undefined;
  animationName?: CSSGlobals | "none" | (string & {}) | undefined;
  animationPlayState?: CSSGlobals | "paused" | "running" | (string & {}) | undefined;
  animationRangeEnd?:
    | CSSGlobals
    | CSSTimelineRangeName
    | string
    | number
    | "normal"
    | (string & {})
    | undefined;
  animationRangeStart?:
    | CSSGlobals
    | CSSTimelineRangeName
    | string
    | number
    | "normal"
    | (string & {})
    | undefined;
  animationTimeline?: CSSGlobals | CSSSingleAnimationTimeline | (string & {}) | undefined;
  animationTimingFunction?: CSSGlobals | CSSEasingFunction | (string & {}) | undefined;
  appearance?:
    | CSSGlobals
    | CSSCompatAuto
    | "auto"
    | "menulist-button"
    | "none"
    | "textfield"
    | undefined;
  aspectRatio?: CSSGlobals | "auto" | (string & {}) | (number & {}) | undefined;
  backdropFilter?: CSSGlobals | "none" | (string & {}) | undefined;
  backfaceVisibility?: CSSGlobals | "hidden" | "visible" | undefined;
  backgroundAttachment?: CSSGlobals | CSSAttachment | (string & {}) | undefined;
  backgroundBlendMode?: CSSGlobals | CSSBlendMode | (string & {}) | undefined;
  backgroundClip?: CSSGlobals | CSSBgClip | (string & {}) | undefined;
  backgroundColor?: CSSGlobals | CSSColor | undefined;
  backgroundImage?: CSSGlobals | "none" | (string & {}) | undefined;
  backgroundOrigin?: CSSGlobals | CSSVisualBox | (string & {}) | undefined;
  backgroundPositionX?:
    | CSSGlobals
    | string
    | number
    | "center"
    | "left"
    | "right"
    | "x-end"
    | "x-start"
    | (string & {})
    | undefined;
  backgroundPositionY?:
    | CSSGlobals
    | string
    | number
    | "bottom"
    | "center"
    | "top"
    | "y-end"
    | "y-start"
    | (string & {})
    | undefined;
  backgroundRepeat?: CSSGlobals | CSSRepeatStyle | (string & {}) | undefined;
  backgroundSize?: CSSGlobals | CSSBgSize | (string & {}) | undefined;
  baselineShift?:
    | CSSGlobals
    | string
    | number
    | "baseline"
    | "sub"
    | "super"
    | (string & {})
    | undefined;
  blockSize?:
    | CSSGlobals
    | string
    | number
    | "-moz-fit-content"
    | "-moz-max-content"
    | "-moz-min-content"
    | "auto"
    | "fit-content"
    | "max-content"
    | "min-content"
    | (string & {})
    | undefined;
  borderBlockEndColor?: CSSGlobals | CSSColor | undefined;
  borderBlockEndStyle?: CSSGlobals | CSSLineStyle | undefined;
  borderBlockEndWidth?: CSSGlobals | CSSLineWidth | undefined;
  borderBlockStartColor?: CSSGlobals | CSSColor | undefined;
  borderBlockStartStyle?: CSSGlobals | CSSLineStyle | undefined;
  borderBlockStartWidth?: CSSGlobals | CSSLineWidth | undefined;
  borderBottomColor?: CSSGlobals | CSSColor | undefined;
  borderBottomLeftRadius?: CSSGlobals | string | number | (string & {}) | undefined;
  borderBottomRightRadius?: CSSGlobals | string | number | (string & {}) | undefined;
  borderBottomStyle?: CSSGlobals | CSSLineStyle | undefined;
  borderBottomWidth?: CSSGlobals | CSSLineWidth | undefined;
  borderCollapse?: CSSGlobals | "collapse" | "separate" | undefined;
  borderEndEndRadius?: CSSGlobals | string | number | (string & {}) | undefined;
  borderEndStartRadius?: CSSGlobals | string | number | (string & {}) | undefined;
  borderImageOutset?: CSSGlobals | string | number | (string & {}) | (number & {}) | undefined;
  borderImageRepeat?:
    | CSSGlobals
    | "repeat"
    | "round"
    | "space"
    | "stretch"
    | (string & {})
    | undefined;
  borderImageSlice?: CSSGlobals | (string & {}) | (number & {}) | undefined;
  borderImageSource?: CSSGlobals | "none" | (string & {}) | undefined;
  borderImageWidth?:
    | CSSGlobals
    | string
    | number
    | "auto"
    | (string & {})
    | (number & {})
    | undefined;
  borderInlineEndColor?: CSSGlobals | CSSColor | undefined;
  borderInlineEndStyle?: CSSGlobals | CSSLineStyle | undefined;
  borderInlineEndWidth?: CSSGlobals | CSSLineWidth | undefined;
  borderInlineStartColor?: CSSGlobals | CSSColor | undefined;
  borderInlineStartStyle?: CSSGlobals | CSSLineStyle | undefined;
  borderInlineStartWidth?: CSSGlobals | CSSLineWidth | undefined;
  borderLeftColor?: CSSGlobals | CSSColor | undefined;
  borderLeftStyle?: CSSGlobals | CSSLineStyle | undefined;
  borderLeftWidth?: CSSGlobals | CSSLineWidth | undefined;
  borderRightColor?: CSSGlobals | CSSColor | undefined;
  borderRightStyle?: CSSGlobals | CSSLineStyle | undefined;
  borderRightWidth?: CSSGlobals | CSSLineWidth | undefined;
  borderSpacing?: CSSGlobals | string | number | (string & {}) | undefined;
  borderStartEndRadius?: CSSGlobals | string | number | (string & {}) | undefined;
  borderStartStartRadius?: CSSGlobals | string | number | (string & {}) | undefined;
  borderTopColor?: CSSGlobals | CSSColor | undefined;
  borderTopLeftRadius?: CSSGlobals | string | number | (string & {}) | undefined;
  borderTopRightRadius?: CSSGlobals | string | number | (string & {}) | undefined;
  borderTopStyle?: CSSGlobals | CSSLineStyle | undefined;
  borderTopWidth?: CSSGlobals | CSSLineWidth | undefined;
  bottom?: CSSGlobals | string | number | "auto" | (string & {}) | undefined;
  boxDecorationBreak?: CSSGlobals | "clone" | "slice" | undefined;
  boxShadow?: CSSGlobals | "none" | (string & {}) | undefined;
  boxSizing?: CSSGlobals | "border-box" | "content-box" | undefined;
  breakAfter?:
    | CSSGlobals
    | "all"
    | "always"
    | "auto"
    | "avoid"
    | "avoid-column"
    | "avoid-page"
    | "avoid-region"
    | "column"
    | "left"
    | "page"
    | "recto"
    | "region"
    | "right"
    | "verso"
    | undefined;
  breakBefore?:
    | CSSGlobals
    | "all"
    | "always"
    | "auto"
    | "avoid"
    | "avoid-column"
    | "avoid-page"
    | "avoid-region"
    | "column"
    | "left"
    | "page"
    | "recto"
    | "region"
    | "right"
    | "verso"
    | undefined;
  breakInside?:
    | CSSGlobals
    | "auto"
    | "avoid"
    | "avoid-column"
    | "avoid-page"
    | "avoid-region"
    | undefined;
  captionSide?: CSSGlobals | "bottom" | "top" | undefined;
  caretColor?: CSSGlobals | CSSColor | "auto" | undefined;
  caretShape?: CSSGlobals | "auto" | "bar" | "block" | "underscore" | undefined;
  clear?:
    | CSSGlobals
    | "both"
    | "inline-end"
    | "inline-start"
    | "left"
    | "none"
    | "right"
    | undefined;
  clipPath?: CSSGlobals | CSSGeometryBox | "none" | (string & {}) | undefined;
  clipRule?: CSSGlobals | "evenodd" | "nonzero" | undefined;
  color?: CSSGlobals | CSSColor | undefined;
  colorAdjust?: CSSGlobals | "economy" | "exact" | undefined;
  colorInterpolationFilters?: CSSGlobals | "auto" | "linearRGB" | "sRGB" | undefined;
  colorScheme?: CSSGlobals | "dark" | "light" | "normal" | (string & {}) | undefined;
  columnCount?: CSSGlobals | "auto" | (number & {}) | (string & {}) | undefined;
  columnFill?: CSSGlobals | "auto" | "balance" | undefined;
  columnGap?: CSSGlobals | string | number | "normal" | (string & {}) | undefined;
  columnRuleColor?: CSSGlobals | CSSColor | undefined;
  columnRuleStyle?: CSSGlobals | CSSLineStyle | (string & {}) | undefined;
  columnRuleWidth?: CSSGlobals | CSSLineWidth | (string & {}) | undefined;
  columnSpan?: CSSGlobals | "all" | "none" | undefined;
  columnWidth?: CSSGlobals | string | number | "auto" | undefined;
  contain?:
    | CSSGlobals
    | "content"
    | "inline-size"
    | "layout"
    | "none"
    | "paint"
    | "size"
    | "strict"
    | "style"
    | (string & {})
    | undefined;
  containIntrinsicBlockSize?: CSSGlobals | string | number | "none" | (string & {}) | undefined;
  containIntrinsicHeight?: CSSGlobals | string | number | "none" | (string & {}) | undefined;
  containIntrinsicInlineSize?: CSSGlobals | string | number | "none" | (string & {}) | undefined;
  containIntrinsicWidth?: CSSGlobals | string | number | "none" | (string & {}) | undefined;
  containerName?: CSSGlobals | "none" | (string & {}) | undefined;
  containerType?:
    | CSSGlobals
    | "inline-size"
    | "normal"
    | "scroll-state"
    | "size"
    | (string & {})
    | undefined;
  content?: CSSGlobals | CSSQuote | "none" | "normal" | (string & {}) | undefined;
  contentVisibility?: CSSGlobals | "auto" | "hidden" | "visible" | undefined;
  counterIncrement?: CSSGlobals | "none" | (string & {}) | undefined;
  counterReset?: CSSGlobals | "none" | (string & {}) | undefined;
  counterSet?: CSSGlobals | "none" | (string & {}) | undefined;
  cursor?: CSSGlobals | CSSCursorPredefined | (string & {}) | undefined;
  cx?: CSSGlobals | string | number | (string & {}) | undefined;
  cy?: CSSGlobals | string | number | (string & {}) | undefined;
  d?: CSSGlobals | "none" | (string & {}) | undefined;
  direction?: CSSGlobals | "ltr" | "rtl" | undefined;
  display?:
    | CSSGlobals
    | CSSDisplayOutside
    | CSSDisplayInside
    | CSSDisplayInternal
    | CSSDisplayLegacy
    | "contents"
    | "list-item"
    | "none"
    | (string & {})
    | undefined;
  dominantBaseline?:
    | CSSGlobals
    | "alphabetic"
    | "auto"
    | "central"
    | "hanging"
    | "ideographic"
    | "mathematical"
    | "middle"
    | "text-bottom"
    | "text-top"
    | undefined;
  emptyCells?: CSSGlobals | "hide" | "show" | undefined;
  fieldSizing?: CSSGlobals | "content" | "fixed" | undefined;
  fill?: CSSGlobals | CSSPaint | undefined;
  fillOpacity?: CSSGlobals | (string & {}) | (number & {}) | undefined;
  fillRule?: CSSGlobals | "evenodd" | "nonzero" | undefined;
  filter?: CSSGlobals | "none" | (string & {}) | undefined;
  flexBasis?:
    | CSSGlobals
    | string
    | number
    | "-moz-fit-content"
    | "-moz-max-content"
    | "-moz-min-content"
    | "-webkit-auto"
    | "auto"
    | "content"
    | "fit-content"
    | "max-content"
    | "min-content"
    | (string & {})
    | undefined;
  flexDirection?: CSSGlobals | "column" | "column-reverse" | "row" | "row-reverse" | undefined;
  flexGrow?: CSSGlobals | (number & {}) | (string & {}) | undefined;
  flexShrink?: CSSGlobals | (number & {}) | (string & {}) | undefined;
  flexWrap?: CSSGlobals | "nowrap" | "wrap" | "wrap-reverse" | undefined;
  float?: CSSGlobals | "inline-end" | "inline-start" | "left" | "none" | "right" | undefined;
  floodColor?: CSSGlobals | CSSColor | undefined;
  floodOpacity?: CSSGlobals | (string & {}) | (number & {}) | undefined;
  fontFamily?: CSSGlobals | CSSGenericFamily | (string & {}) | undefined;
  fontFeatureSettings?: CSSGlobals | "normal" | (string & {}) | undefined;
  fontKerning?: CSSGlobals | "auto" | "none" | "normal" | undefined;
  fontLanguageOverride?: CSSGlobals | "normal" | (string & {}) | undefined;
  fontOpticalSizing?: CSSGlobals | "auto" | "none" | undefined;
  fontPalette?: CSSGlobals | "dark" | "light" | "normal" | (string & {}) | undefined;
  fontSize?:
    | CSSGlobals
    | CSSAbsoluteSize
    | string
    | number
    | "larger"
    | "math"
    | "smaller"
    | (string & {})
    | undefined;
  fontSizeAdjust?: CSSGlobals | "from-font" | "none" | (string & {}) | (number & {}) | undefined;
  fontSmooth?:
    | CSSGlobals
    | CSSAbsoluteSize
    | string
    | number
    | "always"
    | "auto"
    | "never"
    | undefined;
  fontStyle?: CSSGlobals | "italic" | "normal" | "oblique" | (string & {}) | undefined;
  fontSynthesis?:
    | CSSGlobals
    | "none"
    | "position"
    | "small-caps"
    | "style"
    | "weight"
    | (string & {})
    | undefined;
  fontSynthesisPosition?: CSSGlobals | "auto" | "none" | undefined;
  fontSynthesisSmallCaps?: CSSGlobals | "auto" | "none" | undefined;
  fontSynthesisStyle?: CSSGlobals | "auto" | "none" | undefined;
  fontSynthesisWeight?: CSSGlobals | "auto" | "none" | undefined;
  fontVariant?:
    | CSSGlobals
    | CSSEastAsianVariantValues
    | "all-petite-caps"
    | "all-small-caps"
    | "common-ligatures"
    | "contextual"
    | "diagonal-fractions"
    | "discretionary-ligatures"
    | "full-width"
    | "historical-forms"
    | "historical-ligatures"
    | "lining-nums"
    | "no-common-ligatures"
    | "no-contextual"
    | "no-discretionary-ligatures"
    | "no-historical-ligatures"
    | "none"
    | "normal"
    | "oldstyle-nums"
    | "ordinal"
    | "petite-caps"
    | "proportional-nums"
    | "proportional-width"
    | "ruby"
    | "slashed-zero"
    | "small-caps"
    | "stacked-fractions"
    | "tabular-nums"
    | "titling-caps"
    | "unicase"
    | (string & {})
    | undefined;
  fontVariantAlternates?: CSSGlobals | "historical-forms" | "normal" | (string & {}) | undefined;
  fontVariantCaps?:
    | CSSGlobals
    | "all-petite-caps"
    | "all-small-caps"
    | "normal"
    | "petite-caps"
    | "small-caps"
    | "titling-caps"
    | "unicase"
    | undefined;
  fontVariantEastAsian?:
    | CSSGlobals
    | CSSEastAsianVariantValues
    | "full-width"
    | "normal"
    | "proportional-width"
    | "ruby"
    | (string & {})
    | undefined;
  fontVariantEmoji?: CSSGlobals | "emoji" | "normal" | "text" | "unicode" | undefined;
  fontVariantLigatures?:
    | CSSGlobals
    | "common-ligatures"
    | "contextual"
    | "discretionary-ligatures"
    | "historical-ligatures"
    | "no-common-ligatures"
    | "no-contextual"
    | "no-discretionary-ligatures"
    | "no-historical-ligatures"
    | "none"
    | "normal"
    | (string & {})
    | undefined;
  fontVariantNumeric?:
    | CSSGlobals
    | "diagonal-fractions"
    | "lining-nums"
    | "normal"
    | "oldstyle-nums"
    | "ordinal"
    | "proportional-nums"
    | "slashed-zero"
    | "stacked-fractions"
    | "tabular-nums"
    | (string & {})
    | undefined;
  fontVariantPosition?: CSSGlobals | "normal" | "sub" | "super" | undefined;
  fontVariationSettings?: CSSGlobals | "normal" | (string & {}) | undefined;
  fontWeight?: CSSGlobals | CSSFontWeightAbsolute | "bolder" | "lighter" | undefined;
  fontWidth?:
    | CSSGlobals
    | "condensed"
    | "expanded"
    | "extra-condensed"
    | "extra-expanded"
    | "normal"
    | "semi-condensed"
    | "semi-expanded"
    | "ultra-condensed"
    | "ultra-expanded"
    | (string & {})
    | undefined;
  forcedColorAdjust?: CSSGlobals | "auto" | "none" | "preserve-parent-color" | undefined;
  gridAutoColumns?: CSSGlobals | CSSTrackBreadth | (string & {}) | undefined;
  gridAutoFlow?: CSSGlobals | "column" | "dense" | "row" | (string & {}) | undefined;
  gridAutoRows?: CSSGlobals | CSSTrackBreadth | (string & {}) | undefined;
  gridColumnEnd?: CSSGlobals | CSSGridLine | undefined;
  gridColumnStart?: CSSGlobals | CSSGridLine | undefined;
  gridRowEnd?: CSSGlobals | CSSGridLine | undefined;
  gridRowStart?: CSSGlobals | CSSGridLine | undefined;
  gridTemplateAreas?: CSSGlobals | "none" | (string & {}) | undefined;
  gridTemplateColumns?:
    | CSSGlobals
    | CSSTrackBreadth
    | "none"
    | "subgrid"
    | (string & {})
    | undefined;
  gridTemplateRows?: CSSGlobals | CSSTrackBreadth | "none" | "subgrid" | (string & {}) | undefined;
  hangingPunctuation?:
    | CSSGlobals
    | "allow-end"
    | "first"
    | "force-end"
    | "last"
    | "none"
    | (string & {})
    | undefined;
  height?:
    | CSSGlobals
    | string
    | number
    | "-moz-fit-content"
    | "-moz-max-content"
    | "-moz-min-content"
    | "-webkit-fit-content"
    | "auto"
    | "fit-content"
    | "max-content"
    | "min-content"
    | (string & {})
    | undefined;
  hyphenateCharacter?: CSSGlobals | "auto" | (string & {}) | undefined;
  hyphenateLimitChars?: CSSGlobals | "auto" | (string & {}) | (number & {}) | undefined;
  hyphens?: CSSGlobals | "auto" | "manual" | "none" | undefined;
  imageOrientation?: CSSGlobals | "flip" | "from-image" | (string & {}) | undefined;
  imageRendering?:
    | CSSGlobals
    | "-moz-crisp-edges"
    | "-webkit-optimize-contrast"
    | "auto"
    | "crisp-edges"
    | "pixelated"
    | "smooth"
    | undefined;
  imageResolution?: CSSGlobals | "from-image" | (string & {}) | undefined;
  initialLetter?: CSSGlobals | "normal" | (string & {}) | (number & {}) | undefined;
  initialLetterAlign?: CSSGlobals | "alphabetic" | "auto" | "hanging" | "ideographic" | undefined;
  inlineSize?:
    | CSSGlobals
    | string
    | number
    | "-moz-fit-content"
    | "-moz-max-content"
    | "-moz-min-content"
    | "-webkit-fill-available"
    | "auto"
    | "fit-content"
    | "max-content"
    | "min-content"
    | (string & {})
    | undefined;
  insetBlockEnd?: CSSGlobals | string | number | "auto" | (string & {}) | undefined;
  insetBlockStart?: CSSGlobals | string | number | "auto" | (string & {}) | undefined;
  insetInlineEnd?: CSSGlobals | string | number | "auto" | (string & {}) | undefined;
  insetInlineStart?: CSSGlobals | string | number | "auto" | (string & {}) | undefined;
  interpolateSize?: CSSGlobals | "allow-keywords" | "numeric-only" | undefined;
  isolation?: CSSGlobals | "auto" | "isolate" | undefined;
  justifyContent?:
    | CSSGlobals
    | CSSContentDistribution
    | CSSContentPosition
    | "left"
    | "normal"
    | "right"
    | (string & {})
    | undefined;
  justifyItems?:
    | CSSGlobals
    | CSSSelfPosition
    | "anchor-center"
    | "baseline"
    | "left"
    | "legacy"
    | "normal"
    | "right"
    | "stretch"
    | (string & {})
    | undefined;
  justifySelf?:
    | CSSGlobals
    | CSSSelfPosition
    | "anchor-center"
    | "auto"
    | "baseline"
    | "left"
    | "normal"
    | "right"
    | "stretch"
    | (string & {})
    | undefined;
  justifyTracks?:
    | CSSGlobals
    | CSSContentDistribution
    | CSSContentPosition
    | "left"
    | "normal"
    | "right"
    | (string & {})
    | undefined;
  left?: CSSGlobals | string | number | "auto" | (string & {}) | undefined;
  letterSpacing?: CSSGlobals | string | number | "normal" | undefined;
  lightingColor?: CSSGlobals | CSSColor | undefined;
  lineBreak?: CSSGlobals | "anywhere" | "auto" | "loose" | "normal" | "strict" | undefined;
  lineHeight?: CSSGlobals | string | number | "normal" | (string & {}) | (number & {}) | undefined;
  lineHeightStep?: CSSGlobals | string | number | undefined;
  listStyleImage?: CSSGlobals | "none" | (string & {}) | undefined;
  listStylePosition?: CSSGlobals | "inside" | "outside" | undefined;
  listStyleType?: CSSGlobals | "none" | (string & {}) | undefined;
  marginBlockEnd?: CSSGlobals | string | number | "auto" | (string & {}) | undefined;
  marginBlockStart?: CSSGlobals | string | number | "auto" | (string & {}) | undefined;
  marginBottom?: CSSGlobals | string | number | "auto" | (string & {}) | undefined;
  marginInlineEnd?: CSSGlobals | string | number | "auto" | (string & {}) | undefined;
  marginInlineStart?: CSSGlobals | string | number | "auto" | (string & {}) | undefined;
  marginLeft?: CSSGlobals | string | number | "auto" | (string & {}) | undefined;
  marginRight?: CSSGlobals | string | number | "auto" | (string & {}) | undefined;
  marginTop?: CSSGlobals | string | number | "auto" | (string & {}) | undefined;
  marginTrim?: CSSGlobals | "all" | "in-flow" | "none" | undefined;
  marker?: CSSGlobals | "none" | (string & {}) | undefined;
  markerEnd?: CSSGlobals | "none" | (string & {}) | undefined;
  markerMid?: CSSGlobals | "none" | (string & {}) | undefined;
  markerStart?: CSSGlobals | "none" | (string & {}) | undefined;
  maskBorderMode?: CSSGlobals | "alpha" | "luminance" | undefined;
  maskBorderOutset?: CSSGlobals | string | number | (string & {}) | (number & {}) | undefined;
  maskBorderRepeat?:
    | CSSGlobals
    | "repeat"
    | "round"
    | "space"
    | "stretch"
    | (string & {})
    | undefined;
  maskBorderSlice?: CSSGlobals | (string & {}) | (number & {}) | undefined;
  maskBorderSource?: CSSGlobals | "none" | (string & {}) | undefined;
  maskBorderWidth?:
    | CSSGlobals
    | string
    | number
    | "auto"
    | (string & {})
    | (number & {})
    | undefined;
  maskClip?: CSSGlobals | CSSPaintBox | "no-clip" | "view-box" | (string & {}) | undefined;
  maskComposite?: CSSGlobals | CSSCompositingOperator | (string & {}) | undefined;
  maskImage?: CSSGlobals | "none" | (string & {}) | undefined;
  maskMode?: CSSGlobals | CSSMaskingMode | (string & {}) | undefined;
  maskOrigin?: CSSGlobals | CSSPaintBox | "view-box" | (string & {}) | undefined;
  maskPosition?: CSSGlobals | CSSPosition | (string & {}) | undefined;
  maskRepeat?: CSSGlobals | CSSRepeatStyle | (string & {}) | undefined;
  maskSize?: CSSGlobals | CSSBgSize | (string & {}) | undefined;
  maskType?: CSSGlobals | "alpha" | "luminance" | undefined;
  masonryAutoFlow?:
    | CSSGlobals
    | "definite-first"
    | "next"
    | "ordered"
    | "pack"
    | (string & {})
    | undefined;
  mathDepth?: CSSGlobals | "auto-add" | (string & {}) | (number & {}) | undefined;
  mathShift?: CSSGlobals | "compact" | "normal" | undefined;
  mathStyle?: CSSGlobals | "compact" | "normal" | undefined;
  maxBlockSize?:
    | CSSGlobals
    | string
    | number
    | "-moz-max-content"
    | "-moz-min-content"
    | "-webkit-fill-available"
    | "fit-content"
    | "max-content"
    | "min-content"
    | "none"
    | (string & {})
    | undefined;
  maxHeight?:
    | CSSGlobals
    | string
    | number
    | "-moz-fit-content"
    | "-moz-max-content"
    | "-moz-min-content"
    | "-webkit-fit-content"
    | "-webkit-max-content"
    | "-webkit-min-content"
    | "fit-content"
    | "intrinsic"
    | "max-content"
    | "min-content"
    | "none"
    | (string & {})
    | undefined;
  maxInlineSize?:
    | CSSGlobals
    | string
    | number
    | "-moz-fit-content"
    | "-moz-max-content"
    | "-moz-min-content"
    | "-webkit-fill-available"
    | "fit-content"
    | "max-content"
    | "min-content"
    | "none"
    | (string & {})
    | undefined;
  maxLines?: CSSGlobals | "none" | (number & {}) | (string & {}) | undefined;
  maxWidth?:
    | CSSGlobals
    | string
    | number
    | "-moz-fit-content"
    | "-moz-max-content"
    | "-moz-min-content"
    | "-webkit-fit-content"
    | "-webkit-max-content"
    | "-webkit-min-content"
    | "fit-content"
    | "intrinsic"
    | "max-content"
    | "min-content"
    | "none"
    | (string & {})
    | undefined;
  minBlockSize?:
    | CSSGlobals
    | string
    | number
    | "-moz-max-content"
    | "-moz-min-content"
    | "-webkit-fill-available"
    | "auto"
    | "fit-content"
    | "max-content"
    | "min-content"
    | (string & {})
    | undefined;
  minHeight?:
    | CSSGlobals
    | string
    | number
    | "-moz-fit-content"
    | "-moz-max-content"
    | "-moz-min-content"
    | "-webkit-fit-content"
    | "-webkit-max-content"
    | "-webkit-min-content"
    | "auto"
    | "fit-content"
    | "intrinsic"
    | "max-content"
    | "min-content"
    | (string & {})
    | undefined;
  minInlineSize?:
    | CSSGlobals
    | string
    | number
    | "-moz-fit-content"
    | "-moz-max-content"
    | "-moz-min-content"
    | "-webkit-fill-available"
    | "auto"
    | "fit-content"
    | "max-content"
    | "min-content"
    | (string & {})
    | undefined;
  minWidth?:
    | CSSGlobals
    | string
    | number
    | "-moz-fit-content"
    | "-moz-max-content"
    | "-moz-min-content"
    | "-webkit-fit-content"
    | "-webkit-max-content"
    | "-webkit-min-content"
    | "auto"
    | "fit-content"
    | "intrinsic"
    | "max-content"
    | "min-content"
    | "min-intrinsic"
    | (string & {})
    | undefined;
  mixBlendMode?: CSSGlobals | CSSBlendMode | "plus-darker" | "plus-lighter" | undefined;
  motionDistance?: CSSGlobals | string | number | (string & {}) | undefined;
  motionPath?: CSSGlobals | CSSPaintBox | "none" | "view-box" | (string & {}) | undefined;
  motionRotation?: CSSGlobals | "auto" | "reverse" | (string & {}) | undefined;
  objectFit?: CSSGlobals | "contain" | "cover" | "fill" | "none" | "scale-down" | undefined;
  objectPosition?: CSSGlobals | CSSPosition | undefined;
  objectViewBox?: CSSGlobals | "none" | (string & {}) | undefined;
  offsetAnchor?: CSSGlobals | CSSPosition | "auto" | undefined;
  offsetDistance?: CSSGlobals | string | number | (string & {}) | undefined;
  offsetPath?: CSSGlobals | CSSPaintBox | "none" | "view-box" | (string & {}) | undefined;
  offsetPosition?: CSSGlobals | CSSPosition | "auto" | "normal" | undefined;
  offsetRotate?: CSSGlobals | "auto" | "reverse" | (string & {}) | undefined;
  offsetRotation?: CSSGlobals | "auto" | "reverse" | (string & {}) | undefined;
  opacity?: CSSGlobals | (string & {}) | (number & {}) | undefined;
  order?: CSSGlobals | (number & {}) | (string & {}) | undefined;
  orphans?: CSSGlobals | (number & {}) | (string & {}) | undefined;
  outlineColor?: CSSGlobals | CSSColor | "auto" | undefined;
  outlineOffset?: CSSGlobals | string | number | undefined;
  outlineStyle?: CSSGlobals | CSSOutlineLineStyle | "auto" | undefined;
  outlineWidth?: CSSGlobals | CSSLineWidth | undefined;
  overflowAnchor?: CSSGlobals | "auto" | "none" | undefined;
  overflowBlock?: CSSGlobals | "auto" | "clip" | "hidden" | "scroll" | "visible" | undefined;
  overflowClipBox?: CSSGlobals | "content-box" | "padding-box" | undefined;
  overflowClipMargin?: CSSGlobals | CSSVisualBox | string | number | (string & {}) | undefined;
  overflowInline?: CSSGlobals | "auto" | "clip" | "hidden" | "scroll" | "visible" | undefined;
  overflowWrap?: CSSGlobals | "anywhere" | "break-word" | "normal" | undefined;
  overflowX?:
    | CSSGlobals
    | "-moz-hidden-unscrollable"
    | "auto"
    | "clip"
    | "hidden"
    | "overlay"
    | "scroll"
    | "visible"
    | undefined;
  overflowY?:
    | CSSGlobals
    | "-moz-hidden-unscrollable"
    | "auto"
    | "clip"
    | "hidden"
    | "overlay"
    | "scroll"
    | "visible"
    | undefined;
  overlay?: CSSGlobals | "auto" | "none" | undefined;
  overscrollBehaviorBlock?: CSSGlobals | "auto" | "contain" | "none" | undefined;
  overscrollBehaviorInline?: CSSGlobals | "auto" | "contain" | "none" | undefined;
  overscrollBehaviorX?: CSSGlobals | "auto" | "contain" | "none" | undefined;
  overscrollBehaviorY?: CSSGlobals | "auto" | "contain" | "none" | undefined;
  paddingBlockEnd?: CSSGlobals | string | number | (string & {}) | undefined;
  paddingBlockStart?: CSSGlobals | string | number | (string & {}) | undefined;
  paddingBottom?: CSSGlobals | string | number | (string & {}) | undefined;
  paddingInlineEnd?: CSSGlobals | string | number | (string & {}) | undefined;
  paddingInlineStart?: CSSGlobals | string | number | (string & {}) | undefined;
  paddingLeft?: CSSGlobals | string | number | (string & {}) | undefined;
  paddingRight?: CSSGlobals | string | number | (string & {}) | undefined;
  paddingTop?: CSSGlobals | string | number | (string & {}) | undefined;
  page?: CSSGlobals | "auto" | (string & {}) | undefined;
  paintOrder?: CSSGlobals | "fill" | "markers" | "normal" | "stroke" | (string & {}) | undefined;
  perspective?: CSSGlobals | string | number | "none" | undefined;
  perspectiveOrigin?: CSSGlobals | CSSPosition | undefined;
  pointerEvents?:
    | CSSGlobals
    | "all"
    | "auto"
    | "fill"
    | "inherit"
    | "none"
    | "painted"
    | "stroke"
    | "visible"
    | "visibleFill"
    | "visiblePainted"
    | "visibleStroke"
    | undefined;
  position?:
    | CSSGlobals
    | "-webkit-sticky"
    | "absolute"
    | "fixed"
    | "relative"
    | "static"
    | "sticky"
    | undefined;
  positionAnchor?: CSSGlobals | "auto" | (string & {}) | undefined;
  positionArea?: CSSGlobals | CSSPositionArea | "none" | undefined;
  positionTryFallbacks?:
    | CSSGlobals
    | CSSTryTactic
    | CSSPositionArea
    | "none"
    | (string & {})
    | undefined;
  positionTryOrder?: CSSGlobals | CSSTrySize | "normal" | undefined;
  positionVisibility?:
    | CSSGlobals
    | "always"
    | "anchors-valid"
    | "anchors-visible"
    | "no-overflow"
    | (string & {})
    | undefined;
  printColorAdjust?: CSSGlobals | "economy" | "exact" | undefined;
  quotes?: CSSGlobals | "auto" | "none" | (string & {}) | undefined;
  r?: CSSGlobals | string | number | (string & {}) | undefined;
  resize?:
    | CSSGlobals
    | "block"
    | "both"
    | "horizontal"
    | "inline"
    | "none"
    | "vertical"
    | undefined;
  right?: CSSGlobals | string | number | "auto" | (string & {}) | undefined;
  rotate?: CSSGlobals | "none" | (string & {}) | undefined;
  rowGap?: CSSGlobals | string | number | "normal" | (string & {}) | undefined;
  rubyAlign?: CSSGlobals | "center" | "space-around" | "space-between" | "start" | undefined;
  rubyMerge?: CSSGlobals | "auto" | "collapse" | "separate" | undefined;
  rubyOverhang?: CSSGlobals | "auto" | "none" | undefined;
  rubyPosition?:
    | CSSGlobals
    | "alternate"
    | "inter-character"
    | "over"
    | "under"
    | (string & {})
    | undefined;
  rx?: CSSGlobals | string | number | (string & {}) | undefined;
  ry?: CSSGlobals | string | number | (string & {}) | undefined;
  scale?: CSSGlobals | "none" | (string & {}) | (number & {}) | undefined;
  scrollBehavior?: CSSGlobals | "auto" | "smooth" | undefined;
  scrollInitialTarget?: CSSGlobals | "nearest" | "none" | undefined;
  scrollMarginBlockEnd?: CSSGlobals | string | number | undefined;
  scrollMarginBlockStart?: CSSGlobals | string | number | undefined;
  scrollMarginBottom?: CSSGlobals | string | number | undefined;
  scrollMarginInlineEnd?: CSSGlobals | string | number | undefined;
  scrollMarginInlineStart?: CSSGlobals | string | number | undefined;
  scrollMarginLeft?: CSSGlobals | string | number | undefined;
  scrollMarginRight?: CSSGlobals | string | number | undefined;
  scrollMarginTop?: CSSGlobals | string | number | undefined;
  scrollPaddingBlockEnd?: CSSGlobals | string | number | "auto" | (string & {}) | undefined;
  scrollPaddingBlockStart?: CSSGlobals | string | number | "auto" | (string & {}) | undefined;
  scrollPaddingBottom?: CSSGlobals | string | number | "auto" | (string & {}) | undefined;
  scrollPaddingInlineEnd?: CSSGlobals | string | number | "auto" | (string & {}) | undefined;
  scrollPaddingInlineStart?: CSSGlobals | string | number | "auto" | (string & {}) | undefined;
  scrollPaddingLeft?: CSSGlobals | string | number | "auto" | (string & {}) | undefined;
  scrollPaddingRight?: CSSGlobals | string | number | "auto" | (string & {}) | undefined;
  scrollPaddingTop?: CSSGlobals | string | number | "auto" | (string & {}) | undefined;
  scrollSnapAlign?: CSSGlobals | "center" | "end" | "none" | "start" | (string & {}) | undefined;
  scrollSnapMarginBottom?: CSSGlobals | string | number | undefined;
  scrollSnapMarginLeft?: CSSGlobals | string | number | undefined;
  scrollSnapMarginRight?: CSSGlobals | string | number | undefined;
  scrollSnapMarginTop?: CSSGlobals | string | number | undefined;
  scrollSnapStop?: CSSGlobals | "always" | "normal" | undefined;
  scrollSnapType?:
    | CSSGlobals
    | "block"
    | "both"
    | "inline"
    | "none"
    | "x"
    | "y"
    | (string & {})
    | undefined;
  scrollTimelineAxis?: CSSGlobals | "block" | "inline" | "x" | "y" | (string & {}) | undefined;
  scrollTimelineName?: CSSGlobals | "none" | (string & {}) | undefined;
  scrollbarColor?: CSSGlobals | "auto" | (string & {}) | undefined;
  scrollbarGutter?: CSSGlobals | "auto" | "stable" | (string & {}) | undefined;
  scrollbarWidth?: CSSGlobals | "auto" | "none" | "thin" | undefined;
  shapeImageThreshold?: CSSGlobals | (string & {}) | (number & {}) | undefined;
  shapeMargin?: CSSGlobals | string | number | (string & {}) | undefined;
  shapeOutside?: CSSGlobals | CSSVisualBox | "margin-box" | "none" | (string & {}) | undefined;
  shapeRendering?:
    | CSSGlobals
    | "auto"
    | "crispEdges"
    | "geometricPrecision"
    | "optimizeSpeed"
    | undefined;
  speakAs?:
    | CSSGlobals
    | "digits"
    | "literal-punctuation"
    | "no-punctuation"
    | "normal"
    | "spell-out"
    | (string & {})
    | undefined;
  stopColor?: CSSGlobals | CSSColor | undefined;
  stopOpacity?: CSSGlobals | (string & {}) | (number & {}) | undefined;
  stroke?: CSSGlobals | CSSPaint | undefined;
  strokeColor?: CSSGlobals | CSSColor | undefined;
  strokeDasharray?: CSSGlobals | CSSDasharray | "none" | undefined;
  strokeDashoffset?: CSSGlobals | string | number | (string & {}) | (number & {}) | undefined;
  strokeLinecap?: CSSGlobals | "butt" | "round" | "square" | undefined;
  strokeLinejoin?: CSSGlobals | "arcs" | "bevel" | "miter" | "miter-clip" | "round" | undefined;
  strokeMiterlimit?: CSSGlobals | (number & {}) | (string & {}) | undefined;
  strokeOpacity?: CSSGlobals | (string & {}) | (number & {}) | undefined;
  strokeWidth?: CSSGlobals | string | number | (string & {}) | (number & {}) | undefined;
  tabSize?: CSSGlobals | string | number | (number & {}) | (string & {}) | undefined;
  tableLayout?: CSSGlobals | "auto" | "fixed" | undefined;
  textAlign?:
    | CSSGlobals
    | "-khtml-center"
    | "-khtml-left"
    | "-khtml-right"
    | "-moz-center"
    | "-moz-left"
    | "-moz-right"
    | "-webkit-center"
    | "-webkit-left"
    | "-webkit-match-parent"
    | "-webkit-right"
    | "center"
    | "end"
    | "justify"
    | "left"
    | "match-parent"
    | "right"
    | "start"
    | undefined;
  textAlignLast?:
    | CSSGlobals
    | "auto"
    | "center"
    | "end"
    | "justify"
    | "left"
    | "right"
    | "start"
    | undefined;
  textAnchor?: CSSGlobals | "end" | "middle" | "start" | undefined;
  textAutospace?: CSSGlobals | CSSAutospace | "auto" | "normal" | undefined;
  textBox?:
    | CSSGlobals
    | CSSTextEdge
    | "auto"
    | "none"
    | "normal"
    | "trim-both"
    | "trim-end"
    | "trim-start"
    | (string & {})
    | undefined;
  textBoxEdge?: CSSGlobals | CSSTextEdge | "auto" | undefined;
  textBoxTrim?: CSSGlobals | "none" | "trim-both" | "trim-end" | "trim-start" | undefined;
  textCombineUpright?: CSSGlobals | "all" | "digits" | "none" | (string & {}) | undefined;
  textDecorationColor?: CSSGlobals | CSSColor | undefined;
  textDecorationLine?:
    | CSSGlobals
    | "blink"
    | "grammar-error"
    | "line-through"
    | "none"
    | "overline"
    | "spelling-error"
    | "underline"
    | (string & {})
    | undefined;
  textDecorationSkip?:
    | CSSGlobals
    | "box-decoration"
    | "edges"
    | "leading-spaces"
    | "none"
    | "objects"
    | "spaces"
    | "trailing-spaces"
    | (string & {})
    | undefined;
  textDecorationSkipInk?: CSSGlobals | "all" | "auto" | "none" | undefined;
  textDecorationStyle?: CSSGlobals | "dashed" | "dotted" | "double" | "solid" | "wavy" | undefined;
  textDecorationThickness?:
    | CSSGlobals
    | string
    | number
    | "auto"
    | "from-font"
    | (string & {})
    | undefined;
  textEmphasisColor?: CSSGlobals | CSSColor | undefined;
  textEmphasisPosition?: CSSGlobals | "auto" | "over" | "under" | (string & {}) | undefined;
  textEmphasisStyle?:
    | CSSGlobals
    | "circle"
    | "dot"
    | "double-circle"
    | "filled"
    | "none"
    | "open"
    | "sesame"
    | "triangle"
    | (string & {})
    | undefined;
  textIndent?: CSSGlobals | string | number | (string & {}) | undefined;
  textJustify?:
    | CSSGlobals
    | "auto"
    | "distribute"
    | "inter-character"
    | "inter-word"
    | "none"
    | undefined;
  textOrientation?: CSSGlobals | "mixed" | "sideways" | "sideways-right" | "upright" | undefined;
  textOverflow?: CSSGlobals | "clip" | "ellipsis" | (string & {}) | undefined;
  textRendering?:
    | CSSGlobals
    | "auto"
    | "geometricPrecision"
    | "optimizeLegibility"
    | "optimizeSpeed"
    | undefined;
  textShadow?: CSSGlobals | "none" | (string & {}) | undefined;
  textSizeAdjust?: CSSGlobals | "auto" | "none" | (string & {}) | undefined;
  textSpacingTrim?: CSSGlobals | "normal" | "space-all" | "space-first" | "trim-start" | undefined;
  textTransform?:
    | CSSGlobals
    | "capitalize"
    | "full-size-kana"
    | "full-width"
    | "lowercase"
    | "math-auto"
    | "none"
    | "uppercase"
    | (string & {})
    | undefined;
  textUnderlineOffset?: CSSGlobals | string | number | "auto" | (string & {}) | undefined;
  textUnderlinePosition?:
    | CSSGlobals
    | "auto"
    | "from-font"
    | "left"
    | "right"
    | "under"
    | (string & {})
    | undefined;
  textWrapMode?: CSSGlobals | "nowrap" | "wrap" | undefined;
  textWrapStyle?: CSSGlobals | "auto" | "balance" | "pretty" | "stable" | undefined;
  timelineScope?: CSSGlobals | "none" | (string & {}) | undefined;
  top?: CSSGlobals | string | number | "auto" | (string & {}) | undefined;
  touchAction?:
    | CSSGlobals
    | "-ms-manipulation"
    | "-ms-none"
    | "-ms-pan-x"
    | "-ms-pan-y"
    | "-ms-pinch-zoom"
    | "auto"
    | "manipulation"
    | "none"
    | "pan-down"
    | "pan-left"
    | "pan-right"
    | "pan-up"
    | "pan-x"
    | "pan-y"
    | "pinch-zoom"
    | (string & {})
    | undefined;
  transform?: CSSGlobals | "none" | (string & {}) | undefined;
  transformBox?:
    | CSSGlobals
    | "border-box"
    | "content-box"
    | "fill-box"
    | "stroke-box"
    | "view-box"
    | undefined;
  transformOrigin?:
    | CSSGlobals
    | string
    | number
    | "bottom"
    | "center"
    | "left"
    | "right"
    | "top"
    | (string & {})
    | undefined;
  transformStyle?: CSSGlobals | "flat" | "preserve-3d" | undefined;
  transitionBehavior?: CSSGlobals | "allow-discrete" | "normal" | (string & {}) | undefined;
  transitionDelay?: CSSGlobals | (string & {}) | undefined;
  transitionDuration?: CSSGlobals | (string & {}) | undefined;
  transitionProperty?: CSSGlobals | "all" | "none" | (string & {}) | undefined;
  transitionTimingFunction?: CSSGlobals | CSSEasingFunction | (string & {}) | undefined;
  translate?: CSSGlobals | string | number | "none" | (string & {}) | undefined;
  unicodeBidi?:
    | CSSGlobals
    | "-moz-isolate"
    | "-moz-isolate-override"
    | "-moz-plaintext"
    | "-webkit-isolate"
    | "-webkit-isolate-override"
    | "-webkit-plaintext"
    | "bidi-override"
    | "embed"
    | "isolate"
    | "isolate-override"
    | "normal"
    | "plaintext"
    | undefined;
  userSelect?: CSSGlobals | "-moz-none" | "all" | "auto" | "none" | "text" | undefined;
  vectorEffect?:
    | CSSGlobals
    | "fixed-position"
    | "non-rotation"
    | "non-scaling-size"
    | "non-scaling-stroke"
    | "none"
    | undefined;
  verticalAlign?:
    | CSSGlobals
    | string
    | number
    | "baseline"
    | "bottom"
    | "middle"
    | "sub"
    | "super"
    | "text-bottom"
    | "text-top"
    | "top"
    | (string & {})
    | undefined;
  viewTimelineAxis?: CSSGlobals | "block" | "inline" | "x" | "y" | (string & {}) | undefined;
  viewTimelineInset?: CSSGlobals | string | number | "auto" | (string & {}) | undefined;
  viewTimelineName?: CSSGlobals | "none" | (string & {}) | undefined;
  viewTransitionClass?: CSSGlobals | "none" | (string & {}) | undefined;
  viewTransitionName?: CSSGlobals | "match-element" | "none" | (string & {}) | undefined;
  visibility?: CSSGlobals | "collapse" | "hidden" | "visible" | undefined;
  whiteSpace?:
    | CSSGlobals
    | "-moz-pre-wrap"
    | "break-spaces"
    | "collapse"
    | "normal"
    | "nowrap"
    | "pre"
    | "pre-line"
    | "pre-wrap"
    | "preserve"
    | "preserve-breaks"
    | "preserve-spaces"
    | "wrap"
    | (string & {})
    | undefined;
  whiteSpaceCollapse?:
    | CSSGlobals
    | "break-spaces"
    | "collapse"
    | "preserve"
    | "preserve-breaks"
    | "preserve-spaces"
    | undefined;
  widows?: CSSGlobals | (number & {}) | (string & {}) | undefined;
  width?:
    | CSSGlobals
    | string
    | number
    | "-moz-fit-content"
    | "-moz-max-content"
    | "-moz-min-content"
    | "-webkit-fit-content"
    | "-webkit-max-content"
    | "auto"
    | "fit-content"
    | "intrinsic"
    | "max-content"
    | "min-content"
    | "min-intrinsic"
    | (string & {})
    | undefined;
  willChange?: CSSGlobals | CSSAnimateableFeature | "auto" | (string & {}) | undefined;
  wordBreak?:
    | CSSGlobals
    | "auto-phrase"
    | "break-all"
    | "break-word"
    | "keep-all"
    | "normal"
    | undefined;
  wordSpacing?: CSSGlobals | string | number | "normal" | undefined;
  wordWrap?: CSSGlobals | "break-word" | "normal" | undefined;
  writingMode?:
    | CSSGlobals
    | "horizontal-tb"
    | "sideways-lr"
    | "sideways-rl"
    | "vertical-lr"
    | "vertical-rl"
    | undefined;
  x?: CSSGlobals | string | number | (string & {}) | undefined;
  y?: CSSGlobals | string | number | (string & {}) | undefined;
  zIndex?: CSSGlobals | "auto" | (number & {}) | (string & {}) | undefined;
  zoom?: CSSGlobals | "normal" | "reset" | (string & {}) | (number & {}) | undefined;
  all?: CSSGlobals | undefined;
  animation?: CSSGlobals | CSSSingleAnimation | (string & {}) | undefined;
  animationRange?:
    | CSSGlobals
    | CSSTimelineRangeName
    | string
    | number
    | "normal"
    | (string & {})
    | undefined;
  background?: CSSGlobals | CSSBgLayer | CSSFinalBgLayer | (string & {}) | undefined;
  backgroundPosition?: CSSGlobals | CSSBgPosition | (string & {}) | undefined;
  border?: CSSGlobals | CSSLineWidth | CSSLineStyle | CSSColor | (string & {}) | undefined;
  borderBlock?: CSSGlobals | CSSLineWidth | CSSLineStyle | CSSColor | (string & {}) | undefined;
  borderBlockColor?: CSSGlobals | CSSColor | (string & {}) | undefined;
  borderBlockEnd?: CSSGlobals | CSSLineWidth | CSSLineStyle | CSSColor | (string & {}) | undefined;
  borderBlockStart?:
    | CSSGlobals
    | CSSLineWidth
    | CSSLineStyle
    | CSSColor
    | (string & {})
    | undefined;
  borderBlockStyle?: CSSGlobals | CSSLineStyle | (string & {}) | undefined;
  borderBlockWidth?: CSSGlobals | CSSLineWidth | (string & {}) | undefined;
  borderBottom?: CSSGlobals | CSSLineWidth | CSSLineStyle | CSSColor | (string & {}) | undefined;
  borderColor?: CSSGlobals | CSSColor | (string & {}) | undefined;
  borderImage?:
    | CSSGlobals
    | "none"
    | "repeat"
    | "round"
    | "space"
    | "stretch"
    | (string & {})
    | (number & {})
    | undefined;
  borderInline?: CSSGlobals | CSSLineWidth | CSSLineStyle | CSSColor | (string & {}) | undefined;
  borderInlineColor?: CSSGlobals | CSSColor | (string & {}) | undefined;
  borderInlineEnd?: CSSGlobals | CSSLineWidth | CSSLineStyle | CSSColor | (string & {}) | undefined;
  borderInlineStart?:
    | CSSGlobals
    | CSSLineWidth
    | CSSLineStyle
    | CSSColor
    | (string & {})
    | undefined;
  borderInlineStyle?: CSSGlobals | CSSLineStyle | (string & {}) | undefined;
  borderInlineWidth?: CSSGlobals | CSSLineWidth | (string & {}) | undefined;
  borderLeft?: CSSGlobals | CSSLineWidth | CSSLineStyle | CSSColor | (string & {}) | undefined;
  borderRadius?: CSSGlobals | string | number | (string & {}) | undefined;
  borderRight?: CSSGlobals | CSSLineWidth | CSSLineStyle | CSSColor | (string & {}) | undefined;
  borderStyle?: CSSGlobals | CSSLineStyle | (string & {}) | undefined;
  borderTop?: CSSGlobals | CSSLineWidth | CSSLineStyle | CSSColor | (string & {}) | undefined;
  borderWidth?: CSSGlobals | CSSLineWidth | (string & {}) | undefined;
  caret?:
    | CSSGlobals
    | CSSColor
    | "auto"
    | "bar"
    | "block"
    | "underscore"
    | (string & {})
    | undefined;
  columnRule?: CSSGlobals | CSSLineWidth | CSSLineStyle | CSSColor | (string & {}) | undefined;
  columns?: CSSGlobals | string | number | "auto" | (string & {}) | (number & {}) | undefined;
  containIntrinsicSize?: CSSGlobals | string | number | "none" | (string & {}) | undefined;
  container?: CSSGlobals | "none" | (string & {}) | undefined;
  flex?:
    | CSSGlobals
    | string
    | number
    | "auto"
    | "content"
    | "fit-content"
    | "max-content"
    | "min-content"
    | "none"
    | (string & {})
    | (number & {})
    | undefined;
  flexFlow?:
    | CSSGlobals
    | "column"
    | "column-reverse"
    | "nowrap"
    | "row"
    | "row-reverse"
    | "wrap"
    | "wrap-reverse"
    | (string & {})
    | undefined;
  font?: CSSGlobals | CSSSystemFamilyName | (string & {}) | undefined;
  gap?: CSSGlobals | string | number | "normal" | (string & {}) | undefined;
  grid?: CSSGlobals | "none" | (string & {}) | undefined;
  gridArea?: CSSGlobals | CSSGridLine | (string & {}) | undefined;
  gridColumn?: CSSGlobals | CSSGridLine | (string & {}) | undefined;
  gridRow?: CSSGlobals | CSSGridLine | (string & {}) | undefined;
  gridTemplate?: CSSGlobals | "none" | (string & {}) | undefined;
  inset?: CSSGlobals | string | number | "auto" | (string & {}) | undefined;
  insetBlock?: CSSGlobals | string | number | "auto" | (string & {}) | undefined;
  insetInline?: CSSGlobals | string | number | "auto" | (string & {}) | undefined;
  lineClamp?: CSSGlobals | "none" | (number & {}) | (string & {}) | undefined;
  listStyle?: CSSGlobals | "inside" | "none" | "outside" | (string & {}) | undefined;
  margin?: CSSGlobals | string | number | "auto" | (string & {}) | undefined;
  marginBlock?: CSSGlobals | string | number | "auto" | (string & {}) | undefined;
  marginInline?: CSSGlobals | string | number | "auto" | (string & {}) | undefined;
  mask?: CSSGlobals | CSSMaskLayer | (string & {}) | undefined;
  maskBorder?:
    | CSSGlobals
    | "alpha"
    | "luminance"
    | "none"
    | "repeat"
    | "round"
    | "space"
    | "stretch"
    | (string & {})
    | (number & {})
    | undefined;
  motion?:
    | CSSGlobals
    | CSSPosition
    | CSSPaintBox
    | "auto"
    | "none"
    | "normal"
    | "view-box"
    | (string & {})
    | undefined;
  offset?:
    | CSSGlobals
    | CSSPosition
    | CSSPaintBox
    | "auto"
    | "none"
    | "normal"
    | "view-box"
    | (string & {})
    | undefined;
  outline?:
    | CSSGlobals
    | CSSLineWidth
    | CSSOutlineLineStyle
    | CSSColor
    | "auto"
    | (string & {})
    | undefined;
  overflow?:
    | CSSGlobals
    | "-moz-hidden-unscrollable"
    | "auto"
    | "clip"
    | "hidden"
    | "overlay"
    | "scroll"
    | "visible"
    | (string & {})
    | undefined;
  overscrollBehavior?: CSSGlobals | "auto" | "contain" | "none" | (string & {}) | undefined;
  padding?: CSSGlobals | string | number | (string & {}) | undefined;
  paddingBlock?: CSSGlobals | string | number | (string & {}) | undefined;
  paddingInline?: CSSGlobals | string | number | (string & {}) | undefined;
  placeContent?:
    | CSSGlobals
    | CSSContentDistribution
    | CSSContentPosition
    | "baseline"
    | "normal"
    | (string & {})
    | undefined;
  placeItems?:
    | CSSGlobals
    | CSSSelfPosition
    | "anchor-center"
    | "baseline"
    | "normal"
    | "stretch"
    | (string & {})
    | undefined;
  placeSelf?:
    | CSSGlobals
    | CSSSelfPosition
    | "anchor-center"
    | "auto"
    | "baseline"
    | "normal"
    | "stretch"
    | (string & {})
    | undefined;
  positionTry?: CSSGlobals | CSSTryTactic | CSSPositionArea | "none" | (string & {}) | undefined;
  scrollMargin?: CSSGlobals | string | number | (string & {}) | undefined;
  scrollMarginBlock?: CSSGlobals | string | number | (string & {}) | undefined;
  scrollMarginInline?: CSSGlobals | string | number | (string & {}) | undefined;
  scrollPadding?: CSSGlobals | string | number | "auto" | (string & {}) | undefined;
  scrollPaddingBlock?: CSSGlobals | string | number | "auto" | (string & {}) | undefined;
  scrollPaddingInline?: CSSGlobals | string | number | "auto" | (string & {}) | undefined;
  scrollSnapMargin?: CSSGlobals | string | number | (string & {}) | undefined;
  scrollTimeline?: CSSGlobals | "none" | (string & {}) | undefined;
  textDecoration?:
    | CSSGlobals
    | CSSColor
    | string
    | number
    | "auto"
    | "blink"
    | "dashed"
    | "dotted"
    | "double"
    | "from-font"
    | "grammar-error"
    | "line-through"
    | "none"
    | "overline"
    | "solid"
    | "spelling-error"
    | "underline"
    | "wavy"
    | (string & {})
    | undefined;
  textEmphasis?:
    | CSSGlobals
    | CSSColor
    | "circle"
    | "dot"
    | "double-circle"
    | "filled"
    | "none"
    | "open"
    | "sesame"
    | "triangle"
    | (string & {})
    | undefined;
  textWrap?:
    | CSSGlobals
    | "auto"
    | "balance"
    | "nowrap"
    | "pretty"
    | "stable"
    | "wrap"
    | (string & {})
    | undefined;
  transition?: CSSGlobals | CSSSingleTransition | (string & {}) | undefined;
  viewTimeline?: CSSGlobals | "none" | (string & {}) | undefined;
  MozAnimationDelay?: CSSGlobals | (string & {}) | undefined;
  MozAnimationDirection?: CSSGlobals | CSSSingleAnimationDirection | (string & {}) | undefined;
  MozAnimationDuration?: CSSGlobals | (string & {}) | "auto" | undefined;
  MozAnimationFillMode?: CSSGlobals | CSSSingleAnimationFillMode | (string & {}) | undefined;
  MozAnimationIterationCount?: CSSGlobals | "infinite" | (string & {}) | (number & {}) | undefined;
  MozAnimationName?: CSSGlobals | "none" | (string & {}) | undefined;
  MozAnimationPlayState?: CSSGlobals | "paused" | "running" | (string & {}) | undefined;
  MozAnimationTimingFunction?: CSSGlobals | CSSEasingFunction | (string & {}) | undefined;
  MozAppearance?:
    | CSSGlobals
    | "-moz-mac-unified-toolbar"
    | "-moz-win-borderless-glass"
    | "-moz-win-browsertabbar-toolbox"
    | "-moz-win-communications-toolbox"
    | "-moz-win-communicationstext"
    | "-moz-win-exclude-glass"
    | "-moz-win-glass"
    | "-moz-win-media-toolbox"
    | "-moz-win-mediatext"
    | "-moz-window-button-box"
    | "-moz-window-button-box-maximized"
    | "-moz-window-button-close"
    | "-moz-window-button-maximize"
    | "-moz-window-button-minimize"
    | "-moz-window-button-restore"
    | "-moz-window-frame-bottom"
    | "-moz-window-frame-left"
    | "-moz-window-frame-right"
    | "-moz-window-titlebar"
    | "-moz-window-titlebar-maximized"
    | "button"
    | "button-arrow-down"
    | "button-arrow-next"
    | "button-arrow-previous"
    | "button-arrow-up"
    | "button-bevel"
    | "button-focus"
    | "caret"
    | "checkbox"
    | "checkbox-container"
    | "checkbox-label"
    | "checkmenuitem"
    | "dualbutton"
    | "groupbox"
    | "listbox"
    | "listitem"
    | "menuarrow"
    | "menubar"
    | "menucheckbox"
    | "menuimage"
    | "menuitem"
    | "menuitemtext"
    | "menulist"
    | "menulist-button"
    | "menulist-text"
    | "menulist-textfield"
    | "menupopup"
    | "menuradio"
    | "menuseparator"
    | "meterbar"
    | "meterchunk"
    | "none"
    | "progressbar"
    | "progressbar-vertical"
    | "progresschunk"
    | "progresschunk-vertical"
    | "radio"
    | "radio-container"
    | "radio-label"
    | "radiomenuitem"
    | "range"
    | "range-thumb"
    | "resizer"
    | "resizerpanel"
    | "scale-horizontal"
    | "scale-vertical"
    | "scalethumb-horizontal"
    | "scalethumb-vertical"
    | "scalethumbend"
    | "scalethumbstart"
    | "scalethumbtick"
    | "scrollbarbutton-down"
    | "scrollbarbutton-left"
    | "scrollbarbutton-right"
    | "scrollbarbutton-up"
    | "scrollbarthumb-horizontal"
    | "scrollbarthumb-vertical"
    | "scrollbartrack-horizontal"
    | "scrollbartrack-vertical"
    | "searchfield"
    | "separator"
    | "sheet"
    | "spinner"
    | "spinner-downbutton"
    | "spinner-textfield"
    | "spinner-upbutton"
    | "splitter"
    | "statusbar"
    | "statusbarpanel"
    | "tab"
    | "tab-scroll-arrow-back"
    | "tab-scroll-arrow-forward"
    | "tabpanel"
    | "tabpanels"
    | "textfield"
    | "textfield-multiline"
    | "toolbar"
    | "toolbarbutton"
    | "toolbarbutton-dropdown"
    | "toolbargripper"
    | "toolbox"
    | "tooltip"
    | "treeheader"
    | "treeheadercell"
    | "treeheadersortarrow"
    | "treeitem"
    | "treeline"
    | "treetwisty"
    | "treetwistyopen"
    | "treeview"
    | undefined;
  MozBackfaceVisibility?: CSSGlobals | "hidden" | "visible" | undefined;
  MozBinding?: CSSGlobals | "none" | (string & {}) | undefined;
  MozBorderBottomColors?: CSSGlobals | CSSColor | "none" | (string & {}) | undefined;
  MozBorderEndColor?: CSSGlobals | CSSColor | undefined;
  MozBorderEndStyle?: CSSGlobals | CSSLineStyle | undefined;
  MozBorderEndWidth?: CSSGlobals | CSSLineWidth | undefined;
  MozBorderLeftColors?: CSSGlobals | CSSColor | "none" | (string & {}) | undefined;
  MozBorderRightColors?: CSSGlobals | CSSColor | "none" | (string & {}) | undefined;
  MozBorderStartColor?: CSSGlobals | CSSColor | undefined;
  MozBorderStartStyle?: CSSGlobals | CSSLineStyle | undefined;
  MozBorderTopColors?: CSSGlobals | CSSColor | "none" | (string & {}) | undefined;
  MozBoxSizing?: CSSGlobals | "border-box" | "content-box" | undefined;
  MozColumnRuleColor?: CSSGlobals | CSSColor | undefined;
  MozColumnRuleStyle?: CSSGlobals | CSSLineStyle | (string & {}) | undefined;
  MozColumnRuleWidth?: CSSGlobals | CSSLineWidth | (string & {}) | undefined;
  MozColumnWidth?: CSSGlobals | string | number | "auto" | undefined;
  MozContextProperties?:
    | CSSGlobals
    | "fill"
    | "fill-opacity"
    | "none"
    | "stroke"
    | "stroke-opacity"
    | (string & {})
    | undefined;
  MozFontFeatureSettings?: CSSGlobals | "normal" | (string & {}) | undefined;
  MozFontLanguageOverride?: CSSGlobals | "normal" | (string & {}) | undefined;
  MozHyphens?: CSSGlobals | "auto" | "manual" | "none" | undefined;
  MozMarginEnd?: CSSGlobals | string | number | "auto" | (string & {}) | undefined;
  MozMarginStart?: CSSGlobals | string | number | "auto" | (string & {}) | undefined;
  MozOrient?: CSSGlobals | "block" | "horizontal" | "inline" | "vertical" | undefined;
  MozOsxFontSmoothing?:
    | CSSGlobals
    | CSSAbsoluteSize
    | string
    | number
    | "always"
    | "auto"
    | "never"
    | undefined;
  MozOutlineRadiusBottomleft?: CSSGlobals | string | number | (string & {}) | undefined;
  MozOutlineRadiusBottomright?: CSSGlobals | string | number | (string & {}) | undefined;
  MozOutlineRadiusTopleft?: CSSGlobals | string | number | (string & {}) | undefined;
  MozOutlineRadiusTopright?: CSSGlobals | string | number | (string & {}) | undefined;
  MozPaddingEnd?: CSSGlobals | string | number | (string & {}) | undefined;
  MozPaddingStart?: CSSGlobals | string | number | (string & {}) | undefined;
  MozPerspective?: CSSGlobals | string | number | "none" | undefined;
  MozPerspectiveOrigin?: CSSGlobals | CSSPosition | undefined;
  MozStackSizing?: CSSGlobals | "ignore" | "stretch-to-fit" | undefined;
  MozTabSize?: CSSGlobals | string | number | (number & {}) | (string & {}) | undefined;
  MozTextBlink?: CSSGlobals | "blink" | "none" | undefined;
  MozTextSizeAdjust?: CSSGlobals | "auto" | "none" | (string & {}) | undefined;
  MozTransform?: CSSGlobals | "none" | (string & {}) | undefined;
  MozTransformOrigin?:
    | CSSGlobals
    | string
    | number
    | "bottom"
    | "center"
    | "left"
    | "right"
    | "top"
    | (string & {})
    | undefined;
  MozTransformStyle?: CSSGlobals | "flat" | "preserve-3d" | undefined;
  MozUserModify?: CSSGlobals | "read-only" | "read-write" | "write-only" | undefined;
  MozUserSelect?: CSSGlobals | "-moz-none" | "all" | "auto" | "none" | "text" | undefined;
  MozWindowDragging?: CSSGlobals | "drag" | "no-drag" | undefined;
  MozWindowShadow?: CSSGlobals | "default" | "menu" | "none" | "sheet" | "tooltip" | undefined;
  msAccelerator?: CSSGlobals | "false" | "true" | undefined;
  msBlockProgression?: CSSGlobals | "bt" | "lr" | "rl" | "tb" | undefined;
  msContentZoomChaining?: CSSGlobals | "chained" | "none" | undefined;
  msContentZoomLimitMax?: CSSGlobals | (string & {}) | undefined;
  msContentZoomLimitMin?: CSSGlobals | (string & {}) | undefined;
  msContentZoomSnapPoints?: CSSGlobals | (string & {}) | undefined;
  msContentZoomSnapType?: CSSGlobals | "mandatory" | "none" | "proximity" | undefined;
  msContentZooming?: CSSGlobals | "none" | "zoom" | undefined;
  msFilter?: CSSGlobals | (string & {}) | undefined;
  msFlexDirection?: CSSGlobals | "column" | "column-reverse" | "row" | "row-reverse" | undefined;
  msFlexPositive?: CSSGlobals | (number & {}) | (string & {}) | undefined;
  msFlowFrom?: CSSGlobals | "none" | (string & {}) | undefined;
  msFlowInto?: CSSGlobals | "none" | (string & {}) | undefined;
  msGridColumns?: CSSGlobals | CSSTrackBreadth | "none" | (string & {}) | undefined;
  msGridRows?: CSSGlobals | CSSTrackBreadth | "none" | (string & {}) | undefined;
  msHighContrastAdjust?: CSSGlobals | "auto" | "none" | undefined;
  msHyphenateLimitChars?: CSSGlobals | "auto" | (string & {}) | (number & {}) | undefined;
  msHyphenateLimitLines?: CSSGlobals | "no-limit" | (number & {}) | (string & {}) | undefined;
  msHyphenateLimitZone?: CSSGlobals | string | number | (string & {}) | undefined;
  msHyphens?: CSSGlobals | "auto" | "manual" | "none" | undefined;
  msImeAlign?: CSSGlobals | "after" | "auto" | undefined;
  msLineBreak?: CSSGlobals | "anywhere" | "auto" | "loose" | "normal" | "strict" | undefined;
  msOrder?: CSSGlobals | (number & {}) | (string & {}) | undefined;
  msOverflowStyle?:
    | CSSGlobals
    | "-ms-autohiding-scrollbar"
    | "auto"
    | "none"
    | "scrollbar"
    | undefined;
  msOverflowX?:
    | CSSGlobals
    | "-moz-hidden-unscrollable"
    | "auto"
    | "clip"
    | "hidden"
    | "overlay"
    | "scroll"
    | "visible"
    | undefined;
  msOverflowY?:
    | CSSGlobals
    | "-moz-hidden-unscrollable"
    | "auto"
    | "clip"
    | "hidden"
    | "overlay"
    | "scroll"
    | "visible"
    | undefined;
  msScrollChaining?: CSSGlobals | "chained" | "none" | undefined;
  msScrollLimitXMax?: CSSGlobals | string | number | "auto" | undefined;
  msScrollLimitXMin?: CSSGlobals | string | number | undefined;
  msScrollLimitYMax?: CSSGlobals | string | number | "auto" | undefined;
  msScrollLimitYMin?: CSSGlobals | string | number | undefined;
  msScrollRails?: CSSGlobals | "none" | "railed" | undefined;
  msScrollSnapPointsX?: CSSGlobals | (string & {}) | undefined;
  msScrollSnapPointsY?: CSSGlobals | (string & {}) | undefined;
  msScrollSnapType?: CSSGlobals | "mandatory" | "none" | "proximity" | undefined;
  msScrollTranslation?: CSSGlobals | "none" | "vertical-to-horizontal" | undefined;
  msScrollbar3dlightColor?: CSSGlobals | CSSColor | undefined;
  msScrollbarArrowColor?: CSSGlobals | CSSColor | undefined;
  msScrollbarBaseColor?: CSSGlobals | CSSColor | undefined;
  msScrollbarDarkshadowColor?: CSSGlobals | CSSColor | undefined;
  msScrollbarFaceColor?: CSSGlobals | CSSColor | undefined;
  msScrollbarHighlightColor?: CSSGlobals | CSSColor | undefined;
  msScrollbarShadowColor?: CSSGlobals | CSSColor | undefined;
  msScrollbarTrackColor?: CSSGlobals | CSSColor | undefined;
  msTextAutospace?:
    | CSSGlobals
    | "ideograph-alpha"
    | "ideograph-numeric"
    | "ideograph-parenthesis"
    | "ideograph-space"
    | "none"
    | undefined;
  msTextCombineHorizontal?: CSSGlobals | "all" | "digits" | "none" | (string & {}) | undefined;
  msTextOverflow?: CSSGlobals | "clip" | "ellipsis" | (string & {}) | undefined;
  msTouchAction?:
    | CSSGlobals
    | "-ms-manipulation"
    | "-ms-none"
    | "-ms-pan-x"
    | "-ms-pan-y"
    | "-ms-pinch-zoom"
    | "auto"
    | "manipulation"
    | "none"
    | "pan-down"
    | "pan-left"
    | "pan-right"
    | "pan-up"
    | "pan-x"
    | "pan-y"
    | "pinch-zoom"
    | (string & {})
    | undefined;
  msTouchSelect?: CSSGlobals | "grippers" | "none" | undefined;
  msTransform?: CSSGlobals | "none" | (string & {}) | undefined;
  msTransformOrigin?:
    | CSSGlobals
    | string
    | number
    | "bottom"
    | "center"
    | "left"
    | "right"
    | "top"
    | (string & {})
    | undefined;
  msTransitionDelay?: CSSGlobals | (string & {}) | undefined;
  msTransitionDuration?: CSSGlobals | (string & {}) | undefined;
  msTransitionProperty?: CSSGlobals | "all" | "none" | (string & {}) | undefined;
  msTransitionTimingFunction?: CSSGlobals | CSSEasingFunction | (string & {}) | undefined;
  msUserSelect?: CSSGlobals | "element" | "none" | "text" | undefined;
  msWordBreak?:
    | CSSGlobals
    | "auto-phrase"
    | "break-all"
    | "break-word"
    | "keep-all"
    | "normal"
    | undefined;
  msWrapFlow?: CSSGlobals | "auto" | "both" | "clear" | "end" | "maximum" | "start" | undefined;
  msWrapMargin?: CSSGlobals | string | number | undefined;
  msWrapThrough?: CSSGlobals | "none" | "wrap" | undefined;
  msWritingMode?:
    | CSSGlobals
    | "horizontal-tb"
    | "sideways-lr"
    | "sideways-rl"
    | "vertical-lr"
    | "vertical-rl"
    | undefined;
  WebkitAlignContent?:
    | CSSGlobals
    | CSSContentDistribution
    | CSSContentPosition
    | "baseline"
    | "normal"
    | (string & {})
    | undefined;
  WebkitAlignItems?:
    | CSSGlobals
    | CSSSelfPosition
    | "anchor-center"
    | "baseline"
    | "normal"
    | "stretch"
    | (string & {})
    | undefined;
  WebkitAlignSelf?:
    | CSSGlobals
    | CSSSelfPosition
    | "anchor-center"
    | "auto"
    | "baseline"
    | "normal"
    | "stretch"
    | (string & {})
    | undefined;
  WebkitAnimationDelay?: CSSGlobals | (string & {}) | undefined;
  WebkitAnimationDirection?: CSSGlobals | CSSSingleAnimationDirection | (string & {}) | undefined;
  WebkitAnimationDuration?: CSSGlobals | (string & {}) | "auto" | undefined;
  WebkitAnimationFillMode?: CSSGlobals | CSSSingleAnimationFillMode | (string & {}) | undefined;
  WebkitAnimationIterationCount?:
    | CSSGlobals
    | "infinite"
    | (string & {})
    | (number & {})
    | undefined;
  WebkitAnimationName?: CSSGlobals | "none" | (string & {}) | undefined;
  WebkitAnimationPlayState?: CSSGlobals | "paused" | "running" | (string & {}) | undefined;
  WebkitAnimationTimingFunction?: CSSGlobals | CSSEasingFunction | (string & {}) | undefined;
  WebkitAppearance?:
    | CSSGlobals
    | "-apple-pay-button"
    | "button"
    | "button-bevel"
    | "caret"
    | "checkbox"
    | "default-button"
    | "inner-spin-button"
    | "listbox"
    | "listitem"
    | "media-controls-background"
    | "media-controls-fullscreen-background"
    | "media-current-time-display"
    | "media-enter-fullscreen-button"
    | "media-exit-fullscreen-button"
    | "media-fullscreen-button"
    | "media-mute-button"
    | "media-overlay-play-button"
    | "media-play-button"
    | "media-seek-back-button"
    | "media-seek-forward-button"
    | "media-slider"
    | "media-sliderthumb"
    | "media-time-remaining-display"
    | "media-toggle-closed-captions-button"
    | "media-volume-slider"
    | "media-volume-slider-container"
    | "media-volume-sliderthumb"
    | "menulist"
    | "menulist-button"
    | "menulist-text"
    | "menulist-textfield"
    | "meter"
    | "none"
    | "progress-bar"
    | "progress-bar-value"
    | "push-button"
    | "radio"
    | "searchfield"
    | "searchfield-cancel-button"
    | "searchfield-decoration"
    | "searchfield-results-button"
    | "searchfield-results-decoration"
    | "slider-horizontal"
    | "slider-vertical"
    | "sliderthumb-horizontal"
    | "sliderthumb-vertical"
    | "square-button"
    | "textarea"
    | "textfield"
    | undefined;
  WebkitBackdropFilter?: CSSGlobals | "none" | (string & {}) | undefined;
  WebkitBackfaceVisibility?: CSSGlobals | "hidden" | "visible" | undefined;
  WebkitBackgroundClip?: CSSGlobals | CSSBgClip | (string & {}) | undefined;
  WebkitBackgroundOrigin?: CSSGlobals | CSSVisualBox | (string & {}) | undefined;
  WebkitBackgroundSize?: CSSGlobals | CSSBgSize | (string & {}) | undefined;
  WebkitBorderBeforeColor?: CSSGlobals | CSSColor | undefined;
  WebkitBorderBeforeStyle?: CSSGlobals | CSSLineStyle | (string & {}) | undefined;
  WebkitBorderBeforeWidth?: CSSGlobals | CSSLineWidth | (string & {}) | undefined;
  WebkitBorderBottomLeftRadius?: CSSGlobals | string | number | (string & {}) | undefined;
  WebkitBorderBottomRightRadius?: CSSGlobals | string | number | (string & {}) | undefined;
  WebkitBorderImageSlice?: CSSGlobals | (string & {}) | (number & {}) | undefined;
  WebkitBorderTopLeftRadius?: CSSGlobals | string | number | (string & {}) | undefined;
  WebkitBorderTopRightRadius?: CSSGlobals | string | number | (string & {}) | undefined;
  WebkitBoxDecorationBreak?: CSSGlobals | "clone" | "slice" | undefined;
  WebkitBoxReflect?:
    | CSSGlobals
    | string
    | number
    | "above"
    | "below"
    | "left"
    | "right"
    | (string & {})
    | undefined;
  WebkitBoxShadow?: CSSGlobals | "none" | (string & {}) | undefined;
  WebkitBoxSizing?: CSSGlobals | "border-box" | "content-box" | undefined;
  WebkitClipPath?: CSSGlobals | CSSGeometryBox | "none" | (string & {}) | undefined;
  WebkitColumnCount?: CSSGlobals | "auto" | (number & {}) | (string & {}) | undefined;
  WebkitColumnFill?: CSSGlobals | "auto" | "balance" | undefined;
  WebkitColumnRuleColor?: CSSGlobals | CSSColor | undefined;
  WebkitColumnRuleStyle?: CSSGlobals | CSSLineStyle | (string & {}) | undefined;
  WebkitColumnRuleWidth?: CSSGlobals | CSSLineWidth | (string & {}) | undefined;
  WebkitColumnSpan?: CSSGlobals | "all" | "none" | undefined;
  WebkitColumnWidth?: CSSGlobals | string | number | "auto" | undefined;
  WebkitFilter?: CSSGlobals | "none" | (string & {}) | undefined;
  WebkitFlexBasis?:
    | CSSGlobals
    | string
    | number
    | "-moz-fit-content"
    | "-moz-max-content"
    | "-moz-min-content"
    | "-webkit-auto"
    | "auto"
    | "content"
    | "fit-content"
    | "max-content"
    | "min-content"
    | (string & {})
    | undefined;
  WebkitFlexDirection?:
    | CSSGlobals
    | "column"
    | "column-reverse"
    | "row"
    | "row-reverse"
    | undefined;
  WebkitFlexGrow?: CSSGlobals | (number & {}) | (string & {}) | undefined;
  WebkitFlexShrink?: CSSGlobals | (number & {}) | (string & {}) | undefined;
  WebkitFlexWrap?: CSSGlobals | "nowrap" | "wrap" | "wrap-reverse" | undefined;
  WebkitFontFeatureSettings?: CSSGlobals | "normal" | (string & {}) | undefined;
  WebkitFontKerning?: CSSGlobals | "auto" | "none" | "normal" | undefined;
  WebkitFontSmoothing?:
    | CSSGlobals
    | CSSAbsoluteSize
    | string
    | number
    | "always"
    | "auto"
    | "never"
    | undefined;
  WebkitFontVariantLigatures?:
    | CSSGlobals
    | "common-ligatures"
    | "contextual"
    | "discretionary-ligatures"
    | "historical-ligatures"
    | "no-common-ligatures"
    | "no-contextual"
    | "no-discretionary-ligatures"
    | "no-historical-ligatures"
    | "none"
    | "normal"
    | (string & {})
    | undefined;
  WebkitHyphenateCharacter?: CSSGlobals | "auto" | (string & {}) | undefined;
  WebkitHyphens?: CSSGlobals | "auto" | "manual" | "none" | undefined;
  WebkitInitialLetter?: CSSGlobals | "normal" | (string & {}) | (number & {}) | undefined;
  WebkitJustifyContent?:
    | CSSGlobals
    | CSSContentDistribution
    | CSSContentPosition
    | "left"
    | "normal"
    | "right"
    | (string & {})
    | undefined;
  WebkitLineBreak?: CSSGlobals | "anywhere" | "auto" | "loose" | "normal" | "strict" | undefined;
  WebkitLineClamp?: CSSGlobals | "none" | (number & {}) | (string & {}) | undefined;
  WebkitLogicalHeight?:
    | CSSGlobals
    | string
    | number
    | "-moz-fit-content"
    | "-moz-max-content"
    | "-moz-min-content"
    | "auto"
    | "fit-content"
    | "max-content"
    | "min-content"
    | (string & {})
    | undefined;
  WebkitLogicalWidth?:
    | CSSGlobals
    | string
    | number
    | "-moz-fit-content"
    | "-moz-max-content"
    | "-moz-min-content"
    | "-webkit-fill-available"
    | "auto"
    | "fit-content"
    | "max-content"
    | "min-content"
    | (string & {})
    | undefined;
  WebkitMarginEnd?: CSSGlobals | string | number | "auto" | (string & {}) | undefined;
  WebkitMarginStart?: CSSGlobals | string | number | "auto" | (string & {}) | undefined;
  WebkitMaskAttachment?: CSSGlobals | CSSAttachment | (string & {}) | undefined;
  WebkitMaskBoxImageOutset?:
    | CSSGlobals
    | string
    | number
    | (string & {})
    | (number & {})
    | undefined;
  WebkitMaskBoxImageRepeat?:
    | CSSGlobals
    | "repeat"
    | "round"
    | "space"
    | "stretch"
    | (string & {})
    | undefined;
  WebkitMaskBoxImageSlice?: CSSGlobals | (string & {}) | (number & {}) | undefined;
  WebkitMaskBoxImageSource?: CSSGlobals | "none" | (string & {}) | undefined;
  WebkitMaskBoxImageWidth?:
    | CSSGlobals
    | string
    | number
    | "auto"
    | (string & {})
    | (number & {})
    | undefined;
  WebkitMaskClip?:
    | CSSGlobals
    | CSSPaintBox
    | "border"
    | "content"
    | "no-clip"
    | "padding"
    | "text"
    | "view-box"
    | (string & {})
    | undefined;
  WebkitMaskComposite?: CSSGlobals | CSSCompositeStyle | (string & {}) | undefined;
  WebkitMaskImage?: CSSGlobals | "none" | (string & {}) | undefined;
  WebkitMaskOrigin?:
    | CSSGlobals
    | CSSPaintBox
    | "border"
    | "content"
    | "padding"
    | "view-box"
    | (string & {})
    | undefined;
  WebkitMaskPosition?: CSSGlobals | CSSPosition | (string & {}) | undefined;
  WebkitMaskPositionX?:
    | CSSGlobals
    | string
    | number
    | "center"
    | "left"
    | "right"
    | (string & {})
    | undefined;
  WebkitMaskPositionY?:
    | CSSGlobals
    | string
    | number
    | "bottom"
    | "center"
    | "top"
    | (string & {})
    | undefined;
  WebkitMaskRepeat?: CSSGlobals | CSSRepeatStyle | (string & {}) | undefined;
  WebkitMaskRepeatX?: CSSGlobals | "no-repeat" | "repeat" | "round" | "space" | undefined;
  WebkitMaskRepeatY?: CSSGlobals | "no-repeat" | "repeat" | "round" | "space" | undefined;
  WebkitMaskSize?: CSSGlobals | CSSBgSize | (string & {}) | undefined;
  WebkitMaxInlineSize?:
    | CSSGlobals
    | string
    | number
    | "-moz-fit-content"
    | "-moz-max-content"
    | "-moz-min-content"
    | "-webkit-fill-available"
    | "fit-content"
    | "max-content"
    | "min-content"
    | "none"
    | (string & {})
    | undefined;
  WebkitOrder?: CSSGlobals | (number & {}) | (string & {}) | undefined;
  WebkitOverflowScrolling?: CSSGlobals | "auto" | "touch" | undefined;
  WebkitPaddingEnd?: CSSGlobals | string | number | (string & {}) | undefined;
  WebkitPaddingStart?: CSSGlobals | string | number | (string & {}) | undefined;
  WebkitPerspective?: CSSGlobals | string | number | "none" | undefined;
  WebkitPerspectiveOrigin?: CSSGlobals | CSSPosition | undefined;
  WebkitPrintColorAdjust?: CSSGlobals | "economy" | "exact" | undefined;
  WebkitRubyPosition?:
    | CSSGlobals
    | "alternate"
    | "inter-character"
    | "over"
    | "under"
    | (string & {})
    | undefined;
  WebkitScrollSnapType?:
    | CSSGlobals
    | "block"
    | "both"
    | "inline"
    | "none"
    | "x"
    | "y"
    | (string & {})
    | undefined;
  WebkitShapeMargin?: CSSGlobals | string | number | (string & {}) | undefined;
  WebkitTapHighlightColor?: CSSGlobals | CSSColor | undefined;
  WebkitTextCombine?: CSSGlobals | "all" | "digits" | "none" | (string & {}) | undefined;
  WebkitTextDecorationColor?: CSSGlobals | CSSColor | undefined;
  WebkitTextDecorationLine?:
    | CSSGlobals
    | "blink"
    | "grammar-error"
    | "line-through"
    | "none"
    | "overline"
    | "spelling-error"
    | "underline"
    | (string & {})
    | undefined;
  WebkitTextDecorationSkip?:
    | CSSGlobals
    | "box-decoration"
    | "edges"
    | "leading-spaces"
    | "none"
    | "objects"
    | "spaces"
    | "trailing-spaces"
    | (string & {})
    | undefined;
  WebkitTextDecorationStyle?:
    | CSSGlobals
    | "dashed"
    | "dotted"
    | "double"
    | "solid"
    | "wavy"
    | undefined;
  WebkitTextEmphasisColor?: CSSGlobals | CSSColor | undefined;
  WebkitTextEmphasisPosition?: CSSGlobals | "auto" | "over" | "under" | (string & {}) | undefined;
  WebkitTextEmphasisStyle?:
    | CSSGlobals
    | "circle"
    | "dot"
    | "double-circle"
    | "filled"
    | "none"
    | "open"
    | "sesame"
    | "triangle"
    | (string & {})
    | undefined;
  WebkitTextFillColor?: CSSGlobals | CSSColor | undefined;
  WebkitTextOrientation?:
    | CSSGlobals
    | "mixed"
    | "sideways"
    | "sideways-right"
    | "upright"
    | undefined;
  WebkitTextSizeAdjust?: CSSGlobals | "auto" | "none" | (string & {}) | undefined;
  WebkitTextStrokeColor?: CSSGlobals | CSSColor | undefined;
  WebkitTextStrokeWidth?: CSSGlobals | string | number | undefined;
  WebkitTextUnderlinePosition?:
    | CSSGlobals
    | "auto"
    | "from-font"
    | "left"
    | "right"
    | "under"
    | (string & {})
    | undefined;
  WebkitTouchCallout?: CSSGlobals | "default" | "none" | undefined;
  WebkitTransform?: CSSGlobals | "none" | (string & {}) | undefined;
  WebkitTransformOrigin?:
    | CSSGlobals
    | string
    | number
    | "bottom"
    | "center"
    | "left"
    | "right"
    | "top"
    | (string & {})
    | undefined;
  WebkitTransformStyle?: CSSGlobals | "flat" | "preserve-3d" | undefined;
  WebkitTransitionDelay?: CSSGlobals | (string & {}) | undefined;
  WebkitTransitionDuration?: CSSGlobals | (string & {}) | undefined;
  WebkitTransitionProperty?: CSSGlobals | "all" | "none" | (string & {}) | undefined;
  WebkitTransitionTimingFunction?: CSSGlobals | CSSEasingFunction | (string & {}) | undefined;
  WebkitUserModify?:
    | CSSGlobals
    | "read-only"
    | "read-write"
    | "read-write-plaintext-only"
    | undefined;
  WebkitUserSelect?: CSSGlobals | "all" | "auto" | "none" | "text" | undefined;
  WebkitWritingMode?:
    | CSSGlobals
    | "horizontal-tb"
    | "sideways-lr"
    | "sideways-rl"
    | "vertical-lr"
    | "vertical-rl"
    | undefined;
  MozAnimation?: CSSGlobals | CSSSingleAnimation | (string & {}) | undefined;
  MozBorderImage?:
    | CSSGlobals
    | "none"
    | "repeat"
    | "round"
    | "space"
    | "stretch"
    | (string & {})
    | (number & {})
    | undefined;
  MozColumnRule?: CSSGlobals | CSSLineWidth | CSSLineStyle | CSSColor | (string & {}) | undefined;
  MozColumns?: CSSGlobals | string | number | "auto" | (string & {}) | (number & {}) | undefined;
  MozOutlineRadius?: CSSGlobals | string | number | (string & {}) | undefined;
  MozTransition?: CSSGlobals | CSSSingleTransition | (string & {}) | undefined;
  msContentZoomLimit?: CSSGlobals | (string & {}) | undefined;
  msContentZoomSnap?: CSSGlobals | "mandatory" | "none" | "proximity" | (string & {}) | undefined;
  msFlex?:
    | CSSGlobals
    | string
    | number
    | "auto"
    | "content"
    | "fit-content"
    | "max-content"
    | "min-content"
    | "none"
    | (string & {})
    | (number & {})
    | undefined;
  msScrollLimit?: CSSGlobals | (string & {}) | undefined;
  msScrollSnapX?: CSSGlobals | (string & {}) | undefined;
  msScrollSnapY?: CSSGlobals | (string & {}) | undefined;
  msTransition?: CSSGlobals | CSSSingleTransition | (string & {}) | undefined;
  WebkitAnimation?: CSSGlobals | CSSSingleAnimation | (string & {}) | undefined;
  WebkitBorderBefore?:
    | CSSGlobals
    | CSSLineWidth
    | CSSLineStyle
    | CSSColor
    | (string & {})
    | undefined;
  WebkitBorderImage?:
    | CSSGlobals
    | "none"
    | "repeat"
    | "round"
    | "space"
    | "stretch"
    | (string & {})
    | (number & {})
    | undefined;
  WebkitBorderRadius?: CSSGlobals | string | number | (string & {}) | undefined;
  WebkitColumnRule?:
    | CSSGlobals
    | CSSLineWidth
    | CSSLineStyle
    | CSSColor
    | (string & {})
    | undefined;
  WebkitColumns?: CSSGlobals | string | number | "auto" | (string & {}) | (number & {}) | undefined;
  WebkitFlex?:
    | CSSGlobals
    | string
    | number
    | "auto"
    | "content"
    | "fit-content"
    | "max-content"
    | "min-content"
    | "none"
    | (string & {})
    | (number & {})
    | undefined;
  WebkitFlexFlow?:
    | CSSGlobals
    | "column"
    | "column-reverse"
    | "nowrap"
    | "row"
    | "row-reverse"
    | "wrap"
    | "wrap-reverse"
    | (string & {})
    | undefined;
  WebkitMask?:
    | CSSGlobals
    | CSSPosition
    | CSSRepeatStyle
    | CSSVisualBox
    | "border"
    | "content"
    | "none"
    | "padding"
    | "text"
    | (string & {})
    | undefined;
  WebkitMaskBoxImage?:
    | CSSGlobals
    | "alpha"
    | "luminance"
    | "none"
    | "repeat"
    | "round"
    | "space"
    | "stretch"
    | (string & {})
    | (number & {})
    | undefined;
  WebkitTextEmphasis?:
    | CSSGlobals
    | CSSColor
    | "circle"
    | "dot"
    | "double-circle"
    | "filled"
    | "none"
    | "open"
    | "sesame"
    | "triangle"
    | (string & {})
    | undefined;
  WebkitTextStroke?: CSSGlobals | CSSColor | string | number | (string & {}) | undefined;
  WebkitTransition?: CSSGlobals | CSSSingleTransition | (string & {}) | undefined;
  boxAlign?: CSSGlobals | "baseline" | "center" | "end" | "start" | "stretch" | undefined;
  boxDirection?: CSSGlobals | "inherit" | "normal" | "reverse" | undefined;
  boxFlex?: CSSGlobals | (number & {}) | (string & {}) | undefined;
  boxFlexGroup?: CSSGlobals | (number & {}) | (string & {}) | undefined;
  boxLines?: CSSGlobals | "multiple" | "single" | undefined;
  boxOrdinalGroup?: CSSGlobals | (number & {}) | (string & {}) | undefined;
  boxOrient?:
    | CSSGlobals
    | "block-axis"
    | "horizontal"
    | "inherit"
    | "inline-axis"
    | "vertical"
    | undefined;
  boxPack?: CSSGlobals | "center" | "end" | "justify" | "start" | undefined;
  clip?: CSSGlobals | "auto" | (string & {}) | undefined;
  fontStretch?: CSSGlobals | CSSFontStretchAbsolute | undefined;
  gridColumnGap?: CSSGlobals | string | number | (string & {}) | undefined;
  gridGap?: CSSGlobals | string | number | (string & {}) | undefined;
  gridRowGap?: CSSGlobals | string | number | (string & {}) | undefined;
  imeMode?: CSSGlobals | "active" | "auto" | "disabled" | "inactive" | "normal" | undefined;
  insetArea?: CSSGlobals | CSSPositionArea | "none" | undefined;
  offsetBlock?: CSSGlobals | string | number | "auto" | (string & {}) | undefined;
  offsetBlockEnd?: CSSGlobals | string | number | "auto" | (string & {}) | undefined;
  offsetBlockStart?: CSSGlobals | string | number | "auto" | (string & {}) | undefined;
  offsetInline?: CSSGlobals | string | number | "auto" | (string & {}) | undefined;
  offsetInlineEnd?: CSSGlobals | string | number | "auto" | (string & {}) | undefined;
  offsetInlineStart?: CSSGlobals | string | number | "auto" | (string & {}) | undefined;
  pageBreakAfter?:
    | CSSGlobals
    | "always"
    | "auto"
    | "avoid"
    | "left"
    | "recto"
    | "right"
    | "verso"
    | undefined;
  pageBreakBefore?:
    | CSSGlobals
    | "always"
    | "auto"
    | "avoid"
    | "left"
    | "recto"
    | "right"
    | "verso"
    | undefined;
  pageBreakInside?: CSSGlobals | "auto" | "avoid" | undefined;
  positionTryOptions?:
    | CSSGlobals
    | CSSTryTactic
    | CSSPositionArea
    | "none"
    | (string & {})
    | undefined;
  scrollSnapCoordinate?: CSSGlobals | CSSPosition | "none" | (string & {}) | undefined;
  scrollSnapDestination?: CSSGlobals | CSSPosition | undefined;
  scrollSnapPointsX?: CSSGlobals | "none" | (string & {}) | undefined;
  scrollSnapPointsY?: CSSGlobals | "none" | (string & {}) | undefined;
  scrollSnapTypeX?: CSSGlobals | "mandatory" | "none" | "proximity" | undefined;
  scrollSnapTypeY?: CSSGlobals | "mandatory" | "none" | "proximity" | undefined;
  KhtmlBoxAlign?: CSSGlobals | "baseline" | "center" | "end" | "start" | "stretch" | undefined;
  KhtmlBoxDirection?: CSSGlobals | "inherit" | "normal" | "reverse" | undefined;
  KhtmlBoxFlex?: CSSGlobals | (number & {}) | (string & {}) | undefined;
  KhtmlBoxFlexGroup?: CSSGlobals | (number & {}) | (string & {}) | undefined;
  KhtmlBoxLines?: CSSGlobals | "multiple" | "single" | undefined;
  KhtmlBoxOrdinalGroup?: CSSGlobals | (number & {}) | (string & {}) | undefined;
  KhtmlBoxOrient?:
    | CSSGlobals
    | "block-axis"
    | "horizontal"
    | "inherit"
    | "inline-axis"
    | "vertical"
    | undefined;
  KhtmlBoxPack?: CSSGlobals | "center" | "end" | "justify" | "start" | undefined;
  KhtmlLineBreak?: CSSGlobals | "anywhere" | "auto" | "loose" | "normal" | "strict" | undefined;
  KhtmlOpacity?: CSSGlobals | (string & {}) | (number & {}) | undefined;
  KhtmlUserSelect?: CSSGlobals | "-moz-none" | "all" | "auto" | "none" | "text" | undefined;
  MozBackgroundClip?: CSSGlobals | CSSBgClip | (string & {}) | undefined;
  MozBackgroundOrigin?: CSSGlobals | CSSVisualBox | (string & {}) | undefined;
  MozBackgroundSize?: CSSGlobals | CSSBgSize | (string & {}) | undefined;
  MozBorderRadius?: CSSGlobals | string | number | (string & {}) | undefined;
  MozBorderRadiusBottomleft?: CSSGlobals | string | number | (string & {}) | undefined;
  MozBorderRadiusBottomright?: CSSGlobals | string | number | (string & {}) | undefined;
  MozBorderRadiusTopleft?: CSSGlobals | string | number | (string & {}) | undefined;
  MozBorderRadiusTopright?: CSSGlobals | string | number | (string & {}) | undefined;
  MozBoxAlign?: CSSGlobals | "baseline" | "center" | "end" | "start" | "stretch" | undefined;
  MozBoxDirection?: CSSGlobals | "inherit" | "normal" | "reverse" | undefined;
  MozBoxFlex?: CSSGlobals | (number & {}) | (string & {}) | undefined;
  MozBoxOrdinalGroup?: CSSGlobals | (number & {}) | (string & {}) | undefined;
  MozBoxOrient?:
    | CSSGlobals
    | "block-axis"
    | "horizontal"
    | "inherit"
    | "inline-axis"
    | "vertical"
    | undefined;
  MozBoxPack?: CSSGlobals | "center" | "end" | "justify" | "start" | undefined;
  MozBoxShadow?: CSSGlobals | "none" | (string & {}) | undefined;
  MozColumnCount?: CSSGlobals | "auto" | (number & {}) | (string & {}) | undefined;
  MozColumnFill?: CSSGlobals | "auto" | "balance" | undefined;
  MozFloatEdge?:
    | CSSGlobals
    | "border-box"
    | "content-box"
    | "margin-box"
    | "padding-box"
    | undefined;
  MozForceBrokenImageIcon?: CSSGlobals | 0 | (string & {}) | 1 | undefined;
  MozOpacity?: CSSGlobals | (string & {}) | (number & {}) | undefined;
  MozOutline?:
    | CSSGlobals
    | CSSLineWidth
    | CSSOutlineLineStyle
    | CSSColor
    | "auto"
    | (string & {})
    | undefined;
  MozOutlineColor?: CSSGlobals | CSSColor | "auto" | undefined;
  MozOutlineStyle?: CSSGlobals | CSSOutlineLineStyle | "auto" | undefined;
  MozOutlineWidth?: CSSGlobals | CSSLineWidth | undefined;
  MozTextAlignLast?:
    | CSSGlobals
    | "auto"
    | "center"
    | "end"
    | "justify"
    | "left"
    | "right"
    | "start"
    | undefined;
  MozTextDecorationColor?: CSSGlobals | CSSColor | undefined;
  MozTextDecorationLine?:
    | CSSGlobals
    | "blink"
    | "grammar-error"
    | "line-through"
    | "none"
    | "overline"
    | "spelling-error"
    | "underline"
    | (string & {})
    | undefined;
  MozTextDecorationStyle?:
    | CSSGlobals
    | "dashed"
    | "dotted"
    | "double"
    | "solid"
    | "wavy"
    | undefined;
  MozTransitionDelay?: CSSGlobals | (string & {}) | undefined;
  MozTransitionDuration?: CSSGlobals | (string & {}) | undefined;
  MozTransitionProperty?: CSSGlobals | "all" | "none" | (string & {}) | undefined;
  MozTransitionTimingFunction?: CSSGlobals | CSSEasingFunction | (string & {}) | undefined;
  MozUserFocus?:
    | CSSGlobals
    | "ignore"
    | "none"
    | "normal"
    | "select-after"
    | "select-all"
    | "select-before"
    | "select-menu"
    | "select-same"
    | undefined;
  MozUserInput?: CSSGlobals | "auto" | "disabled" | "enabled" | "none" | undefined;
  msImeMode?: CSSGlobals | "active" | "auto" | "disabled" | "inactive" | "normal" | undefined;
  OAnimation?: CSSGlobals | CSSSingleAnimation | (string & {}) | undefined;
  OAnimationDelay?: CSSGlobals | (string & {}) | undefined;
  OAnimationDirection?: CSSGlobals | CSSSingleAnimationDirection | (string & {}) | undefined;
  OAnimationDuration?: CSSGlobals | (string & {}) | "auto" | undefined;
  OAnimationFillMode?: CSSGlobals | CSSSingleAnimationFillMode | (string & {}) | undefined;
  OAnimationIterationCount?: CSSGlobals | "infinite" | (string & {}) | (number & {}) | undefined;
  OAnimationName?: CSSGlobals | "none" | (string & {}) | undefined;
  OAnimationPlayState?: CSSGlobals | "paused" | "running" | (string & {}) | undefined;
  OAnimationTimingFunction?: CSSGlobals | CSSEasingFunction | (string & {}) | undefined;
  OBackgroundSize?: CSSGlobals | CSSBgSize | (string & {}) | undefined;
  OBorderImage?:
    | CSSGlobals
    | "none"
    | "repeat"
    | "round"
    | "space"
    | "stretch"
    | (string & {})
    | (number & {})
    | undefined;
  OObjectFit?: CSSGlobals | "contain" | "cover" | "fill" | "none" | "scale-down" | undefined;
  OObjectPosition?: CSSGlobals | CSSPosition | undefined;
  OTabSize?: CSSGlobals | string | number | (number & {}) | (string & {}) | undefined;
  OTextOverflow?: CSSGlobals | "clip" | "ellipsis" | (string & {}) | undefined;
  OTransform?: CSSGlobals | "none" | (string & {}) | undefined;
  OTransformOrigin?:
    | CSSGlobals
    | string
    | number
    | "bottom"
    | "center"
    | "left"
    | "right"
    | "top"
    | (string & {})
    | undefined;
  OTransition?: CSSGlobals | CSSSingleTransition | (string & {}) | undefined;
  OTransitionDelay?: CSSGlobals | (string & {}) | undefined;
  OTransitionDuration?: CSSGlobals | (string & {}) | undefined;
  OTransitionProperty?: CSSGlobals | "all" | "none" | (string & {}) | undefined;
  OTransitionTimingFunction?: CSSGlobals | CSSEasingFunction | (string & {}) | undefined;
  WebkitBoxAlign?: CSSGlobals | "baseline" | "center" | "end" | "start" | "stretch" | undefined;
  WebkitBoxDirection?: CSSGlobals | "inherit" | "normal" | "reverse" | undefined;
  WebkitBoxFlex?: CSSGlobals | (number & {}) | (string & {}) | undefined;
  WebkitBoxFlexGroup?: CSSGlobals | (number & {}) | (string & {}) | undefined;
  WebkitBoxLines?: CSSGlobals | "multiple" | "single" | undefined;
  WebkitBoxOrdinalGroup?: CSSGlobals | (number & {}) | (string & {}) | undefined;
  WebkitBoxOrient?:
    | CSSGlobals
    | "block-axis"
    | "horizontal"
    | "inherit"
    | "inline-axis"
    | "vertical"
    | undefined;
  WebkitBoxPack?: CSSGlobals | "center" | "end" | "justify" | "start" | undefined;
  colorInterpolation?: CSSGlobals | "auto" | "linearRGB" | "sRGB" | undefined;
  colorRendering?: CSSGlobals | "auto" | "optimizeQuality" | "optimizeSpeed" | undefined;
  glyphOrientationVertical?: CSSGlobals | "auto" | (string & {}) | (number & {}) | undefined;
} & { [key: `--${string}`]: string | number | undefined };
// @generated:end

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace JSX {
  /**
   * What `jsx()` produces: a `VNode`, a `RawString` when static serialization
   * succeeded, or a promise of one when an attribute value is itself a promise.
   *
   * `RawString` is a first-class renderable leaf — `renderNode` special-cases
   * `instanceof RawString` before it ever looks at `VNode` — so it belongs here
   * rather than behind a cast at each call site.
   */
  export type Element = Awaitable<VNode | RawString>;

  /**
   * What may be used as a component.
   *
   * The return type is `Renderable`, not `Element`: the renderers handle far more
   * than nodes. `() => "text"`, `() => 42`, `() => [<a/>, <b/>]` and
   * `async () => <div/>` all render correctly, and `Element` as the component
   * contract rejects every one of them. Widening stops there — an object or a
   * symbol return is still an error.
   *
   * `Awaitable<Renderable>`, not `Renderable`, for the one shape the flat type
   * cannot express: `JSX.Element` is itself awaitable, so an async component that
   * *writes its return type down* — `async (): Promise<JSX.Element>`, the
   * annotation anyone arriving from React reaches for — is a promise of a
   * promise. Inference collapses it, so the flat type holds only as long as nobody
   * annotates. Making `Renderable` itself recursive is the other way to say this,
   * and TypeScript refuses it: a type reached through its own `then` callback is
   * TS1062. The extra level belongs on the boundary, where the walk resolves it.
   */
  export type ElementType = string | ((props: any) => Awaitable<Renderable>);

  // @generated:start
  /* Intrinsic table — generated from @types/react 19.3.0 + csstype 3.2.3 by scripts/codegen.ts. Do not edit. */
  type Booleanish = boolean | "true" | "false";
  type AriaRole =
    | "alert"
    | "alertdialog"
    | "application"
    | "article"
    | "banner"
    | "button"
    | "cell"
    | "checkbox"
    | "columnheader"
    | "combobox"
    | "complementary"
    | "contentinfo"
    | "definition"
    | "dialog"
    | "directory"
    | "document"
    | "feed"
    | "figure"
    | "form"
    | "grid"
    | "gridcell"
    | "group"
    | "heading"
    | "img"
    | "link"
    | "list"
    | "listbox"
    | "listitem"
    | "log"
    | "main"
    | "marquee"
    | "math"
    | "menu"
    | "menubar"
    | "menuitem"
    | "menuitemcheckbox"
    | "menuitemradio"
    | "navigation"
    | "none"
    | "note"
    | "option"
    | "presentation"
    | "progressbar"
    | "radio"
    | "radiogroup"
    | "region"
    | "row"
    | "rowgroup"
    | "rowheader"
    | "scrollbar"
    | "search"
    | "searchbox"
    | "separator"
    | "slider"
    | "spinbutton"
    | "status"
    | "switch"
    | "tab"
    | "table"
    | "tablist"
    | "tabpanel"
    | "term"
    | "textbox"
    | "timer"
    | "toolbar"
    | "tooltip"
    | "tree"
    | "treegrid"
    | "treeitem"
    | (string & {});
  type CrossOrigin = "anonymous" | "use-credentials" | "" | undefined;
  type HTMLAttributeAnchorTarget = "_self" | "_blank" | "_parent" | "_top" | (string & {});
  type HTMLAttributeReferrerPolicy =
    | ""
    | "no-referrer"
    | "no-referrer-when-downgrade"
    | "origin"
    | "origin-when-cross-origin"
    | "same-origin"
    | "strict-origin"
    | "strict-origin-when-cross-origin"
    | "unsafe-url";
  type AutoFillBase = "" | "off" | "on";
  type OptionalPrefixToken<T extends string> = `${T} ` | "";
  type AutoFillSection = `section-${string}`;
  type AutoFillAddressKind = "billing" | "shipping";
  type AutoFillNormalField =
    | "additional-name"
    | "address-level1"
    | "address-level2"
    | "address-level3"
    | "address-level4"
    | "address-line1"
    | "address-line2"
    | "address-line3"
    | "bday-day"
    | "bday-month"
    | "bday-year"
    | "cc-csc"
    | "cc-exp"
    | "cc-exp-month"
    | "cc-exp-year"
    | "cc-family-name"
    | "cc-given-name"
    | "cc-name"
    | "cc-number"
    | "cc-type"
    | "country"
    | "country-name"
    | "current-password"
    | "family-name"
    | "given-name"
    | "honorific-prefix"
    | "honorific-suffix"
    | "name"
    | "new-password"
    | "one-time-code"
    | "organization"
    | "postal-code"
    | "street-address"
    | "transaction-amount"
    | "transaction-currency"
    | "username";
  type AutoFillContactKind = "home" | "mobile" | "work";
  type AutoFillContactField =
    | "email"
    | "tel"
    | "tel-area-code"
    | "tel-country-code"
    | "tel-extension"
    | "tel-local"
    | "tel-local-prefix"
    | "tel-local-suffix"
    | "tel-national";
  type AutoFillField =
    | AutoFillNormalField
    | `${OptionalPrefixToken<AutoFillContactKind>}${AutoFillContactField}`;
  type OptionalPostfixToken<T extends string> = ` ${T}` | "";
  type AutoFillCredentialField = "webauthn";
  type AutoFill =
    | AutoFillBase
    | `${OptionalPrefixToken<AutoFillSection>}${OptionalPrefixToken<AutoFillAddressKind>}${AutoFillField}${OptionalPostfixToken<AutoFillCredentialField>}`;
  type HTMLInputAutoCompleteAttribute = AutoFill | (string & {});
  type HTMLInputTypeAttribute =
    | "button"
    | "checkbox"
    | "color"
    | "date"
    | "datetime-local"
    | "email"
    | "file"
    | "hidden"
    | "image"
    | "month"
    | "number"
    | "password"
    | "radio"
    | "range"
    | "reset"
    | "search"
    | "submit"
    | "tel"
    | "text"
    | "time"
    | "url"
    | "week"
    | (string & {});

  export interface AriaAttributes {
    "aria-activedescendant"?: Awaitable<string | undefined | RawString>;
    "aria-atomic"?: Awaitable<Booleanish | undefined | RawString>;
    "aria-autocomplete"?: Awaitable<"none" | "inline" | "list" | "both" | undefined | RawString>;
    "aria-braillelabel"?: Awaitable<string | undefined | RawString>;
    "aria-brailleroledescription"?: Awaitable<string | undefined | RawString>;
    "aria-busy"?: Awaitable<Booleanish | undefined | RawString>;
    "aria-checked"?: Awaitable<boolean | "false" | "mixed" | "true" | undefined | RawString>;
    "aria-colcount"?: Awaitable<number | undefined | RawString>;
    "aria-colindex"?: Awaitable<number | undefined | RawString>;
    "aria-colindextext"?: Awaitable<string | undefined | RawString>;
    "aria-colspan"?: Awaitable<number | undefined | RawString>;
    "aria-controls"?: Awaitable<string | undefined | RawString>;
    "aria-current"?: Awaitable<
      | boolean
      | "false"
      | "true"
      | "page"
      | "step"
      | "location"
      | "date"
      | "time"
      | undefined
      | RawString
    >;
    "aria-describedby"?: Awaitable<string | undefined | RawString>;
    "aria-description"?: Awaitable<string | undefined | RawString>;
    "aria-details"?: Awaitable<string | undefined | RawString>;
    "aria-disabled"?: Awaitable<Booleanish | undefined | RawString>;
    "aria-dropeffect"?: Awaitable<
      "none" | "copy" | "execute" | "link" | "move" | "popup" | undefined | RawString
    >;
    "aria-errormessage"?: Awaitable<string | undefined | RawString>;
    "aria-expanded"?: Awaitable<Booleanish | undefined | RawString>;
    "aria-flowto"?: Awaitable<string | undefined | RawString>;
    "aria-grabbed"?: Awaitable<Booleanish | undefined | RawString>;
    "aria-haspopup"?: Awaitable<
      | boolean
      | "false"
      | "true"
      | "menu"
      | "listbox"
      | "tree"
      | "grid"
      | "dialog"
      | undefined
      | RawString
    >;
    "aria-hidden"?: Awaitable<Booleanish | undefined | RawString>;
    "aria-invalid"?: Awaitable<
      boolean | "false" | "true" | "grammar" | "spelling" | undefined | RawString
    >;
    "aria-keyshortcuts"?: Awaitable<string | undefined | RawString>;
    "aria-label"?: Awaitable<string | undefined | RawString>;
    "aria-labelledby"?: Awaitable<string | undefined | RawString>;
    "aria-level"?: Awaitable<number | undefined | RawString>;
    "aria-live"?: Awaitable<"off" | "assertive" | "polite" | undefined | RawString>;
    "aria-modal"?: Awaitable<Booleanish | undefined | RawString>;
    "aria-multiline"?: Awaitable<Booleanish | undefined | RawString>;
    "aria-multiselectable"?: Awaitable<Booleanish | undefined | RawString>;
    "aria-orientation"?: Awaitable<"horizontal" | "vertical" | undefined | RawString>;
    "aria-owns"?: Awaitable<string | undefined | RawString>;
    "aria-placeholder"?: Awaitable<string | undefined | RawString>;
    "aria-posinset"?: Awaitable<number | undefined | RawString>;
    "aria-pressed"?: Awaitable<boolean | "false" | "mixed" | "true" | undefined | RawString>;
    "aria-readonly"?: Awaitable<Booleanish | undefined | RawString>;
    "aria-relevant"?: Awaitable<
      | "additions"
      | "additions removals"
      | "additions text"
      | "all"
      | "removals"
      | "removals additions"
      | "removals text"
      | "text"
      | "text additions"
      | "text removals"
      | undefined
      | RawString
    >;
    "aria-required"?: Awaitable<Booleanish | undefined | RawString>;
    "aria-roledescription"?: Awaitable<string | undefined | RawString>;
    "aria-rowcount"?: Awaitable<number | undefined | RawString>;
    "aria-rowindex"?: Awaitable<number | undefined | RawString>;
    "aria-rowindextext"?: Awaitable<string | undefined | RawString>;
    "aria-rowspan"?: Awaitable<number | undefined | RawString>;
    "aria-selected"?: Awaitable<Booleanish | undefined | RawString>;
    "aria-setsize"?: Awaitable<number | undefined | RawString>;
    "aria-sort"?: Awaitable<"none" | "ascending" | "descending" | "other" | undefined | RawString>;
    "aria-valuemax"?: Awaitable<number | undefined | RawString>;
    "aria-valuemin"?: Awaitable<number | undefined | RawString>;
    "aria-valuenow"?: Awaitable<number | undefined | RawString>;
    "aria-valuetext"?: Awaitable<string | undefined | RawString>;
  }
  export interface DOMAttributes {
    key?: string | number | bigint | null | undefined;
    class?: Awaitable<ClassValue>;
    className?: Awaitable<ClassValue>;
    children?: Renderable;
    style?: Awaitable<string | CSSProperties | RawString | null | undefined>;
    dangerouslySetInnerHTML?: { __html: string | null | undefined };
    htmlFor?: Awaitable<string | null | undefined>;
    [K: `on${string}`]: Awaitable<string> | undefined;
  }
  export interface HTMLAttributes extends AriaAttributes, DOMAttributes {
    accessKey?: Awaitable<string | undefined | RawString>;
    autoCapitalize?: Awaitable<
      | "off"
      | "none"
      | "on"
      | "sentences"
      | "words"
      | "characters"
      | undefined
      | (string & {})
      | RawString
    >;
    autoFocus?: Awaitable<boolean | undefined | RawString>;
    contentEditable?: Awaitable<Booleanish | "inherit" | "plaintext-only" | undefined | RawString>;
    contextMenu?: Awaitable<string | undefined | RawString>;
    dir?: Awaitable<string | undefined | RawString>;
    draggable?: Awaitable<Booleanish | undefined | RawString>;
    enterKeyHint?: Awaitable<
      "enter" | "done" | "go" | "next" | "previous" | "search" | "send" | undefined | RawString
    >;
    hidden?: Awaitable<boolean | undefined | RawString>;
    id?: Awaitable<string | undefined | RawString>;
    lang?: Awaitable<string | undefined | RawString>;
    nonce?: Awaitable<string | undefined | RawString>;
    slot?: Awaitable<string | undefined | RawString>;
    spellCheck?: Awaitable<Booleanish | undefined | RawString>;
    tabIndex?: Awaitable<number | undefined | RawString>;
    title?: Awaitable<string | undefined | RawString>;
    translate?: Awaitable<"yes" | "no" | undefined | RawString>;
    role?: Awaitable<AriaRole | undefined | RawString>;
    about?: Awaitable<string | undefined | RawString>;
    content?: Awaitable<string | undefined | RawString>;
    datatype?: Awaitable<string | undefined | RawString>;
    inlist?: Awaitable<any | RawString>;
    prefix?: Awaitable<string | undefined | RawString>;
    property?: Awaitable<string | undefined | RawString>;
    rel?: Awaitable<string | undefined | RawString>;
    resource?: Awaitable<string | undefined | RawString>;
    rev?: Awaitable<string | undefined | RawString>;
    typeof?: Awaitable<string | undefined | RawString>;
    vocab?: Awaitable<string | undefined | RawString>;
    autoCorrect?: Awaitable<string | undefined | RawString>;
    color?: Awaitable<string | undefined | RawString>;
    itemProp?: Awaitable<string | undefined | RawString>;
    itemScope?: Awaitable<boolean | undefined | RawString>;
    itemType?: Awaitable<string | undefined | RawString>;
    itemID?: Awaitable<string | undefined | RawString>;
    itemRef?: Awaitable<string | undefined | RawString>;
    popover?: Awaitable<"" | "auto" | "manual" | "hint" | undefined | RawString>;
    popoverTargetAction?: Awaitable<"toggle" | "show" | "hide" | undefined | RawString>;
    popoverTarget?: Awaitable<string | undefined | RawString>;
    inert?: Awaitable<boolean | undefined | RawString>;
    inputMode?: Awaitable<
      | "none"
      | "text"
      | "tel"
      | "url"
      | "email"
      | "numeric"
      | "decimal"
      | "search"
      | undefined
      | RawString
    >;
    is?: Awaitable<string | undefined | RawString>;
    exportparts?: Awaitable<string | undefined | RawString>;
    part?: Awaitable<string | undefined | RawString>;
  }
  export interface MediaHTMLAttributes extends HTMLAttributes {
    autoPlay?: Awaitable<boolean | undefined | RawString>;
    controls?: Awaitable<boolean | undefined | RawString>;
    controlsList?: Awaitable<string | undefined | RawString>;
    crossOrigin?: Awaitable<CrossOrigin | RawString>;
    loop?: Awaitable<boolean | undefined | RawString>;
    mediaGroup?: Awaitable<string | undefined | RawString>;
    muted?: Awaitable<boolean | undefined | RawString>;
    playsInline?: Awaitable<boolean | undefined | RawString>;
    preload?: Awaitable<string | undefined | RawString>;
    src?: Awaitable<string | undefined | RawString>;
  }
  export interface BaseHTMLAttributes extends HTMLAttributes {
    href?: Awaitable<string | undefined | RawString>;
    target?: Awaitable<string | undefined | RawString>;
  }
  export interface AnchorHTMLAttributes extends HTMLAttributes {
    download?: Awaitable<any | RawString>;
    href?: Awaitable<string | undefined | RawString>;
    hrefLang?: Awaitable<string | undefined | RawString>;
    media?: Awaitable<string | undefined | RawString>;
    ping?: Awaitable<string | undefined | RawString>;
    target?: Awaitable<HTMLAttributeAnchorTarget | undefined | RawString>;
    type?: Awaitable<string | undefined | RawString>;
    referrerPolicy?: Awaitable<HTMLAttributeReferrerPolicy | undefined | RawString>;
  }
  export interface AreaHTMLAttributes extends HTMLAttributes {
    alt?: Awaitable<string | undefined | RawString>;
    coords?: Awaitable<string | undefined | RawString>;
    download?: Awaitable<any | RawString>;
    href?: Awaitable<string | undefined | RawString>;
    hrefLang?: Awaitable<string | undefined | RawString>;
    media?: Awaitable<string | undefined | RawString>;
    referrerPolicy?: Awaitable<HTMLAttributeReferrerPolicy | undefined | RawString>;
    shape?: Awaitable<string | undefined | RawString>;
    target?: Awaitable<string | undefined | RawString>;
  }
  export interface AudioHTMLAttributes extends MediaHTMLAttributes {}
  export interface BlockquoteHTMLAttributes extends HTMLAttributes {
    cite?: Awaitable<string | undefined | RawString>;
  }
  export interface ButtonHTMLAttributes extends HTMLAttributes {
    disabled?: Awaitable<boolean | undefined | RawString>;
    form?: Awaitable<string | undefined | RawString>;
    formAction?: Awaitable<
      string | ((formData: FormData) => void | Promise<void>) | undefined | RawString
    >;
    formEncType?: Awaitable<string | undefined | RawString>;
    formMethod?: Awaitable<string | undefined | RawString>;
    formNoValidate?: Awaitable<boolean | undefined | RawString>;
    formTarget?: Awaitable<string | undefined | RawString>;
    name?: Awaitable<string | undefined | RawString>;
    type?: Awaitable<"submit" | "reset" | "button" | undefined | RawString>;
    value?: Awaitable<string | readonly string[] | number | undefined | RawString>;
  }
  export interface CanvasHTMLAttributes extends HTMLAttributes {
    height?: Awaitable<number | string | undefined | RawString>;
    width?: Awaitable<number | string | undefined | RawString>;
  }
  export interface ColHTMLAttributes extends HTMLAttributes {
    span?: Awaitable<number | undefined | RawString>;
    width?: Awaitable<number | string | undefined | RawString>;
  }
  export interface ColgroupHTMLAttributes extends HTMLAttributes {
    span?: Awaitable<number | undefined | RawString>;
  }
  export interface DataHTMLAttributes extends HTMLAttributes {
    value?: Awaitable<string | readonly string[] | number | undefined | RawString>;
  }
  export interface DelHTMLAttributes extends HTMLAttributes {
    cite?: Awaitable<string | undefined | RawString>;
    dateTime?: Awaitable<string | undefined | RawString>;
  }
  export interface DetailsHTMLAttributes extends HTMLAttributes {
    open?: Awaitable<boolean | undefined | RawString>;
    name?: Awaitable<string | undefined | RawString>;
  }
  export interface DialogHTMLAttributes extends HTMLAttributes {
    closedby?: Awaitable<"any" | "closerequest" | "none" | undefined | RawString>;
    open?: Awaitable<boolean | undefined | RawString>;
  }
  export interface EmbedHTMLAttributes extends HTMLAttributes {
    height?: Awaitable<number | string | undefined | RawString>;
    src?: Awaitable<string | undefined | RawString>;
    type?: Awaitable<string | undefined | RawString>;
    width?: Awaitable<number | string | undefined | RawString>;
  }
  export interface FieldsetHTMLAttributes extends HTMLAttributes {
    disabled?: Awaitable<boolean | undefined | RawString>;
    form?: Awaitable<string | undefined | RawString>;
    name?: Awaitable<string | undefined | RawString>;
  }
  export interface FormHTMLAttributes extends HTMLAttributes {
    acceptCharset?: Awaitable<string | undefined | RawString>;
    action?: Awaitable<
      string | undefined | ((formData: FormData) => void | Promise<void>) | RawString
    >;
    autoComplete?: Awaitable<string | undefined | RawString>;
    encType?: Awaitable<string | undefined | RawString>;
    method?: Awaitable<string | undefined | RawString>;
    name?: Awaitable<string | undefined | RawString>;
    noValidate?: Awaitable<boolean | undefined | RawString>;
    target?: Awaitable<string | undefined | RawString>;
  }
  export interface HtmlHTMLAttributes extends HTMLAttributes {
    manifest?: Awaitable<string | undefined | RawString>;
  }
  export interface IframeHTMLAttributes extends HTMLAttributes {
    allow?: Awaitable<string | undefined | RawString>;
    allowFullScreen?: Awaitable<boolean | undefined | RawString>;
    allowTransparency?: Awaitable<boolean | undefined | RawString>;
    frameBorder?: Awaitable<number | string | undefined | RawString>;
    height?: Awaitable<number | string | undefined | RawString>;
    loading?: Awaitable<"eager" | "lazy" | undefined | RawString>;
    marginHeight?: Awaitable<number | undefined | RawString>;
    marginWidth?: Awaitable<number | undefined | RawString>;
    name?: Awaitable<string | undefined | RawString>;
    referrerPolicy?: Awaitable<HTMLAttributeReferrerPolicy | undefined | RawString>;
    sandbox?: Awaitable<string | undefined | RawString>;
    scrolling?: Awaitable<string | undefined | RawString>;
    seamless?: Awaitable<boolean | undefined | RawString>;
    src?: Awaitable<string | undefined | RawString>;
    srcDoc?: Awaitable<string | undefined | RawString>;
    width?: Awaitable<number | string | undefined | RawString>;
  }
  export interface ImgHTMLAttributes extends HTMLAttributes {
    alt?: Awaitable<string | undefined | RawString>;
    crossOrigin?: Awaitable<CrossOrigin | RawString>;
    decoding?: Awaitable<"async" | "auto" | "sync" | undefined | RawString>;
    fetchPriority?: Awaitable<"high" | "low" | "auto" | undefined | RawString>;
    height?: Awaitable<number | string | undefined | RawString>;
    loading?: Awaitable<"eager" | "lazy" | undefined | RawString>;
    referrerPolicy?: Awaitable<HTMLAttributeReferrerPolicy | undefined | RawString>;
    sizes?: Awaitable<string | undefined | RawString>;
    src?: Awaitable<string | undefined | RawString>;
    srcSet?: Awaitable<string | undefined | RawString>;
    useMap?: Awaitable<string | undefined | RawString>;
    width?: Awaitable<number | string | undefined | RawString>;
  }
  export interface InputHTMLAttributes extends HTMLAttributes {
    accept?: Awaitable<string | undefined | RawString>;
    alt?: Awaitable<string | undefined | RawString>;
    autoComplete?: Awaitable<HTMLInputAutoCompleteAttribute | undefined | RawString>;
    capture?: Awaitable<boolean | "user" | "environment" | undefined | RawString>;
    checked?: Awaitable<boolean | undefined | RawString>;
    disabled?: Awaitable<boolean | undefined | RawString>;
    form?: Awaitable<string | undefined | RawString>;
    formAction?: Awaitable<
      string | ((formData: FormData) => void | Promise<void>) | undefined | RawString
    >;
    formEncType?: Awaitable<string | undefined | RawString>;
    formMethod?: Awaitable<string | undefined | RawString>;
    formNoValidate?: Awaitable<boolean | undefined | RawString>;
    formTarget?: Awaitable<string | undefined | RawString>;
    height?: Awaitable<number | string | undefined | RawString>;
    list?: Awaitable<string | undefined | RawString>;
    max?: Awaitable<number | string | undefined | RawString>;
    maxLength?: Awaitable<number | undefined | RawString>;
    min?: Awaitable<number | string | undefined | RawString>;
    minLength?: Awaitable<number | undefined | RawString>;
    multiple?: Awaitable<boolean | undefined | RawString>;
    name?: Awaitable<string | undefined | RawString>;
    pattern?: Awaitable<string | undefined | RawString>;
    placeholder?: Awaitable<string | undefined | RawString>;
    readOnly?: Awaitable<boolean | undefined | RawString>;
    required?: Awaitable<boolean | undefined | RawString>;
    size?: Awaitable<number | undefined | RawString>;
    src?: Awaitable<string | undefined | RawString>;
    step?: Awaitable<number | string | undefined | RawString>;
    type?: Awaitable<HTMLInputTypeAttribute | undefined | RawString>;
    value?: Awaitable<string | readonly string[] | number | undefined | RawString>;
    width?: Awaitable<number | string | undefined | RawString>;
  }
  export interface InsHTMLAttributes extends HTMLAttributes {
    cite?: Awaitable<string | undefined | RawString>;
    dateTime?: Awaitable<string | undefined | RawString>;
  }
  export interface KeygenHTMLAttributes extends HTMLAttributes {
    challenge?: Awaitable<string | undefined | RawString>;
    disabled?: Awaitable<boolean | undefined | RawString>;
    form?: Awaitable<string | undefined | RawString>;
    keyType?: Awaitable<string | undefined | RawString>;
    keyParams?: Awaitable<string | undefined | RawString>;
    name?: Awaitable<string | undefined | RawString>;
  }
  export interface LabelHTMLAttributes extends HTMLAttributes {
    form?: Awaitable<string | undefined | RawString>;
  }
  export interface LiHTMLAttributes extends HTMLAttributes {
    value?: Awaitable<string | readonly string[] | number | undefined | RawString>;
  }
  export interface LinkHTMLAttributes extends HTMLAttributes {
    as?: Awaitable<string | undefined | RawString>;
    blocking?: Awaitable<"render" | (string & {}) | undefined | RawString>;
    crossOrigin?: Awaitable<CrossOrigin | RawString>;
    fetchPriority?: Awaitable<"high" | "low" | "auto" | undefined | RawString>;
    href?: Awaitable<string | undefined | RawString>;
    hrefLang?: Awaitable<string | undefined | RawString>;
    integrity?: Awaitable<string | undefined | RawString>;
    media?: Awaitable<string | undefined | RawString>;
    imageSrcSet?: Awaitable<string | undefined | RawString>;
    imageSizes?: Awaitable<string | undefined | RawString>;
    referrerPolicy?: Awaitable<HTMLAttributeReferrerPolicy | undefined | RawString>;
    sizes?: Awaitable<string | undefined | RawString>;
    type?: Awaitable<string | undefined | RawString>;
    charSet?: Awaitable<string | undefined | RawString>;
    precedence?: Awaitable<string | undefined | RawString>;
  }
  export interface MapHTMLAttributes extends HTMLAttributes {
    name?: Awaitable<string | undefined | RawString>;
  }
  export interface MenuHTMLAttributes extends HTMLAttributes {
    type?: Awaitable<string | undefined | RawString>;
  }
  export interface MetaHTMLAttributes extends HTMLAttributes {
    charSet?: Awaitable<string | undefined | RawString>;
    content?: Awaitable<string | undefined | RawString>;
    httpEquiv?: Awaitable<string | undefined | RawString>;
    media?: Awaitable<string | undefined | RawString>;
    name?: Awaitable<string | undefined | RawString>;
  }
  export interface MeterHTMLAttributes extends HTMLAttributes {
    form?: Awaitable<string | undefined | RawString>;
    high?: Awaitable<number | undefined | RawString>;
    low?: Awaitable<number | undefined | RawString>;
    max?: Awaitable<number | string | undefined | RawString>;
    min?: Awaitable<number | string | undefined | RawString>;
    optimum?: Awaitable<number | undefined | RawString>;
    value?: Awaitable<string | readonly string[] | number | undefined | RawString>;
  }
  export interface ObjectHTMLAttributes extends HTMLAttributes {
    data?: Awaitable<string | undefined | RawString>;
    form?: Awaitable<string | undefined | RawString>;
    height?: Awaitable<number | string | undefined | RawString>;
    name?: Awaitable<string | undefined | RawString>;
    type?: Awaitable<string | undefined | RawString>;
    useMap?: Awaitable<string | undefined | RawString>;
    width?: Awaitable<number | string | undefined | RawString>;
    wmode?: Awaitable<string | undefined | RawString>;
  }
  export interface OlHTMLAttributes extends HTMLAttributes {
    reversed?: Awaitable<boolean | undefined | RawString>;
    start?: Awaitable<number | undefined | RawString>;
    type?: Awaitable<"1" | "a" | "A" | "i" | "I" | undefined | RawString>;
  }
  export interface OptgroupHTMLAttributes extends HTMLAttributes {
    disabled?: Awaitable<boolean | undefined | RawString>;
    label?: Awaitable<string | undefined | RawString>;
  }
  export interface OptionHTMLAttributes extends HTMLAttributes {
    disabled?: Awaitable<boolean | undefined | RawString>;
    label?: Awaitable<string | undefined | RawString>;
    selected?: Awaitable<boolean | undefined | RawString>;
    value?: Awaitable<string | readonly string[] | number | undefined | RawString>;
  }
  export interface OutputHTMLAttributes extends HTMLAttributes {
    form?: Awaitable<string | undefined | RawString>;
    name?: Awaitable<string | undefined | RawString>;
  }
  export interface ParamHTMLAttributes extends HTMLAttributes {
    name?: Awaitable<string | undefined | RawString>;
    value?: Awaitable<string | readonly string[] | number | undefined | RawString>;
  }
  export interface ProgressHTMLAttributes extends HTMLAttributes {
    max?: Awaitable<number | string | undefined | RawString>;
    value?: Awaitable<string | readonly string[] | number | undefined | RawString>;
  }
  export interface QuoteHTMLAttributes extends HTMLAttributes {
    cite?: Awaitable<string | undefined | RawString>;
  }
  export interface SlotHTMLAttributes extends HTMLAttributes {
    name?: Awaitable<string | undefined | RawString>;
  }
  export interface ScriptHTMLAttributes extends HTMLAttributes {
    async?: Awaitable<boolean | undefined | RawString>;
    blocking?: Awaitable<"render" | (string & {}) | undefined | RawString>;
    charSet?: Awaitable<string | undefined | RawString>;
    crossOrigin?: Awaitable<CrossOrigin | RawString>;
    defer?: Awaitable<boolean | undefined | RawString>;
    fetchPriority?: Awaitable<"high" | "low" | "auto" | undefined | RawString>;
    integrity?: Awaitable<string | undefined | RawString>;
    noModule?: Awaitable<boolean | undefined | RawString>;
    referrerPolicy?: Awaitable<HTMLAttributeReferrerPolicy | undefined | RawString>;
    src?: Awaitable<string | undefined | RawString>;
    type?: Awaitable<string | undefined | RawString>;
  }
  export interface SelectHTMLAttributes extends HTMLAttributes {
    autoComplete?: Awaitable<string | undefined | RawString>;
    disabled?: Awaitable<boolean | undefined | RawString>;
    form?: Awaitable<string | undefined | RawString>;
    multiple?: Awaitable<boolean | undefined | RawString>;
    name?: Awaitable<string | undefined | RawString>;
    required?: Awaitable<boolean | undefined | RawString>;
    size?: Awaitable<number | undefined | RawString>;
    value?: Awaitable<string | readonly string[] | number | undefined | RawString>;
  }
  export interface SourceHTMLAttributes extends HTMLAttributes {
    height?: Awaitable<number | string | undefined | RawString>;
    media?: Awaitable<string | undefined | RawString>;
    sizes?: Awaitable<string | undefined | RawString>;
    src?: Awaitable<string | undefined | RawString>;
    srcSet?: Awaitable<string | undefined | RawString>;
    type?: Awaitable<string | undefined | RawString>;
    width?: Awaitable<number | string | undefined | RawString>;
  }
  export interface StyleHTMLAttributes extends HTMLAttributes {
    blocking?: Awaitable<"render" | (string & {}) | undefined | RawString>;
    media?: Awaitable<string | undefined | RawString>;
    scoped?: Awaitable<boolean | undefined | RawString>;
    type?: Awaitable<string | undefined | RawString>;
    href?: Awaitable<string | undefined | RawString>;
    precedence?: Awaitable<string | undefined | RawString>;
  }
  export interface TableHTMLAttributes extends HTMLAttributes {
    align?: Awaitable<"left" | "center" | "right" | undefined | RawString>;
    bgcolor?: Awaitable<string | undefined | RawString>;
    border?: Awaitable<number | undefined | RawString>;
    cellPadding?: Awaitable<number | string | undefined | RawString>;
    cellSpacing?: Awaitable<number | string | undefined | RawString>;
    frame?: Awaitable<boolean | undefined | RawString>;
    rules?: Awaitable<"none" | "groups" | "rows" | "columns" | "all" | undefined | RawString>;
    summary?: Awaitable<string | undefined | RawString>;
    width?: Awaitable<number | string | undefined | RawString>;
  }
  export interface TdHTMLAttributes extends HTMLAttributes {
    align?: Awaitable<"left" | "center" | "right" | "justify" | "char" | undefined | RawString>;
    colSpan?: Awaitable<number | undefined | RawString>;
    headers?: Awaitable<string | undefined | RawString>;
    rowSpan?: Awaitable<number | undefined | RawString>;
    scope?: Awaitable<string | undefined | RawString>;
    abbr?: Awaitable<string | undefined | RawString>;
    height?: Awaitable<number | string | undefined | RawString>;
    width?: Awaitable<number | string | undefined | RawString>;
    valign?: Awaitable<"top" | "middle" | "bottom" | "baseline" | undefined | RawString>;
  }
  export interface TextareaHTMLAttributes extends HTMLAttributes {
    autoComplete?: Awaitable<string | undefined | RawString>;
    cols?: Awaitable<number | undefined | RawString>;
    dirName?: Awaitable<string | undefined | RawString>;
    disabled?: Awaitable<boolean | undefined | RawString>;
    form?: Awaitable<string | undefined | RawString>;
    maxLength?: Awaitable<number | undefined | RawString>;
    minLength?: Awaitable<number | undefined | RawString>;
    name?: Awaitable<string | undefined | RawString>;
    placeholder?: Awaitable<string | undefined | RawString>;
    readOnly?: Awaitable<boolean | undefined | RawString>;
    required?: Awaitable<boolean | undefined | RawString>;
    rows?: Awaitable<number | undefined | RawString>;
    value?: Awaitable<string | readonly string[] | number | undefined | RawString>;
    wrap?: Awaitable<string | undefined | RawString>;
  }
  export interface ThHTMLAttributes extends HTMLAttributes {
    align?: Awaitable<"left" | "center" | "right" | "justify" | "char" | undefined | RawString>;
    colSpan?: Awaitable<number | undefined | RawString>;
    headers?: Awaitable<string | undefined | RawString>;
    rowSpan?: Awaitable<number | undefined | RawString>;
    scope?: Awaitable<string | undefined | RawString>;
    abbr?: Awaitable<string | undefined | RawString>;
  }
  export interface TimeHTMLAttributes extends HTMLAttributes {
    dateTime?: Awaitable<string | undefined | RawString>;
  }
  export interface TrackHTMLAttributes extends HTMLAttributes {
    default?: Awaitable<boolean | undefined | RawString>;
    kind?: Awaitable<string | undefined | RawString>;
    label?: Awaitable<string | undefined | RawString>;
    src?: Awaitable<string | undefined | RawString>;
    srcLang?: Awaitable<string | undefined | RawString>;
  }
  export interface VideoHTMLAttributes extends MediaHTMLAttributes {
    height?: Awaitable<number | string | undefined | RawString>;
    playsInline?: Awaitable<boolean | undefined | RawString>;
    poster?: Awaitable<string | undefined | RawString>;
    width?: Awaitable<number | string | undefined | RawString>;
    disablePictureInPicture?: Awaitable<boolean | undefined | RawString>;
    disableRemotePlayback?: Awaitable<boolean | undefined | RawString>;
  }
  export interface WebViewHTMLAttributes extends HTMLAttributes {
    allowFullScreen?: Awaitable<boolean | undefined | RawString>;
    allowpopups?: Awaitable<boolean | undefined | RawString>;
    autosize?: Awaitable<boolean | undefined | RawString>;
    blinkfeatures?: Awaitable<string | undefined | RawString>;
    disableblinkfeatures?: Awaitable<string | undefined | RawString>;
    disableguestresize?: Awaitable<boolean | undefined | RawString>;
    disablewebsecurity?: Awaitable<boolean | undefined | RawString>;
    guestinstance?: Awaitable<string | undefined | RawString>;
    httpreferrer?: Awaitable<string | undefined | RawString>;
    nodeintegration?: Awaitable<boolean | undefined | RawString>;
    partition?: Awaitable<string | undefined | RawString>;
    plugins?: Awaitable<boolean | undefined | RawString>;
    preload?: Awaitable<string | undefined | RawString>;
    src?: Awaitable<string | undefined | RawString>;
    useragent?: Awaitable<string | undefined | RawString>;
    webpreferences?: Awaitable<string | undefined | RawString>;
  }
  export interface SVGProps extends SVGAttributes {}
  export interface SVGLineElementAttributes extends SVGProps {}
  export interface SVGTextElementAttributes extends SVGProps {}
  export interface SVGAttributes extends AriaAttributes, DOMAttributes {
    color?: Awaitable<string | undefined | RawString>;
    height?: Awaitable<number | string | undefined | RawString>;
    id?: Awaitable<string | undefined | RawString>;
    width?: Awaitable<number | string | undefined | RawString>;
    role?: Awaitable<AriaRole | undefined | RawString>;
    tabIndex?: Awaitable<number | undefined | RawString>;
    accumulate?: Awaitable<"none" | "sum" | undefined | RawString>;
    additive?: Awaitable<"replace" | "sum" | undefined | RawString>;
    alignmentBaseline?: Awaitable<
      | "auto"
      | "baseline"
      | "before-edge"
      | "text-before-edge"
      | "middle"
      | "central"
      | "after-edge"
      | "text-after-edge"
      | "ideographic"
      | "alphabetic"
      | "hanging"
      | "mathematical"
      | "inherit"
      | undefined
      | RawString
    >;
    attributeName?: Awaitable<string | undefined | RawString>;
    baseFrequency?: Awaitable<number | string | undefined | RawString>;
    baselineShift?: Awaitable<number | string | undefined | RawString>;
    begin?: Awaitable<number | string | undefined | RawString>;
    by?: Awaitable<number | string | undefined | RawString>;
    calcMode?: Awaitable<number | string | undefined | RawString>;
    clipPath?: Awaitable<string | undefined | RawString>;
    clipPathUnits?: Awaitable<number | string | undefined | RawString>;
    clipRule?: Awaitable<number | string | undefined | RawString>;
    colorInterpolation?: Awaitable<number | string | undefined | RawString>;
    colorInterpolationFilters?: Awaitable<
      "auto" | "sRGB" | "linearRGB" | "inherit" | undefined | RawString
    >;
    cursor?: Awaitable<number | string | undefined | RawString>;
    cx?: Awaitable<number | string | undefined | RawString>;
    cy?: Awaitable<number | string | undefined | RawString>;
    d?: Awaitable<string | undefined | RawString>;
    display?: Awaitable<number | string | undefined | RawString>;
    dominantBaseline?: Awaitable<
      | "auto"
      | "use-script"
      | "no-change"
      | "reset-size"
      | "ideographic"
      | "alphabetic"
      | "hanging"
      | "mathematical"
      | "central"
      | "middle"
      | "text-after-edge"
      | "text-before-edge"
      | "inherit"
      | undefined
      | RawString
    >;
    dur?: Awaitable<number | string | undefined | RawString>;
    end?: Awaitable<number | string | undefined | RawString>;
    fill?: Awaitable<string | undefined | RawString>;
    fillOpacity?: Awaitable<number | string | undefined | RawString>;
    fillRule?: Awaitable<"nonzero" | "evenodd" | "inherit" | undefined | RawString>;
    filter?: Awaitable<string | undefined | RawString>;
    filterUnits?: Awaitable<number | string | undefined | RawString>;
    floodColor?: Awaitable<number | string | undefined | RawString>;
    floodOpacity?: Awaitable<number | string | undefined | RawString>;
    fontFamily?: Awaitable<string | undefined | RawString>;
    fontSize?: Awaitable<number | string | undefined | RawString>;
    fontStyle?: Awaitable<number | string | undefined | RawString>;
    fontWeight?: Awaitable<number | string | undefined | RawString>;
    from?: Awaitable<number | string | undefined | RawString>;
    fx?: Awaitable<number | string | undefined | RawString>;
    fy?: Awaitable<number | string | undefined | RawString>;
    gradientTransform?: Awaitable<string | undefined | RawString>;
    gradientUnits?: Awaitable<string | undefined | RawString>;
    href?: Awaitable<string | undefined | RawString>;
    imageRendering?: Awaitable<number | string | undefined | RawString>;
    in2?: Awaitable<number | string | undefined | RawString>;
    in?: Awaitable<string | undefined | RawString>;
    keySplines?: Awaitable<number | string | undefined | RawString>;
    keyTimes?: Awaitable<number | string | undefined | RawString>;
    lengthAdjust?: Awaitable<number | string | undefined | RawString>;
    letterSpacing?: Awaitable<number | string | undefined | RawString>;
    lightingColor?: Awaitable<number | string | undefined | RawString>;
    markerEnd?: Awaitable<string | undefined | RawString>;
    markerHeight?: Awaitable<number | string | undefined | RawString>;
    markerMid?: Awaitable<string | undefined | RawString>;
    markerStart?: Awaitable<string | undefined | RawString>;
    markerUnits?: Awaitable<number | string | undefined | RawString>;
    markerWidth?: Awaitable<number | string | undefined | RawString>;
    mask?: Awaitable<string | undefined | RawString>;
    maskContentUnits?: Awaitable<number | string | undefined | RawString>;
    maskUnits?: Awaitable<number | string | undefined | RawString>;
    mode?: Awaitable<number | string | undefined | RawString>;
    numOctaves?: Awaitable<number | string | undefined | RawString>;
    offset?: Awaitable<number | string | undefined | RawString>;
    opacity?: Awaitable<number | string | undefined | RawString>;
    operator?: Awaitable<number | string | undefined | RawString>;
    orient?: Awaitable<number | string | undefined | RawString>;
    overflow?: Awaitable<number | string | undefined | RawString>;
    paintOrder?: Awaitable<number | string | undefined | RawString>;
    path?: Awaitable<string | undefined | RawString>;
    pathLength?: Awaitable<number | string | undefined | RawString>;
    patternContentUnits?: Awaitable<string | undefined | RawString>;
    patternTransform?: Awaitable<number | string | undefined | RawString>;
    patternUnits?: Awaitable<string | undefined | RawString>;
    pointerEvents?: Awaitable<number | string | undefined | RawString>;
    points?: Awaitable<string | undefined | RawString>;
    preserveAspectRatio?: Awaitable<string | undefined | RawString>;
    primitiveUnits?: Awaitable<number | string | undefined | RawString>;
    r?: Awaitable<number | string | undefined | RawString>;
    refX?: Awaitable<number | string | undefined | RawString>;
    refY?: Awaitable<number | string | undefined | RawString>;
    repeatCount?: Awaitable<number | string | undefined | RawString>;
    restart?: Awaitable<number | string | undefined | RawString>;
    result?: Awaitable<string | undefined | RawString>;
    rx?: Awaitable<number | string | undefined | RawString>;
    ry?: Awaitable<number | string | undefined | RawString>;
    seed?: Awaitable<number | string | undefined | RawString>;
    shapeRendering?: Awaitable<number | string | undefined | RawString>;
    spreadMethod?: Awaitable<string | undefined | RawString>;
    stdDeviation?: Awaitable<number | string | undefined | RawString>;
    stopColor?: Awaitable<string | undefined | RawString>;
    stopOpacity?: Awaitable<number | string | undefined | RawString>;
    stroke?: Awaitable<string | undefined | RawString>;
    strokeDasharray?: Awaitable<string | number | undefined | RawString>;
    strokeDashoffset?: Awaitable<string | number | undefined | RawString>;
    strokeLinecap?: Awaitable<"butt" | "round" | "square" | "inherit" | undefined | RawString>;
    strokeLinejoin?: Awaitable<"miter" | "round" | "bevel" | "inherit" | undefined | RawString>;
    strokeMiterlimit?: Awaitable<number | string | undefined | RawString>;
    strokeOpacity?: Awaitable<number | string | undefined | RawString>;
    strokeWidth?: Awaitable<number | string | undefined | RawString>;
    textAnchor?: Awaitable<"start" | "middle" | "end" | "inherit" | undefined | RawString>;
    textDecoration?: Awaitable<number | string | undefined | RawString>;
    textLength?: Awaitable<number | string | undefined | RawString>;
    textRendering?: Awaitable<number | string | undefined | RawString>;
    to?: Awaitable<number | string | undefined | RawString>;
    transform?: Awaitable<string | undefined | RawString>;
    values?: Awaitable<string | undefined | RawString>;
    vectorEffect?: Awaitable<number | string | undefined | RawString>;
    viewBox?: Awaitable<string | undefined | RawString>;
    visibility?: Awaitable<number | string | undefined | RawString>;
    wordSpacing?: Awaitable<number | string | undefined | RawString>;
    writingMode?: Awaitable<number | string | undefined | RawString>;
    x1?: Awaitable<number | string | undefined | RawString>;
    x2?: Awaitable<number | string | undefined | RawString>;
    x?: Awaitable<number | string | undefined | RawString>;
    xmlns?: Awaitable<string | undefined | RawString>;
    y1?: Awaitable<number | string | undefined | RawString>;
    y2?: Awaitable<number | string | undefined | RawString>;
    y?: Awaitable<number | string | undefined | RawString>;
  }

  /**
   * What an intrinsic element accepts.
   */
  export interface IntrinsicElements {
    [K: `${string}-${string}`]: Record<string, unknown> & { children?: Renderable };
    a: AnchorHTMLAttributes;
    abbr: HTMLAttributes;
    address: HTMLAttributes;
    area: AreaHTMLAttributes;
    article: HTMLAttributes;
    aside: HTMLAttributes;
    audio: AudioHTMLAttributes;
    b: HTMLAttributes;
    base: BaseHTMLAttributes;
    bdi: HTMLAttributes;
    bdo: HTMLAttributes;
    big: HTMLAttributes;
    blockquote: BlockquoteHTMLAttributes;
    body: HTMLAttributes;
    br: HTMLAttributes;
    button: ButtonHTMLAttributes;
    canvas: CanvasHTMLAttributes;
    caption: HTMLAttributes;
    center: HTMLAttributes;
    cite: HTMLAttributes;
    code: HTMLAttributes;
    col: ColHTMLAttributes;
    colgroup: ColgroupHTMLAttributes;
    data: DataHTMLAttributes;
    datalist: HTMLAttributes;
    dd: HTMLAttributes;
    del: DelHTMLAttributes;
    details: DetailsHTMLAttributes;
    dfn: HTMLAttributes;
    dialog: DialogHTMLAttributes;
    div: HTMLAttributes;
    dl: HTMLAttributes;
    dt: HTMLAttributes;
    em: HTMLAttributes;
    embed: EmbedHTMLAttributes;
    fieldset: FieldsetHTMLAttributes;
    figcaption: HTMLAttributes;
    figure: HTMLAttributes;
    footer: HTMLAttributes;
    form: FormHTMLAttributes;
    h1: HTMLAttributes;
    h2: HTMLAttributes;
    h3: HTMLAttributes;
    h4: HTMLAttributes;
    h5: HTMLAttributes;
    h6: HTMLAttributes;
    head: HTMLAttributes;
    header: HTMLAttributes;
    hgroup: HTMLAttributes;
    hr: HTMLAttributes;
    html: HtmlHTMLAttributes;
    i: HTMLAttributes;
    iframe: IframeHTMLAttributes;
    img: ImgHTMLAttributes;
    input: InputHTMLAttributes;
    ins: InsHTMLAttributes;
    kbd: HTMLAttributes;
    keygen: KeygenHTMLAttributes;
    label: LabelHTMLAttributes;
    legend: HTMLAttributes;
    li: LiHTMLAttributes;
    link: LinkHTMLAttributes;
    main: HTMLAttributes;
    map: MapHTMLAttributes;
    mark: HTMLAttributes;
    menu: MenuHTMLAttributes;
    menuitem: HTMLAttributes;
    meta: MetaHTMLAttributes;
    meter: MeterHTMLAttributes;
    nav: HTMLAttributes;
    noindex: HTMLAttributes;
    noscript: HTMLAttributes;
    object: ObjectHTMLAttributes;
    ol: OlHTMLAttributes;
    optgroup: OptgroupHTMLAttributes;
    option: OptionHTMLAttributes;
    output: OutputHTMLAttributes;
    p: HTMLAttributes;
    param: ParamHTMLAttributes;
    picture: HTMLAttributes;
    pre: HTMLAttributes;
    progress: ProgressHTMLAttributes;
    q: QuoteHTMLAttributes;
    rp: HTMLAttributes;
    rt: HTMLAttributes;
    ruby: HTMLAttributes;
    s: HTMLAttributes;
    samp: HTMLAttributes;
    search: HTMLAttributes;
    slot: SlotHTMLAttributes;
    script: ScriptHTMLAttributes;
    section: HTMLAttributes;
    select: SelectHTMLAttributes;
    small: HTMLAttributes;
    source: SourceHTMLAttributes;
    span: HTMLAttributes;
    strong: HTMLAttributes;
    style: StyleHTMLAttributes;
    sub: HTMLAttributes;
    summary: HTMLAttributes;
    sup: HTMLAttributes;
    table: TableHTMLAttributes;
    template: HTMLAttributes;
    tbody: HTMLAttributes;
    td: TdHTMLAttributes;
    textarea: TextareaHTMLAttributes;
    tfoot: HTMLAttributes;
    th: ThHTMLAttributes;
    thead: HTMLAttributes;
    time: TimeHTMLAttributes;
    title: HTMLAttributes;
    tr: HTMLAttributes;
    track: TrackHTMLAttributes;
    u: HTMLAttributes;
    ul: HTMLAttributes;
    var: HTMLAttributes;
    video: VideoHTMLAttributes;
    wbr: HTMLAttributes;
    webview: WebViewHTMLAttributes;
    svg: SVGProps;
    animate: SVGProps;
    animateMotion: SVGProps;
    animateTransform: SVGProps;
    circle: SVGProps;
    clipPath: SVGProps;
    defs: SVGProps;
    desc: SVGProps;
    ellipse: SVGProps;
    feBlend: SVGProps;
    feColorMatrix: SVGProps;
    feComponentTransfer: SVGProps;
    feComposite: SVGProps;
    feConvolveMatrix: SVGProps;
    feDiffuseLighting: SVGProps;
    feDisplacementMap: SVGProps;
    feDistantLight: SVGProps;
    feDropShadow: SVGProps;
    feFlood: SVGProps;
    feFuncA: SVGProps;
    feFuncB: SVGProps;
    feFuncG: SVGProps;
    feFuncR: SVGProps;
    feGaussianBlur: SVGProps;
    feImage: SVGProps;
    feMerge: SVGProps;
    feMergeNode: SVGProps;
    feMorphology: SVGProps;
    feOffset: SVGProps;
    fePointLight: SVGProps;
    feSpecularLighting: SVGProps;
    feSpotLight: SVGProps;
    feTile: SVGProps;
    feTurbulence: SVGProps;
    filter: SVGProps;
    foreignObject: SVGProps;
    g: SVGProps;
    image: SVGProps;
    line: SVGLineElementAttributes;
    linearGradient: SVGProps;
    marker: SVGProps;
    mask: SVGProps;
    metadata: SVGProps;
    mpath: SVGProps;
    path: SVGProps;
    pattern: SVGProps;
    polygon: SVGProps;
    polyline: SVGProps;
    radialGradient: SVGProps;
    rect: SVGProps;
    set: SVGProps;
    stop: SVGProps;
    switch: SVGProps;
    symbol: SVGProps;
    text: SVGTextElementAttributes;
    textPath: SVGProps;
    tspan: SVGProps;
    use: SVGProps;
    view: SVGProps;
  }
  // @generated:end

  /**
   * Props every element accepts without them being attributes.
   *
   * `key` is lifted out of props by the JSX transform, so it never reaches the
   * runtime and must not be checked against an element's attribute list.
   */
  export interface IntrinsicAttributes {
    key?: string | number | bigint | null | undefined;
  }

  /**
   * Names the prop that JSX children are written into, so `<div>{value}</div>` is
   * checked against `children` instead of not being checked at all. Only the
   * property *name* is read by the compiler; its type is irrelevant.
   */
  export interface ElementChildrenAttribute {
    children: unknown;
  }
}
