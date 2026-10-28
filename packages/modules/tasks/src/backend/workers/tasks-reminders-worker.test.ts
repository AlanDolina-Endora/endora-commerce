import { describe, expect, it, vi } from 'vitest';
import { ModuleDisabledError } from '@endora-commerce/platform/kernel';
import { getTenantContext } from '@endora-commerce/platform/tenancy';
import {
  createTasksRemindersJob,
  startTasksReminders,
  TASKS_DIGEST_EVERY_MS,
  TASKS_DIGEST_SCOPE_REASON,
  TASKS_REMINDERS_EVERY_MS,
  TASKS_REMINDERS_QUEUE,
  TASKS_REMINDERS_SCHEDULER_ID,
  TASKS_REMINDERS_SCOPE_REASON,
  type TaskSweepPass,
} from './tasks-reminders-worker.js';

/** BullMQ, stood in for: what is held here is what this module hands it, and no connection is opened. */
const bull = vi.hoisted(() => ({
  queues: [] as Array<{ name: string; upsertJobScheduler: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }>,
  workers: [] as Array<{ name: string; processor: () => Promise<unknown>; options: Record<string, unknown> }>,
}));
vi.mock('bullmq', () => ({
  Queue: class {
    readonly upsertJobScheduler = vi.fn(async () => undefined);
    readonly close = vi.fn(async () => undefined);
    constructor(readonly name: string) {
      bull.queues.push(this);
    }
  },
  Worker: class {
    constructor(
      readonly name: string,
      readonly processor: () => Promise<unknown>,
      readonly options: Record<string, unknown>,
    ) {
      bull.workers.push(this);
    }
  },
}));

const log = () => ({ warn: vi.fn() });

function pass(scopeReason: string, hasWork: () => Promise<boolean> = async () => true) {
  const scopes: Array<string | undefined> = [];
  const run = vi.fn(async (_now: Date) => {
    scopes.push(getTenantContext()?.actor.kind);
  });
  const probe = vi.fn(hasWork);
  const value: TaskSweepPass = { scopeReason, hasWork: probe, run };
  return { value, run, probe, scopes };
}

