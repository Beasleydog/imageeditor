import React, { useEffect, useState, useRef } from "react";

function FilePicker({ setImageDataUrl }) {
  const fileInputRef = useRef(null);

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (file && file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setImageDataUrl(e.target.result);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div>
      <input
        type="file"
        accept="image/*"
        onChange={handleFileUpload}
        ref={fileInputRef}
        style={{ display: "none" }}
      />
      <button onClick={() => fileInputRef.current.click()}>Upload Image</button>
    </div>
  );
}

export default FilePicker;
