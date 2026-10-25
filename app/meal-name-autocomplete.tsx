'use client';

import {useEffect,useId,useMemo,useState,type RefObject} from 'react';
import {Check,ChevronDown,History,Users} from 'lucide-react';
import type {Entry,Profile} from '../lib/data';
import {mealSuggestions,type MealSuggestion,type SharedMenu} from '../lib/meal-history';

type Props={loadSharedMenus:(query:string)=>Promise<SharedMenu[]>;value:string;history:Entry[];profiles:Profile[];who:string;inputRef:RefObject<HTMLInputElement|null>;onChange:(value:string)=>void;onPick:(suggestion:MealSuggestion)=>void};
const number=(value:number)=>value.toLocaleString('th-TH',{maximumFractionDigits:2});
const dateLabel=(date:string)=>{
  const parsed=new Date(date+'T12:00:00');
  return Number.isFinite(parsed.getTime())?new Intl.DateTimeFormat('th-TH',{day:'numeric',month:'short'}).format(parsed):date;
};

export default function MealNameAutocomplete({loadSharedMenus,value,history,profiles,who,inputRef,onChange,onPick}:Props){
  const id=useId();
  const [open,setOpen]=useState(false);
  const [includeBoth,setIncludeBoth]=useState(false);
  const [active,setActive]=useState(-1);
  const [picked,setPicked]=useState<MealSuggestion|null>(null);
  const [sharedMenus,setSharedMenus]=useState<SharedMenu[]>([]);
  const [sharedLoading,setSharedLoading]=useState(false);
  const [sharedError,setSharedError]=useState('');
  const [retry,setRetry]=useState(0);
  const options=useMemo(()=>mealSuggestions(history,who,profiles.map(profile=>profile.id),value,includeBoth,sharedMenus),[history,who,profiles,value,includeBoth,sharedMenus]);
  const currentName=profiles.find(profile=>profile.id===who)?.name||'';
  const personName=(option:MealSuggestion)=>option.shared?option.source_name:profiles.find(profile=>profile.id===option.profile_id)?.name||'';
  const activeIndex=active<options.length?active:-1;
  const expanded=open;
  useEffect(()=>{if(expanded&&activeIndex>=0)document.getElementById(`${id}-option-${activeIndex}`)?.scrollIntoView({block:'nearest'})},[expanded,activeIndex,id]);
  useEffect(()=>{
    if(!includeBoth||!expanded){setSharedLoading(false);return}
    let cancelled=false;
    setSharedLoading(true);setSharedError('');setSharedMenus([]);setActive(-1);
    const timer=setTimeout(async()=>{
      try{const menus=await loadSharedMenus(value);if(!cancelled){setSharedMenus(menus);setActive(-1)}}
      catch{if(!cancelled)setSharedError('โหลดเมนูอีกบัญชีไม่สำเร็จ')}
      finally{if(!cancelled)setSharedLoading(false)}
    },200);
    return()=>{cancelled=true;clearTimeout(timer)};
  },[includeBoth,expanded,value,loadSharedMenus,retry]);

  function pick(option:MealSuggestion){
    onPick(option);setPicked(option);inputRef.current?.focus();setOpen(false);setActive(-1);
  }
  function toggleScope(){setIncludeBoth(value=>!value);setActive(-1);setOpen(true)}

  return <div className="meal-name-entry" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null)){setOpen(false);setActive(-1)}}}>
    <label htmlFor={`${id}-input`}>ชื่ออาหาร</label>
    <div className="meal-autocomplete-control">
      <input ref={inputRef} id={`${id}-input`} required role="combobox" autoComplete="off" aria-autocomplete="list" aria-haspopup="listbox" aria-expanded={expanded} aria-controls={expanded?`${id}-list`:undefined} aria-activedescendant={expanded&&activeIndex>=0?`${id}-option-${activeIndex}`:undefined} aria-describedby={`${id}-help`} placeholder="พิมพ์ชื่อ หรือเลือกมื้อเดิม" value={value}
        onFocus={()=>setOpen(true)} onChange={event=>{onChange(event.target.value);setPicked(null);setOpen(true);setActive(-1)}}
        onKeyDown={event=>{
          if(event.nativeEvent.isComposing)return;
          if(event.key==='Escape'&&expanded){event.preventDefault();event.stopPropagation();setOpen(false);setActive(-1)}
          else if(event.key==='ArrowDown'||event.key==='ArrowUp'){
            event.preventDefault();setOpen(true);
            setActive(index=>options.length?(event.key==='ArrowDown'?(index+1)%options.length:(index<=0?options.length-1:index-1)):-1);
          }else if(event.key==='Enter'&&expanded&&activeIndex>=0){event.preventDefault();pick(options[activeIndex])}
        }}/>
      <button type="button" className="meal-history-toggle" aria-label={expanded?'ซ่อนเมนูเดิม':'ดูเมนูเดิม'} aria-expanded={expanded} onClick={()=>{setOpen(value=>!value);setActive(-1)}}><ChevronDown size={17}/></button>
      {expanded&&<div className="meal-history-popup">
        <div className="meal-history-heading"><span><History size={14}/>{value.trim()?'เมนูที่ตรงกัน':`มื้อล่าสุดของ${currentName}`}</span><button type="button" className={includeBoth?'is-selected':''} aria-pressed={includeBoth} onClick={toggleScope}><Users size={14}/><span>ดูเมนูของทั้งคู่</span>{includeBoth&&<Check size={12}/>}</button></div>
        <p className="meal-history-hint">{includeBoth?`${currentName}ในบัญชีนี้ขึ้นก่อน · เมนูอีกบัญชีเลือกใช้ได้`:'เลือกเพื่อเติมโภชนาการ แล้วแก้ตามที่กินได้'}</p>
        <div id={`${id}-list`} role="listbox" aria-label="เมนูจากประวัติมื้ออาหาร" className="meal-history-list">
          {options.map((option,index)=><button type="button" role="option" aria-selected={activeIndex===index} tabIndex={-1} key={option.key} id={`${id}-option-${index}`} className={activeIndex===index?'is-active':''} onPointerDown={event=>event.preventDefault()} onClick={()=>pick(option)}>
            <span className="meal-history-name"><b>{option.name}</b><span className={'meal-history-person '+(option.profile_id===who?'is-current':'')}>{personName(option)}{option.shared&&' · อีกบัญชี'}</span></span>
            <span className="meal-history-energy">{number(option.calories)} <small>kcal</small></span>
            <span className="meal-history-macros">P {number(option.protein)} · C {number(option.carbs)} · F {number(option.fat)} <small>g</small></span>{option.date&&<span className="meal-history-date">{dateLabel(option.date)}</span>}
          </button>)}
        </div>
        {includeBoth&&sharedLoading&&<p className="meal-shared-status" role="status">กำลังค้นหาเมนูอีกบัญชี…</p>}
        {includeBoth&&sharedError&&<p className="meal-shared-status" role="alert">{sharedError}<button type="button" onClick={()=>setRetry(value=>value+1)}>ลองอีกครั้ง</button></p>}
        {!options.length&&!(includeBoth&&(sharedLoading||sharedError))&&<p className="meal-history-empty" role="status">{value.trim()?'ยังไม่พบเมนูนี้ พิมพ์ชื่อใหม่แล้วกรอกโภชนาการได้เลย':`ยังไม่มีมื้อเดิมของ${currentName}${includeBoth?'และบัญชีที่เชื่อมกัน':' ลองดูเมนูของทั้งคู่ หรือเริ่มกรอกมื้อใหม่ได้เลย'}`}</p>}
      </div>}
    </div>
    <p className={'meal-name-help '+(picked?'has-selection':'')} id={`${id}-help`} role="status">{picked?<><Check size={12}/> เติมจากเมนูของ{personName(picked)}{picked.shared?' (อีกบัญชี)':''} · แก้ตัวเลขด้านล่างได้</>:'เลือกจากมื้อเดิม หรือกรอกชื่ออาหารใหม่ได้เลย'}</p>
  </div>;
}
