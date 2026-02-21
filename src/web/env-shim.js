// Web-side shim for @env — values injected by webpack DefinePlugin
module.exports = {
  CACTUS_TOKEN: process.env.CACTUS_TOKEN || '',
  GOOGLE_WEB_CLIENT_ID: process.env.GOOGLE_WEB_CLIENT_ID || '',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
};
