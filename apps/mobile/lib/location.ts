import type { LocationInput } from "@proot/shared";
import * as Location from "expo-location";

/** Ask for foreground location (once; later calls reuse the answer) and read the current position. */
export async function readDeviceLocation(): Promise<LocationInput> {
  const existing = await Location.getForegroundPermissionsAsync();
  const perm = existing.granted ? existing : existing.canAskAgain ? await Location.requestForegroundPermissionsAsync() : existing;
  if (!perm.granted) throw new Error("Location access is off. Turn it on in Settings to see what’s near you.");

  const position =
    (await Location.getLastKnownPositionAsync({ maxAge: 10 * 60 * 1000 })) ??
    (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
  const { latitude, longitude } = position.coords;

  let city: string | undefined;
  try {
    const [place] = await Location.reverseGeocodeAsync({ latitude, longitude });
    city = place?.city ?? place?.subregion ?? place?.region ?? undefined;
  } catch {
    // Reverse geocoding is best effort.
  }
  return { lat: latitude, lng: longitude, ...(city ? { city } : {}) };
}
