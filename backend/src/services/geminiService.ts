import { GoogleGenAI } from '@google/genai';
import { WeatherForecast } from './weatherService';
import { PlaceCandidate } from './placesService';
import { executeWithApiKeyRotation } from './keyManagerService';

export interface ItineraryItem {
  item_type: 'accommodation' | 'transport' | 'dining' | 'attraction' | 'rental' | 'experience';
  title: string;
  description: string;
  start_time?: string;
  end_time?: string;
  google_place_id?: string;
  estimated_cost?: number;
  order_index: number;
}

export interface ItineraryDay {
  day_number: number;
  date: string;
  weather_note: string;
  items: ItineraryItem[];
}

export interface GeneratedItinerary {
  days: ItineraryDay[];
  budget_summary: {
    estimated_total: number;
    remaining: number;
  };
  expert_advice?: string;
  warning_notes?: string[];
  missing_info_questions?: string[];
}

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
    },
    expert_advice: { type: 'string' },
    warning_notes: {
      type: 'array',
      items: { type: 'string' }
    },
    missing_info_questions: {
      type: 'array',
      items: { type: 'string' }
    }
  },
  required: ['days', 'budget_summary']
};

export async function generateItinerary(
  tripData: any,
  weatherForecast: WeatherForecast[],
  candidatePlaces: Record<string, PlaceCandidate[]>
): Promise<GeneratedItinerary> {
  const systemPrompt = `Bạn là một chuyên gia lập kế hoạch du lịch (Travel Expert) chuyên nghiệp tại Việt Nam.
Nhiệm vụ của bạn là xây dựng lịch trình du lịch tối ưu, an toàn và cá nhân hóa sâu sắc dựa trên thông tin yêu cầu của khách hàng.

QUY TẮC CỐT LÕI:
1. Bạn CHỈ được chọn địa điểm trong danh sách "candidate_places" được cung cấp — tuyệt đối không tự tạo thêm địa điểm nào ngoài danh sách này (ngoại trừ loại di chuyển "transport" hoặc trải nghiệm "experience" tự do).
2. Hãy phân tích kỹ sở thích, ngân sách, và đặc biệt là tình trạng sức khỏe, giới hạn thể lực của khách để chọn hoạt động phù hợp nhất.
3. PHÂN BỔ NGÂN SÁCH THÔNG MINH & TIẾT KIỆM (RÀNG BUỘC BẮT BUỘC):
   - Bạn phải phân bổ ngân sách cực kỳ khoa học, tuyệt đối không tập trung quá nhiều tiền vào một hạng mục để bóp nghẹt các hạng mục còn lại.
   - GIỚI HẠN TIỀN PHÒNG (ACCOMMODATION): Tổng chi phí lưu trú ( accommodation ) cho toàn bộ chuyến đi KHÔNG ĐƯỢC VƯỢT QUÁ 30% tổng ngân sách chuyến đi ("budget_total") nếu ngân sách eo hẹp (dưới 1.500.000đ/ngày/người). Ví dụ: với chuyến đi tổng ngân sách 2.000.000đ, toàn bộ tiền chỗ nghỉ cho cả chuyến đi tối đa chỉ được 600.000đ. Bạn phải chọn homestay, nhà nghỉ bình dân hoặc hostel có giá rẻ trong danh sách "candidate_places". Tuyệt đối không chọn khách sạn đắt tiền vượt quá 30% tổng ngân sách chuyến đi. Chỗ nghỉ chỉ được xếp vào các ngày đầu và giữa chuyến đi (tối đa bằng số đêm = số ngày - 1), tuyệt đối không check-in khách sạn vào ngày cuối cùng khi chuẩn bị đi về.
   - ĐẢM BẢO CHI PHÍ ĂN UỐNG (DINING): Mỗi ngày bắt buộc phải có ít nhất 2 bữa ăn chính (trưa và tối). Chi phí mỗi bữa ăn chính cho mỗi khách phải hợp lý (từ 50.000đ đến 150.000đ/người ở quán bình dân hoặc đặc sản local). Tổng chi phí ăn uống mỗi ngày phải đảm bảo tối thiểu 15% - 25% ngân sách ngày để khách có thể thưởng thức đặc sản ẩm thực địa phương đầy đủ.
   - KHÔNG DÙNG PLACEHOLDER CHUNG CHUNG: Tất cả các quán ăn, khách sạn, điểm tham quan đều phải chọn địa điểm thực tế và cụ thể từ danh sách "candidate_places" được cung cấp. Tuyệt đối không ghi chung chung "Ăn tối tự do", "Khách sạn tự chọn".
   - CẢNH BÁO & CÂU HỎI LÀM RÕ: Nếu ngân sách tổng quá thấp (dưới 400.000đ/ngày/người) hoặc các yêu cầu đầu vào mâu thuẫn/mơ hồ (ví dụ: muốn ở resort 5 sao nhưng ngân sách 2 triệu, hoặc không rõ tình trạng sức khỏe), hãy đưa ra cảnh báo nguy cơ thiếu hụt ngân sách tại "warning_notes" và liệt kê cụ thể các câu hỏi làm rõ tại "missing_info_questions" để hỏi lại khách hàng.
4. Trong kết quả JSON, hãy cung cấp:
   - "expert_advice": Lời khuyên/tư vấn chi tiết từ góc nhìn chuyên gia du lịch, giải thích rõ lý do tại sao lịch trình này được thiết kế như vậy để phù hợp nhất với sở thích/sức khỏe/ngân sách của khách.
   - "warning_notes": Các lưu ý an toàn quan trọng (ví dụ: cảnh báo thời tiết xấu, đường đèo hiểm trở, hoặc lưu ý bảo quản hành lý, sức khỏe).
   - "missing_info_questions": Nếu dữ liệu đầu vào của khách quá mơ hồ hoặc thiếu, hãy đưa ra các câu hỏi làm rõ cụ thể để người dùng cung cấp thêm thông tin nhằm điều chỉnh lịch trình chuẩn xác hơn. Nếu thông tin đã rất đầy đủ, để danh sách này trống.

Trả lời CHỈ bằng JSON hợp lệ tuân thủ schema được cung cấp. Không viết thêm markdown, không thêm giải thích ngoài JSON.`;

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
    return await executeWithApiKeyRotation(async (apiKey) => {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `${systemPrompt}\n\nDữ liệu yêu cầu:\n${userPrompt}`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: ITINERARY_JSON_SCHEMA as any
        }
      });

      const text = response.text;
      if (!text) {
        throw new Error('Gemini returned empty response text');
      }

      const parsed = JSON.parse(text) as GeneratedItinerary;
      
      // Validate google_place_ids to prevent hallucinations
      const validIds = new Set<string>();
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
  } catch (error: any) {
    console.error(`Gemini generation failed: ${error.message}. Falling back to programmatic generation.`);
    return generateMockItinerary(tripData, weatherForecast, candidatePlaces);
  }
}

