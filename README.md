# UAV LoD Pipeline

# UAV2LoD1-ZW

**UAV-based Level of Detail 1 (LoD1) Building Extraction for Zimbabwe**

A full-stack web application for processing UAV (drone) imagery to extract and model buildings at LoD1 detail level. This system combines photogrammetry (Structure from Motion) with advanced computer vision to produce georeferenced orthophotos, digital surface models (DSM), and segmented building models.

## Features

### Image Processing Pipeline
- **Intake Stage** — Image validation, EXIF analysis, and Ground Control Point (GCP) import
- **SfM (Structure from Motion)** — 3D reconstruction using OpenDroneMap
- **Dense Cloud** — Dense point cloud generation
- **DSM/DTM** — Digital Surface and Terrain Model generation
- **Segmentation** — Automated building detection and segmentation
- **LoD Modeling** — 3D building model generation at LoD1 specification
- **Validation** — Quality assurance and accuracy metrics
- **Analytics** — Statistical analysis and reporting
- **Export** — Multiple output format support (GeoTIFF, LAZ, OBJ, etc.)

### Data Management
- User authentication and project management
- Ground Control Point (GCP) CSV import with intelligent field mapping
- Real-time processing progress tracking
- Persistent stage state — resume projects where you left off
- Complete audit trail of all processing steps

### Visualization
- Interactive 2D map with orthophoto and vector layers
- 3D viewport for point cloud and mesh visualization
- Split-view mode for comparative analysis
- Real-time GCP placement on map

## Technology Stack

### Frontend
- **Framework:** Next.js 16 (App Router)
- **UI Library:** React 19
- **Styling:** Tailwind CSS v4
- **State Management:** Zustand
- **Components:** shadcn/ui + Lucide Icons
- **Map:** Maplibre GL
- **3D Visualization:** Three.js

### Backend
- **Runtime:** Node.js (via Next.js API Routes)
- **Database:** PostgreSQL 15
- **ORM:** Prisma
- **Authentication:** JWT + httpOnly Cookies
- **File Upload:** Multipart FormData
- **Validation:** Zod

### Processing
- **Photogrammetry:** OpenDroneMap (via NodeODM Docker)
- **CSV Parsing:** PapaParse
- **File Compression:** adm-zip
- **Password Hashing:** bcryptjs
- **Email:** Nodemailer (Gmail SMTP)

### Development
- **Package Manager:** pnpm
- **Language:** TypeScript
- **Linting:** ESLint
- **Type Checking:** TypeScript strict mode
- **Version Control:** Git

## Project Structure
uavlod/
├── app/                           # Next.js app directory
│   ├── api/                      # API routes
│   │   ├── auth/                # Authentication endpoints
│   │   └── projects/            # Project management endpoints
│   ├── layout.tsx               # Root layout
│   └── page.tsx                 # Home page
├── components/                   # React components
│   ├── stages/                  # Pipeline stage components
│   ├── workspace/               # Main workspace components
│   ├── ui/                      # Reusable UI components
│   └── viewport/                # Map and 3D visualization
├── lib/                          # Utilities and services
│   ├── db.ts                    # Database functions
│   ├── db-pipeline.ts           # Pipeline state persistence
│   ├── stores.ts                # Zustand stores
│   ├── api.ts                   # API client utilities
│   ├── auth-jwt.ts              # JWT token handling
│   ├── auth-cookies.ts          # Cookie management
│   ├── odm-client.ts            # OpenDroneMap integration
│   └── types.ts                 # TypeScript interfaces
├── prisma/                       # Database schema
│   ├── schema.prisma            # Prisma schema
│   └── migrations/              # Database migrations
├── public/                       # Static assets
├── data/                         # Local data storage
│   ├── store.json              # Persisted data (gitignored)
│   └── outputs/                # Processing outputs (gitignored)
├── .env.local                   # Environment variables (gitignored)
├── docker-compose.db.yml        # PostgreSQL Docker setup
├── package.json                 # Dependencies
├── pnpm-lock.yaml              # pnpm lock file
├── tsconfig.json               # TypeScript configuration
├── tailwind.config.ts          # Tailwind CSS configuration
└── next.config.js              # Next.js configuration

