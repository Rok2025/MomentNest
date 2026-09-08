import { NextResponse, type NextRequest } from 'next/server';
import { authClient } from '@/server/auth/client';
import { appUrl } from '@/server/config';
export async function GET(request:NextRequest){
  const token_hash=request.nextUrl.searchParams.get('token_hash'),type=request.nextUrl.searchParams.get('type');
  if(token_hash&&(type==='recovery'||type==='invite')){try{const auth=await authClient();const {error}=await auth.auth.verifyOtp({token_hash,type});if(!error)return NextResponse.redirect(new URL('/reset-password',appUrl()));}catch{}}
  return NextResponse.redirect(new URL('/login?error=recovery',appUrl()));
}
