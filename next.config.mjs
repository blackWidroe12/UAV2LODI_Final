/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  env: {
    DATABASE_URL: "postgresql://uav2lod1:tini1572@localhost:5433/uav2lod1_db",
    PRISMA_CLIENT_ENGINE_TYPE: "library",
  },
}

export default nextConfig
