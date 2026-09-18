'use server';

import { authClient } from '@/server/auth/client';
import { sendPhoneCodeWithAuth,verifyPhoneCodeWithAuth } from '@/server/auth/phone';

// Kept for internal callers; the browser form uses the stable route handler.
export async function sendPhoneCode(input:{phone:string;bind:boolean}){
 return sendPhoneCodeWithAuth(input,authClient);
}
export async function verifyPhoneCode(input:{phone:string;code:string;bind:boolean;expectedMemberId?:string}){
 return verifyPhoneCodeWithAuth(input,authClient);
}
