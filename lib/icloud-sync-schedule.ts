export const ICLOUD_FAST_SYNC_INTERVAL = 2_000;
export const ICLOUD_FAST_SYNC_DURATION = 120_000;
export const ICLOUD_SYNC_INTERVAL = 500_000;

export type IcloudSyncSchedule = {
  fastUntil: number;
  nextAt: number | null;
  retryAt: number;
  syncing: boolean;
  paused: boolean;
};

export const PAUSED_SYNC_SCHEDULE: IcloudSyncSchedule = {
  fastUntil: 0, nextAt: null, retryAt: 0, syncing: false, paused: true,
};

/** Owns the request timer and the timestamps displayed by the countdown. */
export class IcloudSyncScheduler {
  private enabled = false;
  private visible = false;
  private running = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private fastUntil = 0;

  constructor(private options: {
    sync: () => Promise<unknown>;
    retryAt: () => number;
    onError: (error: unknown) => void;
    onChange: (schedule: IcloudSyncSchedule) => void;
  }) {}

  updateCallbacks(options: {
    sync: () => Promise<unknown>;
    retryAt: () => number;
    onError: (error: unknown) => void;
  }) {
    Object.assign(this.options, options);
  }

  setEnabled(enabled: boolean) {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    if (enabled && this.visible) this.restart();
    else this.publish();
  }

  setVisible(visible: boolean) {
    if (this.visible === visible) return;
    this.visible = visible;
    if (visible && this.enabled) this.restart();
    else this.publish();
  }

  private restart() {
    this.fastUntil = Date.now() + ICLOUD_FAST_SYNC_DURATION;
    this.clearTimer();
    if (this.running) this.publish();
    else void this.runAutomatic();
  }

  async runManual<T>(action: () => Promise<T>) {
    this.fastUntil = Date.now() + ICLOUD_FAST_SYNC_DURATION;
    return this.run(action);
  }

  private async runAutomatic() {
    if (!this.enabled || !this.visible || this.running) return;
    if (this.options.retryAt() > Date.now()) {
      this.scheduleNext();
      return;
    }
    try { await this.run(this.options.sync); }
    catch (error) { this.options.onError(error); }
  }

  private async run<T>(action: () => Promise<T>) {
    this.clearTimer();
    this.running++;
    this.publish();
    try { return await action(); }
    finally {
      this.running--;
      if (!this.running) this.scheduleNext();
      else this.publish();
    }
  }

  private scheduleNext() {
    this.clearTimer();
    if (!this.enabled || !this.visible || this.running) {
      this.publish();
      return;
    }
    const now = Date.now();
    const fast = now < this.fastUntil;
    const retryAt = this.options.retryAt();
    const nextAt = Math.max(now + (fast ? ICLOUD_FAST_SYNC_INTERVAL : ICLOUD_SYNC_INTERVAL), retryAt);
    // Switch rules exactly at the end of the fast window, including during backoff.
    const deadline = fast ? Math.min(nextAt, this.fastUntil) : nextAt;
    this.options.onChange({ fastUntil: this.fastUntil, nextAt, retryAt, syncing: false, paused: false });
    this.timer = setTimeout(() => {
      this.timer = null;
      if (fast && Date.now() >= this.fastUntil) this.scheduleNext();
      else void this.runAutomatic();
    }, deadline - now);
  }

  private publish() {
    this.clearTimer();
    this.options.onChange({ fastUntil: this.fastUntil, nextAt: null, retryAt: 0, syncing: this.running > 0, paused: !this.enabled || !this.visible });
  }

  private clearTimer() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  stop() {
    this.enabled = false;
    this.visible = false;
    this.clearTimer();
  }
}

export function icloudSyncScheduleText(schedule: IcloudSyncSchedule, now: number) {
  if (schedule.paused) return "自动同步已暂停";
  const seconds = (deadline: number) => Math.max(0, Math.ceil((deadline - now) / 1000));
  if (schedule.retryAt > now) return `${seconds(schedule.retryAt)}s · 重试`;
  if (now < schedule.fastUntil) return `${seconds(schedule.fastUntil)}s · 2s 1次`;
  if (schedule.syncing) return "同步中 · 500s 1次";
  return `${seconds(schedule.nextAt ?? now)}s · 1次`;
}
