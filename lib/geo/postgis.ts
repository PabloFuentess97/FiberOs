import { sql, type SQL } from "drizzle-orm";

export interface LatLng {
  lat: number;
  lng: number;
}

/** Genera SQL para insertar un Point WGS84 a partir de lat/lng. */
export function pointSQL({ lat, lng }: LatLng): SQL {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error("Coordenadas inválidas");
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    throw new Error("Coordenadas fuera de rango");
  }
  return sql`ST_GeographyFromText(${`SRID=4326;POINT(${lng} ${lat})`})`;
}

/** Genera SQL para insertar un LineString a partir de [{lat,lng}, ...]. */
export function lineStringSQL(points: LatLng[]): SQL {
  if (points.length < 2) {
    throw new Error("LineString requiere al menos 2 puntos");
  }
  const coords = points.map((p) => `${p.lng} ${p.lat}`).join(", ");
  return sql`ST_GeographyFromText(${`SRID=4326;LINESTRING(${coords})`})`;
}

/** Extrae lat/lng desde un resultado `ST_AsGeoJSON` como string. */
export function pointFromGeoJSON(geojson: string): LatLng {
  const parsed = JSON.parse(geojson) as { coordinates: [number, number] };
  return { lng: parsed.coordinates[0], lat: parsed.coordinates[1] };
}

export function lineStringFromGeoJSON(geojson: string): LatLng[] {
  const parsed = JSON.parse(geojson) as { coordinates: [number, number][] };
  return parsed.coordinates.map(([lng, lat]) => ({ lat, lng }));
}
