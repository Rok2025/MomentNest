import { describe, expect, it } from 'vitest';
import { uploadDateReady } from '../src/domain/upload-date';

const today='2026-09-10';
describe('upload capture date confirmation',()=>{
  it('未知拍摄日期不能因表单默认今天而被当作已确认',()=>{
    expect(uploadDateReady({capturedOn:null},today)).toBe(false);
    expect(uploadDateReady({capturedOn:null,occurredOn:today},today)).toBe(false);
    expect(uploadDateReady({occurredOn:'2026-07-04'},today)).toBe(false);
  });
  it('识别出的有效拍摄日期不需要手动确认',()=>{
    expect(uploadDateReady({capturedOn:'2026-07-04',occurredOn:'2026-07-04'},today)).toBe(true);
  });
  it('未知拍摄日期可明确确认今天或另选历史日期',()=>{
    for(const occurredOn of [today,'2026-07-04']){
      expect(uploadDateReady({capturedOn:null,occurredOn,dateEdited:true},today)).toBe(true);
    }
  });
  it('手动选择的有效日期优先于原拍摄日期',()=>{
    expect(uploadDateReady({capturedOn:'2026-07-04',occurredOn:'2026-07-05',dateEdited:true},today)).toBe(true);
  });
  it.each(['','2025-04-16','2026-09-11','2026-02-30'])('确认后清空或改成无效日期仍不能保存：%s',occurredOn=>{
    expect(uploadDateReady({capturedOn:null,occurredOn,dateEdited:true},today)).toBe(false);
    expect(uploadDateReady({capturedOn:'2026-07-04',occurredOn},today)).toBe(false);
  });
});
