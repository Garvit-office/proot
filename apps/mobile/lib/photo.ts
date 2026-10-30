import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";

/** Pick (or shoot) a square photo and return it as a small JPEG data URL for the pet profile. */
export async function pickPetPhoto(source: "camera" | "library"): Promise<string | null> {
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 1 };

  if (source === "camera") {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error("Camera access is off. Enable it in Settings, or choose from your library.");
  }
  const result = source === "camera" ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled) return null;

  const rendered = await ImageManipulator.manipulate(result.assets[0].uri).resize({ width: 640 }).renderAsync();
  const saved = await rendered.saveAsync({ base64: true, compress: 0.8, format: SaveFormat.JPEG });
  if (!saved.base64) throw new Error("Couldn’t read that photo.");
  return `data:image/jpeg;base64,${saved.base64}`;
}
