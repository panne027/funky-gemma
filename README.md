# Momentum — Adaptive Habit Nudger Agent

A fully on-device, privacy-first, agentic habit momentum engine powered by **Cactus Compute** and **FunctionGemma** (270M).

This is NOT a reminder app. It is a context-aware intelligent agent that observes local signals, maintains habit state models, reasons about the best action using a local LLM, and executes structured tool calls — all without any cloud dependency.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        React Native App                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │Dashboard │  │ Momentum │  │ Friction │  │  Demo Mode   │   │
│  │  Screen  │  │  Meter   │  │Indicator │  │  Controls    │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬───────┘   │
│       └──────────────┴─────────────┴───────────────┘           │
│                            │ Zustand Store                      │
├────────────────────────────┼────────────────────────────────────┤
│                     AGENT LOOP                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Trigger → Context → Recalculate → Prompt → LLM → Tool  │  │
│  └──────────────────────────────────────────────────────────┘  │
│       │              │             │            │         │      │
│  ┌────┴────┐  ┌──────┴──────┐ ┌───┴────┐ ┌────┴───┐ ┌───┴──┐  │
│  │ Context │  │ Habit State │ │ Prompt │ │Cactus  │ │ Tool │  │
│  │Aggregat.│  │   Engine    │ │Builder │ │Runtime │ │Execut│  │
│  └────┬────┘  └──────┬──────┘ └────────┘ └───┬────┘ └───┬──┘  │
│  ┌────┴────┐  ┌──────┴──────┐           ┌────┴─────┐ ┌──┴───┐ │
│  │Signals: │  │ Momentum   │           │Function  │ │Notif.│ │
│  │Time,Cal,│  │ Calculator │           │ Gemma    │ │Dispa.│ │
│  │Motion,  │  │ Laundry    │           │ Client   │ │      │ │
│  │Screen,  │  │ Predictor  │           │(270M-IT) │ │      │ │
│  │Scroll   │  └─────────────┘           └──────────┘ └──────┘ │
├─────────────────────────────────────────────────────────────────┤
│                    LOCAL STORAGE                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  AsyncStorage: habits, agent_history, settings, context  │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Component Connections

| Component | Connects To | Purpose |
|-----------|-------------|---------|
| **Cactus Runtime** | FunctionGemma Client | Loads GGUF model, runs inference, returns completions |
| **FunctionGemma Client** | Agent Loop | Wraps Cactus with tool schemas, validates output |
| **Context Aggregator** | All Signal Providers → Agent Loop | Builds unified `ContextSnapshot` from local signals |
| **Habit State Engine** | Momentum Calculator, Laundry Predictor, Storage | Manages all habit state transitions |
| **Agent Loop** | All components | Orchestrates the trigger → decide → execute cycle |
| **Tool Executor** | Tool Handlers → Notification Dispatcher, Storage | Deterministic dispatch of LLM tool calls |
| **Notification Dispatcher** | OS notification API, in-app UI | Delivers nudges via native notifications + UI |
| **Local Storage** | AsyncStorage | Persists all data on-device |

## Data Schema

### HabitState

```typescript
interface HabitState {
  id: string;
  name: string;
  category: 'fitness' | 'hygiene' | 'learning' | 'health' | 'custom';
  streak_count: number;
  last_completion_timestamp: number | null;
  completion_rate_7d: number;         // 0–1
  preferred_time_windows: TimeWindow[];
  resistance_score: number;           // 0–1
  friction_score: number;             // dynamic, 0–1
  momentum_score: number;             // 0–100
  cooldown_until: number;             // unix timestamp
  recent_nudge_outcomes: NudgeRecord[];
  metadata: Record<string, unknown>;  // extensible per-habit data
}
```

### Momentum Formula

```
momentum_score = clamp(raw * 100, 0, 100)

raw = (0.25 * streakFactor)
    + (0.30 * recencyFactor)
    + (0.25 * completion_rate_7d)
    - (0.10 * friction_score)
    - (0.10 * resistance_score)

streakFactor = min(streak / 14, 1.0)
recencyFactor = 0.5 ^ (hours_since_last / 36)
```

## Tool Definitions

