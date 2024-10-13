import { useState, useEffect } from "react";

export default function useEmbed(imageDataUrl, worker) {
  const [embedding, setEmbedding] = useState(null);
  useEffect(() => {
    if (!worker) return;
    //Whenever the data url changes, we need to recompute the embedding
    worker.postMessage({
      type: "segment",
      data: imageDataUrl,
    });
    const listener = (e) => {
      const { type, data } = e.data;
      if (type === "segment_result" && data !== "start") {
        setEmbedding(data);
      }
    };
    worker.addEventListener("message", listener);
    return () => {
      worker.removeEventListener("message", listener);
    };
  }, [imageDataUrl, worker]);

  return embedding;
}
