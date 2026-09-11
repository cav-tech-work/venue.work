/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@venue/core-3d'],
  reactStrictMode: true,
  output: 'standalone',
};

module.exports = nextConfig;
