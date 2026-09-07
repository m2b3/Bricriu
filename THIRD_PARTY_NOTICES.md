# Third-Party Open-Source Software

Bricriu is built on open-source software. This inventory covers every installed JavaScript package resolved by `package-lock.json` and every Rust package in the resolved `src-tauri/Cargo.lock` dependency graph. It includes build tools, transitive dependencies, optional dependencies, and platform-specific packages so that the list errs on the side of inclusion.

Package names link to their npm, crates.io, or upstream project pages. License expressions come from package metadata; consult each linked project and the license files shipped with its source for the controlling terms. This inventory is attribution and release-audit material, not legal advice and not a replacement for distributing any license or NOTICE text required by a dependency.

## Brand Typefaces

- The Bricriu wordmark is rendered in **Segotia 1.005**, designed by Dominic Stanley and released under the SIL Open Font License 1.1 with Reserved Font Name Segotia. The SVG contains outlined lettering, not an embedded font. The upstream copyright notice and complete OFL text are retained at [`public/brand/segotia-OFL-1.1.txt`](public/brand/segotia-OFL-1.1.txt).
- The Bricriu squaremark is a static rendering of the capital `B` in **Gadelica 3**, designed by Séamas Ó Brógáin. [Gaelchló's published note](https://www.gaelchlo.com/clonna2.html) says Gadelica may be distributed but not modified. Bricriu does not include the Gadelica font file or its vector glyph outlines.

Regenerate this file after changing dependencies:

```sh
npm run notices
```

## JavaScript and Web Dependencies (295)

| Package | Version | Declared license | Scope |
| --- | ---: | --- | --- |
| [@babel/code-frame](https://www.npmjs.com/package/%40babel%2Fcode-frame) | 7.29.0 | MIT | development/build |
| [@babel/compat-data](https://www.npmjs.com/package/%40babel%2Fcompat-data) | 7.29.3 | MIT | development/build |
| [@babel/core](https://www.npmjs.com/package/%40babel%2Fcore) | 7.29.0 | MIT | development/build |
| [@babel/generator](https://www.npmjs.com/package/%40babel%2Fgenerator) | 7.29.1 | MIT | development/build |
| [@babel/helper-compilation-targets](https://www.npmjs.com/package/%40babel%2Fhelper-compilation-targets) | 7.28.6 | MIT | development/build |
| [@babel/helper-globals](https://www.npmjs.com/package/%40babel%2Fhelper-globals) | 7.28.0 | MIT | development/build |
| [@babel/helper-module-imports](https://www.npmjs.com/package/%40babel%2Fhelper-module-imports) | 7.28.6 | MIT | development/build |
| [@babel/helper-module-transforms](https://www.npmjs.com/package/%40babel%2Fhelper-module-transforms) | 7.28.6 | MIT | development/build |
| [@babel/helper-plugin-utils](https://www.npmjs.com/package/%40babel%2Fhelper-plugin-utils) | 7.28.6 | MIT | development/build |
| [@babel/helper-string-parser](https://www.npmjs.com/package/%40babel%2Fhelper-string-parser) | 7.27.1 | MIT | development/build |
| [@babel/helper-validator-identifier](https://www.npmjs.com/package/%40babel%2Fhelper-validator-identifier) | 7.28.5 | MIT | development/build |
| [@babel/helper-validator-option](https://www.npmjs.com/package/%40babel%2Fhelper-validator-option) | 7.27.1 | MIT | development/build |
| [@babel/helpers](https://www.npmjs.com/package/%40babel%2Fhelpers) | 7.29.2 | MIT | development/build |
| [@babel/parser](https://www.npmjs.com/package/%40babel%2Fparser) | 7.29.3 | MIT | development/build |
| [@babel/plugin-transform-react-jsx-self](https://www.npmjs.com/package/%40babel%2Fplugin-transform-react-jsx-self) | 7.27.1 | MIT | development/build |
| [@babel/plugin-transform-react-jsx-source](https://www.npmjs.com/package/%40babel%2Fplugin-transform-react-jsx-source) | 7.27.1 | MIT | development/build |
| [@babel/template](https://www.npmjs.com/package/%40babel%2Ftemplate) | 7.28.6 | MIT | development/build |
| [@babel/traverse](https://www.npmjs.com/package/%40babel%2Ftraverse) | 7.29.0 | MIT | development/build |
| [@babel/types](https://www.npmjs.com/package/%40babel%2Ftypes) | 7.29.0 | MIT | development/build |
| [@codemirror/autocomplete](https://www.npmjs.com/package/%40codemirror%2Fautocomplete) | 6.20.2 | MIT | application |
| [@codemirror/commands](https://www.npmjs.com/package/%40codemirror%2Fcommands) | 6.10.3 | MIT | application |
| [@codemirror/lang-css](https://www.npmjs.com/package/%40codemirror%2Flang-css) | 6.3.1 | MIT | application |
| [@codemirror/lang-html](https://www.npmjs.com/package/%40codemirror%2Flang-html) | 6.4.11 | MIT | application |
| [@codemirror/lang-javascript](https://www.npmjs.com/package/%40codemirror%2Flang-javascript) | 6.2.5 | MIT | application |
| [@codemirror/lang-markdown](https://www.npmjs.com/package/%40codemirror%2Flang-markdown) | 6.5.0 | MIT | application |
| [@codemirror/language](https://www.npmjs.com/package/%40codemirror%2Flanguage) | 6.12.3 | MIT | application |
| [@codemirror/lint](https://www.npmjs.com/package/%40codemirror%2Flint) | 6.9.7 | MIT | application |
| [@codemirror/search](https://www.npmjs.com/package/%40codemirror%2Fsearch) | 6.7.0 | MIT | application |
| [@codemirror/state](https://www.npmjs.com/package/%40codemirror%2Fstate) | 6.6.0 | MIT | application |
| [@codemirror/view](https://www.npmjs.com/package/%40codemirror%2Fview) | 6.43.0 | MIT | application |
| [@esbuild/aix-ppc64](https://www.npmjs.com/package/%40esbuild%2Faix-ppc64) | 0.25.12 | MIT | development/build |
| [@esbuild/android-arm](https://www.npmjs.com/package/%40esbuild%2Fandroid-arm) | 0.25.12 | MIT | development/build |
| [@esbuild/android-arm64](https://www.npmjs.com/package/%40esbuild%2Fandroid-arm64) | 0.25.12 | MIT | development/build |
| [@esbuild/android-x64](https://www.npmjs.com/package/%40esbuild%2Fandroid-x64) | 0.25.12 | MIT | development/build |
| [@esbuild/darwin-arm64](https://www.npmjs.com/package/%40esbuild%2Fdarwin-arm64) | 0.25.12 | MIT | development/build |
| [@esbuild/darwin-x64](https://www.npmjs.com/package/%40esbuild%2Fdarwin-x64) | 0.25.12 | MIT | development/build |
| [@esbuild/freebsd-arm64](https://www.npmjs.com/package/%40esbuild%2Ffreebsd-arm64) | 0.25.12 | MIT | development/build |
| [@esbuild/freebsd-x64](https://www.npmjs.com/package/%40esbuild%2Ffreebsd-x64) | 0.25.12 | MIT | development/build |
| [@esbuild/linux-arm](https://www.npmjs.com/package/%40esbuild%2Flinux-arm) | 0.25.12 | MIT | development/build |
| [@esbuild/linux-arm64](https://www.npmjs.com/package/%40esbuild%2Flinux-arm64) | 0.25.12 | MIT | development/build |
| [@esbuild/linux-ia32](https://www.npmjs.com/package/%40esbuild%2Flinux-ia32) | 0.25.12 | MIT | development/build |
| [@esbuild/linux-loong64](https://www.npmjs.com/package/%40esbuild%2Flinux-loong64) | 0.25.12 | MIT | development/build |
| [@esbuild/linux-mips64el](https://www.npmjs.com/package/%40esbuild%2Flinux-mips64el) | 0.25.12 | MIT | development/build |
| [@esbuild/linux-ppc64](https://www.npmjs.com/package/%40esbuild%2Flinux-ppc64) | 0.25.12 | MIT | development/build |
| [@esbuild/linux-riscv64](https://www.npmjs.com/package/%40esbuild%2Flinux-riscv64) | 0.25.12 | MIT | development/build |
| [@esbuild/linux-s390x](https://www.npmjs.com/package/%40esbuild%2Flinux-s390x) | 0.25.12 | MIT | development/build |
| [@esbuild/linux-x64](https://www.npmjs.com/package/%40esbuild%2Flinux-x64) | 0.25.12 | MIT | development/build |
| [@esbuild/netbsd-arm64](https://www.npmjs.com/package/%40esbuild%2Fnetbsd-arm64) | 0.25.12 | MIT | development/build |
| [@esbuild/netbsd-x64](https://www.npmjs.com/package/%40esbuild%2Fnetbsd-x64) | 0.25.12 | MIT | development/build |
| [@esbuild/openbsd-arm64](https://www.npmjs.com/package/%40esbuild%2Fopenbsd-arm64) | 0.25.12 | MIT | development/build |
| [@esbuild/openbsd-x64](https://www.npmjs.com/package/%40esbuild%2Fopenbsd-x64) | 0.25.12 | MIT | development/build |
| [@esbuild/openharmony-arm64](https://www.npmjs.com/package/%40esbuild%2Fopenharmony-arm64) | 0.25.12 | MIT | development/build |
| [@esbuild/sunos-x64](https://www.npmjs.com/package/%40esbuild%2Fsunos-x64) | 0.25.12 | MIT | development/build |
| [@esbuild/win32-arm64](https://www.npmjs.com/package/%40esbuild%2Fwin32-arm64) | 0.25.12 | MIT | development/build |
| [@esbuild/win32-ia32](https://www.npmjs.com/package/%40esbuild%2Fwin32-ia32) | 0.25.12 | MIT | development/build |
| [@esbuild/win32-x64](https://www.npmjs.com/package/%40esbuild%2Fwin32-x64) | 0.25.12 | MIT | development/build |
| [@fullcalendar/core](https://www.npmjs.com/package/%40fullcalendar%2Fcore) | 6.1.20 | MIT | application |
| [@fullcalendar/daygrid](https://www.npmjs.com/package/%40fullcalendar%2Fdaygrid) | 6.1.20 | MIT | application |
| [@fullcalendar/interaction](https://www.npmjs.com/package/%40fullcalendar%2Finteraction) | 6.1.20 | MIT | application |
| [@fullcalendar/react](https://www.npmjs.com/package/%40fullcalendar%2Freact) | 6.1.20 | MIT | application |
| [@jridgewell/gen-mapping](https://www.npmjs.com/package/%40jridgewell%2Fgen-mapping) | 0.3.13 | MIT | development/build |
| [@jridgewell/remapping](https://www.npmjs.com/package/%40jridgewell%2Fremapping) | 2.3.5 | MIT | development/build |
| [@jridgewell/resolve-uri](https://www.npmjs.com/package/%40jridgewell%2Fresolve-uri) | 3.1.2 | MIT | development/build |
| [@jridgewell/sourcemap-codec](https://www.npmjs.com/package/%40jridgewell%2Fsourcemap-codec) | 1.5.5 | MIT | development/build |
| [@jridgewell/trace-mapping](https://www.npmjs.com/package/%40jridgewell%2Ftrace-mapping) | 0.3.31 | MIT | development/build |
| [@lezer/common](https://www.npmjs.com/package/%40lezer%2Fcommon) | 1.5.2 | MIT | application |
| [@lezer/css](https://www.npmjs.com/package/%40lezer%2Fcss) | 1.3.3 | MIT | application |
| [@lezer/highlight](https://www.npmjs.com/package/%40lezer%2Fhighlight) | 1.2.3 | MIT | application |
| [@lezer/html](https://www.npmjs.com/package/%40lezer%2Fhtml) | 1.3.13 | MIT | application |
| [@lezer/javascript](https://www.npmjs.com/package/%40lezer%2Fjavascript) | 1.5.4 | MIT | application |
| [@lezer/lr](https://www.npmjs.com/package/%40lezer%2Flr) | 1.4.10 | MIT | application |
| [@lezer/markdown](https://www.npmjs.com/package/%40lezer%2Fmarkdown) | 1.6.3 | MIT | application |
| [@marijn/find-cluster-break](https://www.npmjs.com/package/%40marijn%2Ffind-cluster-break) | 1.0.2 | MIT | application |
| [@mdit/helper](https://www.npmjs.com/package/%40mdit%2Fhelper) | 0.23.2 | MIT | application |
| [@mdit/plugin-katex](https://www.npmjs.com/package/%40mdit%2Fplugin-katex) | 0.25.2 | MIT | application |
| [@mdit/plugin-tex](https://www.npmjs.com/package/%40mdit%2Fplugin-tex) | 0.24.2 | MIT | application |
| [@popperjs/core](https://www.npmjs.com/package/%40popperjs%2Fcore) | 2.11.8 | MIT | application |
| [@remirror/core-constants](https://www.npmjs.com/package/%40remirror%2Fcore-constants) | 3.0.0 | MIT | application |
| [@rolldown/pluginutils](https://www.npmjs.com/package/%40rolldown%2Fpluginutils) | 1.0.0-beta.27 | MIT | development/build |
| [@rollup/plugin-virtual](https://www.npmjs.com/package/%40rollup%2Fplugin-virtual) | 3.0.2 | MIT | development/build |
| [@rollup/rollup-android-arm-eabi](https://www.npmjs.com/package/%40rollup%2Frollup-android-arm-eabi) | 4.60.4 | MIT | development/build |
| [@rollup/rollup-android-arm64](https://www.npmjs.com/package/%40rollup%2Frollup-android-arm64) | 4.60.4 | MIT | development/build |
| [@rollup/rollup-darwin-arm64](https://www.npmjs.com/package/%40rollup%2Frollup-darwin-arm64) | 4.60.4 | MIT | development/build |
| [@rollup/rollup-darwin-x64](https://www.npmjs.com/package/%40rollup%2Frollup-darwin-x64) | 4.60.4 | MIT | development/build |
| [@rollup/rollup-freebsd-arm64](https://www.npmjs.com/package/%40rollup%2Frollup-freebsd-arm64) | 4.60.4 | MIT | development/build |
| [@rollup/rollup-freebsd-x64](https://www.npmjs.com/package/%40rollup%2Frollup-freebsd-x64) | 4.60.4 | MIT | development/build |
| [@rollup/rollup-linux-arm-gnueabihf](https://www.npmjs.com/package/%40rollup%2Frollup-linux-arm-gnueabihf) | 4.60.4 | MIT | development/build |
| [@rollup/rollup-linux-arm-musleabihf](https://www.npmjs.com/package/%40rollup%2Frollup-linux-arm-musleabihf) | 4.60.4 | MIT | development/build |
| [@rollup/rollup-linux-arm64-gnu](https://www.npmjs.com/package/%40rollup%2Frollup-linux-arm64-gnu) | 4.60.4 | MIT | development/build |
| [@rollup/rollup-linux-arm64-musl](https://www.npmjs.com/package/%40rollup%2Frollup-linux-arm64-musl) | 4.60.4 | MIT | development/build |
| [@rollup/rollup-linux-loong64-gnu](https://www.npmjs.com/package/%40rollup%2Frollup-linux-loong64-gnu) | 4.60.4 | MIT | development/build |
| [@rollup/rollup-linux-loong64-musl](https://www.npmjs.com/package/%40rollup%2Frollup-linux-loong64-musl) | 4.60.4 | MIT | development/build |
| [@rollup/rollup-linux-ppc64-gnu](https://www.npmjs.com/package/%40rollup%2Frollup-linux-ppc64-gnu) | 4.60.4 | MIT | development/build |
| [@rollup/rollup-linux-ppc64-musl](https://www.npmjs.com/package/%40rollup%2Frollup-linux-ppc64-musl) | 4.60.4 | MIT | development/build |
| [@rollup/rollup-linux-riscv64-gnu](https://www.npmjs.com/package/%40rollup%2Frollup-linux-riscv64-gnu) | 4.60.4 | MIT | development/build |
| [@rollup/rollup-linux-riscv64-musl](https://www.npmjs.com/package/%40rollup%2Frollup-linux-riscv64-musl) | 4.60.4 | MIT | development/build |
| [@rollup/rollup-linux-s390x-gnu](https://www.npmjs.com/package/%40rollup%2Frollup-linux-s390x-gnu) | 4.60.4 | MIT | development/build |
| [@rollup/rollup-linux-x64-gnu](https://www.npmjs.com/package/%40rollup%2Frollup-linux-x64-gnu) | 4.60.4 | MIT | development/build |
| [@rollup/rollup-linux-x64-musl](https://www.npmjs.com/package/%40rollup%2Frollup-linux-x64-musl) | 4.60.4 | MIT | development/build |
| [@rollup/rollup-openbsd-x64](https://www.npmjs.com/package/%40rollup%2Frollup-openbsd-x64) | 4.60.4 | MIT | development/build |
| [@rollup/rollup-openharmony-arm64](https://www.npmjs.com/package/%40rollup%2Frollup-openharmony-arm64) | 4.60.4 | MIT | development/build |
| [@rollup/rollup-win32-arm64-msvc](https://www.npmjs.com/package/%40rollup%2Frollup-win32-arm64-msvc) | 4.60.4 | MIT | development/build |
| [@rollup/rollup-win32-ia32-msvc](https://www.npmjs.com/package/%40rollup%2Frollup-win32-ia32-msvc) | 4.60.4 | MIT | development/build |
| [@rollup/rollup-win32-x64-gnu](https://www.npmjs.com/package/%40rollup%2Frollup-win32-x64-gnu) | 4.60.4 | MIT | development/build |
| [@rollup/rollup-win32-x64-msvc](https://www.npmjs.com/package/%40rollup%2Frollup-win32-x64-msvc) | 4.60.4 | MIT | development/build |
| [@swc/core](https://www.npmjs.com/package/%40swc%2Fcore) | 1.15.40 | Apache-2.0 | development/build |
| [@swc/core-darwin-arm64](https://www.npmjs.com/package/%40swc%2Fcore-darwin-arm64) | 1.15.40 | Apache-2.0 AND MIT | development/build |
| [@swc/core-darwin-x64](https://www.npmjs.com/package/%40swc%2Fcore-darwin-x64) | 1.15.40 | Apache-2.0 AND MIT | development/build |
| [@swc/core-linux-arm-gnueabihf](https://www.npmjs.com/package/%40swc%2Fcore-linux-arm-gnueabihf) | 1.15.40 | Apache-2.0 | development/build |
| [@swc/core-linux-arm64-gnu](https://www.npmjs.com/package/%40swc%2Fcore-linux-arm64-gnu) | 1.15.40 | Apache-2.0 AND MIT | development/build |
| [@swc/core-linux-arm64-musl](https://www.npmjs.com/package/%40swc%2Fcore-linux-arm64-musl) | 1.15.40 | Apache-2.0 AND MIT | development/build |
| [@swc/core-linux-ppc64-gnu](https://www.npmjs.com/package/%40swc%2Fcore-linux-ppc64-gnu) | 1.15.40 | Apache-2.0 AND MIT | development/build |
| [@swc/core-linux-s390x-gnu](https://www.npmjs.com/package/%40swc%2Fcore-linux-s390x-gnu) | 1.15.40 | Apache-2.0 AND MIT | development/build |
| [@swc/core-linux-x64-gnu](https://www.npmjs.com/package/%40swc%2Fcore-linux-x64-gnu) | 1.15.40 | Apache-2.0 AND MIT | development/build |
| [@swc/core-linux-x64-musl](https://www.npmjs.com/package/%40swc%2Fcore-linux-x64-musl) | 1.15.40 | Apache-2.0 AND MIT | development/build |
| [@swc/core-win32-arm64-msvc](https://www.npmjs.com/package/%40swc%2Fcore-win32-arm64-msvc) | 1.15.40 | Apache-2.0 AND MIT | development/build |
| [@swc/core-win32-ia32-msvc](https://www.npmjs.com/package/%40swc%2Fcore-win32-ia32-msvc) | 1.15.40 | Apache-2.0 AND MIT | development/build |
| [@swc/core-win32-x64-msvc](https://www.npmjs.com/package/%40swc%2Fcore-win32-x64-msvc) | 1.15.40 | Apache-2.0 AND MIT | development/build |
| [@swc/counter](https://www.npmjs.com/package/%40swc%2Fcounter) | 0.1.3 | Apache-2.0 | development/build |
| [@swc/types](https://www.npmjs.com/package/%40swc%2Ftypes) | 0.1.26 | Apache-2.0 | development/build |
| [@swc/wasm](https://www.npmjs.com/package/%40swc%2Fwasm) | 1.15.40 | Apache-2.0 | development/build |
| [@tauri-apps/api](https://www.npmjs.com/package/%40tauri-apps%2Fapi) | 2.11.0 | Apache-2.0 OR MIT | application |
| [@tauri-apps/cli](https://www.npmjs.com/package/%40tauri-apps%2Fcli) | 2.11.2 | Apache-2.0 OR MIT | development/build |
| [@tauri-apps/cli-darwin-arm64](https://www.npmjs.com/package/%40tauri-apps%2Fcli-darwin-arm64) | 2.11.2 | Apache-2.0 OR MIT | development/build |
| [@tauri-apps/cli-darwin-x64](https://www.npmjs.com/package/%40tauri-apps%2Fcli-darwin-x64) | 2.11.2 | Apache-2.0 OR MIT | development/build |
| [@tauri-apps/cli-linux-arm-gnueabihf](https://www.npmjs.com/package/%40tauri-apps%2Fcli-linux-arm-gnueabihf) | 2.11.2 | Apache-2.0 OR MIT | development/build |
| [@tauri-apps/cli-linux-arm64-gnu](https://www.npmjs.com/package/%40tauri-apps%2Fcli-linux-arm64-gnu) | 2.11.2 | Apache-2.0 OR MIT | development/build |
| [@tauri-apps/cli-linux-arm64-musl](https://www.npmjs.com/package/%40tauri-apps%2Fcli-linux-arm64-musl) | 2.11.2 | Apache-2.0 OR MIT | development/build |
| [@tauri-apps/cli-linux-riscv64-gnu](https://www.npmjs.com/package/%40tauri-apps%2Fcli-linux-riscv64-gnu) | 2.11.2 | Apache-2.0 OR MIT | development/build |
| [@tauri-apps/cli-linux-x64-gnu](https://www.npmjs.com/package/%40tauri-apps%2Fcli-linux-x64-gnu) | 2.11.2 | Apache-2.0 OR MIT | development/build |
| [@tauri-apps/cli-linux-x64-musl](https://www.npmjs.com/package/%40tauri-apps%2Fcli-linux-x64-musl) | 2.11.2 | Apache-2.0 OR MIT | development/build |
| [@tauri-apps/cli-win32-arm64-msvc](https://www.npmjs.com/package/%40tauri-apps%2Fcli-win32-arm64-msvc) | 2.11.2 | Apache-2.0 OR MIT | development/build |
| [@tauri-apps/cli-win32-ia32-msvc](https://www.npmjs.com/package/%40tauri-apps%2Fcli-win32-ia32-msvc) | 2.11.2 | Apache-2.0 OR MIT | development/build |
| [@tauri-apps/cli-win32-x64-msvc](https://www.npmjs.com/package/%40tauri-apps%2Fcli-win32-x64-msvc) | 2.11.2 | Apache-2.0 OR MIT | development/build |
| [@tauri-apps/plugin-dialog](https://www.npmjs.com/package/%40tauri-apps%2Fplugin-dialog) | 2.7.3 | MIT OR Apache-2.0 | application |
| [@tauri-apps/plugin-opener](https://www.npmjs.com/package/%40tauri-apps%2Fplugin-opener) | 2.5.4 | MIT OR Apache-2.0 | application |
| [@tiptap/core](https://www.npmjs.com/package/%40tiptap%2Fcore) | 2.27.2 | MIT | application |
| [@tiptap/extension-blockquote](https://www.npmjs.com/package/%40tiptap%2Fextension-blockquote) | 2.27.2 | MIT | application |
| [@tiptap/extension-bold](https://www.npmjs.com/package/%40tiptap%2Fextension-bold) | 2.27.2 | MIT | application |
| [@tiptap/extension-bubble-menu](https://www.npmjs.com/package/%40tiptap%2Fextension-bubble-menu) | 2.27.2 | MIT | application |
| [@tiptap/extension-bullet-list](https://www.npmjs.com/package/%40tiptap%2Fextension-bullet-list) | 2.27.2 | MIT | application |
| [@tiptap/extension-code](https://www.npmjs.com/package/%40tiptap%2Fextension-code) | 2.27.2 | MIT | application |
| [@tiptap/extension-code-block](https://www.npmjs.com/package/%40tiptap%2Fextension-code-block) | 2.27.2 | MIT | application |
| [@tiptap/extension-document](https://www.npmjs.com/package/%40tiptap%2Fextension-document) | 2.27.2 | MIT | application |
| [@tiptap/extension-dropcursor](https://www.npmjs.com/package/%40tiptap%2Fextension-dropcursor) | 2.27.2 | MIT | application |
| [@tiptap/extension-floating-menu](https://www.npmjs.com/package/%40tiptap%2Fextension-floating-menu) | 2.27.2 | MIT | application |
| [@tiptap/extension-gapcursor](https://www.npmjs.com/package/%40tiptap%2Fextension-gapcursor) | 2.27.2 | MIT | application |
| [@tiptap/extension-hard-break](https://www.npmjs.com/package/%40tiptap%2Fextension-hard-break) | 2.27.2 | MIT | application |
| [@tiptap/extension-heading](https://www.npmjs.com/package/%40tiptap%2Fextension-heading) | 2.27.2 | MIT | application |
| [@tiptap/extension-history](https://www.npmjs.com/package/%40tiptap%2Fextension-history) | 2.27.2 | MIT | application |
| [@tiptap/extension-horizontal-rule](https://www.npmjs.com/package/%40tiptap%2Fextension-horizontal-rule) | 2.27.2 | MIT | application |
| [@tiptap/extension-italic](https://www.npmjs.com/package/%40tiptap%2Fextension-italic) | 2.27.2 | MIT | application |
| [@tiptap/extension-list-item](https://www.npmjs.com/package/%40tiptap%2Fextension-list-item) | 2.27.2 | MIT | application |
| [@tiptap/extension-ordered-list](https://www.npmjs.com/package/%40tiptap%2Fextension-ordered-list) | 2.27.2 | MIT | application |
| [@tiptap/extension-paragraph](https://www.npmjs.com/package/%40tiptap%2Fextension-paragraph) | 2.27.2 | MIT | application |
| [@tiptap/extension-strike](https://www.npmjs.com/package/%40tiptap%2Fextension-strike) | 2.27.2 | MIT | application |
| [@tiptap/extension-text](https://www.npmjs.com/package/%40tiptap%2Fextension-text) | 2.27.2 | MIT | application |
| [@tiptap/extension-text-style](https://www.npmjs.com/package/%40tiptap%2Fextension-text-style) | 2.27.2 | MIT | application |
| [@tiptap/pm](https://www.npmjs.com/package/%40tiptap%2Fpm) | 2.27.2 | MIT | application |
| [@tiptap/react](https://www.npmjs.com/package/%40tiptap%2Freact) | 2.27.2 | MIT | application |
| [@tiptap/starter-kit](https://www.npmjs.com/package/%40tiptap%2Fstarter-kit) | 2.27.2 | MIT | application |
| [@types/babel__core](https://www.npmjs.com/package/%40types%2Fbabel__core) | 7.20.5 | MIT | development/build |
| [@types/babel__generator](https://www.npmjs.com/package/%40types%2Fbabel__generator) | 7.27.0 | MIT | development/build |
| [@types/babel__template](https://www.npmjs.com/package/%40types%2Fbabel__template) | 7.4.4 | MIT | development/build |
| [@types/babel__traverse](https://www.npmjs.com/package/%40types%2Fbabel__traverse) | 7.28.0 | MIT | development/build |
| [@types/d3-color](https://www.npmjs.com/package/%40types%2Fd3-color) | 3.1.3 | MIT | application |
| [@types/d3-drag](https://www.npmjs.com/package/%40types%2Fd3-drag) | 3.0.7 | MIT | application |
| [@types/d3-interpolate](https://www.npmjs.com/package/%40types%2Fd3-interpolate) | 3.0.4 | MIT | application |
| [@types/d3-selection](https://www.npmjs.com/package/%40types%2Fd3-selection) | 3.0.11 | MIT | application |
| [@types/d3-transition](https://www.npmjs.com/package/%40types%2Fd3-transition) | 3.0.9 | MIT | application |
| [@types/d3-zoom](https://www.npmjs.com/package/%40types%2Fd3-zoom) | 3.0.8 | MIT | application |
| [@types/estree](https://www.npmjs.com/package/%40types%2Festree) | 1.0.8 | MIT | development/build |
| [@types/linkify-it](https://www.npmjs.com/package/%40types%2Flinkify-it) | 5.0.0 | MIT | application |
| [@types/markdown-it](https://www.npmjs.com/package/%40types%2Fmarkdown-it) | 14.1.2 | MIT | application |
| [@types/mdurl](https://www.npmjs.com/package/%40types%2Fmdurl) | 2.0.0 | MIT | application |
| [@types/prop-types](https://www.npmjs.com/package/%40types%2Fprop-types) | 15.7.15 | MIT | application |
| [@types/react](https://www.npmjs.com/package/%40types%2Freact) | 18.3.29 | MIT | application |
| [@types/react-dom](https://www.npmjs.com/package/%40types%2Freact-dom) | 18.3.7 | MIT | application |
| [@types/use-sync-external-store](https://www.npmjs.com/package/%40types%2Fuse-sync-external-store) | 0.0.6 | MIT | application |
| [@vitejs/plugin-react](https://www.npmjs.com/package/%40vitejs%2Fplugin-react) | 4.7.0 | MIT | development/build |
| [@xyflow/react](https://www.npmjs.com/package/%40xyflow%2Freact) | 12.11.0 | MIT | application |
| [@xyflow/system](https://www.npmjs.com/package/%40xyflow%2Fsystem) | 0.0.77 | MIT | application |
| [ansi-regex](https://www.npmjs.com/package/ansi-regex) | 5.0.1 | MIT | development/build |
| [ansi-styles](https://www.npmjs.com/package/ansi-styles) | 4.3.0 | MIT | development/build |
| [argparse](https://www.npmjs.com/package/argparse) | 2.0.1 | Python-2.0 | application |
| [baseline-browser-mapping](https://www.npmjs.com/package/baseline-browser-mapping) | 2.10.32 | Apache-2.0 | development/build |
| [browserslist](https://www.npmjs.com/package/browserslist) | 4.28.2 | MIT | development/build |
| [caniuse-lite](https://www.npmjs.com/package/caniuse-lite) | 1.0.30001793 | CC-BY-4.0 | development/build |
| [classcat](https://www.npmjs.com/package/classcat) | 5.0.5 | MIT | application |
| [cliui](https://www.npmjs.com/package/cliui) | 8.0.1 | ISC | development/build |
| [codemirror-lang-typst](https://www.npmjs.com/package/codemirror-lang-typst) | 0.4.0 | Apache-2.0 | vendored/local |
| [color-convert](https://www.npmjs.com/package/color-convert) | 2.0.1 | MIT | development/build |
| [color-name](https://www.npmjs.com/package/color-name) | 1.1.4 | MIT | development/build |
| [commander](https://www.npmjs.com/package/commander) | 8.3.0 | MIT | application |
| [convert-source-map](https://www.npmjs.com/package/convert-source-map) | 2.0.0 | MIT | development/build |
| [crelt](https://www.npmjs.com/package/crelt) | 1.0.6 | MIT | application |
| [csstype](https://www.npmjs.com/package/csstype) | 3.2.3 | MIT | application |
| [d3-color](https://www.npmjs.com/package/d3-color) | 3.1.0 | ISC | application |
| [d3-dispatch](https://www.npmjs.com/package/d3-dispatch) | 3.0.1 | ISC | application |
| [d3-drag](https://www.npmjs.com/package/d3-drag) | 3.0.0 | ISC | application |
| [d3-ease](https://www.npmjs.com/package/d3-ease) | 3.0.1 | BSD-3-Clause | application |
| [d3-interpolate](https://www.npmjs.com/package/d3-interpolate) | 3.0.1 | ISC | application |
| [d3-selection](https://www.npmjs.com/package/d3-selection) | 3.0.0 | ISC | application |
| [d3-timer](https://www.npmjs.com/package/d3-timer) | 3.0.1 | ISC | application |
| [d3-transition](https://www.npmjs.com/package/d3-transition) | 3.0.1 | ISC | application |
| [d3-zoom](https://www.npmjs.com/package/d3-zoom) | 3.0.0 | ISC | application |
| [debug](https://www.npmjs.com/package/debug) | 4.4.3 | MIT | development/build |
| [define-lazy-prop](https://www.npmjs.com/package/define-lazy-prop) | 2.0.0 | MIT | development/build |
| [dictionary-en-ca](https://www.npmjs.com/package/dictionary-en-ca) | 3.0.0 | (MIT AND BSD) | application |
| [electron-to-chromium](https://www.npmjs.com/package/electron-to-chromium) | 1.5.361 | ISC | development/build |
| [emoji-regex](https://www.npmjs.com/package/emoji-regex) | 8.0.0 | MIT | development/build |
| [entities](https://www.npmjs.com/package/entities) | 4.5.0 | BSD-2-Clause | application |
| [esbuild](https://www.npmjs.com/package/esbuild) | 0.25.12 | MIT | development/build |
| [escalade](https://www.npmjs.com/package/escalade) | 3.2.0 | MIT | development/build |
| [escape-string-regexp](https://www.npmjs.com/package/escape-string-regexp) | 4.0.0 | MIT | application |
| [fast-deep-equal](https://www.npmjs.com/package/fast-deep-equal) | 3.1.3 | MIT | application |
| [fdir](https://www.npmjs.com/package/fdir) | 6.5.0 | MIT | development/build |
| [fsevents](https://www.npmjs.com/package/fsevents) | 2.3.3 | MIT | development/build |
| [gensync](https://www.npmjs.com/package/gensync) | 1.0.0-beta.2 | MIT | development/build |
| [get-caller-file](https://www.npmjs.com/package/get-caller-file) | 2.0.5 | ISC | development/build |
| [is-buffer](https://www.npmjs.com/package/is-buffer) | 2.0.5 | MIT | application |
| [is-docker](https://www.npmjs.com/package/is-docker) | 2.2.1 | MIT | development/build |
| [is-fullwidth-code-point](https://www.npmjs.com/package/is-fullwidth-code-point) | 3.0.0 | MIT | development/build |
| [is-wsl](https://www.npmjs.com/package/is-wsl) | 2.2.0 | MIT | development/build |
| [js-tokens](https://www.npmjs.com/package/js-tokens) | 4.0.0 | MIT | application |
| [jsesc](https://www.npmjs.com/package/jsesc) | 3.1.0 | MIT | development/build |
| [json5](https://www.npmjs.com/package/json5) | 2.2.3 | MIT | development/build |
| [katex](https://www.npmjs.com/package/katex) | 0.16.47 | MIT | application |
| [katex](https://www.npmjs.com/package/katex) | 0.17.0 | MIT | application |
| [linkify-it](https://www.npmjs.com/package/linkify-it) | 5.0.1 | MIT | application |
| [loose-envify](https://www.npmjs.com/package/loose-envify) | 1.4.0 | MIT | application |
| [lru-cache](https://www.npmjs.com/package/lru-cache) | 5.1.1 | ISC | development/build |
| [markdown-it](https://www.npmjs.com/package/markdown-it) | 14.2.0 | MIT | application |
| [mdurl](https://www.npmjs.com/package/mdurl) | 2.0.0 | MIT | application |
| [ms](https://www.npmjs.com/package/ms) | 2.1.3 | MIT | development/build |
| [nanoid](https://www.npmjs.com/package/nanoid) | 3.3.12 | MIT | development/build |
| [node-releases](https://www.npmjs.com/package/node-releases) | 2.0.46 | MIT | development/build |
| [nspell](https://www.npmjs.com/package/nspell) | 2.1.5 | MIT | application |
| [open](https://www.npmjs.com/package/open) | 8.4.2 | MIT | development/build |
| [orderedmap](https://www.npmjs.com/package/orderedmap) | 2.1.1 | MIT | application |
| [picocolors](https://www.npmjs.com/package/picocolors) | 1.1.1 | ISC | development/build |
| [picomatch](https://www.npmjs.com/package/picomatch) | 4.0.4 | MIT | development/build |
| [postcss](https://www.npmjs.com/package/postcss) | 8.5.15 | MIT | development/build |
| [preact](https://www.npmjs.com/package/preact) | 10.12.1 | MIT | application |
| [prosemirror-changeset](https://www.npmjs.com/package/prosemirror-changeset) | 2.4.1 | MIT | application |
| [prosemirror-collab](https://www.npmjs.com/package/prosemirror-collab) | 1.3.1 | MIT | application |
| [prosemirror-commands](https://www.npmjs.com/package/prosemirror-commands) | 1.7.1 | MIT | application |
| [prosemirror-dropcursor](https://www.npmjs.com/package/prosemirror-dropcursor) | 1.8.2 | MIT | application |
| [prosemirror-gapcursor](https://www.npmjs.com/package/prosemirror-gapcursor) | 1.4.1 | MIT | application |
| [prosemirror-history](https://www.npmjs.com/package/prosemirror-history) | 1.5.0 | MIT | application |
| [prosemirror-inputrules](https://www.npmjs.com/package/prosemirror-inputrules) | 1.5.1 | MIT | application |
| [prosemirror-keymap](https://www.npmjs.com/package/prosemirror-keymap) | 1.2.3 | MIT | application |
| [prosemirror-markdown](https://www.npmjs.com/package/prosemirror-markdown) | 1.13.4 | MIT | application |
| [prosemirror-menu](https://www.npmjs.com/package/prosemirror-menu) | 1.3.2 | MIT | application |
| [prosemirror-model](https://www.npmjs.com/package/prosemirror-model) | 1.25.7 | MIT | application |
| [prosemirror-schema-basic](https://www.npmjs.com/package/prosemirror-schema-basic) | 1.2.4 | MIT | application |
| [prosemirror-schema-list](https://www.npmjs.com/package/prosemirror-schema-list) | 1.5.1 | MIT | application |
| [prosemirror-state](https://www.npmjs.com/package/prosemirror-state) | 1.4.4 | MIT | application |
| [prosemirror-tables](https://www.npmjs.com/package/prosemirror-tables) | 1.8.5 | MIT | application |
| [prosemirror-trailing-node](https://www.npmjs.com/package/prosemirror-trailing-node) | 3.0.0 | MIT | application |
| [prosemirror-transform](https://www.npmjs.com/package/prosemirror-transform) | 1.12.0 | MIT | application |
| [prosemirror-view](https://www.npmjs.com/package/prosemirror-view) | 1.41.8 | MIT | application |
| [punycode.js](https://www.npmjs.com/package/punycode.js) | 2.3.1 | MIT | application |
| [react](https://www.npmjs.com/package/react) | 18.3.1 | MIT | application |
| [react-dom](https://www.npmjs.com/package/react-dom) | 18.3.1 | MIT | application |
| [react-refresh](https://www.npmjs.com/package/react-refresh) | 0.17.0 | MIT | development/build |
| [require-directory](https://www.npmjs.com/package/require-directory) | 2.1.1 | MIT | development/build |
| [rollup](https://www.npmjs.com/package/rollup) | 4.60.4 | MIT | development/build |
| [rollup-plugin-visualizer](https://www.npmjs.com/package/rollup-plugin-visualizer) | 6.0.11 | MIT | development/build |
| [rope-sequence](https://www.npmjs.com/package/rope-sequence) | 1.3.4 | MIT | application |
| [scheduler](https://www.npmjs.com/package/scheduler) | 0.23.2 | MIT | application |
| [semver](https://www.npmjs.com/package/semver) | 6.3.1 | ISC | development/build |
| [source-map](https://www.npmjs.com/package/source-map) | 0.7.6 | BSD-3-Clause | development/build |
| [source-map-js](https://www.npmjs.com/package/source-map-js) | 1.2.1 | BSD-3-Clause | development/build |
| [string-width](https://www.npmjs.com/package/string-width) | 4.2.3 | MIT | development/build |
| [strip-ansi](https://www.npmjs.com/package/strip-ansi) | 6.0.1 | MIT | development/build |
| [style-mod](https://www.npmjs.com/package/style-mod) | 4.1.3 | MIT | application |
| [tinyglobby](https://www.npmjs.com/package/tinyglobby) | 0.2.16 | MIT | development/build |
| [tippy.js](https://www.npmjs.com/package/tippy.js) | 6.3.7 | MIT | application |
| [typescript](https://www.npmjs.com/package/typescript) | 5.9.3 | Apache-2.0 | development/build |
| [uc.micro](https://www.npmjs.com/package/uc.micro) | 2.1.0 | MIT | application |
| [update-browserslist-db](https://www.npmjs.com/package/update-browserslist-db) | 1.2.3 | MIT | development/build |
| [use-sync-external-store](https://www.npmjs.com/package/use-sync-external-store) | 1.6.0 | MIT | application |
| [uuid](https://www.npmjs.com/package/uuid) | 11.1.1 | MIT | development/build |
| [vite](https://www.npmjs.com/package/vite) | 6.4.2 | MIT | development/build |
| [vite-plugin-top-level-await](https://www.npmjs.com/package/vite-plugin-top-level-await) | 1.6.0 | MIT | development/build |
| [vite-plugin-wasm](https://www.npmjs.com/package/vite-plugin-wasm) | 3.6.0 | MIT | development/build |
| [w3c-keyname](https://www.npmjs.com/package/w3c-keyname) | 2.2.8 | MIT | application |
| [wrap-ansi](https://www.npmjs.com/package/wrap-ansi) | 7.0.0 | MIT | development/build |
| [y18n](https://www.npmjs.com/package/y18n) | 5.0.8 | ISC | development/build |
| [yallist](https://www.npmjs.com/package/yallist) | 3.1.1 | ISC | development/build |
| [yaml](https://www.npmjs.com/package/yaml) | 2.9.0 | ISC | application |
| [yargs](https://www.npmjs.com/package/yargs) | 17.7.2 | MIT | development/build |
| [yargs-parser](https://www.npmjs.com/package/yargs-parser) | 21.1.1 | ISC | development/build |
| [zustand](https://www.npmjs.com/package/zustand) | 4.5.7 | MIT | application |

## Rust Dependencies (725)

| Crate | Version | Declared license | Scope |
| --- | ---: | --- | --- |
| [adler2](https://github.com/oyvindln/adler2) | 2.0.1 | 0BSD OR MIT OR Apache-2.0 | dependency |
| [aes](https://github.com/RustCrypto/block-ciphers) | 0.9.2 | MIT OR Apache-2.0 | dependency |
| [aho-corasick](https://github.com/BurntSushi/aho-corasick) | 1.1.4 | Unlicense OR MIT | dependency |
| [alloc-no-stdlib](https://github.com/dropbox/rust-alloc-no-stdlib) | 2.0.4 | BSD-3-Clause | dependency |
| [alloc-stdlib](https://github.com/dropbox/rust-alloc-no-stdlib) | 0.2.2 | BSD-3-Clause | dependency |
| [android_system_properties](https://github.com/nical/android_system_properties) | 0.1.5 | MIT/Apache-2.0 | dependency |
| [anyhow](https://github.com/dtolnay/anyhow) | 1.0.102 | MIT OR Apache-2.0 | dependency |
| [approx](https://github.com/brendanzab/approx) | 0.5.1 | Apache-2.0 | dependency |
| [ar_archive_writer](https://github.com/rust-lang/ar_archive_writer) | 0.5.1 | Apache-2.0 WITH LLVM-exception | dependency |
| [arrayref](https://github.com/droundy/arrayref) | 0.3.9 | BSD-2-Clause | dependency |
| [arrayvec](https://github.com/bluss/arrayvec) | 0.7.6 | MIT OR Apache-2.0 | dependency |
| [async-broadcast](https://github.com/smol-rs/async-broadcast) | 0.7.2 | MIT OR Apache-2.0 | dependency |
| [async-channel](https://github.com/smol-rs/async-channel) | 2.5.0 | Apache-2.0 OR MIT | dependency |
| [async-executor](https://github.com/smol-rs/async-executor) | 1.14.0 | Apache-2.0 OR MIT | dependency |
| [async-io](https://github.com/smol-rs/async-io) | 2.6.0 | Apache-2.0 OR MIT | dependency |
| [async-lock](https://github.com/smol-rs/async-lock) | 3.4.2 | Apache-2.0 OR MIT | dependency |
| [async-process](https://github.com/smol-rs/async-process) | 2.5.0 | Apache-2.0 OR MIT | dependency |
| [async-recursion](https://github.com/dcchut/async-recursion) | 1.1.1 | MIT OR Apache-2.0 | dependency |
| [async-signal](https://github.com/smol-rs/async-signal) | 0.2.14 | Apache-2.0 OR MIT | dependency |
| [async-task](https://github.com/smol-rs/async-task) | 4.7.1 | Apache-2.0 OR MIT | dependency |
| [async-trait](https://github.com/dtolnay/async-trait) | 0.1.92 | MIT OR Apache-2.0 | dependency |
| [atk](https://github.com/gtk-rs/gtk3-rs) | 0.18.2 | MIT | dependency |
| [atk-sys](https://github.com/gtk-rs/gtk3-rs) | 0.18.2 | MIT | dependency |
| [atomic-waker](https://github.com/smol-rs/atomic-waker) | 1.1.2 | Apache-2.0 OR MIT | dependency |
| [autocfg](https://github.com/cuviper/autocfg) | 1.5.1 | Apache-2.0 OR MIT | dependency |
| [az](https://gitlab.com/tspiteri/az) | 1.3.0 | MIT/Apache-2.0 | dependency |
| [base64](https://github.com/marshallpierce/rust-base64) | 0.21.7 | MIT OR Apache-2.0 | dependency |
| [base64](https://github.com/marshallpierce/rust-base64) | 0.22.1 | MIT OR Apache-2.0 | dependency |
| [biblatex](https://github.com/typst/biblatex) | 0.11.0 | MIT OR Apache-2.0 | dependency |
| [bincode](https://github.com/servo/bincode) | 1.3.3 | MIT | dependency |
| [binstall-tar](https://github.com/cargo-bins/tar-rs) | 0.4.42 | MIT OR Apache-2.0 | dependency |
| [bit-set](https://github.com/contain-rs/bit-set) | 0.8.0 | Apache-2.0 OR MIT | dependency |
| [bit-vec](https://github.com/contain-rs/bit-vec) | 0.8.0 | Apache-2.0 OR MIT | dependency |
| [bitflags](https://github.com/bitflags/bitflags) | 1.3.2 | MIT/Apache-2.0 | dependency |
| [bitflags](https://github.com/bitflags/bitflags) | 2.11.1 | MIT OR Apache-2.0 | dependency |
| [block-buffer](https://github.com/RustCrypto/utils) | 0.10.4 | MIT OR Apache-2.0 | dependency |
| [block-buffer](https://github.com/RustCrypto/utils) | 0.12.1 | MIT OR Apache-2.0 | dependency |
| [block2](https://github.com/madsmtm/objc2) | 0.6.2 | MIT | dependency |
| [blocking](https://github.com/smol-rs/blocking) | 1.7.0 | Apache-2.0 OR MIT | dependency |
| [brotli](https://github.com/dropbox/rust-brotli) | 8.0.2 | BSD-3-Clause AND MIT | dependency |
| [brotli-decompressor](https://github.com/dropbox/rust-brotli-decompressor) | 5.0.0 | BSD-3-Clause/MIT | dependency |
| [bs58](https://github.com/Nullus157/bs58-rs) | 0.5.1 | MIT/Apache-2.0 | dependency |
| [bstr](https://github.com/BurntSushi/bstr) | 1.12.1 | MIT OR Apache-2.0 | dependency |
| [bumpalo](https://github.com/fitzgen/bumpalo) | 3.20.3 | MIT OR Apache-2.0 | dependency |
| [by_address](https://github.com/mbrubeck/by_address) | 1.2.1 | MIT OR Apache-2.0 | dependency |
| [bytemuck](https://github.com/Lokathor/bytemuck) | 1.25.0 | Zlib OR Apache-2.0 OR MIT | dependency |
| [bytemuck_derive](https://github.com/Lokathor/bytemuck) | 1.10.2 | Zlib OR Apache-2.0 OR MIT | dependency |
| [byteorder](https://github.com/BurntSushi/byteorder) | 1.5.0 | Unlicense OR MIT | dependency |
| [byteorder-lite](https://github.com/image-rs/byteorder-lite) | 0.1.0 | Unlicense OR MIT | dependency |
| [bytes](https://github.com/tokio-rs/bytes) | 1.11.1 | MIT | dependency |
| [cairo-rs](https://github.com/gtk-rs/gtk-rs-core) | 0.18.5 | MIT | dependency |
| [cairo-sys-rs](https://github.com/gtk-rs/gtk-rs-core) | 0.18.2 | MIT | dependency |
| [camino](https://github.com/camino-rs/camino) | 1.2.2 | MIT OR Apache-2.0 | dependency |
| [cargo_metadata](https://github.com/oli-obk/cargo_metadata) | 0.19.2 | MIT | dependency |
| [cargo_toml](https://gitlab.com/lib.rs/cargo_toml) | 0.22.3 | Apache-2.0 OR MIT | dependency |
| [cargo-platform](https://github.com/rust-lang/cargo) | 0.1.9 | MIT OR Apache-2.0 | dependency |
| [cc](https://github.com/rust-lang/cc-rs) | 1.2.62 | MIT OR Apache-2.0 | dependency |
| [cesu8](https://github.com/emk/cesu8-rs) | 1.1.0 | Apache-2.0/MIT | dependency |
| [cfb](https://github.com/mdsteele/rust-cfb) | 0.7.3 | MIT | dependency |
| [cfg-expr](https://github.com/EmbarkStudios/cfg-expr) | 0.15.8 | MIT OR Apache-2.0 | dependency |
| [cfg-if](https://github.com/rust-lang/cfg-if) | 1.0.4 | MIT OR Apache-2.0 | dependency |
| [chinese-number](https://github.com/magiclen/chinese-number) | 0.7.8 | MIT | dependency |
| [chinese-variant](https://github.com/magiclen/chinese-variant) | 1.1.5 | MIT | dependency |
| [chrono](https://github.com/chronotope/chrono) | 0.4.44 | MIT OR Apache-2.0 | dependency |
| [ciborium](https://github.com/enarx/ciborium) | 0.2.2 | Apache-2.0 | dependency |
| [ciborium-io](https://github.com/enarx/ciborium) | 0.2.2 | Apache-2.0 | dependency |
| [ciborium-ll](https://github.com/enarx/ciborium) | 0.2.2 | Apache-2.0 | dependency |
| [cipher](https://github.com/RustCrypto/traits) | 0.5.2 | MIT OR Apache-2.0 | dependency |
| [citationberg](https://github.com/typst/citationberg) | 0.6.1 | MIT OR Apache-2.0 | dependency |
| [cmov](https://github.com/RustCrypto/utils) | 0.5.4 | Apache-2.0 OR MIT | dependency |
| [cobs](https://github.com/jamesmunns/cobs.rs) | 0.3.0 | MIT OR Apache-2.0 | dependency |
| [codex](https://github.com/typst/codex) | 0.2.0 | Apache-2.0 | dependency |
| [color_quant](https://github.com/image-rs/color_quant.git) | 1.1.0 | MIT | dependency |
| [combine](https://github.com/Marwes/combine) | 4.6.7 | MIT | dependency |
| [comemo](https://github.com/typst/comemo) | 0.5.1 | MIT OR Apache-2.0 | dependency |
| [comemo-macros](https://github.com/typst/comemo) | 0.5.1 | MIT OR Apache-2.0 | dependency |
| [concurrent-queue](https://github.com/smol-rs/concurrent-queue) | 2.5.0 | Apache-2.0 OR MIT | dependency |
| [const-oid](https://github.com/RustCrypto/formats) | 0.10.2 | Apache-2.0 OR MIT | dependency |
| [constant_time_eq](https://github.com/cesarb/constant_time_eq) | 0.4.2 | CC0-1.0 OR MIT-0 OR Apache-2.0 | dependency |
| [cookie](https://github.com/SergioBenitez/cookie-rs) | 0.18.1 | MIT OR Apache-2.0 | dependency |
| [core_maths](https://github.com/robertbastian/core_maths) | 0.1.1 | MIT | dependency |
| [core-foundation](https://github.com/servo/core-foundation-rs) | 0.10.1 | MIT OR Apache-2.0 | dependency |
| [core-foundation-sys](https://github.com/servo/core-foundation-rs) | 0.8.7 | MIT OR Apache-2.0 | dependency |
| [core-graphics](https://github.com/servo/core-foundation-rs) | 0.25.0 | MIT OR Apache-2.0 | dependency |
| [core-graphics-types](https://github.com/servo/core-foundation-rs) | 0.2.0 | MIT OR Apache-2.0 | dependency |
| [cpubits](https://github.com/RustCrypto/utils) | 0.1.1 | MIT OR Apache-2.0 | dependency |
| [cpufeatures](https://github.com/RustCrypto/utils) | 0.2.17 | MIT OR Apache-2.0 | dependency |
| [cpufeatures](https://github.com/RustCrypto/utils) | 0.3.0 | MIT OR Apache-2.0 | dependency |
| [crc32fast](https://github.com/srijs/rust-crc32fast) | 1.5.0 | MIT OR Apache-2.0 | dependency |
| [crossbeam-channel](https://github.com/crossbeam-rs/crossbeam) | 0.5.15 | MIT OR Apache-2.0 | dependency |
| [crossbeam-deque](https://github.com/crossbeam-rs/crossbeam) | 0.8.6 | MIT OR Apache-2.0 | dependency |
| [crossbeam-epoch](https://github.com/crossbeam-rs/crossbeam) | 0.9.18 | MIT OR Apache-2.0 | dependency |
| [crossbeam-utils](https://github.com/crossbeam-rs/crossbeam) | 0.8.21 | MIT OR Apache-2.0 | dependency |
| [crunchy](https://github.com/eira-fransham/crunchy) | 0.2.4 | MIT | dependency |
| [crypto-common](https://github.com/RustCrypto/traits) | 0.1.7 | MIT OR Apache-2.0 | dependency |
| [crypto-common](https://github.com/RustCrypto/traits) | 0.2.2 | MIT OR Apache-2.0 | dependency |
| [cssparser](https://github.com/servo/rust-cssparser) | 0.36.0 | MPL-2.0 | dependency |
| [cssparser-macros](https://github.com/servo/rust-cssparser) | 0.6.1 | MPL-2.0 | dependency |
| [csv](https://github.com/BurntSushi/rust-csv) | 1.4.0 | Unlicense/MIT | dependency |
| [csv-core](https://github.com/BurntSushi/rust-csv) | 0.1.13 | Unlicense/MIT | dependency |
| [ctor](https://github.com/mmastrac/rust-ctor) | 0.8.0 | Apache-2.0 OR MIT | dependency |
| [ctor-proc-macro](https://github.com/mmastrac/rust-ctor) | 0.0.7 | Apache-2.0 OR MIT | dependency |
| [ctutils](https://github.com/RustCrypto/utils) | 0.4.2 | Apache-2.0 OR MIT | dependency |
| [darling](https://github.com/TedDriggs/darling) | 0.23.0 | MIT | dependency |
| [darling_core](https://github.com/TedDriggs/darling) | 0.23.0 | MIT | dependency |
| [darling_macro](https://github.com/TedDriggs/darling) | 0.23.0 | MIT | dependency |
| [data-url](https://github.com/servo/rust-url) | 0.3.2 | MIT OR Apache-2.0 | dependency |
| [dbus](https://github.com/diwic/dbus-rs) | 0.9.11 | Apache-2.0/MIT | dependency |
| [deranged](https://github.com/jhpratt/deranged) | 0.5.8 | MIT OR Apache-2.0 | dependency |
| [derive_more](https://github.com/JelteF/derive_more) | 2.1.1 | MIT | dependency |
| [derive_more-impl](https://github.com/JelteF/derive_more) | 2.1.1 | MIT | dependency |
| [digest](https://github.com/RustCrypto/traits) | 0.10.7 | MIT OR Apache-2.0 | dependency |
| [digest](https://github.com/RustCrypto/traits) | 0.11.3 | MIT OR Apache-2.0 | dependency |
| [dirs](https://github.com/soc/dirs-rs) | 6.0.0 | MIT OR Apache-2.0 | dependency |
| [dirs-sys](https://github.com/dirs-dev/dirs-sys-rs) | 0.5.0 | MIT OR Apache-2.0 | dependency |
| [dispatch2](https://github.com/madsmtm/objc2) | 0.3.1 | Zlib OR Apache-2.0 OR MIT | dependency |
| [displaydoc](https://github.com/yaahc/displaydoc) | 0.2.5 | MIT OR Apache-2.0 | dependency |
| [dlopen2](https://github.com/OpenByteDev/dlopen2) | 0.8.2 | MIT | dependency |
| [dlopen2_derive](https://github.com/OpenByteDev/dlopen2) | 0.4.3 | MIT | dependency |
| [dom_query](https://github.com/niklak/dom_query) | 0.27.0 | MIT | dependency |
| [dpi](https://github.com/rust-windowing/winit) | 0.1.2 | Apache-2.0 AND MIT | dependency |
| [dtoa](https://github.com/dtolnay/dtoa) | 1.0.11 | MIT OR Apache-2.0 | dependency |
| [dtoa-short](https://github.com/upsuper/dtoa-short) | 0.3.5 | MPL-2.0 | dependency |
| [dtor](https://github.com/mmastrac/rust-ctor) | 0.3.0 | Apache-2.0 OR MIT | dependency |
| [dtor-proc-macro](https://github.com/mmastrac/rust-ctor) | 0.0.6 | Apache-2.0 OR MIT | dependency |
| [dunce](https://gitlab.com/kornelski/dunce) | 1.0.5 | CC0-1.0 OR MIT-0 OR Apache-2.0 | dependency |
| [dyn-clone](https://github.com/dtolnay/dyn-clone) | 1.0.20 | MIT OR Apache-2.0 | dependency |
| [ecow](https://github.com/typst/ecow) | 0.2.7 | MIT OR Apache-2.0 | dependency |
| [either](https://github.com/rayon-rs/either) | 1.16.0 | MIT OR Apache-2.0 | dependency |
| [embed_plist](https://github.com/nvzqz/embed-plist-rs) | 1.2.2 | MIT OR Apache-2.0 | dependency |
| [embed-resource](https://github.com/nabijaczleweli/rust-embed-resource) | 3.0.9 | MIT | dependency |
| [embedded-io](https://github.com/embassy-rs/embedded-io) | 0.4.0 | MIT OR Apache-2.0 | dependency |
| [embedded-io](https://github.com/rust-embedded/embedded-hal) | 0.6.1 | MIT OR Apache-2.0 | dependency |
| [encoding_rs](https://github.com/hsivonen/encoding_rs) | 0.8.35 | (Apache-2.0 OR MIT) AND BSD-3-Clause | dependency |
| [encoding_rs_io](https://github.com/BurntSushi/encoding_rs_io) | 0.1.7 | MIT OR Apache-2.0 | dependency |
| [endi](https://github.com/zeenix/endi) | 1.1.1 | MIT | dependency |
| [enum-ordinalize](https://github.com/magiclen/enum-ordinalize) | 4.3.2 | MIT | dependency |
| [enum-ordinalize-derive](https://github.com/magiclen/enum-ordinalize) | 4.3.2 | MIT | dependency |
| [enumflags2](https://github.com/meithecatte/enumflags2) | 0.7.12 | MIT OR Apache-2.0 | dependency |
| [enumflags2_derive](https://github.com/meithecatte/enumflags2) | 0.7.12 | MIT OR Apache-2.0 | dependency |
| [equivalent](https://github.com/indexmap-rs/equivalent) | 1.0.2 | Apache-2.0 OR MIT | dependency |
| [erased-serde](https://github.com/dtolnay/erased-serde) | 0.4.10 | MIT OR Apache-2.0 | dependency |
| [errno](https://github.com/lambda-fairy/rust-errno) | 0.3.14 | MIT OR Apache-2.0 | dependency |
| [euclid](https://github.com/servo/euclid) | 0.22.14 | MIT OR Apache-2.0 | dependency |
| [event-listener](https://github.com/smol-rs/event-listener) | 5.4.2 | Apache-2.0 OR MIT | dependency |
| [event-listener-strategy](https://github.com/smol-rs/event-listener-strategy) | 0.5.4 | Apache-2.0 OR MIT | dependency |
| [fancy-regex](https://github.com/fancy-regex/fancy-regex) | 0.16.2 | MIT | dependency |
| [fast-srgb8](https://github.com/thomcc/fast-srgb8) | 1.0.0 | MIT OR Apache-2.0 OR CC0-1.0 | dependency |
| [fastrand](https://github.com/smol-rs/fastrand) | 2.4.1 | Apache-2.0 OR MIT | dependency |
| [fdeflate](https://github.com/image-rs/fdeflate) | 0.3.7 | MIT OR Apache-2.0 | dependency |
| [field-offset](https://github.com/Diggsey/rust-field-offset) | 0.3.6 | MIT OR Apache-2.0 | dependency |
| [filetime](https://github.com/alexcrichton/filetime) | 0.2.29 | MIT/Apache-2.0 | dependency |
| [find-msvc-tools](https://github.com/rust-lang/cc-rs) | 0.1.9 | MIT OR Apache-2.0 | dependency |
| [flate2](https://github.com/rust-lang/flate2-rs) | 1.1.9 | MIT OR Apache-2.0 | dependency |
| [float-cmp](https://github.com/mikedilger/float-cmp) | 0.10.0 | MIT | dependency |
| [float-cmp](https://github.com/mikedilger/float-cmp) | 0.9.0 | MIT | dependency |
| [fnv](https://github.com/servo/rust-fnv) | 1.0.7 | Apache-2.0 / MIT | dependency |
| [foldhash](https://github.com/orlp/foldhash) | 0.1.5 | Zlib | dependency |
| [foldhash](https://github.com/orlp/foldhash) | 0.2.0 | Zlib | dependency |
| [font-types](https://github.com/googlefonts/fontations) | 0.10.1 | MIT OR Apache-2.0 | dependency |
| [fontconfig-parser](https://github.com/Riey/fontconfig-parser) | 0.5.8 | MIT | dependency |
| [fontdb](https://github.com/RazrFalcon/fontdb) | 0.23.0 | MIT | dependency |
| [foreign-types](https://github.com/sfackler/foreign-types) | 0.5.0 | MIT/Apache-2.0 | dependency |
| [foreign-types-macros](https://github.com/sfackler/foreign-types) | 0.2.3 | MIT/Apache-2.0 | dependency |
| [foreign-types-shared](https://github.com/sfackler/foreign-types) | 0.3.1 | MIT/Apache-2.0 | dependency |
| [form_urlencoded](https://github.com/servo/rust-url) | 1.2.2 | MIT OR Apache-2.0 | dependency |
| [fsevent-sys](https://github.com/octplane/fsevent-rust/tree/master/fsevent-sys) | 4.1.0 | MIT | dependency |
| [futures-channel](https://github.com/rust-lang/futures-rs) | 0.3.32 | MIT OR Apache-2.0 | dependency |
| [futures-core](https://github.com/rust-lang/futures-rs) | 0.3.32 | MIT OR Apache-2.0 | dependency |
| [futures-executor](https://github.com/rust-lang/futures-rs) | 0.3.32 | MIT OR Apache-2.0 | dependency |
| [futures-io](https://github.com/rust-lang/futures-rs) | 0.3.32 | MIT OR Apache-2.0 | dependency |
| [futures-lite](https://github.com/smol-rs/futures-lite) | 2.6.1 | Apache-2.0 OR MIT | dependency |
| [futures-macro](https://github.com/rust-lang/futures-rs) | 0.3.32 | MIT OR Apache-2.0 | dependency |
| [futures-sink](https://github.com/rust-lang/futures-rs) | 0.3.32 | MIT OR Apache-2.0 | dependency |
| [futures-task](https://github.com/rust-lang/futures-rs) | 0.3.32 | MIT OR Apache-2.0 | dependency |
| [futures-util](https://github.com/rust-lang/futures-rs) | 0.3.32 | MIT OR Apache-2.0 | dependency |
| [gdk](https://github.com/gtk-rs/gtk3-rs) | 0.18.2 | MIT | dependency |
| [gdk-pixbuf](https://github.com/gtk-rs/gtk-rs-core) | 0.18.5 | MIT | dependency |
| [gdk-pixbuf-sys](https://github.com/gtk-rs/gtk-rs-core) | 0.18.0 | MIT | dependency |
| [gdk-sys](https://github.com/gtk-rs/gtk3-rs) | 0.18.2 | MIT | dependency |
| [gdkwayland-sys](https://github.com/gtk-rs/gtk3-rs) | 0.18.2 | MIT | dependency |
| [gdkx11](https://github.com/gtk-rs/gtk3-rs) | 0.18.2 | MIT | dependency |
| [gdkx11-sys](https://github.com/gtk-rs/gtk3-rs) | 0.18.2 | MIT | dependency |
| [generic-array](https://github.com/fizyk20/generic-array.git) | 0.14.7 | MIT | dependency |
| [getrandom](https://github.com/rust-random/getrandom) | 0.2.17 | MIT OR Apache-2.0 | dependency |
| [getrandom](https://github.com/rust-random/getrandom) | 0.3.4 | MIT OR Apache-2.0 | dependency |
| [getrandom](https://github.com/rust-random/getrandom) | 0.4.2 | MIT OR Apache-2.0 | dependency |
| [gif](https://github.com/image-rs/image-gif) | 0.13.3 | MIT OR Apache-2.0 | dependency |
| [gif](https://github.com/image-rs/image-gif) | 0.14.2 | MIT OR Apache-2.0 | dependency |
| [gio](https://github.com/gtk-rs/gtk-rs-core) | 0.18.4 | MIT | dependency |
| [gio-sys](https://github.com/gtk-rs/gtk-rs-core) | 0.18.1 | MIT | dependency |
| [glib](https://github.com/gtk-rs/gtk-rs-core) | 0.18.5 | MIT | dependency |
| [glib-macros](https://github.com/gtk-rs/gtk-rs-core) | 0.18.5 | MIT | dependency |
| [glib-sys](https://github.com/gtk-rs/gtk-rs-core) | 0.18.1 | MIT | dependency |
| [glidesort](https://github.com/orlp/glidesort) | 0.1.2 | MIT OR Apache-2.0 | dependency |
| [glob](https://github.com/rust-lang/glob) | 0.3.3 | MIT OR Apache-2.0 | dependency |
| [globset](https://github.com/BurntSushi/ripgrep/tree/master/crates/globset) | 0.4.18 | Unlicense OR MIT | dependency |
| [gobject-sys](https://github.com/gtk-rs/gtk-rs-core) | 0.18.0 | MIT | dependency |
| [grep-matcher](https://github.com/BurntSushi/ripgrep/tree/master/crates/matcher) | 0.1.8 | Unlicense OR MIT | dependency |
| [grep-regex](https://github.com/BurntSushi/ripgrep/tree/master/crates/regex) | 0.1.14 | Unlicense OR MIT | dependency |
| [grep-searcher](https://github.com/BurntSushi/ripgrep/tree/master/crates/searcher) | 0.1.16 | Unlicense OR MIT | dependency |
| [gtk](https://github.com/gtk-rs/gtk3-rs) | 0.18.2 | MIT | dependency |
| [gtk-sys](https://github.com/gtk-rs/gtk3-rs) | 0.18.2 | MIT | dependency |
| [gtk3-macros](https://github.com/gtk-rs/gtk3-rs) | 0.18.2 | MIT | dependency |
| [half](https://github.com/VoidStarKat/half-rs) | 2.7.1 | MIT OR Apache-2.0 | dependency |
| [hashbrown](https://github.com/rust-lang/hashbrown) | 0.12.3 | MIT OR Apache-2.0 | dependency |
| [hashbrown](https://github.com/rust-lang/hashbrown) | 0.15.5 | MIT OR Apache-2.0 | dependency |
| [hashbrown](https://github.com/rust-lang/hashbrown) | 0.17.1 | MIT OR Apache-2.0 | dependency |
| [hayagriva](https://github.com/typst/hayagriva) | 0.9.1 | MIT OR Apache-2.0 | dependency |
| [hayro](https://github.com/LaurenzV/hayro) | 0.4.0 | Apache-2.0 | dependency |
| [hayro-font](https://github.com/LaurenzV/hayro) | 0.3.0 | Apache-2.0 | dependency |
| [hayro-interpret](https://github.com/LaurenzV/hayro) | 0.4.0 | Apache-2.0 | dependency |
| [hayro-svg](https://github.com/LaurenzV/hayro) | 0.2.0 | Apache-2.0 | dependency |
| [hayro-syntax](https://github.com/LaurenzV/hayro) | 0.4.0 | Apache-2.0 | dependency |
| [hayro-write](https://github.com/LaurenzV/hayro) | 0.3.0 | Apache-2.0 | dependency |
| [heck](https://github.com/withoutboats/heck) | 0.4.1 | MIT OR Apache-2.0 | dependency |
| [heck](https://github.com/withoutboats/heck) | 0.5.0 | MIT OR Apache-2.0 | dependency |
| [hermit-abi](https://github.com/hermit-os/hermit-rs) | 0.5.2 | MIT OR Apache-2.0 | dependency |
| [hex](https://github.com/KokaKiwi/rust-hex) | 0.4.3 | MIT OR Apache-2.0 | dependency |
| [hmac](https://github.com/RustCrypto/MACs) | 0.13.0 | MIT OR Apache-2.0 | dependency |
| [html5ever](https://github.com/servo/html5ever) | 0.38.0 | MIT OR Apache-2.0 | dependency |
| [http](https://github.com/hyperium/http) | 1.4.0 | MIT OR Apache-2.0 | dependency |
| [http-body](https://github.com/hyperium/http-body) | 1.0.1 | MIT | dependency |
| [http-body-util](https://github.com/hyperium/http-body) | 0.1.3 | MIT | dependency |
| [httparse](https://github.com/seanmonstar/httparse) | 1.10.1 | MIT OR Apache-2.0 | dependency |
| [hybrid-array](https://github.com/RustCrypto/hybrid-array) | 0.4.13 | MIT OR Apache-2.0 | dependency |
| [hyper](https://github.com/hyperium/hyper) | 1.9.0 | MIT | dependency |
| [hyper-util](https://github.com/hyperium/hyper-util) | 0.1.20 | MIT | dependency |
| [hypher](https://github.com/typst/hypher) | 0.1.7 | MIT OR Apache-2.0 | dependency |
| [iana-time-zone](https://github.com/strawlab/iana-time-zone) | 0.1.65 | MIT OR Apache-2.0 | dependency |
| [iana-time-zone-haiku](https://github.com/strawlab/iana-time-zone) | 0.1.2 | MIT OR Apache-2.0 | dependency |
| [ico](https://github.com/mdsteele/rust-ico) | 0.5.0 | MIT | dependency |
| [icu_collections](https://github.com/unicode-org/icu4x) | 1.5.0 | Unicode-3.0 | dependency |
| [icu_collections](https://github.com/unicode-org/icu4x) | 2.2.0 | Unicode-3.0 | dependency |
| [icu_locale_core](https://github.com/unicode-org/icu4x) | 2.2.0 | Unicode-3.0 | dependency |
| [icu_locid](https://github.com/unicode-org/icu4x) | 1.5.0 | Unicode-3.0 | dependency |
| [icu_locid_transform](https://github.com/unicode-org/icu4x) | 1.5.0 | Unicode-3.0 | dependency |
| [icu_locid_transform_data](https://github.com/unicode-org/icu4x) | 1.5.1 | Unicode-3.0 | dependency |
| [icu_normalizer](https://github.com/unicode-org/icu4x) | 2.2.0 | Unicode-3.0 | dependency |
| [icu_normalizer_data](https://github.com/unicode-org/icu4x) | 2.2.0 | Unicode-3.0 | dependency |
| [icu_properties](https://github.com/unicode-org/icu4x) | 1.5.1 | Unicode-3.0 | dependency |
| [icu_properties](https://github.com/unicode-org/icu4x) | 2.2.0 | Unicode-3.0 | dependency |
| [icu_properties_data](https://github.com/unicode-org/icu4x) | 1.5.1 | Unicode-3.0 | dependency |
| [icu_properties_data](https://github.com/unicode-org/icu4x) | 2.2.0 | Unicode-3.0 | dependency |
| [icu_provider](https://github.com/unicode-org/icu4x) | 1.5.0 | Unicode-3.0 | dependency |
| [icu_provider](https://github.com/unicode-org/icu4x) | 2.2.0 | Unicode-3.0 | dependency |
| [icu_provider_adapters](https://github.com/unicode-org/icu4x) | 1.5.0 | Unicode-3.0 | dependency |
| [icu_provider_blob](https://github.com/unicode-org/icu4x) | 1.5.0 | Unicode-3.0 | dependency |
| [icu_provider_macros](https://github.com/unicode-org/icu4x) | 1.5.0 | Unicode-3.0 | dependency |
| [icu_segmenter](https://github.com/unicode-org/icu4x) | 1.5.0 | Unicode-3.0 | dependency |
| [icu_segmenter_data](https://github.com/unicode-org/icu4x) | 1.5.1 | Unicode-3.0 | dependency |
| [id-arena](https://github.com/fitzgen/id-arena) | 2.3.0 | MIT/Apache-2.0 | dependency |
| [ident_case](https://github.com/TedDriggs/ident_case) | 1.0.1 | MIT/Apache-2.0 | dependency |
| [idna](https://github.com/servo/rust-url/) | 1.1.0 | MIT OR Apache-2.0 | dependency |
| [idna_adapter](https://github.com/hsivonen/idna_adapter) | 1.2.2 | Apache-2.0 OR MIT | dependency |
| [ignore](https://github.com/BurntSushi/ripgrep/tree/master/crates/ignore) | 0.4.25 | Unlicense OR MIT | dependency |
| [image](https://github.com/image-rs/image) | 0.25.10 | MIT OR Apache-2.0 | dependency |
| [image-webp](https://github.com/image-rs/image-webp) | 0.2.4 | MIT OR Apache-2.0 | dependency |
| [imagesize](https://github.com/Roughsketch/imagesize) | 0.13.0 | MIT | dependency |
| [imagesize](https://github.com/Roughsketch/imagesize) | 0.14.0 | MIT | dependency |
| [indexmap](https://github.com/bluss/indexmap) | 1.9.3 | Apache-2.0 OR MIT | dependency |
| [indexmap](https://github.com/indexmap-rs/indexmap) | 2.14.0 | Apache-2.0 OR MIT | dependency |
| [infer](https://github.com/bojand/infer) | 0.19.0 | MIT | dependency |
| [inotify](https://github.com/hannobraun/inotify) | 0.11.1 | ISC | dependency |
| [inotify-sys](https://github.com/hannobraun/inotify-sys) | 0.1.5 | ISC | dependency |
| [inout](https://github.com/RustCrypto/utils) | 0.2.2 | MIT OR Apache-2.0 | dependency |
| [ipnet](https://github.com/krisprice/ipnet) | 2.12.0 | MIT OR Apache-2.0 | dependency |
| [is-docker](https://github.com/TheLarkInn/is-docker) | 0.2.0 | MIT | dependency |
| [is-wsl](https://github.com/TheLarkInn/is-wsl) | 0.4.0 | MIT | dependency |
| [itoa](https://github.com/dtolnay/itoa) | 1.0.18 | MIT OR Apache-2.0 | dependency |
| [javascriptcore-rs](https://github.com/tauri-apps/javascriptcore-rs) | 1.1.2 | MIT | dependency |
| [javascriptcore-rs-sys](https://github.com/tauri-apps/javascriptcore-rs) | 1.1.1 | MIT | dependency |
| [jni](https://github.com/jni-rs/jni-rs) | 0.21.1 | MIT/Apache-2.0 | dependency |
| [jni-sys](https://github.com/jni-rs/jni-sys) | 0.3.1 | MIT OR Apache-2.0 | dependency |
| [jni-sys](https://github.com/jni-rs/jni-sys) | 0.4.1 | MIT OR Apache-2.0 | dependency |
| [jni-sys-macros](https://github.com/jni-rs/jni-sys) | 0.4.1 | MIT OR Apache-2.0 | dependency |
| [js-sys](https://github.com/wasm-bindgen/wasm-bindgen/tree/master/crates/js-sys) | 0.3.99 | MIT OR Apache-2.0 | dependency |
| [json-patch](https://github.com/idubrov/json-patch) | 3.0.1 | MIT/Apache-2.0 | dependency |
| [jsonptr](https://github.com/chanced/jsonptr) | 0.6.3 | MIT OR Apache-2.0 | dependency |
| [kamadak-exif](https://github.com/kamadak/exif-rs) | 0.6.1 | BSD-2-Clause | dependency |
| [keyboard-types](https://github.com/pyfisch/keyboard-types) | 0.7.0 | MIT OR Apache-2.0 | dependency |
| [kqueue](https://gitlab.com/rust-kqueue/rust-kqueue) | 1.1.1 | MIT | dependency |
| [kqueue-sys](https://gitlab.com/rust-kqueue/rust-kqueue-sys) | 1.1.2 | MIT | dependency |
| [krilla](https://github.com/LaurenzV/krilla) | 0.6.0 | MIT OR Apache-2.0 | dependency |
| [krilla-svg](https://github.com/LaurenzV/krilla) | 0.3.0 | MIT OR Apache-2.0 | dependency |
| [kurbo](https://github.com/linebender/kurbo) | 0.11.3 | Apache-2.0 OR MIT | dependency |
| [kurbo](https://github.com/linebender/kurbo) | 0.12.0 | Apache-2.0 OR MIT | dependency |
| [leb128fmt](https://github.com/bluk/leb128fmt) | 0.1.0 | MIT OR Apache-2.0 | dependency |
| [libappindicator](https://crates.io/crates/libappindicator) | 0.9.0 | Apache-2.0 OR MIT | dependency |
| [libappindicator-sys](https://crates.io/crates/libappindicator-sys) | 0.9.0 | Apache-2.0 OR MIT | dependency |
| [libc](https://github.com/rust-lang/libc) | 0.2.186 | MIT OR Apache-2.0 | dependency |
| [libdbus-sys](https://github.com/diwic/dbus-rs) | 0.2.7 | Apache-2.0/MIT | dependency |
| [libloading](https://github.com/nagisa/rust_libloading/) | 0.7.4 | ISC | dependency |
| [libm](https://github.com/rust-lang/compiler-builtins) | 0.2.16 | MIT | dependency |
| [libredox](https://gitlab.redox-os.org/redox-os/libredox.git) | 0.1.16 | MIT | dependency |
| [linked-hash-map](https://github.com/contain-rs/linked-hash-map) | 0.5.6 | MIT/Apache-2.0 | dependency |
| [linux-raw-sys](https://github.com/sunfishcode/linux-raw-sys) | 0.11.0 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT | dependency |
| [lipsum](https://github.com/mgeisler/lipsum/) | 0.9.1 | MIT | dependency |
| [litemap](https://github.com/unicode-org/icu4x) | 0.7.5 | Unicode-3.0 | dependency |
| [litemap](https://github.com/unicode-org/icu4x) | 0.8.2 | Unicode-3.0 | dependency |
| [lock_api](https://github.com/Amanieu/parking_lot) | 0.4.14 | MIT OR Apache-2.0 | dependency |
| [log](https://github.com/rust-lang/log) | 0.4.29 | MIT OR Apache-2.0 | dependency |
| [markup5ever](https://github.com/servo/html5ever) | 0.38.0 | MIT OR Apache-2.0 | dependency |
| [memchr](https://github.com/BurntSushi/memchr) | 2.8.0 | Unlicense OR MIT | dependency |
| [memmap2](https://github.com/RazrFalcon/memmap2-rs) | 0.9.10 | MIT OR Apache-2.0 | dependency |
| [memoffset](https://github.com/Gilnaa/memoffset) | 0.9.1 | MIT | dependency |
| [mime](https://github.com/hyperium/mime) | 0.3.17 | MIT OR Apache-2.0 | dependency |
| [miniz_oxide](https://github.com/Frommi/miniz_oxide/tree/master/miniz_oxide) | 0.8.9 | MIT OR Zlib OR Apache-2.0 | dependency |
| [mio](https://github.com/tokio-rs/mio) | 1.2.0 | MIT | dependency |
| [moxcms](https://github.com/awxkee/moxcms.git) | 0.7.11 | BSD-3-Clause OR Apache-2.0 | dependency |
| [moxcms](https://github.com/awxkee/moxcms.git) | 0.8.1 | BSD-3-Clause OR Apache-2.0 | dependency |
| [muda](https://github.com/tauri-apps/muda) | 0.19.2 | Apache-2.0 OR MIT | dependency |
| [mutate_once](https://github.com/kamadak/mutate_once-rs) | 0.1.2 | BSD-2-Clause | dependency |
| [ndk](https://github.com/rust-mobile/ndk) | 0.9.0 | MIT OR Apache-2.0 | dependency |
| [ndk-sys](https://github.com/rust-mobile/ndk) | 0.6.0+11769913 | MIT OR Apache-2.0 | dependency |
| [new_debug_unreachable](https://github.com/mbrubeck/rust-debug-unreachable) | 1.0.6 | MIT | dependency |
| [notify](https://github.com/notify-rs/notify.git) | 8.2.0 | CC0-1.0 | dependency |
| [notify-types](https://github.com/notify-rs/notify.git) | 2.1.0 | MIT OR Apache-2.0 | dependency |
| [num_enum](https://github.com/illicitonion/num_enum) | 0.7.6 | BSD-3-Clause OR MIT OR Apache-2.0 | dependency |
| [num_enum_derive](https://github.com/illicitonion/num_enum) | 0.7.6 | BSD-3-Clause OR MIT OR Apache-2.0 | dependency |
| [num-bigint](https://github.com/rust-num/num-bigint) | 0.4.6 | MIT OR Apache-2.0 | dependency |
| [num-conv](https://github.com/jhpratt/num-conv) | 0.2.2 | MIT OR Apache-2.0 | dependency |
| [num-integer](https://github.com/rust-num/num-integer) | 0.1.46 | MIT OR Apache-2.0 | dependency |
| [num-traits](https://github.com/rust-num/num-traits) | 0.2.19 | MIT OR Apache-2.0 | dependency |
| [objc2](https://github.com/madsmtm/objc2) | 0.6.4 | MIT | dependency |
| [objc2-app-kit](https://github.com/madsmtm/objc2) | 0.3.2 | Zlib OR Apache-2.0 OR MIT | dependency |
| [objc2-cloud-kit](https://github.com/madsmtm/objc2) | 0.3.2 | Zlib OR Apache-2.0 OR MIT | dependency |
| [objc2-core-data](https://github.com/madsmtm/objc2) | 0.3.2 | Zlib OR Apache-2.0 OR MIT | dependency |
| [objc2-core-foundation](https://github.com/madsmtm/objc2) | 0.3.2 | Zlib OR Apache-2.0 OR MIT | dependency |
| [objc2-core-graphics](https://github.com/madsmtm/objc2) | 0.3.2 | Zlib OR Apache-2.0 OR MIT | dependency |
| [objc2-core-image](https://github.com/madsmtm/objc2) | 0.3.2 | Zlib OR Apache-2.0 OR MIT | dependency |
| [objc2-core-location](https://github.com/madsmtm/objc2) | 0.3.2 | Zlib OR Apache-2.0 OR MIT | dependency |
| [objc2-core-text](https://github.com/madsmtm/objc2) | 0.3.2 | Zlib OR Apache-2.0 OR MIT | dependency |
| [objc2-encode](https://github.com/madsmtm/objc2) | 4.1.0 | MIT | dependency |
| [objc2-exception-helper](https://github.com/madsmtm/objc2) | 0.1.1 | Zlib OR Apache-2.0 OR MIT | dependency |
| [objc2-foundation](https://github.com/madsmtm/objc2) | 0.3.2 | MIT | dependency |
| [objc2-io-surface](https://github.com/madsmtm/objc2) | 0.3.2 | Zlib OR Apache-2.0 OR MIT | dependency |
| [objc2-quartz-core](https://github.com/madsmtm/objc2) | 0.3.2 | Zlib OR Apache-2.0 OR MIT | dependency |
| [objc2-ui-kit](https://github.com/madsmtm/objc2) | 0.3.2 | Zlib OR Apache-2.0 OR MIT | dependency |
| [objc2-user-notifications](https://github.com/madsmtm/objc2) | 0.3.2 | Zlib OR Apache-2.0 OR MIT | dependency |
| [objc2-web-kit](https://github.com/madsmtm/objc2) | 0.3.2 | Zlib OR Apache-2.0 OR MIT | dependency |
| [object](https://github.com/gimli-rs/object) | 0.37.3 | Apache-2.0 OR MIT | dependency |
| [once_cell](https://github.com/matklad/once_cell) | 1.21.4 | MIT OR Apache-2.0 | dependency |
| [open](https://github.com/Byron/open-rs) | 5.4.2 | MIT | dependency |
| [option-ext](https://github.com/soc/option-ext.git) | 0.2.0 | MPL-2.0 | dependency |
| [ordered-stream](https://github.com/danieldg/ordered-stream) | 0.2.0 | MIT OR Apache-2.0 | dependency |
| [palette](https://github.com/Ogeon/palette) | 0.7.6 | MIT OR Apache-2.0 | dependency |
| [palette_derive](https://github.com/Ogeon/palette) | 0.7.6 | MIT OR Apache-2.0 | dependency |
| [pango](https://github.com/gtk-rs/gtk-rs-core) | 0.18.3 | MIT | dependency |
| [pango-sys](https://github.com/gtk-rs/gtk-rs-core) | 0.18.0 | MIT | dependency |
| [parking](https://github.com/smol-rs/parking) | 2.2.1 | Apache-2.0 OR MIT | dependency |
| [parking_lot](https://github.com/Amanieu/parking_lot) | 0.12.5 | MIT OR Apache-2.0 | dependency |
| [parking_lot_core](https://github.com/Amanieu/parking_lot) | 0.9.12 | MIT OR Apache-2.0 | dependency |
| [paste](https://github.com/dtolnay/paste) | 1.0.15 | MIT OR Apache-2.0 | dependency |
| [pbkdf2](https://github.com/RustCrypto/password-hashes) | 0.13.0 | MIT OR Apache-2.0 | dependency |
| [pdf-writer](https://github.com/typst/pdf-writer) | 0.14.0 | MIT OR Apache-2.0 | dependency |
| [percent-encoding](https://github.com/servo/rust-url/) | 2.3.2 | MIT OR Apache-2.0 | dependency |
| [phf](https://github.com/rust-phf/rust-phf) | 0.13.1 | MIT | dependency |
| [phf_codegen](https://github.com/rust-phf/rust-phf) | 0.13.1 | MIT | dependency |
| [phf_generator](https://github.com/rust-phf/rust-phf) | 0.13.1 | MIT | dependency |
| [phf_macros](https://github.com/rust-phf/rust-phf) | 0.13.1 | MIT | dependency |
| [phf_shared](https://github.com/rust-phf/rust-phf) | 0.13.1 | MIT | dependency |
| [pico-args](https://github.com/RazrFalcon/pico-args) | 0.5.0 | MIT | dependency |
| [pin-project-lite](https://github.com/taiki-e/pin-project-lite) | 0.2.17 | Apache-2.0 OR MIT | dependency |
| [piper](https://github.com/smol-rs/piper) | 0.2.5 | MIT OR Apache-2.0 | dependency |
| [pkg-config](https://github.com/rust-lang/pkg-config-rs) | 0.3.33 | MIT OR Apache-2.0 | dependency |
| [plist](https://github.com/ebarnard/rust-plist/) | 1.9.0 | MIT | dependency |
| [png](https://github.com/image-rs/image-png) | 0.17.16 | MIT OR Apache-2.0 | dependency |
| [png](https://github.com/image-rs/image-png) | 0.18.1 | MIT OR Apache-2.0 | dependency |
| [polling](https://github.com/smol-rs/polling) | 3.11.0 | Apache-2.0 OR MIT | dependency |
| [portable-atomic](https://github.com/taiki-e/portable-atomic) | 1.13.1 | Apache-2.0 OR MIT | dependency |
| [postcard](https://github.com/jamesmunns/postcard) | 1.1.3 | MIT OR Apache-2.0 | dependency |
| [potential_utf](https://github.com/unicode-org/icu4x) | 0.1.5 | Unicode-3.0 | dependency |
| [powerfmt](https://github.com/jhpratt/powerfmt) | 0.2.0 | MIT OR Apache-2.0 | dependency |
| [ppv-lite86](https://github.com/cryptocorrosion/cryptocorrosion) | 0.2.21 | MIT OR Apache-2.0 | dependency |
| [precomputed-hash](https://github.com/emilio/precomputed-hash) | 0.1.1 | MIT | dependency |
| [prettyplease](https://github.com/dtolnay/prettyplease) | 0.2.37 | MIT OR Apache-2.0 | dependency |
| [proc-macro-crate](https://github.com/bkchr/proc-macro-crate) | 1.3.1 | MIT OR Apache-2.0 | dependency |
| [proc-macro-crate](https://github.com/bkchr/proc-macro-crate) | 2.0.2 | MIT OR Apache-2.0 | dependency |
| [proc-macro-crate](https://github.com/bkchr/proc-macro-crate) | 3.5.0 | MIT OR Apache-2.0 | dependency |
| [proc-macro-error](https://gitlab.com/CreepySkeleton/proc-macro-error) | 1.0.4 | MIT OR Apache-2.0 | dependency |
| [proc-macro-error-attr](https://gitlab.com/CreepySkeleton/proc-macro-error) | 1.0.4 | MIT OR Apache-2.0 | dependency |
| [proc-macro-hack](https://github.com/dtolnay/proc-macro-hack) | 0.5.20+deprecated | MIT OR Apache-2.0 | dependency |
| [proc-macro2](https://github.com/dtolnay/proc-macro2) | 1.0.106 | MIT OR Apache-2.0 | dependency |
| [psm](https://github.com/rust-lang/stacker/) | 0.1.31 | MIT OR Apache-2.0 | dependency |
| [pxfm](https://github.com/awxkee/pxfm) | 0.1.29 | BSD-3-Clause OR Apache-2.0 | dependency |
| [qcms](https://github.com/FirefoxGraphics/qcms) | 0.3.0 | MIT | dependency |
| [quick-error](http://github.com/tailhook/quick-error) | 2.0.1 | MIT/Apache-2.0 | dependency |
| [quick-xml](https://github.com/tafia/quick-xml) | 0.38.4 | MIT | dependency |
| [quick-xml](https://github.com/tafia/quick-xml) | 0.39.4 | MIT | dependency |
| [quote](https://github.com/dtolnay/quote) | 1.0.45 | MIT OR Apache-2.0 | dependency |
| [r-efi](https://github.com/r-efi/r-efi) | 5.3.0 | MIT OR Apache-2.0 OR LGPL-2.1-or-later | dependency |
| [r-efi](https://github.com/r-efi/r-efi) | 6.0.0 | MIT OR Apache-2.0 OR LGPL-2.1-or-later | dependency |
| [rand](https://github.com/rust-random/rand) | 0.8.6 | MIT OR Apache-2.0 | dependency |
| [rand_chacha](https://github.com/rust-random/rand) | 0.3.1 | MIT OR Apache-2.0 | dependency |
| [rand_core](https://github.com/rust-random/rand) | 0.6.4 | MIT OR Apache-2.0 | dependency |
| [raw-window-handle](https://github.com/rust-windowing/raw-window-handle) | 0.6.2 | MIT OR Apache-2.0 OR Zlib | dependency |
| [rayon](https://github.com/rayon-rs/rayon) | 1.12.0 | MIT OR Apache-2.0 | dependency |
| [rayon-core](https://github.com/rayon-rs/rayon) | 1.13.0 | MIT OR Apache-2.0 | dependency |
| [read-fonts](https://github.com/googlefonts/fontations) | 0.35.0 | MIT OR Apache-2.0 | dependency |
| [redox_syscall](https://gitlab.redox-os.org/redox-os/syscall) | 0.5.18 | MIT | dependency |
| [redox_users](https://gitlab.redox-os.org/redox-os/users) | 0.5.2 | MIT | dependency |
| [ref-cast](https://github.com/dtolnay/ref-cast) | 1.0.25 | MIT OR Apache-2.0 | dependency |
| [ref-cast-impl](https://github.com/dtolnay/ref-cast) | 1.0.25 | MIT OR Apache-2.0 | dependency |
| [regex](https://github.com/rust-lang/regex) | 1.12.3 | MIT OR Apache-2.0 | dependency |
| [regex-automata](https://github.com/rust-lang/regex) | 0.4.14 | MIT OR Apache-2.0 | dependency |
| [regex-syntax](https://github.com/rust-lang/regex) | 0.8.10 | MIT OR Apache-2.0 | dependency |
| [reqwest](https://github.com/seanmonstar/reqwest) | 0.13.3 | MIT OR Apache-2.0 | dependency |
| [resvg](https://github.com/linebender/resvg) | 0.45.1 | Apache-2.0 OR MIT | dependency |
| [rfd](https://github.com/PolyMeilex/rfd) | 0.16.0 | MIT | dependency |
| [rgb](https://github.com/kornelski/rust-rgb) | 0.8.53 | MIT | dependency |
| [ring](https://github.com/briansmith/ring) | 0.17.14 | Apache-2.0 AND ISC | dependency |
| [roman-numerals-rs](https://github.com/AA-Turner/roman-numerals/) | 3.1.0 | 0BSD OR CC0-1.0 | dependency |
| [roxmltree](https://github.com/RazrFalcon/roxmltree) | 0.20.0 | MIT OR Apache-2.0 | dependency |
| [rust_decimal](https://github.com/paupino/rust-decimal) | 1.42.0 | MIT | dependency |
| [rustc_version](https://github.com/djc/rustc-version-rs) | 0.4.1 | MIT OR Apache-2.0 | dependency |
| [rustc-hash](https://github.com/rust-lang/rustc-hash) | 2.1.2 | Apache-2.0 OR MIT | dependency |
| [rustix](https://github.com/bytecodealliance/rustix) | 1.1.3 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT | dependency |
| [rustls](https://github.com/rustls/rustls) | 0.23.40 | Apache-2.0 OR ISC OR MIT | dependency |
| [rustls-pki-types](https://github.com/rustls/pki-types) | 1.14.1 | MIT OR Apache-2.0 | dependency |
| [rustls-webpki](https://github.com/rustls/webpki) | 0.103.13 | ISC | dependency |
| [rustversion](https://github.com/dtolnay/rustversion) | 1.0.22 | MIT OR Apache-2.0 | dependency |
| [rustybuzz](https://github.com/harfbuzz/rustybuzz) | 0.20.1 | MIT | dependency |
| [ryu](https://github.com/dtolnay/ryu) | 1.0.23 | Apache-2.0 OR BSL-1.0 | dependency |
| [same-file](https://github.com/BurntSushi/same-file) | 1.0.6 | Unlicense/MIT | dependency |
| [schemars](https://github.com/GREsau/schemars) | 0.8.22 | MIT | dependency |
| [schemars](https://github.com/GREsau/schemars) | 0.9.0 | MIT | dependency |
| [schemars](https://github.com/GREsau/schemars) | 1.2.1 | MIT | dependency |
| [schemars_derive](https://github.com/GREsau/schemars) | 0.8.22 | MIT | dependency |
| [scopeguard](https://github.com/bluss/scopeguard) | 1.2.0 | MIT OR Apache-2.0 | dependency |
| [selectors](https://github.com/servo/stylo) | 0.36.1 | MPL-2.0 | dependency |
| [semver](https://github.com/dtolnay/semver) | 1.0.28 | MIT OR Apache-2.0 | dependency |
| [serde](https://github.com/serde-rs/serde) | 1.0.228 | MIT OR Apache-2.0 | dependency |
| [serde_core](https://github.com/serde-rs/serde) | 1.0.228 | MIT OR Apache-2.0 | dependency |
| [serde_derive](https://github.com/serde-rs/serde) | 1.0.228 | MIT OR Apache-2.0 | dependency |
| [serde_derive_internals](https://github.com/serde-rs/serde) | 0.29.1 | MIT OR Apache-2.0 | dependency |
| [serde_json](https://github.com/serde-rs/json) | 1.0.150 | MIT OR Apache-2.0 | dependency |
| [serde_repr](https://github.com/dtolnay/serde-repr) | 0.1.20 | MIT OR Apache-2.0 | dependency |
| [serde_spanned](https://github.com/toml-rs/toml) | 0.6.9 | MIT OR Apache-2.0 | dependency |
| [serde_spanned](https://github.com/toml-rs/toml) | 1.1.1 | MIT OR Apache-2.0 | dependency |
| [serde_with](https://github.com/jonasbb/serde_with/) | 3.20.0 | MIT OR Apache-2.0 | dependency |
| [serde_with_macros](https://github.com/jonasbb/serde_with/) | 3.20.0 | MIT OR Apache-2.0 | dependency |
| [serde_yaml](https://github.com/dtolnay/serde-yaml) | 0.9.34+deprecated | MIT OR Apache-2.0 | dependency |
| [serde-untagged](https://github.com/dtolnay/serde-untagged) | 0.1.9 | MIT OR Apache-2.0 | dependency |
| [serialize-to-javascript](https://github.com/chippers/serialize-to-javascript) | 0.1.2 | MIT OR Apache-2.0 | dependency |
| [serialize-to-javascript-impl](https://github.com/chippers/serialize-to-javascript) | 0.1.2 | MIT OR Apache-2.0 | dependency |
| [servo_arc](https://github.com/servo/stylo) | 0.4.3 | MIT OR Apache-2.0 | dependency |
| [sha1](https://github.com/RustCrypto/hashes) | 0.11.0 | MIT OR Apache-2.0 | dependency |
| [sha2](https://github.com/RustCrypto/hashes) | 0.10.9 | MIT OR Apache-2.0 | dependency |
| [shlex](https://github.com/comex/rust-shlex) | 1.3.0 | MIT OR Apache-2.0 | dependency |
| [signal-hook-registry](https://github.com/vorner/signal-hook) | 1.4.8 | MIT OR Apache-2.0 | dependency |
| [simd-adler32](https://github.com/mcountryman/simd-adler32) | 0.3.9 | MIT | dependency |
| [simplecss](https://github.com/linebender/simplecss) | 0.2.2 | Apache-2.0 OR MIT | dependency |
| [siphasher](https://github.com/jedisct1/rust-siphash) | 1.0.3 | MIT/Apache-2.0 | dependency |
| [skrifa](https://github.com/googlefonts/fontations) | 0.37.0 | MIT OR Apache-2.0 | dependency |
| [slab](https://github.com/tokio-rs/slab) | 0.4.12 | MIT | dependency |
| [slotmap](https://github.com/orlp/slotmap) | 1.1.1 | Zlib | dependency |
| [smallvec](https://github.com/servo/rust-smallvec) | 1.15.1 | MIT OR Apache-2.0 | dependency |
| [socket2](https://github.com/rust-lang/socket2) | 0.6.3 | MIT OR Apache-2.0 | dependency |
| [softbuffer](https://github.com/rust-windowing/softbuffer) | 0.4.8 | MIT OR Apache-2.0 | dependency |
| [soup3](https://gitlab.gnome.org/World/Rust/soup3-rs) | 0.5.0 | MIT | dependency |
| [soup3-sys](https://gitlab.gnome.org/World/Rust/soup3-rs) | 0.5.0 | MIT | dependency |
| [spin](https://github.com/mvdnes/spin-rs.git) | 0.9.8 | MIT | dependency |
| [stable_deref_trait](https://github.com/storyyeller/stable_deref_trait) | 1.2.1 | MIT OR Apache-2.0 | dependency |
| [stacker](https://github.com/rust-lang/stacker) | 0.1.24 | MIT OR Apache-2.0 | dependency |
| [strict-num](https://github.com/RazrFalcon/strict-num) | 0.1.1 | MIT | dependency |
| [string_cache](https://github.com/servo/string-cache) | 0.9.0 | MIT OR Apache-2.0 | dependency |
| [string_cache_codegen](https://github.com/servo/string-cache) | 0.6.1 | MIT OR Apache-2.0 | dependency |
| [strsim](https://github.com/rapidfuzz/strsim-rs) | 0.11.1 | MIT | dependency |
| [strum](https://github.com/Peternator7/strum) | 0.27.2 | MIT | dependency |
| [strum_macros](https://github.com/Peternator7/strum) | 0.27.2 | MIT | dependency |
| [subsetter](https://github.com/typst/subsetter) | 0.2.3 | MIT OR Apache-2.0 | dependency |
| [subtle](https://github.com/dalek-cryptography/subtle) | 2.6.1 | BSD-3-Clause | dependency |
| [svgtypes](https://github.com/linebender/svgtypes) | 0.15.3 | Apache-2.0 OR MIT | dependency |
| [swift-rs](https://github.com/Brendonovich/swift-rs) | 1.0.7 | MIT OR Apache-2.0 | dependency |
| [syn](https://github.com/dtolnay/syn) | 1.0.109 | MIT OR Apache-2.0 | dependency |
| [syn](https://github.com/dtolnay/syn) | 2.0.117 | MIT OR Apache-2.0 | dependency |
| [syn](https://github.com/dtolnay/syn) | 3.0.4 | MIT OR Apache-2.0 | dependency |
| [sync_wrapper](https://github.com/Actyx/sync_wrapper) | 1.0.2 | Apache-2.0 | dependency |
| [synstructure](https://github.com/mystor/synstructure) | 0.13.2 | MIT | dependency |
| [syntect](https://github.com/trishume/syntect) | 5.3.0 | MIT | dependency |
| [system-deps](https://github.com/gdesmott/system-deps) | 6.2.2 | MIT OR Apache-2.0 | dependency |
| [tao](https://github.com/tauri-apps/tao) | 0.35.3 | Apache-2.0 | dependency |
| [tao-macros](https://github.com/tauri-apps/tao) | 0.1.3 | MIT OR Apache-2.0 | dependency |
| [target-lexicon](https://github.com/bytecodealliance/target-lexicon) | 0.12.16 | Apache-2.0 WITH LLVM-exception | dependency |
| [tauri](https://github.com/tauri-apps/tauri) | 2.11.2 | Apache-2.0 OR MIT | dependency |
| [tauri-build](https://github.com/tauri-apps/tauri) | 2.6.2 | Apache-2.0 OR MIT | dependency |
| [tauri-codegen](https://github.com/tauri-apps/tauri) | 2.6.2 | Apache-2.0 OR MIT | dependency |
| [tauri-macros](https://github.com/tauri-apps/tauri) | 2.6.2 | Apache-2.0 OR MIT | dependency |
| [tauri-plugin](https://github.com/tauri-apps/tauri) | 2.6.3 | Apache-2.0 OR MIT | dependency |
| [tauri-plugin-dialog](https://github.com/tauri-apps/plugins-workspace) | 2.7.3 | Apache-2.0 OR MIT | dependency |
| [tauri-plugin-fs](https://github.com/tauri-apps/plugins-workspace) | 2.5.2 | Apache-2.0 OR MIT | dependency |
| [tauri-plugin-opener](https://github.com/tauri-apps/plugins-workspace) | 2.5.4 | Apache-2.0 OR MIT | dependency |
| [tauri-runtime](https://github.com/tauri-apps/tauri) | 2.11.2 | Apache-2.0 OR MIT | dependency |
| [tauri-runtime-wry](https://github.com/tauri-apps/tauri) | 2.11.2 | Apache-2.0 OR MIT | dependency |
| [tauri-utils](https://github.com/tauri-apps/tauri) | 2.9.3 | Apache-2.0 OR MIT | dependency |
| [tauri-winres](https://github.com/tauri-apps/winres) | 0.3.6 | MIT | dependency |
| [tempfile](https://github.com/Stebalien/tempfile) | 3.25.0 | MIT OR Apache-2.0 | dependency |
| [tendril](https://github.com/servo/html5ever) | 0.5.0 | MIT OR Apache-2.0 | dependency |
| [thin-vec](https://github.com/mozilla/thin-vec) | 0.2.18 | MIT OR Apache-2.0 | dependency |
| [thiserror](https://github.com/dtolnay/thiserror) | 1.0.69 | MIT OR Apache-2.0 | dependency |
| [thiserror](https://github.com/dtolnay/thiserror) | 2.0.18 | MIT OR Apache-2.0 | dependency |
| [thiserror-impl](https://github.com/dtolnay/thiserror) | 1.0.69 | MIT OR Apache-2.0 | dependency |
| [thiserror-impl](https://github.com/dtolnay/thiserror) | 2.0.18 | MIT OR Apache-2.0 | dependency |
| [time](https://github.com/time-rs/time) | 0.3.47 | MIT OR Apache-2.0 | dependency |
| [time-core](https://github.com/time-rs/time) | 0.1.8 | MIT OR Apache-2.0 | dependency |
| [time-macros](https://github.com/time-rs/time) | 0.2.27 | MIT OR Apache-2.0 | dependency |
| [tiny-skia](https://github.com/RazrFalcon/tiny-skia) | 0.11.4 | BSD-3-Clause | dependency |
| [tiny-skia-path](https://github.com/RazrFalcon/tiny-skia/tree/master/path) | 0.11.4 | BSD-3-Clause | dependency |
| [tinystr](https://github.com/unicode-org/icu4x) | 0.7.6 | Unicode-3.0 | dependency |
| [tinystr](https://github.com/unicode-org/icu4x) | 0.8.3 | Unicode-3.0 | dependency |
| [tinyvec](https://github.com/Lokathor/tinyvec) | 1.11.0 | Zlib OR Apache-2.0 OR MIT | dependency |
| [tinyvec_macros](https://github.com/Soveu/tinyvec_macros) | 0.1.1 | MIT OR Apache-2.0 OR Zlib | dependency |
| [tokio](https://github.com/tokio-rs/tokio) | 1.52.3 | MIT | dependency |
| [tokio-util](https://github.com/tokio-rs/tokio) | 0.7.18 | MIT | dependency |
| [toml](https://github.com/toml-rs/toml) | 0.8.2 | MIT OR Apache-2.0 | dependency |
| [toml](https://github.com/toml-rs/toml) | 0.9.12+spec-1.1.0 | MIT OR Apache-2.0 | dependency |
| [toml](https://github.com/toml-rs/toml) | 1.1.2+spec-1.1.0 | MIT OR Apache-2.0 | dependency |
| [toml_datetime](https://github.com/toml-rs/toml) | 0.6.3 | MIT OR Apache-2.0 | dependency |
| [toml_datetime](https://github.com/toml-rs/toml) | 0.7.5+spec-1.1.0 | MIT OR Apache-2.0 | dependency |
| [toml_datetime](https://github.com/toml-rs/toml) | 1.1.1+spec-1.1.0 | MIT OR Apache-2.0 | dependency |
| [toml_edit](https://github.com/toml-rs/toml) | 0.19.15 | MIT OR Apache-2.0 | dependency |
| [toml_edit](https://github.com/toml-rs/toml) | 0.20.2 | MIT OR Apache-2.0 | dependency |
| [toml_edit](https://github.com/toml-rs/toml) | 0.25.11+spec-1.1.0 | MIT OR Apache-2.0 | dependency |
| [toml_parser](https://github.com/toml-rs/toml) | 1.1.2+spec-1.1.0 | MIT OR Apache-2.0 | dependency |
| [toml_writer](https://github.com/toml-rs/toml) | 1.1.1+spec-1.1.0 | MIT OR Apache-2.0 | dependency |
| [tower](https://github.com/tower-rs/tower) | 0.5.3 | MIT | dependency |
| [tower-http](https://github.com/tower-rs/tower-http) | 0.6.11 | MIT | dependency |
| [tower-layer](https://github.com/tower-rs/tower) | 0.3.3 | MIT | dependency |
| [tower-service](https://github.com/tower-rs/tower) | 0.3.3 | MIT | dependency |
| [tracing](https://github.com/tokio-rs/tracing) | 0.1.44 | MIT | dependency |
| [tracing-attributes](https://github.com/tokio-rs/tracing) | 0.1.31 | MIT | dependency |
| [tracing-core](https://github.com/tokio-rs/tracing) | 0.1.36 | MIT | dependency |
| [tray-icon](https://github.com/tauri-apps/tray-icon) | 0.23.1 | MIT OR Apache-2.0 | dependency |
| [try-lock](https://github.com/seanmonstar/try-lock) | 0.2.5 | MIT | dependency |
| [ttf-parser](https://github.com/harfbuzz/ttf-parser) | 0.25.1 | MIT OR Apache-2.0 | dependency |
| [two-face](https://github.com/CosmicHorrorDev/two-face) | 0.4.5 | MIT OR Apache-2.0 | dependency |
| [typed-arena](https://github.com/SimonSapin/rust-typed-arena) | 2.0.2 | MIT | dependency |
| [typed-path](https://github.com/chipsenkbeil/typed-path) | 0.12.3 | MIT OR Apache-2.0 | dependency |
| [typeid](https://github.com/dtolnay/typeid) | 1.0.3 | MIT OR Apache-2.0 | dependency |
| [typenum](https://github.com/paholg/typenum) | 1.20.0 | MIT OR Apache-2.0 | dependency |
| [typst](https://github.com/typst/typst) | 0.14.2 | Apache-2.0 | dependency |
| [typst-as-lib](https://github.com/Relacibo/typst-as-lib) | 0.15.4 | MIT | dependency |
| [typst-assets](https://github.com/typst/typst-assets) | 0.14.2 | Apache-2.0 | dependency |
| [typst-eval](https://github.com/typst/typst) | 0.14.2 | Apache-2.0 | dependency |
| [typst-html](https://github.com/typst/typst) | 0.14.2 | Apache-2.0 | dependency |
| [typst-kit](https://github.com/typst/typst) | 0.14.2 | Apache-2.0 | dependency |
| [typst-layout](https://github.com/typst/typst) | 0.14.2 | Apache-2.0 | dependency |
| [typst-library](https://github.com/typst/typst) | 0.14.2 | Apache-2.0 | vendored/local |
| [typst-macros](https://github.com/typst/typst) | 0.14.2 | Apache-2.0 | dependency |
| [typst-pdf](https://github.com/typst/typst) | 0.14.2 | Apache-2.0 | dependency |
| [typst-realize](https://github.com/typst/typst) | 0.14.2 | Apache-2.0 | dependency |
| [typst-svg](https://github.com/typst/typst) | 0.14.2 | Apache-2.0 | dependency |
| [typst-syntax](https://github.com/typst/typst) | 0.14.2 | Apache-2.0 | dependency |
| [typst-timing](https://github.com/typst/typst) | 0.14.2 | Apache-2.0 | dependency |
| [typst-utils](https://github.com/typst/typst) | 0.14.2 | Apache-2.0 | dependency |
| [uds_windows](https://github.com/haraldh/rust_uds_windows) | 1.2.1 | MIT | dependency |
| [unic-char-property](https://github.com/open-i18n/rust-unic/) | 0.9.0 | MIT/Apache-2.0 | dependency |
| [unic-char-range](https://github.com/open-i18n/rust-unic/) | 0.9.0 | MIT/Apache-2.0 | dependency |
| [unic-common](https://github.com/open-i18n/rust-unic/) | 0.9.0 | MIT/Apache-2.0 | dependency |
| [unic-langid](https://github.com/zbraniecki/unic-locale) | 0.9.6 | MIT OR Apache-2.0 | dependency |
| [unic-langid-impl](https://github.com/zbraniecki/unic-locale) | 0.9.6 | MIT OR Apache-2.0 | dependency |
| [unic-langid-macros](https://github.com/zbraniecki/unic-locale) | 0.9.6 | MIT OR Apache-2.0 | dependency |
| [unic-langid-macros-impl](https://github.com/zbraniecki/unic-locale) | 0.9.6 | MIT OR Apache-2.0 | dependency |
| [unic-ucd-ident](https://github.com/open-i18n/rust-unic/) | 0.9.0 | MIT/Apache-2.0 | dependency |
| [unic-ucd-version](https://github.com/open-i18n/rust-unic/) | 0.9.0 | MIT/Apache-2.0 | dependency |
| [unicode-bidi](https://github.com/servo/unicode-bidi) | 0.3.18 | MIT OR Apache-2.0 | dependency |
| [unicode-bidi-mirroring](https://github.com/RazrFalcon/unicode-bidi-mirroring) | 0.4.0 | MIT/Apache-2.0 | dependency |
| [unicode-ccc](https://github.com/RazrFalcon/unicode-ccc) | 0.4.0 | MIT/Apache-2.0 | dependency |
| [unicode-ident](https://github.com/dtolnay/unicode-ident) | 1.0.24 | (MIT OR Apache-2.0) AND Unicode-3.0 | dependency |
| [unicode-math-class](https://github.com/typst/unicode-math-class) | 0.1.0 | MIT OR Apache-2.0 | dependency |
| [unicode-normalization](https://github.com/unicode-rs/unicode-normalization) | 0.1.25 | MIT OR Apache-2.0 | dependency |
| [unicode-properties](https://github.com/unicode-rs/unicode-properties) | 0.1.4 | MIT/Apache-2.0 | dependency |
| [unicode-script](https://github.com/unicode-rs/unicode-script) | 0.5.8 | MIT OR Apache-2.0 | dependency |
| [unicode-segmentation](https://github.com/unicode-rs/unicode-segmentation) | 1.13.2 | MIT OR Apache-2.0 | dependency |
| [unicode-vo](https://github.com/RazrFalcon/unicode-vo) | 0.1.0 | MIT/Apache-2.0 | dependency |
| [unicode-xid](https://github.com/unicode-rs/unicode-xid) | 0.2.6 | MIT OR Apache-2.0 | dependency |
| [unsafe-libyaml](https://github.com/dtolnay/unsafe-libyaml) | 0.2.11 | MIT | dependency |
| [unscanny](https://github.com/typst/unscanny) | 0.1.0 | MIT OR Apache-2.0 | dependency |
| [untrusted](https://github.com/briansmith/untrusted) | 0.9.0 | ISC | dependency |
| [ureq](https://github.com/algesten/ureq) | 3.3.0 | MIT OR Apache-2.0 | dependency |
| [ureq-proto](https://github.com/algesten/ureq-proto) | 0.6.0 | MIT OR Apache-2.0 | dependency |
| [url](https://github.com/servo/rust-url) | 2.5.8 | MIT OR Apache-2.0 | dependency |
| [urlpattern](https://github.com/denoland/rust-urlpattern) | 0.3.0 | MIT | dependency |
| [usvg](https://github.com/linebender/resvg) | 0.45.1 | Apache-2.0 OR MIT | dependency |
| [utf-8](https://github.com/SimonSapin/rust-utf8) | 0.7.6 | MIT OR Apache-2.0 | dependency |
| [utf8_iter](https://github.com/hsivonen/utf8_iter) | 1.0.4 | Apache-2.0 OR MIT | dependency |
| [utf8-zero](https://github.com/algesten/utf8-zero) | 0.8.1 | MIT OR Apache-2.0 | dependency |
| [uuid](https://github.com/uuid-rs/uuid) | 1.23.1 | Apache-2.0 OR MIT | dependency |
| [version_check](https://github.com/SergioBenitez/version_check) | 0.9.5 | MIT/Apache-2.0 | dependency |
| [version-compare](https://gitlab.com/timvisee/version-compare) | 0.2.1 | MIT | dependency |
| [vswhom](https://github.com/nabijaczleweli/vswhom.rs) | 0.1.0 | MIT | dependency |
| [vswhom-sys](https://github.com/nabijaczleweli/vswhom-sys.rs) | 0.1.3 | MIT | dependency |
| [walkdir](https://github.com/BurntSushi/walkdir) | 2.5.0 | Unlicense/MIT | dependency |
| [want](https://github.com/seanmonstar/want) | 0.3.1 | MIT | dependency |
| [wasi](https://github.com/bytecodealliance/wasi) | 0.11.1+wasi-snapshot-preview1 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT | dependency |
| [wasip2](https://github.com/bytecodealliance/wasi-rs) | 1.0.3+wasi-0.2.9 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT | dependency |
| [wasip3](https://github.com/bytecodealliance/wasi-rs) | 0.4.0+wasi-0.3.0-rc-2026-01-06 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT | dependency |
| [wasm-bindgen](https://github.com/wasm-bindgen/wasm-bindgen) | 0.2.122 | MIT OR Apache-2.0 | dependency |
| [wasm-bindgen-futures](https://github.com/wasm-bindgen/wasm-bindgen/tree/master/crates/futures) | 0.4.72 | MIT OR Apache-2.0 | dependency |
| [wasm-bindgen-macro](https://github.com/wasm-bindgen/wasm-bindgen/tree/master/crates/macro) | 0.2.122 | MIT OR Apache-2.0 | dependency |
| [wasm-bindgen-macro-support](https://github.com/wasm-bindgen/wasm-bindgen/tree/master/crates/macro-support) | 0.2.122 | MIT OR Apache-2.0 | dependency |
| [wasm-bindgen-shared](https://github.com/wasm-bindgen/wasm-bindgen/tree/master/crates/shared) | 0.2.122 | MIT OR Apache-2.0 | dependency |
| [wasm-encoder](https://github.com/bytecodealliance/wasm-tools/tree/main/crates/wasm-encoder) | 0.244.0 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT | dependency |
| [wasm-metadata](https://github.com/bytecodealliance/wasm-tools/tree/main/crates/wasm-metadata) | 0.244.0 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT | dependency |
| [wasm-streams](https://github.com/MattiasBuelens/wasm-streams/) | 0.5.0 | MIT OR Apache-2.0 | dependency |
| [wasmi](https://github.com/wasmi-labs/wasmi) | 0.51.5 | MIT/Apache-2.0 | dependency |
| [wasmi_collections](https://github.com/wasmi-labs/wasmi) | 0.51.5 | MIT/Apache-2.0 | dependency |
| [wasmi_core](https://github.com/wasmi-labs/wasmi) | 0.51.5 | MIT/Apache-2.0 | dependency |
| [wasmi_ir](https://github.com/wasmi-labs/wasmi) | 0.51.5 | MIT/Apache-2.0 | dependency |
| [wasmparser](https://github.com/bytecodealliance/wasm-tools/tree/main/crates/wasmparser) | 0.228.0 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT | dependency |
| [wasmparser](https://github.com/bytecodealliance/wasm-tools/tree/main/crates/wasmparser) | 0.244.0 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT | dependency |
| [web_atoms](https://github.com/servo/html5ever) | 0.2.4 | MIT OR Apache-2.0 | dependency |
| [web-sys](https://github.com/wasm-bindgen/wasm-bindgen/tree/master/crates/web-sys) | 0.3.99 | MIT OR Apache-2.0 | dependency |
| [webkit2gtk](https://github.com/tauri-apps/webkit2gtk-rs) | 2.0.2 | MIT | dependency |
| [webkit2gtk-sys](https://github.com/tauri-apps/webkit2gtk-rs) | 2.0.2 | MIT | dependency |
| [webpki-roots](https://github.com/rustls/webpki-roots) | 1.0.7 | CDLA-Permissive-2.0 | dependency |
| [webview2-com](https://github.com/wravery/webview2-rs) | 0.38.2 | MIT | dependency |
| [webview2-com-macros](https://github.com/wravery/webview2-rs) | 0.8.1 | MIT | dependency |
| [webview2-com-sys](https://github.com/wravery/webview2-rs) | 0.38.2 | MIT | dependency |
| [weezl](https://github.com/image-rs/weezl) | 0.1.12 | MIT OR Apache-2.0 | dependency |
| [winapi](https://github.com/retep998/winapi-rs) | 0.3.9 | MIT/Apache-2.0 | dependency |
| [winapi-i686-pc-windows-gnu](https://github.com/retep998/winapi-rs) | 0.4.0 | MIT/Apache-2.0 | dependency |
| [winapi-util](https://github.com/BurntSushi/winapi-util) | 0.1.11 | Unlicense OR MIT | dependency |
| [winapi-x86_64-pc-windows-gnu](https://github.com/retep998/winapi-rs) | 0.4.0 | MIT/Apache-2.0 | dependency |
| [window-vibrancy](https://github.com/tauri-apps/tauri-plugin-vibrancy) | 0.6.0 | Apache-2.0 OR MIT | dependency |
| [windows](https://github.com/microsoft/windows-rs) | 0.61.3 | MIT OR Apache-2.0 | dependency |
| [windows_aarch64_gnullvm](https://github.com/microsoft/windows-rs) | 0.42.2 | MIT OR Apache-2.0 | dependency |
| [windows_aarch64_gnullvm](https://github.com/microsoft/windows-rs) | 0.52.6 | MIT OR Apache-2.0 | dependency |
| [windows_aarch64_gnullvm](https://github.com/microsoft/windows-rs) | 0.53.1 | MIT OR Apache-2.0 | dependency |
| [windows_aarch64_msvc](https://github.com/microsoft/windows-rs) | 0.42.2 | MIT OR Apache-2.0 | dependency |
| [windows_aarch64_msvc](https://github.com/microsoft/windows-rs) | 0.52.6 | MIT OR Apache-2.0 | dependency |
| [windows_aarch64_msvc](https://github.com/microsoft/windows-rs) | 0.53.1 | MIT OR Apache-2.0 | dependency |
| [windows_i686_gnu](https://github.com/microsoft/windows-rs) | 0.42.2 | MIT OR Apache-2.0 | dependency |
| [windows_i686_gnu](https://github.com/microsoft/windows-rs) | 0.52.6 | MIT OR Apache-2.0 | dependency |
| [windows_i686_gnu](https://github.com/microsoft/windows-rs) | 0.53.1 | MIT OR Apache-2.0 | dependency |
| [windows_i686_gnullvm](https://github.com/microsoft/windows-rs) | 0.52.6 | MIT OR Apache-2.0 | dependency |
| [windows_i686_gnullvm](https://github.com/microsoft/windows-rs) | 0.53.1 | MIT OR Apache-2.0 | dependency |
| [windows_i686_msvc](https://github.com/microsoft/windows-rs) | 0.42.2 | MIT OR Apache-2.0 | dependency |
| [windows_i686_msvc](https://github.com/microsoft/windows-rs) | 0.52.6 | MIT OR Apache-2.0 | dependency |
| [windows_i686_msvc](https://github.com/microsoft/windows-rs) | 0.53.1 | MIT OR Apache-2.0 | dependency |
| [windows_x86_64_gnu](https://github.com/microsoft/windows-rs) | 0.42.2 | MIT OR Apache-2.0 | dependency |
| [windows_x86_64_gnu](https://github.com/microsoft/windows-rs) | 0.52.6 | MIT OR Apache-2.0 | dependency |
| [windows_x86_64_gnu](https://github.com/microsoft/windows-rs) | 0.53.1 | MIT OR Apache-2.0 | dependency |
| [windows_x86_64_gnullvm](https://github.com/microsoft/windows-rs) | 0.42.2 | MIT OR Apache-2.0 | dependency |
| [windows_x86_64_gnullvm](https://github.com/microsoft/windows-rs) | 0.52.6 | MIT OR Apache-2.0 | dependency |
| [windows_x86_64_gnullvm](https://github.com/microsoft/windows-rs) | 0.53.1 | MIT OR Apache-2.0 | dependency |
| [windows_x86_64_msvc](https://github.com/microsoft/windows-rs) | 0.42.2 | MIT OR Apache-2.0 | dependency |
| [windows_x86_64_msvc](https://github.com/microsoft/windows-rs) | 0.52.6 | MIT OR Apache-2.0 | dependency |
| [windows_x86_64_msvc](https://github.com/microsoft/windows-rs) | 0.53.1 | MIT OR Apache-2.0 | dependency |
| [windows-collections](https://github.com/microsoft/windows-rs) | 0.2.0 | MIT OR Apache-2.0 | dependency |
| [windows-core](https://github.com/microsoft/windows-rs) | 0.61.2 | MIT OR Apache-2.0 | dependency |
| [windows-core](https://github.com/microsoft/windows-rs) | 0.62.2 | MIT OR Apache-2.0 | dependency |
| [windows-future](https://github.com/microsoft/windows-rs) | 0.2.1 | MIT OR Apache-2.0 | dependency |
| [windows-implement](https://github.com/microsoft/windows-rs) | 0.60.2 | MIT OR Apache-2.0 | dependency |
| [windows-interface](https://github.com/microsoft/windows-rs) | 0.59.3 | MIT OR Apache-2.0 | dependency |
| [windows-link](https://github.com/microsoft/windows-rs) | 0.1.3 | MIT OR Apache-2.0 | dependency |
| [windows-link](https://github.com/microsoft/windows-rs) | 0.2.1 | MIT OR Apache-2.0 | dependency |
| [windows-numerics](https://github.com/microsoft/windows-rs) | 0.2.0 | MIT OR Apache-2.0 | dependency |
| [windows-result](https://github.com/microsoft/windows-rs) | 0.3.4 | MIT OR Apache-2.0 | dependency |
| [windows-result](https://github.com/microsoft/windows-rs) | 0.4.1 | MIT OR Apache-2.0 | dependency |
| [windows-strings](https://github.com/microsoft/windows-rs) | 0.4.2 | MIT OR Apache-2.0 | dependency |
| [windows-strings](https://github.com/microsoft/windows-rs) | 0.5.1 | MIT OR Apache-2.0 | dependency |
| [windows-sys](https://github.com/microsoft/windows-rs) | 0.45.0 | MIT OR Apache-2.0 | dependency |
| [windows-sys](https://github.com/microsoft/windows-rs) | 0.52.0 | MIT OR Apache-2.0 | dependency |
| [windows-sys](https://github.com/microsoft/windows-rs) | 0.59.0 | MIT OR Apache-2.0 | dependency |
| [windows-sys](https://github.com/microsoft/windows-rs) | 0.60.2 | MIT OR Apache-2.0 | dependency |
| [windows-sys](https://github.com/microsoft/windows-rs) | 0.61.2 | MIT OR Apache-2.0 | dependency |
| [windows-targets](https://github.com/microsoft/windows-rs) | 0.42.2 | MIT OR Apache-2.0 | dependency |
| [windows-targets](https://github.com/microsoft/windows-rs) | 0.52.6 | MIT OR Apache-2.0 | dependency |
| [windows-targets](https://github.com/microsoft/windows-rs) | 0.53.5 | MIT OR Apache-2.0 | dependency |
| [windows-threading](https://github.com/microsoft/windows-rs) | 0.1.0 | MIT OR Apache-2.0 | dependency |
| [windows-version](https://github.com/microsoft/windows-rs) | 0.1.7 | MIT OR Apache-2.0 | dependency |
| [winnow](https://github.com/winnow-rs/winnow) | 0.5.40 | MIT | dependency |
| [winnow](https://github.com/winnow-rs/winnow) | 0.7.15 | MIT | dependency |
| [winnow](https://github.com/winnow-rs/winnow) | 1.0.3 | MIT | dependency |
| [winreg](https://github.com/gentoo90/winreg-rs) | 0.55.0 | MIT | dependency |
| [wit-bindgen](https://github.com/bytecodealliance/wit-bindgen) | 0.51.0 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT | dependency |
| [wit-bindgen](https://github.com/bytecodealliance/wit-bindgen) | 0.57.1 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT | dependency |
| [wit-bindgen-core](https://github.com/bytecodealliance/wit-bindgen) | 0.51.0 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT | dependency |
| [wit-bindgen-rust](https://github.com/bytecodealliance/wit-bindgen) | 0.51.0 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT | dependency |
| [wit-bindgen-rust-macro](https://github.com/bytecodealliance/wit-bindgen) | 0.51.0 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT | dependency |
| [wit-component](https://github.com/bytecodealliance/wasm-tools/tree/main/crates/wit-component) | 0.244.0 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT | dependency |
| [wit-parser](https://github.com/bytecodealliance/wasm-tools/tree/main/crates/wit-parser) | 0.244.0 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT | dependency |
| [write-fonts](https://github.com/googlefonts/fontations) | 0.43.0 | MIT OR Apache-2.0 | dependency |
| [writeable](https://github.com/unicode-org/icu4x) | 0.5.5 | Unicode-3.0 | dependency |
| [writeable](https://github.com/unicode-org/icu4x) | 0.6.3 | Unicode-3.0 | dependency |
| [wry](https://github.com/tauri-apps/wry) | 0.55.1 | Apache-2.0 OR MIT | dependency |
| [x11](https://github.com/AltF02/x11-rs.git) | 2.21.0 | MIT | dependency |
| [x11-dl](https://github.com/AltF02/x11-rs.git) | 2.21.0 | MIT | dependency |
| [xattr](https://github.com/Stebalien/xattr) | 1.6.1 | MIT OR Apache-2.0 | dependency |
| [xmlparser](https://github.com/RazrFalcon/xmlparser) | 0.13.6 | MIT/Apache-2.0 | dependency |
| [xmlwriter](https://github.com/RazrFalcon/xmlwriter) | 0.1.0 | MIT | dependency |
| [xmp-writer](https://github.com/typst/xmp-writer) | 0.3.3 | MIT OR Apache-2.0 | dependency |
| [yaml-rust](https://github.com/chyh1990/yaml-rust) | 0.4.5 | MIT/Apache-2.0 | dependency |
| [yoke](https://github.com/unicode-org/icu4x) | 0.7.5 | Unicode-3.0 | dependency |
| [yoke](https://github.com/unicode-org/icu4x) | 0.8.2 | Unicode-3.0 | dependency |
| [yoke-derive](https://github.com/unicode-org/icu4x) | 0.7.5 | Unicode-3.0 | dependency |
| [yoke-derive](https://github.com/unicode-org/icu4x) | 0.8.2 | Unicode-3.0 | dependency |
| [zbus](https://github.com/z-galaxy/zbus/) | 5.19.0 | MIT | dependency |
| [zbus_macros](https://github.com/z-galaxy/zbus/) | 5.19.0 | MIT | dependency |
| [zbus_names](https://github.com/z-galaxy/zbus/) | 4.3.4 | MIT | dependency |
| [zcheapstr](https://github.com/z-galaxy/zcheapstr/) | 1.1.0 | MIT | dependency |
| [zerocopy](https://github.com/google/zerocopy) | 0.8.48 | BSD-2-Clause OR Apache-2.0 OR MIT | dependency |
| [zerocopy-derive](https://github.com/google/zerocopy) | 0.8.48 | BSD-2-Clause OR Apache-2.0 OR MIT | dependency |
| [zerofrom](https://github.com/unicode-org/icu4x) | 0.1.8 | Unicode-3.0 | dependency |
| [zerofrom-derive](https://github.com/unicode-org/icu4x) | 0.1.7 | Unicode-3.0 | dependency |
| [zeroize](https://github.com/RustCrypto/utils) | 1.8.2 | Apache-2.0 OR MIT | dependency |
| [zerotrie](https://github.com/unicode-org/icu4x) | 0.1.3 | Unicode-3.0 | dependency |
| [zerotrie](https://github.com/unicode-org/icu4x) | 0.2.4 | Unicode-3.0 | dependency |
| [zerovec](https://github.com/unicode-org/icu4x) | 0.10.4 | Unicode-3.0 | dependency |
| [zerovec](https://github.com/unicode-org/icu4x) | 0.11.6 | Unicode-3.0 | dependency |
| [zerovec-derive](https://github.com/unicode-org/icu4x) | 0.10.3 | Unicode-3.0 | dependency |
| [zerovec-derive](https://github.com/unicode-org/icu4x) | 0.11.3 | Unicode-3.0 | dependency |
| [zip](https://github.com/zip-rs/zip2) | 8.6.0 | MIT | dependency |
| [zlib-rs](https://github.com/trifectatechfoundation/zlib-rs) | 0.6.3 | Zlib | dependency |
| [zmij](https://github.com/dtolnay/zmij) | 1.0.21 | MIT | dependency |
| [zopfli](https://github.com/zopfli-rs/zopfli) | 0.8.3 | Apache-2.0 | dependency |
| [zune-core](https://crates.io/crates/zune-core) | 0.4.12 | MIT OR Apache-2.0 OR Zlib | dependency |
| [zune-core](https://github.com/etemesi254/zune-image) | 0.5.1 | MIT OR Apache-2.0 OR Zlib | dependency |
| [zune-jpeg](https://github.com/etemesi254/zune-image/tree/dev/crates/zune-jpeg) | 0.4.21 | MIT OR Apache-2.0 OR Zlib | dependency |
| [zune-jpeg](https://github.com/etemesi254/zune-image/tree/dev/crates/zune-jpeg) | 0.5.15 | MIT OR Apache-2.0 OR Zlib | dependency |
| [zvariant](https://github.com/z-galaxy/zbus/) | 5.15.0 | MIT | dependency |
| [zvariant_derive](https://github.com/z-galaxy/zbus/) | 5.15.0 | MIT | dependency |
| [zvariant_utils](https://github.com/z-galaxy/zbus/) | 4.2.0 | MIT | dependency |
