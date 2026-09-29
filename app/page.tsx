import { Dashboard } from "@/components/dashboard";
import { isValidDashboardSession, SESSION_COOKIE } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const session = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!(await isValidDashboardSession(session, getEnv().DASHBOARD_LOGIN_SECRET))) {
    redirect("/login");
  }
  return <Dashboard />;
}
