export type LogSource = 'cactus' | 'gemma' | 'agent' | 'nudge' | 'context';

export interface AILogEntry {
  id: number;
  timestamp: number;
  source: LogSource;
  message: string;
}

type LogListener = (entry: AILogEntry) => void;

let nextId = 1;
const MAX_ENTRIES = 200;

class AILoggerService {
  private entries: AILogEntry[] = [];
  private listeners: LogListener[] = [];

  log(source: LogSource, message: string): void {
    const entry: AILogEntry = {
      id: nextId++,
      timestamp: Date.now(),
      source,
      message,
    };
    this.entries.push(entry);
    if (this.entries.length > MAX_ENTRIES) {
      this.entries = this.entries.slice(-MAX_ENTRIES);
    }
    this.listeners.forEach((l) => l(entry));

    // Also forward to console for Metro debugging
    const tag = `[${source.toUpperCase()}]`;
    console.log(tag, message);
  }

  getEntries(): AILogEntry[] {
    return [...this.entries];
  }

  subscribe(listener: LogListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  clear(): void {
    this.entries = [];
  }
}

export const aiLogger = new AILoggerService();

export function aiLog(source: LogSource, message: string): void {
  aiLogger.log(source, message);
}
