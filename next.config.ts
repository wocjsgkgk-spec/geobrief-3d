import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false, // MapLibre GL instance can conflict with double mount in dev mode
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'api.vworld.kr' },
      { protocol: 'https', hostname: 'map.vworld.kr' },
      { protocol: 'https', hostname: 'server.arcgisonline.com' },
      { protocol: 'https', hostname: 'basemaps.cartocdn.com' },
      { protocol: 'https', hostname: 'unpkg.com' },
      { protocol: 'https', hostname: 'tile.openstreetmap.org' },
    ],
  },
  webpack: (config, { webpack, isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        https: false,
        http: false,
        path: false,
        stream: false,
        crypto: false,
      };
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/^node:/, (resource: { request: string }) => {
          resource.request = resource.request.replace(/^node:/, '');
        })
      );
    }
    return config;
  },
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
        ],
      },
    ];
  },
};

export default nextConfig;
