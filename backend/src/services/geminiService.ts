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
  estimated_cost?: number | null;
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

function calculateEstimatedTotal(days: ItineraryDay[]): number {
  return days.reduce((sum, day) => {
    return sum + day.items.reduce((daySum, item) => {
      const cost = Number(item.estimated_cost);
      return daySum + (Number.isFinite(cost) ? cost : 0);
    }, 0);
  }, 0);
}

function appendUniqueMessage(messages: string[] | undefined, message: string): string[] {
  return Array.from(new Set([...(messages || []), message]));
}

function getTripNightCount(tripData: any, daysCount: number): number {
  const startDate = tripData?.start_date ? new Date(tripData.start_date) : null;
  const endDate = tripData?.end_date ? new Date(tripData.end_date) : null;

  if (startDate && endDate && !Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime())) {
    const diffMs = endDate.getTime() - startDate.getTime();
    return Math.max(0, Math.round(diffMs / 86400000));
  }

  return Math.max(0, daysCount - 1);
}

function hasConfirmedCost(item: ItineraryItem): boolean {
  return item.estimated_cost !== undefined && item.estimated_cost !== null && Number.isFinite(Number(item.estimated_cost));
}

function normalizeConfirmedCosts(itinerary: GeneratedItinerary): void {
  itinerary.days.forEach(day => {
    day.items.forEach(item => {
      if (!hasConfirmedCost(item)) {
        delete item.estimated_cost;
        return;
      }

      item.estimated_cost = Math.max(0, Math.round(Number(item.estimated_cost)));
    });
  });
}

function appendMissingOfficialPriceQuestions(itinerary: GeneratedItinerary): void {
  const questions = new Set(itinerary.missing_info_questions || []);

  itinerary.days.forEach(day => {
    day.items.forEach(item => {
      if (hasConfirmedCost(item)) return;

      // Only prompt for official price confirmation on major paid items (accommodation, rental, or paid attractions with google_place_id)
      if (item.item_type === 'accommodation' || item.item_type === 'rental' || (item.item_type === 'attraction' && item.google_place_id)) {
        const timeLabel = item.start_time ? ` lúc ${item.start_time}` : "";
        questions.add(`Vui lòng xác nhận giá chính thức cho "${item.title}" ở Ngày ${day.day_number}${timeLabel}. Nếu mục này miễn phí thật sự, hãy trả lời 0đ.`);
      }
    });
  });

  itinerary.missing_info_questions = Array.from(questions);
}

function normalizeAccommodationItems(itinerary: GeneratedItinerary, tripData: any, totalNights: number): void {
  if (totalNights <= 0) {
    let removedAccommodation = false;
    itinerary.days.forEach(day => {
      const originalCount = day.items.length;
      day.items = day.items.filter(item => item.item_type !== 'accommodation');
      removedAccommodation = removedAccommodation || day.items.length !== originalCount;
    });

    if (removedAccommodation) {
      itinerary.warning_notes = [
        ...(itinerary.warning_notes || []),
        'Chuyến đi trong ngày không có lưu trú qua đêm nên đã bỏ mục chỗ nghỉ.'
      ];
    }
    return;
  }

  if (hasExplicitAccommodationPreference(tripData?.special_requirements)) return;

  const accommodationEntries: Array<{ dayIndex: number; item: ItineraryItem }> = [];
  itinerary.days.forEach((day, dayIndex) => {
    day.items.forEach(item => {
      if (item.item_type === 'accommodation') {
        accommodationEntries.push({ dayIndex, item });
      }
    });
  });

  if (accommodationEntries.length === 0) return;

  const firstAccommodation = { ...accommodationEntries[0].item, order_index: 0 };
  if (accommodationEntries.length > 1) {
    const allCostsConfirmed = accommodationEntries.every(entry => hasConfirmedCost(entry.item));
    if (allCostsConfirmed) {
      firstAccommodation.estimated_cost = accommodationEntries.reduce((sum, entry) => {
        return sum + Number(entry.item.estimated_cost || 0);
      }, 0);
    } else {
      delete firstAccommodation.estimated_cost;
    }
  }

  if (accommodationEntries.length > 1 || accommodationEntries[0].dayIndex !== 0) {
    itinerary.days.forEach(day => {
      day.items = day.items.filter(item => item.item_type !== 'accommodation');
    });
    itinerary.days[0]?.items.unshift(firstAccommodation);
  }
}


