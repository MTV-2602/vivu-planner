import { GoogleGenAI } from '@google/genai';
import { WeatherForecast } from '../weather/weather.service';
import { PlaceCandidate, getCityCoordinates } from '../places/places.service';
import { geocodeOnline } from '../places/geocoding.service';
import { getDefaultPlacesForCity, getDefaultCafesForCity } from '../places/defaultPlaces';
import { executeWithApiKeyRotation } from '../../utils/keyManager';
import { AI_CONFIG } from '../../constants';
import { getEffectiveAiConfig, callOpenAiCompatibleGateway } from './aiGateway.service';

export interface ItineraryItem {
  item_type: 'accommodation' | 'transport' | 'dining' | 'attraction' | 'rental' | 'experience';
  title: string;
  description: string;
  start_time?: string;
  end_time?: string;
  google_place_id?: string;
  estimated_cost?: number | null;
  order_index: number;
  lat?: number | null;
  lng?: number | null;
  address?: string | null;
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
                order_index: { type: 'integer' },
                lat: { type: 'number' },
                lng: { type: 'number' },
                address: { type: 'string' }
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

function removeTransportToDestination(itinerary: GeneratedItinerary, destinationCity?: string): void {
  if (!itinerary?.days || itinerary.days.length === 0) return;
  const day1 = itinerary.days[0];
  if (!day1?.items || day1.items.length === 0) return;

  const cityNorm = (destinationCity || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .trim();

  // Scan items on Day 1: Nếu item_type === 'transport' và title chứa "Di chuyển đến" hoặc "Đến [city]" -> XÓA khỏi danh sách
  day1.items = day1.items.filter((item, index) => {
    if (item.item_type === 'transport') {
      const title = item.title || '';
      const titleNorm = title
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .trim();

      const isForbidden =
        titleNorm.includes('di chuyen den') ||
        titleNorm.includes('khoi hanh den') ||
        titleNorm.includes('khoi hanh di') ||
        titleNorm.includes('bay den') ||
        titleNorm.includes('xe khach den') ||
        titleNorm.includes('tau hoa den') ||
        titleNorm.includes('den noi') ||
        (cityNorm && titleNorm.includes(`den ${cityNorm}`)) ||
        (index === 0 && /^den\s+/i.test(titleNorm));

      if (isForbidden) {
        return false;
      }
    }
    return true;
  });

  day1.items.forEach((item, idx) => {
    item.order_index = idx + 1;
  });
}

function normalizeAccommodationItems(itinerary: GeneratedItinerary, tripData: any, totalNights: number): void {
  // LỖI B1: KHÔNG xóa accommodation khi totalNights <= 0 (chuyến đi 1 ngày du khách vẫn cần nghỉ ngơi lưu trú)
  if (hasExplicitAccommodationPreference(tripData?.special_requirements)) return;

  const accommodationEntries: Array<{ dayIndex: number; item: ItineraryItem }> = [];
  itinerary.days.forEach((day, dayIndex) => {
    day.items.forEach(item => {
      if (item.item_type === 'accommodation') {
        accommodationEntries.push({ dayIndex, item });
      }
    });
  });

  // Nếu không có accommodation nào (ví dụ chuyến đi 1 ngày AI quên sinh), BẮT BUỘC chèn 1 chỗ nghỉ vào lúc 14:00 Ngày 1
  if (accommodationEntries.length === 0) {
    if (itinerary.days && itinerary.days.length > 0) {
      const city = tripData?.destination_city || '';
      const defaultAcc = getDefaultPlacesForCity(city).accommodation[0];
      const travelers = Math.max(1, Number(tripData?.traveler_count || 1));
      const roomsCount = Math.max(1, Math.ceil(travelers / 2));
      const baseCost = defaultAcc ? (defaultAcc.price_level === 1 ? 350000 : 500000) : 400000;
      const accItem: ItineraryItem = {
        order_index: 0,
        title: defaultAcc ? `Nhận phòng lưu trú tại ${defaultAcc.name}` : 'Nhận phòng khách sạn / Homestay',
        item_type: 'accommodation',
        start_time: '14:00',
        end_time: '15:00',
        description: 'Nhận phòng nghỉ ngơi, cất hành lý tại điểm đến.',
        google_place_id: defaultAcc?.google_place_id || undefined,
        lat: defaultAcc?.lat,
        lng: defaultAcc?.lng,
        address: defaultAcc?.address,
        estimated_cost: baseCost * Math.max(1, totalNights) * roomsCount
      };

      const day1 = itinerary.days[0];
      const afternoonIdx = day1.items.findIndex(it => (it.start_time || '') >= '14:00');
      if (afternoonIdx !== -1) {
        day1.items.splice(afternoonIdx, 0, accItem);
      } else {
        day1.items.push(accItem);
      }
      day1.items.forEach((it, idx) => { it.order_index = idx + 1; });
    }
    return;
  }

  const firstAccommodation = { ...accommodationEntries[0].item };
  if (!firstAccommodation.start_time) {
    firstAccommodation.start_time = '14:00';
    firstAccommodation.end_time = '15:00';
  }

  if (accommodationEntries.length > 1) {
    const allCostsConfirmed = accommodationEntries.every(entry => hasConfirmedCost(entry.item));
    if (allCostsConfirmed) {
      firstAccommodation.estimated_cost = accommodationEntries.reduce((sum, entry) => {
        return sum + Number(entry.item.estimated_cost || 0);
      }, 0);
    } else {
      delete firstAccommodation.estimated_cost;
    }
  } else if (!firstAccommodation.estimated_cost || firstAccommodation.estimated_cost === 0) {
    // Nếu chi phí đang là 0 hoặc thiếu (ví dụ 1 ngày), ước lượng chi phí 1 đêm hợp lý
    const travelers = Math.max(1, Number(tripData?.traveler_count || 1));
    const roomsCount = Math.max(1, Math.ceil(travelers / 2));
    firstAccommodation.estimated_cost = 450000 * Math.max(1, totalNights) * roomsCount;
  }

  if (accommodationEntries.length > 1 || accommodationEntries[0].dayIndex !== 0) {
    itinerary.days.forEach(day => {
      day.items = day.items.filter(item => item.item_type !== 'accommodation');
    });
    const day1 = itinerary.days[0];
    if (day1) {
      const afternoonIdx = day1.items.findIndex(it => (it.start_time || '') >= (firstAccommodation.start_time || '14:00'));
      if (afternoonIdx !== -1) {
        day1.items.splice(afternoonIdx, 0, firstAccommodation);
      } else {
        day1.items.push(firstAccommodation);
      }
      day1.items.forEach((it, idx) => { it.order_index = idx + 1; });
    }
  }
}

function enforceBudgetLimit(itinerary: GeneratedItinerary, budgetTotal: number, tripData?: any): GeneratedItinerary {
  const normalizedBudget = Number.isFinite(budgetTotal) && budgetTotal > 0 ? budgetTotal : 0;
  const totalNights = getTripNightCount(tripData, itinerary.days.length);

  removeTransportToDestination(itinerary, tripData?.destination_city);
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
  const systemPrompt = `0. TOẠ ĐỘ THỰC TẾ TRONG KHI TẠO (REALTIME COORDINATES): Đối với mỗi hoạt động trong lịch trình, bạn PHẢI tìm kiếm trong kiến thức của mình để điền chính xác tọa độ Vĩ độ ("lat") và Kinh độ ("lng") cùng địa chỉ thực tế ("address") của địa điểm đó tại Việt Nam. Không điền tọa độ chung chung giống nhau hay tọa độ giả lập. Phải đảm bảo tọa độ khớp chính xác với địa điểm thực tế (ví dụ: Cầu Rồng Đà Nẵng phải là 16.0612, 108.2268; chợ Bến Thành là 10.7726, 106.6980; Hồ Hoàn Kiếm là 21.0287, 105.8524). Nếu địa điểm là di chuyển (transport) hoặc tự do, bạn có thể để lat/lng là null.

Bạn là một chuyên gia lập kế hoạch du lịch (Travel Expert) chuyên nghiệp tại Việt Nam.
Nhiệm vụ của bạn là xây dựng lịch trình du lịch tối ưu, an toàn và cá nhân hóa sâu sắc dựa trên thông tin yêu cầu của khách hàng.

QUY TẮC CỐT LÕI:
1. NGUỒN ĐỊA ĐIỂM & ĐA DẠNG HÓA BẢN ĐỊA:
   - ƯU TIÊN SỐ 1: Sử dụng các địa điểm và đối tác có trong danh sách "candidate_places" được cung cấp.
   - NỚI LỎNG TỰ DO BỔ SUNG ĐỊA ĐIỂM ĐẶC SẮC (LOCAL GEMS): Để lịch trình đạt độ phong phú tối đa, cá nhân hóa sâu sắc theo sở thích của khách (đặc biệt cho các chuyến đi nhiều ngày), bạn ĐƯỢC PHÉP và KHUYẾN KHÍCH tự do bổ sung thêm các điểm tham quan, danh thắng, quán ăn đặc sản bản địa nức tiếng, quán cafe view đẹp THỰC TẾ CÓ THẬT tại thành phố đó.
   - YÊU CẦU CHUẨN XÁC KHI TỰ BỔ SUNG:
     * Địa điểm bắt buộc phải là nơi THỰC TẾ ĐANG HOẠT ĐỘNG tại thành phố đó.
     * Cung cấp tọa độ ('lat', 'lng') và địa chỉ cụ thể ('address') chính xác tại thành phố, không bịa đặt, không để tọa độ giả lập.
     * Thuộc tính 'google_place_id' để null (hoặc không điền) đối với địa điểm tự bổ sung.
     * Ước lượng chi phí thực tế ('estimated_cost') phù hợp túi tiền của khách, không để null.
2. ƯU TIÊN ĐỐI TÁC XÁC MINH (VERIFIED PARTNERS): Trong danh sách "candidate_places", các địa điểm có "google_place_id" bắt đầu bằng tiền tố "partner_" là đối tác đã được xác minh. Hãy ưu tiên lựa chọn và đưa các đối tác này vào lịch trình nếu họ phù hợp với sở thích, vị trí địa lý và ngân sách của khách. Tuy nhiên, tuyệt đối KHÔNG cưỡng ép chọn đối tác nếu không phù hợp — chất lượng lịch trình du lịch luôn là ưu tiên hàng đầu. Khi chọn một đối tác, hãy giữ nguyên thuộc tính google_place_id có tiền tố "partner_" trong kết quả JSON trả về.
3. Hãy phân tích kỹ sở thích, ngân sách, và đặc biệt là tình trạng sức khỏe, giới hạn thể lực của khách để chọn hoạt động phù hợp nhất.
4. ĐẢM BẢO TÍNH ĐA DẠNG & GỢI Ý CÁC ĐỊA ĐIỂM ĐỘC ĐÁO (HIDDEN GEMS):
   - Tuyệt đối không thiết kế các lịch trình lặp đi lặp lại hoặc chỉ chứa toàn các địa điểm du lịch quá phổ thông (hot spots) mà ai cũng biết. Lịch trình phải có sự kết hợp hài hòa giữa các địa điểm nổi tiếng và các địa điểm độc lạ, ít người biết, đậm chất bản địa (Hidden Gems) phù hợp với mong muốn khám phá của người dùng.
   - Cá nhân hóa sâu sắc theo sở thích của người dùng: Ví dụ, nếu họ chọn 'Khám phá mạo hiểm', hãy ưu tiên trekking, cắm trại, các hoạt động ngoài trời mới lạ; nếu họ chọn 'Ẩm thực & Đặc sản', hãy gợi ý các quán ăn địa phương gia truyền độc đáo; nếu họ chọn 'Nghỉ dưỡng & Chill', hãy ưu tiên các quán cà phê ngắm cảnh yên bình, bãi biển vắng người, spa.
   - Đối với các hoạt động trải nghiệm bản địa đặc sắc, các Hidden Gems hoặc hoạt động giải trí theo sở thích đặc biệt của khách mà không có sẵn trong danh sách candidate_places, bạn có thể tự thiết kế bằng cách dùng item_type: 'experience' và không điền google_place_id (hoặc để google_place_id = null) để lịch trình sinh động, đa dạng và đáp ứng đúng yêu cầu của khách hàng.
5. PHÂN BỔ NGÂN SÁCH THÔNG MINH & TỰ ĐỘNG ƯỚC LƯỢNG CHI PHÍ THỰC TẾ (RÀNG BUỘC BẮT BUỘC):
    - Địa chỉ của tất cả địa điểm được chọn phải phù hợp với điều kiện kinh tế và khớp với phân bổ tổng chi phí cho tất cả các ngày.
    - Bạn BẮT BUỘC phải điền giá cả ước lượng thực tế ("estimated_cost") cho toàn bộ hoạt động (ăn uống, đi lại, tham quan, lưu trú). Tuyệt đối không bỏ trống hay trả về null/undefined cho các hoạt động ăn uống, đi lại cơ bản.
    - DỰ ĐOÁN CAO ĐIỂM / LỄ TẾT: Bạn phải kiểm tra "start_date" và "end_date". Nếu trùng vào dịp lễ Tết hoặc cao điểm hè, hãy tăng giá phòng và xe lên 20-50% và ghi rõ trong "expert_advice".
    - Tổng chi phí ước lượng của toàn bộ lịch trình ("estimated_total") phải cân đối thông minh để khớp từ 80% đến 100% của ngân sách tổng ("budget_total"). Tuyệt đối không để tổng chi phí vượt quá ngân sách tổng.
    - QUY TẮC LƯU TRÚ LINH HOẠT (ACCOMMODATION):
      * MẶC ĐỊNH: Chỉ đặt DUY NHẤT 1 khách sạn/nơi lưu trú cho cả chuyến đi tại cùng 1 thành phố. Xếp mục chỗ nghỉ này duy nhất vào Ngày 1 (mốc giờ 14:00 - 15:00). KHÔNG ĐƯỢC thêm chỗ nghỉ mới hay check-in mới ở các ngày tiếp theo (Ngày 2, Ngày 3, Ngày 4...).
      * CHUYẾN ĐI 1 NGÀY (start_date == end_date): Du khách vẫn cần nghỉ đêm tại điểm đến. BẮT BUỘC phải xếp 1 khách sạn/homestay vào lúc 14:00 Ngày 1. estimated_cost = giá 1 đêm 1 phòng (tính theo số phòng cần đặt). KHÔNG bỏ qua accommodation chỉ vì chuyến đi 1 ngày.
      * CHI PHÍ CHỖ NGHỈ: Điền chi phí phòng cho cả chuyến đi vào "estimated_cost" của ngày đầu tiên: estimated_cost = (giá 1 đêm ước tính hợp lý của khách sạn) * Math.max(1, số ngày - 1) * (số phòng cần đặt).
      * NGOẠI LỆ: Chỉ khi khách hàng có yêu cầu đặc biệt muốn thay đổi khách sạn (ghi ở "special_requirements"), bạn mới được chia lịch trình thành nhiều chỗ nghỉ khác nhau.
      * GIỚI HẠN CHI PHÍ: Tổng tiền lưu trú cho cả chuyến đi không vượt quá 30% tổng ngân sách ("budget_total") đối với ngân sách eo hẹp (dưới 1.500.000đ/ngày/người).
    - RÀNG BUỘC CHI PHÍ HOẠT ĐỘNG MIỄN PHÍ: Đối với bất kỳ hoạt động miễn phí (dạo bãi biển, tham quan chùa, phố đi bộ, check-out) hoặc dịch vụ đã bao gồm trong chi phí khác (ăn sáng tại khách sạn), PHẢI điền "estimated_cost" = 0 để hệ thống hiển thị "Miễn phí". Không để trống.

6. TỐI ƯU HÓA LỘ TRÌNH THUẬN ĐƯỜNG & HỢP LÝ ĐỊA LÝ (ROUTE PROXIMITY & KHÔNG NHẢY CÓC):
    - BẮT BUỘC sắp xếp các hoạt động trong cùng 1 ngày theo thứ tự địa lý liền kề, di chuyển thuận một tuyến đường theo cùng quận/huyện/khu vực.
    - TUYỆT ĐỐI KHÔNG nhảy cóc quãng đường (ví dụ: sáng ở phía Nam thành phố, trưa chạy ngược ra phía Bắc cách 15km, chiều lại quay về Nam).
    - Giữa các điểm đến luôn chừa khoảng cách 20 - 30 phút để di chuyển thong thả.

7. NHỊP ĐỘ LỊCH TRÌNH THỰC TẾ & THỜI LƯỢNG ĐỊA ĐIỂM (KHÔNG GẤP GÁP, KHÔNG THƯA THỚT):
    - 3 BỮA ĂN CHÍNH MỖI NGÀY BẮT BUỘC ĐẦY ĐỦ:
      * Bữa sáng (~07:00 - 08:30): Món ăn đặc sản địa phương (bún bò, phở, mì quảng, bánh mì, bánh cuốn...).
      * Bữa trưa (~11:30 - 13:00): Quán ăn đặc sản bản địa, cơm niêu, hải sản tươi ngon, ăn no nê tiếp sức.
      * Bữa tối (~18:00 - 19:30): Lẩu nướng, hải sản, món ngon địa phương hoặc khám phá khu ẩm thực đêm.
      * Tuyệt đối không lặp lại món ăn hay quán ăn trong cùng một chuyến đi!
      * Sau bữa tối PHẢI có ít nhất 1 hoạt động tối (20:00–23:00): phố đi bộ, chợ đêm, bar/pub địa phương, xem biểu diễn, dạo bộ bờ biển/hồ ban đêm, khu vui chơi về đêm, cà phê tối. Phù hợp với điểm đến. Tuyệt đối không để lịch trình kết thúc chỉ sau bữa ăn tối!
    - 1 ĐẾN 2 CỮ CÀ PHÊ / TRÀ CHILL MỖI NGÀY (VĂN HÓA DU LỊCH BẢN ĐIỆN VIỆT NAM):
      * Cà phê sáng (~08:30 - 09:30): Nhâm nhi cà phê sáng tỉnh táo tại quán cóc truyền thống hoặc quán không gian thoáng đãng trước khi đi chơi.
      * Cà phê chiều chill / ngắm hoàng hôn (~15:30 - 17:00): Nghỉ chân sau khi đi chơi mệt, ngắm hoàng hôn, check-in view đồi núi hoặc view biển thơ mộng.
      * (Hoặc) Cà phê tối / Acoustic / Rooftop (~20:00 - 21:30): Ngồi ngắm thành phố về đêm, nghe nhạc hoặc trò chuyện thư giãn.
    - VUI CHƠI & THAM QUAN: CHỈ TỪ 1 ĐẾN 2 KHU TRỌNG ĐIỂM MỖI NGÀY — PHÂN BỔ THỜI GIAN ĐÚNG TÍNH CHẤT ĐỊA ĐIỂM:
      * Nông trại, khu trải nghiệm sinh thái, vườn hoa (Puppy Farm, Chika Farm, Vườn dâu, Đồi chè...): Dành từ 1.5 đến 3 tiếng để du khách thong thả dạo chơi, chụp ảnh và tương tác trải nghiệm. Tuyệt đối không xếp vội vã 30-45 phút!
      * Khu du lịch quy mô lớn, công viên chủ đề (Bà Nà Hills, VinWonders, Sun World, Safari, KDL Suối Tiên...): BẮT BUỘC dành từ NỬA NGÀY (4-5 tiếng) hoặc CẢ NGÀY! Khi đã xếp 1 tổ hợp lớn, KHÔNG xếp thêm điểm tham quan rời rạc khác cùng buổi để tránh kiệt sức và lãng phí vé.
      * Điểm check-in văn hóa, di tích lịch sử, bảo tàng, danh thắng nhanh (Chùa Linh Ứng, Nhà thờ Con Gà, Cầu Rồng, Tháp Trầm Hương...): Dành khoảng 45 phút đến 1.5 tiếng là vừa vặn.
    - KHOẢNG ĐỆM NGHỈ TRƯA VÀ DI CHUYỂN:
      * Buổi trưa sau bữa ăn (~13:00 - 14:30): Phải có thời gian về khách sạn nghỉ ngơi hoặc ngồi nghỉ ngơi tại quán tránh nắng gắt. Tuyệt đối không bắt du khách đi bộ tham quan ngoài trời vào giữa trưa 12:30 - 13:30!
    - TỔNG SỐ HOẠT ĐỘNG MỖI NGÀY: Từ 6 đến 8 hoạt động (bao gồm 3 bữa ăn + 1-2 cữ cà phê + 1-2 khu vui chơi/tham quan trọng điểm + 1 hoạt động tối + nghỉ ngơi/di chuyển). Riêng Ngày 1 có thêm mục Nhận phòng khách sạn (14:00 - 15:00). Lịch trình phải vừa vặn, khoa học, thực tế, thong dong tận hưởng kỳ nghỉ!

8. TƯ VẤN CHUYÊN GIA & CẢNH BÁO:
    - "expert_advice": Lời khuyên chi tiết, giải thích lý do thiết kế lịch trình phù hợp sở thích/thể lực/ngân sách của khách.
    - "warning_notes": Cảnh báo thời tiết xấu, đường đèo, lưu ý hành lý hoặc an toàn sức khỏe.
    - "missing_info_questions": Các câu hỏi làm rõ nếu cần thêm thông tin; nếu đã đầy đủ thì để mảng rỗng [].

CONCISE DESCRIPTIONS FOR SPEED: Viết "description" cho mỗi hoạt động thật ngắn gọn, súc tích (tối đa 15-20 từ). Không viết lan man.

Trả lời CHỈ bằng JSON hợp lệ tuân thủ schema được cung cấp. Không viết thêm markdown, không thêm giải thích ngoài JSON.`;

  const startDateStr = String(tripData.start_date || '').split('T')[0];
  const endDateStr = String(tripData.end_date || '').split('T')[0];
  const isOneDay = Boolean(
    (startDateStr && endDateStr && startDateStr === endDateStr) ||
    weatherForecast.length === 1
  );

  const scheduleConstraint = isOneDay
    ? "KHÔNG được thêm item loại transport 'di chuyển đến'. BẮT BUỘC xếp 1 accommodation lúc 14:00"
    : "KHÔNG được thêm item loại transport 'di chuyển đến'";

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
      special_requirements: tripData.special_requirements,
      schedule_constraint: scheduleConstraint,
      ...(isOneDay ? {
        _isOneDay: {
          accommodation_required: true,
          accommodation_time: '14:00'
        }
      } : {})
    },
    schedule_constraint: scheduleConstraint,
    ...(isOneDay ? {
      _isOneDay: {
        accommodation_required: true,
        accommodation_time: '14:00'
      }
    } : {}),
    weather_forecast: weatherForecast,
    candidate_places: {
      accommodation: candidatePlaces.accommodation || [],
      dining: candidatePlaces.dining || [],
      attraction: candidatePlaces.attraction || [],
      rental: candidatePlaces.rental || []
    }
  });

  try {
    const aiConfig = await getEffectiveAiConfig();
    const effectiveCustomTokens = aiConfig.maxTokens || 16384;
    const effectiveGeminiTokens = aiConfig.geminiMaxTokens || 16384;

    const requestedProvider = tripData?.ai_provider;
    const hasActiveGateway = Boolean(aiConfig.isActive && aiConfig.apiKey);
    const shouldUseGateway = requestedProvider === 'custom_openai' && hasActiveGateway;

function safeParseJson(raw: string): any {
  if (!raw || typeof raw !== 'string') {
    throw new Error('Dữ liệu phản hồi AI rỗng hoặc không hợp lệ');
  }

  let cleaned = raw.trim();
  // Loại bỏ các markdown code fences ```json hoặc ``` ở đầu/cuối
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  const firstBrace = cleaned.indexOf('{');
  const firstBracket = cleaned.indexOf('[');
  let startIdx = -1;
  if (firstBrace !== -1 && firstBracket !== -1) {
    startIdx = Math.min(firstBrace, firstBracket);
  } else if (firstBrace !== -1) {
    startIdx = firstBrace;
  } else if (firstBracket !== -1) {
    startIdx = firstBracket;
  }

  if (startIdx !== -1) {
    cleaned = cleaned.substring(startIdx);
  }

  // Cắt tới dấu đóng ngoặc hợp lệ cuối cùng để loại bỏ hoàn toàn các ký tự thừa
  const lastBrace = cleaned.lastIndexOf('}');
  const lastBracket = cleaned.lastIndexOf(']');
  const endIdx = Math.max(lastBrace, lastBracket);
  if (endIdx !== -1) {
    cleaned = cleaned.substring(0, endIdx + 1);
  }

  // 1. Parse chuẩn
  try {
    return JSON.parse(cleaned);
  } catch (err1) {
    // 2. Xóa trailing commas (dấu phẩy thừa trước ] hoặc })
    let fixed = cleaned.replace(/,\s*([\]}])/g, '$1');
    try {
      return JSON.parse(fixed);
    } catch (err2) {
      // 3. Tự động đóng các ngoặc chưa đóng nếu JSON bị cắt cụt
      let openBrackets: string[] = [];
      let inString = false;
      let escape = false;

      for (let i = 0; i < fixed.length; i++) {
        const char = fixed[i];
        if (escape) {
          escape = false;
          continue;
        }
        if (char === '\\') {
          escape = true;
          continue;
        }
        if (char === '"') {
          inString = !inString;
          continue;
        }
        if (!inString) {
          if (char === '{') openBrackets.push('}');
          else if (char === '[') openBrackets.push(']');
          else if (char === '}' || char === ']') {
            if (openBrackets.length > 0 && openBrackets[openBrackets.length - 1] === char) {
              openBrackets.pop();
            }
          }
        }
      }

      if (inString) fixed += '"';
      while (openBrackets.length > 0) {
        fixed += openBrackets.pop();
      }

      try {
        return JSON.parse(fixed);
      } catch (err3) {
        throw err1;
      }
    }
  }
}


    const executeGateway = async (): Promise<GeneratedItinerary> => {
      const messages = [
        {
          role: 'system' as const,
          content: `${systemPrompt}\n\nĐẶC BIỆT DÀNH CHO BẢN CAO CẤP (AI PRO):\n1. YÊU CẦU ĐỘ PHONG PHÚ ĐẲNG CẤP: Mỗi ngày BẮT BUỘC có từ 6 đến 8 hoạt động chi tiết, khoa học: Đủ 3 bữa ăn (Sáng, Trưa, Tối) + 1-2 cữ Cà phê chill bản địa (sáng/chiều ngắm hoàng hôn/tối) + 1-2 khu vui chơi/tham quan/farm trọng điểm + thời gian nghỉ trưa tránh nắng (13:00 - 14:30). Riêng Ngày 1 có thêm mục Chỗ nghỉ (accommodation) lúc 14:00 - 15:00 (các ngày sau không thêm chỗ nghỉ mới).\n2. Điền chính xác tên quán ăn, khách sạn và địa điểm nổi tiếng thực tế kèm tọa độ lat/lng và địa chỉ chi tiết tại Việt Nam.\n3. Bắt buộc trả về JSON object thuần túy khớp cấu trúc: {"days":[{"day_number":1,"date":"YYYY-MM-DD","weather_note":"...","items":[{"item_type":"attraction","title":"...","description":"...","start_time":"08:00","end_time":"10:00","estimated_cost":100000,"order_index":0,"lat":16.0,"lng":108.0,"address":"..."}]}],"budget_summary":{"estimated_total":0,"remaining":0}}. Tuyệt đối không bọc ngoài bằng key nào khác!`
        },
        { role: 'user' as const, content: userPrompt }
      ];
      const gatewayTokens = Math.max(effectiveCustomTokens, 32768);
      const rawText = await callOpenAiCompatibleGateway({
        messages,
        jsonMode: true,
        temperature: AI_CONFIG.DEFAULT_TEMPERATURE,
        maxTokens: gatewayTokens,
        timeout: 90000
      });
      const parsed = safeParseJson(rawText);

      let extractedDays = parsed.days || parsed.itinerary?.days || parsed.itinerary_days;
      if (!Array.isArray(extractedDays) && Array.isArray(parsed)) {
        extractedDays = parsed;
      }
      if (!Array.isArray(extractedDays)) {
        throw new Error('AI Gateway response does not contain a valid "days" array');
      }
      parsed.days = extractedDays;

      if (!parsed.budget_summary) {
        parsed.budget_summary = {
          estimated_total: calculateEstimatedTotal(parsed.days),
          remaining: 0
        };
      }

      // Validate google_place_ids to prevent hallucinations
      const validIds = new Set<string>();
      Object.values(candidatePlaces).forEach(list => {
        list.forEach(place => validIds.add(place.google_place_id));
      });
      parsed.days.forEach((day: any) => {
        if (!Array.isArray(day.items)) {
          day.items = [];
        }
        day.items.forEach((item: any) => {
          if (item.google_place_id && !validIds.has(item.google_place_id)) {
            item.google_place_id = undefined;
          }
        });
      });
      return parsed as GeneratedItinerary;
    };

    const executeGemini = async (): Promise<GeneratedItinerary> => {
      return await executeWithApiKeyRotation(async (apiKey) => {
        const ai = new GoogleGenAI({ apiKey });
        const generatePromise = ai.models.generateContent({
          model: AI_CONFIG.DEFAULT_MODEL,
          contents: `${systemPrompt}\n\nDữ liệu yêu cầu:\n${userPrompt}`,
          config: {
            responseMimeType: AI_CONFIG.RESPONSE_MIME_TYPE,
            responseSchema: ITINERARY_JSON_SCHEMA as any,
            temperature: AI_CONFIG.DEFAULT_TEMPERATURE,
            maxOutputTokens: effectiveGeminiTokens,
            thinkingConfig: { thinkingBudget: 0 } as any
          }
        });

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Gemini generation timed out after 35s')), 35000)
        );

        const response = (await Promise.race([generatePromise, timeoutPromise])) as any;

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
    };

    let finalItinerary: GeneratedItinerary;

    if (shouldUseGateway) {
      try {
        console.log('[GeminiService] Đang tạo lịch trình qua Cổng AI Gateway...');
        finalItinerary = await executeGateway();
      } catch (gatewayErr: any) {
        console.warn(`[GeminiService] AI Gateway gặp sự cố (${gatewayErr.message}), thử chuyển tiếp sang Gemini Direct...`);
        try {
          finalItinerary = await executeGemini();
        } catch (geminiErr: any) {
          throw new Error(`AI Gateway thất bại: ${gatewayErr.message}. Fallback Gemini cũng thất bại: ${geminiErr.message}`);
        }
      }
    } else {
      try {
        console.log('[GeminiService] Đang tạo lịch trình qua Gemini Direct...');
        finalItinerary = await executeGemini();
      } catch (geminiErr: any) {
        console.warn(`[GeminiService] Gemini Direct thất bại (${geminiErr.message}).`);
        if (hasActiveGateway) {
          console.log('[GeminiService] Tự động kích hoạt Cổng AI Gateway cứu cánh (Fallback)...');
          finalItinerary = await executeGateway();
        } else {
          throw geminiErr;
        }
      }
    }

    // Validate và fix tọa độ AI sinh ra trong lịch trình (áp dụng cho cả Gateway và Gemini)
    const cityCenter = getCityCoordinates(tripData.destination_city);
    finalItinerary.days.forEach(day => {
      if (!Array.isArray(day.items)) {
        day.items = [];
      }
      day.items.forEach(item => {
        const lat = Number(item.lat);
        const lng = Number(item.lng);
        const hasValidCoords = !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0 &&
          Math.sqrt(Math.pow(lat - cityCenter.lat, 2) + Math.pow(lng - cityCenter.lng, 2)) <= 0.25;
        if (!hasValidCoords) {
          // Xóa tọa độ sai — frontend sẽ bỏ qua item này trên bản đồ thay vì pin sai chỗ
          item.lat = undefined as any;
          item.lng = undefined as any;
        }
      });
    });

    return enforceBudgetLimit(finalItinerary, Number(tripData.budget_total), tripData);
  } catch (error: any) {
    console.error(`[GeminiService] Lỗi tạo lịch trình AI: ${error.message}`);
    throw error;
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
        model: AI_CONFIG.DEFAULT_MODEL,
        contents: `${systemPrompt}\n\nDữ liệu yêu cầu:\n${userPrompt}`,
        config: {
          responseMimeType: AI_CONFIG.RESPONSE_MIME_TYPE,
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
    console.error(`[GeminiService] Lỗi điều chỉnh lịch trình AI: ${error.message}`);
    throw error;
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
  const travelers = Math.max(1, Number(tripData.traveler_count || 1));

  // 1. Luôn bảo đảm kho địa điểm thực tế phong phú cho thành phố
  const defaultPlaces = getDefaultPlacesForCity(tripData.destination_city || '');
  if (!candidatePlaces.accommodation || candidatePlaces.accommodation.length === 0) {
    candidatePlaces.accommodation = defaultPlaces.accommodation;
  }
  if (!candidatePlaces.dining || candidatePlaces.dining.length === 0) {
    candidatePlaces.dining = defaultPlaces.dining;
  }
  if (!candidatePlaces.attraction || candidatePlaces.attraction.length === 0) {
    candidatePlaces.attraction = defaultPlaces.attraction;
  }

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

  // Sort dining based on special requirements
  const specialReq = (tripData.special_requirements || '').toLowerCase();
  const tripTitle = (tripData.title || '').toLowerCase();
  const searchTerms = [specialReq, tripTitle].filter(Boolean);

  const scoredDining = (candidatePlaces.dining || []).map(place => {
    let score = 0;
    const nameLower = place.name.toLowerCase();
    
    searchTerms.forEach(term => {
      if (term.includes(nameLower) || nameLower.includes(term)) {
        score += 20;
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

  scoredDining.sort((a, b) => b.score - a.score);

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
  const dining = filterByBudget(sortedDining, dailyBudget, daysCount * 3);
  const attractions = filterByBudget(sortedAttractions, dailyBudget, daysCount * 2);

  // Depletion pools
  const attractionsPool = [...attractions];
  let currentAttractions = [...attractionsPool];

  const getNextAttraction = (): PlaceCandidate => {
    if (attractionsPool.length === 0) {
      return defaultPlaces.attraction[0];
    }
    if (currentAttractions.length === 0) {
      currentAttractions = shuffleArray([...attractionsPool]);
    }
    return currentAttractions.shift() || defaultPlaces.attraction[0];
  };

  const diningPool = [...dining];
  let currentDining = [...diningPool];

  const getNextDining = (): PlaceCandidate => {
    if (diningPool.length === 0) {
      return defaultPlaces.dining[0];
    }
    if (currentDining.length === 0) {
      currentDining = shuffleArray([...diningPool]);
    }
    return currentDining.shift() || defaultPlaces.dining[0];
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
        { title: 'Dạo chơi Phố đi bộ Nguyễn Huệ & Xem biểu diễn đường phố', description: 'Hòa mình vào không khí sôi động, xem biểu diễn nghệ thuật đường phố và ngắm cảnh trung tâm sầm uất.' },
        { title: 'Trải nghiệm Phố Tây Bùi Viện náo nhiệt', description: 'Khám phá khu phố không ngủ sầm uất với các hoạt động giải trí xuyên đêm.' },
        { title: 'Hóng gió công viên Bạch Đằng & Ngắm du thuyền sông Sài Gòn', description: 'Ngồi ngắm tàu thuyền du lịch lung linh lướt trên sông Sài Gòn lộng gió mát rượi.' },
        { title: 'Ăn vặt chợ đêm quanh Chợ Bến Thành', description: 'Thưởng thức các món chè, bánh xèo, hủ tiếu gõ mang đậm hương vị Nam Bộ.' },
        { title: 'Check-in quán cà phê trên cao ngắm toàn cảnh Sài Gòn lung linh', description: 'Thưởng thức đồ uống thơm ngon và chiêm ngưỡng ánh đèn thành phố từ trên cao.' }
      ];
      return options[dayIdx % options.length];
    }
    if (destinationLower.includes('đà lạt') || destinationLower.includes('da lat')) {
      const options = [
        { title: 'Khám phá Chợ đêm Đà Lạt & Ẩm thực phố núi', description: 'Thưởng thức bánh tráng nướng, sữa đậu nành nóng hổi và dạo chợ đêm nhộn nhịp.' },
        { title: 'Dạo quanh Hồ Xuân Hương & Quảng trường Lâm Viên', description: 'Tận hưởng không khí se lạnh, ngắm hoa dã quỳ và nụ Atiso khổng lồ phát sáng.' },
        { title: 'Nghe nhạc acoustic hoặc cà phê ngắm thung lũng đèn', description: 'Thư giãn trong không gian âm nhạc acoustic hoặc ngắm thung lũng đèn Trại Mát lung linh huyền ảo.' },
        { title: 'Thưởng thức lẩu bò/gà lá é ấm nồng đêm lạnh', description: 'Tụ tập quây quần bên nồi lẩu nóng bốc khói giữa tiết trời cao nguyên.' }
      ];
      return options[dayIdx % options.length];
    }
    if (destinationLower.includes('huế') || destinationLower.includes('hue')) {
      const options = [
        { title: 'Đi thuyền rồng & Nghe ca Huế trên sông Hương', description: 'Thả hoa đăng cầu may và thưởng thức di sản nhã nhạc ca Huế sâu lắng.' },
        { title: 'Dạo Phố đi bộ Chu Văn An - Võ Thị Sáu sầm uất', description: 'Hòa mình vào không khí phố Tây sôi động của cố đô, thưởng thức bia và ẩm thực đường phố.' },
        { title: 'Ngắm cầu Trường Tiền đổi màu lung linh bên sông Hương', description: 'Tản bộ dọc công viên bờ sông Hương và chụp ảnh kỷ niệm cùng biểu tượng xứ Huế.' },
        { title: 'Thưởng thức chè hẻm 20 món trứ danh cố đô', description: 'Trải nghiệm thế giới chè Huế độc đáo từ chè hạt sen, đậu ngự đến chè heo quay.' }
      ];
      return options[dayIdx % options.length];
    }
    if (destinationLower.includes('nha trang')) {
      const options = [
        { title: 'Dạo bộ công viên bờ biển đường Trần Phú & Chợ đêm', description: 'Hóng gió biển mát rượi, mua sắm đồ lưu niệm và thưởng thức quà vặt ven biển.' },
        { title: 'Check-in Rooftop Bar ngắm toàn cảnh vịnh Nha Trang về đêm', description: 'Thưởng thức cocktail sành điệu và ngắm bờ vịnh Nha Trang lung linh từ trên cao.' },
        { title: 'Khám phá ẩm thực hải sản đêm Tháp Bà / Bờ Kè', description: 'Thưởng thức ốc chảo, nem nướng Ninh Hòa và các loại hải sản tươi sống.' },
        { title: 'Thư giãn nghe nhạc sống tại Sailing Club bãi biển', description: 'Ngồi sát mép sóng biển đêm nghe nhạc chill và tận hưởng kỳ nghỉ nhiệt đới.' }
      ];
      return options[dayIdx % options.length];
    }
    if (destinationLower.includes('hội an') || destinationLower.includes('hoi an')) {
      const options = [
        { title: 'Thả đèn hoa đăng sông Hoài & Dạo phố cổ lung linh đèn lồng', description: 'Chiêm ngưỡng vẻ đẹp cổ kính huyền ảo của phố Hội khi hàng ngàn lồng đèn rực sáng.' },
        { title: 'Xem show diễn Ký Ức Hội An hoặc hát Bài Chòi truyền thống', description: 'Hòa mình vào không gian văn hóa nghệ thuật dân gian độc đáo của miền Trung.' },
        { title: 'Khám phá Chợ đêm Nguyễn Hoàng & Ẩm thực đường phố', description: 'Thưởng thức cao lầu, mì Quảng, nước Mót và mua sắm đồ thủ công mỹ nghệ.' }
      ];
      return options[dayIdx % options.length];
    }
    if (destinationLower.includes('phú quốc') || destinationLower.includes('phu quoc')) {
      const options = [
        { title: 'Càn quét Chợ đêm Phú Quốc & Ẩm thực hải sản', description: 'Thưởng thức hải sản nướng mỡ hành, bánh khéo và kem cuộn Thái Lan sầm uất.' },
        { title: 'Khám phá thành phố không ngủ Grand World Phú Quốc', description: 'Xem show nhạc nước Tinh hoa Việt Nam và check-in Venice rực rỡ ánh đèn.' },
        { title: 'Chill bar bãi biển ngắm sóng đêm nghe nhạc acoustic', description: 'Nhâm nhi đồ uống mát lạnh chân chạm cát mịn nghe sóng vỗ êm đềm.' }
      ];
      return options[dayIdx % options.length];
    }
    if (destinationLower.includes('sa pa') || destinationLower.includes('sapa')) {
      const options = [
        { title: 'Dạo Quảng trường Nhà thờ Đá Sa Pa & Chợ đêm', description: 'Tận hưởng không khí sương mù se lạnh, xem văn nghệ vùng cao và mua đặc sản thổ cẩm.' },
        { title: 'Thưởng thức đồ nướng Sa Pa thơm lừng phố Cầu Mây', description: 'Ăn xiên nướng than hoa nghi ngút khói: bò cuộn nấm cải mèo, cơm lam, hạt dẻ nóng.' },
        { title: 'Thư giãn ngâm chân lá thuốc Dao đỏ truyền thống', description: 'Phục hồi thể lực sau ngày dài trekking trong bồn nước lá thảo dược ấm áp.' }
      ];
      return options[dayIdx % options.length];
    }
    if (destinationLower.includes('hạ long') || destinationLower.includes('ha long')) {
      const options = [
        { title: 'Dạo phố đi bộ Bãi Cháy & Chợ đêm Hạ Long', description: 'Mua sắm đặc sản chả mực, quà lưu niệm và hòa mình vào nhịp sống phố biển sôi động.' },
        { title: 'Ngắm cầu Bãi Cháy rực rỡ và vòng quay Mặt trời Sun Wheel', description: 'Chiêm ngưỡng toàn cảnh vịnh Hạ Long lung linh huyền ảo trong đêm từ cáp treo Nữ Hoàng.' },
        { title: 'Thưởng thức cà phê ngắm biển đường bao biển Trần Quốc Nghiễn', description: 'Tận hưởng làn gió vịnh trong lành và ngắm nhìn núi đá nhấp nhô trên biển đêm.' }
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

  const selectedAccommodation = (accommodations.length > 0 ? accommodations[0] : defaultPlaces.accommodation[0]) || defaultPlaces.accommodation[0];
  
  // Ước lượng chi phí phòng nghỉ hợp lý theo ngân sách (khoảng 30% ngân sách)
  const hotelCostPerNight = Math.min(
    Math.max(350000, Math.round((budget_total * 0.3) / Math.max(1, totalNights))),
    1800000
  );

  const days: ItineraryDay[] = weatherForecast.map((weather, index) => {
    const dayNumber = index + 1;
    const items: ItineraryItem[] = [];

    // 1. Chỗ nghỉ nhận phòng ngày 1 (BẮT BUỘC có cả cho chuyến đi 1 ngày)
    if (selectedAccommodation && index === 0) {
      const hotel = selectedAccommodation;
      const effectiveNights = Math.max(1, totalNights);
      const roomsCount = Math.max(1, Math.ceil(travelers / 2));
      items.push({
        item_type: 'accommodation',
        title: `Nhận phòng lưu trú tại ${hotel.name}`,
        description: `Chỗ nghỉ được đặt cố định cho toàn bộ chuyến đi (${effectiveNights} đêm, ${roomsCount} phòng). Đánh giá: ${hotel.rating}⭐. Địa chỉ: ${hotel.address}`,
        start_time: '14:00',
        end_time: '15:00',
        google_place_id: hotel.google_place_id,
        estimated_cost: hotelCostPerNight * effectiveNights * roomsCount,
        order_index: 0,
        lat: hotel.lat,
        lng: hotel.lng,
        address: hotel.address
      });
    }

    // 2. Điểm tâm sáng (07:30 - 08:30)
    const breakfast = getNextDining();
    items.push({
      item_type: 'dining',
      title: `Ăn sáng tại ${breakfast.name}`,
      description: `Thưởng thức điểm tâm sáng đặc sản địa phương nạp năng lượng cho hành trình. Địa chỉ: ${breakfast.address}`,
      start_time: '07:30',
      end_time: '08:30',
      google_place_id: breakfast.google_place_id,
      estimated_cost: 50000 * travelers,
      order_index: 1,
      lat: breakfast.lat,
      lng: breakfast.lng,
      address: breakfast.address
    });
    
    // 3. Di chuyển nội thành (08:30 - 09:00)
    items.push({
      item_type: 'transport',
      title: 'Di chuyển bằng xe máy / Taxi nội thành',
      description: 'Phương tiện di chuyển thuận tiện giữa các điểm tham quan.',
      start_time: '08:30',
      end_time: '09:00',
      estimated_cost: 60000 * travelers,
      order_index: 2
    });

    // 4. Tham quan buổi sáng (09:00 - 11:30)
    const site1 = getNextAttraction();
    const costSite1 = site1.price_level === 0 ? 0 : (site1.price_level === 1 ? 40000 : (site1.price_level === 2 ? 100000 : 250000));
    items.push({
      item_type: 'attraction',
      title: `Tham quan ${site1.name}`,
      description: `Khám phá vẻ đẹp lịch sử, văn hóa và chụp ảnh lưu niệm. Địa chỉ: ${site1.address}`,
      start_time: '09:00',
      end_time: '11:30',
      google_place_id: site1.google_place_id,
      estimated_cost: costSite1 * travelers,
      order_index: 3,
      lat: site1.lat,
      lng: site1.lng,
      address: site1.address
    });

    // 5. Ăn trưa đặc sản (12:00 - 13:30)
    const lunchRest = getNextDining();
    const lunchCost = lunchRest.price_level === 0 ? 60000 : (lunchRest.price_level === 1 ? 100000 : (lunchRest.price_level === 2 ? 180000 : 350000));
    items.push({
      item_type: 'dining',
      title: `Ăn trưa tại ${lunchRest.name}`,
      description: `Thưởng thức các món ngon trứ danh mang đậm hương vị bản địa. Đánh giá: ${lunchRest.rating}⭐. Địa chỉ: ${lunchRest.address}`,
      start_time: '12:00',
      end_time: '13:30',
      google_place_id: lunchRest.google_place_id,
      estimated_cost: lunchCost * travelers,
      order_index: 4,
      lat: lunchRest.lat,
      lng: lunchRest.lng,
      address: lunchRest.address
    });

    // 6. Trải nghiệm & Tham quan chiều (15:00 - 17:30)
    const site2 = getNextAttraction();
    const costSite2 = site2.price_level === 0 ? 0 : (site2.price_level === 1 ? 40000 : (site2.price_level === 2 ? 120000 : 250000));
    items.push({
      item_type: 'attraction',
      title: `Khám phá ${site2.name}`,
      description: `Tận hưởng không gian độc đáo, tìm hiểu câu chuyện bản địa và check-in. Địa chỉ: ${site2.address}`,
      start_time: '15:00',
      end_time: '17:30',
      google_place_id: site2.google_place_id,
      estimated_cost: costSite2 * travelers,
      order_index: 5,
      lat: site2.lat,
      lng: site2.lng,
      address: site2.address
    });

    // 7. Ăn tối ẩm thực đặc sắc (18:30 - 20:00)
    const dinnerRest = getNextDining();
    const dinnerCost = dinnerRest.price_level === 0 ? 80000 : (dinnerRest.price_level === 1 ? 150000 : (dinnerRest.price_level === 2 ? 250000 : 450000));
    items.push({
      item_type: 'dining',
      title: `Ăn tối tại ${dinnerRest.name}`,
      description: `Bữa tối ấm cúng cùng hải sản hoặc các món đặc sản địa phương. Đánh giá: ${dinnerRest.rating}⭐. Địa chỉ: ${dinnerRest.address}`,
      start_time: '18:30',
      end_time: '20:00',
      google_place_id: dinnerRest.google_place_id,
      estimated_cost: dinnerCost * travelers,
      order_index: 6,
      lat: dinnerRest.lat,
      lng: dinnerRest.lng,
      address: dinnerRest.address
    });

    // 8. Trải nghiệm buổi tối (20:30 - 22:00)
    const eve = getEveningExperience(index);
    items.push({
      item_type: 'experience',
      title: eve.title,
      description: eve.description,
      start_time: '20:30',
      end_time: '22:00',
      estimated_cost: 50000 * travelers,
      order_index: 7
    });

    return {
      day_number: dayNumber,
      date: weather.date,
      weather_note: `${weather.condition}, nhiệt độ từ ${weather.temp_min}°C - ${weather.temp_max}°C. Khả năng mưa: ${weather.rain_chance}%.`,
      items
    };
  });

  const estimated_total = calculateEstimatedTotal(days);
  const remaining = Math.max(0, budget_total - estimated_total);

  const itinerary: GeneratedItinerary = {
    days,
    budget_summary: {
      estimated_total,
      remaining
    },
    expert_advice: `Lịch trình du lịch ${tripData.destination_city || 'Việt Nam'} ${daysCount} ngày được thiết kế cân bằng giữa nghỉ dưỡng, khám phá văn hóa và ẩm thực địa phương. Chi phí lưu trú và ăn uống được tối ưu hóa trong giới hạn ngân sách ${budget_total.toLocaleString('vi-VN')} VNĐ.`,
    warning_notes: [
      'Nên chuẩn bị trang phục phù hợp với điều kiện thời tiết thực tế theo từng ngày.',
      'Đặt trước các dịch vụ chỗ nghỉ và vé tham quan vào dịp cuối tuần hoặc mùa cao điểm để có giá tốt nhất.'
    ],
    missing_info_questions: []
  };

  return enforceBudgetLimit(itinerary, budget_total, tripData);
}

// Programmatic mock disruption adaptation
function adaptMockItinerary(
  currentItinerary: GeneratedItinerary,
  disruptionType: string,
  disruptionDescription: string,
  _candidatePlaces: Record<string, PlaceCandidate[]>
): { itinerary: GeneratedItinerary; diff: string } {
  // Deep clone currentItinerary
  const newItinerary: GeneratedItinerary = JSON.parse(JSON.stringify(currentItinerary));
  let diffMessages: string[] = [];

  newItinerary.days.forEach(day => {
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
        model: AI_CONFIG.DEFAULT_MODEL,
        contents: `${systemPrompt}\n\nDữ liệu yêu cầu:\n${userPrompt}`,
        config: {
          responseMimeType: AI_CONFIG.RESPONSE_MIME_TYPE,
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
      placesToUse.forEach((place) => {
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
  weatherForecast?: WeatherForecast[],
  aiProviderOverride?: 'gemini' | 'custom_openai'
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
    const aiConfig = await getEffectiveAiConfig();
    const effectiveProvider = aiProviderOverride || aiConfig.provider;
    const isCustomGateway = (effectiveProvider === 'custom_openai') && Boolean(aiConfig.baseUrl && aiConfig.apiKey) && aiConfig.isActive;

    if (isCustomGateway) {
      try {
        const formattedMessages = [
          { role: 'system' as const, content: `${systemPrompt}\n\nIMPORTANT: Return ONLY a valid JSON object matching the responseSchema. No markdown ticks, strictly raw JSON.` },
          ...history.map(h => ({
            role: (h.role === 'model' ? 'assistant' : 'user') as 'assistant' | 'user',
            content: h.content
          })),
          { role: 'user' as const, content: message }
        ];

        const chatTokens = Math.max(aiConfig.maxTokens || 32768, 16384);
        const rawText = await callOpenAiCompatibleGateway({
          messages: formattedMessages,
          jsonMode: true,
          temperature: AI_CONFIG.DEFAULT_TEMPERATURE,
          maxTokens: chatTokens
        });
        let cleaned = rawText.trim();
        const firstBrace = cleaned.indexOf('{');
        const lastBrace = cleaned.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          cleaned = cleaned.substring(firstBrace, lastBrace + 1);
        } else {
          cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
        }
        let parsed: any;
        try {
          parsed = JSON.parse(cleaned);
        } catch (jsonErr) {
          console.warn('[chatWithItinerary] Custom Gateway returned non-JSON, fallback:', rawText);
          parsed = {
            responseText: rawText,
            hasChanges: false,
            isCreateTrip: false,
            createTripParams: null
          };
        }
        let diff = '';

        if (parsed.hasChanges && parsed.adaptedItinerary && currentItinerary && tripData) {
          const budgetTotal = Number(tripData.budget_total) || currentItinerary.budget_summary.estimated_total + currentItinerary.budget_summary.remaining;
          parsed.adaptedItinerary = enforceBudgetLimit(parsed.adaptedItinerary, budgetTotal, tripData);
          diff = generateItineraryDiff(currentItinerary, parsed.adaptedItinerary, 'other');
        }

        let normalizedCreateTripParams: any = undefined;
        if (parsed.isCreateTrip && (parsed.createTripParams || parsed.params)) {
          const p = parsed.createTripParams || parsed.params || {};
          const dest = p.destination_city || p.destination || p.city;
          const budget = Number(p.budget_total || p.budget) || 5000000;
          const count = Number(p.traveler_count || p.travelers || p.guests) || 1;
          normalizedCreateTripParams = {
            title: p.title || `Du lịch ${dest || 'Việt Nam'}`,
            destination_city: dest,
            start_date: p.start_date,
            end_date: p.end_date,
            budget_total: budget,
            traveler_count: count,
            traveler_type: p.traveler_type || (count === 2 ? 'couple' : count > 2 ? 'family' : 'solo'),
            special_requirements: p.special_requirements || ''
          };
        }

        const extractedResponseText = parsed.responseText || parsed.reply || parsed.message || (typeof parsed === 'string' ? parsed : rawText);

        return {
          responseText: extractedResponseText,
          hasChanges: Boolean(parsed.hasChanges),
          adaptedItinerary: parsed.adaptedItinerary,
          diff: diff || parsed.diff,
          isCreateTrip: Boolean(parsed.isCreateTrip),
          createTripParams: normalizedCreateTripParams || parsed.createTripParams
        };
      } catch (gatewayErr: any) {
        console.warn(`[chatWithItinerary] AI Gateway thất bại (${gatewayErr.message}), tự động chuyển sang Google Gemini!`);
        // Tự động chuyển xuống khối executeWithApiKeyRotation bên dưới
      }
    }

    return await executeWithApiKeyRotation(async (apiKey) => {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: AI_CONFIG.DEFAULT_MODEL,
        contents: contents,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: AI_CONFIG.RESPONSE_MIME_TYPE,
          responseSchema: responseSchema as any,
          temperature: AI_CONFIG.DEFAULT_TEMPERATURE
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

export interface GeneratedRichPlaceItem {
  id: string;
  name: string;
  category: 'dining' | 'cafe' | 'hotel' | 'attraction' | 'experience';
  suggested_day: number;
  lat: number;
  lng: number;
  address: string;
  estimated_cost: number;
  rating: number;
  time_slot_suggestion?: string;
  description: string;
  social_review_quote?: string;
  why_recommended?: string;
}

export interface GenerateRichPlacesPoolParams {
  destination_city: string;
  days_count: number;
  budget_total: number;
  traveler_count?: number;
  budget_breakdown?: {
    transport?: number;
    hotel?: number;
    dining?: number;
    cafe?: number;
    activity?: number;
  };
  preferences?: string[];
  traveler_type?: string;
  special_requirements?: string;
  ai_provider?: string;
  is_cart_mode?: boolean;
  num_places?: number;
}

function normalizePlaceKey(str: string): string {
  return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

function deduplicateRichPlaces(list: GeneratedRichPlaceItem[]): GeneratedRichPlaceItem[] {
  const result: GeneratedRichPlaceItem[] = [];
  const seenKeys: string[] = [];

  for (const item of list) {
    const key = normalizePlaceKey(item.name);
    if (!key || key.length < 2) continue;

    let isDuplicate = false;
    for (const existingKey of seenKeys) {
      if (key === existingKey) {
        isDuplicate = true;
        break;
      }
      // Trùng lặp bao hàm (ví dụ: 'thienvientruclamhotuyenlam' vs 'thienvientruclam')
      if (key.length >= 8 && existingKey.length >= 8 && (key.includes(existingKey) || existingKey.includes(key))) {
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      seenKeys.push(key);
      result.push(item);
    }
  }

  return result;
}

const richPlacesPoolCache = new Map<string, { data: { places: GeneratedRichPlaceItem[]; city_center: { lat: number; lng: number } }; expiry: number }>();

export async function generateRichPlacesPool(params: GenerateRichPlacesPoolParams): Promise<{
  places: GeneratedRichPlaceItem[];
  city_center: { lat: number; lng: number };
}> {
  const isCartMode = Boolean(params.is_cart_mode || (params.num_places && params.num_places > 20));
  const cityCoords = getCityCoordinates(params.destination_city);
  const daysCount = Math.max(1, Math.min(params.days_count || 2, 7));
  const totalBudget = Number(params.budget_total) || 5000000;
  const travelerCount = Math.max(1, Number(params.traveler_count) || 1);
  const budgetPerPerson = totalBudget / travelerCount;
  const isBudgetTight = budgetPerPerson < 8000000;
  const preferencesList = Array.isArray(params.preferences) ? params.preferences.join(', ') : (params.preferences || 'Khám phá, Ẩm thực');

  const cacheKey = `${params.destination_city.toLowerCase()}_${daysCount}_${Math.round(totalBudget / 1000000)}_${preferencesList}_${isCartMode ? 'cart' : 'standard'}_${isBudgetTight ? 'tight' : 'flex'}`;
  const cached = richPlacesPoolCache.get(cacheKey);
  if (cached && Date.now() < cached.expiry && cached.data.places.length >= (isCartMode ? 30 : 15)) {
    return cached.data;
  }

  const systemPrompt = `Bạn là Chuyên gia Thổ địa và Hướng dẫn viên Du lịch cao cấp tại Việt Nam.
Nhiệm vụ của bạn là sinh ra một BỂ KHO ĐỊA ĐIỂM GỢI Ý (Place Buffet) THỰC TẾ, CỰC KỲ ĐA DẠNG VÀ PHONG PHÚ tại "${params.destination_city}".

MỤC ĐÍCH:
- Đây là một "Bể kho địa điểm đa dạng" để du khách tự do khám phá và nhặt vào giỏ hàng theo ý thích riêng của họ.
- QUAN TRỌNG: Tổng chi phí của toàn bộ kho địa điểm KHÔNG BỊ GIỚI HẠN bởi ngân sách của chuyến đi! Hãy sinh ra nhiều địa điểm ở đa dạng phân khúc giá (từ quán ăn đường phố bình dân, cà phê cóc, quán ăn đặc sản bản địa cho đến nhà hàng view đẹp, điểm check-in nổi tiếng) để du khách có vô số lựa chọn. Ngân sách thực tế sẽ do du khách tự cân đối khi họ chọn món vào giỏ hàng.

THÔNG TIN THAM CHIẾU CỦA KHÁCH:
- Thành phố: "${params.destination_city}" (Tâm tọa độ tham chiếu: lat ${cityCoords.lat}, lng ${cityCoords.lng})
- Phong cách & Sở thích của khách: ${preferencesList}
- Kiểu đoàn đi: ${params.traveler_type || 'Nhóm bạn / Cá nhân'}
- Yêu cầu đặc thù: ${params.special_requirements || 'Không có'}

QUY TẮC BẮT BUỘC ĐỂ ĐẢM BẢO CHẤT LƯỢNG TUYỆT ĐỐI (KHÔNG ĐƯỢC SAI LỆCH):
1. ĐỘ CHÍNH XÁC VỀ ĐỊA ĐIỂM VÀ TỌA ĐỘ BẢN ĐỒ:
   - Mọi địa điểm phải là địa danh, quán ăn, quán cafe, khách sạn, điểm tham quan THẬT SỰ CÓ THẬT và đang hoạt động tại "${params.destination_city}".
   - Tọa độ (lat, lng) BẮT BUỘC PHẢI CHUẨN XÁC, nằm trong khu vực thành phố "${params.destination_city}" (trong bán kính 15km quanh tâm [${cityCoords.lat}, ${cityCoords.lng}]).
   - TUYỆT ĐỐI KHÔNG để tọa độ 0, không nhầm sang tỉnh khác, không để tọa độ rơi vào biển hoặc rừng rậm hoang vu!
   - Địa chỉ (address) phải đầy đủ rõ ràng: số nhà, tên đường, phường/xã, quận/huyện tại "${params.destination_city}" để du khách định vị chính xác và không bị đi lạc.

2. SỐ LƯỢNG & TÍNH ĐA DẠNG (BẮT BUỘC PHÂN BỔ ĐỦ CÁC DANH MỤC):
   - BẮT BUỘC sinh danh sách phong phú, phân bổ đầy đủ các danh mục:
     * Tham quan ("attraction"): 10 đến 15 địa điểm (di tích lịch sử, bảo tàng, danh thắng, phố đi bộ, chợ truyền thống).
     * Chỗ nghỉ ("hotel"): 3 đến 5 khách sạn / homestay phù hợp ngân sách.${isBudgetTight ? ' (LƯU Ý ĐẶC BIỆT: Ngân sách của khách dưới 8 triệu/người, TUYỆT ĐỐI KHÔNG chọn resort 5 sao xa xỉ, chỉ chọn khách sạn 2-3 sao hoặc homestay tiện nghi từ 350.000đ - 700.000đ/đêm).' : ''}
     * Ăn uống ("dining"): 15 đến 20 quán ăn (đặc sản địa phương nức tiếng, quán ăn vỉa hè nổi tiếng, bún phở chả truyền thống, ẩm thực đêm).
     * Cà phê / Trà ("cafe"): 10 đến 15 quán có view đẹp, không gian chill, check-in sống ảo, cà phê đặc sản bản địa.
   - TUYỆT ĐỐI KHÔNG TRÙNG LẶP bất kỳ địa điểm nào trong toàn bộ danh sách!

3. CHI PHÍ THỰC TẾ ("estimated_cost"):
   - Giá trị bằng số tiền Việt Nam Đồng (VND) thực tế của từng món/dịch vụ tại quán (ví dụ 35.000đ - 80.000đ cho quán ăn bình dân, 30.000đ - 60.000đ cho cà phê, vé tham quan 30.000đ - 100.000đ...).
   - Bổ sung trích dẫn đánh giá thực tế ("social_review_quote") ngắn gọn, súc tích từ cộng đồng du lịch hoặc review ẩm thực.
   - Ghi rõ lý do gợi ý ("why_recommended") làm nổi bật nét độc đáo của địa điểm.`;

  const responseSchema = {
    type: 'object',
    properties: {
      places: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Tên địa điểm thực tế' },
            category: {
              type: 'string',
              enum: ['dining', 'cafe', 'hotel', 'attraction', 'experience'],
              description: 'Danh mục'
            },
            suggested_day: { type: 'integer', description: 'Ngày gợi ý (từ 1 đến số ngày)' },
            lat: { type: 'number', description: 'Vĩ độ thực tế chính xác tại thành phố' },
            lng: { type: 'number', description: 'Kinh độ thực tế chính xác tại thành phố' },
            address: { type: 'string', description: 'Địa chỉ cụ thể rõ ràng' },
            estimated_cost: { type: 'number', description: 'Chi phí ước tính VND' },
            rating: { type: 'number', description: 'Đánh giá 4.0 - 5.0' },
            time_slot_suggestion: { type: 'string', description: 'Khung giờ gợi ý ví dụ 08:00 - 09:30' },
            description: { type: 'string', description: 'Mô tả ngắn gọn đặc sắc' },
            social_review_quote: { type: 'string', description: 'Review trích dẫn thực tế' },
            why_recommended: { type: 'string', description: 'Lý do phù hợp sở thích' }
          },
          required: ['name', 'category', 'suggested_day', 'lat', 'lng', 'address', 'estimated_cost', 'rating', 'description']
        }
      }
    },
    required: ['places']
  };

  const userPrompt = `Hãy sinh kho danh sách địa điểm du lịch thực tế phong phú, tọa độ và địa chỉ chuẩn xác tuyệt đối tại ${params.destination_city}, phù hợp sở thích: "${preferencesList}". BẮT BUỘC phân bổ đầy đủ các danh mục: tham quan (attraction: 10-15 địa điểm), chỗ nghỉ (hotel: 3-5 khách sạn/homestay), ẩm thực (dining: 15-20 quán ăn), quán café (cafe: 10-15 quán). ${isBudgetTight ? 'LƯU Ý: Ngân sách dưới 8 triệu/người, KHÔNG đề xuất resort 5 sao xa xỉ, chỉ đề xuất khách sạn 2-3 sao hoặc homestay hợp túi tiền.' : ''}`;

  try {
    const aiConfig = await getEffectiveAiConfig();
    const isCustomGateway = params.ai_provider === 'custom_openai' && Boolean(aiConfig.baseUrl && aiConfig.apiKey) && aiConfig.isActive;

    let rawPlaces: any[] = [];

    if (isCustomGateway) {
      try {
        const rawText = await callOpenAiCompatibleGateway({
          messages: [
            { role: 'system' as const, content: `${systemPrompt}\n\nIMPORTANT: Return ONLY a valid JSON object with a "places" array matching the requested schema. No markdown ticks, strictly raw JSON.` },
            { role: 'user' as const, content: userPrompt }
          ],
          jsonMode: true,
          temperature: 0.4,
          maxTokens: Math.max(aiConfig.maxTokens || 16384, 8192),
          timeout: 30000
        });
        let cleaned = rawText.trim();
        const firstBrace = cleaned.indexOf('{');
        const lastBrace = cleaned.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          cleaned = cleaned.substring(firstBrace, lastBrace + 1);
        }
        const parsed = JSON.parse(cleaned);
        if (parsed && Array.isArray(parsed.places) && parsed.places.length > 0) {
          rawPlaces = parsed.places;
        }
      } catch (err: any) {
        console.warn(`[generateRichPlacesPool] AI Gateway error (${err.message}), fallback to Google Gemini.`);
      }
    }

    if (rawPlaces.length === 0) {
      rawPlaces = await executeWithApiKeyRotation(async (apiKey) => {
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
          model: AI_CONFIG.DEFAULT_MODEL,
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          config: {
            systemInstruction: systemPrompt,
            responseMimeType: AI_CONFIG.RESPONSE_MIME_TYPE,
            responseSchema: responseSchema as any,
            temperature: 0.4,
            maxOutputTokens: 16384
          }
        });

        const text = response.text;
        if (!text) throw new Error('Gemini response is empty');
        const parsed = JSON.parse(text);
        return Array.isArray(parsed.places) ? parsed.places : [];
      });
    }

    // Format & chuẩn hóa tọa độ: Tận dụng trực tiếp tọa độ chuẩn do AI sinh ra, chỉ gọi geocodeOnline khi tọa độ rỗng/lệch xa
    const formattedPlaces: GeneratedRichPlaceItem[] = await Promise.all(
      rawPlaces.map(async (p, idx) => {
        let lat = Number(p.lat);
        let lng = Number(p.lng);
        let address = p.address || `${p.name}, ${params.destination_city}`;
        let matchedName = p.name || 'Địa điểm đề xuất';

        // Kiểm tra xem tọa độ AI trả về đã chuẩn xác trong bán kính khu vực thành phố chưa
        const isValidCoords = !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0 &&
          Math.sqrt(Math.pow(lat - cityCoords.lat, 2) + Math.pow(lng - cityCoords.lng, 2)) <= 0.25;

        // Chỉ khi thiếu tọa độ hoặc tọa độ bất thường mới cần chạy geocodeOnline
        if (!isValidCoords) {
          try {
            const geo = await geocodeOnline(p.name, p.address, params.destination_city);
            if (geo.found && geo.lat && geo.lng) {
              lat = geo.lat;
              lng = geo.lng;
              if (geo.address) address = geo.address;
            } else {
              // geocode thất bại → fallback về tâm thành phố thay vì giữ tọa độ AI sai
              lat = cityCoords.lat;
              lng = cityCoords.lng;
            }
          } catch (e) {
            // geocode lỗi → fallback về tâm thành phố
            lat = cityCoords.lat;
            lng = cityCoords.lng;
          }
        }

        return {
          id: `place_gen_${idx}_${Date.now()}`,
          name: matchedName,
          category: (p.category as any) || 'attraction',
          suggested_day: Math.max(1, Math.min(Number(p.suggested_day) || 1, daysCount)),
          lat,
          lng,
          address,
          estimated_cost: Number(p.estimated_cost) || 50000,
          rating: Number(p.rating) || 4.7,
          time_slot_suggestion: p.time_slot_suggestion || '08:30 - 10:30',
          description: p.description || '',
          social_review_quote: p.social_review_quote || '',
          why_recommended: p.why_recommended || ''
        };
      })
    );

    // Khử trùng lặp sơ bộ
    let uniquePlaces = deduplicateRichPlaces(formattedPlaces);

    // Lọc bỏ resort/5 sao/luxury khi ngân sách < 8tr/người
    if (isBudgetTight) {
      uniquePlaces = uniquePlaces.filter(p => {
        if (p.category === 'hotel') {
          const nameLower = p.name.toLowerCase();
          const isLuxury = nameLower.includes('resort') ||
            nameLower.includes('5 sao') ||
            nameLower.includes('5-star') ||
            nameLower.includes('luxury') ||
            nameLower.includes('intercontinental') ||
            nameLower.includes('furama') ||
            nameLower.includes('marriott') ||
            nameLower.includes('vinpearl resort') ||
            nameLower.includes('hyatt') ||
            nameLower.includes('sheraton') ||
            nameLower.includes('pullman') ||
            (p.estimated_cost && p.estimated_cost > 1200000);
          return !isLuxury;
        }
        return true;
      });
    }

    // Đảm bảo Live Map pool luôn có đủ số lượng theo danh mục:
    // attraction (10-15), hotel (3-5), dining (15-20), cafe (10-15)
    const defaultData = getDefaultPlacesForCity(params.destination_city);
    const defaultCafes = getDefaultCafesForCity(params.destination_city);

    const helperCandidateToRich = (c: PlaceCandidate, cat: 'dining' | 'cafe' | 'hotel' | 'attraction', idx: number): GeneratedRichPlaceItem => ({
      id: `place_fallback_${cat}_${idx}_${Date.now()}`,
      name: c.name,
      category: cat,
      suggested_day: (idx % daysCount) + 1,
      lat: c.lat || cityCoords.lat,
      lng: c.lng || cityCoords.lng,
      address: c.address || `${c.name}, ${params.destination_city}`,
      estimated_cost: cat === 'hotel' ? (c.price_level === 1 ? 350000 : 500000) : (c.price_level ? c.price_level * 50000 : 50000),
      rating: c.rating || 4.7,
      time_slot_suggestion: cat === 'dining' ? '12:00 - 13:00' : cat === 'cafe' ? '08:30 - 09:30' : cat === 'hotel' ? '14:00 - 15:00' : '09:30 - 11:30',
      description: c.name,
      social_review_quote: 'Địa điểm được nhiều du khách yêu thích và đánh giá cao.',
      why_recommended: 'Địa điểm đặc sắc tại thành phố'
    });

    // 1. Attractions (bù đủ ít nhất 10 địa điểm)
    const currentAttractions = uniquePlaces.filter(p => p.category === 'attraction');
    if (currentAttractions.length < 10) {
      for (let i = 0; i < defaultData.attraction.length; i++) {
        const c = defaultData.attraction[i];
        const key = normalizePlaceKey(c.name);
        if (!uniquePlaces.some(p => normalizePlaceKey(p.name) === key)) {
          uniquePlaces.push(helperCandidateToRich(c, 'attraction', i));
        }
      }
    }

    // 2. Hotel (bù đủ ít nhất 3 khách sạn)
    const currentHotels = uniquePlaces.filter(p => p.category === 'hotel');
    if (currentHotels.length < 3) {
      for (let i = 0; i < defaultData.accommodation.length; i++) {
        const c = defaultData.accommodation[i];
        if (isBudgetTight && (c.price_level && c.price_level >= 3)) continue;
        const key = normalizePlaceKey(c.name);
        if (!uniquePlaces.some(p => normalizePlaceKey(p.name) === key)) {
          uniquePlaces.push(helperCandidateToRich(c, 'hotel', i));
        }
      }
    }

    // 3. Dining (bù đủ ít nhất 15 quán ăn)
    const currentDining = uniquePlaces.filter(p => p.category === 'dining');
    if (currentDining.length < 15) {
      for (let i = 0; i < defaultData.dining.length; i++) {
        const c = defaultData.dining[i];
        const key = normalizePlaceKey(c.name);
        if (!uniquePlaces.some(p => normalizePlaceKey(p.name) === key)) {
          uniquePlaces.push(helperCandidateToRich(c, 'dining', i));
        }
      }
    }

    // 4. Cafe (bù đủ ít nhất 10 quán cà phê)
    const currentCafes = uniquePlaces.filter(p => p.category === 'cafe');
    if (currentCafes.length < 10) {
      for (let i = 0; i < defaultCafes.length; i++) {
        const c = defaultCafes[i];
        const key = normalizePlaceKey(c.name);
        if (!uniquePlaces.some(p => normalizePlaceKey(p.name) === key)) {
          uniquePlaces.push(helperCandidateToRich(c, 'cafe', i));
        }
      }
    }

    // Khử trùng lặp triệt để 100%
    const uniquePlacesFinal = deduplicateRichPlaces(uniquePlaces);

    const result = {
      places: uniquePlacesFinal,
      city_center: cityCoords
    };

    // Cache trong 15 phút
    richPlacesPoolCache.set(cacheKey, {
      data: result,
      expiry: Date.now() + 15 * 60 * 1000
    });

    return result;
  } catch (error: any) {
    console.error('Error in generateRichPlacesPool:', error.message);
    throw error;
  }
}
