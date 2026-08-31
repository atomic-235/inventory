const MAX_EDGE = 1800;

export async function captureFrame(): Promise<string> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment' },
  });

  try {
    const video = document.createElement('video');
    video.srcObject = stream;
    await video.play();
    await new Promise((resolve) => {
      if (video.videoWidth > 0) resolve(undefined);
      else video.addEventListener('loadeddata', () => resolve(undefined), { once: true });
    });

    const { width, height } = downscale(video.videoWidth, video.videoHeight, MAX_EDGE);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d')!.drawImage(video, 0, 0, width, height);

    return canvas.toDataURL('image/jpeg', 0.8);
  } finally {
    stream.getTracks().forEach((track) => track.stop());
  }
}

export function downscale(w: number, h: number, maxEdge: number): { width: number; height: number } {
  const longest = Math.max(w, h);
  if (longest <= maxEdge) return { width: w, height: h };
  const scale = maxEdge / longest;
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}