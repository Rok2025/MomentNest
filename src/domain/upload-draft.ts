import {z} from 'zod';
// Legacy batches are md5(...)::uuid: PostgreSQL accepts all 128-bit values,
// including ones without RFC UUID version/variant bits. Keep their identifiers.
export const draftBatchIdSchema=z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,'草稿批次编号无效，请刷新草稿列表后重试');
export type DraftFile={id:string;name:string;size:number;kind:string;state:string;sha256:string|null;clientSha256:string|null;lastModified:number|null;archiveDate:string|null;expiresAt:string};
export type DraftBatch={id:string;count:number;verified:number;size:number;createdAt:string;expiresAt:string};
export type DuplicateMedia={eventId:string;occurredOn:string};
// Count protects one selection; bytes protect temporary storage independently.
export const TEMP_UPLOAD_BYTES=10*1024*1024*1024;
