export const timelineKinds=['image','video','text'] as const;
export const timelineAuthors=['爸爸','妈妈'] as const;

export type TimelineKind=typeof timelineKinds[number];
export type TimelineAuthor=typeof timelineAuthors[number];
export type TimelineFilters={kind?:TimelineKind;author?:TimelineAuthor};

export function hasTimelineFilters(filters:TimelineFilters){
 return Boolean(filters.kind||filters.author);
}
