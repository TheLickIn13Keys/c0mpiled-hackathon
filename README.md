# Agri Fire Atlas

A Next.js web application combining:

- Mapbox wildfire + agriculture risk mapping
- Three.js crop resilience simulation
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
```

3. Start development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Notes

- The map gracefully shows a setup panel when `NEXT_PUBLIC_MAPBOX_TOKEN` is missing.
- The Three.js panel runs fully client-side and is mobile-responsive.
