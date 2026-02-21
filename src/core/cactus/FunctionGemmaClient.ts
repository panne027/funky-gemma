import { cactusRuntime, CactusRuntime } from './CactusRuntime';
import type {
  ToolDefinition,
  ToolCall,
  CactusCompletionResponse,
} from '../../types';
import { TOOL_DEFINITIONS } from '../tools/definitions';

/**
 * FunctionGemmaClient: high-level interface to FunctionGemma via Cactus SDK.
 *
 * On native: downloads FunctionGemma through Cactus's built-in model registry,
 * loads it on-device, runs real inference with tool calling.
 * On web: falls back to mock mode.
 */
export class FunctionGemmaClient {
  private runtime: CactusRuntime;
  private tools: ToolDefinition[];
  private modelReady = false;

  constructor(runtime?: CactusRuntime) {
    this.runtime = runtime ?? cactusRuntime;
    this.tools = TOOL_DEFINITIONS;
  }

  /**
   * Full initialization: download model (if needed) + load into memory.
   * Progress callback receives 0.0–1.0 fraction.
   */
  async initialize(
    onProgress?: (progress: number) => void,
  ): Promise<boolean> {
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
      temperature: 0.1,
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