| Tool | Description | Parameters |
|------|-------------|------------|
| `send_nudge` | Send a context-aware habit nudge | `habit_id`, `tone` (gentle\|firm\|playful), `message` |
| `update_habit_state` | Update a specific habit field | `habit_id`, `field`, `value` |
| `increase_cooldown` | Prevent nudges for N minutes | `habit_id`, `minutes` |
| `delay_nudge` | Explicitly decide NOT to nudge | `habit_id`, `reason` |

## Agent Loop

```
TRIGGER CONDITIONS:
  • Every 10–15 minutes (jittered)
  • After calendar event ends
  • After prolonged scrolling (>15 min)
  • After prolonged inactivity (>30 min)
  • After habit completion
  • Manual / demo trigger

CYCLE:
  1. getContextSnapshot()           → ContextSnapshot
  2. habitEngine.recalculateAll()   → Updated friction, resistance, momentum
  3. buildSystemPrompt()            → System prompt with tool schemas + rules
  4. buildUserPrompt()              → User prompt with context + all habit states
  5. functionGemma.decide()         → ToolCall (via Cactus on-device inference)
  6. toolExecutor.execute()         → Deterministic tool execution
  7. storage.appendCycleResult()    → Persist full cycle for audit
  8. emit to UI listeners           → Real-time dashboard update
```

## FunctionGemma Prompt Template

```
SYSTEM:
You are an adaptive habit momentum agent running locally on the user's
device. Your job is to decide the single best action to take right now
based on the user's context and habit states.

RULES:
- Return exactly ONE function call as a JSON object
- Avoid nagging: respect cooldowns and resistance scores
- Prefer high-probability time windows
- If momentum is critical, be extra gentle
- If no action is warranted, use delay_nudge with a reason

AVAILABLE TOOLS:
  send_nudge, update_habit_state, increase_cooldown, delay_nudge

USER:
CURRENT CONTEXT:
  Time: 18:30 (weekday)
  Calendar: Free
  Free block: 120 min
  Screen active: 25 min (Instagram)
  Motion: still for 30 min
  Scrolling: 22 min [DOOM SCROLLING]

HABIT STATES:
  Gym Workout (gym):
    Momentum: 62/100 [building]
    Streak: 4 days | 7d rate: 71%
    Friction: 0.10 | Resistance: 0.20
    Cooldown: none

  Gym Laundry (laundry):
    Momentum: 35/100 [building]
    Clean clothes: 3/7
    Depletion in: 2 days [medium]

OUTPUT:
{"name": "send_nudge", "arguments": {"habit_id": "gym", "tone": "playful", "message": "You've been scrolling for 22 minutes — your gym window is wide open. How about a quick session?"}}
```

## Example Tool Call Output

```json
{
  "name": "send_nudge",
  "arguments": {
    "habit_id": "gym",
    "tone": "playful",
    "message": "You've been scrolling a while — your gym window is open. How about a quick session?"
  }
}
```

→ ToolExecutor dispatches to `handleSendNudge`
→ NotificationDispatcher sends local notification
→ HabitEngine records nudge outcome (pending)
→ Storage persists cycle result

## Laundry Depletion Algorithm

```
Inputs:
  clean_count, gym_days[], avg_clothes_per_session

Algorithm:
  1. Project upcoming gym days for next 14 days
  2. For each gym day, subtract avg_clothes_per_session from clean_count
  3. Find the day when clean_count reaches 0
  4. Recommend washing 1–2 days before depletion
  5. Classify urgency: none | low | medium | high | critical
  6. Feed urgency into friction_score for the laundry habit
```

## Folder Structure

