import { NextResponse } from "next/server";

type AdvisorRequest = {
  lat?: number;
  lon?: number;
  cropType?: "almond" | "walnut" | "grape" | "mixed";
};

type Tile = {
  id: string;
  title: string;
  priority: "high" | "medium" | "low";
  whyNow: string;
  modalTitle: string;
  modalSummary: string;
  actions: string[];
  tags: string[];
};

type AdvisorPayload = {
  areaLabel: string;
  lastUpdated: string;
  riskSummary: string;
  telemetry: {
    temperatureC: number;
    humidityPct: number;
    windMph: number;
    pm25: number;
    usAqi: number;
  };
  tiles: Tile[];
  sourceNotes: string[];
};

type WeatherData = {
  temperatureC: number;
  humidityPct: number;
  windMph: number;
};

type AirData = {
  pm25: number;
  usAqi: number;
};

const DEFAULT_COORDS = { lat: 39.14, lon: -121.62 };

function toSafeNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function classifyRegion(lat: number, lon: number) {
  const isCalifornia = lat >= 32 && lat <= 42.2 && lon >= -124.6 && lon <= -114;
  const isCentralValley = lat >= 35 && lat <= 40.8 && lon >= -122.6 && lon <= -119.2;

  if (isCalifornia && isCentralValley) {
    return "California Central Valley";
  }

  if (isCalifornia) {
    return "California Ag Zone";
  }

  return "Farm Operations Zone";
}

function buildRiskSummary(weather: WeatherData, air: AirData) {
  const stressScore =
    Math.min(45, Math.max(0, air.pm25 * 1.2)) +
    Math.min(25, Math.max(0, weather.windMph - 6) * 1.6) +
    Math.min(20, Math.max(0, weather.temperatureC - 29) * 1.25) +
    Math.min(10, Math.max(0, 50 - weather.humidityPct) * 0.25);

  if (stressScore >= 70) {
    return "High risk in next 6 hours: smoke loading + heat stress likely to reduce yield if mitigation is delayed.";
  }

  if (stressScore >= 45) {
    return "Moderate risk in next 6 hours: deploy targeted mitigation now to avoid cumulative crop stress.";
  }

  return "Elevated watch: conditions are manageable but trending toward stress, keep rapid-response options ready.";
}

function fallbackTiles(cropType: AdvisorRequest["cropType"], weather: WeatherData, air: AirData): Tile[] {
  const windHeavy = weather.windMph >= 14;
  const smokeHeavy = air.pm25 >= 25 || air.usAqi >= 100;
  const hot = weather.temperatureC >= 31;

  const cropLabel = cropType === "mixed" || !cropType ? "orchard blocks" : `${cropType} blocks`;

  const tileSet: Tile[] = [
    {
      id: "rinse-window",
      title: "Open Rinse Window",
      priority: smokeHeavy ? "high" : "medium",
      whyNow: smokeHeavy
        ? "PM2.5 is elevated and ash residue risk is rising."
        : "Early rinse lowers residue accumulation before the next plume shift.",
      modalTitle: "Sprinkler Rinse Protocol",
      modalSummary: `Use short-cycle canopy rinse on ${cropLabel} before peak heat and wind to reduce smoke residue adhesion.`,
      actions: [
        "Run 20-40 minute rinse cycle on highest-risk blocks first.",
        "Avoid over-saturation in poorly drained rows.",
        "Log start/end time for traceability and insurance notes."
      ],
      tags: ["Smoke", "Residue", "Water Ops"]
    },
    {
      id: "crews-reposition",
      title: "Reposition Patrol Crews",
      priority: windHeavy ? "high" : "medium",
      whyNow: windHeavy
        ? "Wind speed supports ember travel into downwind rows."
        : "Early patrol positioning improves first-response time for spot fires.",
      modalTitle: "Field Patrol and Ember Watch",
      modalSummary: "Shift crews and mobile units to downwind perimeter rows to detect embers and spot ignitions quickly.",
      actions: [
        "Stage one crew per high-risk perimeter segment.",
        "Assign comms check-ins every 20 minutes.",
        "Prepare suppression kits at lane intersections."
      ],
      tags: ["Embers", "Safety", "Response"]
    },
    {
      id: "crop-protection",
      title: cropType === "grape" ? "Smoke Taint Guard" : "Heat + PAR Protection",
      priority: hot || smokeHeavy ? "high" : "low",
      whyNow:
        cropType === "grape"
          ? "Smoke exposure is accumulating and can increase taint compound risk."
          : "Heat and smoke can compound photosynthesis loss and stress reserves.",
      modalTitle: cropType === "grape" ? "Grape Taint Mitigation" : "Orchard Stress Mitigation",
      modalSummary:
        cropType === "grape"
          ? "Use targeted barrier strategy and dose tracking to protect grape quality decisions."
          : "Protect carbohydrate reserves through canopy cooling and PAR-loss aware irrigation decisions.",
      actions:
        cropType === "grape"
          ? [
              "Track cumulative smoke exposure by block every 2 hours.",
              "Apply barrier strategy for lots nearing quality threshold.",
              "Prepare early-harvest decision matrix with winery partner."
            ]
          : [
              "Prioritize irrigation buffering on high-value blocks.",
              "Delay high-stress mechanical operations during heat peak.",
              "Monitor leaves and fruit for ash film and heat stress indicators."
            ],
      tags: cropType === "grape" ? ["Smoke Taint", "Harvest"] : ["Heat Stress", "PAR", "Yield"]
    }
  ];

  return tileSet;
}

