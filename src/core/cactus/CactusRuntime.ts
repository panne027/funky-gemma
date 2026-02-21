import type {
  CactusCompletionRequest,
  CactusCompletionResponse,
  ToolCall,
  ToolDefinition,
  ContextSnapshot,
  HabitState,
} from '../../types';
import { aiLog } from '../logging/AILogger';

let CactusLMClass: any = null;
let nativeAvailable = false;

try {
  const cactus = require('cactus-react-native');
  CactusLMClass = cactus.CactusLM;
  if (CactusLMClass) nativeAvailable = true;
} catch {
  // Web or native module not linked
}

export class CactusRuntime {
  private lm: any = null;
  private _isLoaded = false;
  private _isNative = false;
  private _isDownloading = false;
  private _inferring = false;
  private _nativeFailures = 0;
  private static readonly MAX_NATIVE_FAILURES = 3;

  get loaded(): boolean {
    return this._isLoaded;
  }

  get isNativeInference(): boolean {
    return this._isNative;
  }

  get isDownloading(): boolean {
    return this._isDownloading;
  }

  async initialize(
    onDownloadProgress?: (progress: number) => void,
  ): Promise<boolean> {
    if (this._isLoaded) return true;

    if (!nativeAvailable || !CactusLMClass) {
      aiLog('cactus', 'Native module unavailable — using mock inference');
      this._isLoaded = true;
      this._isNative = false;
      return true;
    }

    try {
      this.lm = new CactusLMClass({
        model: 'functiongemma-270m-it',
        contextSize: 2048,
      });

      this._isDownloading = true;
      aiLog('cactus', 'Downloading FunctionGemma via Cactus SDK...');
      await this.lm.download({
        onProgress: (progress: number) => {
          onDownloadProgress?.(progress);
        },
      });
      this._isDownloading = false;
      aiLog('cactus', 'Model downloaded ✓');

      aiLog('cactus', 'Loading FunctionGemma into memory...');
      await this.lm.init();
      this._isLoaded = true;
      this._isNative = true;
      aiLog('cactus', 'NATIVE FunctionGemma ready — on-device inference active');
      return true;
    } catch (err) {
      this._isDownloading = false;
      aiLog('cactus', `Native init failed: ${err}. Using mock.`);
      this.lm = null;
      this._isLoaded = true;
      this._isNative = false;
      return true;
    }
  }

  async complete(request: CactusCompletionRequest): Promise<CactusCompletionResponse> {
    const start = Date.now();

    if (!this._isLoaded) {
      throw new Error('Model not loaded. Call initialize() first.');
    }

    if (this._nativeFailures >= CactusRuntime.MAX_NATIVE_FAILURES) {
      return this.mockComplete(request, start);
    }

    if (this._inferring) {
      return this.mockComplete(request, start);
    }

    // ── Real Cactus inference ────────────────────────────────────────
    if (this._isNative && this.lm) {
      this._inferring = true;
      try {
        const tools = request.tools?.map(toToolSchema);
        aiLog('gemma', 'Running native inference...');

        let tokenCount = 0;
        const completionPromise = this.lm.complete({
          messages: request.messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          tools,
          options: {
            temperature: request.temperature ?? 0.1,
            maxTokens: request.max_tokens ?? 64,
          },
          onToken: (token: string) => {
            tokenCount++;
            if (tokenCount <= 3) {
              aiLog('gemma', `token: "${token}"`);
            }
          },
          mode: 'local',
        });

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Inference timeout (30s)')), 30_000),
        );

        const result = await Promise.race([completionPromise, timeoutPromise]);

        const latency = Date.now() - start;
        const functionCalls: ToolCall[] = (result.functionCalls ?? []).map(
          (fc: any) => ({ name: fc.name, arguments: fc.arguments }),
        );

        if (functionCalls.length === 0 && result.response) {
          const parsed = parseFunctionGemmaOutput(result.response);
          functionCalls.push(...parsed);
        }

        this._inferring = false;
        this._nativeFailures = 0;

        aiLog('gemma', `Inference complete: ${latency}ms, ${result.tokensPerSecond?.toFixed(1)} tok/s`);
        if (functionCalls.length > 0) {
          aiLog('gemma', `Tool call: ${functionCalls[0].name}(${JSON.stringify(functionCalls[0].arguments)})`);
        }

        return {
          success: result.success,
          response: result.response ?? '',
          function_calls: functionCalls,
          confidence: functionCalls.length > 0 ? 0.85 : 0.3,
          tokens_per_second: result.tokensPerSecond ?? 0,
          latency_ms: latency,
        };
      } catch (err) {
        this._inferring = false;
        this._nativeFailures++;
        aiLog('cactus', `Native inference failed (${this._nativeFailures}/${CactusRuntime.MAX_NATIVE_FAILURES}): ${err}`);
        try { await this.lm.stop(); } catch { /* ignore */ }
        return this.mockComplete(request, start);
      }
    }

