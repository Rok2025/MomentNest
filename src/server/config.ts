import 'server-only';
export function authConfigured(): boolean { return !!process.env.SUPABASE_URL && !!process.env.SUPABASE_PUBLISHABLE_KEY; }
export function appConfigured(): boolean { return authConfigured() && !!process.env.DATABASE_URL; }
export function authConfig() {
  const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_PUBLISHABLE_KEY;
  if(!url||!key) throw new Error('AUTH_NOT_CONFIGURED');
  if(!process.env.SUPABASE_PROJECT_REF||new URL(url).hostname!==`${process.env.SUPABASE_PROJECT_REF}.supabase.co`) throw new Error('WRONG_AUTH_PROJECT');
  return { url,key };
}
export function appUrl() {
  const url=new URL(process.env.APP_URL || 'http://localhost:3000');
  if(process.env.NODE_ENV==='production' && url.protocol!=='https:' && !['localhost','127.0.0.1'].includes(url.hostname)) throw new Error('HTTPS_REQUIRED');
  return url.origin;
}
