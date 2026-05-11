import { createDb } from "@/lib/db";
import { roles, userRoles, users } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { ROLES } from "@/lib/permissions";
import { assignRoleToUser } from "@/lib/auth";

export const runtime = "edge";

export async function POST(request: Request) {
  try {
    const { userId, roleName, maxEmails, sendLimit } = await request.json() as {
      userId: string, 
      roleName: typeof ROLES.DUKE | typeof ROLES.KNIGHT | typeof ROLES.CIVILIAN
      maxEmails?: number
      sendLimit?: number | null
    };
    if (!userId || !roleName) {
      return Response.json(
        { error: "缺少必要参数" },
        { status: 400 }
      );
    }

    if (![ROLES.DUKE, ROLES.KNIGHT, ROLES.CIVILIAN].includes(roleName)) {
      return Response.json(
        { error: "角色不合法" },
        { status: 400 }
      );
    }

    if (maxEmails !== undefined && (!Number.isInteger(maxEmails) || maxEmails < 0)) {
      return Response.json(
        { error: "最大邮箱数必须是大于等于 0 的整数" },
        { status: 400 }
      );
    }

    if (sendLimit !== undefined && sendLimit !== null && (!Number.isInteger(sendLimit) || sendLimit < 0)) {
      return Response.json(
        { error: "发件限额必须是大于等于 0 的整数" },
        { status: 400 }
      );
    }

    const db = createDb();

    const currentUserRole = await db.query.userRoles.findFirst({
      where: eq(userRoles.userId, userId),
      with: {
        role: true,
      },
    });

    if (currentUserRole?.role.name === ROLES.EMPEROR) {
      const maxEmailsUnchanged = maxEmails === undefined || maxEmails === 0;
      const sendLimitUnchanged = sendLimit === undefined || sendLimit === null || sendLimit === 0;
      if (maxEmailsUnchanged && sendLimitUnchanged) {
        return Response.json({
          success: true,
        });
      }

      return Response.json(
        { error: "不能降级皇帝" },
        { status: 400 }
      );
    }

    let targetRole = await db.query.roles.findFirst({
      where: eq(roles.name, roleName),
    });

    if (!targetRole) {
      const description = {
        [ROLES.DUKE]: "超级用户",
        [ROLES.KNIGHT]: "高级用户",
        [ROLES.CIVILIAN]: "普通用户",
      }[roleName];

      const [newRole] = await db.insert(roles)
        .values({
          name: roleName,
          description,
        })
        .returning();
      targetRole = newRole;
    }

    await assignRoleToUser(db, userId, targetRole.id);

    const userUpdates: Partial<typeof users.$inferInsert> = {};
    if (maxEmails !== undefined) {
      userUpdates.maxEmails = maxEmails;
    }
    if (sendLimit !== undefined) {
      userUpdates.sendLimit = sendLimit;
    }

    if (Object.keys(userUpdates).length > 0) {
      await db.update(users)
        .set(userUpdates)
        .where(eq(users.id, userId));
    }

    return Response.json({ 
      success: true,
    });
  } catch (error) {
    console.error("Failed to change user role:", error);
    return Response.json(
      { error: "操作失败" },
      { status: 500 }
    );
  }
}
