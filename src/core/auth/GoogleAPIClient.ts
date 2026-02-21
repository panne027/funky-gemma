import { googleAuth } from './GoogleAuthService';
import { aiLog } from '../logging/AILogger';

const CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3';
const TASKS_BASE = 'https://www.googleapis.com/tasks/v1';

export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  location?: string;
  description?: string;
}

export interface GoogleTaskList {
  id: string;
  title: string;
}

export interface GoogleTask {
  id: string;
  title: string;
  status: 'needsAction' | 'completed';
  due?: string;
  notes?: string;
}

async function authFetch(url: string, options: RequestInit = {}): Promise<any> {
  const token = await googleAuth.getAccessToken();
  if (!token) throw new Error('Not authenticated — sign in with Google first');

  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Google API ${res.status}: ${body.slice(0, 200)}`);
  }

  return res.json();
}

// ─── Calendar API ────────────────────────────────────────────────────────────

export async function fetchCalendarEvents(
  timeMin: Date,
  timeMax: Date,
  maxResults = 20,
): Promise<GoogleCalendarEvent[]> {
  const params = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    maxResults: String(maxResults),
    singleEvents: 'true',
    orderBy: 'startTime',
  });

  const data = await authFetch(`${CALENDAR_BASE}/calendars/primary/events?${params}`);
  const events: GoogleCalendarEvent[] = (data.items ?? []).map((item: any) => ({
    id: item.id,
    summary: item.summary ?? 'Untitled',
    start: item.start?.dateTime ?? item.start?.date ?? '',
    end: item.end?.dateTime ?? item.end?.date ?? '',
    location: item.location,
    description: item.description,
  }));

  aiLog('context', `Fetched ${events.length} Google Calendar events`);
  return events;
}

export async function createCalendarEvent(
  summary: string,
  startTime: Date,
  endTime: Date,
  description?: string,
): Promise<string> {
  const body = {
    summary,
    start: { dateTime: startTime.toISOString() },
    end: { dateTime: endTime.toISOString() },
    description: description ?? 'Created by Nudgy-Nudge',
    reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 5 }] },
  };

  const data = await authFetch(`${CALENDAR_BASE}/calendars/primary/events`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

  aiLog('agent', `Created Google Calendar event: "${summary}" (${data.id})`);
  return data.id;
}

// ─── Tasks API (Shopping Lists / Task Lists) ─────────────────────────────────

export async function fetchTaskLists(): Promise<GoogleTaskList[]> {
  const data = await authFetch(`${TASKS_BASE}/users/@me/lists`);
  const lists: GoogleTaskList[] = (data.items ?? []).map((item: any) => ({
    id: item.id,
    title: item.title,
  }));

  aiLog('context', `Fetched ${lists.length} Google Task lists`);
  return lists;
}

export async function fetchTasks(taskListId: string): Promise<GoogleTask[]> {
  const data = await authFetch(`${TASKS_BASE}/lists/${taskListId}/tasks?showCompleted=false`);
  return (data.items ?? []).map((item: any) => ({
    id: item.id,
    title: item.title,
    status: item.status,
    due: item.due,
    notes: item.notes,
  }));
}

export async function addTask(
  taskListId: string,
  title: string,
  notes?: string,
  due?: string,
): Promise<GoogleTask> {
  const body: any = { title };
  if (notes) body.notes = notes;
  if (due) body.due = due;

  const data = await authFetch(`${TASKS_BASE}/lists/${taskListId}/tasks`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

  aiLog('agent', `Added task "${title}" to list ${taskListId}`);
  return { id: data.id, title: data.title, status: data.status, due: data.due, notes: data.notes };
}

export async function completeTask(taskListId: string, taskId: string): Promise<void> {
  await authFetch(`${TASKS_BASE}/lists/${taskListId}/tasks/${taskId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'completed' }),
  });
  aiLog('agent', `Completed task ${taskId}`);
}

export async function createTaskList(title: string): Promise<GoogleTaskList> {
  const data = await authFetch(`${TASKS_BASE}/users/@me/lists`, {
    method: 'POST',
    body: JSON.stringify({ title }),
  });

  aiLog('agent', `Created task list "${title}" (${data.id})`);
  return { id: data.id, title: data.title };
}

// ─── Shopping List Helpers ───────────────────────────────────────────────────

const SHOPPING_LIST_TITLE = 'Nudgy-Nudge Shopping';

let cachedShoppingListId: string | null = null;

export async function getOrCreateShoppingList(): Promise<string> {
  if (cachedShoppingListId) return cachedShoppingListId;

  const lists = await fetchTaskLists();
  const existing = lists.find((l) => l.title === SHOPPING_LIST_TITLE);
  if (existing) {
    cachedShoppingListId = existing.id;
    return existing.id;
  }

  const newList = await createTaskList(SHOPPING_LIST_TITLE);
  cachedShoppingListId = newList.id;
  return newList.id;
}

export async function addShoppingItem(item: string, notes?: string): Promise<GoogleTask> {
  const listId = await getOrCreateShoppingList();
  return addTask(listId, item, notes);
}

export async function getShoppingItems(): Promise<GoogleTask[]> {
  const listId = await getOrCreateShoppingList();
  return fetchTasks(listId);
}
