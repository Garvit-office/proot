import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";

type PickOptions = {
  /** Longest edge of the output, in px. */
  maxSize?: number;
  /** Crop to a square in the picker. */
  square?: boolean;
  compress?: number;
};

async function toDataUrl(asset: ImagePicker.ImagePickerAsset, maxSize: number, compress: number) {
  const { width = 0, height = 0 } = asset;
  const resize = width >= height ? { width: Math.min(width || maxSize, maxSize) } : { height: Math.min(height || maxSize, maxSize) };
  const rendered = await ImageManipulator.manipulate(asset.uri).resize(resize).renderAsync();
  const saved = await rendered.saveAsync({ base64: true, compress, format: SaveFormat.JPEG });
  if (!saved.base64) throw new Error("Couldn’t read that photo.");
  return `data:image/jpeg;base64,${saved.base64}`;
}

/** Pick (or shoot) one photo and return it as a downscaled JPEG data URL, or null if cancelled. */
export async function pickPhoto(source: "camera" | "library", { maxSize = 1280, square = false, compress = 0.8 }: PickOptions = {}): Promise<string | null> {
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], allowsEditing: square, aspect: square ? [1, 1] : undefined, quality: 1 };
  if (source === "camera") {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error("Camera access is off. Enable it in Settings, or choose from your library.");
  }
  const result = source === "camera" ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets[0]) return null;
  return toDataUrl(result.assets[0], maxSize, compress);
}

/** Pick several photos from the library (for listings), each downscaled to a data URL. */
export async function pickPhotos(limit: number, maxSize = 1280): Promise<string[]> {
  if (limit <= 0) return [];
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, selectionLimit: limit, quality: 1 });
  if (result.canceled) return [];
  const out: string[] = [];
  for (const asset of result.assets.slice(0, limit)) out.push(await toDataUrl(asset, maxSize, 0.8));
  return out;
}

/** Square photo for a pet profile or avatar (640px). */
export function pickPetPhoto(source: "camera" | "library") {
  return pickPhoto(source, { maxSize: 640, square: true });
}