## Getting Started

### Prerequisites

- Node.js 18+ (recommended: 20 LTS)
- pnpm 9+
- Docker & Docker Compose
- PostgreSQL 15 (or use Docker)
- OpenDroneMap NodeODM (Docker)
- Git

### Installation

1. **Clone the repository**
```bash
   git clone https://github.com/yourusername/uav2lod1-zw.git
   cd uavlod
```

2. **Install dependencies**
```bash
   pnpm install
```

3. **Setup environment variables**
```bash
   cp .env.example .env.local
   # Edit .env.local with your values
```

4. **Start PostgreSQL**
```bash
   docker-compose -f docker-compose.db.yml up -d
```

5. **Run database migrations**
```bash
   npx prisma migrate dev
   npx prisma generate
```

6. **Start ODM (in separate terminal)**
```bash
   docker run -ti -p 3000:3000 opendronemap/nodeodm
```

7. **Start development server**
```bash
   pnpm dev
```

8. **Open in browser**
http://localhost:3000

## Configuration

### Environment Variables

Create `.env.local` with:

```env
# Database
DATABASE_URL="postgresql://uav2lod1_user:password@localhost:5432/uav2lod1_db"

# Authentication
JWT_SECRET="your_super_secret_jwt_key_at_least_32_characters_long"

# Email (Gmail SMTP)
EMAIL_USER="your-email@gmail.com"
EMAIL_PASSWORD="your-16-char-app-password"
EMAIL_FROM_NAME="UAV2LoD1-ZW"
EMAIL_FROM_ADDRESS="your-email@gmail.com"

# Application
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# OpenDroneMap
ODM_NODE_URL="http://localhost"
ODM_NODE_PORT=3000
```

### Database Setup

```bash
# Create database
docker-compose -f docker-compose.db.yml up -d

# Verify connection
docker exec uav2lod1_postgres psql -U uav2lod1_user -d uav2lod1_db -c "SELECT NOW();"

# Run migrations
npx prisma migrate dev --name init

# Generate Prisma client
npx prisma generate

# View database UI (optional)
npx prisma studio
```

### OpenDroneMap Setup

```bash
# Start ODM in background
docker run -d -p 3000:3000 --name nodeodm opendronemap/nodeodm

# Test connection
curl http://localhost:3000/info

# View ODM dashboard
# http://localhost:3000
```

## Usage

### User Registration & Login

1. Navigate to http://localhost:3000
2. Click "Register"
3. Enter email, username, and password
4. Verify email via code sent to your inbox
5. Login with credentials

### Create a Project

1. Click "New Project" in the Hangar
2. Enter project name
3. Select image directory from your disk
4. Configure coordinate reference system (CRS)
5. Click "Create"

### Import Ground Control Points (GCPs)

1. In Intake stage, click "Import GCPs"
2. Upload CSV file with columns: longitude, latitude, elevation
3. Map columns to GCP fields
4. Review and confirm import
5. GCPs appear on 2D map

### Run SfM Processing

1. In SfM stage, configure processing parameters
2. Test ODM connection
3. Click "Run SfM Stage"
4. Monitor progress in console
5. Preview orthophoto and point cloud

### Export Results

1. In Export stage, select output formats
2. Choose geographic bounds
3. Click "Export"
4. Download GeoTIFF, LAZ, and reports

## API Endpoints

### Authentication
- `POST /api/auth/register` — Register new user
- `POST /api/auth/login` — Login user
- `POST /api/auth/verify-email` — Verify email address
- `GET /api/auth/me` — Get current user
- `POST /api/auth/logout` — Logout user
- `POST /api/auth/forgot-password` — Request password reset
- `POST /api/auth/reset-password` — Reset password

### Projects
- `GET /api/projects` — List user's projects
- `POST /api/projects` — Create new project
- `GET /api/projects/:id` — Get project details
- `PUT /api/projects/:id` — Update project
- `DELETE /api/projects/:id` — Delete project

