import { useState, useEffect } from "react";

export default function useDecoded(points, worker) {
  const [bestMask, setBestMask] = useState(null);

  useEffect(() => {
    if (!points.length) {
      setBestMask(null);
      return;
    }
    if (!points || !worker) return;
    console.log("decoding", points);
    worker.postMessage({ type: "decode", data: points });

    const listener = (e) => {
      if (e.data.type === "decode_result") {
        const { mask, scores } = e.data.data;

        // Find the best mask index
        let bestIndex = 0;
        for (let i = 1; i < scores.length; ++i) {
          if (scores[i] > scores[bestIndex]) {
            bestIndex = i;
          }
        }

        // Create the best mask array
        const bestMaskArray = new Uint8Array(mask.width * mask.height);
        for (let i = 0; i < bestMaskArray.length; ++i) {
          bestMaskArray[i] = mask.data[scores.length * i + bestIndex];
        }

        setBestMask({
          data: bestMaskArray,
          width: mask.width,
          height: mask.height,
          score: scores[bestIndex],
        });
      }
    };

    worker.addEventListener("message", listener);
    return () => worker.removeEventListener("message", listener);
  }, [points, worker]);

  return bestMask;
}
