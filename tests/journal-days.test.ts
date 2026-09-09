import {describe,it,expect} from 'vitest';
import {journalDays} from '../src/domain/journal-days';
import type {EventRecord} from '../src/domain/events';
function event(id:string,date:string,overrides:Partial<EventRecord>={}):EventRecord{return {id,occurredOn:date,title:'',body:id,feeling:'',createdAt:'2026-09-10T00:00:00Z',updatedAt:'2026-09-10T00:00:00Z',author:'爸爸',editor:'爸爸',version:1,mediaCount:1,imageCount:1,videoCount:0,coverMediaId:null,...overrides};}
describe('daily journal presentation',()=>{
 it('同一天两次上传合为一组，保留每次内容、作者和详情编号',()=>{
  const first=event('first','2026-09-06',{imageCount:2,mediaCount:2});
  const second=event('second','2026-09-06',{createdAt:'2026-09-11T00:00:00Z',author:'妈妈',imageCount:0,videoCount:3,mediaCount:3});
  const days=journalDays([second,first]);expect(days).toHaveLength(1);
  expect(days[0]).toMatchObject({date:'2026-09-06',imageCount:2,videoCount:3,authors:['妈妈','爸爸']});
  expect(days[0].events).toEqual([second,first]);expect(days[0].events[0]).toBe(second);
 });
 it('按发生日期归组，不按同一次上传的创建日期归组，月份保持倒序',()=>{
  expect(journalDays([event('a','2026-08-31'),event('b','2026-09-01'),event('c','2026-09-02')]).map(d=>d.date)).toEqual(['2026-09-02','2026-09-01','2026-08-31']);
 });
 it('跨页的同一天继续合并；重复编号只显示一次并保留更新后的数据',()=>{
  const first=event('a','2026-09-06'),second=event('b','2026-09-06'),updated={...first,body:'更新后的文字',version:2};
  const groups=journalDays([first,event('older','2026-09-05'),updated,second]);
  expect(groups).toHaveLength(2);expect(groups[0].events.map(e=>e.id)).toEqual(['a','b']);expect(groups[0].imageCount).toBe(2);expect(groups[0].events[0].body).toBe('更新后的文字');
 });
 it('纯文字、空列表和单条记录保持正常，不修改输入',()=>{
  const source=Object.freeze([Object.freeze(event('text','2026-09-06',{mediaCount:0,imageCount:0}))]);
  expect(journalDays([...source])[0]).toMatchObject({imageCount:0,videoCount:0});expect(journalDays([])).toEqual([]);
 });
});