    return this.mockComplete(request, start);
  }

  async unload(): Promise<void> {
    if (this.lm && this._isNative) {
      try { await this.lm.destroy(); } catch { /* ignore */ }
    }
    this.lm = null;
    this._isLoaded = false;
    this._isNative = false;
  }

  private mockComplete(
    request: CactusCompletionRequest,
    startTime: number,
  ): CactusCompletionResponse {
    const prompt = request.messages.map((m) => m.content).join('\n');
    const toolCall = contextAwareMockDecision(prompt);
    const response = `call:${toolCall.name}{${Object.entries(toolCall.arguments).map(([k, v]) => `${k}:${v}`).join(',')}}`;

    aiLog('gemma', `Mock decision → ${toolCall.name}`);
    if (toolCall.name === 'send_nudge') {
      aiLog('gemma', `Message: "${toolCall.arguments.message}"`);
    }

    return {
      success: true,
      response,
      function_calls: [toolCall],
      confidence: 0.7,
      tokens_per_second: 0,
      latency_ms: Date.now() - startTime,
    };
  }
}

// ─── Context-aware mock decision engine ──────────────────────────────────────

function contextAwareMockDecision(prompt: string): ToolCall {
  const p = prompt.toLowerCase();

  // Extract context from the prompt
  const hourMatch = p.match(/time:\s*(\d+):(\d+)/);
  const hour = hourMatch ? parseInt(hourMatch[1], 10) : new Date().getHours();
  const isWeekend = p.includes('weekend');
  const isDoomScrolling = p.includes('doom scrolling');
  const scrollMatch = p.match(/doom scrolling:\s*(\d+)/);
  const scrollMin = scrollMatch ? parseInt(scrollMatch[1], 10) : 0;
  const justEndedEvent = p.match(/event just ended:\s*"([^"]+)"/)?.[1];
  const freeMinMatch = p.match(/free:\s*(\d+)/);
  const freeMin = freeMinMatch ? parseInt(freeMinMatch[1], 10) : 60;
  const lastNudgeDismissed = p.includes('last nudge: dismissed') || p.includes('last nudge: ignored');
  const lastNudgeSnoozed = p.includes('last nudge: snoozed');

  // Extract habit info
  const habits: { id: string; name: string; momentum: number; tier: string; streak: number; cooldown: boolean; recovery: boolean }[] = [];
  const habitPattern = /(\w[\w\s]*?):\s*momentum=(\d+)\s*\[(\w+)\]\s*streak=(\d+)(.*)/g;
  let hm;
  while ((hm = habitPattern.exec(p)) !== null) {
    habits.push({
      id: hm[1].trim().toLowerCase().replace(/\s+/g, '_'),
      name: hm[1].trim(),
      momentum: parseInt(hm[2], 10),
      tier: hm[3],
      streak: parseInt(hm[4], 10),
      cooldown: hm[5].includes('cooldown'),
      recovery: hm[5].includes('recovery'),
    });
  }

  // Filter out habits on cooldown
  const available = habits.filter((h) => !h.cooldown);
  if (available.length === 0 && habits.length > 0) {
    return { name: 'delay_nudge', arguments: { habit_id: habits[0].id, reason: 'All habits on cooldown — backing off' } };
  }

  // If user dismissed last nudge, respect that
  if (lastNudgeDismissed) {
    const target = available[0] ?? habits[0];
    return {
      name: 'increase_cooldown',
      arguments: { habit_id: target.id, minutes: 30 },
    };
  }

  if (lastNudgeSnoozed) {
    return { name: 'delay_nudge', arguments: { habit_id: (available[0] ?? habits[0]).id, reason: 'User snoozed — checking back later' } };
  }

  // ── Doom scrolling interruption ──────────────────────────────────
  if (isDoomScrolling && available.length > 0) {
    const h = available[0];
    const messages = [
      `You've been scrolling for ${scrollMin} minutes. Your ${h.name} streak is ${h.streak} days — keep it alive?`,
      `${scrollMin} min of scrolling... ${h.name} time? You're on a ${h.streak}-day streak!`,
      `Hey, ${scrollMin} minutes deep in the scroll hole. Perfect time for ${h.name} — you've got ${freeMin} free minutes.`,
      `Phone says ${scrollMin} min of scrolling. Your ${h.name} momentum is at ${h.momentum}% — a quick session would boost it.`,
    ];
    return {
      name: 'send_nudge',
      arguments: {
        habit_id: h.id,
        tone: 'playful',
        message: pick(messages),
      },
    };
  }

  // ── Post-meeting window ──────────────────────────────────────────
  if (justEndedEvent && available.length > 0) {
    const h = available[0];
    const messages = [
      `"${justEndedEvent}" just wrapped. You've got ${freeMin} min free — good window for ${h.name}.`,
      `Meeting done! ${freeMin} minutes before your next thing. ${h.name} session?`,
      `Post-meeting energy — channel it into ${h.name}? You have ${freeMin} min.`,
    ];
    return {
      name: 'send_nudge',
      arguments: {
        habit_id: h.id,
        tone: 'gentle',
        message: pick(messages),
      },
    };
  }

  // ── Time-based nudges ────────────────────────────────────────────
  const gymHabit = available.find((h) => h.id.includes('gym') || h.id.includes('workout') || h.id.includes('exercise'));
  const readingHabit = available.find((h) => h.id.includes('reading') || h.id.includes('read'));
  const laundryHabit = available.find((h) => h.id.includes('laundry'));

  // Morning workout window
  if (hour >= 6 && hour <= 9 && gymHabit) {
    const messages = [
      `Morning window is open. ${gymHabit.momentum}% momentum — ${gymHabit.streak > 0 ? `${gymHabit.streak}-day streak on the line` : 'start a new streak today'}?`,
      `It's ${hour}am${isWeekend ? ' on the weekend' : ''}. Great time for a workout — momentum is at ${gymHabit.momentum}%.`,
      `Rise and move? Your gym momentum is ${gymHabit.momentum}%. ${freeMin} min available.`,
    ];
    return { name: 'send_nudge', arguments: { habit_id: gymHabit.id, tone: gymHabit.recovery ? 'gentle' : 'playful', message: pick(messages) } };
  }

  // Evening reading window
  if (hour >= 20 && hour <= 23 && readingHabit) {
    const messages = [
      `Evening wind-down time. ${readingHabit.streak > 0 ? `${readingHabit.streak}-day reading streak` : 'Start a reading habit tonight'}. Even 10 pages counts.`,
      `It's ${hour}:00 — your reading window. Momentum at ${readingHabit.momentum}%, ${freeMin} min free.`,
      `Screens down, book up? Your reading momentum is ${readingHabit.momentum}%.`,
    ];
    return { name: 'send_nudge', arguments: { habit_id: readingHabit.id, tone: 'gentle', message: pick(messages) } };
  }

  // Lunch / afternoon gym
  if (hour >= 11 && hour <= 14 && gymHabit) {
    const messages = [
      `Lunch break window. Gym momentum at ${gymHabit.momentum}% — a midday session would bump it up.`,
      `Free block around lunch. ${gymHabit.streak > 0 ? `Keep the ${gymHabit.streak}-day streak going` : 'Good day to start'} with a workout?`,
    ];
    return { name: 'send_nudge', arguments: { habit_id: gymHabit.id, tone: 'playful', message: pick(messages) } };
  }

  // Laundry urgency
  if (laundryHabit && p.includes('depletion') && (p.includes('high') || p.includes('critical'))) {
    const depMatch = p.match(/depletion:\s*(\d+)d\s*\[(\w+)\]/);
    const days = depMatch ? depMatch[1] : '?';
    const urgency = depMatch ? depMatch[2] : 'unknown';
    const messages = [
      `Running low on clean gym clothes — ${days} days until empty (${urgency}). Start a load tonight?`,
      `Laundry alert: ${days} days of clean clothes left. Do a load now to stay ahead of your gym routine.`,
    ];
    return { name: 'send_nudge', arguments: { habit_id: laundryHabit.id, tone: urgency === 'critical' ? 'firm' : 'gentle', message: pick(messages) } };
  }

  // ── Recovery mode — be gentle ────────────────────────────────────
  const recoveryHabit = available.find((h) => h.recovery);
  if (recoveryHabit) {
    const messages = [
      `Your ${recoveryHabit.name} momentum dropped to ${recoveryHabit.momentum}%. No pressure — even a tiny step helps rebuild.`,
      `${recoveryHabit.name} is in recovery mode. A small win today would start turning things around.`,
    ];
    return { name: 'send_nudge', arguments: { habit_id: recoveryHabit.id, tone: 'gentle', message: pick(messages) } };
  }

  // ── Lowest momentum habit gets attention ─────────────────────────
  if (available.length > 0) {
    const weakest = available.reduce((a, b) => a.momentum < b.momentum ? a : b);
    if (weakest.momentum < 50) {
      const messages = [
        `Your ${weakest.name} momentum is only ${weakest.momentum}%. A quick session would really help — you have ${freeMin} minutes free.`,
        `${weakest.name} needs some love (${weakest.momentum}% momentum). ${isWeekend ? 'Weekend is perfect for catching up.' : 'Squeeze one in?'}`,
      ];
      return { name: 'send_nudge', arguments: { habit_id: weakest.id, tone: 'gentle', message: pick(messages) } };
    }
  }

  // ── Nothing urgent — delay ───────────────────────────────────────
  const target = available[0] ?? habits[0] ?? { id: 'general' };
  return {
    name: 'delay_nudge',
    arguments: {
      habit_id: target.id,
      reason: `All habits healthy (${habits.map((h) => `${h.name}:${h.momentum}%`).join(', ')}). Checking again later.`,
    },
  };
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
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
