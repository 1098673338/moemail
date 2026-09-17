import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { MailStoreError } from "@/lib/mail-store";

export function apiError(error: unknown, fallback = "请求处理失败") {
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: error.issues[0]?.message || "输入内容无效" },
      { status: 400 },
    );
  }
  if (error instanceof MailStoreError) {
    const status = error.code === "not_found" || error.code === "address_not_found"
      ? 404
      : error.code === "conflict" || error.code === "invalid_transition"
        ? 409
        : 400;
    return NextResponse.json({ error: error.message, code: error.code }, { status });
  }
  console.error(error);
  return NextResponse.json(
    { error: error instanceof Error ? error.message : fallback },
    { status: 500 },
  );
}
