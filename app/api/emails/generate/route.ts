import { NextResponse } from "next/server";
import { generateTemporaryMailbox, TempError } from "@/lib/temporary-mailbox";
export const runtime="nodejs";
export async function POST(request:Request){try{return NextResponse.json(await generateTemporaryMailbox(await request.json()));}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"创建邮箱失败"},{status:error instanceof TempError?error.status:500});}}
