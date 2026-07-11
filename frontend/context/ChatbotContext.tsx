import React, { createContext, useState, useContext, useCallback, useEffect } from 'react';
import { usePathname } from 'expo-router';

interface ChatbotContextType {
  tripId: string | null;
  setTripId: (id: string | null) => void;
  triggerPreview: (adaptedItinerary: any, diff: string, previousSnapshot: any) => void;
  registerPreviewTrigger: (handler: (adaptedItinerary: any, diff: string, previousSnapshot: any) => void) => void;
  unregisterPreviewTrigger: () => void;
}

export const ChatbotContext = createContext<ChatbotContextType>({
  tripId: null,
  setTripId: () => {},
  triggerPreview: () => {},
  registerPreviewTrigger: () => {},
  unregisterPreviewTrigger: () => {},
});

export const ChatbotProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tripId, setTripIdState] = useState<string | null>(null);
  const [previewHandler, setPreviewHandler] = useState<((adaptedItinerary: any, diff: string, previousSnapshot: any) => void) | null>(null);
  const pathname = usePathname();

  // Automatically sync tripId with pathname changes
  useEffect(() => {
    // Match /chuyen-di/[id]
    // Under Web, pathname might contain slash, query params, etc.
    const match = pathname.match(/\/chuyen-di\/([^\/\?]+)/);
    if (match) {
      const idFromPath = match[1];
      if (tripId !== idFromPath) {
        setTripIdState(idFromPath);
      }
    } else {
      if (tripId !== null) {
        setTripIdState(null);
      }
    }
  }, [pathname, tripId]);

  const setTripId = useCallback((id: string | null) => {
    setTripIdState(id);
  }, []);

  const registerPreviewTrigger = useCallback((handler: (adaptedItinerary: any, diff: string, previousSnapshot: any) => void) => {
    setPreviewHandler(() => handler);
  }, []);

  const unregisterPreviewTrigger = useCallback(() => {
    setPreviewHandler(null);
  }, []);

  const triggerPreview = useCallback((adaptedItinerary: any, diff: string, previousSnapshot: any) => {
    if (previewHandler) {
      previewHandler(adaptedItinerary, diff, previousSnapshot);
    } else {
      console.warn('[ChatbotContext] No preview handler registered! Make sure you are on a trip details page.');
    }
  }, [previewHandler]);

  return (
    <ChatbotContext.Provider value={{ tripId, setTripId, triggerPreview, registerPreviewTrigger, unregisterPreviewTrigger }}>
      {children}
    </ChatbotContext.Provider>
  );
};

export const useChatbot = () => useContext(ChatbotContext);
