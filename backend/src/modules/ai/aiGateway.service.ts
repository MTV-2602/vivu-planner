import axios from 'axios';
import { supabaseAdmin, isDbMocked } from '../../config/supabase';
import { AI_CONFIG } from '../../constants';

export interface AiGatewayConfig {
  provider: 'gemini' | 'custom_openai';
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  isActive: boolean;
  maxTokens?: number;
  geminiMaxTokens?: number;
}

// Memory cache để giảm tải truy vấn DB liên tục
let cachedConfig: AiGatewayConfig | null = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 15_000; // 15 giây

/**
 * Lấy cấu hình AI hiệu lực (Ưu tiên Database > Biến môi trường .env > Mặc định Gemini)
 */
export async function getEffectiveAiConfig(): Promise<AiGatewayConfig> {
  const now = Date.now();
  if (cachedConfig && now - lastCacheTime < CACHE_TTL_MS) {
    return cachedConfig;
  }

  // 1. Kiểm tra cấu hình trong Database
  if (!isDbMocked) {
    try {
      const { data, error } = await supabaseAdmin
        .from('gemini_api_keys')
        .select('*')
        .eq('notes', 'ai_gateway_config')
        .limit(1)
        .maybeSingle();

      if (!error && data && data.key_value) {
        try {
          const dbConfig = JSON.parse(data.key_value) as AiGatewayConfig;
          cachedConfig = {
            provider: dbConfig.provider || 'gemini',
            baseUrl: dbConfig.baseUrl || process.env.CUSTOM_AI_BASE_URL || '',
            apiKey: dbConfig.apiKey || process.env.CUSTOM_AI_API_KEY || '',
            model: dbConfig.model || process.env.CUSTOM_AI_MODEL || 'ag/gemini-3.8-flash',
            isActive: dbConfig.isActive ?? data.is_active ?? false,
            maxTokens: dbConfig.maxTokens || Number(process.env.CUSTOM_AI_MAX_TOKENS) || 65536,
            geminiMaxTokens: dbConfig.geminiMaxTokens || Number(process.env.GEMINI_MAX_TOKENS) || 32768
          };
          lastCacheTime = now;
          return cachedConfig;
        } catch (parseErr) {
          console.error('[AiGateway] Failed to parse DB config:', parseErr);
        }
      }
    } catch (err: any) {
      console.warn('[AiGateway] Error fetching AI config from DB:', err.message);
    }
  }

  // 2. Fallback sang biến môi trường .env (Vercel / Local)
  const envProvider = (process.env.AI_PROVIDER as any) === 'custom_openai' ? 'custom_openai' : 'gemini';
  const envBaseUrl = process.env.CUSTOM_AI_BASE_URL || '';
  const envApiKey = process.env.CUSTOM_AI_API_KEY || '';
  const envModel = process.env.CUSTOM_AI_MODEL || 'ag/gemini-3-flash';
  const envMaxTokens = Number(process.env.CUSTOM_AI_MAX_TOKENS) || 65536;
  const envGeminiMaxTokens = Number(process.env.GEMINI_MAX_TOKENS) || 32768;

  cachedConfig = {
    provider: envProvider,
    baseUrl: envBaseUrl,
    apiKey: envApiKey,
    model: envModel,
    isActive: envProvider === 'custom_openai' && !!envApiKey,
    maxTokens: envMaxTokens,
    geminiMaxTokens: envGeminiMaxTokens
  };
  lastCacheTime = now;
  return cachedConfig;
}

/**
 * Lưu cấu hình AI Gateway vào Database
 */
