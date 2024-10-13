export default async function getLayerImage(imageDataUrl, decoded) {
  // Create a canvas for the mask
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = decoded.width;
  maskCanvas.height = decoded.height;
  const maskContext = maskCanvas.getContext("2d");
  const maskImageData = maskContext.createImageData(
    decoded.width,
    decoded.height
  );

  // Create the mask
  const pixelData = maskImageData.data;
  for (let i = 0; i < pixelData.length / 4; ++i) {
    if (decoded.data[i] === 1) {
      const offset = 4 * i;
      pixelData[offset + 3] = 255; // Set alpha to 255 (fully opaque) for masked areas
    }
  }
  maskContext.putImageData(maskImageData, 0, 0);

  // Load the original image
  const img = new Image();
  img.src = imageDataUrl;
  await new Promise((resolve) => (img.onload = resolve));

  // Create a canvas for the final image
  const finalCanvas = document.createElement("canvas");
  finalCanvas.width = img.width;
  finalCanvas.height = img.height;
  const finalContext = finalCanvas.getContext("2d");

  // Draw the original image
  finalContext.drawImage(img, 0, 0);

  // Apply the mask
  finalContext.globalCompositeOperation = "destination-in";
  finalContext.drawImage(
    maskCanvas,
    0,
    0,
    maskCanvas.width,
    maskCanvas.height,
    0,
    0,
    img.width,
    img.height
  );

  // Find the bounding box of the non-transparent area
  const finalImageData = finalContext.getImageData(
    0,
    0,
    finalCanvas.width,
    finalCanvas.height
  );
  let minX = finalCanvas.width,
    minY = finalCanvas.height,
    maxX = 0,
    maxY = 0;
  for (let y = 0; y < finalCanvas.height; y++) {
    for (let x = 0; x < finalCanvas.width; x++) {
      const alpha = finalImageData.data[(y * finalCanvas.width + x) * 4 + 3];
      if (alpha !== 0) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  // Create a new canvas with the size of the bounding box
  const croppedCanvas = document.createElement("canvas");
  croppedCanvas.width = maxX - minX + 1;
  croppedCanvas.height = maxY - minY + 1;
  const croppedContext = croppedCanvas.getContext("2d");

  // Draw the cropped image
  croppedContext.drawImage(
    finalCanvas,
    minX,
    minY,
    croppedCanvas.width,
    croppedCanvas.height,
    0,
    0,
    croppedCanvas.width,
    croppedCanvas.height
  );

  // Return an object with the new dimensions and the URL
  return {
    width: croppedCanvas.width,
    height: croppedCanvas.height,
    url: croppedCanvas.toDataURL(),
    boundingBox: { minX, minY, maxX, maxY },
  };
}
