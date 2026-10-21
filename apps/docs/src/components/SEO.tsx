import type { DocsRenderContext } from "../lib/context.js";

import { getHeaders, getStructuredData } from "../lib/seo.js";
import { markdownPath } from "../lib/url.js";

type SEOProps = { page: DocsRenderContext };

export function SEOHeader({ page }: SEOProps) {
  const {
    title,
    description,
    keywords,
    canonical,
    image,
    imageSize,
    isErrorPage,
    currentPage,
    hasMarkdownAlternate,
  } = getHeaders(page);
  return (
    <>
      {isErrorPage && <meta name="robots" content="noindex" />}
      {/* One icon only, because `public/` holds just the one. */}
      <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
      <title>{title}</title>
      {description && <meta name="description" content={description} />}
      {keywords && <meta name="keywords" content={keywords} />}
      {canonical && !isErrorPage && <link rel="canonical" href={canonical} />}
      {/* Markdown twin of this page, for agents (RSS-style alternate). */}
      {!isErrorPage && hasMarkdownAlternate && (
        <link rel="alternate" type="text/markdown" href={markdownPath(currentPage)} />
      )}
      <meta property="og:type" content="website" />
      <meta property="og:title" content={title} />
      <meta property="og:locale" content="en_US" />
      {description && <meta property="og:description" content={description} />}
      {canonical && <meta property="og:url" content={canonical} />}
      {image && <meta property="og:image" content={image} />}
      {image && imageSize && (
        <>
          <meta property="og:image:width" content={String(imageSize.width)} />
          <meta property="og:image:height" content={String(imageSize.height)} />
        </>
      )}
      {image && <meta property="og:image:alt" content={title} />}
      <meta name="twitter:card" content={image ? "summary_large_image" : "summary"} />
      <meta name="twitter:title" content={title} />
      {description && <meta name="twitter:description" content={description} />}
      {image && <meta name="twitter:image" content={image} />}
    </>
  );
}

export function SEOFooter({ page }: SEOProps) {
  const data = getStructuredData(page);
  return data ? <script type="application/ld+json">{JSON.stringify(data)}</script> : null;
}
