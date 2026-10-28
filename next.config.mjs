/** @type {import('next').NextConfig} */
const config={async rewrites(){return ['/overview','/food-diary','/weight-log','/settings'].map(source=>({source,destination:'/'}));},async headers(){return [
 {source:'/sw.js',headers:[{key:'Cache-Control',value:'no-cache, no-store, must-revalidate'},{key:'Service-Worker-Allowed',value:'/'}]},
 {source:'/oauth/:path*',headers:[{key:'Referrer-Policy',value:'no-referrer'},{key:'X-Robots-Tag',value:'noindex, nofollow'},{key:'X-Frame-Options',value:'DENY'}]},
 {source:'/gpt/:path*',headers:[{key:'Referrer-Policy',value:'no-referrer'},{key:'X-Robots-Tag',value:'noindex, nofollow'},{key:'X-Frame-Options',value:'DENY'}]},
]}};
export default config;
