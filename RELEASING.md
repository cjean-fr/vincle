# Publishing packages

The [Manual Release (Bun)](.github/workflows/release.yml) workflow publishes one
package at a time from the selected Git ref. Check that CI is green for that ref
before dispatching it. The five packages available in the workflow currently
target `0.9.0`.

## First publication

An npm trusted publisher can only be configured after its package exists on the
registry. To bootstrap a package from GitHub Actions with provenance:

1. Confirm that the package name is available and that the npm account can
   publish it (including the `@vincle` scope).
2. Create a short-lived npm publish token with access to these packages and add
   it as the GitHub Actions secret `NPM_TOKEN`. The workflow passes it only to
   the credential check and publish steps. The account and token must meet npm's
   2FA requirements for non-interactive publishing.
3. Dispatch the workflow for `core` first, then `flow`, `eslint-plugin`,
   `vite-plugin`, and `precompile` in any order. Each remaining package checks
   that the matching core version exists on npm.
4. For each package, configure npm trusted publishing for GitHub repository
   `cjean-fr/vincle`, workflow filename `release.yml`, with direct `npm publish`
   allowed. Remove the `NPM_TOKEN` secret and revoke the bootstrap token once
   all packages have a trusted publisher. Future releases use OIDC.

The workflow installs npm 11.20.0, packs with Bun so `workspace:` dependencies
become npm versions, and publishes with `--provenance --access public`. A package
name and version cannot be published twice; bump the relevant versions before a
subsequent release.
