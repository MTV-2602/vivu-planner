/**
 * Cấu hình kỹ thuật và tham số hệ thống cho Backend ViVu Planner v2.0
 */

export const SERVER_CONFIG = {
  DEFAULT_PORT: 4000,
  BODY_MAX_SIZE: '10mb',
  AI_REQUEST_TIMEOUT_MS: 180_000, // 3 phút cho Gemini AI
};

export const AI_CONFIG = {
  DEFAULT_MODEL: 'gemini-2.5-flash',
  DEFAULT_TEMPERATURE: 0.2,
  RESPONSE_MIME_TYPE: 'application/json',
};

export const GEO_CONFIG = {
  DEFAULT_COORDINATES: { lat: 16.0544, lng: 108.2022 }, // Đà Nẵng fallback
  EARTH_RADIUS_KM: 6371,
  DEFAULT_CACHE_GEO_DELTA: 0.25,
  OSM_SEARCH_DELTA: 0.15,
};

export const EXTERNAL_APIS = {
  OPEN_METEO_BASE_URL: 'https://api.open-meteo.com/v1/forecast',
  NOMINATIM_OSM_URL: 'https://nominatim.openstreetmap.org/search',
  USER_AGENT: 'ViVu-Planner-App/2.0 (contact@vivuplanner.vn)',
};

export const TIMEOUTS = {
  WEATHER_API_MS: 3000,
  NOMINATIM_API_MS: 2000,
};

export const LOG_CONFIG = {
  ERROR_LOG_PATH: 'error_log.txt',
};
