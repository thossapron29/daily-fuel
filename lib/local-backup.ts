import type {Profile} from './nutrition';
import type {Recipe} from './recipes';
import type {Entry} from './data';

export type LocalBackup = {
  profiles: Profile[]; recipes: Recipe[]; entries: Entry[];
  weights: {id: string; profile_id: string; date: string; weight: number}[];
};

// Read-only conversion: never delete the original dailyfuel browser snapshot.
// Select allowed profile fields so obsolete dbid/owner_id values cannot travel
// into another project. The RPC assigns ownership from auth.uid(), not this JSON.
export function parseLocalBackup(raw: string | null): LocalBackup | null {
  if (!raw) return null;
  const value = JSON.parse(raw);
  if (!value || typeof value !== 'object' || !Array.isArray(value.profiles)) throw new Error('ข้อมูลเดิมในอุปกรณ์นี้มีรูปแบบไม่ถูกต้อง');
  for (const key of ['entries','recipes','weights']) if (value[key] != null && !Array.isArray(value[key])) throw new Error('ข้อมูลเดิมในอุปกรณ์นี้มีรูปแบบไม่ถูกต้อง');
  const profiles: Profile[] = value.profiles.map((profile: Profile) => ({
    id: profile.id, name: profile.name, sex: profile.sex, age: profile.age, weight: profile.weight,
    height: profile.height, activity: profile.activity, body_fat: profile.body_fat ?? null,
    goal: profile.goal, adjustment: profile.adjustment, macro_plan: profile.macro_plan ?? 'moderate',
  }));
  if (!profiles.length) return null;
  if (profiles.length !== 2 || !profiles.some(profile => profile.id === 'new') || !profiles.some(profile => profile.id === 'ben')) throw new Error('ตรวจสอบโปรไฟล์นิวและเบ้นในข้อมูลเดิมก่อนนำเข้า');
  return {profiles, recipes: value.recipes ?? [], entries: value.entries ?? [], weights: value.weights ?? []};
}
