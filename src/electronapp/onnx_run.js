import ort from "onnxruntime-node";
import path from "path";
import { fileURLToPath } from "url";
import screenshotDesktop from "screenshot-desktop";
import sharp from "sharp";
import fs from 'fs'
// import cosineSimilarity from 'compute-cosine-similarity';
let quantized = false; // Change to `true` for smaller model (lower accuracy)
import { AutoTokenizer,CLIPTextModelWithProjection } from "@xenova/transformers";
let tokenizer = await AutoTokenizer.from_pretrained('Xenova/clip-vit-base-patch16');
let textModel = await CLIPTextModelWithProjection.from_pretrained('Xenova/clip-vit-base-patch16', { quantized });
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const modelPath = path.join(__dirname, "../models", "mobileclip36B.onnx");

//Creating text embeddings---------------------
async function encodeText() {
  let texts = JSON.parse(fs.readFileSync(path.join(__dirname, "labels.json")));
  let textInputs = tokenizer(texts, { padding: true, truncation: true });
  let { text_embeds } = await textModel(textInputs);

  // Reshape into array of 95 vectors (each of size 512)
  let reshapedTextEmbeddings = [];
  for (let i = 0; i < text_embeds.dims[0]; i++) {
    reshapedTextEmbeddings.push(text_embeds.data.slice(i * 512, (i + 1) * 512));
  }

  return reshapedTextEmbeddings; // Now it's an array of [95, 512]
}

// 🔍 Find best matching label
function findBestMatch(imageEmbedding, textEmbedding) {
  let bestIndex = 0;
  let bestScore = -1;
  imageEmbedding = Array.from(imageEmbedding); // Convert to array

  textEmbedding.forEach((Embedding, i) => {
      const vecB = Array.from(Embedding); // Ensure it's an array
      const similarity = cosineSimilarity(imageEmbedding, vecB);
      if (similarity > bestScore) {
          bestScore = similarity;
          bestIndex = i;
      }
  });

  return bestIndex;
}

//help finding similarity in both tasktext and predictedLabel text embedding-----------------------------
function cosineSimilarity(vecA, vecB) {
  const dotProduct = vecA.reduce((sum, val, i) => sum + val * vecB[i], 0);
  const normA = Math.sqrt(vecA.reduce((sum, val) => sum + val * val, 0));
  const normB = Math.sqrt(vecB.reduce((sum, val) => sum + val * val, 0));
  return dotProduct / (normA * normB);
}

// Convert image to tensor
async function preprocessImage() {
  //capturing image--------
  const imgBuffer = await screenshotDesktop();
  if (!imgBuffer || imgBuffer.length === 0) {
    console.error("Something went wrong with image capture");
    return;
  }
  console.log("Image captured");

  // Preprocess image (resize, normalize, convert to tensor)
  const processedImage = await sharp(imgBuffer)
    .resize(224, 224) // Resize to match model input
    .removeAlpha() // Ensure no alpha channel
    .raw()
    .toBuffer();

 // Convert image data to Float32 tensor (normalize values to [0,1])
  const numPixels = 224 * 224;
  const floatArray = new Float32Array(3 * numPixels);
 // ONNX expects (C, H, W), but sharp outputs (H, W, C), so we reorder
  for (let i = 0; i < numPixels; i++) {
    floatArray[i] = processedImage[i] / 255.0; // R
    floatArray[i + numPixels] = processedImage[i + numPixels] / 255.0; // G
    floatArray[i + 2 * numPixels] = processedImage[i + 2 * numPixels] / 255.0; // B
  }

  // Create ONNX tensor (parameters like: [1, 3, 224, 224])
  return   new ort.Tensor("float32", floatArray, [1, 3, 224, 224]);


 }

export default async function main_onnx() {
  try {
    //-------------------------------------------------------------
    const imageTensor = await preprocessImage();
    const session = await ort.InferenceSession.create(modelPath);

    // Run inference
    let Imageresults = await session.run({ "input": imageTensor });
    let imageEmbedding = Imageresults["output"].data//return an array
    console.log("Image results are:   ");
    // console.log(imageEmbedding); //image embeddings---------------

    let Textresults = await encodeText();//return an array
    console.log("text resulsts arre:  " );
    // console.log(Textresults); //Text tesults---------------

    const BestIndex = findBestMatch(imageEmbedding, Textresults );
    let textArray = JSON.parse(fs.readFileSync(path.join(__dirname, "labels.json")));
    console.log(textArray[BestIndex]);

  } catch (err) {
    console.error("Error running the model:", err);
  }
}

main_onnx();
