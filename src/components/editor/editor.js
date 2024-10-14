import { useRef, useEffect, useState } from "react";
import useEmbed from "./useEmbed";
import useWorker from "./useWorker";
import useDecoded from "./useDecoded";
import { Stage, Layer, Image, Circle, Transformer } from "react-konva";
import useImage from "use-image";
import getRemoved from "./getRemoved";
import getLayerImage from "./getLayerImage";
import "./editor.css";

export default function Editor({ backgroundImageDataUrl }) {
  const [imageDataUrl, setImageDataUrl] = useState(backgroundImageDataUrl);
  const [points, setPoints] = useState([]);
  const [objects, setObjects] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [scale, setScale] = useState({ scaleX: 1, scaleY: 1 });
  const [imageDimensions, setImageDimensions] = useState({
    width: 0,
    height: 0,
  });
  const [image] = useImage(backgroundImageDataUrl);

  const worker = useWorker("worker.js");
  const embedding = useEmbed(backgroundImageDataUrl, worker);
  const decoded = useDecoded(points, worker);

  useEffect(() => {
    if (image) {
      const maxCanvasWidth = window.innerWidth - 100;
      const maxCanvasHeight = window.innerHeight - 100;
      let newWidth = image.width;
      let newHeight = image.height;
      const aspectRatio = image.width / image.height;

      if (newWidth > maxCanvasWidth) {
        newWidth = maxCanvasWidth;
        newHeight = newWidth / aspectRatio;
      }

      if (newHeight > maxCanvasHeight) {
        newHeight = maxCanvasHeight;
        newWidth = newHeight * aspectRatio;
      }

      setImageDimensions({ width: newWidth, height: newHeight });

      const scaleX = newWidth / image.width;
      const scaleY = newHeight / image.height;
      setScale({ scaleX, scaleY });
    }
  }, [image]);

  useEffect(() => {
    if (!decoded) return;

    getRemoved(imageDataUrl, decoded).then((newImageDataUrl) => {
      setImageDataUrl(newImageDataUrl);
      setPoints([]);

      getLayerImage(imageDataUrl, decoded).then((cutoutObject) => {
        const cutoutURL = cutoutObject.url;
        const newImage = new window.Image();
        newImage.src = cutoutURL;
        newImage.onload = () => {
          setObjects((prevObjects) => [
            ...prevObjects,
            {
              image: newImage,
              width: cutoutObject.width * scale.scaleX,
              height: cutoutObject.height * scale.scaleY,
              x: cutoutObject.boundingBox.minX * scale.scaleX,
              y: cutoutObject.boundingBox.minY * scale.scaleY,
            },
          ]);
        };
      });
    });
  }, [decoded, scale]);

  function handleMouseDown(e) {
    e = e.evt;
    if (e.button !== 2) return;
    if (!embedding) return;

    const canvas = e.target;
    const rect = canvas.getBoundingClientRect();
    const point = [
      (e.clientX - rect.left) / rect.width,
      (e.clientY - rect.top) / rect.height,
    ];

    setPoints([
      ...points,
      {
        point,
        label: e.altKey ? 0 : 1,
      },
    ]);

    e.preventDefault();
    e.stopPropagation();
    return false;
  }

  function handleContextMenu(e) {
    e.evt.preventDefault();
  }

  const checkDeselect = (e) => {
    // const clickedOnEmpty = e.target === e.target.getStage();
    const clickedOnEmpty = e.target._id == 6;
    if (clickedOnEmpty) {
      setSelectedId(null);
    }
  };

  return (
    <div className="editor-container">
      {!embedding ? (
        <div
          className="skeleton-loader"
          style={{
            width: `${imageDimensions.width}px`,
            height: `${imageDimensions.height}px`,
          }}
        ></div>
      ) : (
        <div className="canvas-container">
          <Canvas
            onMouseDown={(e) => {
              handleMouseDown(e);
              checkDeselect(e);
            }}
            onClick={checkDeselect}
            onContextMenu={handleContextMenu}
            backgroundImageDataUrl={imageDataUrl}
            embedding={embedding}
            points={points}
            decoded={decoded}
            objects={objects}
            setObjects={setObjects}
            selectedId={selectedId}
            setSelectedId={setSelectedId}
            onScaleChange={setScale}
            dimensions={imageDimensions}
          />
        </div>
      )}
    </div>
  );
}

