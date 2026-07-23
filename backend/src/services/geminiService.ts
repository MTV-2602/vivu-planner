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
   - ĐẢM BẢO CHI PHÍ ĂN UỐNG & ĐA DẠNG ẨM THỰC (DINING DIVERSITY): Mỗi ngày bắt buộc phải có ít nhất 2 bữa ăn chính (trưa và tối) sử dụng các quán ăn thực tế trong danh sách. Bạn phải đa dạng hóa món ăn, tuyệt đối không lặp lại c�7. TỐI ƯU HÓA LỘ TRÌNH THUẬN ĐƯỜNG & HỢP LÝ ĐỊA LÝ (ROUTE PROXIMITY & THUẬN ĐƯỜNG BẮT BUỘC):
   - BẮT BUỘC sắp xếp các hoạt động trong cùng 1 ngày theo thứ tự địa lý liền kề, di chuyển **thuận một tuyến đường** (từ Khách sạn → Quán ăn sáng gần đó → Điểm tham quan cùng cụm/khu vực → Quán ăn trưa gần đó → Điểm vui chơi buổi chiều cùng cụm → Quán ăn tối/Dạo phố đêm cùng khu vực).
   - **TUYỆT ĐỐI KHÔNG** nhảy cóc quãng đường (ví dụ: sáng ở phía Nam thành phố, trưa chạy ngược ra phía Bắc cách 15km, chiều lại quay ngược về phía Nam). Hãy gom các địa điểm ở cùng một quận/phường/khu vực vào cùng một buổi để tiết kiệm tối đa thời gian, chi phí xăng xe và công sức di chuyển cho du khách!

CONCISE DESCRIPTIONS FOR SPEED: Write the "description" for each activity in the itinerary extremely short, concise and brief (maximum 15-20 words). Do not write verbose or filler text. hoạt động miễn phí (như đi dạo công viên, bãi biển, chùa Linh Ứng, hoạt động tự do) hoặc các dịch vụ đã bao gồm trong chi phí khác (như ăn sáng tại khách sạn đã tính vào tiền phòng, thủ tục check-out), bạn PHẢI điền "estimated_cost" = 0 để hệ thống hiển thị là "Miễn phí".
      * TUYỆT ĐỐI KHÔNG để trống "estimated_cost" hoặc trả về null/undefined cho các hoạt động ăn uống, đi lại cơ bản hoặc hoạt động miễn phí, vì hệ thống sẽ hiển thị là "Cần xác nhận giá" và tạo ra câu hỏi bắt người dùng phải xác nhận giá cực kỳ phiền toái. Chỉ để trống/để null khi thật sự cần người dùng xác nhận một dịch vụ trả phí lớn chưa rõ giá.
   - KHÔNG DÙNG PLACEHOLDER CHUNG CHUNG: Tất cả khách sạn, quán ăn, điểm tham quan đều phải chọn địa điểm cụ thể trong danh sách "candidate_places". Tuyệt đối không ghi chung chung "Ăn tối tự do", "Khách sạn tự chọn".
   - CẢNH BÁO: Nếu ngân sách tổng quá thấp (dưới 400.000đ/ngày/người) hoặc yêu cầu của khách mâu thuẫn (muốn ở resort sang trọng nhưng ngân sách thấp), hãy cảnh báo nguy cơ thiếu hụt ngân sách tại "warning_notes" và đưa ra câu hỏi làm rõ đề xuất nâng ngân sách tại "missing_info_questions".
6. Trong kết quả JSON, hãy cung cấp:
   - "expert_advice": Lời khuyên/tư vấn chi tiết từ góc nhìn chuyên gia du lịch, giải thích rõ lý do tại sao lịch trình này được thiết kế như vậy để phù hợp nhất với sở thích/sức khỏe/ngân sách của khách.
   - "warning_notes": Các lưu ý an toàn quan trọng (ví dụ: cảnh báo thời tiết xấu, đường đèo hiểm trở, hoặc lưu ý bảo quản hành lý, sức khỏe).
   - "missing_info_questions": Nếu dữ liệu đầu vào của khách quá mơ hồ hoặc thiếu, hãy đưa ra các câu hỏi làm rõ cụ thể để người dùng cung cấp thêm thông tin nhằm điều chỉnh lịch trình chuẩn xác hơn. Nếu thông tin đã rất đầy đủ, để danh sách này trống.

CONCISE DESCRIPTIONS FOR SPEED: Write the "description" for each activity in the itinerary extremely short, concise and brief (maximum 15-20 words). Do not write verbose or filler text.

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
      * ĐA DẠNG ĂN UỐNG (DINING): Hãy đảm bảo các bữa ăn chính (trưa, tối) sử dụng các nhà hàng/quán ăn thực tế từ danh sách, và tuyệt đối không lặp lại món ăn/nhà hàng (ví dụ: không gợi ý ăn bánh khọt liên tiếp trong một ngày hoặc ăn hải sản liên tục). Hãy đa dạng hóa ẩm thực để tạo trải nghiệm hấp dẫn.
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
8. TIẾT KIỆM TỪ KHÓA & PHẢN HỒI NHANH: Viết mô tả ("description") cho mỗi hoạt động điều chỉnh mới cực kỳ súc tích và ngắn gọn (tối đa 15-20 từ), không viết lan man dài dòng.