async function fetchTelemetry(lat: number, lon: number) {
  const weatherUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    "&current=temperature_2m,relative_humidity_2m,wind_speed_10m";

  const airUrl =
    `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}` +
    "&current=pm2_5,us_aqi";

  const [weatherRes, airRes] = await Promise.allSettled([fetch(weatherUrl), fetch(airUrl)]);

  let weather: WeatherData = { temperatureC: 30, humidityPct: 34, windMph: 13 };
  let air: AirData = { pm25: 18, usAqi: 84 };

  if (weatherRes.status === "fulfilled" && weatherRes.value.ok) {
    const payload = await weatherRes.value.json();
    weather = {
      temperatureC: toSafeNumber(payload?.current?.temperature_2m, 30),
      humidityPct: toSafeNumber(payload?.current?.relative_humidity_2m, 34),
      windMph: toSafeNumber(payload?.current?.wind_speed_10m, 13) * 0.621371
    };
  }

  if (airRes.status === "fulfilled" && airRes.value.ok) {
    const payload = await airRes.value.json();
    air = {
      pm25: toSafeNumber(payload?.current?.pm2_5, 18),
      usAqi: toSafeNumber(payload?.current?.us_aqi, 84)
    };
  }

  return { weather, air };
}

async function aiTiles(payload: {
  cropType: NonNullable<AdvisorRequest["cropType"]>;
  areaLabel: string;
  weather: WeatherData;
  air: AirData;
}) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return null;
  }

  const prompt = [
    "You are an agricultural wildfire response advisor.",
    "Return JSON only with this schema:",
    '{"tiles":[{"id":"string","title":"string","priority":"high|medium|low","whyNow":"string","modalTitle":"string","modalSummary":"string","actions":["string"],"tags":["string"]}]}.',
    "Create exactly 3 tiles for near-term field actions.",
    `Area: ${payload.areaLabel}.`,
    `Crop: ${payload.cropType}.`,
    `Telemetry: tempC=${payload.weather.temperatureC.toFixed(1)}, humidity=${payload.weather.humidityPct.toFixed(0)}, windMph=${payload.weather.windMph.toFixed(1)}, pm25=${payload.air.pm25.toFixed(1)}, usAqi=${payload.air.usAqi.toFixed(0)}.`,
    "Prioritize practical crop/yield protection actions."
  ].join(" ");

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
        input: prompt,
        temperature: 0.2,
        max_output_tokens: 650
      })
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const text: string | undefined = data?.output_text;
    if (!text) {
      return null;
    }

    const parsed = JSON.parse(text) as { tiles?: Tile[] };
    if (!parsed.tiles || !Array.isArray(parsed.tiles) || parsed.tiles.length === 0) {
      return null;
    }

    return parsed.tiles.slice(0, 3);
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AdvisorRequest;
    const lat = toSafeNumber(body.lat, DEFAULT_COORDS.lat);
    const lon = toSafeNumber(body.lon, DEFAULT_COORDS.lon);
    const cropType = body.cropType ?? "mixed";

    const { weather, air } = await fetchTelemetry(lat, lon);
    const areaLabel = `${classifyRegion(lat, lon)} (${lat.toFixed(2)}, ${lon.toFixed(2)})`;
    const ai = await aiTiles({ cropType, areaLabel, weather, air });

    const payload: AdvisorPayload = {
      areaLabel,
      lastUpdated: new Date().toISOString(),
      riskSummary: buildRiskSummary(weather, air),
      telemetry: {
        temperatureC: Number(weather.temperatureC.toFixed(1)),
        humidityPct: Number(weather.humidityPct.toFixed(0)),
        windMph: Number(weather.windMph.toFixed(1)),
        pm25: Number(air.pm25.toFixed(1)),
        usAqi: Number(air.usAqi.toFixed(0))
      },
      tiles: ai ?? fallbackTiles(cropType, weather, air),
      sourceNotes: [
        "Open-Meteo weather API",
        "Open-Meteo air-quality API",
        ai ? "OpenAI recommendation synthesis" : "Rules-based recommendation synthesis"
      ]
    };

    return NextResponse.json(payload);
  } catch {
    return NextResponse.json(
      { error: "Unable to generate mitigation plan" },
      { status: 500 }
    );
  }
}
