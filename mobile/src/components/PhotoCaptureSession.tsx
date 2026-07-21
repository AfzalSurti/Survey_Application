import React, { useEffect, useRef, useState } from "react";
import { Alert, Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, GlassCard, Hero, Meta } from "@/components/UI";
import { useTheme } from "@/context/ThemeContext";

type Step = "chooser" | "session" | "builtin";

/**
 * Photo capture flow from annotated screenshots:
 * 1) Do NOT open the camera immediately — show app/source options first.
 * 2) Stay in a capture session until minPhotos is reached (camera does not
 *    bounce back to the form after every single shot).
 */
export function PhotoCaptureSession({
  visible,
  minPhotos,
  photos,
  onChange,
  onClose,
}: {
  visible: boolean;
  minPhotos: number;
  photos: string[];
  onChange: (uris: string[]) => void;
  onClose: () => void;
}) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>("chooser");
  const [busy, setBusy] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const done = photos.length >= minPhotos;

  useEffect(() => {
    if (visible) setStep("chooser");
  }, [visible]);

  const addUris = (uris: string[]) => {
    if (!uris.length) return;
    onChange([...photos, ...uris]);
  };

  const ensureCameraPermission = async () => {
    const cam = await ImagePicker.requestCameraPermissionsAsync();
    if (!cam.granted) {
      Alert.alert("Camera blocked", "Allow camera access so you can choose a camera app to take photos.");
      return false;
    }
    return true;
  };

  const takeWithCameraApps = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (!(await ensureCameraPermission())) return;
      // System camera intent — Android shows installed camera apps when more than one exists.
      const result = await ImagePicker.launchCameraAsync({
        quality: 0.75,
        allowsEditing: false,
        exif: false,
      });
      if (!result.canceled && result.assets?.length) {
        addUris(result.assets.map((a) => a.uri));
        setStep("session");
      } else {
        setStep("session");
      }
    } finally {
      setBusy(false);
    }
  };

  const pickFromGallery = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const lib = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!lib.granted) {
        Alert.alert("Photos blocked", "Allow photo library access to pick existing pictures.");
        return;
      }
      const remaining = Math.max(minPhotos - photos.length, 1);
      const result = await ImagePicker.launchImageLibraryAsync({
        quality: 0.75,
        allowsMultipleSelection: true,
        selectionLimit: remaining,
        mediaTypes: ["images"],
      });
      if (!result.canceled && result.assets?.length) {
        addUris(result.assets.map((a) => a.uri));
      }
      setStep("session");
    } finally {
      setBusy(false);
    }
  };

  const openBuiltin = async () => {
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        Alert.alert("Camera blocked", "Camera permission is required for the built-in camera.");
        return;
      }
    }
    setStep("builtin");
  };

  const captureBuiltin = async () => {
    const shot = await cameraRef.current?.takePictureAsync({ quality: 0.7 });
    if (shot?.uri) {
      const next = [...photos, shot.uri];
      onChange(next);
      // Stay in built-in camera until min photos — do not close after each shot.
      if (next.length >= minPhotos) {
        setStep("session");
      }
    }
  };

  const removeAt = (uri: string) => onChange(photos.filter((p) => p !== uri));

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: theme.background, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        {step === "chooser" ? (
          <View style={styles.pad}>
            <Hero>Add structure photos</Hero>
            <Meta>
              Choose how to capture photos. The camera will stay in a photo session until you have at least {minPhotos}{" "}
              photos ({photos.length}/{minPhotos} so far).
            </Meta>
            <GlassCard>
              <Text style={[styles.optionTitle, { color: theme.ink }]}>Camera apps</Text>
              <Meta>Opens your phone’s camera apps (Google Camera, Samsung Camera, etc.) so you can pick which app to use.</Meta>
              <Button title={busy ? "Opening…" : "Use camera apps"} onPress={takeWithCameraApps} loading={busy} disabled={busy} />
            </GlassCard>
            <GlassCard>
              <Text style={[styles.optionTitle, { color: theme.ink }]}>Photo gallery</Text>
              <Meta>Pick existing pictures from your device gallery.</Meta>
              <Button title="Choose from gallery" variant="secondary" onPress={pickFromGallery} disabled={busy} />
            </GlassCard>
            <GlassCard>
              <Text style={[styles.optionTitle, { color: theme.ink }]}>Built-in camera</Text>
              <Meta>Stay inside GDRPL Survey and capture several photos without leaving until the minimum is reached.</Meta>
              <Button title="Open built-in camera" variant="ghost" onPress={openBuiltin} disabled={busy} />
            </GlassCard>
            <Button title="Cancel" variant="ghost" onPress={onClose} />
          </View>
        ) : null}

        {step === "session" ? (
          <View style={styles.pad}>
            <Hero>Photo session</Hero>
            <Meta>
              {photos.length}/{minPhotos} photos captured.
              {done ? " Minimum reached — you can finish." : " Keep adding photos. You will not return to the form until you finish or cancel."}
            </Meta>
            <View style={styles.photoRow}>
              {photos.map((uri) => (
                <View key={uri} style={styles.thumbWrap}>
                  <Image source={{ uri }} style={styles.thumb} />
                  <Pressable style={styles.thumbRemove} onPress={() => removeAt(uri)}>
                    <Text style={styles.thumbRemoveText}>×</Text>
                  </Pressable>
                </View>
              ))}
            </View>
            {!done ? (
              <>
                <Button title="Take next photo (camera apps)" onPress={takeWithCameraApps} loading={busy} disabled={busy} />
                <Button title="Add from gallery" variant="secondary" onPress={pickFromGallery} disabled={busy} />
                <Button title="Continue with built-in camera" variant="ghost" onPress={openBuiltin} disabled={busy} />
              </>
            ) : null}
            <Button
              title={done ? "Done — return to form" : "Finish early"}
              variant={done ? "primary" : "ghost"}
              onPress={() => {
                if (!done) {
                  Alert.alert(
                    "Not enough photos",
                    `You need at least ${minPhotos} photos. Capture more, or cancel the session.`,
                    [
                      { text: "Keep capturing", style: "cancel" },
                      { text: "Cancel session", style: "destructive", onPress: onClose },
                    ],
                  );
                  return;
                }
                onClose();
              }}
            />
            <Button title="Change source" variant="ghost" onPress={() => setStep("chooser")} />
          </View>
        ) : null}

        {step === "builtin" ? (
          <CameraView style={{ flex: 1 }} facing="back" ref={cameraRef}>
            <View style={[styles.cameraBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
              <Text style={styles.cameraCount}>
                {photos.length}/{minPhotos} — stay here until all photos are taken
              </Text>
              <Button title="Capture photo" onPress={captureBuiltin} />
              <Button
                title={done ? "Done" : "Back to session"}
                variant="ghost"
                onPress={() => setStep("session")}
              />
            </View>
          </CameraView>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  pad: { flex: 1, padding: 18, gap: 12 },
  optionTitle: { fontSize: 17, fontWeight: "800", marginBottom: 4 },
  photoRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginVertical: 8 },
  thumbWrap: { width: 76, height: 76, borderRadius: 12, overflow: "hidden" },
  thumb: { width: "100%", height: "100%" },
  thumbRemove: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbRemoveText: { color: "#fff", fontWeight: "800", fontSize: 14, marginTop: -1 },
  cameraBar: { marginTop: "auto", padding: 20, gap: 10, backgroundColor: "rgba(16,36,58,0.55)" },
  cameraCount: { color: "#fff", fontWeight: "700", textAlign: "center", marginBottom: 4 },
});
