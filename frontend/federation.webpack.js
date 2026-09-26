// Module Federation config shared by the shell and every remote (docs/MICROFRONTEND.md §3–§4).
//
// The shared list is explicit, not shareAll(): runtime stability over bundle savings.
// Written against webpack's ModuleFederationPlugin directly because the
// withModuleFederationPlugin() helper overwrites the singleton settings of path-mapped libraries.
const path = require('path');
const ModuleFederationPlugin = require('webpack/lib/container/ModuleFederationPlugin');
const { SharedMappings } = require('@angular-architects/module-federation/webpack');

/** Versions of the workspace libraries. Bump the major on a breaking change to their public API. */
const WORKSPACE_LIBS = {
  // One AuthSession / AppConfig / WarehouseContext instance: a mismatch must fail loudly.
  '@wms/core': { version: '1.0.0', strictVersion: true },
  // Additive-only within a major, so a remote built against 1.x runs against any 1.x shell.
  '@wms/design-system': { version: '1.0.0', strictVersion: false },
};

/** Two copies of any of these break DI, change detection, routing or the overlay stack. */
const STRICT_SINGLETONS = [
  '@angular/core',
  '@angular/common',
  '@angular/common/http',
  '@angular/router',
  '@angular/forms',
  '@angular/platform-browser',
  '@angular/platform-browser-dynamic',
  '@angular/cdk/a11y',
  '@angular/cdk/bidi',
  '@angular/cdk/coercion',
  '@angular/cdk/collections',
  '@angular/cdk/dialog',
  '@angular/cdk/keycodes',
  '@angular/cdk/layout',
  '@angular/cdk/observers',
  '@angular/cdk/overlay',
  '@angular/cdk/platform',
  '@angular/cdk/portal',
  '@angular/cdk/scrolling',
];

function installedVersion(request) {
  const parts = request.split('/');
  const pkg = request.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
  return require(`${pkg}/package.json`).version;
}

function sharedConfig() {
  const shared = {};
  for (const name of STRICT_SINGLETONS) {
    const version = installedVersion(name);
    shared[name] = { singleton: true, strictVersion: true, version, requiredVersion: `~${version}` };
  }
  // Observables cross the shell/remote boundary; any 7.x interoperates.
  for (const name of ['rxjs', 'rxjs/operators']) {
    shared[name] = { singleton: true, strictVersion: false, version: installedVersion(name), requiredVersion: '^7.5.0' };
  }
  // No `import:` path here: webpack provides an absolute-path share in every compilation, including
  // Angular's child compilers for component styles, which cannot compile TypeScript. By package name
  // it is provided only where imported, resolved through the tsconfig alias.
  for (const [name, lib] of Object.entries(WORKSPACE_LIBS)) {
    shared[name] = {
      singleton: true,
      strictVersion: lib.strictVersion,
      version: lib.version,
      requiredVersion: `^${lib.version}`,
    };
  }
  return shared;
}

/**
 * Shares provided "if used" are registered by a hook that modules restored from Angular's
 * persistent build cache skip, so a cache written under an older federation config silently
 * drops them (the shell then runs a private copy of @wms/core). Make the cache depend on these files.
 */
const cacheFollowsFederationConfig = {
  apply(compiler) {
    const cache = compiler.options.cache;
    if (cache && cache.type === 'filesystem') {
      cache.buildDependencies = {
        ...cache.buildDependencies,
        federation: [__filename, path.join(__dirname, 'federation.remotes.json')],
      };
    }
  },
};

/**
 * publicPath 'auto' derives chunk URLs from import.meta.url, which lets a production remote be
 * served from any /mfe/<name>/<version>/ path. Development builds also emit styles.js, which
 * Angular loads as a classic script where import.meta is a syntax error; there the dev server's
 * address is known, so use it.
 */
function devPublicPath(url) {
  return {
    apply(compiler) {
      if (compiler.options.mode === 'development') compiler.options.output.publicPath = url;
    },
  };
}

/**
 * @param {{ name: string, exposes?: Record<string, string>, devUrl: string }} options
 *   `exposes` paths are relative to this folder (the workspace root);
 *   `devUrl` is where `ng serve` serves the project.
 */
module.exports = function federation({ name, exposes, devUrl }) {
  const mappings = new SharedMappings();
  mappings.register(path.join(__dirname, 'tsconfig.json'), Object.keys(WORKSPACE_LIBS));

  return {
    output: { uniqueName: name, publicPath: 'auto' },
    optimization: { runtimeChunk: false },
    resolve: { alias: mappings.getAliases() },
    experiments: { outputModule: true },
    plugins: [
      cacheFollowsFederationConfig,
      devPublicPath(devUrl),
      new ModuleFederationPlugin({
        name,
        filename: 'remoteEntry.js',
        library: { type: 'module' },
        exposes: exposes ?? {},
        shared: sharedConfig(),
      }),
      // Rewrites a relative import that reaches into a workspace lib to the shared entry point.
      mappings.getPlugin(),
    ],
  };
};

module.exports.WORKSPACE_LIBS = WORKSPACE_LIBS;
