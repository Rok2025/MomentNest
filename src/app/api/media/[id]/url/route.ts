import { z } from 'zod';
import { requireIdentity } from '@/server/auth/session';
import { database } from '@/server/db';
import { ownMedia } from '@/server/media-store';
import { signedObjectUrl } from '@/server/storage/local';
import { DomainError } from '@/domain/events';
import { json,apiFailure,checkOrigin } from '@/server/http';
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){try{checkOrigin(req);const id=z.string().uuid().parse((await params).id);const {variant}=z.object({variant:z.enum(['original','preview','playback'])}).parse(await req.json());const m=await ownMedia(database(),await requireIdentity(),id);const key=variant==='original'?m.object_key:variant==='preview'?m.preview_key:m.playback_key;if(!key)throw new DomainError('UNAVAILABLE','素材仍在处理中，请稍后重试');return json({url:signedObjectUrl({key:String(key),operation:'get',expires:Date.now()+5*60*1000,mime:variant==='original'?String(m.mime):variant==='preview'?'image/jpeg':'video/mp4',...(variant==='original'?{download:String(m.filename)}:{})}),expiresAt:Date.now()+5*60*1000});}catch(e){return apiFailure(e);}}
