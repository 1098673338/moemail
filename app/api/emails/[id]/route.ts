import { NextResponse } from "next/server";
import { deleteMailbox,getMailbox,listTemporaryMessages,TempError,updateMailbox } from "@/lib/temporary-mailbox";
export const runtime="nodejs";
const error=(value:unknown)=>NextResponse.json({error:value instanceof Error?value.message:"临时邮箱请求失败"},{status:value instanceof TempError?value.status:500});
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{const {id}=await params;const search=new URL(request.url).searchParams;return NextResponse.json(await listTemporaryMessages(id,search.get("cursor"),["1","true"].includes(search.get("summary")||""),["1","true"].includes(search.get("countOnly")||"")));}catch(value){return error(value);}}
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){try{const {id}=await params;return NextResponse.json({success:true,email:await updateMailbox(id,await request.json())});}catch(value){return error(value);}}
export async function DELETE(_:Request,{params}:{params:Promise<{id:string}>}){try{await deleteMailbox((await params).id);return NextResponse.json({success:true});}catch(value){return error(value);}}
