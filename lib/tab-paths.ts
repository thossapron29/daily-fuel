export const tabPaths:Record<string,string>={'Dashboard':'/','Overview':'/overview','Food diary':'/food-diary','Weight log':'/weight-log','Settings':'/settings'};
export function tabFromPath(path:string){const normalized=path.length>1?path.replace(/\/$/,''):path;return Object.keys(tabPaths).find(key=>tabPaths[key]===normalized)||'Dashboard';}
export function validSelectedDay(day:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return false;const date=new Date(`${day}T12:00:00Z`);return !Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===day;}
