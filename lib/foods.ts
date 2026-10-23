import type {Food} from './recipes';

// USDA FoodData Central / SR Legacy. Values per 100 g, verified from the
// official Food Details API on 2026-10-23. Energy is the source's kcal field.
const food = (id: number, group: string, name: string, description: string, state: Food['state'], calories: number, protein: number, carbs: number, fat: number): Food => ({
  id: `usda-${id}`, group, name, description, state, calories, protein, carbs, fat,
  source: 'USDA FoodData Central · SR Legacy', source_id: String(id), source_url: `https://fdc.nal.usda.gov/food-details/${id}/nutrients`,
});
export const foodCatalog: Food[] = [
  food(174030,'beef-90','เนื้อบด ไขมัน 10%','Beef, ground, 90% lean meat / 10% fat, raw','raw',176,20,0,10),
  food(174031,'beef-90','เนื้อบด ไขมัน 10%','Beef, ground, 90% lean meat / 10% fat, patty, cooked, broiled','cooked',217,26.11,0,11.75),
  food(174036,'beef-80','เนื้อบด ไขมัน 20%','Beef, ground, 80% lean meat / 20% fat, raw','raw',254,17.17,0,20),
  food(174028,'beef-95','เนื้อบด ไขมัน 5%','Beef, ground, 95% lean meat / 5% fat, crumbles, cooked, pan-browned','cooked',193,29.17,0,7.58),
  food(169756,'rice-white','ข้าวขาวเมล็ดยาว','Rice, white, long-grain, regular, raw, unenriched','raw',365,7.13,79.95,.66),
  food(168878,'rice-white','ข้าวขาวเมล็ดยาว','Rice, white, long-grain, regular, enriched, cooked','cooked',130,2.69,28.17,.28),
  food(171077,'chicken-breast','อกไก่ไม่ติดหนัง','Chicken, broiler or fryers, breast, skinless, boneless, meat only, raw','raw',120,22.5,0,2.62),
  food(171477,'chicken-breast','อกไก่ไม่ติดหนัง','Chicken, broilers or fryers, breast, meat only, cooked, roasted','cooked',165,31.02,0,3.57),
  food(173424,'egg','ไข่ไก่ต้มทั้งฟอง','Egg, whole, cooked, hard-boiled','cooked',155,12.58,1.12,10.61),
  food(171413,'olive-oil','น้ำมันมะกอก','Oil, olive, salad or cooking','as_sold',884,0,0,100),
  food(173468,'salt','เกลือ','Salt, table','as_sold',0,0,0,0),
  food(173647,'water','น้ำเปล่า','Beverages, water, tap, drinking','as_sold',0,0,0,0),
  food(170894,'greek-yogurt','กรีกโยเกิร์ตธรรมชาติ ไร้ไขมัน','Yogurt, Greek, plain, nonfat','as_sold',59,10.19,3.6,.39),
];
