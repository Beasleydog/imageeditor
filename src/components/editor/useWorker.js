import { useState, useEffect } from "react";

export default function useWorker(path) {
  const [worker, setWorker] = useState(null);

  useEffect(() => {
    setWorker(new Worker(path, { type: "module" }));
  }, [path]);

  return worker;
}
