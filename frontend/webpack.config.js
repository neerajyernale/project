const federation = require('./federation.webpack');

// The shell exposes nothing; it shares Angular, @wms/core and @wms/design-system with the remotes.
module.exports = federation({ name: 'shell', devUrl: '/' });
