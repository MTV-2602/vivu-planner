import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, ScrollView, Pressable, Platform } from 'react-native';
import { AlertTriangle, RotateCcw, Copy } from 'lucide-react-native';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export default class ScreenErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ScreenErrorBoundary] Bắt được lỗi crash giao diện:', error, errorInfo);
    this.setState({
      error,
      errorInfo,
    });
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      const errorMsg = this.state.error?.message || 'Không xác định được nguyên nhân lỗi';
      const stackTrace = this.state.error?.stack || this.state.errorInfo?.componentStack || '';

      return (
        <View
          style={{
            flex: 1,
            backgroundColor: '#FEF2F2',
            paddingTop: Platform.OS === 'web' ? 24 : 50,
            paddingHorizontal: 20,
            paddingBottom: 24,
            justifyContent: 'center',
          }}
        >
          <View
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: 20,
              padding: 20,
              borderWidth: 1.5,
              borderColor: '#EF4444',
              maxHeight: '90%',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.1,
              shadowRadius: 12,
            }}
          >
            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: '#FEE2E2',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <AlertTriangle size={20} color="#DC2626" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: '#991B1B' }}>
                  {this.props.fallbackTitle || 'Đã phát hiện lỗi giao diện'}
                </Text>
                <Text style={{ fontSize: 11, color: '#6B7280' }}>
                  Hệ thống đã bẫy lỗi và ngăn màn hình bị đen
                </Text>
              </View>
            </View>

            {/* Error Message Box */}
            <View
              style={{
                backgroundColor: '#FFF1F2',
                borderRadius: 12,
                padding: 12,
                borderWidth: 1,
                borderColor: '#FECDD3',
                marginBottom: 12,
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#BE123C', marginBottom: 4 }}>
                Chi tiết thông báo lỗi:
              </Text>
              <Text style={{ fontSize: 12, color: '#881337', fontFamily: 'monospace' }}>
                {errorMsg}
              </Text>
            </View>

            {/* Stack trace */}
            {stackTrace ? (
              <ScrollView
                style={{
                  backgroundColor: '#1E293B',
                  borderRadius: 12,
                  padding: 10,
                  maxHeight: 180,
                  marginBottom: 14,
                }}
              >
                <Text style={{ fontSize: 10, color: '#94A3B8', fontFamily: 'monospace' }}>
                  {stackTrace}
                </Text>
              </ScrollView>
            ) : null}

            {/* Action button */}
            <Pressable
              onPress={this.handleReset}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                backgroundColor: '#DC2626',
                paddingVertical: 12,
                borderRadius: 12,
              }}
            >
              <RotateCcw size={16} color="#FFFFFF" />
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>
                Thử tải lại màn hình này
              </Text>
            </Pressable>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}
