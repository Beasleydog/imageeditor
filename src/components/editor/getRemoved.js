export default async function getRemoved(backgroundDataURI, decoded) {
  // Create a canvas for the mask
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = decoded.width;
  maskCanvas.height = decoded.height;
  const maskContext = maskCanvas.getContext("2d");
  const imageData = maskContext.createImageData(decoded.width, decoded.height);

  const pixelData = imageData.data;
  const expandedMask = expandMask(
    decoded.data,
    decoded.width,
    decoded.height,
    10
  );

  for (let i = 0; i < pixelData.length / 4; ++i) {
    if (expandedMask[i] === 1) {
      const offset = 4 * i;
      pixelData[offset] = 0; // Red
      pixelData[offset + 1] = 0; // Green
      pixelData[offset + 2] = 0; // Blue
      pixelData[offset + 3] = 255; // Alpha (100% opacity)
    }
  }

  maskContext.putImageData(imageData, 0, 0);
  const maskDataURI = maskCanvas.toDataURL();

  console.log("mask data uri", maskDataURI);

  // Load the background image
  const bgImage = new Image();
  bgImage.src = backgroundDataURI;
  await new Promise((resolve) => (bgImage.onload = resolve));

  // Create the final canvas with the correct dimensions
  const finalCanvas = new OffscreenCanvas(bgImage.width, bgImage.height);
  const finalContext = finalCanvas.getContext("2d");

  // Draw the background image
  finalContext.drawImage(bgImage, 0, 0);

  // Draw the mask over the background image without altering aspect ratio
  finalContext.drawImage(
    maskCanvas,
    0,
    0,
    maskCanvas.width,
    maskCanvas.height,
    0,
    0,
    bgImage.width,
    bgImage.height
  );

  // Convert the final canvas to a data URI
  const finalDataURI = await finalCanvas.convertToBlob().then((blob) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  });

  console.log(
    "Final canvas dimensions:",
    finalCanvas.width,
    finalCanvas.height
  );

  // Resize all data URIs to 1024x1024 while preserving aspect ratio
  const resizedBackgroundDataURI = await resizeDataURI(
    backgroundDataURI,
    1024,
    1024
  );
  const resizedMaskDataURI = await resizeDataURI(maskDataURI, 1024, 1024);
  const resizedFinalDataURI = await resizeDataURI(finalDataURI, 1024, 1024);

  console.log(
    resizedBackgroundDataURI,
    resizedMaskDataURI,
    resizedFinalDataURI
  );

  const newImageUrl = await fillImage(
    resizedBackgroundDataURI,
    resizedMaskDataURI,
    resizedFinalDataURI
  );

  const response = await fetch(newImageUrl);
  const blob = await response.blob();
  const reader = new FileReader();
  const dataUrl = await new Promise((resolve) => {
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });

  // Resize the new dataUrl to the original dimensions
  const resizedDataUrl = await resizeDataURI(
    dataUrl,
    bgImage.width,
    bgImage.height
  );

  console.log("Resized to original dimensions:", bgImage.width, bgImage.height);

  return resizedDataUrl;
}

// Helper function to resize a data URI
async function resizeDataURI(dataURI, targetWidth, targetHeight) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      // Create an OffscreenCanvas with the target dimensions
      const canvas = new OffscreenCanvas(targetWidth, targetHeight);
      const ctx = canvas.getContext("2d");

      // Clear the canvas to ensure no residual data
      ctx.clearRect(0, 0, targetWidth, targetHeight);

      // Draw the image stretched to fill the entire canvas
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

      // Convert the canvas to a Blob and then to a Data URI
      canvas.convertToBlob().then((blob) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    };

    // Handle image loading errors gracefully
    img.onerror = () => {
      console.error("Failed to load image for resizing.");
      resolve(dataURI); // Return the original Data URI if resizing fails
    };

    // Initiate the image loading
    img.src = dataURI;
  });
}

function expandMask(mask, width, height, expandBy) {
  const expanded = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (mask[i] === 1) {
        for (let dy = -expandBy; dy <= expandBy; dy++) {
          for (let dx = -expandBy; dx <= expandBy; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              expanded[ny * width + nx] = 1;
            }
          }
        }
      }
    }
  }
  return expanded;
}

async function fillImage(backgroundDataURI, maskDataURI, finalDataURI) {
  const backgroundFile = await uploadFile(backgroundDataURI);
  const maskFile = await uploadFile(maskDataURI);
  const finalFile = await uploadFile(finalDataURI);

  const response = await fetch(
    "https://ozzygt-diffusers-image-fill.hf.space/call/fill_image",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        data: [
          {
            background: handleFile(backgroundFile),
            layers: [handleFile(maskFile)],
            composite: handleFile(finalFile),
          },
          "RealVisXL V5.0 Lightning",
        ],
      }),
    }
  );

  const data = await response.json();
  const eventId = data.event_id;

  const eventStream = await fetch(
    `https://ozzygt-diffusers-image-fill.hf.space/call/fill_image/${eventId}`
  );

  const reader = eventStream.body.getReader();
  let result;
  let lastData;

  while (true) {
    result = await reader.read();
    if (result.done) break;

    const chunk = new TextDecoder().decode(result.value);
    const lines = chunk.split("\n");
    console.log(lines);
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const eventData = JSON.parse(line.slice(6));
        lastData = eventData[0];
      }
      if (line.includes("event: complete")) {
        break;
      }
    }
  }

  if (lastData && lastData[1] && lastData[1].url) {
    return lastData[1].url.replace("/call/file", "/file");
  } else {
    throw new Error("Failed to retrieve the final image URL");
  }
}

async function uploadFile(input) {
  const formData = new FormData();

  if (input.startsWith("data:")) {
    // Convert Data URL to File object
    const arr = input.split(",");
    const mime = arr[0].match(/:(.*?);/)[1];
    console.log("mime", mime);
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    const file = new File([u8arr], "file", { type: mime });
    formData.append("files", file);
  } else {
    formData.append("files", input);
  }

  try {
    const response = await fetch(
      "https://ozzygt-diffusers-image-fill.hf.space/upload",
      {
        method: "POST",
        body: formData,
      }
    );

    if (!response.ok) {
      throw new Error(`Upload failed with status ${response.status}`);
    }

    const data = await response.json();
    return `https://ozzygt-diffusers-image-fill.hf.space/file=${data[0]}`; // Array of uploaded file information
  } catch (error) {
    console.error("Error uploading file:", error);
    throw error;
  }
}

function handleFile(url) {
  return {
    path: url,
    // name: String(Math.random() * 1000),
  };
}