CONCISE DESCRIPTIONS FOR SPEED: Write the "description" for each activity in the itinerary extremely short, concise and brief (maximum 15-20 words). Do not write verbose or filler text.

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

function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = arr[i];
    arr[i] = arr[j];
    arr[j] = temp;
  }
  return arr;
}

function filterByBudget(places: PlaceCandidate[], dailyBudget: number, neededCount: number = 0): PlaceCandidate[] {
  if (places.length === 0) return places;
  
  let preferredLevels: number[] = [1, 2];
  if (dailyBudget >= 1500000) {
    preferredLevels = [2, 3, 4];
  } else if (dailyBudget < 600000) {
    preferredLevels = [0, 1];
  }
  
  let filtered = places.filter(p => preferredLevels.includes(p.price_level));
  
  // If the filtered list is too short to guarantee unique options for the itinerary,
  // gradually expand the preferred levels to include neighboring price levels.
  if (neededCount > 0 && filtered.length < neededCount) {
    const expandedLevels = new Set(preferredLevels);
    for (let diff = 1; diff <= 4; diff++) {
      preferredLevels.forEach(lvl => {
        if (lvl - diff >= 0) expandedLevels.add(lvl - diff);
        if (lvl + diff <= 4) expandedLevels.add(lvl + diff);
      });
      filtered = places.filter(p => expandedLevels.has(p.price_level));
      if (filtered.length >= neededCount) break;
    }
  }
  
  return filtered.length > 0 ? filtered : places;
}

