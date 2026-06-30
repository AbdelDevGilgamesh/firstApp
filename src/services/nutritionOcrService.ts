export type NutritionOcrResult = {
  text: string;
  source: 'ocr' | 'manual';
};

type TextExtractorModule = {
  extractTextFromImage?: (imageUri: string) => Promise<string[]>;
  isSupported?: boolean;
};

async function loadTextExtractor(): Promise<TextExtractorModule> {
  try {
    const packageName = ['expo', 'text', 'extractor'].join('-');
    const importer = new Function('moduleName', 'return import(moduleName)') as (
      moduleName: string,
    ) => Promise<TextExtractorModule>;

    return await importer(packageName);
  } catch {
    throw new Error('OCR is not available in this build.');
  }
}

export async function extractNutritionTextFromImage(imageUri: string): Promise<NutritionOcrResult> {
  try {
    const textExtractor = await loadTextExtractor();

    if (!textExtractor.isSupported || typeof textExtractor.extractTextFromImage !== 'function') {
      throw new Error('OCR is not available in this build.');
    }

    const lines = await textExtractor.extractTextFromImage(imageUri);
    const text = Array.isArray(lines) ? lines.join('\n').trim() : '';

    if (!text) {
      throw new Error('No text was detected in the selected image.');
    }

    return { text, source: 'ocr' };
  } catch (error) {
    if (error instanceof Error && error.message.includes('No text was detected')) {
      throw error;
    }

    throw new Error('OCR is not available in this build.');
  }
}
