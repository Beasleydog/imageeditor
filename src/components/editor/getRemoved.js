const NGROK_URL = "https://eaf5-34-125-218-136.ngrok-free.app/";
export default async function getRemoved(backgroundDataURI, decoded) {
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
      pixelData[offset] = 255;
      pixelData[offset + 1] = 255;
      pixelData[offset + 2] = 255;
      pixelData[offset + 3] = 255;
    }
  }

  maskContext.putImageData(imageData, 0, 0);
  const maskDataURI = maskCanvas.toDataURL("image/png");

  const bgImage = new Image();
  bgImage.src = backgroundDataURI;
  await new Promise((resolve) => (bgImage.onload = resolve));

  // Convert backgroundDataURI to PNG if it's not already
  const bgCanvas = document.createElement("canvas");
  bgCanvas.width = bgImage.width;
  bgCanvas.height = bgImage.height;
  const bgContext = bgCanvas.getContext("2d");
  bgContext.drawImage(bgImage, 0, 0);
  const bgDataURIPNG = bgCanvas.toDataURL("image/png");

  const response = await fetch(`${NGROK_URL}/inpaint`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      image: bgDataURIPNG,
      mask: maskDataURI,
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const blob = await response.blob();
  const reader = new FileReader();
  const dataUrl = await new Promise((resolve) => {
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });

  const resizedDataUrl = await resizeDataURI(
    dataUrl,
    bgImage.width,
    bgImage.height
  );

  console.log("Resized to original dimensions:", bgImage.width, bgImage.height);

  return resizedDataUrl;
}

async function resizeDataURI(dataURI, targetWidth, targetHeight) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = new OffscreenCanvas(targetWidth, targetHeight);
      const ctx = canvas.getContext("2d");

      ctx.clearRect(0, 0, targetWidth, targetHeight);
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

      canvas.convertToBlob().then((blob) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    };

    img.onerror = () => {
      console.error("Failed to load image for resizing.");
      resolve(dataURI);
    };

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
