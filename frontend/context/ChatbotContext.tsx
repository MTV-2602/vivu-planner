import React, { createContext, useState, useContext, useCallback, useEffect } from 'react';
import { usePathname } from 'expo-router';

interface ChatbotContextType {
  tripId: string | null;
  setTripId: (id: string | null) => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  openChatbot: () => void;
  closeChatbot: () => void;
  triggerPreview: (adaptedItinerary: any, diff: string, previousSnapshot: any) => void;
  registerPreviewTrigger: (handler: (adaptedItinerary: any, diff: string, previousSnapshot: any) => void) => void;
  unregisterPreviewTrigger: () => void;
}

export const ChatbotContext = createContext<ChatbotContextType>({
  tripId: null,
  setTripId: () => {},
  isOpen: false,
  setIsOpen: () => {},
  openChatbot: () => {},
  closeChatbot: () => {},
  triggerPreview: () => {},
  registerPreviewTrigger: () => {},
  unregisterPreviewTrigger: () => {},
});

export const ChatbotProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tripId, setTripIdState] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [previewHandler, setPreviewHandler] = useState<((adaptedItinerary: any, diff: string, previousSnapshot: any) => void) | null>(null);
  const pathname = usePathname();

  // Automatically sync tripId with pathname changes
  useEffect(() => {
    // Match /chuyen-di/[id] nhưng loại trừ 'moi'
    const match = pathname.match(/\/chuyen-di\/([^\/\?]+)/);
    if (match && match[1] !== 'moi') {
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

  const openChatbot = useCallback(() => {
    setIsOpen(true);
  }, []);

  const closeChatbot = useCallback(() => {
    setIsOpen(false);
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
    <ChatbotContext.Provider value={{
      tripId,
      setTripId,
      isOpen,
      setIsOpen,
      openChatbot,
      closeChatbot,
      triggerPreview,
      registerPreviewTrigger,
      unregisterPreviewTrigger
    }}>
      {children}
    </ChatbotContext.Provider>
  );
};

export const useChatbot = () => useContext(ChatbotContext);
