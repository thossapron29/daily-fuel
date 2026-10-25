/** @type {import('next').NextConfig} */
const config={async headers(){return [
 {source:'/oauth/:path*',headers:[{key:'Referrer-Policy',value:'no-referrer'},{key:'X-Robots-Tag',value:'noindex, nofollow'},{key:'X-Frame-Options',value:'DENY'}]},
 {source:'/gpt/:path*',headers:[{key:'Referrer-Policy',value:'no-referrer'},{key:'X-Robots-Tag',value:'noindex, nofollow'},{key:'X-Frame-Options',value:'DENY'}]},
]}};
export default config;
