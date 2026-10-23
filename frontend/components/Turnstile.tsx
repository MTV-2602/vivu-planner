import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { View, Text, ActivityIndicator, Pressable, Platform } from 'react-native';
import { AlertCircle, ShieldCheck, CheckCircle2 } from 'lucide-react-native';
import { BRAND_COLORS } from '../constants';

let WebView: any = null;
if (Platform.OS !== 'web') {
  try {
    WebView = require('react-native-webview').WebView;
  } catch (e) {
    console.warn('Cannot load react-native-webview in Turnstile:', e);
  }
}

export interface TurnstileRef {
  reset: () => void;
  remove: () => void;
}

export interface TurnstileProps {
  siteKey?: string;
  action?: string;
  onSuccess: (token: string) => void;
  onError?: (error?: string) => void;
  onExpire?: () => void;
  theme?: 'light' | 'dark' | 'auto';
  size?: 'normal' | 'flexible' | 'compact';
}

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement | string,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          'expired-callback'?: () => void;
          'error-callback'?: (errorCode: any) => void;
          theme?: 'light' | 'dark' | 'auto';
          size?: 'normal' | 'flexible' | 'compact';
          action?: string;
        }
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
      getResponse: (widgetId?: string) => string;
    };
  }
}

/**
 * Lấy Cloudflare Turnstile Site Key từ biến môi trường
 * Hỗ trợ cả EXPO_PUBLIC_TURNSTILE_SITE_KEY (Expo mặc định) và VITE_TURNSTILE_SITE_KEY
 */
export function getTurnstileSiteKey(): string {
  if (typeof process !== 'undefined' && process.env) {
    return (
      process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY ||
      process.env.VITE_TURNSTILE_SITE_KEY ||
      '0x4AAAAAAFTw7hrMgVa79FF0'
    );
  }
  return '0x4AAAAAAFTw7hrMgVa79FF0';
}

/**
 * Kiểm tra trạng thái cho phép submit form đăng ký / đăng nhập theo nguyên tắc Fail-Closed
 * Khi cấu hình CAPTCHA, Supabase bảo vệ cả signUp và signInWithPassword
 */
export function isSignupSubmissionAllowed(params: {
  isSignUp: boolean;
  siteKey: string;
  captchaToken: string | null;
  loading: boolean;
  googleLoading: boolean;
  platform?: string;
}): { allowed: boolean; reason?: 'missing_key' | 'missing_token' | 'busy' | 'native_unsupported' } {
  const { isSignUp, siteKey, captchaToken, loading, googleLoading } = params;

  if (loading || googleLoading) {
    return { allowed: false, reason: 'busy' };
  }

  // Chế độ đăng nhập (isSignUp = false):
  if (!isSignUp) {
    // Nếu KHÔNG cấu hình site key: Giữ nguyên luồng đăng nhập hiện tại không yêu cầu CAPTCHA
    if (!siteKey || siteKey.trim() === '') {
      return { allowed: true };
    }
    // Nếu CÓ cấu hình site key: Server Supabase bảo vệ cả sign-in nên yêu cầu CAPTCHA
    if (!captchaToken || captchaToken.trim() === '') {
      return { allowed: false, reason: 'missing_token' };
    }
    return { allowed: true };
  }

  // Chế độ đăng ký: Fail-Closed nếu thiếu site key
  if (!siteKey || siteKey.trim() === '') {
    return { allowed: false, reason: 'missing_key' };
  }

  // Chế độ đăng ký: Fail-Closed nếu chưa có token hoặc token rỗng/hết hạn
  if (!captchaToken || captchaToken.trim() === '') {
    return { allowed: false, reason: 'missing_token' };
  }

  return { allowed: true };
}

export const isAuthSubmissionAllowed = isSignupSubmissionAllowed;

/**
 * Tạo payload options gửi sang Supabase auth.signInWithPassword kèm captchaToken
 */
export function buildSupabaseSignInOptions(params: {
  captchaToken?: string | null;
}): { captchaToken?: string } | undefined {
  if (params.captchaToken && params.captchaToken.trim() !== '') {
    return {
      captchaToken: params.captchaToken.trim(),
    };
  }
  return undefined;
}

/**
 * Tạo payload options gửi sang Supabase auth.signUp kèm captchaToken
 */
export function buildSupabaseSignUpOptions(params: {
  fullName: string;
  captchaToken?: string | null;
}): {
  data: { full_name: string };
  captchaToken?: string;
} {
  const options: {
    data: { full_name: string };
    captchaToken?: string;
  } = {
    data: { full_name: params.fullName },
  };

  if (params.captchaToken && params.captchaToken.trim() !== '') {
    options.captchaToken = params.captchaToken.trim();
  }

  return options;
}

