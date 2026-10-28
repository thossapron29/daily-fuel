import './style.css';
import PwaRegistration from './pwa-registration';
export const metadata = {title:'Daily Fuel — Nutrition, together',description:'Personal nutrition journal for New & Ben',manifest:'/manifest.webmanifest',appleWebApp:{capable:true,title:'Daily Fuel',statusBarStyle:'default'},icons:{icon:'/icons/icon-192.png?v=2',apple:'/icons/apple-touch-icon.png?v=2'}};
export const viewport = {themeColor:'#edf3f6',width:'device-width',initialScale:1,viewportFit:'cover'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="th"><body><PwaRegistration/>{children}</body></html>}
