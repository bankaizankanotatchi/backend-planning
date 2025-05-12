//next.config.ts
// next.config.ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Active le mode standalone pour une meilleure optimisation sur Vercel
  output: 'standalone',

  // Configuration des en-têtes CORS
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, PUT, DELETE, OPTIONS, PATCH'
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, Authorization'
          },
          {
            key: 'Access-Control-Allow-Credentials',
            value: 'true'
          }
        ],
      },
    ];
  },

  // Configuration expérimentale nécessaire pour Prisma
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client', 'prisma']
  },

  // Optimisation pour Vercel
  images: {
    domains: [
      'lh3.googleusercontent.com', // Si vous utilisez l'auth Google
      'avatars.githubusercontent.com' // Si vous utilisez l'auth GitHub
    ],
  },
};

export default nextConfig;