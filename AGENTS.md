# Favigon Project Context

Use this file as the default project brief. It is intentionally short so agents do not need to scan the full repository for every task.

## What This Repo Is

Favigon is a full-stack product with:
- `Frontend/`: Angular 20 standalone app.
- `Backend/`: ASP.NET Core 9 API with layered architecture.
- Root `docker-compose.yml`: PostgreSQL + API + frontend + Cloudflare tunnel.

Primary product areas visible in the codebase:
- Auth and user profile flows
- Project management and explore/social features
- Canvas editor for visual page editing
- AI-assisted design generation
- Design-to-code conversion pipeline

## Fast Architecture Map

Frontend:
- App entry: `Frontend/src/app/app.config.ts` and `Frontend/src/app/app.routes.ts`
- Code is organized by `core`, `shared`, and `features`
- `core/` contains models, API services, guards, interceptors, and utilities
- `shared/` contains reusable UI components
- `features/canvas/` is the most complex frontend area and holds editor state, rendering, mappers, and editing utilities
- Path aliases are defined in `Frontend/tsconfig.json`:
  - `@app/core`
  - `@app/shared`
  - `@app/features/*`

Backend:
- API entry: `Backend/Favigon.API/Program.cs`
- Request flow is typically:
  - Controller in `Favigon.API/Controllers`
  - Service in `Favigon.Application/Services`
  - Repository or external adapter in `Favigon.Infrastructure`
- Domain entities live in `Favigon.Domain/Entities`
- Converter engine is isolated in `Favigon.Converter`
- EF Core context, migrations, seeding, and infra integrations live in `Favigon.Infrastructure`
- Tests live in `Backend/Favigon.Tests`

## High-Value Files To Read First

When working on frontend app setup:
- `Frontend/src/app/app.config.ts`
- `Frontend/src/app/app.routes.ts`
- `Frontend/package.json`

When working on the canvas editor:
- `Frontend/src/app/features/canvas/pages/canvas-page/canvas-page.component.ts`
- `Frontend/src/app/features/canvas/services/`
- `Frontend/src/app/features/canvas/mappers/`
- `Frontend/src/app/features/canvas/utils/`

When working on backend API behavior:
- `Backend/Favigon.API/Program.cs`
- Relevant controller in `Backend/Favigon.API/Controllers/`
- Matching service in `Backend/Favigon.Application/Services/`
- Matching repository in `Backend/Favigon.Infrastructure/Repositories/`

When working on AI generation:
- `Backend/Favigon.API/Controllers/AiDesignController.cs`
- `Backend/Favigon.Application/Services/AiDesignService.cs`
- `Backend/Favigon.Application/Services/AiPipelineService.cs`
- `Backend/Favigon.Infrastructure/External/AI/OpenAiClient.cs`

When working on export/conversion:
- `Backend/Favigon.Application/Services/ConverterService.cs`
- `Backend/Favigon.Converter/ConverterEngine.cs`
- `Backend/Favigon.Converter/Generators/`
- `Backend/Favigon.Converter/Parsers/Canvas/CanvasParser.cs`

## Conventions That Matter

Frontend:
- Angular uses standalone components and lazy-loaded routes
- Prefer existing `@app/...` aliases over deep relative imports
- HTTP concerns are centralized through core services and interceptors
- The canvas feature uses signals and feature-scoped services heavily; keep logic close to that feature instead of leaking it into generic shared code

Backend:
- Keep business logic in Application services, not controllers
- Keep persistence details in Infrastructure repositories
- Register new services through the DI extension files:
  - `Backend/Favigon.Application/DIConfig.cs`
  - `Backend/Favigon.Infrastructure/DIConfig.cs`
- The API uses JWT auth from cookies, CORS, rate limiting, Serilog, and custom middleware
- Database schema changes imply EF Core migrations in `Backend/Favigon.Infrastructure/Migrations`

## Practical Token-Saving Rules

- Do not open all migrations unless the task is schema-specific
- Do not scan the full `features/canvas` tree unless the task is editor-related
- Start from route, controller, or service entrypoints and follow the dependency chain inward
- Prefer searching by feature name or DTO/service/controller name instead of browsing directories broadly
- For backend changes, read one controller, one service, and one repository before exploring deeper
- For frontend changes, read the page/component plus the immediately injected services before opening utilities

## Local Commands

Frontend:
- `cd Frontend`
- `npm start`
- `npm run build`
- `npm test`

Backend:
- `cd Backend`
- `dotnet run --project Favigon.API`
- `dotnet test`

Containers:
- `docker compose up --build`

## Known Stack Details

- Frontend: Angular 20, TypeScript 5.9, RxJS 7, GSAP, html2canvas, JSZip
- Backend: .NET 9, ASP.NET Core, EF Core with PostgreSQL, AutoMapper, FluentValidation, Serilog
- AI client is implemented as an infrastructure HTTP client, not as direct controller logic

## Change Discipline

- Prefer targeted changes inside the active feature instead of cross-cutting refactors
- Preserve existing layering: API -> Application -> Infrastructure
- Add or update tests in `Backend/Favigon.Tests` when backend behavior changes
- Keep this file concise; update it only when architecture or conventions materially change
