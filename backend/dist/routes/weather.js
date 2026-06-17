"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authMiddleware_1 = require("../middleware/authMiddleware");
const weatherService_1 = require("../services/weatherService");
const router = (0, express_1.Router)();
router.get('/', authMiddleware_1.authMiddleware, async (req, res) => {
    const { lat, lng, start_date, end_date } = req.query;
    if (!lat || !lng || !start_date || !end_date) {
        return res.status(400).json({ error: 'Missing parameters: lat, lng, start_date, and end_date are required' });
    }
    try {
        const forecast = await (0, weatherService_1.getWeatherForecast)(parseFloat(lat), parseFloat(lng), start_date, end_date);
        return res.json(forecast);
    }
    catch (error) {
        return res.status(500).json({ error: 'Failed to retrieve weather forecast', details: error.message });
    }
});
exports.default = router;
