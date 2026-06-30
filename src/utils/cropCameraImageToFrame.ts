import * as ImageManipulator from 'expo-image-manipulator';

type CropCameraImageToFrameParams = {
  imageUri: string;
  imageWidth: number;
  imageHeight: number;
  previewWidth: number;
  previewHeight: number;
  frameX: number;
  frameY: number;
  frameWidth: number;
  frameHeight: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export async function cropCameraImageToFrame({
  imageUri,
  imageWidth,
  imageHeight,
  previewWidth,
  previewHeight,
  frameX,
  frameY,
  frameWidth,
  frameHeight,
}: CropCameraImageToFrameParams): Promise<string> {
  const imageRatio = imageWidth / imageHeight;
  const previewRatio = previewWidth / previewHeight;
  let displayedImageWidth: number;
  let displayedImageHeight: number;
  let offsetX: number;
  let offsetY: number;

  if (imageRatio > previewRatio) {
    displayedImageHeight = previewHeight;
    displayedImageWidth = previewHeight * imageRatio;
    offsetX = (displayedImageWidth - previewWidth) / 2;
    offsetY = 0;
  } else {
    displayedImageWidth = previewWidth;
    displayedImageHeight = previewWidth / imageRatio;
    offsetX = 0;
    offsetY = (displayedImageHeight - previewHeight) / 2;
  }

  const scaleX = imageWidth / displayedImageWidth;
  const scaleY = imageHeight / displayedImageHeight;
  const rawCropX = (frameX + offsetX) * scaleX;
  const rawCropY = (frameY + offsetY) * scaleY;
  const rawCropWidth = frameWidth * scaleX;
  const rawCropHeight = frameHeight * scaleY;
  const cropX = Math.round(clamp(rawCropX, 0, imageWidth - 1));
  const cropY = Math.round(clamp(rawCropY, 0, imageHeight - 1));
  const cropWidth = Math.round(clamp(rawCropWidth, 1, imageWidth - cropX));
  const cropHeight = Math.round(clamp(rawCropHeight, 1, imageHeight - cropY));

  console.log('[Nutrition crop] image', imageWidth, imageHeight);
  console.log('[Nutrition crop] preview', previewWidth, previewHeight);
  console.log('[Nutrition crop] frame', frameX, frameY, frameWidth, frameHeight);
  console.log('[Nutrition crop] crop', cropX, cropY, cropWidth, cropHeight);

  const result = await ImageManipulator.manipulateAsync(
    imageUri,
    [
      {
        crop: {
          originX: cropX,
          originY: cropY,
          width: cropWidth,
          height: cropHeight,
        },
      },
    ],
    {
      compress: 0.9,
      format: ImageManipulator.SaveFormat.JPEG,
    },
  );

  return result.uri;
}
