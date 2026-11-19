// API phản hồi đa nền tảng: Alert.alert không hoạt động trên react-native-web,
// nên mọi thông báo lỗi/thành công/thông tin đều đi qua toast toàn cục (ToastHost).

export type NotifyType = 'success' | 'error' | 'info';

export interface NotifyMessage {
  id: number;
  type: NotifyType;
  text: string;
}

type Listener = (msg: NotifyMessage) => void;

const listeners = new Set<Listener>();
let nextId = 1;

function emit(type: NotifyType, text: string) {
  const msg: NotifyMessage = { id: nextId++, type, text };
  // Chưa có ToastHost nào được mount thì ghi log để không mất thông báo khi debug
  if (listeners.size === 0) {
    console.warn(`[notify:${type}] ${text}`);
    return;
  }
  listeners.forEach((l) => l(msg));
}

export function subscribeNotify(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const notify = {
  success: (text: string) => emit('success', text),
  error: (text: string) => emit('error', text),
  info: (text: string) => emit('info', text),
};

export default notify;
