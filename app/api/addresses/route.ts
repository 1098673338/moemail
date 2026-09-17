import { NextResponse } from "next/server";
import { listAddresses } from "@/lib/mail-store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const includeDeleted = new URL(request.url).searchParams.get("includeDeleted") === "1";
  return NextResponse.json({ addresses: await listAddresses(includeDeleted) });
}
