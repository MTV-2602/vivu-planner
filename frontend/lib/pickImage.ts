import * as ImagePicker from 'expo-image-picker';

export interface PickedImage {
  fileName: string;
  fileType: string;
  size: number;
  // Data URL dạng "data:<mime>;base64,..." — cùng định dạng FileReader.readAsDataURL trên web
  base64: string;
}

// Chọn ảnh từ thư viện trên native (Android/iOS), trả về dữ liệu tương thích với API upload base64.
// Trả về null nếu người dùng hủy. Ném lỗi nếu bị từ chối quyền truy cập.
export async function pickImageNative(): Promise<PickedImage | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    throw new Error('Bạn cần cấp quyền truy cập thư viện ảnh để chọn ảnh.');
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.8,
    base64: true,
  });
  if (result.canceled || !result.assets?.[0]?.base64) return null;
  const asset = result.assets[0];
  const fileType = asset.mimeType || 'image/jpeg';
  const ext = fileType.split('/')[1] || 'jpg';
  return {
    fileName: asset.fileName || `image_${Date.now()}.${ext}`,
    fileType,
    // Ước lượng kích thước từ chuỗi base64 nếu picker không trả fileSize
    size: asset.fileSize ?? Math.floor((asset.base64!.length * 3) / 4),
    base64: `data:${fileType};base64,${asset.base64}`,
  };
}
