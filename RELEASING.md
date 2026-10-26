# Publishing packages

The [Manual Release (Bun)](.github/workflows/release.yml) workflow publishes one
package at a time from the selected Git ref. Check that CI is green for that ref
before dispatching it. Each package publishes the version in its own
`package.json`.

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
   `vite-plugin`, and `precompile` in any order. These integrations check that
   the matching core version exists on npm. Publish `ssg` after Core and
   `vite-plugin`; both matching versions must exist on npm.
   Publish `create-vincle` after Core; its generated projects install Core.
4. For each package, configure npm trusted publishing for GitHub repository
   `cjean-fr/vincle`, workflow filename `release.yml`, with direct `npm publish`
   allowed. Remove the `NPM_TOKEN` secret and revoke the bootstrap token once
   all packages have a trusted publisher. Future releases use OIDC.

The workflow installs npm 11.20.0, packs with Bun so `workspace:` dependencies
become npm versions, and publishes with `--provenance --access public`. A package
name and version cannot be published twice; bump the relevant versions before a
subsequent release.

## The `0.0.0-stage` placeholder

`@vincle/ssg` and `@vincle/vite-plugin` each list a `0.0.0-stage` version,
published about a minute before their first real version. Its description is
"Temporary package placeholder for staged publishing" and it contains no code.
It appears in the public version list and installs as an empty package
(`npm i @vincle/ssg@0.0.0-stage`). The `latest` tag and the `^` ranges point to
the real versions, never to it.
