import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() { return [{source:'/admin/:path*',headers:[{key:'Cache-Control',value:'private, no-store'},{key:'X-Frame-Options',value:'DENY'},{key:'Referrer-Policy',value:'no-referrer'}]},{source:'/balance/:path*',headers:[{key:'Referrer-Policy',value:'no-referrer'},{key:'X-Robots-Tag',value:'noindex, nofollow'},{key:'Cache-Control',value:'private, no-store'},{key:'X-Frame-Options',value:'DENY'}]}]; }
};

export default nextConfig;
