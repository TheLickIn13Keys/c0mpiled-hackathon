# Agri Fire Atlas

A Next.js web application combining:

- Mapbox wildfire + agriculture risk mapping
- Three.js crop resilience simulation
- AI geo mitigation advisor (location-aware prevention tiles + modal playbooks)
- A high-contrast dashboard UI tailored for wildfire operations

## Stack

- Next.js (App Router + TypeScript)
- mapbox-gl
- three.js with @react-three/fiber and @react-three/drei

## Getting Started

1. Install dependencies:

```bash
npm install
```

2. Add your Mapbox token:

```bash
cp .env.local.example .env.local
```

Then update `.env.local`:

```bash
NEXT_PUBLIC_MAPBOX_TOKEN=your_mapbox_public_token
OPENAI_API_KEY=your_openai_api_key_optional
OPENAI_MODEL=gpt-4.1-mini
```

`OPENAI_API_KEY` is optional. Without it, the advisor still works using deterministic
rules from local telemetry.

3. Start development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Notes

- The map gracefully shows a setup panel when `NEXT_PUBLIC_MAPBOX_TOKEN` is missing.
- The Three.js panel runs fully client-side and is mobile-responsive.
- The advisor API route (`/api/geo-mitigation`) fuses Open-Meteo weather + air quality
  and optionally uses OpenAI to synthesize richer action tiles.
