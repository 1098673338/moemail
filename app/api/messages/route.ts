import { NextResponse } from "next/server";
import { listMessages } from "@/lib/mail-store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const addressId = new URL(request.url).searchParams.get("addressId");
  return NextResponse.json({ messages: await listMessages(addressId) });
}
