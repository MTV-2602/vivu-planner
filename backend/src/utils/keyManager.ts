import { supabaseAdmin, isDbMocked } from '../config/supabase';
import { ApiKeyStatus, KEY_COOLDOWN_CONFIG } from '../constants';

const PRE_SEEDED_KEYS: string[] = [];

let fallbackIndex = 0;

export async function getNextGeminiApiKey(): Promise<string> {
  if (isDbMocked) {
    if (PRE_SEEDED_KEYS.length > 0) {
      const key = PRE_SEEDED_KEYS[fallbackIndex];
      fallbackIndex = (fallbackIndex + 1) % PRE_SEEDED_KEYS.length;
      return key;
    }
    return process.env.GEMINI_API_KEY || '';
  }

  try {
    // 0. Cool down and reactivate rate_limited keys (after 3 minutes) and invalid keys (after 15 minutes) automatically
    const threeMinutesAgo = new Date(Date.now() - KEY_COOLDOWN_CONFIG.RATE_LIMITED_MS).toISOString();
    const fifteenMinutesAgo = new Date(Date.now() - KEY_COOLDOWN_CONFIG.INVALID_MS).toISOString();

    Promise.all([
      supabaseAdmin
        .from('gemini_api_keys')
        .update({ status: ApiKeyStatus.ACTIVE, is_active: true })
        .eq('status', ApiKeyStatus.RATE_LIMITED)
        .lt('last_used_at', threeMinutesAgo),
      supabaseAdmin
        .from('gemini_api_keys')
        .update({ status: ApiKeyStatus.ACTIVE, is_active: true })
        .eq('status', ApiKeyStatus.INVALID)
        .lt('last_used_at', fifteenMinutesAgo)
    ]).catch(err => console.error('[KeyManager] Failed to auto cool down keys:', err.message));

    // Fetch active keys from database ordered by last_used_at ascending
    let { data: keys, error } = await supabaseAdmin
      .from('gemini_api_keys')
      .select('*')
      .eq('is_active', true)
      .eq('status', ApiKeyStatus.ACTIVE)
      .order('last_used_at', { ascending: true, nullsFirst: true });

    if ((error || !keys || keys.length === 0) && !isDbMocked) {
      console.log('[KeyManager] No active keys found in database. Attempting to reactivate keys...');
      try {
        await supabaseAdmin
          .from('gemini_api_keys')
          .update({ is_active: true, status: ApiKeyStatus.ACTIVE })
          .neq('key_value', ''); // reactivate all keys
        
        const retryResult = await supabaseAdmin
          .from('gemini_api_keys')
          .select('*')
          .eq('is_active', true)
          .eq('status', ApiKeyStatus.ACTIVE)
          .order('last_used_at', { ascending: true, nullsFirst: true });
        
        if (retryResult.data && retryResult.data.length > 0) {
          keys = retryResult.data;
          error = null;
          console.log(`[KeyManager] Reactivated ${keys.length} keys successfully.`);
        }
      } catch (reactivateErr: any) {
        console.error('[KeyManager] Failed to auto-reactivate keys:', reactivateErr.message);
      }
    }

    if (error || !keys || keys.length === 0) {
      console.warn('[KeyManager] No active keys found after reactivation attempt. Using environment variable or fallback.');
      
      const envKey = process.env.GEMINI_API_KEY;
      if (envKey) return envKey;

      if (PRE_SEEDED_KEYS.length > 0) {
        const key = PRE_SEEDED_KEYS[fallbackIndex];
        fallbackIndex = (fallbackIndex + 1) % PRE_SEEDED_KEYS.length;
        return key;
      }
      return '';
    }

    const selectedKeyRecord = keys[0];
    
    // Update last_used_at and increment usage_count
    supabaseAdmin
      .from('gemini_api_keys')
      .update({ 
        last_used_at: new Date().toISOString(),
        usage_count: (selectedKeyRecord.usage_count || 0) + 1
      })
      .eq('id', selectedKeyRecord.id)
      .then(({ error }) => {
        if (error) console.error('[KeyManager] Failed to update key usage log:', error.message);
      });

    return selectedKeyRecord.key_value;
  } catch (err) {
    console.error('[KeyManager] Error selecting API key:', err);
    return process.env.GEMINI_API_KEY || '';
  }
}

export async function reportKeyError(keyValue: string, errorType: ApiKeyStatus.RATE_LIMITED | ApiKeyStatus.INVALID): Promise<void> {
  if (isDbMocked) return;

  try {
    await supabaseAdmin
      .from('gemini_api_keys')
      .update({ 
        status: errorType,
        is_active: errorType !== ApiKeyStatus.INVALID
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
        await reportKeyError(apiKey, ApiKeyStatus.INVALID);
      } else if (msg.includes('quota') || msg.includes('rate limit') || msg.includes('exhausted') || msg.includes('429')) {
        await reportKeyError(apiKey, ApiKeyStatus.RATE_LIMITED);
      }
    }
  }
  throw lastError || new Error('All API key attempts failed');
}
