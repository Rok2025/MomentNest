export type DraftFile={id:string;name:string;size:number;kind:string;state:string;sha256:string|null;clientSha256:string|null;lastModified:number|null;archiveDate:string|null;expiresAt:string};
export type DraftBatch={id:string;count:number;verified:number;size:number;createdAt:string;expiresAt:string};
export type DuplicateMedia={eventId:string;occurredOn:string};
// Count protects one selection; bytes protect temporary storage independently.
export const TEMP_UPLOAD_BYTES=10*1024*1024*1024;
