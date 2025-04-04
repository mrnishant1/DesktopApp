let quantized = false; // change to `true` for a smaller model, but lower accuracy
import { AutoProcessor, CLIPVisionModelWithProjection, RawImage, AutoTokenizer, CLIPTextModelWithProjection } from '@xenova/transformers';
import fs from 'fs';
import sharp from 'sharp';
// Updated model to `openai/clip-vit-base-patch32`
let imageProcessor = await AutoProcessor.from_pretrained('xenova/clip-vit-base-patch32');
let visionModel = await CLIPVisionModelWithProjection.from_pretrained('xenova/clip-vit-base-patch32', { quantized });
let tokenizer = await AutoTokenizer.from_pretrained('xenova/clip-vit-base-patch32');
let textModel = await CLIPTextModelWithProjection.from_pretrained('xenova/clip-vit-base-patch32', { quantized });

function cosineSimilarity(A, B) {
    if (A.length !== B.length) throw new Error("A.length !== B.length");
    let dotProduct = 0, mA = 0, mB = 0;
    for (let i = 0; i < A.length; i++) {
        dotProduct += A[i] * B[i];
        mA += A[i] * A[i];
        mB += B[i] * B[i];
    }
    return dotProduct / (Math.sqrt(mA) * Math.sqrt(mB));
}

// Get image embedding
let image = await RawImage.read('icon.png');


console.log(image)
let imageInputs = await imageProcessor(image);
let { image_embeds } = await visionModel(imageInputs);

// Get text embeddings
let tasklist = JSON.parse(fs.readFileSync('labels.json', 'utf-8'));
let textInputs = tokenizer(tasklist, { padding: true, truncation: true, return_tensors: "pt" });
let { text_embeds } = await textModel(textInputs);

// Reshape text embeddings
let reshapedTextEmbeddings = [];
for (let i = 0; i < text_embeds.dims[0]; i++) {
    reshapedTextEmbeddings.push(text_embeds.data.slice(i * 512, (i + 1) * 512));
}

// Find best match
let bestTask = "not a chance";
let bestScore = -1;
tasklist.forEach((task, i) => {
    const similarity = cosineSimilarity(image_embeds.data, reshapedTextEmbeddings[i]);
    if (similarity > bestScore) {
        bestScore = similarity;
        bestTask = task;
    }
});

console.log(bestTask);