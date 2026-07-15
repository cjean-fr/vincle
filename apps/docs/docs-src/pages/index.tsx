import type { VNode } from "@vincle/core";

import type { PageMeta } from "../types.js";

import { CodeExample } from "../components/CodeExample.js";

export const meta: PageMeta = {
  title: "Home",
};

function BoltIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="size-5 shrink-0"
    >
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="size-5 shrink-0"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function LayersIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="size-5 shrink-0"
    >
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  );
}

function ServerIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="size-5 shrink-0"
    >
      <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
      <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
      <line x1="6" y1="6" x2="6.01" y2="6" />
      <line x1="6" y1="18" x2="6.01" y2="18" />
    </svg>
  );
}

function PackageIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="size-5 shrink-0"
    >
      <line x1="16.5" y1="9.4" x2="7.5" y2="4.21" />
      <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 002 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  );
}

function CodeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="size-5 shrink-0"
    >
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  );
}

interface FeatureCardProps {
  icon: VNode;
  title: string;
  description: string;
}

function FeatureCard({ icon, title, description }: FeatureCardProps) {
  return (
    <div class="docs-feature-card group relative rounded-2xl border border-[var(--docs-color-border)] bg-[var(--docs-color-bg)] p-6 hover:border-[var(--docs-color-accent)] hover:shadow-[var(--docs-color-accent)]/10 hover:shadow-md">
      <div class="docs-card-glow pointer-events-none absolute -inset-px rounded-2xl opacity-0 transition-opacity group-hover:opacity-100">
        <div class="absolute inset-0 rounded-2xl bg-gradient-to-br from-[var(--docs-color-accent)]/10 via-transparent to-purple-500/10" />
      </div>
      <div class="relative">
        <div class="docs-feature-card-icon mb-4 flex size-10 items-center justify-center rounded-xl bg-[var(--docs-color-accent-soft)] text-[var(--docs-color-accent)] ring-1 ring-[var(--docs-color-accent)]/10 transition-colors">
          {icon}
        </div>
        <h3 class="mb-2 text-base font-semibold text-[var(--docs-color-text)]">{title}</h3>
        <p class="text-sm leading-relaxed text-[var(--docs-color-text-secondary)]">{description}</p>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <div class="docs-home">
      {/* Hero section */}
      <div class="docs-home-hero mb-20">
        <div class="mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--docs-color-accent)]/20 bg-[var(--docs-color-accent-soft)] px-4 py-1.5 text-sm font-medium text-[var(--docs-color-accent)]">
          <span class="size-1.5 rounded-full bg-[var(--docs-color-accent)]" />
          v1.0.0-beta
        </div>

        <h1 class="text-5xl font-extrabold tracking-tight text-[var(--docs-color-text)] sm:text-6xl lg:text-7xl">
          JSX for the server side&nbsp;
          <span class="bg-gradient-to-r from-indigo-600 via-violet-500 to-purple-600 bg-clip-text text-transparent dark:from-indigo-400 dark:via-violet-400 dark:to-purple-400">
            typed, async-native. No browser engine needed.
          </span>
        </h1>

        <p class="mt-6 max-w-2xl text-lg text-[var(--docs-color-text-secondary)] sm:text-xl">
          Server-side JSX rendering with native async, no DOM shim. For email templates, API
          responses, and static sites.
        </p>
        <p class="mt-3 text-sm text-[var(--docs-color-text-secondary)]/70">
          Built for Node.js 20+, Bun, Deno, and Cloudflare Workers.
        </p>
      </div>

      {/* Three use-case cards */}
      <div class="docs-use-case-grid mb-20 grid grid-cols-1 gap-5 sm:grid-cols-3">
        <UseCaseCard
          icon={<PackageIcon />}
          title="Email templates"
          before="50 KB of React DOM or fragile string concat"
          after="Typed components, zero browser runtime"
        />
        <UseCaseCard
          icon={<CodeIcon />}
          title="API responses"
          before="EJS/Handlebars with no type safety"
          after="Full TypeScript, async data fetch, escape by default"
        />
        <UseCaseCard
          icon={<BoltIcon />}
          title="Static sites"
          before="Hydration tax + framework lock-in"
          after="One-pass render, 0 JS shipped to browser"
        />
      </div>

      {/* CTA buttons */}
      <div class="mb-24 flex flex-wrap items-center gap-4">
        <a
          href="/guide/introduction"
          class="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 via-violet-500 to-purple-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition-colors transition-transform hover:shadow-xl hover:shadow-indigo-500/30 active:scale-[0.97] dark:from-indigo-400 dark:via-violet-400 dark:to-purple-400 dark:shadow-indigo-400/20 dark:hover:shadow-indigo-400/30"
        >
          Get started
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            class="size-4 transition-transform group-hover:translate-x-0.5"
          >
            <path
              fill-rule="evenodd"
              d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z"
              clip-rule="evenodd"
            />
          </svg>
        </a>
        <a
          href="https://github.com/vincle/vincle"
          class="inline-flex items-center gap-2 rounded-lg border border-[var(--docs-color-border)] bg-[var(--docs-color-bg)] px-6 py-3 text-sm font-semibold text-[var(--docs-color-text-secondary)] shadow-sm transition-colors transition-transform hover:bg-[var(--docs-color-surface)] hover:text-[var(--docs-color-text)] active:scale-[0.97]"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" class="size-4">
            <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
          </svg>
          GitHub
        </a>
        <span class="text-sm text-[var(--docs-color-text-secondary)]">
          Or{" "}
          <a
            href="/api/core/renderToString"
            class="text-[var(--docs-color-accent)] hover:underline"
          >
            browse the API reference
          </a>{" "}
          directly.
        </span>
      </div>

      {/* Quick start section */}
      <div class="mb-20">
        <div class="mb-6">
          <span class="docs-section-accent" />
          <h2 class="text-2xl font-bold tracking-tight text-[var(--docs-color-text)]">
            Quick start
          </h2>
          <p class="mt-1 text-[var(--docs-color-text-secondary)]">
            Install Vincle and render your first HTML string.
          </p>
        </div>
        <CodeExample src="home/hello.tsx" />
        <div class="mt-4">
          <CodeExample src="home/install.sh" language="bash" />
        </div>
      </div>

      {/* Feature cards grid — deeper, not the hero */}
      <div class="mb-8">
        <span class="docs-section-accent" />
        <h2 class="text-2xl font-bold tracking-tight text-[var(--docs-color-text)]">
          Built for the server
        </h2>
        <p class="mt-1 mb-6 text-[var(--docs-color-text-secondary)]">
          Once you're in, here's what you get.
        </p>
      </div>

      <div class="mb-20 grid grid-cols-1 gap-5 sm:grid-cols-2">
        <FeatureCard
          icon={<ShieldIcon />}
          title="Security by default"
          description="No opt-in needed: all content HTML-escaped, dangerous URL schemes blocked, event handlers silently dropped."
        />
        <FeatureCard
          icon={<BoltIcon />}
          title="Async-native"
          description="Any component can be async. Fetch data, query databases, await the full tree. renderToString handles it all."
        />
        <FeatureCard
          icon={<LayersIcon />}
          title="Scoped context"
          description="Per-request context with typed keys. AsyncLocalStorage-backed. Provider components not needed. Concurrent renders isolated."
        />
        <FeatureCard
          icon={<ServerIcon />}
          title="Any runtime"
          description="Node 20+, Bun, Deno, Cloudflare Workers. No DOM shim, no polyfill, no browser build step."
        />
      </div>

      {/* Stats section */}
      <div class="mb-6 grid grid-cols-3 gap-4">
        <Stat value="0" label="Runtime dependencies" />
        <Stat value="100%" label="TypeScript coverage" />
        <Stat value="MIT" label="License" />
      </div>

      {/* Footer badges */}
      <div class="mb-6 flex flex-wrap gap-3 border-t border-[var(--docs-color-border)] pt-8">
        <a href="https://github.com/vincle/vincle/actions/workflows/ci.yml">
          <img
            src="https://github.com/vincle/vincle/actions/workflows/ci.yml/badge.svg"
            alt="CI"
            height="20"
          />
        </a>
        <a href="https://www.npmjs.com/package/@vincle/core">
          <img src="https://img.shields.io/npm/v/@vincle/core" alt="npm version" height="20" />
        </a>
        <a href="https://www.npmjs.com/package/@vincle/core">
          <img src="https://img.shields.io/npm/dm/@vincle/core" alt="downloads" height="20" />
        </a>
      </div>
    </div>
  );
}

