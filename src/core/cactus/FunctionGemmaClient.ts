import { cactusRuntime, CactusRuntime } from './CactusRuntime';
import type {
  ToolDefinition,
  ToolCall,
  CactusCompletionResponse,
  RoutingDecision,
} from '../../types';
import { TOOL_DEFINITIONS } from '../tools/definitions';
import { CACTUS_TOKEN, GEMINI_API_KEY } from '../config';
import { aiLog } from '../logging/AILogger';
import { recordLatency, recordFailure, recordSuccess } from '../routing/HybridRouter';

export class FunctionGemmaClient {
  private runtime: CactusRuntime;
  private tools: ToolDefinition[];
  private modelReady = false;

  constructor(runtime?: CactusRuntime) {
    this.runtime = runtime ?? cactusRuntime;
    this.tools = TOOL_DEFINITIONS;
  }

  async initialize(
    onProgress?: (progress: number) => void,
  ): Promise<boolean> {
    // Gemini API key for direct cloud inference (preferred when online)
    if (GEMINI_API_KEY) {
      this.runtime.setGeminiApiKey(GEMINI_API_KEY);
      aiLog('cactus', 'Gemini API key configured — cloud inference when online');
    }

    // Cactus token as fallback cloud path
    if (CACTUS_TOKEN) {
      this.runtime.setCactusToken(CACTUS_TOKEN);
      if (!GEMINI_API_KEY) {
        aiLog('cactus', 'Cactus token configured — using as Gemini API key for cloud');
      }
    }

    if (!GEMINI_API_KEY && !CACTUS_TOKEN) {
      aiLog('cactus', 'No cloud keys — offline-only mode (local FunctionGemma)');
    }

    const ok = await this.runtime.initialize(onProgress);
    this.modelReady = ok;
    return ok;
  }

  get ready(): boolean {
    return this.modelReady;
  }

  get isRealInference(): boolean {
    return this.runtime.isNativeInference;
  }

  get isHybridMode(): boolean {
    return this.runtime.isHybridAvailable;
  }

  get isDownloading(): boolean {
    return this.runtime.isDownloading;
  }

  async decide(
    systemPrompt: string,
    userPrompt: string,
    route: RoutingDecision = 'local',
  ): Promise<{
    toolCall: ToolCall | null;
    rawResponse: string;
    confidence: number;
    latencyMs: number;
    native: boolean;
    routeUsed: RoutingDecision;
  }> {
    if (!this.modelReady) {
      throw new Error('FunctionGemma not initialized.');
    }

    const start = Date.now();
    const response: CactusCompletionResponse = await this.runtime.complete({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      tools: this.tools,
      max_tokens: 256,
      temperature: 0.7,
    });

    const latency = Date.now() - start;
    const isCloud = response.tokens_per_second === -1;
    const isLocal = response.tokens_per_second > 0;
    const actualRoute: RoutingDecision = isCloud ? 'cloud' : isLocal ? 'local' : 'mock';

    if (actualRoute !== 'mock') {
      recordLatency(actualRoute, latency);
      if (response.success) recordSuccess(actualRoute);
      else recordFailure(actualRoute);
    }

    if (!response.success || response.function_calls.length === 0) {
      return {
        toolCall: null,
        rawResponse: response.response,
        confidence: response.confidence,
        latencyMs: latency,
        native: isLocal,
        routeUsed: actualRoute,
      };
    }

    const bestCall = response.function_calls[0];
    const valid = this.validateToolCall(bestCall);

    return {
      toolCall: valid ? bestCall : null,
      rawResponse: response.response,
      confidence: response.confidence,
      latencyMs: latency,
      native: isLocal,
      routeUsed: actualRoute,
    };
  }

  private validateToolCall(call: ToolCall): boolean {
    const toolDef = this.tools.find((t) => t.name === call.name);
    if (!toolDef) return false;
    const required = toolDef.parameters.required ?? [];
    return required.every((param) => param in call.arguments);
  }

  async shutdown(): Promise<void> {
    await this.runtime.unload();
    this.modelReady = false;
  }
}

export const functionGemma = new FunctionGemmaClient();
