import { cactusRuntime, CactusRuntime } from './CactusRuntime';
import type {
  ToolDefinition,
  ToolCall,
  CactusCompletionResponse,
} from '../../types';
import { TOOL_DEFINITIONS } from '../tools/definitions';
import { CACTUS_TOKEN } from '../config';
import { aiLog } from '../logging/AILogger';

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
    if (CACTUS_TOKEN) {
      this.runtime.setCactusToken(CACTUS_TOKEN);
      aiLog('cactus', 'Token configured — hybrid mode (local + Gemini Flash cloud fallback)');
    } else {
      aiLog('cactus', 'No token — local-only mode (set CACTUS_TOKEN in config.ts for cloud fallback)');
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
  ): Promise<{
    toolCall: ToolCall | null;
    rawResponse: string;
    confidence: number;
    latencyMs: number;
    native: boolean;
  }> {
    if (!this.modelReady) {
      throw new Error('FunctionGemma not initialized.');
    }

    const response: CactusCompletionResponse = await this.runtime.complete({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      tools: this.tools,
      max_tokens: 200,
      temperature: 0.7,
    });

    if (!response.success || response.function_calls.length === 0) {
      return {
        toolCall: null,
        rawResponse: response.response,
        confidence: response.confidence,
        latencyMs: response.latency_ms,
        native: this.runtime.isNativeInference,
      };
    }

    const bestCall = response.function_calls[0];
    const valid = this.validateToolCall(bestCall);

    return {
      toolCall: valid ? bestCall : null,
      rawResponse: response.response,
      confidence: response.confidence,
      latencyMs: response.latency_ms,
      native: this.runtime.isNativeInference,
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
