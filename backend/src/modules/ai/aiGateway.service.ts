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
            model: dbConfig.model || process.env.CUSTOM_AI_MODEL || 'gemini-3.8-flash-high',
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
  const envModel = process.env.CUSTOM_AI_MODEL || 'gemini-3.8-flash-high';
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
    model: config.model?.trim() || 'gemini-3.8-flash-high',
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
 * Kiểm tra kết nối nhanh (Ping Test) đến API Gateway bên thứ 3
 */
export async function testAiGatewayConnection(params: { baseUrl: string; apiKey: string; model: string }) {
  const cleanBaseUrl = params.baseUrl.trim().replace(/\/+$/, '');
  const url = `${cleanBaseUrl}/chat/completions`;

  const startTime = Date.now();
  const response = await axios.post(
    url,
    {
      model: params.model.trim() || 'gemini-3.8-flash-high',
      messages: [
        { role: 'user', content: 'Xin chào! Kiểm tra kết nối API Gateway ViVu Planner.' }
      ],
      temperature: 0.2
    },
    {
      headers: {
        'Authorization': `Bearer ${params.apiKey.trim()}`,
        'Content-Type': 'application/json'
      },
      timeout: 20000 // 20s
    }
  );

  const durationMs = Date.now() - startTime;
  const replyContent = response.data?.choices?.[0]?.message?.content || 'Không có nội dung trả về';

  return {
    success: true,
    durationMs,
    reply: replyContent,
    modelUsed: response.data?.model || params.model
  };
}

/**
 * Gọi OpenAI-Compatible API Gateway để sinh nội dung
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

  const payload: any = {
    model: config.model || 'gemini-3.8-flash-high',
    messages: options.messages,
    temperature: options.temperature ?? AI_CONFIG.DEFAULT_TEMPERATURE
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
    timeout: 120000 // 120s
  });

  const content = response.data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('AI Gateway bên thứ 3 không trả về nội dung hợp lệ');
  }

  return content;
}
