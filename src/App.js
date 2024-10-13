import React, { useEffect, useState, useRef } from "react";
import "./App.css";
import FilePicker from "./components/filePicker/filePicker";
import Editor from "./components/editor/editor";

function App() {
  const [backgroundImageDataUrl, setBackgroundImageDataUrl] = useState(null);

  return backgroundImageDataUrl ? (
    <Editor backgroundImageDataUrl={backgroundImageDataUrl} />
  ) : (
    <FilePicker setImageDataUrl={setBackgroundImageDataUrl} />
  );
}

export default App;
