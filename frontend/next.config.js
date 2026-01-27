/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // Next.js 16: Use remotePatterns instead of domains
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'raw.githubusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'assets.coingecko.com',
      },
    ],
  },
  // Turbopack configuration (Next.js 16 default)
  // Empty config to silence the warning - webpack config is used for production builds
  turbopack: {
    // Set root directory to silence workspace warning
    root: __dirname,
  },
  // Webpack configuration (for production builds)
  webpack: (config, { isServer }) => {
    // External packages that shouldn't be bundled
    config.externals.push('pino-pretty', 'lokijs', 'encoding');
    
    // Suppress MetaMask SDK React Native dependency warning
    config.resolve.fallback = {
      ...config.resolve.fallback,
      '@react-native-async-storage/async-storage': false,
    };
    
    return config;
  },
};

module.exports = nextConfig;

