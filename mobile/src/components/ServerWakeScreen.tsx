import React, { useEffect, useRef } from "react";
import { Animated, Easing, Image, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export function ServerWakeScreen({ detail }: { detail?: string }) {
  const insets = useSafeAreaInsets();
  const pulse = useRef(new Animated.Value(1)).current;
  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;
  const ring3 = useRef(new Animated.Value(0)).current;
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.06, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    const makeRipple = (v: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(v, { toValue: 1, duration: 2200, easing: Easing.out(Easing.ease), useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]),
      );
    const makeDot = (v: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(v, { toValue: 1, duration: 350, useNativeDriver: true }),
          Animated.timing(v, { toValue: 0.25, duration: 350, useNativeDriver: true }),
        ]),
      );

    pulseLoop.start();
    const r1 = makeRipple(ring1, 0);
    const r2 = makeRipple(ring2, 700);
    const r3 = makeRipple(ring3, 1400);
    const d1 = makeDot(dot1, 0);
    const d2 = makeDot(dot2, 200);
    const d3 = makeDot(dot3, 400);
    r1.start();
    r2.start();
    r3.start();
    d1.start();
    d2.start();
    d3.start();
    return () => {
      pulseLoop.stop();
      r1.stop();
      r2.stop();
      r3.stop();
      d1.stop();
      d2.stop();
      d3.stop();
    };
  }, [pulse, ring1, ring2, ring3, dot1, dot2, dot3]);

  const ringStyle = (v: Animated.Value) => ({
    opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }),
    transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1.2] }) }],
  });

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.orbWrap}>
        <Animated.View style={[styles.ring, styles.ringGreen, ringStyle(ring1)]} />
        <Animated.View style={[styles.ring, styles.ringBlue, ringStyle(ring2)]} />
        <Animated.View style={[styles.ring, styles.ringSoft, ringStyle(ring3)]} />
        <Animated.View style={[styles.orb, { transform: [{ scale: pulse }] }]}>
          <Image source={require("../../assets/gdrpl-logo.png")} style={styles.logo} />
        </Animated.View>
      </View>
      <Text style={styles.eyebrow}>GDRPL SURVEY</Text>
      <Text style={styles.title}>Geo Designs & Research</Text>
      <Text style={styles.msg}>{detail || "Waking up server — this can take up to a minute on first load…"}</Text>
      <View style={styles.connecting}>
        <Animated.View style={[styles.dot, { opacity: dot1 }]} />
        <Animated.View style={[styles.dot, { opacity: dot2 }]} />
        <Animated.View style={[styles.dot, { opacity: dot3 }]} />
        <Text style={styles.connectingText}>Connecting</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#10243A",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  orbWrap: { width: 150, height: 150, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  orb: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: "#E8F2FC",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  logo: { width: 56, height: 56, resizeMode: "contain" },
  ring: { position: "absolute", width: 150, height: 150, borderRadius: 75, borderWidth: 2 },
  ringGreen: { borderColor: "rgba(111,168,62,0.55)" },
  ringBlue: { borderColor: "rgba(91,157,207,0.45)" },
  ringSoft: { borderColor: "rgba(220,235,251,0.3)" },
  eyebrow: { color: "#9FD06A", letterSpacing: 3, fontSize: 11, fontWeight: "800", marginTop: 8 },
  title: { color: "#FFFFFF", fontSize: 26, fontWeight: "800", textAlign: "center", marginTop: 8 },
  msg: { color: "#A9C0D8", fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 10, maxWidth: 300 },
  connecting: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 18 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#9FD06A" },
  connectingText: { color: "#9FD06A", fontWeight: "700", marginLeft: 4 },
});
