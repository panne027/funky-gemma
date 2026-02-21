// Metro: react-native-dotenv babel plugin replaces this import with literal values
// Web: webpack alias resolves @env to src/web/env-shim.js
import { CACTUS_TOKEN as ENV_TOKEN } from '@env';

/**
 * Cactus API token for hybrid mode (local-first, Gemini Flash cloud fallback).
 * Loaded from .env file. Get a free token at https://cactuscompute.com
 */
export const CACTUS_TOKEN: string = ENV_TOKEN || '';

export const ENABLE_HYBRID_MODE: boolean = CACTUS_TOKEN.length > 0;
