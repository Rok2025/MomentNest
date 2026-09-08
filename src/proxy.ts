import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
export async function proxy(request: NextRequest) {
  let response=NextResponse.next({request});
  const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_PUBLISHABLE_KEY;
  if(url&&key&&process.env.SUPABASE_PROJECT_REF&&new URL(url).hostname===`${process.env.SUPABASE_PROJECT_REF}.supabase.co`) {
    const auth=createServerClient(url,key,{cookieOptions:{httpOnly:true,sameSite:'lax',secure:request.nextUrl.protocol==='https:',path:'/'},cookies:{
      getAll:()=>request.cookies.getAll(),setAll:values=>{
        for(const {name,value} of values) request.cookies.set(name,value);
        response=NextResponse.next({request});
        for(const {name,value,options} of values) response.cookies.set(name,value,options);
      },
    }});
    // Refresh/verify the token here; route guards still call getUser for live validation.
    try{await auth.auth.getClaims();}catch{/* Route-level guards deny access if refresh fails. */}
  }
  response.headers.set('Cache-Control','private, no-store, max-age=0');
  return response;
}
export const config={matcher:['/((?!_next/static|_next/image|favicon.ico).*)']};