interface UseCaseCardProps {
  icon: VNode;
  title: string;
  before: string;
  after: string;
}

function UseCaseCard({ icon, title, before, after }: UseCaseCardProps) {
  return (
    <div class="docs-usecase-card group relative rounded-2xl border border-[var(--docs-color-border)] bg-[var(--docs-color-bg)] p-6 transition-colors hover:border-[var(--docs-color-accent)] hover:shadow-[var(--docs-color-accent)]/10 hover:shadow-md">
      <div class="relative">
        <div class="mb-4 flex size-10 items-center justify-center rounded-xl bg-red-50 text-red-600 ring-1 ring-red-200/50 dark:bg-red-950 dark:text-red-400 dark:ring-red-800/50">
          {icon}
        </div>
        <h3 class="mb-3 text-base font-semibold text-[var(--docs-color-text)]">{title}</h3>
        <div class="space-y-2 text-sm">
          <div class="flex items-start gap-2">
            <span class="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-red-100 text-[10px] font-bold text-red-600 dark:bg-red-900 dark:text-red-400">
              ✕
            </span>
            <span class="text-[var(--docs-color-text-secondary)]">{before}</span>
          </div>
          <div class="flex items-start gap-2">
            <span class="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-green-100 text-[10px] font-bold text-green-600 dark:bg-green-900 dark:text-green-400">
              ✓
            </span>
            <span class="font-medium text-[var(--docs-color-text)]">{after}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div class="docs-stat-card rounded-xl border border-[var(--docs-color-border)] bg-[var(--docs-color-surface)] px-5 py-5 text-center">
      <div class="text-2xl font-bold tracking-tight text-[var(--docs-color-text)]">{value}</div>
      <div class="mt-1 text-xs font-medium tracking-wider text-[var(--docs-color-text-secondary)] uppercase">
        {label}
      </div>
    </div>
  );
}
