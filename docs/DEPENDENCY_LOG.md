# Dependency Log

A changelog tracking dependency additions, upgrades, removals, and related configuration changes in this project. Entries are ordered newest-first.

---

## 2026-04-08 — Frontend toolchain modernization (webpack 5 compatibility)

Resolved cascading peer-dependency conflicts that prevented `npm install` from completing. The root cause was a mix of webpack 1–era packages alongside a webpack 5 core. All changes are in `client/`.

### Upgraded

| Package | From | To | Reason |
|---------|------|----|--------|
| `typescript` | `~2.0.2` | `^5.4.5` | Needed for modern `ts-loader`, `ts-jest`, and current type definitions. |
| `ts-jest` | `^0.1.13` | `^29.1.2` | Old version required `jest ~16.0.2`; aligned with `jest ^29.7.0`. |
| `less` | `^2.7.1` | `^4.2.0` | `less-loader ^12` requires `less >=3.5`. |
| `style-loader` | `^0.13.0` | `^3.3.4` | Old version used webpack 1 loader API. |
| `rimraf` | `^2.5.0` | `^5.0.5` | Modernized; old version had known deprecation warnings. |
| `chalk` | `^1.1.3` | `^4.1.2` | Older version used a deprecated API; v4 is the latest CJS-compatible release. |
| `cross-env` | `^1.0.7` | `^7.0.3` | Modernized. |
| `webpack-dev-server` | `^1.14.1` | `^4.15.2` | v1 is incompatible with webpack 5; v4 is the latest webpack 5–compatible release. |

### Replaced (Babel 6 → Babel 7)

| Removed | Added | Notes |
|---------|-------|-------|
| `babel-core` `^6.4.0` | `@babel/core` `^7.24.0` | Babel 7 monorepo naming. |
| `babel-preset-es2015` `^6.3.13` | `@babel/preset-env` `^7.24.0` | `es2015` was Babel 6–only; `preset-env` is the Babel 7 equivalent with browser targeting. |
| `babel-preset-react` `^6.3.13` | `@babel/preset-react` `^7.24.0` | Babel 7 monorepo naming. |
| `babel-preset-stage-0` `^6.3.13` | *(removed)* | Stage presets were eliminated in Babel 7; no stage-0 features were actually used. |
| `.babelrc` (file) | `babel.config.js` (file) | Switched to JS config for programmatic control. `react-hot-loader/babel` plugin was initially included, then removed (see below). |

### Added

| Package | Version | Reason |
|---------|---------|--------|
| `webpack-cli` | `^5.1.4` | Required by webpack 5 for CLI commands (`build:clean`, `build:prod`). |
| `jest-environment-jsdom` | `^29.7.0` | Jest 29 requires explicit jsdom environment package. |
| `@types/jest` | `^29.5.12` | Type definitions for Jest 29 test authoring. |
| `@types/react` | `^15.6.0` | Replaced `typings`-based type definitions with `@types` packages. |
| `@types/react-dom` | `^15.5.0` | Replaced `typings`-based type definitions with `@types` packages. |
| `@types/classnames` | `^2.3.4` | Replaced `typings`-based type definitions with `@types` packages. |
| `jest.config.cjs` (file) | — | Standalone Jest config replacing inline `"jest"` block in `package.json`. |
| `jest.setup.js` (file) | — | Assigns global `fetch` mock for tests; replaces per-file `require('jest')` + manual mock wiring. |

### Removed

| Package | Version | Reason |
|---------|---------|--------|
| `extract-text-webpack-plugin` | `^3.0.2` | Required webpack 3 peer; was never referenced in either webpack config. |
| `file-loader` | `^6.2.0` | Replaced by webpack 5's built-in `asset/resource` module. |
| `url-loader` | `^0.5.7` | Replaced by webpack 5's built-in `asset` module with `dataUrlCondition`. |
| `tslint` | `^3.15.1` | Deprecated in favor of ESLint; was used in webpack 1 `preLoaders` which no longer exist. |
| `tslint-loader` | `^3.5.4` | Removed alongside `tslint`. |
| `typings` | `^1.3.2` | Legacy DefinitelyTyped manager; replaced by `@types/*` packages via npm. |
| `jest-fetch-mock` | `^1.0.6` | Tests use a custom `fetch-mock.js` instead; this package was unused. |