export async function saveAiGatewayConfig(config: AiGatewayConfig): Promise<void> {
  cachedConfig = null; // Clear cache
  lastCacheTime = 0;

  if (isDbMocked) {
    cachedConfig = config;
    return;
  }

  const payload = {
    provider: config.provider,
    baseUrl: config.baseUrl?.trim(),
    apiKey: config.apiKey?.trim(),
    model: config.model?.trim() || 'ag/gemini-3-flash',
    isActive: config.isActive,
    maxTokens: config.maxTokens ? Number(config.maxTokens) : 65536,
    geminiMaxTokens: config.geminiMaxTokens ? Number(config.geminiMaxTokens) : 32768
  };

  const jsonString = JSON.stringify(payload);

  const { data: existing } = await supabaseAdmin
    .from('gemini_api_keys')
    .select('id')
    .eq('notes', 'ai_gateway_config')
    .maybeSingle();

  if (existing) {
    await supabaseAdmin
      .from('gemini_api_keys')
      .update({
        key_value: jsonString,
        is_active: config.isActive,
        status: config.isActive ? 'active' : 'inactive',
        last_used_at: new Date().toISOString()
      })
      .eq('id', existing.id);
  } else {
    await supabaseAdmin
      .from('gemini_api_keys')
      .insert({
        notes: 'ai_gateway_config',
        key_value: jsonString,
        is_active: config.isActive,
        status: config.isActive ? 'active' : 'inactive'
      });
  }
}

/**
 * Trích xuất nội dung từ phản hồi của Gateway (Hỗ trợ cả standard JSON lẫn SSE streaming chunks)
 */
function extractContentFromGatewayResponse(responseData: any): string {
  if (!responseData) return '';

  // 1. Phản hồi chuẩn OpenAI JSON: { choices: [{ message: { content: "..." } }] }
  if (responseData.choices && Array.isArray(responseData.choices) && responseData.choices.length > 0) {
    const msgContent = responseData.choices[0]?.message?.content;
    if (typeof msgContent === 'string' && msgContent.trim()) {
      return msgContent;
    }
    const deltaContent = responseData.choices[0]?.delta?.content;
    if (typeof deltaContent === 'string' && deltaContent.trim()) {
      return deltaContent;
    }
  }

  // 2. Phản hồi dạng String (SSE Stream Chunks: "data: {...}\n\ndata: {...}")
  if (typeof responseData === 'string') {
    const trimmed = responseData.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed);
        return extractContentFromGatewayResponse(parsed);
      } catch (e) {}
    }

    if (trimmed.includes('data:')) {
      let accumulated = '';
      const lines = trimmed.split('\n');
      for (const line of lines) {
        const cleanLine = line.trim();
        if (!cleanLine.startsWith('data:')) continue;
        const jsonPart = cleanLine.substring(5).trim();
        if (jsonPart === '[DONE]') continue;
        try {
          const chunk = JSON.parse(jsonPart);
          const delta = chunk.choices?.[0]?.delta?.content || chunk.choices?.[0]?.message?.content || '';
          accumulated += delta;
        } catch (e) {}
      }
      if (accumulated.trim()) {
        return accumulated;
      }
    }

    return trimmed;
  }

  return '';
}

/**
 * Kiểm tra kết nối nhanh (Ping Test) đến API Gateway bên thứ 3 kèm tự động fallback model
 */
export async function testAiGatewayConnection(params: { baseUrl: string; apiKey: string; model: string }) {
  const cleanBaseUrl = params.baseUrl.trim().replace(/\/+$/, '');
  const url = `${cleanBaseUrl}/chat/completions`;

  const requestedModel = params.model?.trim() || 'ag/gemini-3.8-flash';
  const startTime = Date.now();

  try {
    const response = await axios.post(
      url,
      {
        model: requestedModel,
        messages: [
          { role: 'user', content: 'Ping test. Vui lòng trả lời "OK".' }
        ],
        max_tokens: 50,
        temperature: 0.1,
        stream: false
      },
      {
        headers: {
          'Authorization': `Bearer ${params.apiKey.trim()}`,
          'Content-Type': 'application/json'
        },
        timeout: 45000
      }
    );

    const durationMs = Date.now() - startTime;
    const replyContent = extractContentFromGatewayResponse(response.data) || 'OK';
    const actualModel = response.data?.model || requestedModel;

    return {
      success: true,
      durationMs,
      reply: replyContent,
      modelUsed: actualModel
    };
  } catch (err: any) {
    const status = err.response?.status;
    const errMsg = err.response?.data?.error?.message || err.response?.data || err.message;
    const message = status === 503 
      ? `Model "${requestedModel}" trên máy chủ AI Gateway đang bị quá tải (Mã lỗi 503).`
      : `Kiểm tra kết nối thất bại (${status || 'timeout'}): ${errMsg}`;
    const pingErr: any = new Error(message);
    pingErr.status = status || 500;
    throw pingErr;
  }
}

