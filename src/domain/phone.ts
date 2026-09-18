import { z } from 'zod';

// The family currently uses mainland China mobile numbers only.
export const phoneSchema=z.string().trim().transform(value=>value.replace(/\s/g,'').replace(/^(?:\+?86)/,''))
 .pipe(z.string().regex(/^1[3-9]\d{9}$/)).transform(value=>`+86${value}`);
export const phoneCodeSchema=z.string().regex(/^\d{6}$/);
export function maskPhone(phone:string){return phone.replace(/^(?:\+?86)/,'').replace(/^(\d{3})\d{4}(\d{4})$/,'$1****$2');}