### Disabled / configuration changes

| Change | Details |
|--------|---------|
| **`react-hot-loader/babel` plugin removed** | The Babel plugin was present in the original `.babelrc`. It is incompatible with native ES6 classes (Babel 7 + `@babel/preset-env` targeting modern browsers does not downcompile classes). The `react-proxy` v3 beta wraps classes in a proxy that breaks React 15's legacy context API (`this.context.router` becomes `undefined`). HMR now relies solely on `react-hot-loader/patch` entry + `module.hot.accept('./Root', ...)`. |
| **`postinstall` script removed** | Previously ran `typings install`; no longer needed after switching to `@types/*`. |
| **`webpack.config.js` rewritten** | Migrated from webpack 1 syntax (`module.loaders`, `preLoaders`, `resolveLoader.fallback`, empty-string extension) to webpack 5 syntax (`module.rules`, `resolve.extensions` without `''`, `asset` modules, `mode: 'development'`). Removed explicit `HotModuleReplacementPlugin` (WDS enables HMR automatically when `hot: true`). |
| **`webpack.config.prod.js` rewritten** | Same webpack 5 migration. Fixed `__API_SERVER_URL__` from `http://localhost:8080` to `http://localhost:9966/petclinic` to match the actual backend. Added `mode: 'production'`. |
| **`server.js` rewritten** | Migrated from webpack-dev-server v1 API (`new WebpackDevServer(compiler, options)` + manual middleware) to v4 API (`new WebpackDevServer(options, compiler)` + `.start()`). Removed `connect-history-api-fallback` and `http-proxy-middleware` manual wiring (built into WDS v4). |
| **`tsconfig.json` updated** | Added `moduleResolution: "node"`, `esModuleInterop: true`, `lib: ["ES2015", "DOM"]`. Changed from `exclude`-based to `include`-based file selection. Removed `typings/` references. |
| **Jest config externalized** | Moved from inline `"jest"` block in `package.json` to `jest.config.cjs`. Switched from `scriptPreprocessor` (Jest <27) to `ts-jest` preset. Added `setupFilesAfterSetup` for global fetch mock. |

### Unchanged (kept as-is)

These packages were **not** upgraded and remain at their original versions. They are functional but end-of-life:

| Package | Version | Notes |
|---------|---------|-------|
| `react` | `^15.0.0` | EOL since 2017. Upgrading cascades into react-router, enzyme, and component rewrites. |
| `react-dom` | `^15.0.0` | Paired with React. |
| `react-router` | `^2.7.0` | v2 API; upgrading to v6 requires route config rewrite. |
| `react-hot-loader` | `^3.0.0-beta.0` | Babel plugin disabled; kept for `AppContainer` + `patch` entry only. Would be replaced by React Fast Refresh on React upgrade. |
| `enzyme` | `^2.5.1` | No React 16+ adapter exists. Would be replaced by React Testing Library on React upgrade. |
| `react-addons-test-utils` | `^15.3.2` | Required by Enzyme 2 for React 15. |
| `react-datepicker` | `^0.29.0` | Pinned to React 15–compatible version. |
| `bootstrap` | `^3.3.7` | v3 is EOL; upgrade to v5 would require markup and LESS-to-Sass changes. |
| `moment` | `^2.15.1` | In maintenance mode; would be replaced by `date-fns` or `dayjs` in a modernization. |
| `redbox-react` | `^1.2.3` | Error overlay for React 15 dev mode. |
| `whatwg-fetch` | `^1.0.0` | Fetch polyfill; modern browsers have native `fetch`. |
