import { api } from './api';
import { enqueueSync, listRuns, listSyncQueue, mergeRunsFromServer, removeSyncQueue, saveRun } from './db';

export async function flushSyncQueue() {
  const queue = await listSyncQueue();
  if (!queue.length) return { pushed: 0 };

  const runs = queue.map((q) => q.run);
  let result;
  try {
    result = await api.syncPush({ runs });
  } catch {
    return { pushed: 0, queued: queue.length };
  }
  // Only drop queue entries the server acknowledged; anything else is retried next flush.
  let pushed = 0;
  for (const synced of result.runs || []) {
    const item = queue.find((q) => q.run.id === synced.id);
    if (!item) continue;
    await saveRun({ ...item.run, synced: true, synced_at: synced.synced_at });
    await removeSyncQueue(item.id);
    pushed += 1;
  }
  return { pushed, queued: queue.length - pushed };
}

export async function pullRemoteRuns(since) {
  try {
    let cursor = since;
    let total = 0;
    for (;;) {
      const { runs, has_more } = await api.syncPull(cursor);
      if (runs?.length) {
        await mergeRunsFromServer(runs);
        total += runs.length;
        cursor = runs[runs.length - 1].synced_at;
      }
      if (!has_more || !runs?.length) break;
    }
    return total;
  } catch {
    return 0;
  }
}

export async function completeRun(run) {
  const payload = {
    ...run,
    synced: false,
    synced_at: null,
  };
  await saveRun(payload);

  let result;
  try {
    result = await api.syncPush({ runs: [payload] });
  } catch {
    await enqueueSync({ id: payload.id, run: payload });
    return { synced: false, queued: true };
  }
  const syncedAt = result.runs?.[0]?.synced_at;
  await saveRun({ ...payload, synced: true, synced_at: syncedAt });
  return { synced: true };
}

export async function getAllRunsLocal() {
  return listRuns();
}

export async function latestSyncCursor() {
  const runs = await listRuns();
  const synced = runs.filter((r) => r.synced_at).sort((a, b) => b.synced_at.localeCompare(a.synced_at));
  return synced[0]?.synced_at ?? null;
}
