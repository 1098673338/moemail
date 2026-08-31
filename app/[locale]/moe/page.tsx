import { Header } from "@/components/layout/header"
import { ThreeColumnLayout } from "@/components/emails/three-column-layout"
import { NoPermissionDialog } from "@/components/no-permission-dialog"
import { SessionBoundary } from "@/components/auth/session-boundary"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { hasPermission, PERMISSIONS, type Role } from "@/lib/permissions"

export const runtime = "edge"

export default async function MoePage() {
  const session = await auth()
  
  if (!session?.user) {
    redirect("/")
  }

  const canManageEmail = hasPermission(
    (session.user.roles ?? []).map(role => role.name) as Role[],
    PERMISSIONS.MANAGE_EMAIL
  )

  return (
    <SessionBoundary>
      <div className="bg-gradient-to-b from-gray-50 to-gray-100 h-screen">
        <div className="h-full w-full px-5">
          <Header />
          <main className="h-full">
            <ThreeColumnLayout />
            {!canManageEmail && <NoPermissionDialog />}
          </main>
        </div>
      </div>
    </SessionBoundary>
  )
}
