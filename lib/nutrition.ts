export type Goal = 'maintain' | 'lose' | 'gain';
export type MacroPlan = 'moderate' | 'lower' | 'higher';
export type Profile = {
  id: string; name: string; sex: 'female' | 'male'; age: number;
  weight: number; height: number; activity: number; body_fat: number | null;
  goal: Goal; adjustment: number; macro_plan?: MacroPlan;
};

// Percentages of energy; always label in P / C / F order in this app.
export const macroOptions = [
  {id: 'moderate', label: 'Moderate Carb', description: 'คาร์บปานกลาง', protein: 30, carbs: 35, fat: 35},
  {id: 'lower', label: 'Lower Carb', description: 'คาร์บน้อยลง', protein: 40, carbs: 20, fat: 40},
  {id: 'higher', label: 'Higher Carb', description: 'คาร์บมากขึ้น', protein: 30, carbs: 50, fat: 20},
] as const;
export const macroOption = (plan?: MacroPlan) => macroOptions.find(option => option.id === plan) ?? macroOptions[0];

export function calculateMacros(calories: number, plan?: MacroPlan) {
  const split = macroOption(plan);
  return {
    protein: Math.round(calories * split.protein / 100 / 4),
    carbs: Math.round(calories * split.carbs / 100 / 4),
    fat: Math.round(calories * split.fat / 100 / 9),
  };
}
export const macroTargets = (profile: Profile) => calculateMacros(target(profile), profile.macro_plan);

// Product presets, not universal calorie prescriptions. adjustment is always
// relative to TDEE, including when the user overrides a preset in Advanced.
export const goalOptions = [
  {id: 'maintain', label: 'Maintenance', description: 'รักษาน้ำหนัก', adjustment: 0},
  {id: 'lose', label: 'Cutting', description: 'ลดน้ำหนัก', adjustment: -300},
  {id: 'gain', label: 'Bulking', description: 'เพิ่มน้ำหนัก', adjustment: 200},
] as const;

export const activityOptions = [
  {value: 1.2, label: 'Sedentary', description: 'นั่งทำงานเป็นส่วนใหญ่'},
  {value: 1.375, label: 'Light activity', description: 'ออกกำลังกายเบา 1–3 วัน/สัปดาห์'},
  {value: 1.55, label: 'Moderate activity', description: 'ออกกำลังกาย 3–5 วัน/สัปดาห์'},
  {value: 1.725, label: 'Very active', description: 'ออกกำลังกายหนัก 6–7 วัน/สัปดาห์'},
  {value: 1.9, label: 'Extra active', description: 'กิจกรรมหนักมาก / ใช้แรงตลอดวัน'},
] as const;

export const goalOption = (goal: Goal) => goalOptions.find(option => option.id === goal)!;
export const applyGoal = (profile: Profile, goal: Goal): Profile => ({
  ...profile, goal, adjustment: goalOption(goal).adjustment,
});
export const isCustomGoal = (profile: Profile) => profile.adjustment !== goalOption(profile.goal).adjustment;
export const formulaName = (profile: Profile) => profile.body_fat == null ? 'Mifflin–St Jeor' : 'Katch–McArdle';

export function bmr(profile: Profile) {
  if (profile.body_fat != null) {
    if (!Number.isFinite(profile.body_fat) || profile.body_fat <= 0 || profile.body_fat >= 100) return NaN;
    const leanMass = profile.weight * (1 - profile.body_fat / 100);
    return 370 + 21.6 * leanMass;
  }
  return 10 * profile.weight + 6.25 * profile.height - 5 * profile.age + (profile.sex === 'male' ? 5 : -161);
}
export const tdee = (profile: Profile) => Math.round(bmr(profile) * profile.activity);
export const target = (profile: Profile) => tdee(profile) + profile.adjustment;

export function validateNutritionProfile(profile: Profile) {
  const errors: Partial<Record<keyof Profile, string>> = {};
  if (!profile.name.trim()) errors.name = 'กรุณากรอกชื่อโปรไฟล์';
  if (!['female', 'male'].includes(profile.sex)) errors.sex = 'กรุณาเลือกเพศ';
  if (!Number.isInteger(profile.age) || profile.age < 18 || profile.age > 120) errors.age = 'กรอกอายุ 18–120 ปี';
  if (!Number.isFinite(profile.weight) || profile.weight <= 0 || profile.weight > 500) errors.weight = 'กรอกน้ำหนักมากกว่า 0 และไม่เกิน 500 kg';
  if (!Number.isFinite(profile.height) || profile.height < 50 || profile.height > 250) errors.height = 'กรอกส่วนสูง 50–250 cm';
  if (!activityOptions.some(option => option.value === profile.activity)) errors.activity = 'กรุณาเลือกระดับกิจกรรม';
  if (profile.body_fat != null && (!Number.isFinite(profile.body_fat) || profile.body_fat <= 0 || profile.body_fat >= 100)) errors.body_fat = 'กรอก Body Fat มากกว่า 0 และน้อยกว่า 100% หรือเว้นว่าง';
  if (!goalOptions.some(option => option.id === profile.goal)) errors.goal = 'กรุณาเลือกเป้าหมาย';
  if (profile.macro_plan != null && !macroOptions.some(option => option.id === profile.macro_plan)) errors.macro_plan = 'กรุณาเลือกรูปแบบสารอาหาร';
  if (!Number.isInteger(profile.adjustment)) errors.adjustment = 'กรอกจำนวนแคลอรีเป็นเลขจำนวนเต็ม';
  if (!Object.keys(errors).length && (bmr(profile) <= 0 || target(profile) <= 0)) errors.adjustment = 'ตรวจสอบข้อมูลและค่าปรับ เป้าหมายพลังงานต้องมากกว่า 0 kcal';
  return errors;
}
