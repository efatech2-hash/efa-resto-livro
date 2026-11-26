import {useEffect, useState} from 'react';
import type {SupabaseClient} from '@supabase/supabase-js';

export type NewOfflineOperation =
  | {
      type: 'insert';
      table: string;
      payload: Record<string, unknown>;
      description: string;
    }
  | {
      type: 'update';
      table: string;
      match: Record<string, unknown>;
      payload: Record<string, unknown>;
      description: string;
    };

export type OfflineOperation = NewOfflineOperation & {
  id: string;
  createdAt: string;
};

const QUEUE_KEY = 'efa_offline_queue_v1';
const CACHE_PREFIX = 'efa_workspace_cache_v1_';

export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  return isOnline;
}

export function getOfflineQueue(): OfflineOperation[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function enqueueOfflineOp(op: NewOfflineOperation): OfflineOperation[] {
  const current = getOfflineQueue();
  const next: OfflineOperation[] = [
    ...current,
    {
      ...op,
      id: `op_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
    } as OfflineOperation,
  ];
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage quota issues
  }
  return next;
}

export function saveCachedWorkspace<T>(etabId: string, data: T): void {
  try {
    localStorage.setItem(`${CACHE_PREFIX}${etabId}`, JSON.stringify(data));
  } catch {
    // Ignore quota limits
  }
}

export function loadCachedWorkspace<T>(etabId: string): T | null {
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${etabId}`);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function flushOfflineQueue(client: SupabaseClient): Promise<{
  synced: number;
  remaining: number;
  errors: string[];
}> {
  const queue = getOfflineQueue();
  if (queue.length === 0) {
    return {synced: 0, remaining: 0, errors: []};
  }

  const remaining: OfflineOperation[] = [];
  const errors: string[] = [];
  let synced = 0;

  for (const op of queue) {
    try {
      if (op.type === 'insert') {
        const {error} = await client.from(op.table).insert(op.payload);
        if (error) {
          errors.push(`${op.description}: ${error.message}`);
          remaining.push(op);
        } else {
          synced += 1;
        }
      } else if (op.type === 'update') {
        let query = client.from(op.table).update(op.payload);
        for (const [col, val] of Object.entries(op.match)) {
          query = query.eq(col, val);
        }
        const {error} = await query;
        if (error) {
          errors.push(`${op.description}: ${error.message}`);
          remaining.push(op);
        } else {
          synced += 1;
        }
      }
    } catch (err) {
      errors.push(`${op.description}: ${String(err)}`);
      remaining.push(op);
    }
  }

  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
  } catch {
    // Ignore
  }

  return {synced, remaining: remaining.length, errors};
}
