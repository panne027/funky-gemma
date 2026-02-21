// ─── Habit State Model ───────────────────────────────────────────────────────

export type NudgeTone = 'gentle' | 'firm' | 'playful';

export type NudgeOutcome = 'completed' | 'dismissed' | 'snoozed' | 'ignored';

export interface NudgeRecord {
  timestamp: number;
  tone: NudgeTone;
  message: string;
  outcome: NudgeOutcome | null;
}

export interface TimeWindow {
  startHour: number; // 0–23
  endHour: number;
  dayOfWeek: number[]; // 0=Sun .. 6=Sat
  weight: number; // how strongly preferred, 0–1
}

export interface HabitState {
  id: string;
  name: string;
  category: 'fitness' | 'hygiene' | 'learning' | 'health' | 'custom';
  streak_count: number;
  last_completion_timestamp: number | null;
  completion_rate_7d: number; // 0–1
  preferred_time_windows: TimeWindow[];
  resistance_score: number; // 0–1, how much the user resists this habit
  friction_score: number; // dynamic, 0–1, current environmental friction
  momentum_score: number; // 0–100
  cooldown_until: number; // unix timestamp, 0 if no cooldown
  recent_nudge_outcomes: NudgeRecord[];
  created_at: number;
  metadata: Record<string, unknown>;
}

// ─── Laundry-Specific State ──────────────────────────────────────────────────

export interface LaundryState extends HabitState {
  category: 'hygiene';
  metadata: {
    total_gym_clothes: number;
    clean_count: number;
    dirty_count: number;
    last_wash_timestamp: number | null;
    gym_days: number[]; // day-of-week indices when user goes to gym
    avg_clothes_per_session: number;
    depletion_rate: number; // clothes consumed per day
    predicted_depletion_date: number | null;
  };
}

// ─── Context Signals ─────────────────────────────────────────────────────────

export type MotionState = 'still' | 'walking' | 'running' | 'driving' | 'unknown';

export interface ContextSnapshot {
  timestamp: number;
  time_of_day: {
    hour: number;
    minute: number;
    dayOfWeek: number;
    isWeekend: boolean;
  };
  calendar: {
    current_event: string | null;
    next_event: string | null;
    next_event_in_minutes: number | null;
    free_block_minutes: number;
    just_ended_event: string | null;
  };
  screen: {
    is_active: boolean;
    continuous_usage_minutes: number;
    foreground_app: string | null;
  };
  motion: {
    state: MotionState;
    duration_minutes: number;
  };
  scroll: {
    continuous_scroll_minutes: number;
    is_doom_scrolling: boolean;
  };
  notifications: {
    recent_interaction_count: number;
    last_nudge_response: NudgeOutcome | null;
  };
  battery: {
    level: number;
    is_charging: boolean;
  };
  health: {
    steps_today: number;
    sleep_hours_last_night: number | null;
    resting_heart_rate: number | null;
    active_minutes_today: number;
    exercise_sessions_today: number;
    last_exercise_type: string | null;
    last_exercise_timestamp: number | null;
    calories_burned_today: number;
  };
  connectivity: {
    is_connected: boolean;
    connection_type: 'wifi' | 'cellular' | 'none';
  };
}

// ─── Routing ─────────────────────────────────────────────────────────────────

export type RoutingDecision = 'local' | 'cloud' | 'mock';

export interface RoutingContext {
  is_connected: boolean;
  battery_level: number;
  prompt_complexity: number;
  recent_local_latency_ms: number;
  recent_cloud_latency_ms: number;
  local_failures: number;
  cloud_failures: number;
}

// ─── Tool Definitions ────────────────────────────────────────────────────────

export interface ToolParameter {
  type: string;
  description: string;
  enum?: string[];
  required?: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, ToolParameter>;
    required: string[];
  };
}

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  success: boolean;
  tool_name: string;
  data: Record<string, unknown>;
  error?: string;
}

// ─── Agent Loop ──────────────────────────────────────────────────────────────

export type AgentTrigger =
  | 'interval'
  | 'calendar_event_ended'
  | 'prolonged_scrolling'
  | 'prolonged_inactivity'
  | 'habit_completed'
  | 'health_milestone'
  | 'sleep_detected'
  | 'exercise_detected'
  | 'manual'
  | 'demo';

export interface AgentCycleResult {
  trigger: AgentTrigger;
  timestamp: number;
  context: ContextSnapshot;
  habit_states: HabitState[];
  prompt_sent: string;
  raw_response: string;
  tool_call: ToolCall | null;
  tool_result: ToolResult | null;
  routing_decision: RoutingDecision;
  cycle_duration_ms: number;
}

// ─── Cactus / FunctionGemma ──────────────────────────────────────────────────

export interface CactusConfig {
  model_path: string;
  n_ctx: number; // context window size
  n_threads: number;
  temperature: number;
  top_p: number;
  max_tokens: number;
}

export interface CactusCompletionRequest {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  tools?: ToolDefinition[];
  max_tokens?: number;
  temperature?: number;
}

export interface CactusCompletionResponse {
  success: boolean;
  response: string;
  function_calls: ToolCall[];
  confidence: number;
  tokens_per_second: number;
  latency_ms: number;
}

// ─── Storage ─────────────────────────────────────────────────────────────────

export interface StorageSchema {
  habits: Record<string, HabitState>;
  agent_history: AgentCycleResult[];
  settings: AppSettings;
  last_context: ContextSnapshot | null;
}

export interface AppSettings {
  agent_interval_minutes: number; // 10–15
  scroll_threshold_minutes: number; // default 15
  inactivity_threshold_minutes: number;
  demo_mode: boolean;
  time_acceleration_factor: number; // for demo mode
  model_loaded: boolean;
  onboarding_complete: boolean;
}

// ─── UI State ────────────────────────────────────────────────────────────────

export interface DemoEvent {
  type: 'scroll' | 'calendar_end' | 'inactivity' | 'habit_complete' | 'time_skip';
  payload: Record<string, unknown>;
  label: string;
}
