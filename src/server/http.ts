import { NextResponse } from 'next/server';
import { DomainError } from '@/domain/events';
import { failure } from './errors';
export function json(value:unknown,status=200){return NextResponse.json(value,{status,headers:{'Cache-Control':'private, no-store'}});}
export function apiFailure(error:unknown){const f=failure(error);return json(f,{UNAUTHENTICATED:401,FORBIDDEN:403,VALIDATION:400,CONFLICT:409,NOT_FOUND:404,UNAVAILABLE:503}[f.code]);}
export function checkOrigin(request:Request){if(request.headers.get('origin')!==new URL(process.env.APP_URL||'http://localhost:3000').origin)throw new DomainError('FORBIDDEN','请求来源无效');}
