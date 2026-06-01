# Favigon

 ![Angular](https://img.shields.io/badge/Angular-20-DD0031?style=flat&logo=angular&logoColor=white) ![.NET](https://img.shields.io/badge/.NET-9-512BD4?style=flat&logo=dotnet&logoColor=white) ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat&logo=postgresql&logoColor=white) ![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=flat&logo=docker&logoColor=white)

**Favigon** is a full-stack **web creation and discovery platform** built with Angular and ASP.NET Core.
It combines a visual site editor, public project sharing and explore features, plus AI-assisted generation and export to **HTML**, **React**, or **Angular**.

![Showcase](./.github/docs/showcase_poster.jpg)

---

## Highlights ✨

- **Visual site editor** for building page layouts, editing properties, previewing pages, and persisting design state.
- **Discovery and sharing features** like public profiles, explore feed, trending projects, likes, stars, follows, and forks.
- **AI-assisted generation** with direct prompt-based design generation and a **3-phase pipeline**:
  intent -> structure -> style.
- **Code export** for **HTML**, **React**, and **Angular**, including multi-page output support.
- **Production-oriented backend** with layered architecture, JWT auth from cookies, refresh tokens, email-based 2FA, rate limiting, and structured logging.
- **Containerized deployment path** with PostgreSQL, ASP.NET Core API, Angular frontend served through Nginx, and optional Cloudflare tunnel integration.

## Feature Overview 🧩

### Product Features

- User registration, login, logout, refresh token flow, password reset, and linked OAuth providers
- GitHub and Google OAuth sign-in / account linking
- Email-based two-factor authentication
- Profile pages with followers / following and editable user settings
- Private and public project management
- Project likes, stars, views, forks, and public previews
- Explore page with trending projects, recommended projects, and suggested people

### Creation & Canvas

- Standalone Angular canvas experience with feature-scoped services and signal-heavy state management
- Project design persistence plus thumbnail and asset uploads
- Prompt-to-design generation
- Streaming AI endpoints for progressive generation feedback
- Structured AI pipeline that separates planning, layout generation, and styling

### Export & Conversion

- Internal IR-based conversion pipeline
- HTML export
- React export
- Angular export
- Multi-page export support
- Responsive breakpoint diff generation inside the converter engine

## Tech Stack 🛠️

### Frontend

- **Angular 20** standalone app
- **TypeScript 5.9**
- **RxJS 7**
- **GSAP**, **html2canvas**, **JSZip**, **Lenis**

### Backend

- **ASP.NET Core 9**
- **Entity Framework Core**
- **PostgreSQL**
- **AutoMapper**
- **FluentValidation**
- **Serilog**

### Infrastructure

- **Docker / Docker Compose**
- **Nginx**
- **Cloudflare Tunnel**
- **OpenAI API**

## Architecture 🏗️

The repository is split into a frontend app and a layered .NET backend:

```text
Favigon/
|-- Frontend/
|   |-- src/app/core/           # API services, guards, interceptors, models, utilities
|   |-- src/app/shared/         # Reusable UI components
|   `-- src/app/features/       # auth, canvas, explore, profile, settings, stars
|-- Backend/
|   |-- Favigon.API/            # Controllers, middleware, startup
|   |-- Favigon.Application/    # Business logic, DTOs, validators, services
|   |-- Favigon.Domain/         # Domain entities
|   |-- Favigon.Infrastructure/ # EF Core, repositories, external integrations, seeding
|   |-- Favigon.Converter/      # Design-to-code engine, parsers, generators
|   `-- Favigon.Tests/          # xUnit test suite
`-- docker-compose.yml
```

Typical backend request flow:

```text
Controller -> Application Service -> Repository / External Adapter -> PostgreSQL or external provider
```

Key frontend routes currently include:

- `/login`
- `/reset-password`
- `/project/:slug`
- `/project/:slug/preview`
- `/settings`
- `/stars`
- `/explore`
- `/:username`

## API Surface

Main API areas:

- `api/account` - auth, OAuth, refresh, password flows, 2FA
- `api/users` - profile, follows, search, stars, admin user management
- `api/projects` - CRUD, design persistence, thumbnails, assets, likes, stars, forks
- `api/explore` - trending, recommended, suggested people
- `api/ai` - design generation and streaming AI pipeline endpoints
- `api/converter` - validation and code generation endpoints

## Local Development 🚀

### Prerequisites

- **Node.js 22** and **npm**
- **.NET 9 SDK**
- **PostgreSQL 16** or a compatible local PostgreSQL instance
- **Docker** (optional, for containerized runs)

### 1. Configure backend settings

Update the development configuration in:

- `Backend/Favigon.API/appsettings.Development.json`

At minimum, verify or replace:

- `ConnectionStrings:FavigonDb`
- `JwtSettings:*`
- `GithubOAuth:*`
- `GoogleOAuth:*`
- `Email:*`
- `OpenAi:*`

For a real deployment, treat these values as secrets and move them out of committed config.

### 2. Start the backend

```bash
cd Backend
dotnet restore Favigon.sln
dotnet run --project Favigon.API
```

The API runs locally at:

- `http://localhost:5207`
- `https://localhost:7229`
- Swagger UI: `https://localhost:7229/swagger`

On startup, the backend applies EF Core migrations automatically and seeds default users.

### 3. Start the frontend

```bash
cd Frontend
npm install
npm start
```

The Angular app runs at:

- `http://localhost:4200`

In development, the frontend calls the API at:

- `http://localhost:5207/api`

## Seeded Accounts

The application seeds a few users automatically. The main default accounts are:

- **Admin** - `admin@Favigon.local` / `Admin123!`
- **User** - `user@Favigon.local` / `User123!`

Additional demo profiles are also seeded for explore/social flows.

## Docker Setup 🐳

The root `docker-compose.yml` defines:

- `db` - PostgreSQL 16
- `api` - ASP.NET Core backend
- `frontend` - Angular production build served through Nginx
- `cloudflared` - optional Cloudflare tunnel container

Run the stack with:

```bash
docker compose up --build
```

Important notes:

- The provided compose file is **deployment-oriented** and does **not** publish localhost ports by default.
- If you only want local development, the direct `dotnet run` + `npm start` flow above is the easier path.
- In production, the frontend container serves the Angular build through **Nginx** and proxies `/api` requests to the backend container.
- The `cloudflared` service requires a valid `CLOUDFLARE_TUNNEL_TOKEN`.
- Compose also expects `POSTGRES_USER` and `POSTGRES_PASSWORD` in the environment.

## Testing ✅

### Backend

```bash
cd Backend
dotnet test
```

Current automated backend coverage includes:

- controllers
- auth service flows
- project and user services
- middleware
- converter engine behavior

### Frontend

```bash
cd Frontend
npm test
```

### Production builds

```bash
cd Backend
dotnet build Favigon.sln -c Release

cd ../Frontend
npm run build
```

## CI / CD

GitHub Actions are already configured:

- **CI** builds and tests the backend, then builds the frontend
- **CD** builds and pushes container images to **GHCR**
- production deployment workflow is scaffolded, but currently disabled

## Why This Project 💡

Favigon sits at the intersection of:

- web creation tools
- social discovery for creative projects
- visual editing
- AI-assisted UI generation
- design system reasoning
- code generation

It is both a product experiment and a technical portfolio project focused on helping people **create, share, discover, and export** web projects inside one system.

## Contributing

Contributions, suggestions, and feedback are welcome. Open an issue or a pull request if you want to improve the platform or the documentation.
