import { access, readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import ts from 'typescript'

export async function resolve(specifier, context, nextResolve) {
  if ((specifier.startsWith('.') || specifier.startsWith('/')) && context.parentURL) {
    const candidate = new URL(specifier, context.parentURL)
    if (!extname(candidate.pathname)) {
      for (const extension of ['.ts', '.tsx']) {
        const url = new URL(`${candidate.href}${extension}`)
        try {
          await access(url)
          return { url: url.href, shortCircuit: true }
        } catch {
          // Try the next TypeScript extension.
        }
      }
    }
  }
  return nextResolve(specifier, context)
}

export async function load(url, context, nextLoad) {
  if (!/\.tsx?$/.test(url)) return nextLoad(url, context)
  const source = await readFile(new URL(url), 'utf8')
  const result = ts.transpileModule(source, {
    fileName: new URL(url).pathname,
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true
    }
  })
  return { format: 'module', source: result.outputText, shortCircuit: true }
}
