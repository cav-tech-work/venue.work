/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@spatial/core-3d'],
  reactStrictMode: true,
  output: 'standalone',
};

module.exports = nextConfig;
