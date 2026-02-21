import * as tf from '@tensorflow/tfjs-node';
import path from 'path';

let localModel = null;

export const loadLocalModel = async () => {
    try {
        if (!localModel) {
            // Load the converted model
            const modelPath = 'file://' + path.resolve('./model_json/model.json');
            localModel = await tf.loadLayersModel(modelPath);
            console.log("✅ Local AI Model Loaded Successfully!");
        }
        return localModel;
    } catch (error) {
        console.error("❌ Failed to load Local AI Model. Did you run the python script and convert it?", error);
        return null;
    }
};

export const runPrediction = async (inputData) => {
    try {
        const model = await loadLocalModel();
        if (!model) return null;

        // Ensure inputData is a 1D array of 10 numbers (matching the python model input_shape=(10,))
        const tensorInput = tf.tensor2d([inputData], [1, 10]);
        const prediction = model.predict(tensorInput);

        // Extract array from Tensor
        const result = await prediction.data();

        // Cleanup memory
        tensorInput.dispose();
        prediction.dispose();

        return result[0];
    } catch (error) {
        console.error("Prediction Error:", error);
        return null;
    }
};
