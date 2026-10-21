"use client";

import { useCallback, useEffect, useState } from "react";
import { IcloudSyncScheduler, PAUSED_SYNC_SCHEDULE } from "@/lib/icloud-sync-schedule";

export function useIcloudSyncSchedule(options: {
  enabled: boolean;
  sync: () => Promise<unknown>;
  retryAt: () => number;
  onError: (error: unknown) => void;
}) {
  const [schedule, setSchedule] = useState(PAUSED_SYNC_SCHEDULE);
  const [scheduler] = useState(() => new IcloudSyncScheduler({
    sync: options.sync,
    retryAt: options.retryAt,
    onError: options.onError,
    onChange: setSchedule,
  }));

  useEffect(() => { scheduler.updateCallbacks(options); });
  useEffect(() => {
    const handleVisibility = () => scheduler.setVisible(document.visibilityState === "visible");
    handleVisibility();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      scheduler.stop();
    };
  }, [scheduler]);
  useEffect(() => { scheduler.setEnabled(options.enabled); }, [scheduler, options.enabled]);

  const runManual = useCallback(<T,>(action: () => Promise<T>) => scheduler.runManual(action), [scheduler]);
  return { schedule, runManual };
}
