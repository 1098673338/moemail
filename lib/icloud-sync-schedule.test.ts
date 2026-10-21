import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { IcloudSyncScheduler, icloudSyncScheduleText, PAUSED_SYNC_SCHEDULE, type IcloudSyncSchedule } from "./icloud-sync-schedule";

const settle = async () => { for (let index = 0; index < 12; index++) await Promise.resolve(); };

function setup(t: TestContext, sync: () => Promise<unknown> = async () => {}) {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 1_000_000 });
  const calls: number[] = [];
  const errors: unknown[] = [];
  let schedule: IcloudSyncSchedule = PAUSED_SYNC_SCHEDULE;
  let retryAt = 0;
  const scheduler = new IcloudSyncScheduler({
    sync: async () => { calls.push(Date.now()); return sync(); },
    retryAt: () => retryAt,
    onChange: (value) => { schedule = value; },
    onError: (error) => { errors.push(error); },
  });
  t.after(() => scheduler.stop());
  return {
    scheduler, calls, errors,
    schedule: () => schedule,
    text: () => icloudSyncScheduleText(schedule, Date.now()),
    retryAt: (value: number) => { retryAt = value; },
    async start() { scheduler.setVisible(true); scheduler.setEnabled(true); await settle(); },
    async tick(milliseconds: number) { t.mock.timers.tick(milliseconds); await settle(); },
  };
}

test("opening the page syncs immediately and shows the decreasing 120-second fast rule", async (t) => {
  const app = setup(t);
  await app.start();
  assert.equal(app.calls.length, 1);
  assert.equal(app.text(), "120s · 2秒1次");
  await app.tick(1000);
  assert.equal(app.text(), "119s · 2秒1次");
  assert.equal(app.calls.length, 1);
  await app.tick(1000);
  assert.equal(app.calls.length, 2);
  assert.equal(app.text(), "118s · 2秒1次");
});

test("fast expiry switches to a 300-second countdown then syncs and restarts that countdown", async (t) => {
  const app = setup(t);
  await app.start();
  await app.tick(120_000);
  assert.equal(app.text(), "300s · 5分钟1次");
  const count = app.calls.length;
  await app.tick(299_000);
  assert.equal(app.calls.length, count);
  assert.equal(app.text(), "1s · 5分钟1次");
  await app.tick(1000);
  assert.equal(app.calls.length, count + 1);
  assert.equal(app.text(), "300s · 5分钟1次");
});

test("manual sync replaces the old slow timer and restarts the fast window at the click", async (t) => {
  const app = setup(t);
  await app.start();
  await app.tick(120_000);
  await app.tick(100_000);
  assert.equal(app.text(), "200s · 5分钟1次");
  let manualCalls = 0;
  await app.scheduler.runManual(async () => { manualCalls++; });
  assert.equal(manualCalls, 1);
  assert.equal(app.text(), "120s · 2秒1次");
  const automaticCalls = app.calls.length;
  await app.tick(2000);
  assert.equal(app.calls.length, automaticCalls + 1);
  await app.tick(118_000);
  assert.equal(app.text(), "300s · 5分钟1次");
});

test("long-running syncs never overlap and the next request waits two seconds after completion", async (t) => {
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => { finish = resolve; });
  const app = setup(t, () => pending);
  await app.start();
  await app.tick(10_000);
  assert.equal(app.calls.length, 1);
  assert.equal(app.schedule().syncing, true);
  assert.equal(app.text(), "110s · 2秒1次");
  finish();
  await settle();
  await app.tick(1999);
  assert.equal(app.calls.length, 1);
  await app.tick(1);
  assert.equal(app.calls.length, 2);
});

test("a manual operation during an automatic request creates only one new timer when all work finishes", async (t) => {
  let finishAuto!: () => void;
  let finishManual!: () => void;
  const auto = new Promise<void>((resolve) => { finishAuto = resolve; });
  const manual = new Promise<void>((resolve) => { finishManual = resolve; });
  const app = setup(t, () => auto);
  await app.start();
  const running = app.scheduler.runManual(() => manual);
  finishAuto();
  await settle();
  assert.equal(app.schedule().syncing, true);
  await app.tick(5000);
  assert.equal(app.calls.length, 1);
  finishManual();
  await running;
  assert.equal(app.text(), "115s · 2秒1次");
  await app.tick(2000);
  assert.equal(app.calls.length, 2);
});

test("background pages pause requests and returning starts a fresh fast window", async (t) => {
  const app = setup(t);
  await app.start();
  app.scheduler.setVisible(false);
  assert.equal(app.text(), "自动同步已暂停");
  await app.tick(600_000);
  assert.equal(app.calls.length, 1);
  app.scheduler.setVisible(true);
  await settle();
  assert.equal(app.calls.length, 2);
  assert.equal(app.text(), "120s · 2秒1次");
});

test("retry backoff displays its real countdown and manual sync bypasses the wait", async (t) => {
  let app: ReturnType<typeof setup>;
  app = setup(t, async () => {
    app.retryAt(Date.now() + 30_000);
    throw new Error("Temporary network failure");
  });
  await app.start();
  assert.equal(app.errors.length, 1);
  assert.equal(app.text(), "30s · 重试");
  await app.tick(29_000);
  assert.equal(app.calls.length, 1);
  assert.equal(app.text(), "1s · 重试");
  await app.scheduler.runManual(async () => { app.retryAt(0); });
  assert.equal(app.text(), "120s · 2秒1次");
});

test("disabling or stopping the scheduler prevents late completions from leaving a timer behind", async (t) => {
  let finish!: () => void;
  const app = setup(t, () => new Promise<void>((resolve) => { finish = resolve; }));
  await app.start();
  app.scheduler.stop();
  finish();
  await settle();
  assert.equal(app.text(), "自动同步已暂停");
  await app.tick(1_000_000);
  assert.equal(app.calls.length, 1);
});

test("slow requests show a sync state rather than a fake next-request countdown", () => {
  assert.equal(icloudSyncScheduleText({ ...PAUSED_SYNC_SCHEDULE, paused: false, syncing: true }, Date.now()), "同步中 · 5分钟1次");
});
