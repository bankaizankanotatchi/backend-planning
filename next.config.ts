module.exports = {
  output: 'standalone', // Important pour Vercel
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client", "prisma"]
  }
};