```
funky-gemma/
├── App.tsx                              # Entry point
├── index.js                             # RN registration
├── package.json
├── tsconfig.json
├── babel.config.js
├── app.json
├── README.md
└── src/
    ├── types/
    │   └── index.ts                     # All TypeScript interfaces
    ├── core/
    │   ├── cactus/
    │   │   ├── CactusRuntime.ts         # Cactus inference wrapper
    │   │   └── FunctionGemmaClient.ts   # FunctionGemma integration
    │   ├── agent/
    │   │   ├── AgentLoop.ts             # Core agent decision loop
    │   │   └── PromptBuilder.ts         # System + user prompt construction
    │   ├── context/
    │   │   ├── ContextAggregator.ts     # Unified context snapshot builder
    │   │   └── signals/
    │   │       ├── TimeSignal.ts        # Time of day, day of week
    │   │       ├── CalendarSignal.ts    # Calendar events + free blocks
    │   │       ├── MotionSignal.ts      # Physical activity state
    │   │       ├── ScreenTimeSignal.ts  # Screen usage tracking
    │   │       └── ScrollSignal.ts      # Doom-scroll detection
    │   ├── habits/
    │   │   ├── HabitStateEngine.ts      # Central habit state authority
    │   │   ├── MomentumCalculator.ts    # Deterministic momentum formula
    │   │   └── LaundryPredictor.ts      # Predictive depletion algorithm
    │   ├── tools/
    │   │   ├── definitions.ts           # Tool schemas for FunctionGemma
    │   │   ├── ToolExecutor.ts          # Deterministic dispatch layer
    │   │   └── handlers/
    │   │       ├── SendNudge.ts
    │   │       ├── UpdateHabitState.ts
    │   │       ├── IncreaseCooldown.ts
    │   │       └── DelayNudge.ts
    │   ├── notifications/
    │   │   └── NotificationDispatcher.ts
    │   └── storage/
    │       └── LocalStorage.ts          # AsyncStorage persistence layer
    └── ui/
        ├── store.ts                     # Zustand state store
        ├── theme.ts                     # Design tokens
        ├── screens/
        │   └── DashboardScreen.tsx      # Main screen
        ├── components/
        │   ├── MomentumMeter.tsx        # Animated momentum gauge
        │   ├── FrictionIndicator.tsx    # Friction + resistance bars
        │   ├── NudgeExplanation.tsx     # Agent decision explanation panel
        │   ├── StabilityForecast.tsx    # Momentum decay predictions
        │   ├── RecoveryMode.tsx         # Recovery mode alert
        │   └── HabitCard.tsx            # Individual habit card
        └── demo/
            └── DemoMode.tsx             # Full demo simulation panel
```

## MVP Implementation Plan (24–48 hours)

### Hour 0–6: Foundation
- [x] Project scaffold + dependencies
- [x] Type definitions
- [x] Storage layer
- [x] Momentum calculator + formulas

### Hour 6–12: Agent Core
- [x] Cactus runtime wrapper
- [x] FunctionGemma client
- [x] Tool definitions + handlers
- [x] Tool executor
- [x] Context aggregator + all signals

### Hour 12–18: Agent Loop + Prompts
- [x] Prompt builder (system + user)
- [x] Agent loop with trigger conditions
- [x] Habit state engine integration
- [x] Laundry predictor

### Hour 18–30: UI + Demo
- [x] Theme + design system
- [x] Momentum meter (animated)
- [x] Friction/resistance indicators
- [x] Nudge explanation panel
- [x] Stability forecast
- [x] Recovery mode display
- [x] Habit cards
- [x] Dashboard screen
- [x] Demo mode with simulation controls

### Hour 30–42: Integration + Testing
- [ ] Download FunctionGemma GGUF to device
- [ ] Test real on-device inference
- [ ] Native notification channel setup
- [ ] Calendar API integration (real device)
- [ ] Motion/activity recognition hookup

### Hour 42–48: Polish
- [ ] End-to-end flow testing
- [ ] Performance profiling (inference latency)
- [ ] Memory optimization
- [ ] Demo walkthrough recording

## Running

```bash
# Install dependencies
npm install && npx pod-install

# Download FunctionGemma model (place in /models)
# Get from: https://huggingface.co/unsloth/functiongemma-270m-it-GGUF

# Start Metro bundler
npm start

# Run on iOS
npm run ios

# Run on Android
npm run android
```

## Key Design Decisions

1. **React Native over Web PWA**: Native access to calendar, motion, notifications, and background execution. Cactus has first-class RN support.

2. **FunctionGemma 270M**: Tiny enough for mobile RAM (~150MB quantized), fast enough for real-time decisions (>100 tok/s), purpose-built for function calling.

3. **Mock mode**: CactusRuntime gracefully degrades when the native module isn't linked, producing realistic mock tool calls for development and testing.

4. **Deterministic tool execution**: The LLM decides WHAT to do; the ToolExecutor handles HOW deterministically. No ambiguity in execution.

5. **Event-driven, not cron**: The agent loop responds to meaningful triggers, not fixed schedules. Scroll detection, calendar events, and inactivity patterns drive decisions.

## Privacy

- All inference runs on-device via Cactus
- All habit data stored locally via AsyncStorage
- No network calls, no telemetry, no cloud
- FunctionGemma model weights bundled in app
