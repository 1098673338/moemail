import { NextResponse } from "next/server";
import { listTemporaryMailboxes } from "@/lib/temporary-mailbox";
export const runtime="nodejs";
export async function GET(request:Request){try{const params=new URL(request.url).searchParams;return NextResponse.json(await listTemporaryMailboxes(Math.max(Number(params.get("cursor"))||0,0),params.get("all")==="1"));}catch{return NextResponse.json({error:"获取临时邮箱失败"},{status:500});}}
