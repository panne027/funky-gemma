import type {
  CactusCompletionRequest,
  CactusCompletionResponse,
  ToolCall,
  ToolDefinition,
} from '../../types';
import { aiLog } from '../logging/AILogger';
import { getConnectivitySignal } from '../context/signals/ConnectivitySignal';

let CactusLMClass: any = null;
let CactusConfigClass: any = null;
let nativeAvailable = false;

try {
  const cactus = require('cactus-react-native');
  CactusLMClass = cactus.CactusLM;
  CactusConfigClass = cactus.CactusConfig;
  if (CactusLMClass) nativeAvailable = true;
} catch {
  // Web or native module not linked
}

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export class CactusRuntime {
  private lm: any = null;
  private _isLoaded = false;
  private _isNative = false;
  private _isDownloading = false;
  private _hybridAvailable = false;
  private _geminiApiKey: string | null = null;
  private _cactusToken: string | null = null;
  private _nativeInitPromise: Promise<void> | null = null;
  private _nativeReady = false;

  get loaded(): boolean {
    return this._isLoaded;
  }

  get isNativeInference(): boolean {
    return this._isNative;
  }

  get isHybridAvailable(): boolean {
    return this._hybridAvailable;
  }

  get isDownloading(): boolean {
    return this._isDownloading;
  }

  setCactusToken(token: string): void {
    this._cactusToken = token;
    if (CactusConfigClass) {
      CactusConfigClass.cactusToken = token;
    }
    this._hybridAvailable = true;
    aiLog('cactus', 'Cactus token set — hybrid cloud relay available');
  }

  setGeminiApiKey(key: string): void {
    this._geminiApiKey = key;
    aiLog('cactus', 'Gemini API key set — direct REST inference available');
  }

  async initialize(
    _onDownloadProgress?: (progress: number) => void,
  ): Promise<boolean> {
    if (this._isLoaded) return true;

    this._isLoaded = true;
    this._isNative = nativeAvailable && !!CactusLMClass;

    // Do NOT load the native model at startup — it blocks the JS thread
    // on many devices (Pixel 7 Pro confirmed). The model will be loaded
    // lazily on the first offline inference request.
    if (this._isNative) {
      aiLog('cactus', 'Native Cactus available — will load model on-demand when offline');
    } else {
      aiLog('cactus', 'Native module unavailable — cloud-only mode');
    }

    return true;
  }

  private async ensureNativeModelLoaded(): Promise<boolean> {
    if (this._nativeReady && this.lm) return true;
    if (!this._isNative || !CactusLMClass) return false;

    try {
      aiLog('cactus', 'Loading FunctionGemma on-demand for offline inference...');
      this.lm = new CactusLMClass({
        model: 'functiongemma-270m-it',
        contextSize: 2048,
      });

      this._isDownloading = true;
      await this.lm.download({ onProgress: () => {} });
      this._isDownloading = false;

      await this.lm.init();
      this._nativeReady = true;
      aiLog('cactus', 'FunctionGemma ready for local inference');
      return true;
    } catch (err) {
      this._isDownloading = false;
      aiLog('cactus', `Native model load failed: ${err}`);
      this.lm = null;
      this._nativeReady = false;
      return false;
    }
  }

  async complete(request: CactusCompletionRequest): Promise<CactusCompletionResponse> {
    const start = Date.now();

    if (!this._isLoaded) {
      throw new Error('Model not loaded. Call initialize() first.');
    }

    const connectivity = getConnectivitySignal();
    const isOnline = connectivity.is_connected;

    // ── PATH 1: Direct Gemini REST API (preferred, non-blocking) ──────
    if (isOnline && this._geminiApiKey) {
      try {
        const result = await this.geminiRestInference(request);
        const latency = Date.now() - start;
        aiLog('gemma', `Gemini REST done: ${latency}ms`);
        this.logDecision(result);
        return { ...result, latency_ms: latency };
      } catch (err) {
        aiLog('gemma', `Gemini REST failed: ${err}`);
      }
    }

    // ── PATH 2: Cactus SDK hybrid (online + cactus token, model already loaded) ─
    if (isOnline && this._nativeReady && this.lm && this._hybridAvailable) {
      try {
        const result = await this.cactusHybridInference(request);
        const latency = Date.now() - start;
        const src = (result.tokens_per_second ?? 0) > 10 ? 'on-device' : 'Cactus cloud relay';
        aiLog('gemma', `Cactus hybrid done (${src}): ${latency}ms`);
        this.logDecision(result);
        return { ...result, latency_ms: latency };
      } catch (err) {
        aiLog('gemma', `Cactus hybrid failed: ${err}`);
        try { await this.lm.stop(); } catch { /* ignore */ }
      }
    }

    // ── PATH 3: Local-only FunctionGemma (offline — lazy-load model) ──
    if (!isOnline && this._isNative) {
      await this.ensureNativeModelLoaded();
    }
    if (this._nativeReady && this.lm) {
      try {
        const result = await this.cactusLocalInference(request);
        const latency = Date.now() - start;
        aiLog('gemma', `Local FunctionGemma done: ${latency}ms, ${(result.tokens_per_second ?? 0).toFixed(1)} tok/s`);
        this.logDecision(result);
        return { ...result, latency_ms: latency };
      } catch (err) {
        aiLog('cactus', `Local inference failed: ${err}`);
        try { await this.lm.stop(); } catch { /* ignore */ }
      }
    }

    // ── Nothing worked ────────────────────────────────────────────────
    const hasAnyKey = !!(this._geminiApiKey || this._cactusToken);
    const reason = !hasAnyKey
      ? 'no API key configured — add GEMINI_API_KEY to .env'
      : this._nativeReady
        ? 'both cloud and local failed — retrying next cycle'
        : 'local model still loading — retrying next cycle';

    aiLog('gemma', `All paths failed: ${reason}`);
    return {
      success: true,
      response: '',
      function_calls: [{
        name: 'delay_nudge',
        arguments: { habit_id: 'unknown', reason },
      }],
      confidence: 0.1,
      tokens_per_second: 0,
      latency_ms: Date.now() - start,
    };
  }

  private logDecision(result: CactusCompletionResponse): void {
    if (result.function_calls.length > 0) {
      const fc = result.function_calls[0];
      aiLog('gemma', `LLM decision: ${fc.name}(${JSON.stringify(fc.arguments).slice(0, 150)})`);
    } else {
      aiLog('gemma', `LLM raw text: ${(result.response ?? '').slice(0, 200)}`);
    }
  }

  // ── Gemini REST API ────────────────────────────────────────────────────────

  private async geminiRestInference(
    request: CactusCompletionRequest,
  ): Promise<CactusCompletionResponse> {
    const tools = request.tools ?? [];
    const geminiTools = tools.length > 0 ? [{
      function_declarations: tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: {
          type: 'OBJECT',
          properties: Object.fromEntries(
            Object.entries(t.parameters.properties).map(([k, v]) => [k, {
              type: v.type.toUpperCase(),
              description: v.description,
              ...(v.enum ? { enum: v.enum } : {}),
            }]),
          ),
          required: t.parameters.required,
        },
      })),
    }] : [];

    const systemMsg = request.messages.find((m) => m.role === 'system');
    const userMsg = request.messages.find((m) => m.role === 'user');

    const body: any = {
      contents: [{
        role: 'user',
        parts: [{ text: userMsg?.content ?? '' }],
      }],
      generationConfig: {
        temperature: request.temperature ?? 0.7,
        maxOutputTokens: request.max_tokens ?? 256,
      },
    };

    if (systemMsg) {
      body.systemInstruction = { parts: [{ text: systemMsg.content }] };
    }

    if (geminiTools.length > 0) {
      body.tools = geminiTools;
      body.toolConfig = { functionCallingConfig: { mode: 'ANY' } };
    }

    const model = 'gemini-2.5-flash';
    const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${this._geminiApiKey}`;
    aiLog('gemma', `Calling Gemini ${model} via REST...`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Gemini API ${res.status}: ${errText.slice(0, 300)}`);
      }

      const data = await res.json();
      return this.parseGeminiResponse(data);
    } finally {
      clearTimeout(timeout);
    }
  }

  private parseGeminiResponse(data: any): CactusCompletionResponse {
    const candidate = data.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];

    const functionCalls: ToolCall[] = [];
    let textResponse = '';

    for (const part of parts) {
      if (part.functionCall) {
        functionCalls.push({
          name: part.functionCall.name,
          arguments: part.functionCall.args ?? {},
        });
      }
      if (part.text) {
        textResponse += part.text;
      }
    }

    if (functionCalls.length === 0 && textResponse) {
      functionCalls.push(...parseFunctionGemmaOutput(textResponse));
    }

    return {
      success: true,
      response: textResponse,
      function_calls: functionCalls,
      confidence: functionCalls.length > 0 ? 0.9 : 0.3,
      tokens_per_second: -1,
      latency_ms: 0,
    };
  }

  // ── Cactus SDK hybrid ──────────────────────────────────────────────────────

  private async cactusHybridInference(
    request: CactusCompletionRequest,
  ): Promise<CactusCompletionResponse> {
    try { await this.lm.stop(); } catch { /* ignore */ }

    aiLog('gemma', 'Running Cactus hybrid inference...');
    const tools = request.tools?.map(toToolSchema);

    const inferencePromise = this.lm.complete({
      messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
      tools,
      options: { temperature: request.temperature ?? 0.7, maxTokens: request.max_tokens ?? 200 },
      mode: 'hybrid',
    });

    const result = await raceWithTimeout(inferencePromise, 25_000, 'Cactus hybrid');
    return this.parseCactusResult(result);
  }

  // ── Cactus SDK local-only ──────────────────────────────────────────────────

  private async cactusLocalInference(
    request: CactusCompletionRequest,
  ): Promise<CactusCompletionResponse> {
    try { await this.lm.stop(); } catch { /* ignore */ }

    aiLog('gemma', 'Running local FunctionGemma inference (offline)...');
    const tools = request.tools?.map(toToolSchema);

    const inferencePromise = this.lm.complete({
      messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
      tools,
      options: { temperature: request.temperature ?? 0.7, maxTokens: request.max_tokens ?? 200 },
      mode: 'local',
    });

    const result = await raceWithTimeout(inferencePromise, 30_000, 'Local FunctionGemma');
    return this.parseCactusResult(result);
  }

  private parseCactusResult(result: any): CactusCompletionResponse {
    const functionCalls: ToolCall[] = (result.functionCalls ?? []).map(
      (fc: any) => ({ name: fc.name, arguments: fc.arguments }),
    );

    if (functionCalls.length === 0 && result.response) {
      functionCalls.push(...parseFunctionGemmaOutput(result.response));
    }

    return {
      success: result.success,
      response: result.response ?? '',
      function_calls: functionCalls,
      confidence: functionCalls.length > 0 ? 0.85 : 0.3,
      tokens_per_second: result.tokensPerSecond ?? 0,
      latency_ms: 0,
    };
  }

  async unload(): Promise<void> {
    if (this.lm) {
      try { await this.lm.stop(); } catch { /* ignore */ }
      try { await this.lm.destroy(); } catch { /* ignore */ }
    }
    this.lm = null;
    this._isLoaded = false;
    this._isNative = false;
    this._nativeReady = false;
  }
}

function raceWithTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
    ),
  ]);
}

// ─── FunctionGemma output parser ─────────────────────────────────────────────

function parseFunctionGemmaOutput(raw: string): ToolCall[] {
  const calls: ToolCall[] = [];
  const callPattern = /call:(\w+)\{([^}]*)\}/g;
  let match;
  while ((match = callPattern.exec(raw)) !== null) {
    const args = parseCallArgs(match[2]);
    if (match[1] && Object.keys(args).length > 0) {
      calls.push({ name: match[1], arguments: args });
    }
  }
  if (calls.length > 0) return calls;

  try {
    const parsed = JSON.parse(raw.trim());
    if (parsed.name && parsed.arguments) return [{ name: parsed.name, arguments: parsed.arguments }];
  } catch { /* not JSON */ }

  return calls;
}

function parseCallArgs(argsStr: string): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  const keyPattern = /(\w+):/g;
  const keys: { key: string; start: number }[] = [];
  let km;
  while ((km = keyPattern.exec(argsStr)) !== null) {
    keys.push({ key: km[1], start: km.index + km[0].length });
  }
  for (let i = 0; i < keys.length; i++) {
    const start = keys[i].start;
    const end = i + 1 < keys.length ? keys[i + 1].start - keys[i + 1].key.length - 1 : argsStr.length;
    let value = argsStr.slice(start, end).trim();
    if (value.endsWith(',')) value = value.slice(0, -1).trim();
    if (!isNaN(Number(value)) && value !== '') args[keys[i].key] = Number(value);
    else if (value === 'true') args[keys[i].key] = true;
    else if (value === 'false') args[keys[i].key] = false;
    else args[keys[i].key] = value;
  }
  return args;
}

function toToolSchema(tool: ToolDefinition) {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  };
}

export const cactusRuntime = new CactusRuntime();