export async function adaptItinerary(
  tripData: any,
  currentItinerary: GeneratedItinerary,
  disruptionType: string,
  disruptionDescription: string,
  weatherForecast: WeatherForecast[],
  candidatePlaces: Record<string, PlaceCandidate[]>
): Promise<{ itinerary: GeneratedItinerary; diff: string }> {
  const systemPrompt = `Bạn là một chuyên gia lập kế hoạch và xử lý sự cố du lịch (Senior Travel Planner & Disruption Specialist) chuyên nghiệp tại Việt Nam.
Nhiệm vụ của bạn là điều chỉnh lịch trình hiện tại ("current_itinerary") khi có sự cố phát sinh thành một lịch trình mới hoàn chỉnh và logic nhất.

YÊU CẦU ĐIỀU CHỈNH CHẶT CHẼ:
1. Bạn phải phân tích toàn diện các yếu tố: lịch trình cũ ("current_itinerary"), giới hạn ngân sách còn lại, điều kiện thời tiết thực tế từ "weather_forecast", và thông tin sự cố phát sinh.
2. Tuyệt đối không đưa ra các gợi ý bâng quơ hoặc chung chung (như "Ăn uống tự do", "Đi chơi chỗ khác" mà không có tên địa điểm). Bạn phải chọn các địa điểm cụ thể và thực tế từ danh sách "candidate_places" được cung cấp để thay thế hoàn chỉnh.
3. PHÂN BỔ NGÂN SÁCH THÔNG MINH & TIẾT KIỆM (RÀNG BUỘC BẮT BUỘC):
   - Bạn phải tính toán chi phí cẩn thận, đảm bảo tổng chi phí sau khi điều chỉnh không vượt quá ngân sách ban đầu của khách hàng ("budget_total").
   - GIỚI HẠN TIỀN PHÒNG (ACCOMMODATION): Tổng chi phí lưu trú (accommodation) cho toàn bộ chuyến đi KHÔNG ĐƯỢC VƯỢT QUÁ 30% tổng ngân sách chuyến đi ("budget_total") nếu ngân sách eo hẹp (dưới 1.500.000đ/ngày/người). Hãy ưu tiên chọn các homestay, hostel hoặc nhà nghỉ bình dân giá rẻ trong danh sách "candidate_places". Chỗ nghỉ chỉ xuất hiện ở ngày đầu/giữa (tối đa bằng số ngày - 1 đêm), tuyệt đối không check-in khách sạn vào ngày cuối cùng của chuyến đi.
   - ĐẢM BẢO CHI PHÍ ĂN UỐNG (DINING): Mỗi ngày phải có tối thiểu 2 bữa ăn chính (trưa và tối) ở các quán ăn thực tế trong danh sách. Không được để xảy ra tình trạng tiền phòng quá cao dẫn đến khách không có tiền ăn uống, thưởng thức các món đặc sản ẩm thực địa phương ngon miệng.
   - Nếu xảy ra sự cố hụt ngân sách ("budget_shortage"), bạn phải chủ động hạ chi phí lưu trú xuống mức tối thiểu bằng cách chọn homestay/hostel giá rẻ nhất, đổi các hoạt động tham quan có phí thành miễn phí hoặc chi phí thấp, và ăn uống tại các quán ăn bình dân local.
4. Giữ nguyên tính logic của lịch trình:
   - Các hoạt động trong ngày phải có sự liên kết về mặt di chuyển (ví dụ: các địa điểm nên nằm gần nhau trong cùng buổi để giảm thời gian đi lại).
   - Đảm bảo thời gian ăn uống (trưa, tối), nghỉ ngơi và di chuyển hợp lý.
   - CHỈ được điều chỉnh các ngày hoặc hoạt động từ thời điểm xảy ra sự cố trở đi. Giữ nguyên các hoạt động đã hoàn thành trước đó.
5. Thích ứng thông minh theo các yếu tố bên ngoài:
   - Thời tiết: Đọc kỹ "weather_forecast" cho từng ngày để điều chỉnh hoạt động. Nếu dự báo có mưa lớn vào buổi chiều, hãy chuyển các hoạt động ngoài trời lên buổi sáng (nếu trời hửng nắng) hoặc đổi sang điểm tham quan trong nhà. Tránh tuyệt đối các rủi ro nguy hiểm (như leo núi, đi đèo dốc hiểm trở hay đi thuyền khi có giông bão).
6. Cung cấp đầy đủ phân tích chuyên môn của bạn ở trường "expert_advice" để khách hiểu rõ lý do của các thay đổi và các cảnh báo an toàn ở trường "warning_notes".
7. Nếu thông tin báo sự cố của khách quá mơ hồ hoặc không đủ để lập kế hoạch an toàn (ví dụ: chỉ ghi "sự cố sức khỏe" mà không rõ là mệt mỏi hay chấn thương nghiêm trọng, hoặc ghi "mưa" mà không rõ mưa to hay nhỏ), hãy đưa ra các câu hỏi làm rõ cụ thể ở trường "missing_info_questions" để khách cung cấp thêm nhằm đưa ra phương án tối ưu nhất.

Trả lời CHỈ bằng JSON hợp lệ tuân thủ schema được cung cấp. Không viết thêm markdown, không thêm giải thích ngoài JSON.`;

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
    return await executeWithApiKeyRotation(async (apiKey) => {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `${systemPrompt}\n\nDữ liệu yêu cầu:\n${userPrompt}`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: ITINERARY_JSON_SCHEMA as any
        }
      });

      const text = response.text;
      if (!text) throw new Error('Gemini response is empty');

      const parsed = JSON.parse(text) as GeneratedItinerary;
      const diff = generateItineraryDiff(currentItinerary, parsed, disruptionType);

      return { itinerary: parsed, diff };
    });
  } catch (error: any) {
    console.error(`Gemini adaptation failed: ${error.message}. Using fallback.`);
    return adaptMockItinerary(currentItinerary, disruptionType, disruptionDescription, candidatePlaces);
  }
}

