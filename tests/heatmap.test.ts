import { describe,it,expect } from 'vitest';
import { yearWindow,allWindow,changeGrain,moveWindow,cellsFor } from '../src/domain/heatmap';
const today='2026-09-08';
describe('time-window contract',()=>{
 it('默认当前自然年每格一天，包含未来空日',()=>{const s=yearWindow(2026,today),cells=cellsFor(s,[]);expect(cells).toHaveLength(365);expect(cells[0].start).toBe('2026-01-01');expect(cells.at(-1)?.end).toBe('2026-12-31');});
 it('闰年有366天',()=>{expect(cellsFor(yearWindow(2028,'2028-09-01'),[])).toHaveLength(366);});
 it('同一关注日往返缩放仍在窗口中，月档为全跨度',()=>{let s={...yearWindow(2026,today),focus:'2026-05-16'};for(const g of ['week','month','day'] as const){s=changeGrain(s,g,today);expect(s.focus).toBe('2026-05-16');expect(s.start<=s.focus&&s.end>=s.focus).toBe(true);}expect(allWindow(today).start).toBe('2025-01-01');});
 it('完整周一周聚合跨年不重不漏',()=>{const s={grain:'week' as const,focus:'2026-01-01',start:'2025-12-29',end:'2026-01-11'};const cells=cellsFor(s,[{date:'2025-12-31',count:2},{date:'2026-01-01',count:3},{date:'2026-01-05',count:1}]);expect(cells).toEqual([{start:'2025-12-29',end:'2026-01-04',count:5},{start:'2026-01-05',end:'2026-01-11',count:1}]);});
 it('半窗移动与范围边界，月全貌不可平移',()=>{const s=yearWindow(2026,today);expect(moveWindow(s,1,today)).toBe(s);expect(moveWindow(s,-1,today).start).toBe('2025-07-01');expect(moveWindow(allWindow(today),-1,today).grain).toBe('month');});
 it('聚合按事件数而不是有记录的日期数',()=>{const c=cellsFor({grain:'month',focus:today,start:'2026-08-01',end:'2026-09-30'},[{date:'2026-09-01',count:5},{date:'2026-09-08',count:2}]);expect(c[1].count).toBe(7);});
});
