import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packageLockPath = path.join(repositoryRoot, 'package-lock.json')
const cargoManifestPath = path.join(repositoryRoot, 'src-tauri', 'Cargo.toml')
const outputPath = path.join(repositoryRoot, 'THIRD_PARTY_NOTICES.md')

const packageLock = JSON.parse(readFileSync(packageLockPath, 'utf8'))
const npmPackages = Object.entries(packageLock.packages)
  .filter(([packagePath]) => packagePath.includes('node_modules/'))
  .map(([packagePath, metadata]) => {
    const sourceMetadata = metadata.link
      ? packageLock.packages[metadata.resolved] ?? metadata
      : metadata
    const name = packagePath.slice(packagePath.lastIndexOf('node_modules/') + 'node_modules/'.length)
    return {
      name,
      version: sourceMetadata.version ?? 'unknown',
      license: normalizeLicense(sourceMetadata.license),
      scope: metadata.dev ? 'development/build' : metadata.link ? 'vendored/local' : 'application',
      url: `https://www.npmjs.com/package/${encodeURIComponent(name)}`
    }
  })
  .sort(comparePackages)

const cargoMetadata = JSON.parse(
  execFileSync(
    'cargo',
    ['metadata', '--manifest-path', cargoManifestPath, '--format-version', '1', '--locked'],
    { cwd: repositoryRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  )
)

const rustPackages = cargoMetadata.packages
  .filter((metadata) => metadata.name !== 'notesproject')
  .map((metadata) => ({
    name: metadata.name,
    version: metadata.version,
    license: normalizeLicense(metadata.license),
    scope: metadata.source ? 'dependency' : 'vendored/local',
    url: metadata.repository || `https://crates.io/crates/${encodeURIComponent(metadata.name)}`
  }))
  .sort(comparePackages)

const markdown = `# Third-Party Open-Source Software

Bricriu is built on open-source software. This inventory covers every installed JavaScript package resolved by \`package-lock.json\` and every Rust package in the resolved \`src-tauri/Cargo.lock\` dependency graph. It includes build tools, transitive dependencies, optional dependencies, and platform-specific packages so that the list errs on the side of inclusion.

Package names link to their npm, crates.io, or upstream project pages. License expressions come from package metadata; consult each linked project and the license files shipped with its source for the controlling terms. This inventory is attribution and release-audit material, not legal advice and not a replacement for distributing any license or NOTICE text required by a dependency.

## Brand Typefaces

- The Bricriu wordmark is rendered in **Segotia 1.005**, designed by Dominic Stanley and released under the SIL Open Font License 1.1 with Reserved Font Name Segotia. The SVG contains outlined lettering, not an embedded font. The upstream copyright notice and complete OFL text are retained at [\`public/brand/segotia-OFL-1.1.txt\`](public/brand/segotia-OFL-1.1.txt).
- The Bricriu squaremark is a static rendering of the capital \`B\` in **Gadelica 3**, designed by Séamas Ó Brógáin. [Gaelchló's published note](https://www.gaelchlo.com/clonna2.html) says Gadelica may be distributed but not modified. Bricriu does not include the Gadelica font file or its vector glyph outlines.

Regenerate this file after changing dependencies:

\`\`\`sh
npm run notices
\`\`\`

## JavaScript and Web Dependencies (${npmPackages.length})

| Package | Version | Declared license | Scope |
| --- | ---: | --- | --- |
${renderRows(npmPackages)}

## Rust Dependencies (${rustPackages.length})

| Crate | Version | Declared license | Scope |
| --- | ---: | --- | --- |
${renderRows(rustPackages)}
`

writeFileSync(outputPath, markdown, 'utf8')
console.log(`Wrote ${path.relative(repositoryRoot, outputPath)} with ${npmPackages.length + rustPackages.length} entries.`)

function normalizeLicense(value) {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (value && typeof value.type === 'string' && value.type.trim()) return value.type.trim()
  return 'Not declared in package metadata'
}

function comparePackages(left, right) {
  return left.name.localeCompare(right.name) || left.version.localeCompare(right.version)
}

function renderRows(packages) {
  return packages
    .map(({ name, version, license, scope, url }) =>
      `| [${escapeCell(name)}](${url}) | ${escapeCell(version)} | ${escapeCell(license)} | ${escapeCell(scope)} |`
    )
    .join('\n')
}

function escapeCell(value) {
  return String(value).replaceAll('|', '\\|').replaceAll('\n', ' ')
}
