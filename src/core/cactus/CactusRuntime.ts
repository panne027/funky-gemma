import type {
  CactusCompletionRequest,
  CactusCompletionResponse,
  ToolCall,
  ToolDefinition,
} from '../../types';
import { aiLog } from '../logging/AILogger';

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

export class CactusRuntime {
  private lm: any = null;
  private _isLoaded = false;
  private _isNative = false;
  private _isDownloading = false;
  private _inferring = false;
  private _hybridAvailable = false;
  private _nativeFailures = 0;
  private static readonly MAX_NATIVE_FAILURES = 2;

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

  /**
   * Set the Cactus token for hybrid mode (local-first, cloud fallback).
   * When set, failed local inference routes to Gemini Flash via OpenRouter.
   */
  setCactusToken(token: string): void {
    if (CactusConfigClass) {
      CactusConfigClass.cactusToken = token;
      this._hybridAvailable = true;
      aiLog('cactus', 'Hybrid mode enabled — cloud fallback via Gemini Flash');
    }
  }

  async initialize(
    onDownloadProgress?: (progress: number) => void,
  ): Promise<boolean> {
    if (this._isLoaded) return true;

    if (!nativeAvailable || !CactusLMClass) {
      aiLog('cactus', 'Native module unavailable — mock only');
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
      aiLog('cactus', 'Model downloaded');

      aiLog('cactus', 'Loading FunctionGemma into memory...');
      await this.lm.init();
      this._isLoaded = true;
      this._isNative = true;
      aiLog('cactus', 'FunctionGemma ready — on-device inference active');
      return true;
    } catch (err) {
      this._isDownloading = false;
      aiLog('cactus', `Native init failed: ${err}`);
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

    if (this._inferring) {
      aiLog('gemma', 'Concurrent call — using fallback');
      return this.mockComplete(request, start);
    }

    // Skip native if it has failed/timed out too many times
    if (this._nativeFailures >= CactusRuntime.MAX_NATIVE_FAILURES) {
      aiLog('gemma', `Native disabled after ${this._nativeFailures} failures — using fallback`);
      return this.mockComplete(request, start);
    }

    // ── Cactus inference (hybrid or local) ─────────────────────────
    if (this._isNative && this.lm && this._hybridAvailable) {
      this._inferring = true;

      try {
        const tools = request.tools?.map(toToolSchema);
        aiLog('gemma', 'Running inference (mode: hybrid)...');

        let tokenCount = 0;
        const inferencePromise = this.lm.complete({
          messages: request.messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          tools,
          options: {
            temperature: request.temperature ?? 0.7,
            maxTokens: request.max_tokens ?? 200,
          },
          onToken: (token: string) => {
            tokenCount++;
            if (tokenCount <= 5) {
              aiLog('gemma', `token: "${token}"`);
            }
          },
          mode: 'hybrid',
        });

        const TIMEOUT_MS = 15_000;
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Inference timed out after ${TIMEOUT_MS}ms`)), TIMEOUT_MS),
        );
        const result = await Promise.race([inferencePromise, timeoutPromise]);

        this._inferring = false;
        const latency = Date.now() - start;
        const functionCalls: ToolCall[] = (result.functionCalls ?? []).map(
          (fc: any) => ({ name: fc.name, arguments: fc.arguments }),
        );

        if (functionCalls.length === 0 && result.response) {
          const parsed = parseFunctionGemmaOutput(result.response);
          functionCalls.push(...parsed);
        }

        const src = result.tokensPerSecond > 10 ? 'on-device' : 'cloud';
        aiLog('gemma', `LLM inference done (${src}): ${latency}ms, ${result.tokensPerSecond?.toFixed(1)} tok/s`);
        if (functionCalls.length > 0) {
          aiLog('gemma', `Decision: ${functionCalls[0].name}(${JSON.stringify(functionCalls[0].arguments).slice(0, 120)})`);
        } else {
          aiLog('gemma', `Raw response: ${(result.response ?? '').slice(0, 200)}`);
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
        aiLog('cactus', `Inference failed (${this._nativeFailures}/${CactusRuntime.MAX_NATIVE_FAILURES}): ${err}`);
        try { await this.lm.stop(); } catch { /* ignore */ }
        return this.mockComplete(request, start);
      }
    }

    // ── No native model — mock only ──────────────────────────────────
    aiLog('gemma', `No native model → mock fallback (isNative=${this._isNative}, hybrid=${this._hybridAvailable})`);
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
    const toolCall = conversationalMockDecision(prompt);

    aiLog('gemma', `Offline fallback → ${toolCall.name}`);
    if (toolCall.name === 'send_nudge') {
      aiLog('nudge', `"${toolCall.arguments.message}"`);
    }

    return {
      success: true,
      response: JSON.stringify({ name: toolCall.name, arguments: toolCall.arguments }),
      function_calls: [toolCall],
      confidence: 0.5,
      tokens_per_second: 0,
      latency_ms: Date.now() - startTime,
    };
  }
}

// ─── Conversational mock fallback (offline, no LLM) ──────────────────────────
// Only used when BOTH local model AND cloud are unavailable.
// Sounds like a friend, not an app.

function conversationalMockDecision(prompt: string): ToolCall {
  const p = prompt.toLowerCase();

  const hourMatch = p.match(/it's\s*(\d+):?\d*\s*(am|pm)?/i) ?? p.match(/time[:\s]*(\d+)/);
  const hour = hourMatch ? parseInt(hourMatch[1], 10) : new Date().getHours();
  const isWeekend = p.includes('weekend');

  const screenMatch = p.match(/phone for (\d+) min/);
  const screenMin = screenMatch ? parseInt(screenMatch[1], 10) : 0;

  const scrollMatch = p.match(/scrolling[^\d]*(\d+) min/);
  const scrollMin = scrollMatch ? parseInt(scrollMatch[1], 10) : 0;

  const meetingMatch = p.match(/[""]([^""]+)[""][^a-z]*(?:just\s+)?ended/) ?? p.match(/['"]([^'"]+)['"]\s*(?:just\s+)?ended/);
  const endedMeeting = meetingMatch ? meetingMatch[1] : null;

  const freeMatch = p.match(/free[^\d]*(\d+) min/) ?? p.match(/nothing.*?(\d+)\s*min/);
  const freeMin = freeMatch ? parseInt(freeMatch[1], 10) : 120;

  // Only check the part of the user prompt that contains actual nudge response data
  const userSection = p.split('their habits:')[0] ?? p;
  const dismissed = userSection.includes('last nudge response: dismissed') || userSection.includes('last nudge response: ignored');
  const snoozed = userSection.includes('last nudge response: snoozed');

  // Parse habits from "- HabitName: momentum XX% (tier), N-day streak"
  const habitLines = p.match(/- ([^\n:]+): momentum (\d+)%[^\n]*/g) ?? [];
  const habits: { id: string; name: string; momentum: number; streak: number; cooldown: boolean; recovery: boolean }[] = [];
  for (const line of habitLines) {
    const m = line.match(/- ([^\n:]+): momentum (\d+)%/);
    if (!m) continue;
    const sMatch = line.match(/(\d+)-day streak/);
    habits.push({
      id: m[1].trim().toLowerCase().replace(/\s+/g, '_'),
      name: m[1].trim(),
      momentum: parseInt(m[2], 10),
      streak: sMatch ? parseInt(sMatch[1], 10) : 0,
      cooldown: line.includes('cooldown'),
      recovery: line.includes('recovering'),
    });
  }
  const available = habits.filter((h) => !h.cooldown);
  const target = available[0] ?? habits[0] ?? { id: 'gym', name: 'gym', momentum: 40, streak: 0, cooldown: false, recovery: false };
  const habitName = target.name;
  const habitId = target.id;
  const momentum = target.momentum;
  const streak = target.streak;

  aiLog('gemma', `Mock parse: hour=${hour} scroll=${scrollMin}min screen=${screenMin}min meeting=${endedMeeting ?? 'none'} free=${freeMin}min dismissed=${dismissed} snoozed=${snoozed}`);
  aiLog('gemma', `Mock habits: ${habits.map(h => `${h.name}(${h.momentum}%${h.cooldown ? ' CD' : ''}${h.recovery ? ' REC' : ''})`).join(', ')} | target=${habitName}`);

  if (dismissed) {
    aiLog('gemma', 'Mock branch: dismissed → increase_cooldown');
    return { name: 'increase_cooldown', arguments: { habit_id: habitId, minutes: 30 } };
  }
  if (snoozed) {
    aiLog('gemma', 'Mock branch: snoozed → delay_nudge');
    return { name: 'delay_nudge', arguments: { habit_id: habitId, reason: 'they snoozed, checking back later' } };
  }

  // Doom scrolling
  if (scrollMin > 10) {
    aiLog('gemma', `Mock branch: doom scroll ${scrollMin}min → send_nudge`);
    const msgs = [
      `ok ${scrollMin} min of scrolling, you know what time it is 😏 go do your ${habitName} thing, you've got this`,
      `hey put the phone down lol you've been scrolling ${scrollMin} min. ${streak > 0 ? `${streak} day streak don't let it die` : 'perfect time to start'} 💪`,
      `${scrollMin} minutes in the scroll hole... ${habitName} won't do itself! you're free right now, just go`,
    ];
    return { name: 'send_nudge', arguments: { habit_id: habitId, tone: 'playful', message: pick(msgs) } };
  }

  // Post-meeting
  if (endedMeeting) {
    aiLog('gemma', `Mock branch: post-meeting "${endedMeeting}" → send_nudge`);
    const msgs = [
      `"${endedMeeting}" is done! you've got ${freeMin} min free — perfect time to squeeze in ${habitName}`,
      `meeting over! don't just sit there, you have ${freeMin} min. ${habitName} time?`,
      `hey "${endedMeeting}" just ended and you're free for ${freeMin} min. go get that ${habitName} in before something else comes up`,
    ];
    return { name: 'send_nudge', arguments: { habit_id: habitId, tone: 'playful', message: pick(msgs) } };
  }

  // Screen time
  if (screenMin > 30) {
    aiLog('gemma', `Mock branch: screen time ${screenMin}min → send_nudge`);
    const msgs = [
      `you've been on your phone for ${screenMin} min straight. take a break and do some ${habitName}? your momentum is at ${momentum}%`,
      `${screenMin} min of screen time... your ${habitName} momentum is ${momentum}%. even a quick one helps`,
    ];
    return { name: 'send_nudge', arguments: { habit_id: habitId, tone: 'gentle', message: pick(msgs) } };
  }

  // Morning
  if (hour >= 6 && hour <= 9) {
    aiLog('gemma', `Mock branch: morning ${hour}h → send_nudge`);
    const msgs = [
      `morning! ${isWeekend ? 'weekend vibes but' : ''} ${streak > 0 ? `${streak} day ${habitName} streak — keep it going today?` : `good day to start a ${habitName} habit`}`,
      `gm ☀️ you've got a clear morning. ${habitName} time? momentum is at ${momentum}%`,
    ];
    return { name: 'send_nudge', arguments: { habit_id: habitId, tone: 'gentle', message: pick(msgs) } };
  }

  // Evening reading
  if (hour >= 20 && hour <= 23) {
    aiLog('gemma', `Mock branch: evening ${hour}h → send_nudge`);
    const msgs = [
      `winding down? perfect time to read. ${streak > 0 ? `${streak} day streak, even 10 pages keeps it alive` : 'start tonight, just 10 pages'}`,
      `it's getting late, put the phone down and grab a book. your reading momentum is ${momentum}%`,
    ];
    return { name: 'send_nudge', arguments: { habit_id: habitId, tone: 'gentle', message: pick(msgs) } };
  }

  // Laundry urgency
  const laundryMatch = p.match(/clean gym clothes:\s*(\d+)\/(\d+).*?runs out in ~(\d+) days \((\w+)\)/);
  if (laundryMatch) {
    const clean = laundryMatch[1];
    const days = laundryMatch[3];
    const urgency = laundryMatch[4];
    if (urgency === 'critical' || urgency === 'high') {
      aiLog('gemma', `Mock branch: laundry urgency ${urgency} → send_nudge`);
      const msgs = [
        `heads up you only have ${clean} clean gym outfits left, that's like ${days} days. throw a load in tonight?`,
        `laundry check: ${clean} clean sets left, ~${days} days. don't wait til you're sniffing clothes lol`,
      ];
      const lid = habits.find((h) => h.id.includes('laundry'))?.id ?? 'laundry';
      return { name: 'send_nudge', arguments: { habit_id: lid, tone: urgency === 'critical' ? 'firm' : 'gentle', message: pick(msgs) } };
    }
  }

  // Recovery mode — extra gentle
  const recoveryHabit = available.find((h) => h.recovery);
  if (recoveryHabit) {
    aiLog('gemma', `Mock branch: recovery ${recoveryHabit.name} → send_nudge`);
    const msgs = [
      `i know ${recoveryHabit.name} has been tough lately. no pressure, but even 5 min would start turning things around 💛`,
      `${recoveryHabit.name} is at ${recoveryHabit.momentum}%... that's ok. tiny steps count. what if you just did the smallest version today?`,
    ];
    return { name: 'send_nudge', arguments: { habit_id: recoveryHabit.id, tone: 'gentle', message: pick(msgs) } };
  }

  // Low momentum
  if (momentum < 40) {
    aiLog('gemma', `Mock branch: low momentum ${momentum}% → send_nudge`);
    const msgs = [
      `hey your ${habitName} momentum is only ${momentum}%... no pressure but even a tiny session would help. you free?`,
      `${habitName} is at ${momentum}% momentum. i know it's hard to start but just 5 min? that's all it takes to turn it around`,
    ];
    return { name: 'send_nudge', arguments: { habit_id: habitId, tone: 'gentle', message: pick(msgs) } };
  }

  // All habits on cooldown
  if (available.length === 0 && habits.length > 0) {
    aiLog('gemma', 'Mock branch: all on cooldown → delay_nudge');
    return { name: 'delay_nudge', arguments: { habit_id: habits[0].id, reason: `all habits on cooldown — giving them space` } };
  }

  // Default — nothing urgent
  aiLog('gemma', `Mock branch: default — nothing urgent → delay_nudge`);
  return {
    name: 'delay_nudge',
    arguments: { habit_id: habitId, reason: `everything looks good — ${habitName} at ${momentum}%, checking back later` },
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