describe('the tasks-reminders worker (R-17, R-18)', () => {
  it('names a queue BullMQ accepts, ticks every minute and runs the digest at most every fifteen', () => {
    expect(TASKS_REMINDERS_QUEUE).toBe('tasks-reminders');
    expect(TASKS_REMINDERS_SCHEDULER_ID).toBe(TASKS_REMINDERS_QUEUE);
    expect(TASKS_REMINDERS_EVERY_MS).toBe(60_000);
    expect(TASKS_DIGEST_EVERY_MS).toBe(15 * 60_000);
  });

  it('asks nothing, opens nothing and runs nothing while Tasks is off', async () => {
    const reminders = pass(TASKS_REMINDERS_SCOPE_REASON);
    const digest = pass(TASKS_DIGEST_SCOPE_REASON);
    const job = createTasksRemindersJob({ isPresent: () => false, reminders: reminders.value, digest: digest.value, log: log() });

    await job(new Date('2032-01-01T08:00:00Z'));

    for (const p of [reminders, digest]) {
      expect(p.probe).not.toHaveBeenCalled();
      expect(p.run).not.toHaveBeenCalled();
    }
  });

  it('runs a pass inside the system scope only when its probe says there is work', async () => {
    const reminders = pass(TASKS_REMINDERS_SCOPE_REASON, async () => false);
    const digest = pass(TASKS_DIGEST_SCOPE_REASON, async () => true);
    const job = createTasksRemindersJob({ isPresent: () => true, reminders: reminders.value, digest: digest.value, log: log() });

    await job(new Date('2032-01-01T08:00:00Z'));

    expect(reminders.probe).toHaveBeenCalledTimes(1);
    expect(reminders.run).not.toHaveBeenCalled();
    expect(digest.run).toHaveBeenCalledTimes(1);
    expect(digest.scopes).toEqual(['system']);
  });

  it('counts a probe that cannot answer as work', async () => {
    const reminders = pass(TASKS_REMINDERS_SCOPE_REASON, async () => {
      throw new Error('no database');
    });
    const job = createTasksRemindersJob({
      isPresent: () => true,
      reminders: reminders.value,
      digest: pass(TASKS_DIGEST_SCOPE_REASON, async () => false).value,
      log: log(),
    });
    await job(new Date('2032-01-01T08:00:00Z'));
    expect(reminders.run).toHaveBeenCalledTimes(1);
  });

  it('runs the reminders every tick and the digest when fifteen minutes have passed since its last pass', async () => {
    const reminders = pass(TASKS_REMINDERS_SCOPE_REASON);
    const digest = pass(TASKS_DIGEST_SCOPE_REASON);
    const job = createTasksRemindersJob({ isPresent: () => true, reminders: reminders.value, digest: digest.value, log: log() });
    const start = Date.parse('2032-01-01T08:00:00Z');

    for (let minute = 0; minute <= 30; minute += 1) await job(new Date(start + minute * 60_000));

    expect(reminders.run).toHaveBeenCalledTimes(31);
    expect(digest.run.mock.calls.map(([now]) => (now.getTime() - start) / 60_000)).toEqual([0, 15, 30]);
  });

  it('logs a failed pass and goes on — the next tick is the retry — but never absorbs a module switched off', async () => {
    const failing = pass(TASKS_REMINDERS_SCOPE_REASON);
    failing.run.mockRejectedValueOnce(new Error('boom'));
    const digest = pass(TASKS_DIGEST_SCOPE_REASON);
    const logger = log();
    const job = createTasksRemindersJob({ isPresent: () => true, reminders: failing.value, digest: digest.value, log: logger });

    await job(new Date('2032-01-01T08:00:00Z'));
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(digest.run).toHaveBeenCalledTimes(1);

    failing.run.mockRejectedValueOnce(new ModuleDisabledError('tasks'));
    await expect(job(new Date('2032-01-01T08:01:00Z'))).rejects.toBeInstanceOf(ModuleDisabledError);
  });

  it.each([
    ['the process runs none', { processRunsWorkers: false, moduleQueueRedis: {} as never }],
    ['the composition offers no connection', { processRunsWorkers: true, moduleQueueRedis: undefined }],
  ])('builds no consumer and installs no schedule where %s', async (_where, host) => {
    const attach = vi.fn();
    const onClose = vi.fn();
    expect(await startTasksReminders({ job: async () => undefined, attach, onClose, ...host })).toBe(false);
    expect(attach).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('where the process consumes queues: one consumer through the seam, one tick at a time, the schedule installed', async () => {
    bull.queues.length = 0;
    bull.workers.length = 0;
    const attach = vi.fn();
    const closers: Array<() => Promise<void>> = [];
    const job = vi.fn(async () => undefined);

    const started = await startTasksReminders({
      job,
      processRunsWorkers: true,
      moduleQueueRedis: {} as never,
      attach,
      onClose: (close) => closers.push(close),
    });

    expect(started).toBe(true);
    expect(bull.workers).toHaveLength(1);
    expect(bull.workers[0]!.name).toBe(TASKS_REMINDERS_QUEUE);
    expect(bull.workers[0]!.options).toMatchObject({ concurrency: 1 });
    expect(attach).toHaveBeenCalledWith(bull.workers[0]);
    expect(bull.queues[0]!.upsertJobScheduler).toHaveBeenCalledWith(
      TASKS_REMINDERS_SCHEDULER_ID,
      { every: TASKS_REMINDERS_EVERY_MS },
      { name: 'sweep', data: {} },
    );
    await bull.workers[0]!.processor();
    expect(job).toHaveBeenCalledTimes(1);
    await closers[0]!();
    expect(bull.queues[0]!.close).toHaveBeenCalled();
  });
});
