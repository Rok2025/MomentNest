import { requireIdentity } from '@/server/auth/session';
import { database } from '@/server/db';
import { heatmapCounts } from '@/server/heatmap-store';
import { json,apiFailure } from '@/server/http';
export async function GET(){try{return json(await heatmapCounts(database(),await requireIdentity()));}catch(e){return apiFailure(e);}}
