"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWeatherForecast = getWeatherForecast;
const axios_1 = __importDefault(require("axios"));
async function getWeatherForecast(lat, lng, startDate, endDate) {
    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&start_date=${startDate}&end_date=${endDate}`;
        const response = await axios_1.default.get(url);
        const daily = response.data?.daily;
        if (!daily || !daily.time) {
            throw new Error('Invalid weather API response format');
        }
        const forecasts = daily.time.map((date, idx) => {
            const code = daily.weather_code ? daily.weather_code[idx] : 0;
            let condition = 'Trời quang';
            if ([1, 2, 3].includes(code)) {
                condition = 'Nhiều mây';
            }
            else if ([45, 48].includes(code)) {
                condition = 'Sương mù';
            }
            else if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) {
                condition = 'Có mưa';
            }
            else if ([95, 96, 99].includes(code)) {
                condition = 'Có giông';
            }
            return {
                date,
                condition,
                temp_max: Math.round(daily.temperature_2m_max ? daily.temperature_2m_max[idx] : 30),
                temp_min: Math.round(daily.temperature_2m_min ? daily.temperature_2m_min[idx] : 23),
                rain_chance: daily.precipitation_probability_max ? daily.precipitation_probability_max[idx] : 10
            };
        });
        return forecasts;
    }
    catch (error) {
        console.warn(`Open-Meteo query failed: ${error.message}. Returning mock weather forecasts.`);
        // Return sensible default forecasts
        const forecasts = [];
        const start = new Date(startDate);
        const end = new Date(endDate);
        const diffTime = Math.abs(end.getTime() - start.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        for (let i = 0; i < diffDays; i++) {
            const current = new Date(start);
            current.setDate(start.getDate() + i);
            const dateStr = current.toISOString().split('T')[0];
            forecasts.push({
                date: dateStr,
                condition: i % 3 === 0 ? 'Có mưa' : 'Trời quang',
                temp_min: 24,
                temp_max: 32,
                rain_chance: i % 3 === 0 ? 75 : 15
            });
        }
        return forecasts;
    }
}
