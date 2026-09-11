/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@venue/core-3d'],
  reactStrictMode: true,
  output: 'standalone',
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
};

module.exports = nextConfig;