### GCPs
- `GET /api/projects/:id/gcps` — List GCPs
- `POST /api/projects/:id/gcps/import` — Import GCPs from CSV

### Pipeline
- `GET /api/projects/:id/pipeline/state` — Get pipeline state
- `POST /api/projects/:id/stages/:stageId/run` — Run stage

### SfM
- `POST /api/projects/:id/sfm/run` — Run SfM processing
- `GET /api/projects/:id/sfm/progress` — Get SfM progress
- `GET /api/projects/:id/sfm/config` — Get SfM configuration
- `POST /api/projects/:id/sfm/config` — Save SfM configuration

## Database Schema

See `prisma/schema.prisma` for complete database design. Key models:

- **User** — User accounts and authentication
- **Session** — Active user sessions
- **Project** — UAV projects
- **GCPMarker** — Ground control points
- **PipelineState** — Current stage and progress
- **StageResult** — Results for each pipeline stage
- **SfMConfig** — SfM processing configuration

## Performance Optimization

- Image lazy loading
- Code splitting with dynamic imports
- Database query optimization with Prisma
- Caching layer for frequently accessed data
- Responsive image sizes for different viewports
- WebP format for images (with PNG fallback)

## Troubleshooting

### Common Issues

**Port 3000 already in use**
```bash
# Kill process using port 3000
lsof -i :3000
kill -9 [PID]

# Or use different port
pnpm dev -p 3001
```

**Database connection failed**
```bash
# Check PostgreSQL is running
docker ps | grep postgres

# Verify DATABASE_URL in .env.local
# Correct format: postgresql://user:password@host:port/dbname
```

**ODM connection failed**
```bash
# Check ODM container is running
docker ps | grep nodeodm

# Test connection
curl http://localhost:3000/info

# Check Docker logs
docker logs nodeodm
```

**TypeScript errors**
```bash
# Regenerate Prisma types
npx prisma generate

# Type check
npx tsc --noEmit
```

## Testing

```bash
# Run TypeScript check
pnpm type-check

# Run linter
pnpm lint

# Fix linting issues
pnpm lint:fix

# Run tests (if configured)
pnpm test
```

## Deployment

### Prerequisites for Production
- PostgreSQL 15 on managed service (AWS RDS, Azure Database, etc.)
- Static file hosting (S3, CloudFront, etc.)
- Email service (SendGrid, Mailgun, etc.)
- Docker registry for container images
- CI/CD pipeline (GitHub Actions, GitLab CI, etc.)

### Deployment Steps

1. **Set production environment variables**
```bash
   # Set DATABASE_URL to production database
   # Set JWT_SECRET to strong random value
   # Set email service credentials
```

2. **Build application**
```bash
   pnpm build
```

3. **Run migrations on production**
```bash
   NODE_ENV=production npx prisma migrate deploy
```

4. **Start server**
```bash
   NODE_ENV=production pnpm start
```

5. **Configure reverse proxy (Nginx)**
   - Set up SSL/TLS certificates
   - Configure gzip compression
   - Set security headers

## Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/your-feature`
3. Commit changes: `git commit -am 'Add feature'`
4. Push to branch: `git push origin feature/your-feature`
5. Open Pull Request

## License

This project is licensed under the MIT License — see LICENSE file for details.

## Authors

- **Mickson** — Core development and architecture

## Support

For issues, questions, or suggestions:
- Open an issue on GitHub
- Check existing issues for solutions
- Review documentation and FAQs

## Acknowledgments

- OpenDroneMap team for photogrammetry pipeline
- Maplibre GL for web mapping
- Three.js for 3D visualization
- Vercel for Next.js framework
- Prisma team for ORM

## References

- [OpenDroneMap Documentation](https://docs.opendronemap.org)
- [Next.js Documentation](https://nextjs.org/docs)
- [Prisma Documentation](https://www.prisma.io/docs)
- [LoD1 Specification](https://www.citygml.org/)
- [GeoTIFF Format](https://www.cogeo.org/)

---