export const SCRIPT_ID = 'cf-turnstile-script';
export const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

export function removeTurnstileScript(): void {
  if (typeof document === 'undefined') return;
  const existing = document.getElementById(SCRIPT_ID);
  if (existing) {
    if (existing.parentNode) {
      existing.parentNode.removeChild(existing);
    } else if (typeof existing.remove === 'function') {
      existing.remove();
    }
  }
}

export function loadTurnstileScript(
  onLoad: () => void,
  onError: (err: any) => void
): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {};
  }

  if (window.turnstile) {
    onLoad();
    return () => {};
  }

  let active = true;
  let pollInterval: ReturnType<typeof setInterval> | null = null;

  // Xóa script cũ bị lỗi nếu có từ lần thử trước đó để đảm bảo request mới được gửi đi khi retry
  removeTurnstileScript();

  const script = document.createElement('script');
  script.id = SCRIPT_ID;
  script.src = SCRIPT_SRC;
  script.async = true;
  script.defer = true;

  const cleanupListenersAndTimers = () => {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
    script.removeEventListener('load', handleLoad);
    script.removeEventListener('error', handleError);
  };

  const handleLoad = () => {
    if (!active) return;
    if (window.turnstile) {
      cleanupListenersAndTimers();
      onLoad();
      return;
    }

    let attempts = 0;
    pollInterval = setInterval(() => {
      if (!active) {
        cleanupListenersAndTimers();
        return;
      }
      if (window.turnstile) {
        cleanupListenersAndTimers();
        onLoad();
      } else if (++attempts > 30) {
        cleanupListenersAndTimers();
        removeTurnstileScript();
        if (active) {
          onError(new Error('Turnstile API failed to initialize'));
        }
      }
    }, 50);
  };

  const handleError = (e: any) => {
    cleanupListenersAndTimers();
    removeTurnstileScript();
    if (active) {
      onError(e);
    }
  };

  script.addEventListener('load', handleLoad);
  script.addEventListener('error', handleError);
  document.head.appendChild(script);

  return () => {
    active = false;
    cleanupListenersAndTimers();
  };
}

