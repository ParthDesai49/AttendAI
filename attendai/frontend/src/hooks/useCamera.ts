import { useEffect, useRef, useState } from "react";

/** Opens the camera while the component is on screen and always switches it off again. */
export function useCamera(facing: "user" | "environment") {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<"starting" | "ready" | "error">("starting");
  const [error, setError] = useState("");

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("The camera needs a secure address. Open AttendAI over https, or on localhost.");
        setState("error");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        if (!cancelled) setState("ready");
      } catch (e) {
        if (cancelled) return;
        const name = (e as DOMException).name;
        setError(
          name === "NotAllowedError" ? "Camera access is blocked. Allow it from the address bar, then try again."
            : name === "NotFoundError" ? "No camera was found on this device."
            : name === "NotReadableError" ? "Another app is using the camera. Close it and try again."
            : "The camera could not be started.",
        );
        setState("error");
      }
    })();
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [facing]);

  return { videoRef, state, error };
}
