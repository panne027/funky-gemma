// Web-side shim for @env — values injected by webpack DefinePlugin
module.exports = {
  CACTUS_TOKEN: process.env.CACTUS_TOKEN || '',
};
