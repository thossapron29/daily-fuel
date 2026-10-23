'use client';

import {useState} from 'react';
import {Check, ChevronDown, Flame, Leaf, Scale, ArrowDownRight, ArrowUpRight, RotateCcw, SlidersHorizontal} from 'lucide-react';
import {type Profile, activityOptions, applyGoal, bmr, calculateMacros, formulaName, goalOption, goalOptions, isCustomGoal, macroOption, macroOptions, macroTargets, target, tdee, validateNutritionProfile} from '../lib/nutrition';

type Props = {profile: Profile; onSave: (profile: Profile) => Promise<boolean>};
const icons = {maintain: Scale, lose: ArrowDownRight, gain: ArrowUpRight};
const signed = (value: number) => value > 0 ? `+${value.toLocaleString()}` : value.toLocaleString();

export default function NutritionSettings({profile, onSave}: Props) {
  const [draft, setDraft] = useState(profile);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [attempted, setAttempted] = useState(false);
  const errors = validateNutritionProfile(draft);
  const valid = Object.keys(errors).length === 0;
  const custom = isCustomGoal(draft);
  const selected = goalOption(draft.goal);
  const selectedMacros = macroOption(draft.macro_plan);
  const macros = macroTargets(draft);
  const needsBodyData = Boolean(errors.sex || errors.age || errors.weight || errors.height || errors.activity || errors.body_fat);
  const maintenance = needsBodyData ? null : tdee(draft);
  const display = (value: number | null) => value != null && Number.isFinite(value) && value > 0 ? value.toLocaleString() : '—';
  function update(patch: Partial<Profile>) {
    setDraft(current => ({...current, ...patch}));
    setMessage('');
  }

  return <form className="nutrition-settings" onSubmit={async event => {
    event.preventDefault();
    setAttempted(true);
    setMessage('');
    if (!valid || saving) return;
    setSaving(true);
    try {
      if (await onSave(draft)) setMessage('บันทึกแล้ว เป้าหมายนี้ถูกนำไปใช้บน Dashboard แล้ว');
    } catch {
      setMessage('บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง');
    } finally {
      setSaving(false);
    }
  }}>
    <section className="panel body-profile">
      <div className="section-heading"><div><span className="eyebrow">A GOOD PLACE TO START</span><h2>Get to know your daily needs.</h2><p className="sub">ข้อมูลเล็กน้อย เพื่อคำนวณพลังงานของ {profile.name}</p></div><span className="small-icon sage"><Leaf size={20}/></span></div>
      <div className="formgrid nutrition-inputs">
        <label htmlFor="nutrition-sex">Sex<select id="nutrition-sex" value={draft.sex} onChange={event => update({sex: event.target.value as Profile['sex']})}><option value="female">Female</option><option value="male">Male</option></select></label>
        <label htmlFor="nutrition-age">Age<input id="nutrition-age" type="number" required min="18" max="120" step="1" value={draft.age || ''} onChange={event => update({age: Number(event.target.value)})}/></label>
        <label htmlFor="nutrition-weight">Weight (kg)<input id="nutrition-weight" type="number" required min="0.1" max="500" step="0.1" value={draft.weight || ''} onChange={event => update({weight: Number(event.target.value)})}/></label>
        <label htmlFor="nutrition-height">Height (cm)<input id="nutrition-height" type="number" required min="50" max="250" step="0.1" value={draft.height || ''} onChange={event => update({height: Number(event.target.value)})}/></label>
        <label htmlFor="nutrition-activity" className="activity-field">Activity<select id="nutrition-activity" value={draft.activity} onChange={event => update({activity: Number(event.target.value)})}>{activityOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select><span className="field-help">{activityOptions.find(option => option.value === draft.activity)?.description}</span></label>
        <label htmlFor="nutrition-body-fat" className="body-fat-field"><span>Body Fat (%) <em>optional</em></span><input id="nutrition-body-fat" type="number" min="0.1" max="99.9" step="0.1" value={draft.body_fat ?? ''} placeholder="ไม่ทราบ เว้นว่างได้" aria-describedby="body-fat-help" onChange={event => update({body_fat: event.target.value === '' ? null : Number(event.target.value)})}/><span id="body-fat-help" className="field-help">ถ้าไม่ทราบ ไม่จำเป็นต้องเดา</span></label>
      </div>
      <div className="formula-note"><span className="small-icon cream"><Flame size={18}/></span><div><b>{formulaName(draft)}</b><p>{draft.body_fat == null ? 'คำนวณจากเพศ อายุ น้ำหนัก และส่วนสูง' : 'คำนวณจากน้ำหนักตัวและมวลร่างกายที่ไม่ใช่ไขมัน'}</p></div><span className="bmr-preview">BMR <b>{display(needsBodyData ? null : Math.round(bmr(draft)))}</b> kcal</span></div>
    </section>

    <section className="panel goal-panel">
      <div className="section-heading"><div><span className="eyebrow">FIND YOUR OWN BALANCE</span><h2>Choose your daily goal.</h2><p className="sub">เลือกเป้าหมายที่เหมาะกับช่วงนี้ของคุณ</p></div></div>
      <fieldset className="goal-options"><legend className="sr-only">Daily calorie goal</legend>{goalOptions.map(option => {
        const active = draft.goal === option.id;
        const Icon = icons[option.id];
        const adjustment = active ? draft.adjustment : option.adjustment;
        return <label className={`goal-choice ${active ? 'is-selected' : ''}`} key={option.id}>
          <input type="radio" aria-label={option.label} name="nutrition-goal" value={option.id} checked={active} onChange={() => {setDraft(current => applyGoal(current, option.id));setMessage('')}}/>
          <span className="goal-choice-top"><span className="goal-symbol"><Icon size={21}/></span><span className="selection-check">{active && <Check size={13}/>}</span></span>
          <span className="goal-name">{option.label}</span><span className="goal-description">{option.description}</span>
          <span className="goal-calories">{display(maintenance == null ? null : maintenance + adjustment)}<small>kcal / day</small></span>
          <span className="goal-offset">{adjustment === 0 ? 'เท่ากับ TDEE' : `${signed(adjustment)} kcal จาก TDEE`}{active && custom && <em>ปรับเอง</em>}</span>
        </label>;
      })}</fieldset>
      <p className="goal-explainer">ค่าเริ่มต้น: รักษาน้ำหนักเท่ากับ TDEE · ลดน้ำหนัก −300 · เพิ่มน้ำหนัก +200 kcal<br/>เป็นเป้าหมายเริ่มต้น ปรับให้เหมาะกับตัวเองและแนวโน้มน้ำหนักได้</p>

      <details className="advanced-settings">
        <summary><span><SlidersHorizontal size={16}/> ตั้งค่าขั้นสูง</span><ChevronDown size={17}/></summary>
        <div className="advanced-content"><div className="formgrid">
          <label htmlFor="nutrition-adjustment">ปรับจาก TDEE (kcal/วัน)<input id="nutrition-adjustment" type="number" required step="1" value={draft.adjustment} aria-describedby="adjustment-help" onChange={event => update({adjustment: Number(event.target.value)})}/></label>
          <label htmlFor="nutrition-name">Profile name<input id="nutrition-name" required value={draft.name} onChange={event => update({name: event.target.value})}/></label>
        </div><p id="adjustment-help" className="field-help">ค่าลบ = ต่ำกว่า TDEE · 0 = เท่ากับ TDEE · ค่าบวก = สูงกว่า TDEE</p><button type="button" className="textbutton reset-preset" onClick={() => {setDraft(current => applyGoal(current, current.goal));setMessage('')}}><RotateCcw size={14}/> กลับไปใช้ค่าเริ่มต้นของ {selected.label}</button></div>
      </details>
    </section>

    <section className="panel macro-plan-panel">
      <div className="section-heading"><div><span className="eyebrow">A BALANCE THAT FITS YOU</span><h2>Choose your macro balance.</h2><p className="sub">คำนวณจากเป้าหมาย {selected.label} · {display(valid ? target(draft) : null)} kcal / day</p></div></div>
      <fieldset className="macro-plan-options"><legend className="sr-only">Macronutrient plan</legend>{macroOptions.map(option => {
        const active = selectedMacros.id === option.id;
        const values = calculateMacros(target(draft), option.id);
        return <label className={`macro-choice ${active ? 'is-selected' : ''}`} key={option.id}>
          <input type="radio" aria-label={option.label} name="macro-plan" value={option.id} checked={active} onChange={() => update({macro_plan: option.id})}/>
          <span className="macro-choice-heading"><span className="goal-name">{option.label}</span><span className="selection-check">{active && <Check size={13}/>}</span></span>
          <span className="goal-description">{option.description}</span>
          <span className="macro-ratio">P {option.protein}% · C {option.carbs}% · F {option.fat}%</span>
          <span className="macro-composition" aria-hidden="true"><i style={{width: `${option.protein}%`}}/><i style={{width: `${option.carbs}%`}}/><i style={{width: `${option.fat}%`}}/></span>
          <span className="macro-amounts">{([{key:'protein',label:'Protein'},{key:'carbs',label:'Carbs'},{key:'fat',label:'Fat'}] as const).map(nutrient => <span className={`macro-amount macro-${nutrient.key}`} key={nutrient.key}><span><i/>{nutrient.label}</span><b>{display(valid ? values[nutrient.key] : null)}<small> g</small></b></span>)}</span>
        </label>;
      })}</fieldset>
      <p className="goal-explainer">P = โปรตีน · C = คาร์โบไฮเดรต · F = ไขมัน · สัดส่วนคิดเป็น % ของพลังงาน<br/>โปรตีนและคาร์บ 4 kcal/g · ไขมัน 9 kcal/g · ปัดกรัมเพื่อให้อ่านง่าย ผลรวมพลังงานอาจคลาดเคลื่อนเล็กน้อย</p>
    </section>

    <section className="nutrition-result" aria-label="Selected daily target">
      <div><span className="eyebrow">YOUR DAILY FUEL</span><h3>{selected.label}{custom && <span className="custom-target-badge">ปรับเอง</span>}</h3><p>TDEE {display(maintenance)}{draft.adjustment === 0 ? '' : ` ${draft.adjustment > 0 ? '+' : '−'} ${Math.abs(draft.adjustment).toLocaleString()}`} kcal / day</p><p className="result-macro-plan">{selectedMacros.label} · P {display(valid ? macros.protein : null)}g / C {display(valid ? macros.carbs : null)}g / F {display(valid ? macros.fat : null)}g</p></div>
      <div className="selected-calories"><b>{display(valid ? target(draft) : null)}</b><span>kcal / day</span></div>
    </section>
    {attempted && !valid && <ul className="nutrition-errors" role="alert">{Object.entries(errors).map(([field,message]) => <li key={field}>{message}</li>)}</ul>}
    <div className="nutrition-save"><p>กดบันทึกเพื่อใช้เป้าหมายนี้กับ Dashboard และสารอาหารรายวัน</p><button className="primary" disabled={saving}><Check size={17}/>{saving ? 'Saving…' : 'Save goals'}</button></div>
    <p className="save-status" role="status">{message}</p>
  </form>;
}
