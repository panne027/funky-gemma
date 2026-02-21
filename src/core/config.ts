let _token = '';

try {
  // react-native-dotenv babel plugin transforms this at build time into literal values.
  // Using require() so the catch block handles transform failures gracefully.
  const { CACTUS_TOKEN: t } = require('@env');
  _token = t || '';
} catch {
  try {
    _token = (process as any).env?.CACTUS_TOKEN || '';
  } catch { /* not available */ }
}

export const CACTUS_TOKEN: string = _token;

export const ENABLE_HYBRID_MODE: boolean = CACTUS_TOKEN.length > 0;
