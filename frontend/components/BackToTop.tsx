import { Pressable } from 'react-native';
import { ChevronUp } from 'lucide-react-native';
import { BRAND_COLORS } from '../constants';

interface BackToTopProps {
  visible: boolean;
  onPress: () => void;
}

export default function BackToTop({ visible, onPress }: BackToTopProps) {
  if (!visible) return null;
  return (
    <Pressable
      onPress={onPress}
      style={{
        position: 'absolute', bottom: 24, right: 24, zIndex: 50,
        width: 48, height: 48, borderRadius: 24,
        backgroundColor: '#FBF5EA', borderWidth: 1,
        borderColor: 'rgba(27,36,32,0.12)',
        alignItems: 'center', justifyContent: 'center',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1, shadowRadius: 4, elevation: 4,
      }}
    >
      <ChevronUp size={20} color={BRAND_COLORS.text} />
    </Pressable>
  );
}