// Programmatic mock itinerary generator
function generateMockItinerary(
  tripData: any,
  weatherForecast: WeatherForecast[],
  candidatePlaces: Record<string, PlaceCandidate[]>
): GeneratedItinerary {
  const budget_total = Number(tripData.budget_total) || 5000000;
  const daysCount = weatherForecast.length || 1;
  const dailyBudget = budget_total / daysCount;
  const totalNights = Math.max(0, daysCount - 1);

  // Sort attractions based on user preferences (interests/sở thích)
  const preferences = tripData.preferences || {};
  const scoredAttractions = (candidatePlaces.attraction || []).map(place => {
    let score = 0;
    const nameLower = place.name.toLowerCase();
    
    if (preferences.history === true) {
      const historyKeywords = ['tượng', 'lăng', 'văn miếu', 'nhà tù', 'chùa', 'hoàng thành', 'nhà hát', 'cổ', 'dinh', 'thích ca', 'bạch dinh', 'cố đô', 'di tích', 'bảo tàng', 'đền'];
      if (historyKeywords.some(kw => nameLower.includes(kw))) score += 5;
    }
    if (preferences.nature === true) {
      const natureKeywords = ['hồ', 'bãi biển', 'núi', 'thác', 'thung lũng', 'đồi', 'rừng', 'mũi nghinh phong', 'hang múa', 'bán đảo', 'vịnh', 'hòn', 'đèo'];
      if (natureKeywords.some(kw => nameLower.includes(kw))) score += 5;
    }
    if (preferences.adventure === true) {
      const adventureKeywords = ['máng trượt', 'trekking', 'leo núi', 'mạo hiểm', 'safari', 'cáp treo', 'hồ mây', 'hang động', 'thác dạt'];
      if (adventureKeywords.some(kw => nameLower.includes(kw))) score += 5;
    }
    if (preferences.shopping === true || preferences.relax === true) {
      const shopRelaxKeywords = ['chợ', 'trung tâm', 'mua sắm', 'phố đi bộ', 'phố cổ', 'grand world', 'night market', 'dạo cảnh', 'công viên', 'hải đăng'];
      if (shopRelaxKeywords.some(kw => nameLower.includes(kw))) score += 5;
    }
    return { place, score };
  });

  // Sort by score descending
  scoredAttractions.sort((a, b) => b.score - a.score);
  
  // Group by score and shuffle within each group to maintain diversity
  const groups: Record<number, PlaceCandidate[]> = {};
  scoredAttractions.forEach(item => {
    if (!groups[item.score]) groups[item.score] = [];
    groups[item.score].push(item.place);
  });
  
  const sortedAttractions: PlaceCandidate[] = [];
  Object.keys(groups)
    .map(Number)
    .sort((a, b) => b - a)
    .forEach(score => {
      sortedAttractions.push(...shuffleArray(groups[score]));
    });

  // Sort dining based on special requirements (e.g. "ăn bánh ướt lòng gà", "lẩu cá đuối")
  const specialReq = (tripData.special_requirements || '').toLowerCase();
  const tripTitle = (tripData.title || '').toLowerCase();
  const searchTerms = [specialReq, tripTitle].filter(Boolean);

  const scoredDining = (candidatePlaces.dining || []).map(place => {
    let score = 0;
    const nameLower = place.name.toLowerCase();
    
    searchTerms.forEach(term => {
      if (term.includes(nameLower) || nameLower.includes(term)) {
        score += 20; // high priority match
      } else {
        const keywords = term.split(/[\s,]+/);
        keywords.forEach(kw => {
          if (kw.length > 2 && nameLower.includes(kw)) {
            score += 2;
          }
        });
      }
    });
    
    return { place, score };
  });

  // Sort by score descending
  scoredDining.sort((a, b) => b.score - a.score);

  // Group and shuffle within score groups to maintain diversity
  const diningGroups: Record<number, PlaceCandidate[]> = {};
  scoredDining.forEach(item => {
    if (!diningGroups[item.score]) diningGroups[item.score] = [];
    diningGroups[item.score].push(item.place);
  });

  const sortedDining: PlaceCandidate[] = [];
  Object.keys(diningGroups)
    .map(Number)
    .sort((a, b) => b - a)
    .forEach(score => {
      sortedDining.push(...shuffleArray(diningGroups[score]));
    });

  const accommodations = filterByBudget(shuffleArray(candidatePlaces.accommodation || []), dailyBudget, totalNights);
  const dining = filterByBudget(sortedDining, dailyBudget, daysCount * 2);
  const attractions = filterByBudget(sortedAttractions, dailyBudget, daysCount * 2);

  // Set up depletion pools for popping and avoiding duplicates across the itinerary
  const attractionsPool = [...attractions];
  let currentAttractions = [...attractionsPool];

  const getNextAttraction = (): PlaceCandidate | null => {
    if (attractionsPool.length === 0) return null;
    if (currentAttractions.length === 0) {
      currentAttractions = shuffleArray([...attractionsPool]);
    }
    return currentAttractions.shift() || null;
  };

  const diningPool = [...dining];
  let currentDining = [...diningPool];

  const getNextDining = (): PlaceCandidate | null => {
    if (diningPool.length === 0) return null;
    if (currentDining.length === 0) {
      currentDining = shuffleArray([...diningPool]);
    }
    return currentDining.shift() || null;
  };

  const destinationLower = (tripData.destination_city || '').toLowerCase();
  
  const getEveningExperience = (dayIdx: number): { title: string, description: string } => {
    if (destinationLower.includes('vũng tàu') || destinationLower.includes('vung tau')) {
      const options = [
        { title: 'Đi dạo dọc bờ biển Bãi Sau hóng gió', description: 'Tận hưởng làn gió biển mát rượi và không khí trong lành tại Bãi Sau về đêm.' },
        { title: 'Càn quét hải sản tại Chợ đêm Vũng Tàu', description: 'Thưởng thức vô vàn món hải sản tươi sống được chế biến nóng hổi tại chỗ cực kỳ hấp dẫn.' },
        { title: 'Thư giãn ngắm biển tại khu Bãi Trước', description: 'Dạo bộ công viên bờ biển Bãi Trước ngắm nhìn tàu thuyền neo đậu lung linh ánh đèn.' },
        { title: 'Thưởng thức cà phê view biển đường Trần Phú', description: 'Ghé quán cà phê lộng gió sát bờ biển đường Trần Phú để ngắm nhìn sóng vỗ về đêm.' }
      ];
      return options[dayIdx % options.length];
    }
    if (destinationLower.includes('hà nội') || destinationLower.includes('ha noi')) {
      const options = [
        { title: 'Dạo quanh Hồ Hoàn Kiếm và Phố cổ', description: 'Dạo bộ khu phố cổ rực rỡ, cảm nhận nhịp sống thủ đô bình dị và ấm áp.' },
        { title: 'Khám phá ẩm thực Chợ đêm Đồng Xuân', description: 'Thử sức với thiên đường đồ ăn vặt và mua sắm quà lưu niệm xinh xắn.' },
        { title: 'Hóng gió ngắm cầu Long Biên lịch sử', description: 'Lên cầu Long Biên hoặc ghé quán cà phê ven đê sông Hồng hóng gió mát.' },
        { title: 'Thưởng thức cà phê trứng trong ngõ cổ', description: 'Nhâm nhi hương vị cà phê trứng béo ngậy đặc sản Hà Nội trong không gian hoài niệm.' }
      ];
      return options[dayIdx % options.length];
    }
    if (destinationLower.includes('đà nẵng') || destinationLower.includes('da nang')) {
      const options = [
        { title: 'Ngắm Cầu Rồng phun lửa bờ sông Hàn', description: 'Chiêm ngưỡng cầu Rồng phun lửa/nước hoành tráng (cuối tuần) và đi dạo cầu Tình Yêu.' },
        { title: 'Khám phá ẩm thực Chợ đêm Helio', description: 'Thiên đường ẩm thực đêm lớn nhất Đà Nẵng với hàng trăm món ngon hấp dẫn.' },
        { title: 'Dạo mát trên bờ cát biển Mỹ Khê', description: 'Đi dạo lắng nghe tiếng sóng vỗ rì rào tại một trong những bãi biển đẹp nhất hành tinh.' },
        { title: 'Khám phá Chợ đêm Sơn Trà sầm uất', description: 'Mua sắm đặc sản địa phương, thưởng thức hải sản nướng thơm nức mũi.' }
      ];
      return options[dayIdx % options.length];
    }
    if (destinationLower.includes('hồ chí minh') || destinationLower.includes('sài gòn') || destinationLower.includes('ho chi minh') || destinationLower.includes('sai gon')) {
      const options = [
        { title: 'Dạo chơi Phố đi bộ Nguyễn Huệ', description: 'Hòa mình vào không khí sôi động, xem biểu diễn nghệ thuật đường phố và ngắm Landmark 81 từ xa.' },
        { title: 'Trải nghiệm Phố Tây Bùi Viện náo nhiệt', description: 'Khám phá khu phố không ngủ sầm uất với các hoạt động giải trí xuyên đêm.' },
        { title: 'Hóng gió công viên Bạch Đằng ven sông', description: 'Ngồi ngắm tàu thuyền du lịch lung linh lướt trên sông Sài Gòn lộng gió.' },
        { title: 'Ăn vặt chợ đêm quanh Bến Thành', description: 'Thưởng thức các món chè, bánh xèo, hủ tiếu gõ mang đậm hương vị Nam Bộ.' }
      ];
      return options[dayIdx % options.length];
    }
    if (destinationLower.includes('đà lạt') || destinationLower.includes('da lat')) {
      const options = [
        { title: 'Khám phá Chợ đêm Đà Lạt (Chợ Âm Phủ)', description: 'Thưởng thức sữa đậu nành nóng, bánh tráng nướng và xiên que nướng trong tiết trời se lạnh.' },
        { title: 'Dạo bộ quanh Hồ Xuân Hương mờ sương', description: 'Thuê xe đạp đôi hoặc đi dạo ven hồ cảm nhận không khí lãng mạn đặc trưng.' },
        { title: 'Ghé quán cà phê acoustic ngắm thung lũng đèn', description: 'Nghe nhạc sống mộc mạc và ngắm nhìn thung lũng nhà lồng lung linh như vạn vì sao.' },
        { title: 'Thưởng thức kem bơ và bánh tráng khu Hòa Bình', description: 'Kem bơ béo ngậy kết hợp sầu riêng thơm phức là món ăn không thể bỏ qua.' }
      ];
      return options[dayIdx % options.length];
    }
    if (destinationLower.includes('hội an') || destinationLower.includes('hoi an')) {
      const options = [
        { title: 'Dạo ngắm đèn lồng Phố cổ Hội An', description: 'Chiêm ngưỡng những ngôi nhà cổ sơn vàng lung linh dưới sắc đèn lồng rực rỡ.' },
        { title: 'Thả đèn hoa đăng trên dòng sông Hoài', description: 'Ngồi thuyền gỗ nhỏ trôi lững lờ và thả những chiếc đèn giấy ước nguyện xuống sông.' },
        { title: 'Mua sắm tại Chợ đêm Nguyễn Hoàng', description: 'Tìm kiếm những món quà lưu niệm bằng gốm Thanh Hà hoặc lồng đèn xinh xắn.' },
        { title: 'Thưởng thức ly nước Mót bên vỉa hè cổ', description: 'Nhâm nhi ly trà thảo mộc mát lành thơm mùi sả chanh giữa lòng phố cổ.' }
      ];
      return options[dayIdx % options.length];
    }
    if (destinationLower.includes('ninh bình') || destinationLower.includes('ninh binh')) {
      const options = [
        { title: 'Dạo chơi Phố cổ Hoa Lư rực rỡ', description: 'Tham quan khu phố cổ tái hiện nét văn hóa Đại Việt xưa lung linh soi bóng xuống mặt hồ.' },
        { title: 'Thưởng thức đặc sản thịt dê nướng cung đình', description: 'Nhâm nhi cơm cháy giòn rụm cùng các món dê đặc sản trứ danh.' },
        { title: 'Thư giãn ngắm hoàng hôn và núi non tĩnh lặng', description: 'Cảm nhận không khí đồng quê trong lành, tách biệt hoàn toàn khói bụi thành phố.' }
      ];
      return options[dayIdx % options.length];
    }
    if (destinationLower.includes('sa pa') || destinationLower.includes('sapa')) {
      const options = [
        { title: 'Dạo hồ Sa Pa và ngắm Nhà thờ Đá', description: 'Nhà thờ Đá kiến trúc Pháp cổ kính được thắp sáng rực rỡ giữa quảng trường sương mù.' },
        { title: 'Khám phá đồ nướng và hạt dẻ nóng Sa Pa', description: 'Thưởng thức cải mèo cuốn thịt bò nướng, cơm lam và hạt dẻ rừng thơm bùi.' },
        { title: 'Giao lưu văn nghệ Chợ tình Sa Pa', description: 'Trải nghiệm nét sinh hoạt văn hóa độc đáo của các đồng bào dân tộc H\'Mông, Dao.' }
      ];
      return options[dayIdx % options.length];
    }
    
    const defaults = [
      { title: 'Dạo bộ trung tâm thành phố ngắm cảnh đêm', description: 'Cảm nhận nhịp sống địa phương bình dị và thư giãn sau ngày dài di chuyển.' },
      { title: 'Khám phá chợ đêm và ẩm thực đường phố', description: 'Ghé các hàng quán vỉa hè ăn vặt, mua sắm đồ lưu niệm địa phương.' },
      { title: 'Thư giãn tại quán cà phê địa phương', description: 'Nhâm nhi tách trà/cà phê ấm cúng và nhìn ngắm đường phố về đêm.' }
    ];
    return defaults[dayIdx % defaults.length];
  };

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
    const site1 = getNextAttraction();
    if (site1) {
      const costPerPerson = site1.price_level === 0 ? 0 : (site1.price_level === 1 ? 30000 : (site1.price_level === 2 ? 100000 : 250000));
      items.push({
        item_type: 'attraction',
        title: `Tham quan ${site1.name}`,
        description: `Khám phá vẻ đẹp lịch sử và văn hóa địa phương. Địa chỉ: ${site1.address}`,
        start_time: '09:00',
        end_time: '11:30',
        google_place_id: site1.google_place_id,
        estimated_cost: costPerPerson * Math.max(1, Number(tripData.traveler_count || 1)),
        order_index: 2
      });
    }

    // Dining (Lunch)
    const lunchRest = getNextDining();
    if (lunchRest) {
      const costPerPerson = lunchRest.price_level === 0 ? 40000 : (lunchRest.price_level === 1 ? 70000 : (lunchRest.price_level === 2 ? 150000 : 350000));
      items.push({
        item_type: 'dining',
        title: `Ăn trưa tại ${lunchRest.name}`,
        description: `Thưởng thức các món đặc sản địa phương ngon và nổi tiếng. Đánh giá: ${lunchRest.rating}⭐. Địa chỉ: ${lunchRest.address}`,
        start_time: '12:00',
        end_time: '13:00',
        google_place_id: lunchRest.google_place_id,
        estimated_cost: costPerPerson * Math.max(1, Number(tripData.traveler_count || 1)),
        order_index: 3
      });
    }

    // Attraction 2 (Afternoon)
    const site2 = getNextAttraction();
    if (site2) {
      const costPerPerson = site2.price_level === 0 ? 0 : (site2.price_level === 1 ? 30000 : (site2.price_level === 2 ? 100000 : 250000));
      items.push({
        item_type: 'attraction',
        title: `Trải nghiệm tại ${site2.name}`,
        description: `Tận hưởng không gian và tìm hiểu về các câu chuyện thú vị. Địa chỉ: ${site2.address}`,
        start_time: '15:00',
        end_time: '17:30',
        google_place_id: site2.google_place_id,
        estimated_cost: costPerPerson * Math.max(1, Number(tripData.traveler_count || 1)),
        order_index: 4
      });
    }

    // Dining (Dinner)
    const dinnerRest = getNextDining();
    if (dinnerRest) {
      const costPerPerson = dinnerRest.price_level === 0 ? 50000 : (dinnerRest.price_level === 1 ? 90000 : (dinnerRest.price_level === 2 ? 200000 : 450000));
      items.push({
        item_type: 'dining',
        title: `Ăn tối tại ${dinnerRest.name}`,
        description: `Thưởng thức ẩm thực tối đặc sắc của địa phương. Đánh giá: ${dinnerRest.rating}⭐. Địa chỉ: ${dinnerRest.address}`,
        start_time: '18:30',
        end_time: '20:00',
        google_place_id: dinnerRest.google_place_id,
        estimated_cost: costPerPerson * Math.max(1, Number(tripData.traveler_count || 1)),
        order_index: 5
      });
    }

    // Experience (Evening)
    const eve = getEveningExperience(index);
    items.push({
      item_type: 'experience',
      title: eve.title,
      description: eve.description,
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
          responseSchema: ALTERNATIVES_JSON_SCHEMA as any
        }
      });

      const text = response.text;
      if (!text) throw new Error('Empty response from Gemini');
      const parsed = JSON.parse(text);
      return normalizeAlternativeCosts(parsed.alternatives || []);
    });
  } catch (error: any) {
    console.error('Gemini generateAlternatives failed:', error.message);
    
    // Fallback Mock alternatives from candidates (prioritizing matches)
    const fallbackAlts: any[] = [];
    const placesToUse = candidatePlaces.slice(0, 3);
    
    if (placesToUse.length > 0) {
      placesToUse.forEach((place, index) => {
        let cost: number | null = null;
        if (place.category === 'dining') {
          cost = place.price_level === 0 ? 50000 : (place.price_level === 1 ? 90000 : (place.price_level === 2 ? 200000 : 450000));
        } else if (place.category === 'accommodation') {
          cost = place.price_level === 0 ? 150000 : (place.price_level === 1 ? 300000 : (place.price_level === 2 ? 600000 : 1200000));
        } else if (place.category === 'attraction') {
          cost = place.price_level === 0 ? 0 : (place.price_level === 1 ? 30000 : (place.price_level === 2 ? 100000 : 250000));
        }
        
        const travelerCount = Number(tripData?.traveler_count) || 1;
        if (cost !== null && place.category !== 'accommodation') {
          cost = cost * travelerCount;
        }

        fallbackAlts.push({
          item_type: originalItem.item_type,
          title: `${originalItem.item_type === 'dining' ? 'Ăn uống tại' : (originalItem.item_type === 'accommodation' ? 'Nghỉ tại' : 'Tham quan')} ${place.name}`,
          description: `Địa điểm thay thế lý tưởng: ${place.name}. Đánh giá: ${place.rating}⭐. Địa chỉ: ${place.address}`,
          start_time: originalItem.start_time || '08:00',
          end_time: originalItem.end_time || '10:00',
          google_place_id: place.google_place_id,
          estimated_cost: cost,
          reason: `Đề xuất thay thế dựa trên yêu cầu tìm kiếm: "${userRequirement || 'thay thế'}".`
        });
      });
    }

    while (fallbackAlts.length < 3) {
      const idx = fallbackAlts.length + 1;
      fallbackAlts.push({
        item_type: originalItem.item_type,
        title: `[Gợi ý AI ${idx}] ${originalItem.title} thay thế`,
        description: `Phương án thay thế đề xuất ${idx} cho "${originalItem.title}". Phù hợp với yêu cầu: "${userRequirement}".`,
        start_time: originalItem.start_time || '08:00',
        end_time: originalItem.end_time || '10:00',
        estimated_cost: originalItem.estimated_cost || 100000,
        reason: `Phương án thay thế dự phòng số ${idx}.`
      });
    }

    return fallbackAlts;
  }
}

