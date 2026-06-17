import { supabaseAdmin, isDbMocked } from './supabaseAdmin';

const PRE_SEEDED_KEYS: string[] = [];

let fallbackIndex = 0;

export async function getNextGeminiApiKey(): Promise<string> {
  if (isDbMocked) {
    const key = PRE_SEEDED_KEYS[fallbackIndex];
    fallbackIndex = (fallbackIndex + 1) % PRE_SEEDED_KEYS.length;
    return key || process.env.GEMINI_API_KEY || '';
  }

  try {
    // Fetch active keys from database ordered by last_used_at ascending
    const { data: keys, error } = await supabaseAdmin
      .from('gemini_api_keys')
      .select('*')
      .eq('is_active', true)
      .eq('status', 'active')
      .order('last_used_at', { ascending: true, nullsFirst: true });

    if (error || !keys || keys.length === 0) {
      console.warn('[KeyManager] No active keys found in database. Using environment variable or fallback.');
      
      const envKey = process.env.GEMINI_API_KEY;
      if (envKey) return envKey;

      const key = PRE_SEEDED_KEYS[fallbackIndex];
      fallbackIndex = (fallbackIndex + 1) % PRE_SEEDED_KEYS.length;
      return key || '';
    }

    const selectedKeyRecord = keys[0];
    
    // Update last_used_at
    await supabaseAdmin
      .from('gemini_api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', selectedKeyRecord.id);

    return selectedKeyRecord.key_value;
  } catch (err) {
    console.error('[KeyManager] Error selecting API key:', err);
    return process.env.GEMINI_API_KEY || '';
  }
}

export async function reportKeyError(keyValue: string, errorType: 'rate_limited' | 'invalid'): Promise<void> {
  if (isDbMocked) return;

  try {
    await supabaseAdmin
      .from('gemini_api_keys')
      .update({ 
        status: errorType,
        is_active: errorType !== 'invalid'
      })
      .eq('key_value', keyValue);
      
    console.log(`[KeyManager] Key ${keyValue.substring(0, 10)}... reported as ${errorType}.`);
  } catch (err) {
    console.error('[KeyManager] Failed to report key error:', err);
  }
}

export async function executeWithApiKeyRotation<T>(
  fn: (apiKey: string) => Promise<T>
): Promise<T> {
  let attempts = 0;
  const maxAttempts = 3;
  let lastError: any = null;

  while (attempts < maxAttempts) {
    const apiKey = await getNextGeminiApiKey();
    try {
      return await fn(apiKey);
    } catch (error: any) {
      attempts++;
      lastError = error;
      console.warn(`[KeyManager] Attempt ${attempts} failed with key ${apiKey.substring(0, 8)}... Error: ${error.message}`);
      
      const msg = error.message?.toLowerCase() || '';
      if (msg.includes('api key not valid') || msg.includes('invalid') || msg.includes('400')) {
        await reportKeyError(apiKey, 'invalid');
      } else if (msg.includes('quota') || msg.includes('rate limit') || msg.includes('exhausted') || msg.includes('429')) {
        await reportKeyError(apiKey, 'rate_limited');
      }
    }
  }
  throw lastError || new Error('All API key attempts failed');
}
