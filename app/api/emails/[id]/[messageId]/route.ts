import { NextResponse } from "next/server";
import { deleteTemporaryMessage,markTemporaryMessage,temporaryMessage,TempError } from "@/lib/temporary-mailbox";
export const runtime="nodejs";
const error=(value:unknown)=>NextResponse.json({error:value instanceof Error?value.message:"临时邮件请求失败"},{status:value instanceof TempError?value.status:500});
export async function GET(_:Request,{params}:{params:Promise<{id:string;messageId:string}>}){try{const {id,messageId}=await params;const message=await temporaryMessage(id,messageId);return message?NextResponse.json({message}):NextResponse.json({error:"邮件不存在"},{status:404});}catch(value){return error(value);}}
export async function PATCH(request:Request,{params}:{params:Promise<{id:string;messageId:string}>}){try{const {id,messageId}=await params;const body=await request.json() as {isRead?:unknown};return NextResponse.json({message:await markTemporaryMessage(id,messageId,Boolean(body.isRead))});}catch(value){return error(value);}}
export async function DELETE(_:Request,{params}:{params:Promise<{id:string;messageId:string}>}){try{const {id,messageId}=await params;await deleteTemporaryMessage(id,messageId);return NextResponse.json({success:true});}catch(value){return error(value);}}