export async function chatWithItinerary(
  message: string,
  history: Array<{ role: 'user' | 'model'; content: string }>,
  tripData?: any,
  currentItinerary?: GeneratedItinerary,
  weatherForecast?: WeatherForecast[]
): Promise<{ responseText: string; hasChanges: boolean; adaptedItinerary?: GeneratedItinerary; diff?: string; isCreateTrip?: boolean; createTripParams?: any }> {
  // Get current local date in Vietnam timezone (GMT+7)
  const nowUtc = new Date();
  const vietnamTime = new Date(nowUtc.getTime() + 7 * 60 * 60 * 1000);
  const todayStr = vietnamTime.toISOString().split('T')[0]; // YYYY-MM-DD
  const currentYear = vietnamTime.getFullYear();
  const nextYear = currentYear + 1;

  const systemPrompt = `Bạn là ViVu AI, trợ lý ảo thông minh, thân thiện và là đại sứ thương hiệu độc quyền của nền tảng lập kế hoạch du lịch "ViVu Planner".
Hôm nay là ngày ${todayStr} (năm ${currentYear}). Khi người dùng đề cập đến ngày/tháng đi du lịch:
- Hãy so sánh linh hoạt với ngày hôm nay (${todayStr}) để tự suy luận ra năm phù hợp nhất:
  * Nếu ngày/tháng được chỉ định nằm trong tương lai hoặc trùng với hôm nay (ví dụ: người dùng nói "15/7" khi hôm nay là "11/7/${currentYear}"), hãy tự động hiểu năm là năm nay ${currentYear}. KHÔNG ĐƯỢC HỎI LẠI khách hàng về năm!
  * Nếu ngày/tháng được chỉ định nằm trong quá khứ so với hôm nay (ví dụ: người dùng nói "15/5" khi hôm nay là "11/7/${currentYear}"), hãy tự động hiểu khách muốn đi vào năm sau ${nextYear}. KHÔNG ĐƯỢC HỎI LẠI khách hàng về năm!
  * Chỉ khi nào hoàn toàn không thể xác định được ngày tháng (ví dụ: chỉ nói "ngày 15" mà không rõ tháng nào), bạn mới lịch sự hỏi làm rõ tháng. Khi đã rõ ngày tháng, tuyệt đối không hỏi câu hỏi thừa thãi như "Bạn muốn đi vào năm nào?".
- Khi đã xác định được ngày bắt đầu (start_date) theo quy tắc trên, hãy cập nhật vào createTripParams.
Khi người dùng đặt câu hỏi về trang web này, cách sử dụng, hoặc các tính năng hỗ trợ, hãy nhiệt tình giới thiệu và hướng dẫn họ về các tính năng vượt trội của ViVu Planner:
1. Lập lịch trình tự động: Chỉ cần nhập điểm đến ở Việt Nam, số ngày, ngân sách và sở thích du lịch, ViVu Planner sẽ thiết kế một lịch trình chi tiết sáng - chiều - tối tối ưu chỉ trong vài giây.
2. Quản lý ngân sách thông minh: Tự động theo dõi tổng chi phí dự kiến, số tiền còn lại và cảnh báo đỏ nếu kế hoạch chi tiêu vượt quá giới hạn ngân sách đã đặt.
3. Thay thế hoạt động (Alternatives): Người dùng có thể click vào bất kỳ địa điểm/hoạt động nào trong lịch trình chi tiết để xem danh sách 3 phương án thay thế khác do AI đề xuất và áp dụng thay thế nhanh chóng.
4. Thích ứng thời tiết & Sự cố (Adaptive Itinerary): AI tự động phân tích dự báo thời tiết thực tế để cảnh báo và gợi ý chuyển các hoạt động ngoài trời vào trong nhà nếu trời mưa bão lớn, đảm bảo an toàn chuyến đi.
5. Sửa đổi trực tiếp bằng Chatbot (khung chat này): Người dùng có thể yêu cầu chỉnh sửa bằng ngôn ngữ tự nhiên ngay tại đây (ví dụ: "Thêm quán Highlands Coffee vào chiều ngày 1"), hệ thống sẽ hiển thị bảng so sánh thay đổi (Diff) để người dùng bấm nút "Áp dụng" cập nhật trực tiếp vào chuyến đi cực kỳ nhanh chóng.
6. Ưu tiên đối tác đã xác minh (Verified Partners): Giới thiệu các địa điểm kinh doanh dịch vụ uy tín (khách sạn, nhà hàng, thuê xe) đã liên kết với ViVu Planner để nhận được dịch vụ tốt nhất.

${tripData ? `Hiện tại bạn đang hỗ trợ người dùng quản lý chuyến đi của họ đến "${tripData.destination_city}" từ ngày ${tripData.start_date} đến ngày ${tripData.end_date}.
Tổng ngân sách chuyến đi là: ${tripData.budget_total} VND cho ${tripData.traveler_count || 1} người (${tripData.traveler_type || 'solo'}).
Sở thích của họ là: ${JSON.stringify(tripData.preferences || {})}.
Yêu cầu sức khỏe/đặc biệt: ${tripData.health_conditions || 'Không có'} | ${tripData.special_requirements || 'Không có'}.` : 'Bạn đang trò chuyện chung với người dùng để tư vấn du lịch và hướng dẫn sử dụng nền tảng ViVu Planner.'}

${currentItinerary ? `Lịch trình hiện tại của chuyến đi ("current_itinerary"):
${JSON.stringify(currentItinerary)}` : ''}

${weatherForecast && weatherForecast.length > 0 ? `Dự báo thời tiết thực tế tại điểm đến ("weather_forecast"):
${JSON.stringify(weatherForecast)}` : ''}

QUY TẮC PHẢN HỒI:
1. Giao tiếp thân thiện, CỰC KỲ NGẮN GỌN (tối đa 1-2 câu ngắn), đi thẳng vào vấn đề bằng tiếng Việt. Tuyệt đối không viết thành đoạn văn dài dòng, không giải thích dông dài lê thê.
2. Nếu người dùng yêu cầu thay đổi lịch trình du lịch hiện tại (ví dụ: thêm hoạt động, đổi khách sạn, xóa địa điểm, thay đổi thời gian hoặc sắp xếp lại các ngày):
   - Bạn BẮT BUỘC phải đặt "hasChanges" = true.
   - Bạn phải sửa đổi lịch trình hiện tại một cách hợp lý và trả về lịch trình mới hoàn chỉnh trong "adaptedItinerary" (tuân thủ cấu trúc của lịch trình cũ).
   - Hãy cố gắng giữ lại các thông tin của các ngày/hoạt động khác không bị yêu cầu thay đổi.
   - Khi chỉnh sửa lịch trình, luôn đảm bảo các ràng buộc:
     * Tổng chi phí ("estimated_total") phải nằm trong giới hạn ngân sách ban đầu của khách hàng (${tripData?.budget_total || 'không vượt quá mức cũ'}).
     * Mỗi hoạt động mới thêm hoặc chỉnh sửa cần có chi phí ước lượng thực tế ("estimated_cost") hợp lý, không để trống hoặc null cho các dịch vụ cơ bản.
     * Gợi ý các địa điểm thực tế, địa chỉ cụ thể ở Việt Nam nếu người dùng muốn thêm một địa điểm (ví dụ: một quán cafe, quán ăn cụ thể tại điểm đến chứ không ghi chung chung "Quán cà phê").
3. Nếu người dùng chỉ đang trò chuyện, hỏi đáp, tư vấn (ví dụ: hỏi thời tiết, hỏi danh lam thắng cảnh, hoặc hỏi cách sử dụng các tính năng của website ViVu Planner):
   - Đặt "hasChanges" = false.
   - Không cần trả về "adaptedItinerary".
4. Nếu chưa có thông tin chuyến đi ("current_itinerary" không được cung cấp), bạn đặt "hasChanges" = false. Chỉ đặt "isCreateTrip" = true khi người dùng đã cung cấp đủ thông tin chi tiết (bao gồm cả điểm đến và ngày đi cụ thể) HOẶC khi người dùng hối thúc tạo ngay lập tức (ví dụ: "tạo chuyến đi đà lạt 3tr ngày 11/7", "tạo luôn đi"). Nếu thông tin còn thiếu hoặc chưa rõ ngày đi (ví dụ: chỉ nói chung chung "tạo chuyến đi Đà Lạt 3tr"), bạn phải đặt "isCreateTrip" = false, phản hồi ngắn gọn đặt câu hỏi để làm rõ thông tin và điền các giá trị mặc định vào "createTripParams".`;

  const contents: any[] = [];
  
  // Format history for Gemini API
  history.forEach(item => {
    contents.push({
      role: item.role === 'user' ? 'user' : 'model',
      parts: [{ text: item.content }]
    });
  });
  
  // Add the current user message
  contents.push({
    role: 'user',
    parts: [{ text: message }]
  });

  const responseSchema = currentItinerary ? {
    type: 'object',
    properties: {
      responseText: {
        type: 'string',
        description: 'Câu trả lời tự nhiên của trợ lý AI bằng tiếng Việt, giải thích những gì AI đã tìm hiểu, khuyên nhủ hoặc sửa đổi lịch trình.'
      },
      hasChanges: {
        type: 'boolean',
        description: 'true nếu tin nhắn yêu cầu thay đổi lịch trình hiện tại. false nếu chỉ trò chuyện bình thường.'
      },
      adaptedItinerary: {
        type: 'object',
        description: 'Lịch trình mới đã được cập nhật/chỉnh sửa dựa trên yêu cầu của người dùng. Nếu hasChanges là false, hãy sao chép nguyên lịch trình cũ ("current_itinerary") vào đây.',
        properties: ITINERARY_JSON_SCHEMA.properties,
        required: ITINERARY_JSON_SCHEMA.required
      }
    },
    required: ['responseText', 'hasChanges', 'adaptedItinerary']
  } : {
    type: 'object',
    properties: {
      responseText: {
        type: 'string',
        description: 'Câu trả lời tự nhiên của trợ lý AI bằng tiếng Việt.'
      },
      hasChanges: {
        type: 'boolean',
        description: 'Luôn luôn đặt là false.'
      },
      isCreateTrip: {
        type: 'boolean',
        description: 'Chỉ đặt là true khi người dùng đã xác nhận thông tin cụ thể hoặc hối thúc tạo ngay lập tức. Đặt là false nếu cần hỏi thêm để làm rõ ngày đi, số người, v.v.'
      },
      createTripParams: {
        type: 'object',
        description: 'Các thông số chuyến đi trích xuất được để tạo chuyến đi mới. Nếu isCreateTrip là false, hãy điền các chuỗi rỗng hoặc giá trị mặc định.',
        properties: {
          title: { type: 'string', description: 'Tiêu đề chuyến đi (ví dụ: "Du hí Đà Lạt", "Khám phá Hà Nội").' },
          destination_city: { type: 'string', description: 'Tên thành phố điểm đến thực tế tại Việt Nam (ví dụ: "Đà Lạt", "Hà Nội", "Đà Nẵng").' },
          start_date: { type: 'string', description: `Ngày bắt đầu theo định dạng YYYY-MM-DD. Hãy tự động suy luận ra năm dựa trên ngày hôm nay (${todayStr}) theo quy tắc trong system instruction. Định dạng bắt buộc YYYY-MM-DD.` },
          end_date: { type: 'string', description: 'Ngày kết thúc theo định dạng YYYY-MM-DD. Nếu không nói rõ số ngày, mặc định chuyến đi kéo dài 3 ngày (tức là cách ngày bắt đầu 2 ngày). Định dạng bắt buộc YYYY-MM-DD.' },
          budget_total: { type: 'number', description: 'Tổng ngân sách dự kiến (VND). Nếu người dùng không nói, mặc định là 5000000.' },
          traveler_count: { type: 'number', description: 'Số lượng người đi. Mặc định là 1.' },
          traveler_type: { type: 'string', description: 'Kiểu khách du lịch: "solo", "couple", "family", "friends". Mặc định là "solo".' },
          special_requirements: { type: 'string', description: 'Yêu cầu đặc biệt nếu có trích xuất.' }
        },
        required: ['title', 'destination_city', 'start_date', 'end_date', 'budget_total', 'traveler_count', 'traveler_type', 'special_requirements']
      }
    },
    required: ['responseText', 'hasChanges', 'isCreateTrip', 'createTripParams']
  };

  try {
    return await executeWithApiKeyRotation(async (apiKey) => {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: contents,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: 'application/json',
          responseSchema: responseSchema as any
        }
      });

      const text = response.text;
      if (!text) throw new Error('Gemini response is empty');

      const parsed = JSON.parse(text);
      let diff = '';
      
      if (parsed.hasChanges && parsed.adaptedItinerary && currentItinerary && tripData) {
        const budgetTotal = Number(tripData.budget_total) || currentItinerary.budget_summary.estimated_total + currentItinerary.budget_summary.remaining;
        parsed.adaptedItinerary = enforceBudgetLimit(parsed.adaptedItinerary, budgetTotal, tripData);
        diff = generateItineraryDiff(currentItinerary, parsed.adaptedItinerary, 'other');
      }

      return {
        responseText: parsed.responseText,
        hasChanges: !!parsed.hasChanges,
        adaptedItinerary: parsed.adaptedItinerary,
        isCreateTrip: !!parsed.isCreateTrip,
        createTripParams: parsed.createTripParams,
        diff
      };
    });
  } catch (error: any) {
    console.error('Error in chatWithItinerary:', error.message);
    throw error;
  }
}


