import { NextResponse, type NextRequest } from 'next/server';
import { authClient } from '@/server/auth/client';
import { appUrl } from '@/server/config';
export async function GET(request:NextRequest){
  const code=request.nextUrl.searchParams.get('code');
  if(code){try{const auth=await authClient();const {error}=await auth.auth.exchangeCodeForSession(code);if(!error)return NextResponse.redirect(new URL(request.nextUrl.searchParams.get('next')==='/reset-password'?'/reset-password':'/',appUrl()));}catch{}}
  return NextResponse.redirect(new URL('/login?error=recovery',appUrl()));
}
