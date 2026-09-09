// Shared SQL fragment; independent of the mutually referencing event/media stores.
export const coverJoin=`left join lateral (select m.* from momentnest.media m where m.household_id=e.household_id and m.event_id=e.id order by (m.id=e.cover_media_id) desc nulls last,m.position limit 1) cover on true`;