function Canvas({
  backgroundImageDataUrl,
  onMouseDown,
  onClick,
  onContextMenu,
  points,
  decoded,
  objects,
  setObjects,
  selectedId,
  setSelectedId,
  onScaleChange,
  dimensions,
}) {
  const [image] = useImage(backgroundImageDataUrl);
  const [maskImage] = useState(new window.Image());

  useEffect(() => {
    if (decoded) {
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = decoded.width;
      tempCanvas.height = decoded.height;
      const tempContext = tempCanvas.getContext("2d");
      const imageData = tempContext.createImageData(
        decoded.width,
        decoded.height
      );

      const pixelData = imageData.data;
      for (let i = 0; i < pixelData.length / 4; ++i) {
        if (decoded.data[i] === 1) {
          const offset = 4 * i;
          pixelData[offset] = 0;
          pixelData[offset + 1] = 114;
          pixelData[offset + 2] = 189;
          pixelData[offset + 3] = 255;
        }
      }

      tempContext.putImageData(imageData, 0, 0);
      maskImage.src = tempCanvas.toDataURL();
    }
  }, [decoded, maskImage]);

  return (
    <Stage
      width={dimensions.width}
      height={dimensions.height}
      onMouseDown={onMouseDown}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      <Layer>
        <Image
          image={image}
          width={dimensions.width}
          height={dimensions.height}
        />
        {decoded && (
          <Image
            image={maskImage}
            width={dimensions.width}
            height={dimensions.height}
            opacity={0.5}
          />
        )}

        {objects.map((object, index) => (
          <ExtractedObject
            key={index}
            index={index}
            object={object}
            isSelected={selectedId === index}
            onSelect={() => setSelectedId(index)}
            onChange={(newProps) => {
              const newObjects = [...objects];
              newObjects[index] = { ...newObjects[index], ...newProps };
              setObjects(newObjects);
            }}
          />
        ))}
      </Layer>
      <Layer>
        {points.map((point, index) => {
          const [x, y] = point.point;
          return (
            <Circle
              key={index}
              x={x * dimensions.width}
              y={y * dimensions.height}
              radius={5}
              fill={point.label === 1 ? "green" : "red"}
            />
          );
        })}
      </Layer>
    </Stage>
  );
}

function ExtractedObject({ object, index, isSelected, onSelect, onChange }) {
  const imageRef = useRef(null);
  const trRef = useRef(null);

  useEffect(() => {
    if (isSelected) {
      trRef.current.nodes([imageRef.current]);
      trRef.current.getLayer().batchDraw();
    }
  }, [isSelected]);

  useEffect(() => {
    const node = imageRef.current;
    const width = node.width();
    const height = node.height();

    node.to({
      scaleX: 1.05,
      scaleY: 1.05,
      duration: 0.2,
    });

    setTimeout(() => {
      node.to({
        scaleX: 1,
        scaleY: 1,
        duration: 0.2,
      });
    }, 200);
  }, []);

  return (
    <>
      <Image
        ref={imageRef}
        image={object.image}
        width={object.width}
        height={object.height}
        x={object.x}
        y={object.y}
        draggable
        onClick={onSelect}
        onTap={onSelect}
        onDragEnd={(e) => {
          onChange({
            ...object,
            x: e.target.x(),
            y: e.target.y(),
          });
        }}
        onTransformEnd={(e) => {
          const node = imageRef.current;
          const scaleX = node.scaleX();
          const scaleY = node.scaleY();

          node.scaleX(1);
          node.scaleY(1);

          onChange({
            ...object,
            x: node.x(),
            y: node.y(),
            width: Math.max(5, node.width() * scaleX),
            height: Math.max(5, node.height() * scaleY),
          });
        }}
      />
      {isSelected && (
        <Transformer
          ref={trRef}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 5 || newBox.height < 5) {
              return oldBox;
            }
            return newBox;
          }}
        />
      )}
    </>
  );
}
