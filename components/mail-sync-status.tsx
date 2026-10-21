"use client";

import { useEffect, useState } from "react";
import { icloudSyncScheduleText, type IcloudSyncSchedule } from "@/lib/icloud-sync-schedule";

export function MailSyncStatus({ schedule }: { schedule: IcloudSyncSchedule }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    if (schedule.paused) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [schedule]);
  return <span className="mail-sync-status" title="前 120 秒：每轮完成后等待 2 秒；之后：每轮完成后等待 300 秒。手动同步会重新计时。">
    {icloudSyncScheduleText(schedule, now)}
  </span>;
}
