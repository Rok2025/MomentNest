'use client';

import { useState } from 'react';
import { Header } from './shell';
import { NewEventButton, NewEventDialog } from './new-event-dialog';
import { Timeline } from './timeline';
import { ageOn, shortAgeOn } from '@/domain/dates';
import type { EventRecord } from '@/domain/events';
import type { DayCount } from '@/domain/heatmap';
import type { Cursor } from '@/server/event-store';

export function HomeJournal({label,memberId,today,initial,days,initialRange,initialPages,saved=false}:{
  label:string;memberId:string;today:string;initial:{items:EventRecord[];next:Cursor|null};days:DayCount[];
  initialRange?:{start:string;end:string};initialPages?:number;saved?:boolean;
}) {
  const [filtersOpen,setFiltersOpen]=useState(Boolean(initialRange));
  function toggleFilters(){
    setFiltersOpen(open=>!open);
    if(!filtersOpen)requestAnimationFrame(()=>{
      const panel=document.getElementById('journal-filters');
      const header=document.querySelector('.topbar');
      if(panel&&header&&panel.getBoundingClientRect().top<header.getBoundingClientRect().bottom){
        panel.scrollIntoView({block:'start'});
      }
    });
  }
  return <NewEventDialog>
    <Header label={label} age={<span className="header-age" title={`又又今天 ${ageOn(today)}`}>又又 · {shortAgeOn(today)}</span>} actions={<>
      <button type="button" className="filter-toggle" aria-expanded={filtersOpen} aria-controls="journal-filters" onClick={toggleFilters}>{filtersOpen?'收起筛选':'筛选'}</button>
      <NewEventButton>＋ 记下一刻</NewEventButton>
    </>}/>
    <h1 className="sr-only">又又的成长手账</h1>
    {saved&&<p className="success" role="status">记录已保存。</p>}
    <Timeline initial={initial} days={days} today={today} memberId={memberId} initialRange={initialRange} initialPages={initialPages} filtersOpen={filtersOpen}/>
  </NewEventDialog>;
}
