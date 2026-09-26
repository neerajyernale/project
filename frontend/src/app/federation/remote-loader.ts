/**
 * Loads federated remotes named in the runtime manifest (docs/MICROFRONTEND.md §3).
 *
 * Replaces loadRemoteModule() from @angular-architects/module-federation-runtime 14.3, which
 * does not await the container's init(): on the first load a remote could resolve its
 * modules before the shared scope exists and start a second copy of Angular.
 */

// Provided by webpack's Module Federation runtime.
declare const __webpack_init_sharing__: (scope: string) => Promise<void>;
declare const __webpack_share_scopes__: { default: unknown };

interface Container {
  init(shareScope: unknown): Promise<void>;
  get(module: string): Promise<() => unknown>;
}

/** Remote name → URL of its remoteEntry.js. */
export type RemoteManifest = Record<string, string>;

let manifest: RemoteManifest = {};
const containers = new Map<string, Promise<Container>>();

/** Reads the manifest before Angular starts. Rendered per environment, so no remote URL is built in. */
export async function loadManifest(url: string): Promise<void> {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Manifest ${url} returned ${res.status}`);
  manifest = (await res.json()) as RemoteManifest;
}

export function remoteEntryUrl(remote: string): string | undefined {
  return manifest[remote];
}

/** Resolves the module a remote exposes. The remoteEntry.js is fetched on first use only. */
export async function loadRemoteModule<T>(remote: string, exposedModule = './Module'): Promise<T> {
  let container = containers.get(remote);
  if (!container) {
    container = initContainer(remote);
    containers.set(remote, container);
    // A failed load can be retried by the next navigation.
    container.catch(() => containers.delete(remote));
  }
  const factory = await (await container).get(exposedModule);
  return factory() as T;
}

async function initContainer(remote: string): Promise<Container> {
  const url = manifest[remote];
  if (!url) throw new Error(`Remote "${remote}" is not in the manifest`);
  const container = (await import(/* webpackIgnore: true */ url)) as Container;
  await __webpack_init_sharing__('default');
  await container.init(__webpack_share_scopes__.default);
  return container;
}
