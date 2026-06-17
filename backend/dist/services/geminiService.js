"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateItinerary = generateItinerary;
exports.adaptItinerary = adaptItinerary;
exports.generateAlternatives = generateAlternatives;
const genai_1 = require("@google/genai");
const keyManagerService_1 = require("./keyManagerService");
const ITINERARY_JSON_SCHEMA = {
    type: 'object',
    properties: {
        days: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    day_number: { type: 'integer' },
                    date: { type: 'string' },
                    weather_note: { type: 'string' },
                    items: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                item_type: {
                                    type: 'string',
                                    enum: ['accommodation', 'transport', 'dining', 'attraction', 'rental', 'experience']
                                },
                                title: { type: 'string' },
                                description: { type: 'string' },
                                start_time: { type: 'string' },
                                end_time: { type: 'string' },
                                google_place_id: { type: 'string' },
                                estimated_cost: { type: 'number' },
                                order_index: { type: 'integer' }
                            },
                            required: ['item_type', 'title', 'description', 'order_index']
                        }
                    }
                },
                required: ['day_number', 'date', 'weather_note', 'items']
            }
        },
        budget_summary: {
            type: 'object',
            properties: {
                estimated_total: { type: 'number' },
                remaining: { type: 'number' }
            },
            required: ['estimated_total', 'remaining']
        }
    },
    required: ['days', 'budget_summary']
};
async function generateItinerary(tripData, weatherForecast, candidatePlaces) {
    const systemPrompt = `Bạn là trợ lý lập kế hoạch du lịch chuyên về Việt Nam. 
Bạn CHỈ được chọn địa điểm trong danh sách "candidate_places" được cung cấp — không tự tạo thêm địa điểm nào ngoài danh sách này (ngoại trừ loại di chuyển "transport" hoặc trải nghiệm "experience" tự do). 
Bạn phải tôn trọng ngân sách, tình trạng sức khỏe, và sở thích của khách. 
Trả lời CHỈ bằng JSON hợp lệ đúng schema được cung cấp, không thêm markdown, không thêm giải thích.`;
    const userPrompt = JSON.stringify({
        trip: {
            destination_city: tripData.destination_city,
            start_date: tripData.start_date,
            end_date: tripData.end_date,
            budget_total: tripData.budget_total,
            traveler_count: tripData.traveler_count,
            traveler_type: tripData.traveler_type,
            preferences: tripData.preferences,
            health_conditions: tripData.health_conditions,
            special_requirements: tripData.special_requirements
        },
        weather_forecast: weatherForecast,
        candidate_places: {
            accommodation: candidatePlaces.accommodation || [],
            dining: candidatePlaces.dining || [],
            attraction: candidatePlaces.attraction || [],
            rental: candidatePlaces.rental || []
        }
    });
    try {
        return await (0, keyManagerService_1.executeWithApiKeyRotation)(async (apiKey) => {
            const ai = new genai_1.GoogleGenAI({ apiKey });
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: `${systemPrompt}\n\nDữ liệu yêu cầu:\n${userPrompt}`,
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: ITINERARY_JSON_SCHEMA
                }
            });
            const text = response.text;
            if (!text) {
                throw new Error('Gemini returned empty response text');
            }
            const parsed = JSON.parse(text);
            // Validate google_place_ids to prevent hallucinations
            const validIds = new Set();
            Object.values(candidatePlaces).forEach(list => {
                list.forEach(place => validIds.add(place.google_place_id));
            });
            parsed.days.forEach(day => {
                day.items.forEach(item => {
                    if (item.google_place_id && !validIds.has(item.google_place_id)) {
                        console.warn(`Filtering hallucinated place id: ${item.google_place_id} for item: ${item.title}`);
                        delete item.google_place_id;
                    }
                });
            });
            return parsed;
        });
    }
    catch (error) {
        console.error(`Gemini generation failed: ${error.message}. Falling back to programmatic generation.`);
        return generateMockItinerary(tripData, weatherForecast, candidatePlaces);
    }
}
async function adaptItinerary(tripData, currentItinerary, disruptionType, disruptionDescription, weatherForecast, candidatePlaces) {
    const systemPrompt = `Bạn là trợ lý lập kế hoạch du lịch chuyên về Việt Nam. 
Bạn cần điều chỉnh lịch trình du lịch hiện tại do có sự cố xảy ra. 
Bạn CHỈ được điều chỉnh các ngày hoặc hoạt động từ thời điểm xảy ra sự cố trở đi (dữ liệu truyền vào sẽ chỉ ra phần cần chỉnh sửa). Giữ nguyên các hoạt động đã hoàn thành trước đó. 
Bạn phải điều chỉnh để phù hợp với sự cố mới (về thời tiết, ngân sách, sức khỏe, hoặc thời gian). 
Chọn địa điểm từ danh sách "candidate_places" được cung cấp nếu cần thay thế địa điểm. 
Trả lời CHỈ bằng JSON hợp lệ đúng schema được cung cấp.`;
    const userPrompt = JSON.stringify({
        trip: tripData,
        current_itinerary: currentItinerary,
        disruption: {
            type: disruptionType,
            description: disruptionDescription
        },
        weather_forecast: weatherForecast,
        candidate_places: candidatePlaces
    });
    try {
        return await (0, keyManagerService_1.executeWithApiKeyRotation)(async (apiKey) => {
            const ai = new genai_1.GoogleGenAI({ apiKey });
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: `${systemPrompt}\n\nDữ liệu yêu cầu:\n${userPrompt}`,
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: ITINERARY_JSON_SCHEMA
                }
            });
            const text = response.text;
            if (!text)
                throw new Error('Gemini response is empty');
            const parsed = JSON.parse(text);
            const diff = generateItineraryDiff(currentItinerary, parsed, disruptionType);
            return { itinerary: parsed, diff };
        });
    }
    catch (error) {
        console.error(`Gemini adaptation failed: ${error.message}. Using fallback.`);
        return adaptMockItinerary(currentItinerary, disruptionType, disruptionDescription, candidatePlaces);
    }
}
// Programmatic mock itinerary generator
function generateMockItinerary(tripData, weatherForecast, candidatePlaces) {
    const accommodations = candidatePlaces.accommodation || [];
    const dining = candidatePlaces.dining || [];
    const attractions = candidatePlaces.attraction || [];
    const rentals = candidatePlaces.rental || [];
    const days = weatherForecast.map((weather, index) => {
        const dayNumber = index + 1;
        const items = [];
        // Accommodation (Place 1)
        if (accommodations.length > 0) {
            const hotel = accommodations[index % accommodations.length];
            items.push({
                item_type: 'accommodation',
                title: `Nhận phòng / Nghỉ ngơi tại ${hotel.name}`,
                description: `Chỗ nghỉ tiện nghi, nằm tại trung tâm. Đánh giá: ${hotel.rating}⭐.`,
                start_time: '14:00',
                end_time: '15:00',
                google_place_id: hotel.google_place_id,
                estimated_cost: hotel.price_level * 500000,
                order_index: 0
            });
        }
        // Transport (Place 2)
        items.push({
            item_type: 'transport',
            title: 'Di chuyển bằng xe máy / Taxi nội thành',
            description: 'Lựa chọn phương tiện linh hoạt để tham quan các địa điểm.',
            start_time: '08:00',
            end_time: '08:30',
            estimated_cost: 50000,
            order_index: 1
        });
        // Attraction 1 (Morning)
        if (attractions.length > 0) {
            const site = attractions[(index * 2) % attractions.length];
            items.push({
                item_type: 'attraction',
                title: `Tham quan ${site.name}`,
                description: `Khám phá vẻ đẹp lịch sử và văn hóa địa phương. Địa chỉ: ${site.address}`,
                start_time: '09:00',
                end_time: '11:30',
                google_place_id: site.google_place_id,
                estimated_cost: site.price_level * 80000,
                order_index: 2
            });
        }
        // Dining (Lunch)
        if (dining.length > 0) {
            const rest = dining[(index * 2) % dining.length];
            items.push({
                item_type: 'dining',
                title: `Ăn trưa tại ${rest.name}`,
                description: `Thưởng thức các món ngon đặc sản. Đánh giá: ${rest.rating}⭐.`,
                start_time: '12:00',
                end_time: '13:00',
                google_place_id: rest.google_place_id,
                estimated_cost: rest.price_level * 150000,
                order_index: 3
            });
        }
        // Attraction 2 (Afternoon)
        if (attractions.length > 0) {
            const site = attractions[(index * 2 + 1) % attractions.length];
            items.push({
                item_type: 'attraction',
                title: `Trải nghiệm tại ${site.name}`,
                description: `Tận hưởng không gian và tìm hiểu về các câu chuyện thú vị.`,
                start_time: '15:00',
                end_time: '17:30',
                google_place_id: site.google_place_id,
                estimated_cost: site.price_level * 50000,
                order_index: 4
            });
        }
        // Experience (Evening)
        items.push({
            item_type: 'experience',
            title: 'Dạo chơi phố cổ / Chợ đêm',
            description: 'Hòa mình vào không khí nhộn nhịp về đêm của thành phố, thưởng thức ẩm thực đường phố.',
            start_time: '19:00',
            end_time: '21:30',
            estimated_cost: 100000,
            order_index: 5
        });
        return {
            day_number: dayNumber,
            date: weather.date,
            weather_note: `${weather.condition}, nhiệt độ từ ${weather.temp_min}°C - ${weather.temp_max}°C. Khả năng mưa: ${weather.rain_chance}%.`,
            items
        };
    });
    const estimated_total = days.reduce((sum, day) => {
        return sum + day.items.reduce((daySum, item) => daySum + (item.estimated_cost || 0), 0);
    }, 0);
    const budget_total = Number(tripData.budget_total) || 5000000;
    return {
        days,
        budget_summary: {
            estimated_total,
            remaining: Math.max(0, budget_total - estimated_total)
        }
    };
}
// Programmatic mock disruption adaptation
function adaptMockItinerary(currentItinerary, disruptionType, disruptionDescription, candidatePlaces) {
    // Deep clone currentItinerary
    const newItinerary = JSON.parse(JSON.stringify(currentItinerary));
    let diffMessages = [];
    newItinerary.days.forEach((day, dIdx) => {
        // Modify from Day 1 onwards, but for demo we just touch the afternoon/evening activities
        day.items.forEach((item, iIdx) => {
            // Disruption 1: Weather (Rain)
            if (disruptionType === 'weather_change' && item.item_type === 'attraction') {
                const oldTitle = item.title;
                item.title = `[Thay đổi do thời tiết] Tham quan Bảo tàng / Điểm trong nhà`;
                item.description = `Thay thế hoạt động ngoài trời tại ${oldTitle} bằng địa điểm trong nhà để tránh mưa bão. Ràng buộc: ${disruptionDescription}`;
                item.estimated_cost = Math.round((item.estimated_cost || 50000) * 0.8);
                diffMessages.push(`Ngày ${day.day_number}: Thay đổi điểm ngoài trời "${oldTitle}" thành điểm tham quan trong nhà.`);
            }
            // Disruption 2: Budget Shortage
            if (disruptionType === 'budget_shortage' && (item.item_type === 'attraction' || item.item_type === 'dining')) {
                if ((item.estimated_cost || 0) > 100000) {
                    const oldCost = item.estimated_cost;
                    item.estimated_cost = Math.round((item.estimated_cost || 0) * 0.4);
                    item.title = `[Tiết kiệm] ${item.title}`;
                    item.description = `${item.description} (Đã chuyển sang phương án tiết kiệm chi phí do hạn chế ngân sách mới: ${disruptionDescription})`;
                    diffMessages.push(`Ngày ${day.day_number}: Cắt giảm chi phí tại "${item.title.replace('[Tiết kiệm] ', '')}" từ ${oldCost?.toLocaleString('vi-VN')}đ xuống ${item.estimated_cost?.toLocaleString('vi-VN')}đ.`);
                }
            }
            // Disruption 3: Health Issue
            if (disruptionType === 'health_issue' && item.item_type === 'attraction') {
                const oldTitle = item.title;
                item.title = `[Nghỉ ngơi nhẹ nhàng] Dạo cảnh / Thư giãn`;
                item.description = `Thay thế hoạt động nặng nhọc bằng nghỉ ngơi hoặc đi dạo nhẹ để đảm bảo sức khỏe. Ghi chú: ${disruptionDescription}`;
                diffMessages.push(`Ngày ${day.day_number}: Giảm cường độ hoạt động từ "${oldTitle}" sang thư giãn nhẹ nhàng.`);
            }
            // Disruption 4: Delay (Transport delay)
            if (disruptionType === 'delay' && iIdx === 1) {
                item.title = `[Trễ chuyến] Điều chỉnh thời gian di chuyển`;
                item.description = `Thời gian khởi hành bị lùi lại do sự cố di chuyển: ${disruptionDescription}`;
                diffMessages.push(`Ngày ${day.day_number}: Điều chỉnh lịch di chuyển và hoạt động buổi sáng.`);
            }
        });
    });
    const new_total = newItinerary.days.reduce((sum, day) => {
        return sum + day.items.reduce((daySum, item) => daySum + (item.estimated_cost || 0), 0);
    }, 0);
    const budget_total = currentItinerary.budget_summary.estimated_total + currentItinerary.budget_summary.remaining;
    newItinerary.budget_summary = {
        estimated_total: new_total,
        remaining: Math.max(0, budget_total - new_total)
    };
    const diff = diffMessages.length > 0
        ? diffMessages.join('\n')
        : `Lịch trình được tối ưu hóa lại để phù hợp với sự cố: ${disruptionDescription}.`;
    return { itinerary: newItinerary, diff };
}
// Generate text diff comparing before and after
function generateItineraryDiff(oldItinerary, newItinerary, disruptionType) {
    let diffs = [];
    newItinerary.days.forEach((day, dIdx) => {
        const oldDay = oldItinerary.days[dIdx];
        if (!oldDay)
            return;
        day.items.forEach((item, iIdx) => {
            const oldItem = oldDay.items[iIdx];
            if (!oldItem) {
                diffs.push(`Ngày ${day.day_number}: Thêm hoạt động mới "${item.title}"`);
                return;
            }
            if (item.title !== oldItem.title || item.estimated_cost !== oldItem.estimated_cost) {
                diffs.push(`Ngày ${day.day_number}: Thay đổi "${oldItem.title}" (${oldItem.estimated_cost?.toLocaleString('vi-VN')}đ) thành "${item.title}" (${item.estimated_cost?.toLocaleString('vi-VN')}đ)`);
            }
        });
    });
    return diffs.length > 0
        ? diffs.join('\n')
        : `Điều chỉnh lịch trình thành công cho phù hợp với loại sự cố: ${disruptionType}.`;
}
const ALTERNATIVES_JSON_SCHEMA = {
    type: 'object',
    properties: {
        alternatives: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    item_type: {
                        type: 'string',
                        enum: ['accommodation', 'transport', 'dining', 'attraction', 'rental', 'experience']
                    },
                    title: { type: 'string' },
                    description: { type: 'string' },
                    start_time: { type: 'string' },
                    end_time: { type: 'string' },
                    estimated_cost: { type: 'number' },
                    reason: { type: 'string' },
                    google_place_id: { type: 'string' }
                },
                required: ['item_type', 'title', 'description', 'start_time', 'end_time', 'reason']
            }
        }
    },
    required: ['alternatives']
};
async function generateAlternatives(tripData, originalItem, userRequirement, candidatePlaces) {
    const systemPrompt = `Bạn là trợ lý AI lập lịch trình du lịch Việt Nam.
Hãy đề xuất đúng 3 hoạt động thay thế (alternatives) cho hoạt động gốc được cung cấp, dựa trên yêu cầu đặc thù của người dùng.
Bạn phải tận dụng danh sách candidate_places được cung cấp ở dưới để lấy tên và google_place_id cho các hoạt động ăn uống/chỗ nghỉ/tham quan/thuê xe (nếu phù hợp).
Giờ bắt đầu và kết thúc của hoạt động thay thế nên khớp hoặc gần khớp với hoạt động gốc (${originalItem.start_time || '08:00'} - ${originalItem.end_time || '10:00'}), nhưng có thể thay đổi nhẹ nếu cần.
Trả về định dạng JSON hợp lệ theo đúng schema được cấu hình. Không thêm markdown, giải thích hay định dạng khác.`;
    const userPrompt = JSON.stringify({
        trip: {
            destination_city: tripData.destination_city,
            preferences: tripData.preferences,
            budget_total: tripData.budget_total
        },
        original_item: {
            title: originalItem.title,
            description: originalItem.description,
            item_type: originalItem.item_type,
            start_time: originalItem.start_time,
            end_time: originalItem.end_time,
            estimated_cost: originalItem.estimated_cost
        },
        user_requirement: userRequirement || "Tìm địa điểm thay thế tương tự hoặc tốt hơn phù hợp với lịch trình.",
        candidate_places: candidatePlaces.map(p => ({
            name: p.name,
            google_place_id: p.google_place_id,
            address: p.address,
            rating: p.rating,
            price_level: p.price_level
        }))
    });
    try {
        return await (0, keyManagerService_1.executeWithApiKeyRotation)(async (apiKey) => {
            const ai = new genai_1.GoogleGenAI({ apiKey });
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: `${systemPrompt}\n\nDữ liệu yêu cầu:\n${userPrompt}`,
                config: {
                    responseMimeType: 'application/json',
                    responseSchema: ALTERNATIVES_JSON_SCHEMA
                }
            });
            const text = response.text;
            if (!text)
                throw new Error('Empty response from Gemini');
            const parsed = JSON.parse(text);
            return parsed.alternatives || [];
        });
    }
    catch (error) {
        console.error('Gemini generateAlternatives failed:', error.message);
        // Fallback Mock alternatives
        return [
            {
                item_type: originalItem.item_type,
                title: `[Gợi ý AI 1] ${originalItem.title} thay thế`,
                description: `Phương án thay thế đề xuất 1 cho "${originalItem.title}". Phù hợp với tiêu chuẩn dịch vụ và thời gian của bạn.`,
                start_time: originalItem.start_time || '08:00',
                end_time: originalItem.end_time || '10:00',
                estimated_cost: originalItem.estimated_cost || 50000,
                reason: 'Phù hợp nhất với lịch trình hiện tại và vị trí địa lý.'
            },
            {
                item_type: originalItem.item_type,
                title: `[Gợi ý AI 2] ${originalItem.title} - Phương án 2`,
                description: `Phương án thay thế đề xuất 2. Phục vụ nhu cầu trải nghiệm đa dạng và chi phí hợp lý.`,
                start_time: originalItem.start_time || '08:00',
                end_time: originalItem.end_time || '10:00',
                estimated_cost: Math.round((originalItem.estimated_cost || 50000) * 0.9),
                reason: 'Chi phí tối ưu hơn và có nhiều đánh giá tích cực.'
            },
            {
                item_type: originalItem.item_type,
                title: `[Gợi ý AI 3] ${originalItem.title} - Phương án 3`,
                description: `Phương án thay thế đề xuất 3. Mang tính chất khám phá thư giãn, nhẹ nhàng.`,
                start_time: originalItem.start_time || '08:00',
                end_time: originalItem.end_time || '10:00',
                estimated_cost: Math.round((originalItem.estimated_cost || 50000) * 1.2),
                reason: 'Không gian đẹp mắt, dịch vụ chất lượng cao hơn.'
            }
        ];
    }
}
