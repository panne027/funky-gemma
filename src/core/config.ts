let _token = '';
let _googleWebClientId = '';
let _geminiApiKey = '';

try {
  const env = require('@env');
  _token = env.CACTUS_TOKEN || '';
  _googleWebClientId = env.GOOGLE_WEB_CLIENT_ID || '';
  _geminiApiKey = env.GEMINI_API_KEY || '';
} catch {
  try {
    _token = (process as any).env?.CACTUS_TOKEN || '';
    _googleWebClientId = (process as any).env?.GOOGLE_WEB_CLIENT_ID || '';
    _geminiApiKey = (process as any).env?.GEMINI_API_KEY || '';
  } catch { /* not available */ }
}

// Diagnostic — remove once env loading is confirmed working
console.log(`[CONFIG] CACTUS_TOKEN=${_token ? _token.slice(0, 12) + '...' : '(empty)'} GEMINI_API_KEY=${_geminiApiKey ? _geminiApiKey.slice(0, 12) + '...' : '(empty)'}`);

export const CACTUS_TOKEN: string = _token;
export const GOOGLE_WEB_CLIENT_ID: string = _googleWebClientId;
export const GEMINI_API_KEY: string = _geminiApiKey;

export const ENABLE_HYBRID_MODE: boolean = CACTUS_TOKEN.length > 0 || GEMINI_API_KEY.length > 0;
