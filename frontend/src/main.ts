import { loadManifest } from './app/federation/remote-loader';

// Angular starts only after the manifest is known, and from a dynamic import, so shared
// packages (Angular, @wms/core, …) are negotiated with the remotes first (docs/MICROFRONTEND.md §3).
loadManifest('assets/config/mf.manifest.json')
  .catch((err: unknown) => console.error('[federation] no remote manifest; domain pages will show as unavailable', err))
  .then(() => import('./bootstrap'))
  .catch((err: unknown) => console.error(err));