/**
 * Gọi OpenAI-Compatible API Gateway để sinh nội dung với cơ chế tự động Fallback model khi máy chủ 503
 */
export async function callOpenAiCompatibleGateway(options: {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  jsonMode?: boolean;
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  const config = await getEffectiveAiConfig();
  if (!config.baseUrl || !config.apiKey) {
    throw new Error('Chưa cấu hình Base URL hoặc API Key cho AI Gateway bên thứ 3');
  }

  const cleanBaseUrl = config.baseUrl.trim().replace(/\/+$/, '');
  const url = `${cleanBaseUrl}/chat/completions`;

  const targetModel = config.model?.trim() || 'ag/gemini-3.8-flash';
  const MAX_RETRIES = 2;
  let lastError: any = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        const delayMs = attempt * 2500;
        console.log(`[AiGateway] Thử lại lần ${attempt}/${MAX_RETRIES} sau ${delayMs}ms cho model: ${targetModel}...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }

      const payload: any = {
        model: targetModel,
        messages: options.messages,
        temperature: options.temperature ?? AI_CONFIG.DEFAULT_TEMPERATURE,
        stream: false
      };

      if (options.jsonMode) {
        payload.response_format = { type: 'json_object' };
      }

      if (options.maxTokens) {
        payload.max_tokens = options.maxTokens;
      }

      const response = await axios.post(url, payload, {
        headers: {
          'Authorization': `Bearer ${config.apiKey.trim()}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000 // 60s
      });

      const content = extractContentFromGatewayResponse(response.data);
      if (content) {
        return content;
      }
      throw new Error('Máy chủ AI Gateway trả về phản hồi rỗng');
    } catch (err: any) {
      lastError = err;
      const status = err.response?.status;
      const errDetail = err.response?.data?.error?.message || err.response?.data || err.message;
      console.warn(`[AiGateway] Model "${targetModel}" gặp lỗi (Lần ${attempt + 1}/${MAX_RETRIES + 1}): Status ${status || 'timeout'} - ${errDetail}`);

      // Nếu lỗi 401/403/400 thì không retry vô ích
      if (status === 401 || status === 403 || status === 400) {
        break;
      }
    }
  }

  const finalStatus = lastError?.response?.status;
  const detailMsg = lastError?.response?.data?.error?.message || lastError?.message || '';
  const userMessage = finalStatus === 503
    ? `Máy chủ AI Gateway (${targetModel}) hiện đang quá tải (Mã lỗi 503). Vui lòng thử lại sau ít phút.`
    : (finalStatus === 429
      ? `Model AI Gateway (${targetModel}) đã vượt quá giới hạn tần suất (Rate Limit 429). Vui lòng thử lại sau.`
      : `Không thể kết nối đến máy chủ AI (${targetModel}): ${detailMsg}`);

  const appError: any = new Error(userMessage);
  appError.status = finalStatus || 503;
  appError.code = finalStatus === 503 ? 'AI_OVERLOADED' : (finalStatus === 429 ? 'AI_RATE_LIMIT' : 'AI_GATEWAY_ERROR');
  appError.originalError = lastError;
  throw appError;
}
