import type {Food,FoodCategory} from './recipes';


const aliases:Record<string,string[]>={'pork-ground':['หมูสับ','หมูบด'],'rice-white':['ข้าวสวย','ข้าวสาร'],'fish-sauce':['น้ำปลา'],'oyster-sauce':['น้ำมันหอย','ซอสหอย'],'soybean-oil':['น้ำมันพืช'],'sugar':['น้ำตาลทราย'],'chicken-breast':['อกไก่']};
function categoryForGroup(group:string):FoodCategory {
 if(/^(beef|pork|chicken|egg|shrimp|tofu)/.test(group))return 'protein';
 if(/^(rice|wheat|sweet-potato)/.test(group))return 'carb';
 if(/^(garlic|onion|carrot|tomato|basil|cabbage|ginger|chili|lime)/.test(group))return 'vegetable';
 if(/^(olive-oil|soybean-oil|salt|sugar|fish-sauce|oyster-sauce|soy-sauce|black-pepper|coconut-milk)/.test(group))return 'seasoning';
 return 'other';
}
export function categoryForFood(food:Pick<Food,'category'|'group'>):FoodCategory{return food.category||categoryForGroup(food.group)}

// USDA FoodData Central / SR Legacy. Values per 100 g, verified from the
// official Food Details API on 2026-10-23/24. Energy is the source's kcal field.
const food = (id: number, group: string, name: string, description: string, state: Food['state'], calories: number, protein: number, carbs: number, fat: number): Food => ({
  id: `usda-${id}`, group, name, description, state, calories, protein, carbs, fat,
  category:categoryForGroup(group),aliases:aliases[group]||[],basis_unit:'g',
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
  food(169230,'garlic','กระเทียม','Garlic, raw','raw',149,6.36,33.1,0.5),
  food(170393,'carrot','แครอท','Carrots, raw','raw',41.0,0.93,9.58,0.24),
  food(175179,'shrimp','กุ้งสด เนื้อส่วนที่กินได้','Crustaceans, shrimp, raw','raw',85.0,20.1,0.0,0.51),
  food(171287,'egg','ไข่ไก่ดิบทั้งฟอง ไม่รวมเปลือก','Egg, whole, raw, fresh','raw',143,12.6,0.72,9.51),
  food(171411,'soybean-oil','น้ำมันถั่วเหลือง','Oil, soybean, salad or cooking','as_sold',884,0.0,0.0,100),
  food(170000,'onion','หอมหัวใหญ่','Onions, raw','raw',40.0,1.1,9.34,0.1),
  food(169655,'sugar','น้ำตาลทราย','Sugars, granulated','as_sold',387,0.0,100,0.0),
  food(172475,'tofu-firm','เต้าหู้แข็ง ชนิดแคลเซียมซัลเฟต','Tofu, raw, firm, prepared with calcium sulfate','raw',144,17.3,2.78,8.72),
  food(172476,'tofu-regular','เต้าหู้ ชนิดแคลเซียมซัลเฟต','Tofu, raw, regular, prepared with calcium sulfate','raw',76.0,8.08,1.87,4.78),
  food(170457,'tomato','มะเขือเทศ','Tomatoes, red, ripe, raw, year round average','raw',18.0,0.88,3.89,0.2),
  food(167902,'pork-ground','หมูบด ไขมันประมาณ 21%','Pork, fresh, ground, raw','raw',263,16.9,0.0,21.2),
  food(172232,'basil','โหระพา / เบซิลสด (ค่าอ้างอิงทั่วไป)','Basil, fresh','raw',23.0,3.15,2.65,0.64),
  food(169975,'cabbage','กะหล่ำปลี','Cabbage, raw','raw',25.0,1.28,5.8,0.1),
  food(169231,'ginger','ขิง','Ginger root, raw','raw',80.0,1.82,17.8,0.75),
  food(168155,'lime','มะนาว ส่วนที่กินได้','Limes, raw','raw',30.0,0.7,10.5,0.2),
  food(170172,'coconut-milk','กะทิคั้นสด (ค่าทั่วไป)','Nuts, coconut milk, raw (liquid expressed from grated meat and water)','as_sold',230,2.29,5.54,23.8),
  food(170106,'chili','พริกแดงสด','Peppers, hot chili, red, raw','raw',40.0,1.87,8.81,0.44),
  food(167903,'pork-ground','หมูบด ไขมันประมาณ 21%','Pork, fresh, ground, cooked','cooked',297,25.7,0.0,20.8),
  food(174531,'fish-sauce','น้ำปลา (ค่าทั่วไป)','Sauce, fish, ready-to-serve','as_sold',35.0,5.06,3.64,0.01),
  food(174529,'oyster-sauce','ซอสหอยนางรม (ค่าทั่วไป)','Sauce, oyster, ready-to-serve','as_sold',51.0,1.35,10.9,0.25),
  food(174277,'soy-sauce','ซอสถั่วเหลือง โชยุ (ค่าทั่วไป)','Soy sauce made from soy and wheat (shoyu)','as_sold',53.0,8.14,4.93,0.57),
  food(170931,'black-pepper','พริกไทยดำ','Spices, pepper, black','as_sold',251,10.4,64.0,3.26),
];
