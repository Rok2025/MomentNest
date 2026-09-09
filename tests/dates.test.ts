import { describe,it,expect } from 'vitest';
import { ageOn,shortAgeOn,todayShanghai,validEventDate } from '../src/domain/dates';
import { parseEventInput } from '../src/domain/events';
describe('北京时间与成长日期',()=>{
 it('UTC16点跨北京时间午夜',()=>{expect(todayShanghai(new Date('2026-09-07T15:59:59Z'))).toBe('2026-09-07');expect(todayShanghai(new Date('2026-09-07T16:00:00Z'))).toBe('2026-09-08');});
 it('含出生和今天两端，拒绝空/无效/未来/出生前',()=>{for(const v of ['2025-04-17','2026-09-08'])expect(validEventDate(v,'2026-09-08')).toBe(true);for(const v of ['','2026-02-30','2026-09-09','2025-04-16','2026-9-8'])expect(validEventDate(v,'2026-09-08')).toBe(false);});
 it.each([['2025-04-17','0岁0个月0天'],['2025-05-17','0岁1个月0天'],['2026-04-16','0岁11个月30天'],['2026-04-17','1岁0个月0天'],['2026-09-08','1岁4个月22天']])('%s => %s',(day,age)=>expect(ageOn(day)).toBe(age));
 it.each([['2025-04-17','0天'],['2025-05-18','1个月'],['2026-04-17','1岁'],['2026-09-09','1岁4个月']])('简洁年龄 %s => %s',(day,age)=>expect(shortAgeOn(day)).toBe(age));
 it('拒绝空事件/伪造作者，允许只写感受',()=>{const input={requestKey:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',occurredOn:'2025-04-17',title:'',body:'',feeling:''};expect(()=>parseEventInput(input)).toThrow();expect(()=>parseEventInput({...input,body:'hi',author:'爸爸'})).toThrow();expect(parseEventInput({...input,feeling:'珍贵'}).feeling).toBe('珍贵');});
});