function enforceBudgetLimit(itinerary: GeneratedItinerary, budgetTotal: number, tripData?: any): GeneratedItinerary {
  const normalizedBudget = Number.isFinite(budgetTotal) && budgetTotal > 0 ? budgetTotal : 0;
  const totalNights = getTripNightCount(tripData, itinerary.days.length);

  normalizeAccommodationItems(itinerary, tripData, totalNights);
  normalizeConfirmedCosts(itinerary);
  appendMissingOfficialPriceQuestions(itinerary);


  const missingOfficialPriceCount = itinerary.days.reduce((sum, day) => {
    return sum + day.items.filter(item => {
      if (hasConfirmedCost(item)) return false;
      return item.item_type === 'accommodation' || item.item_type === 'rental' || (item.item_type === 'attraction' && item.google_place_id);
    }).length;
  }, 0);

  if (missingOfficialPriceCount > 0) {
    itinerary.warning_notes = appendUniqueMessage(
      itinerary.warning_notes,
      'Một số hạng mục chưa có giá chính thức nên tổng chi phí hiện tại chỉ tính phần đã xác nhận. Cần trả lời các câu hỏi giá còn thiếu trước khi chốt ngân sách.'
    );
  }
  const estimatedTotal = calculateEstimatedTotal(itinerary.days);
  if (normalizedBudget > 0 && estimatedTotal > normalizedBudget) {
    itinerary.warning_notes = [
      ...(itinerary.warning_notes || []),
      'Tổng các giá chính thức đã xác nhận đang vượt ngân sách. Cần chọn phương án rẻ hơn hoặc điều chỉnh ngân sách, hệ thống không tự bóp méo giá chính thức.'
    ];
    itinerary.missing_info_questions = [
      ...(itinerary.missing_info_questions || []),
      'Một số giá chính thức đã xác nhận vượt ngân sách tổng. Bạn muốn giảm hạng mục nào hoặc tăng ngân sách bao nhiêu?'
    ];
  }

  itinerary.budget_summary = {
    estimated_total: estimatedTotal,
    remaining: normalizedBudget > 0 ? Math.max(0, normalizedBudget - estimatedTotal) : 0
  };

  return itinerary;
}

function hasExplicitAccommodationPreference(specialRequirements: any): boolean {
  const text = String(specialRequirements || '').toLowerCase();
  return /(đổi|doi|thay đổi|thay doi|nhiều nơi|nhieu noi|nhiều chỗ|nhieu cho|khách sạn thứ|khach san thu|ngày 2|ngay 2|ngày 3|ngay 3)/i.test(text);
}

