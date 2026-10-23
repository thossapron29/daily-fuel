import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';

// Exercise the pure calculation module without adding a test-runner dependency.
const source = await readFile(new URL('../lib/nutrition.ts', import.meta.url), 'utf8');
const {outputText} = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020}});
const {bmr, tdee, target, applyGoal, isCustomGoal, formulaName, validateNutritionProfile, calculateMacros, macroTargets, macroOptions, macroOption} = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const profile = {id:'test', name:'Test', sex:'female', age:30, weight:60, height:160, activity:1.2, body_fat:null, goal:'maintain', adjustment:0};

test('Mifflin–St Jeor uses sex, kg, cm and age when body fat is absent', () => {
  assert.equal(bmr(profile), 1289);
  assert.equal(tdee(profile), 1547);
  assert.equal(bmr({...profile, sex:'male'}), 1455);
  assert.equal(tdee({...profile, sex:'male'}), 1746);
  assert.equal(formulaName(profile), 'Mifflin–St Jeor');
});

test('activity factors use full-precision BMR and round only the final TDEE', () => {
  const sample = {...profile, weight:89, height:160, age:34, body_fat:40};
  assert.ok(Math.abs(bmr(sample) - 1523.44) < 1e-8);
  assert.equal(tdee({...sample, activity:1.55}), 2361);
  assert.deepEqual([1.2,1.375,1.55,1.725,1.9].map(activity=>tdee({...profile,activity})), [1547,1772,1998,2224,2449]);
});

test('optional body fat selects Katch–McArdle; clearing it restores Mifflin', () => {
  const sample = {...profile, sex:'male', age:29, height:167, activity:1.55, body_fat:25};
  assert.equal(bmr(sample), 1342);
  assert.equal(tdee(sample), 2080);
  assert.equal(formulaName(sample), 'Katch–McArdle');
  assert.equal(tdee({...sample, body_fat:null}), 2331);
});

test('each goal sets a single TDEE-relative adjustment without stacking', () => {
  const maintenance = applyGoal(profile, 'maintain');
  const cutting = applyGoal(maintenance, 'lose');
  const bulking = applyGoal(cutting, 'gain');
  assert.equal(target(maintenance), 1547);
  assert.equal(target(cutting), 1247);
  assert.equal(target(bulking), 1747);
  assert.equal(target(applyGoal(bulking, 'maintain')), 1547);
  assert.equal(profile.adjustment, 0);
  assert.equal(isCustomGoal(cutting), false);
});

test('custom and existing adjustments are retained until a preset is selected', () => {
  const legacy = {...profile, goal:'lose', adjustment:-400};
  assert.equal(target(legacy), 1147);
  assert.equal(isCustomGoal(legacy), true);
  assert.equal(target(applyGoal(legacy, 'lose')), 1247);
  const manual = {...applyGoal(profile, 'gain'), adjustment:350};
  assert.equal(target(manual), 1897);
  assert.equal(isCustomGoal(manual), true);
});

test('invalid or incomplete inputs cannot be saved as calorie targets', () => {
  for (const body_fat of [0,100,-1,NaN,Infinity]) {
    assert.ok(validateNutritionProfile({...profile, body_fat}).body_fat);
    assert.ok(Number.isNaN(bmr({...profile, body_fat})));
  }
  for (const [key,value] of [['age',0],['age',30.5],['weight',0],['height',0],['activity',0],['adjustment',NaN],['adjustment',1.5],['goal','unknown']]) {
    assert.ok(Object.keys(validateNutritionProfile({...profile,[key]:value})).length, key);
  }
  assert.ok(validateNutritionProfile({...profile, adjustment:-2000}).adjustment);
  assert.deepEqual(validateNutritionProfile(profile), {});
  assert.deepEqual(validateNutritionProfile({...profile, body_fat:25}), {});
});

test('macro presets follow P/C/F order and reproduce the reference at 2080 kcal', () => {
  assert.deepEqual(calculateMacros(2080, 'moderate'), {protein:156, carbs:182, fat:81});
  assert.deepEqual(calculateMacros(2080, 'lower'), {protein:208, carbs:104, fat:92});
  assert.deepEqual(calculateMacros(2080, 'higher'), {protein:156, carbs:260, fat:46});
  for (const option of macroOptions) assert.equal(option.protein + option.carbs + option.fat, 100);
});

test('macros use the selected calorie goal, including cuts, bulks and manual adjustments', () => {
  for (const plan of ['moderate','lower','higher']) {
    for (const goal of ['maintain','lose','gain']) {
      const sample = {...applyGoal(profile, goal), macro_plan:plan};
      assert.deepEqual(macroTargets(sample), calculateMacros(target(sample), plan));
    }
  }
  const manual = {...profile, adjustment:350, macro_plan:'higher'};
  assert.deepEqual(macroTargets(manual), calculateMacros(1897, 'higher'));
  assert.equal(profile.macro_plan, undefined);
});

test('older profiles default to Moderate Carb and invalid plan names cannot be saved', () => {
  assert.equal(macroOption(profile.macro_plan).id, 'moderate');
  assert.deepEqual(macroTargets(profile), calculateMacros(target(profile), 'moderate'));
  assert.ok(validateNutritionProfile({...profile, macro_plan:'invalid'}).macro_plan);
  for (const macro_plan of ['moderate','lower','higher']) assert.deepEqual(validateNutritionProfile({...profile, macro_plan}), {});
});

test('rounded macro grams stay close to the selected energy target', () => {
  for (const calories of [1247,1547,1747,1961,2080,2280,2531]) {
    for (const option of macroOptions) {
      const grams = calculateMacros(calories, option.id);
      assert.ok(Math.abs(grams.protein*4 + grams.carbs*4 + grams.fat*9 - calories) <= 9);
    }
  }
});