const Turnstile = forwardRef<TurnstileRef, TurnstileProps>(
  (
    {
      siteKey: propSiteKey,
      action,
      onSuccess,
      onError,
      onExpire,
      theme = 'light',
      size = 'normal',
    },
    ref
  ) => {
    const siteKey = propSiteKey || getTurnstileSiteKey();
    const containerRef = useRef<HTMLDivElement | null>(null);
    const widgetIdRef = useRef<string | null>(null);
    const webViewRef = useRef<any>(null);
    const [isVerified, setIsVerified] = useState(false);
    const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error' | 'missing_key'>(
      !siteKey ? 'missing_key' : 'loading'
    );
    const [errorMessage, setErrorMessage] = useState<string>('');
    const [retryCount, setRetryCount] = useState(0);

    useImperativeHandle(ref, () => ({
      reset: () => {
        setIsVerified(false);
        if (Platform.OS !== 'web') {
          webViewRef.current?.reload();
        } else if (widgetIdRef.current && typeof window !== 'undefined' && window.turnstile) {
          try {
            window.turnstile.reset(widgetIdRef.current);
          } catch {}
        }
        onExpire?.();
      },
      remove: () => {
        setIsVerified(false);
        if (widgetIdRef.current && typeof window !== 'undefined' && window.turnstile) {
          try {
            window.turnstile.remove(widgetIdRef.current);
          } catch {}
          widgetIdRef.current = null;
        }
        onExpire?.();
      },
    }));

    useEffect(() => {
      if (!siteKey) {
        setStatus('missing_key');
        onError?.('missing_key');
        return;
      }

      if (Platform.OS !== 'web') {
        setStatus('ready');
        return;
      }

      setStatus('loading');
      setErrorMessage('');

      let cleanupScriptListener: (() => void) | null = null;
      let isSubscribed = true;

      const renderWidget = () => {
        if (!isSubscribed || !containerRef.current || !window.turnstile) return;

        try {
          if (widgetIdRef.current) {
            try {
              window.turnstile.remove(widgetIdRef.current);
            } catch {}
            widgetIdRef.current = null;
          }

          containerRef.current.innerHTML = '';

          const id = window.turnstile.render(containerRef.current, {
            sitekey: siteKey,
            action,
            callback: (token: string) => {
              if (isSubscribed) {
                setIsVerified(true);
                setStatus('ready');
                onSuccess(token);
              }
            },
            'expired-callback': () => {
              if (isSubscribed) {
                setIsVerified(false);
                onExpire?.();
              }
            },
            'error-callback': (err: any) => {
              if (isSubscribed) {
                setIsVerified(false);
                setStatus('error');
                const msg = typeof err === 'string' ? err : 'Mã bảo vệ CAPTCHA gặp lỗi khi xác thực.';
                setErrorMessage(msg);
                onError?.(msg);
              }
            },
            theme,
            size,
          });

          widgetIdRef.current = id;
          if (isSubscribed) {
            setStatus('ready');
          }
        } catch (err: any) {
          if (isSubscribed) {
            setStatus('error');
            const msg = err?.message || 'Không thể khởi tạo widget CAPTCHA.';
            setErrorMessage(msg);
            onError?.(msg);
          }
        }
      };

      cleanupScriptListener = loadTurnstileScript(
        () => {
          renderWidget();
        },
        (err) => {
          if (isSubscribed) {
            setStatus('error');
            setErrorMessage('Không thể tải mã bảo vệ CAPTCHA từ máy chủ Cloudflare.');
            onError?.('load_failed');
          }
        }
      );

      return () => {
        isSubscribed = false;
        if (cleanupScriptListener) {
          cleanupScriptListener();
        }
        if (widgetIdRef.current && typeof window !== 'undefined' && window.turnstile) {
          try {
            window.turnstile.remove(widgetIdRef.current);
          } catch {}
          widgetIdRef.current = null;
        }
      };
    }, [siteKey, retryCount, theme, size, action]);

    // Thiếu cấu hình site key: Hiển thị cảnh báo trực quan và Fail-Closed
    if (!siteKey || status === 'missing_key') {
      return (
        <View
          testID="cf-turnstile-missing-key"
          style={{
            padding: 12,
            borderRadius: 12,
            backgroundColor: 'rgba(178,59,59,0.08)',
            borderWidth: 1,
            borderColor: 'rgba(178,59,59,0.25)',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            marginVertical: 8,
          }}
        >
          <AlertCircle size={16} color={BRAND_COLORS.danger} style={{ flexShrink: 0 }} />
          <Text
            style={{
              fontFamily: 'BeVietnamPro_400Regular',
              fontSize: 12,
              color: BRAND_COLORS.danger,
              flex: 1,
              lineHeight: 18,
            }}
          >
            Chưa cấu hình Cloudflare Turnstile Site Key (EXPO_PUBLIC_TURNSTILE_SITE_KEY). Đăng ký tạm thời bị vô hiệu hóa để bảo vệ an toàn.
          </Text>
        </View>
      );
    }

    const turnstileHtml =
      Platform.OS !== 'web'
        ? `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    html, body {
      width: 100%;
      height: 100%;
      background: transparent;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    #loading-placeholder {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #64748B;
      font-size: 12px;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div id="loading-placeholder">
    <span>⏳ Đang tải mã bảo vệ Cloudflare...</span>
  </div>
  <div id="cf-turnstile" style="display:none;"></div>
  <script>
    function post(type, val) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: type, value: val }));
      }
    }
    window.onerror = function(msg, url, line) {
      post('error', msg + ' at ' + line);
    };
    function onTurnstileLoaded() {
      var loader = document.getElementById('loading-placeholder');
      var container = document.getElementById('cf-turnstile');
      if (loader) loader.style.display = 'none';
      if (container) container.style.display = 'block';
      try {
        turnstile.render('#cf-turnstile', {
          sitekey: '${siteKey}',
          action: '${action || 'login'}',
          theme: '${theme || 'light'}',
          size: 'normal',
          callback: function(token) { post('success', token); },
          'error-callback': function(err) { post('error', err || 'Lỗi xác thực'); },
          'expired-callback': function() { post('expired'); }
        });
      } catch(e) {
        post('error', e.message);
      }
    }
  </script>
  <script src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoaded" async defer></script>
</body>
</html>`
        : '';

    return (
      <View testID="cf-turnstile-outer-wrapper" style={{ width: '100%', marginVertical: 8 }}>
        {/* Cụm Header nhận diện bảo mật dùng chung cho cả Web & Native */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 6,
            paddingHorizontal: 2,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <ShieldCheck size={16} color={isVerified ? '#16A34A' : '#1F6F54'} />
            <Text style={{ fontFamily: 'BeVietnamPro_600SemiBold', fontSize: 13, color: '#1B2420' }}>
              Xác minh bảo mật chống bot
            </Text>
          </View>
          {isVerified ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <CheckCircle2 size={13} color="#16A34A" />
              <Text style={{ fontFamily: 'BeVietnamPro_700Bold', fontSize: 11.5, color: '#16A34A' }}>
                Đã xác minh ✓
              </Text>
            </View>
          ) : (
            <Text style={{ fontFamily: 'BeVietnamPro_400Regular', fontSize: 11, color: '#64748B' }}>
              Cloudflare Turnstile
            </Text>
          )}
        </View>

        {/* Khung widget bên trong: */}
        {Platform.OS !== 'web' ? (
          /* Khung WebView trên Native */
          <View
            testID="cf-turnstile-native-container"
            style={{
              width: '100%',
              minHeight: 75,
              height: 75,
              borderRadius: 14,
              overflow: 'hidden',
              backgroundColor: '#FFFFFF',
              borderWidth: 1.5,
              borderColor: isVerified ? '#16A34A' : '#E2E8F0',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {WebView ? (
              <WebView
                ref={webViewRef}
                originWhitelist={['*']}
                source={{
                  html: turnstileHtml,
                  baseUrl: 'https://vivuai.vercel.app',
                }}
                userAgent="Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
                style={{ width: '100%', height: 75, backgroundColor: 'transparent' }}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                mixedContentMode="always"
                thirdPartyCookiesEnabled={true}
                scrollEnabled={false}
                onMessage={(event: any) => {
                  try {
                    const data = JSON.parse(event.nativeEvent.data);
                    if (data.type === 'success' && data.value) {
                      setIsVerified(true);
                      setStatus('ready');
                      onSuccess(data.value);
                    } else if (data.type === 'error') {
                      setIsVerified(false);
                      setStatus('error');
                      onError?.(data.value);
                    } else if (data.type === 'expired') {
                      setIsVerified(false);
                      onExpire?.();
                    }
                  } catch (e) {
                    console.warn('[Turnstile WebView] message error:', e);
                  }
                }}
              />
            ) : (
              <ActivityIndicator size="small" color="#1F6F54" />
            )}
          </View>
        ) : (
          /* Khung Web DOM container */
          <View
            testID="cf-turnstile-container"
            style={{
              width: '100%',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 65,
              borderRadius: 14,
              backgroundColor: '#FFFFFF',
              borderWidth: 1.5,
              borderColor: isVerified ? '#16A34A' : '#E2E8F0',
              paddingVertical: 6,
            }}
          >
            {status === 'loading' && (
              <View
                testID="cf-turnstile-loading"
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 }}
              >
                <ActivityIndicator size="small" color={BRAND_COLORS.primary} />
                <Text
                  style={{
                    fontFamily: 'BeVietnamPro_400Regular',
                    fontSize: 12,
                    color: BRAND_COLORS.textSoft,
                  }}
                >
                  Đang tải mã bảo vệ...
                </Text>
              </View>
            )}

            {status === 'error' && (
              <View
                testID="cf-turnstile-error"
                style={{
                  padding: 12,
                  borderRadius: 12,
                  backgroundColor: 'rgba(178,59,59,0.08)',
                  borderWidth: 1,
                  borderColor: 'rgba(178,59,59,0.25)',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <AlertCircle size={16} color={BRAND_COLORS.danger} style={{ flexShrink: 0 }} />
                  <Text
                    style={{
                      fontFamily: 'BeVietnamPro_400Regular',
                      fontSize: 12,
                      color: BRAND_COLORS.danger,
                      flex: 1,
                    }}
                  >
                    {errorMessage || 'Không thể tải mã bảo vệ CAPTCHA.'}
                  </Text>
                </View>
                <Pressable
                  testID="cf-turnstile-retry-btn"
                  onPress={() => {
                    setIsVerified(false);
                    onExpire?.();
                    setRetryCount((c) => c + 1);
                  }}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 8,
                    backgroundColor: BRAND_COLORS.danger,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: 'BeVietnamPro_600SemiBold',
                      fontSize: 12,
                      color: '#ffffff',
                    }}
                  >
                    Thử tải lại
                  </Text>
                </Pressable>
              </View>
            )}

            <div
              ref={containerRef}
              data-testid="cf-turnstile-container"
              style={{
                display: status === 'ready' || status === 'idle' ? 'flex' : 'none',
                justifyContent: 'center',
                width: '100%',
                minHeight: '65px',
              }}
            />
          </View>
        )}
      </View>
    );
  }
);

Turnstile.displayName = 'Turnstile';

export default Turnstile;