export async function generateItinerary(
  tripData: any,
  weatherForecast: WeatherForecast[],
  candidatePlaces: Record<string, PlaceCandidate[]>
): Promise<GeneratedItinerary> {
  const systemPrompt = `Bạn là một chuyên gia lập kế hoạch du lịch (Travel Expert) chuyên nghiệp tại Việt Nam.
Nhiệm vụ của bạn là xây dựng lịch trình du lịch tối ưu, an toàn và cá nhân hóa sâu sắc dựa trên thông tin yêu cầu của khách hàng.

QUY TẮC CỐT LÕI:
1. Bạn CHỈ được chọn địa điểm trong danh sách "candidate_places" được cung cấp — tuyệt đối không tự tạo thêm địa điểm nào ngoài danh sách này (ngoại trừ loại di chuyển "transport" hoặc trải nghiệm "experience" tự do).
2. ƯU TIÊN ĐỐI TÁC XÁC MINH (VERIFIED PARTNERS): Trong danh sách "candidate_places", các địa điểm có "google_place_id" bắt đầu bằng tiền tố "partner_" là đối tác đã được xác minh. Hãy ưu tiên lựa chọn và đưa các đối tác này vào lịch trình nếu họ phù hợp với sở thích, vị trí địa lý và ngân sách của khách. Tuy nhiên, tuyệt đối KHÔNG cưỡng ép chọn đối tác nếu không phù hợp — chất lượng lịch trình du lịch luôn là ưu tiên hàng đầu. Khi chọn một đối tác, hãy giữ nguyên thuộc tính google_place_id có tiền tố "partner_" trong kết quả JSON trả về.
3. Hãy phân tích kỹ sở thích, ngân sách, và đặc biệt là tình trạng sức khỏe, giới hạn thể lực của khách để chọn hoạt động phù hợp nhất.
4. ĐẢM BẢO TÍNH ĐA DẠNG & GỢI Ý CÁC ĐỊA ĐIỂM ĐỘC ĐÁO (HIDDEN GEMS):
   - Tuyệt đối không thiết kế các lịch trình lặp đi lặp lại hoặc chỉ chứa toàn các địa điểm du lịch quá phổ thông (hot spots) mà ai cũng biết. Lịch trình phải có sự kết hợp hài hòa giữa các địa điểm nổi tiếng và các địa điểm độc lạ, ít người biết, đậm chất bản địa (Hidden Gems) phù hợp với mong muốn khám phá của người dùng.
   - Cá nhân hóa sâu sắc theo sở thích của người dùng: Ví dụ, nếu họ chọn 'Khám phá mạo hiểm', hãy ưu tiên trekking, cắm trại, các hoạt động ngoài trời mới lạ; nếu họ chọn 'Ẩm thực & Đặc sản', hãy gợi ý các quán ăn địa phương gia truyền độc đáo; nếu họ chọn 'Nghỉ dưỡng & Chill', hãy ưu tiên các quán cà phê ngắm cảnh yên bình, bãi biển vắng người, spa.
   - Đối với các hoạt động trải nghiệm bản địa đặc sắc, các Hidden Gems hoặc hoạt động giải trí theo sở thích đặc biệt của khách mà không có sẵn trong danh sách candidate_places, bạn có thể tự thiết kế bằng cách dùng item_type: 'experience' và không điền google_place_id (hoặc để google_place_id = null) để lịch trình sinh động, đa dạng và đáp ứng đúng yêu cầu của khách hàng.
5. PHÂN BỔ NGÂN SÁCH THÔNG MINH & TỰ ĐỘNG ƯỚC LƯỢNG CHI PHÍ THỰC TẾ (RÀNG BUỘC BẮT BUỘC CỰC KỲ NGHIÊM NGẶT):
    - Địa chỉ của tất cả địa điểm được chọn phải phù hợp với điều kiện kinh tế và khớp với phân bổ tổng chi phí cho tất cả các ngày.
    - Bạn BẮT BUỘC phải điền giá cả ước lượng thực tế ("estimated_cost") cho toàn bộ hoạt động (ăn uống, đi lại, tham quan, lưu trú). Tuyệt đối không bỏ trống hay trả về null/undefined cho các hoạt động ăn uống, đi lại cơ bản.
    - DỰ ĐOÁN CAO ĐIỂM / LỄ TẾT: Bạn phải kiểm tra "start_date" và "end_date". Hãy suy nghĩ chu toàn và dự đoán trước xem lịch trình này có trùng vào ngày lễ Tết lớn ở Việt Nam (như Tết Nguyên Đán, Giỗ tổ Hùng Vương, 30/4-1/5, Quốc khánh 2/9, Noel, Tết Dương lịch) hoặc cao điểm du lịch hè (tháng 6 đến tháng 8), hoặc dịp cuối tuần (Thứ 6, Thứ 7, Chủ Nhật) hay không. Nếu có, bắt buộc phải tăng mức giá phòng nghỉ và tiền xe cộ lên từ 20% đến 50% so với ngày thường để phản ánh thực tế tăng giá mùa lễ, đồng thời ghi rõ lý do và tổng chi phí bị ảnh hưởng bởi dịp lễ trong phần "expert_advice".
    - Tổng chi phí ước lượng của toàn bộ lịch trình ("estimated_total") phải cân đối thông minh để khớp từ 80% đến 100% của ngân sách tổng ("budget_total"). Tuyệt đối không để tổng chi phí vượt quá ngân sách tổng.
   - QUY TẮC LƯU TRÚ LINH HOẠT (ACCOMMODATION):
     * MẶC ĐỊNH: Chỉ đặt DUY NHẤT 1 khách sạn/nơi lưu trú cho cả chuyến đi tại cùng 1 thành phố. Xếp mục chỗ nghỉ này duy nhất vào Ngày 1 (mốc giờ 14:00 - 15:00). KHÔNG ĐƯỢC thêm chỗ nghỉ mới hay check-in mới ở các ngày tiếp theo (Ngày 2, Ngày 3, Ngày 4...).
     * CHI PHÍ CHỖ NGHỈ: Bạn phải tự tính toán và điền chi phí phòng cho cả chuyến đi vào "estimated_cost" của ngày đầu tiên: estimated_cost = (giá 1 đêm ước tính hợp lý của khách sạn) * (số ngày - 1). Mức giá 1 đêm phải khớp với phân khúc khách sạn/homestay được chọn dựa trên price_level (ví dụ: price_level 1: 200k-400k/đêm, level 2: 500k-900k/đêm, level 3: 1M-2M/đêm...).
     * NGOẠI LỆ: Chỉ khi khách hàng có yêu cầu đặc biệt muốn thay đổi khách sạn (ghi ở "special_requirements" hoặc qua câu trả lời làm rõ), bạn mới được chia lịch trình thành nhiều chỗ nghỉ khác nhau.
     * GIỚI HẠN CHI PHÍ: Tổng tiền lưu trú cho cả chuyến đi tuyệt đối không vượt quá 30% tổng ngân sách ("budget_total") đối với ngân sách eo hẹp (dưới 1.500.000đ/ngày/người). Hãy chọn homestay, nhà nghỉ bình dân hoặc hostel giá rẻ trong danh sách "candidate_places" phù hợp.
     * HỎI Ý KIẾN KHÁCH HÀNG: Nếu chuyến đi dài từ 3 ngày trở lên và khách chưa nêu rõ yêu cầu lưu trú, bạn bắt buộc phải đặt câu hỏi làm rõ trong "missing_info_questions": "Bạn muốn ở 1 chỗ nghỉ cố định hay muốn thay đổi nhiều nơi trong chuyến đi này?"
   - ĐẢM BẢO CHI PHÍ ĂN UỐNG (DINING): Mỗi ngày bắt buộc phải có ít nhất 2 bữa ăn chính (trưa và tối) sử dụng các quán ăn thực tế trong danh sách. Chi phí ăn uống mỗi ngày phải được ước lượng cụ thể cho cả nhóm (ví dụ: bún/phở/bánh mì local giá từ 30k-60k/người; nhà hàng/quán ăn đặc sản giá từ 100k-250k/người) và cân đối kỹ lưỡng sao cho phù hợp với phần ngân sách còn lại sau khi đã trừ tiền phòng.
   - QUY TẮC PHÍ DỊCH VỤ & DI CHUYỂN:
     * "estimated_cost" luôn là VND cho toàn bộ nhóm khách (traveler_count), không phải giá mỗi người.
      * Bạn PHẢI tự động ước lượng chi phí (VND) thực tế cho các mục ăn uống (ví dụ: 50.000đ-150.000đ/người/bữa), lưu trú, di chuyển và ghi vào "estimated_cost" của cả nhóm.
      * Đối với các hoạt động miễn phí (như đi dạo công viên, bãi biển, chùa Linh Ứng, hoạt động tự do) hoặc các dịch vụ đã bao gồm trong chi phí khác (như ăn sáng tại khách sạn đã tính vào tiền phòng, thủ tục check-out), bạn PHẢI điền "estimated_cost" = 0 để hệ thống hiển thị là "Miễn phí".
      * TUYỆT ĐỐI KHÔNG để trống "estimated_cost" hoặc trả về null/undefined cho các hoạt động ăn uống, đi lại cơ bản hoặc hoạt động miễn phí, vì hệ thống sẽ hiển thị là "Cần xác nhận giá" và tạo ra câu hỏi bắt người dùng phải xác nhận giá cực kỳ phiền toái. Chỉ để trống/để null khi thật sự cần người dùng xác nhận một dịch vụ trả phí lớn chưa rõ giá.
   - KHÔNG DÙNG PLACEHOLDER CHUNG CHUNG: Tất cả khách sạn, quán ăn, điểm tham quan đều phải chọn địa điểm cụ thể trong danh sách "candidate_places". Tuyệt đối không ghi chung chung "Ăn tối tự do", "Khách sạn tự chọn".
   - CẢNH BÁO: Nếu ngân sách tổng quá thấp (dưới 400.000đ/ngày/người) hoặc yêu cầu của khách mâu thuẫn (muốn ở resort sang trọng nhưng ngân sách thấp), hãy cảnh báo nguy cơ thiếu hụt ngân sách tại "warning_notes" và đưa ra câu hỏi làm rõ đề xuất nâng ngân sách tại "missing_info_questions".
6. Trong kết quả JSON, hãy cung cấp:
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
          responseSchema: ITINERARY_JSON_SCHEMA as any,
          tools: [{ googleSearchRetrieval: {} }]
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

      return enforceBudgetLimit(parsed, Number(tripData.budget_total), tripData);
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
2. ƯU TIÊN ĐỐI TÁC XÁC MINH (VERIFIED PARTNERS): Trong danh sách "candidate_places", các địa điểm có "google_place_id" bắt đầu bằng tiền tố "partner_" là đối tác đã được xác minh. Hãy ưu tiên lựa chọn và đưa các đối tác này vào lịch trình nếu họ phù hợp với sở thích, vị trí địa lý và ngân sách của khách. Tuy nhiên, tuyệt đối KHÔNG cưỡng ép chọn đối tác nếu không phù hợp — chất lượng lịch trình du lịch luôn là ưu tiên hàng đầu. Khi chọn một đối tác, hãy giữ nguyên thuộc tính google_place_id có tiền tố "partner_" trong kết quả JSON trả về.
3. Tuyệt đối không đưa ra các gợi ý bâng quơ hoặc chung chung (như "Ăn uống tự do", "Đi chơi chỗ khác" mà không có tên địa điểm). Bạn phải chọn các địa điểm cụ thể và thực tế từ danh sách "candidate_places" được cung cấp để thay thế hoàn chỉnh.
4. PHÂN BỔ NGÂN SÁCH THÔNG MINH & TỰ ĐỘNG ƯỚC LƯỢNG CHI PHÍ THỰC TẾ (RÀNG BUỘC BẮT BUỘC CỰC KỲ NGHIÊM NGẶT):
    - Địa chỉ của tất cả địa điểm mới phải phù hợp với điều kiện kinh tế và khớp với phân bổ tổng chi phí cho tất cả các ngày.
    - Bạn BẮT BUỘC phải điền giá cả ước lượng thực tế ("estimated_cost") cho toàn bộ hoạt động mới thay thế. Tuyệt đối không bỏ trống hay trả về null/undefined cho các hoạt động ăn uống, đi lại cơ bản.
    - DỰ ĐOÁN CAO ĐIỂM / LỄ TẾT: Bạn phải kiểm tra "start_date" và "end_date". Hãy suy nghĩ chu toàn và dự đoán trước xem lịch trình này có trùng vào các ngày lễ Tết ở Việt Nam (như Tết Nguyên Đán, Giỗ tổ Hùng Vương, 30/4-1/5, Quốc khánh 2/9, Noel, Tết Dương lịch) hoặc cao điểm hè (tháng 6-8), hoặc dịp cuối tuần hay không. Nếu có, bắt buộc phải tăng mức giá phòng nghỉ và tiền xe cộ lên từ 20% đến 50% so với ngày thường để phản ánh thực tế tăng giá mùa lễ, đồng thời ghi rõ lý do và tổng chi phí bị ảnh hưởng bởi dịp lễ trong phần "expert_advice".
    - Tổng chi phí ước lượng của toàn bộ lịch trình mới sau khi điều chỉnh ("estimated_total") phải cân đối thông minh để nằm trong giới hạn ngân sách ban đầu của khách hàng ("budget_total"). Tuyệt đối không để tổng chi phí vượt quá ngân sách tổng.
   - QUY TẮC LƯU TRÚ LINH HOẠT (ACCOMMODATION):
     * MẶC ĐỊNH: Chỉ đặt DUY NHẤT 1 khách sạn/nơi lưu trú cho cả chuyến đi tại cùng 1 thành phố và đặt ở Ngày 1. KHÔNG ĐƯỢC thêm chỗ nghỉ mới ở các ngày tiếp theo.
     * CHI PHÍ CHỖ NGHỈ: Bạn phải tự ước lượng và điền chi phí phòng cho cả chuyến đi vào "estimated_cost" của ngày đầu tiên: estimated_cost = (giá 1 đêm ước tính hợp lý của khách sạn) * (số ngày - 1). Mức giá phòng nghỉ phải khớp với phân khúc homestay/khách sạn được chọn dựa trên price_level (ví dụ: price_level 1: 200k-400k/đêm, level 2: 500k-900k/đêm...).
     * NGOẠI LỆ: Chỉ chia thành nhiều khách sạn khi khách hàng có yêu cầu thay đổi rõ ràng trong "special_requirements" hoặc câu trả lời làm rõ.
     * GIỚI HẠN CHI PHÍ: Tổng tiền lưu trú cho cả chuyến đi tuyệt đối không vượt quá 30% tổng ngân sách ("budget_total") đối với ngân sách eo hẹp. Hãy ưu tiên chọn homestay, hostel hoặc nhà nghỉ bình dân giá rẻ trong danh sách "candidate_places".
     * HỎI Ý KIẾN KHÁCH HÀNG: Nếu chuyến đi dài từ 3 ngày trở lên và chưa rõ sở thích lưu trú của khách, hãy đặt câu hỏi làm rõ trong "missing_info_questions" xem họ muốn ở cố định 1 chỗ hay muốn thay đổi nhiều chỗ ở.
      * Di chuyển nội thành: đi bộ/không phát sinh phương tiện trả phí bạn PHẢI ghi estimated_cost = 0; nếu dùng Grab/taxi/xe ôm bạn PHẢI tự ước lượng một mức chi phí thực tế cho cả nhóm (ví dụ: 50.000đ - 150.000đ).
      * Thuê xe máy: nếu có, hãy điền ước lượng thực tế (ví dụ: 120.000đ/ngày/xe) thay vì để trống.
      * Đối với bất kỳ hoạt động nào miễn phí (như bãi biển, chùa, dạo bộ, check-out) hoặc đã bao gồm trong dịch vụ khác (như ăn sáng tại khách sạn), bạn PHẢI điền "estimated_cost" = 0.
      * TUYỆT ĐỐI KHÔNG để trống hoặc bỏ qua "estimated_cost" đối với các hoạt động cơ bản hoặc miễn phí để tránh hệ thống hiển thị là "Cần xác nhận giá" và sinh câu hỏi xác nhận giá phiền phức. Chỉ để trống/để null khi thật sự cần người dùng xác nhận một dịch vụ trả phí lớn chưa rõ giá.
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
          responseSchema: ITINERARY_JSON_SCHEMA as any,
          tools: [{ googleSearchRetrieval: {} }]
        }
      });

      const text = response.text;
      if (!text) throw new Error('Gemini response is empty');

      const parsed = JSON.parse(text) as GeneratedItinerary;
      const budgetTotal = Number(tripData.budget_total) || currentItinerary.budget_summary.estimated_total + currentItinerary.budget_summary.remaining;
      const normalizedItinerary = enforceBudgetLimit(parsed, budgetTotal, tripData);
      const diff = generateItineraryDiff(currentItinerary, normalizedItinerary, disruptionType);

      return { itinerary: normalizedItinerary, diff };
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

  const budget_total = Number(tripData.budget_total) || 5000000;
  const daysCount = weatherForecast.length || 1;
  const totalNights = Math.max(0, daysCount - 1);
  const selectedAccommodation = accommodations.reduce<PlaceCandidate | undefined>((cheapest, place) => {
    if (!cheapest) return place;
    return place.price_level < cheapest.price_level ? place : cheapest;
  }, accommodations[0]);
  const shouldAskAccommodationPreference = daysCount >= 3 && !hasExplicitAccommodationPreference(tripData.special_requirements);

  const days: ItineraryDay[] = weatherForecast.map((weather, index) => {
    const dayNumber = index + 1;
    const items: ItineraryItem[] = [];

    // Accommodation is booked once on Day 1 for the whole trip by default.
    if (selectedAccommodation && index === 0 && totalNights > 0) {
      const hotel = selectedAccommodation;
      const hotelCostPerNight = hotel.price_level === 0 ? 150000 : (hotel.price_level === 1 ? 300000 : (hotel.price_level === 2 ? 600000 : (hotel.price_level === 3 ? 1200000 : 2500000)));
      items.push({
        item_type: 'accommodation',
        title: `Nhận phòng lưu trú tại ${hotel.name}`,
        description: `Chỗ nghỉ được đặt cố định cho toàn bộ chuyến đi (${totalNights} đêm). Đánh giá: ${hotel.rating}⭐. Địa chỉ: ${hotel.address}`,
        start_time: '14:00',
        end_time: '15:00',
        google_place_id: hotel.google_place_id,
        estimated_cost: hotelCostPerNight * totalNights,
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
      estimated_cost: 50000 * Math.max(1, Number(tripData.traveler_count || 1)),
      order_index: 1
    });

    // Attraction 1 (Morning)
    if (attractions.length > 0) {
      const site = attractions[(index * 2) % attractions.length];
      const costPerPerson = site.price_level === 0 ? 0 : (site.price_level === 1 ? 30000 : (site.price_level === 2 ? 100000 : 250000));
      items.push({
        item_type: 'attraction',
        title: `Tham quan ${site.name}`,
        description: `Khám phá vẻ đẹp lịch sử và văn hóa địa phương. Địa chỉ: ${site.address}`,
        start_time: '09:00',
        end_time: '11:30',
        google_place_id: site.google_place_id,
        estimated_cost: costPerPerson * Math.max(1, Number(tripData.traveler_count || 1)),
        order_index: 2
      });
    }

    // Dining (Lunch)
    if (dining.length > 0) {
      const rest = dining[(index * 2) % dining.length];
      const costPerPerson = rest.price_level === 0 ? 40000 : (rest.price_level === 1 ? 70000 : (rest.price_level === 2 ? 150000 : 350000));
      items.push({
        item_type: 'dining',
        title: `Ăn trưa tại ${rest.name}`,
        description: `Thưởng thức các món đặc sản địa phương ngon và nổi tiếng. Đánh giá: ${rest.rating}⭐. Địa chỉ: ${rest.address}`,
        start_time: '12:00',
        end_time: '13:00',
        google_place_id: rest.google_place_id,
        estimated_cost: costPerPerson * Math.max(1, Number(tripData.traveler_count || 1)),
        order_index: 3
      });
    }

    // Attraction 2 (Afternoon)
    if (attractions.length > 0) {
      const site = attractions[(index * 2 + 1) % attractions.length];
      const costPerPerson = site.price_level === 0 ? 0 : (site.price_level === 1 ? 30000 : (site.price_level === 2 ? 100000 : 250000));
      items.push({
        item_type: 'attraction',
        title: `Trải nghiệm tại ${site.name}`,
        description: `Tận hưởng không gian và tìm hiểu về các câu chuyện thú vị.`,
        start_time: '15:00',
        end_time: '17:30',
        google_place_id: site.google_place_id,
        estimated_cost: costPerPerson * Math.max(1, Number(tripData.traveler_count || 1)),
        order_index: 4
      });
    }

    // Dining (Dinner)
    if (dining.length > 0) {
      const rest = dining[(index * 2 + 1) % dining.length];
      const costPerPerson = rest.price_level === 0 ? 50000 : (rest.price_level === 1 ? 90000 : (rest.price_level === 2 ? 200000 : 450000));
      items.push({
        item_type: 'dining',
        title: `Ăn tối tại ${rest.name}`,
        description: `Thưởng thức ẩm thực tối đặc sắc của địa phương. Đánh giá: ${rest.rating}⭐. Địa chỉ: ${rest.address}`,
        start_time: '18:30',
        end_time: '20:00',
        google_place_id: rest.google_place_id,
        estimated_cost: costPerPerson * Math.max(1, Number(tripData.traveler_count || 1)),
        order_index: 5
      });
    }

    // Experience (Evening)
    items.push({
      item_type: 'experience',
      title: 'Dạo chơi phố cổ / Chợ đêm',
      description: 'Dạo bộ tự do để cảm nhận không khí về đêm của thành phố; mua sắm hoặc ăn vặt nếu có sẽ phát sinh chi phí riêng cần xác nhận.',
      start_time: '20:30',
      end_time: '22:00',
      estimated_cost: 0,
      order_index: 6
    });

    return {
      day_number: dayNumber,
      date: weather.date,
      weather_note: `${weather.condition}, nhiệt độ từ ${weather.temp_min}°C - ${weather.temp_max}°C. Khả năng mưa: ${weather.rain_chance}%.`,
      items
    };
  });

  const estimated_total = calculateEstimatedTotal(days);

  const itinerary: GeneratedItinerary = {
    days,
    budget_summary: {
      estimated_total,
      remaining: Math.max(0, budget_total - estimated_total)
    },
    expert_advice: "Lịch trình đề xuất được tạo tự động dựa trên sở thích và thông tin chuyến đi của bạn.",
    warning_notes: ["Hãy luôn theo dõi dự báo thời tiết trước khi di chuyển ngoài trời."],
    missing_info_questions: shouldAskAccommodationPreference
      ? [`Bạn muốn ở 1 chỗ nghỉ cố định hay muốn thay đổi nhiều nơi trong ${daysCount} ngày này?`]
      : []
  };

  return enforceBudgetLimit(itinerary, budget_total, tripData);
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
        delete item.estimated_cost;
        diffMessages.push(`Ngày ${day.day_number}: Thay đổi điểm ngoài trời "${oldTitle}" thành điểm tham quan trong nhà.`);
      }

      // Disruption 2: Budget Shortage
      if (disruptionType === 'budget_shortage' && (item.item_type === 'attraction' || item.item_type === 'dining')) {
        if (hasConfirmedCost(item) && Number(item.estimated_cost) > 100000) {
          const oldCost = item.estimated_cost;
          delete item.estimated_cost;
          item.title = `[Tiết kiệm] ${item.title}`;
          item.description = `${item.description} (Đã chuyển sang phương án tiết kiệm chi phí do hạn chế ngân sách mới: ${disruptionDescription})`;
          diffMessages.push(`Ngày ${day.day_number}: Chuyển "${item.title.replace('[Tiết kiệm] ', '')}" từ mức ${oldCost?.toLocaleString('vi-VN')}đ sang phương án tiết kiệm cần xác nhận giá chính thức.`);
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

  const budget_total = currentItinerary.budget_summary.estimated_total + currentItinerary.budget_summary.remaining;

  const diff = diffMessages.length > 0 
    ? diffMessages.join('\n') 
    : `Lịch trình được tối ưu hóa lại để phù hợp với sự cố: ${disruptionDescription}.`;

  newItinerary.expert_advice = "Lịch trình đã được điều chỉnh tự động để ứng phó với sự cố phát sinh.";
  newItinerary.warning_notes = ["Chú ý an toàn trong quá trình di chuyển thời tiết xấu."];
  newItinerary.missing_info_questions = [];

  return { itinerary: enforceBudgetLimit(newItinerary, budget_total), diff };
}

// Generate text diff comparing before and after

function formatCostForText(cost?: number | null): string {
  if (cost === undefined || cost === null || !Number.isFinite(Number(cost))) {
    return 'Cần xác nhận giá';
  }
  const normalizedCost = Number(cost);
  return normalizedCost === 0 ? 'Miễn phí' : `${normalizedCost.toLocaleString('vi-VN')}đ`;
}
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
        diffs.push(`Ngày ${day.day_number}: Thay đổi "${oldItem.title}" (${formatCostForText(oldItem.estimated_cost)}) thành "${item.title}" (${formatCostForText(item.estimated_cost)})`);
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
  estimated_cost?: number | null;
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

function normalizeAlternativeCosts(alternatives: AlternativeItem[]): AlternativeItem[] {
  return alternatives.map(alternative => {
    const normalized = { ...alternative };
    const cost = Number(normalized.estimated_cost);

    if (!Number.isFinite(cost)) {
      delete normalized.estimated_cost;
    } else {
      normalized.estimated_cost = Math.max(0, Math.round(cost));
    }

    return normalized;
  });
}

export async function generateAlternatives(
  tripData: any,
  originalItem: any,
  userRequirement: string,
  candidatePlaces: PlaceCandidate[]
): Promise<AlternativeItem[]> {
  const systemPrompt = `Bạn là trợ lý AI lập lịch trình du lịch Việt Nam.
Hãy đề xuất đúng 3 hoạt động thay thế (alternatives) cho hoạt động gốc được cung cấp, dựa trên yêu cầu đặc thù của người dùng.
Bạn phải tận dụng danh sách candidate_places được cung cấp ở dưới để lấy tên và google_place_id cho các hoạt động ăn uống/chỗ nghỉ/tham quan/thuê xe (nếu phù hợp).
ƯU TIÊN ĐỐI TÁC XÁC MINH: Ưu tiên chọn các địa điểm trong candidate_places có google_place_id bắt đầu bằng "partner_" (đối tác đã xác minh) nếu phù hợp với yêu cầu của người dùng. Khi chọn, hãy giữ nguyên google_place_id của đối tác đó.
Giờ bắt đầu và kết thúc của hoạt động thay thế nên khớp hoặc gần khớp với hoạt động gốc (${originalItem.start_time || '08:00'} - ${originalItem.end_time || '10:00'}), nhưng có thể thay đổi nhẹ nếu cần.
Hãy ước lượng chi phí (VND) hợp lý và thực tế cho "estimated_cost" dựa trên price_level và giá trị trung bình ở Việt Nam cho hoạt động đó (ví dụ: ăn uống, vé tham quan, di chuyển...).
Nếu hoạt động đó là miễn phí (như đi dạo công viên, chùa Linh Ứng, hoạt động tự do), hãy điền "estimated_cost" = 0 để hệ thống hiển thị là "Miễn phí".
Tránh để trống "estimated_cost" trừ phi đó là dịch vụ trả phí lớn mà bạn không thể tự ước lượng được và bắt buộc cần người dùng nhập.
0đ/Miễn phí chỉ dùng cho hoạt động thật sự miễn phí như đi bộ hoặc điểm công cộng miễn phí.
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
          responseSchema: ALTERNATIVES_JSON_SCHEMA as any,
          tools: [{ googleSearchRetrieval: {} }]
        }
      });

      const text = response.text;
      if (!text) throw new Error('Empty response from Gemini');
      const parsed = JSON.parse(text);
      return normalizeAlternativeCosts(parsed.alternatives || []);
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
        reason: 'Phù hợp với lịch trình hiện tại; cần xác nhận giá chính thức trước khi chốt ngân sách.'
      },
      {
        item_type: originalItem.item_type,
        title: `[Gợi ý AI 2] ${originalItem.title} - Phương án 2`,
        description: `Phương án thay thế đề xuất 2. Phục vụ nhu cầu trải nghiệm đa dạng và chi phí hợp lý.`,
        start_time: originalItem.start_time || '08:00',
        end_time: originalItem.end_time || '10:00',
        reason: 'Có tiềm năng tối ưu chi phí, nhưng vẫn cần xác nhận giá chính thức của địa điểm.'
      },
      {
        item_type: originalItem.item_type,
        title: `[Gợi ý AI 3] ${originalItem.title} - Phương án 3`,
        description: `Phương án thay thế đề xuất 3. Mang tính chất khám phá thư giãn, nhẹ nhàng.`,
        start_time: originalItem.start_time || '08:00',
        end_time: originalItem.end_time || '10:00',
        reason: 'Không gian phù hợp hơn; giá cần được xác nhận chính thức trước khi áp dụng.'
      }
    ];
  }
}

