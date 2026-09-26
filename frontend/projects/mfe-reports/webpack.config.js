const federation = require('../../federation.webpack');
const remote = require('../../federation.remotes.json').find((r) => r.name === 'reports');

// Exposes one NgModule as ./Module (docs/MICROFRONTEND.md §3).
module.exports = federation({
  name: remote.name,
  exposes: { './Module': './' + remote.exposes },
  devUrl: `http://localhost:${remote.port}/`,
});