// Programmatic mock itinerary generator
function generateMockItinerary(
  tripData: any,
  weatherForecast: WeatherForecast[],
  candidatePlaces: Record<string, PlaceCandidate[]>
): GeneratedItinerary {
  const accommodations = candidatePlaces.accommodation || [];
  const dining = candidatePlaces.dining || [];
  const attractions = candidatePlaces.attraction || [];
  const rentals = candidatePlaces.rental || [];

  const budget_total = Number(tripData.budget_total) || 5000000;
  const daysCount = weatherForecast.length || 1;
  const dailyBudget = budget_total / daysCount;
  const totalNights = Math.max(0, daysCount - 1);

  // Lodging max 30% of total budget for tight budgets, min 100k
  const maxTotalLodgingCost = budget_total * 0.30;
  const maxLodgingCostPerNight = totalNights > 0 ? maxTotalLodgingCost / totalNights : 0;

  const days: ItineraryDay[] = weatherForecast.map((weather, index) => {
    const dayNumber = index + 1;
    const items: ItineraryItem[] = [];

    // Accommodation (Only for days before the last day)
    if (accommodations.length > 0 && index < daysCount - 1) {
      const hotel = accommodations[index % accommodations.length];
      const hotelCost = Math.min(hotel.price_level * 350000 + 150000, maxLodgingCostPerNight);
      items.push({
        item_type: 'accommodation',
        title: `Nhận phòng / Nghỉ ngơi tại ${hotel.name}`,
        description: `Chỗ nghỉ tiện nghi, giá cả hợp lý theo ngân sách của bạn. Đánh giá: ${hotel.rating}⭐. Địa chỉ: ${hotel.address}`,
        start_time: '14:00',
        end_time: '15:00',
        google_place_id: hotel.google_place_id,
        estimated_cost: Math.round(hotelCost),
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
      estimated_cost: Math.round(Math.min(50000, dailyBudget * 0.05)),
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
        estimated_cost: Math.round(Math.min(site.price_level * 80000, dailyBudget * 0.1)),
        order_index: 2
      });
    }

    // Dining (Lunch)
    if (dining.length > 0) {
      const rest = dining[(index * 2) % dining.length];
      // Dining max 15% of daily budget per meal to save, but min 50k
      const maxMealCost = Math.max(50000, dailyBudget * 0.15);
      const mealCost = Math.min(rest.price_level * 80000 + 40000, maxMealCost);
      items.push({
        item_type: 'dining',
        title: `Ăn trưa tại ${rest.name}`,
        description: `Thưởng thức các món đặc sản địa phương ngon và nổi tiếng. Đánh giá: ${rest.rating}⭐. Địa chỉ: ${rest.address}`,
        start_time: '12:00',
        end_time: '13:00',
        google_place_id: rest.google_place_id,
        estimated_cost: Math.round(mealCost),
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
        estimated_cost: Math.round(Math.min(site.price_level * 50000, dailyBudget * 0.08)),
        order_index: 4
      });
    }

    // Dining (Dinner)
    if (dining.length > 0) {
      const rest = dining[(index * 2 + 1) % dining.length];
      const maxMealCost = Math.max(50000, dailyBudget * 0.15);
      const mealCost = Math.min(rest.price_level * 80000 + 40000, maxMealCost);
      items.push({
        item_type: 'dining',
        title: `Ăn tối tại ${rest.name}`,
        description: `Thưởng thức ẩm thực tối đặc sắc của địa phương. Đánh giá: ${rest.rating}⭐. Địa chỉ: ${rest.address}`,
        start_time: '18:30',
        end_time: '20:00',
        google_place_id: rest.google_place_id,
        estimated_cost: Math.round(mealCost),
        order_index: 5
      });
    }

    // Experience (Evening)
    items.push({
      item_type: 'experience',
      title: 'Dạo chơi phố cổ / Chợ đêm',
      description: 'Hòa mình vào không khí nhộn nhịp về đêm của thành phố, thưởng thức ẩm thực đường phố.',
      start_time: '20:30',
      end_time: '22:00',
      estimated_cost: Math.round(Math.min(60000, dailyBudget * 0.08)),
      order_index: 6
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

  return {
    days,
    budget_summary: {
      estimated_total,
      remaining: Math.max(0, budget_total - estimated_total)
    },
    expert_advice: "Lịch trình đề xuất được tạo tự động dựa trên sở thích và thông tin chuyến đi của bạn.",
    warning_notes: ["Hãy luôn theo dõi dự báo thời tiết trước khi di chuyển ngoài trời."],
    missing_info_questions: []
  };
}

// Programmatic mock disruption adaptation
function adaptMockItinerary(
  currentItinerary: GeneratedItinerary,
  disruptionType: string,
  disruptionDescription: string,
  candidatePlaces: Record<string, PlaceCandidate[]>
): { itinerary: GeneratedItinerary; diff: string } {
  // Deep clone currentItinerary
  const newItinerary: GeneratedItinerary = JSON.parse(JSON.stringify(currentItinerary));
  let diffMessages: string[] = [];

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

  newItinerary.expert_advice = "Lịch trình đã được điều chỉnh tự động để ứng phó với sự cố phát sinh.";
  newItinerary.warning_notes = ["Chú ý an toàn trong quá trình di chuyển thời tiết xấu."];
  newItinerary.missing_info_questions = [];

  return { itinerary: newItinerary, diff };
}

// Generate text diff comparing before and after
function generateItineraryDiff(
  oldItinerary: GeneratedItinerary,
  newItinerary: GeneratedItinerary,
  disruptionType: string
): string {
  let diffs: string[] = [];
  
  newItinerary.days.forEach((day, dIdx) => {
    const oldDay = oldItinerary.days[dIdx];
    if (!oldDay) return;

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

export interface AlternativeItem {
  item_type: 'accommodation' | 'transport' | 'dining' | 'attraction' | 'rental' | 'experience';
  title: string;
  description: string;
  start_time: string;
  end_time: string;
  estimated_cost: number;
  reason: string;
  google_place_id?: string;
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

export async function generateAlternatives(
  tripData: any,
  originalItem: any,
  userRequirement: string,
  candidatePlaces: PlaceCandidate[]
): Promise<AlternativeItem[]> {
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
    return await executeWithApiKeyRotation(async (apiKey) => {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `${systemPrompt}\n\nDữ liệu yêu cầu:\n${userPrompt}`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: ALTERNATIVES_JSON_SCHEMA as any
        }
      });

      const text = response.text;
      if (!text) throw new Error('Empty response from Gemini');
      const parsed = JSON.parse(text);
      return parsed.alternatives || [];
    });
  } catch (error: any) {
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

