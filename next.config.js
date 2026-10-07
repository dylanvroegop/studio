/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep development output separate from production builds. Running
  // `next build` while `next dev` is active must not invalidate dev chunks.
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',
  eslint: {
    ignoreDuringBuilds: true,
  },
  async redirects() {
    return [
      {
        source: '/register',
        destination: '/login',
        permanent: false,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
        pathname: '/v0/b/studio-6011690104-60fbf.firebasestorage.app/o/users%2F*%2Fquotes%2F*%2Ffotos%2F*',
      },
      {
        protocol: 'https',
        hostname: 'placehold.co',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        pathname: '/**',
      },
    ],
  },
};

module.exports = nextConfig;
