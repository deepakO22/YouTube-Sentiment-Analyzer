// sentiment-analysis.js - Headless Module

const SentimentThreshold = {
    Positive: 0.66,
    Neutral: 0.33,
    Negative: 0
};
const PAD_INDEX = 0;
const OOV_INDEX = 2;

// URLs for the model
const MODEL_URLS = {
    model: 'https://storage.googleapis.com/tfjs-models/tfjs/sentiment_cnn_v1/model.json',
    metadata: 'https://storage.googleapis.com/tfjs-models/tfjs/sentiment_cnn_v1/metadata.json'
};

let model, metadata;

async function setupSentimentModel() {
    if (typeof model === 'undefined') {
        model = await loadModel(MODEL_URLS.model);
    }
    if (typeof metadata === 'undefined') {
        metadata = await loadMetadata(MODEL_URLS.metadata);
    }
    return true; // Loaded
}

async function loadModel(url) {
    try {
        return await tf.loadLayersModel(url);
    } catch (err) {
        console.error("Model Load Error:", err);
    }
}

async function loadMetadata(url) {
    try {
        const metadataJson = await fetch(url);
        return await metadataJson.json();
    } catch (err) {
        console.error("Metadata Load Error:", err);
    }
}

function padSequences(sequences, maxLen, padding = 'pre', truncating = 'pre', value = PAD_INDEX) {
    return sequences.map(seq => {
        if (seq.length > maxLen) {
            if (truncating === 'pre') {
                seq.splice(0, seq.length - maxLen);
            } else {
                seq.splice(maxLen, seq.length - maxLen);
            }
        }

        if (seq.length < maxLen) {
            const pad = [];
            for (let i = 0; i < maxLen - seq.length; ++i) {
                pad.push(value);
            }
            if (padding === 'pre') {
                seq = pad.concat(seq);
            } else {
                seq = seq.concat(pad);
            }
        }

        return seq;
    });
}

function classifyComment(text) {
    if (!model || !metadata) {
        console.error("Model not loaded yet!");
        return { score: 0, label: 'neutral' };
    }

    const inputText = text.trim().toLowerCase().replace(/(\.|\,|\!)/g, '').split(' ');
    // Convert words to indices
    const sequence = inputText.map(word => {
        let wordIndex = metadata.word_index[word] + metadata.index_from;
        if (wordIndex > metadata.vocabulary_size) {
            wordIndex = OOV_INDEX;
        }
        return wordIndex;
    });

    const paddedSequence = padSequences([sequence], metadata.max_len);
    const input = tf.tensor2d(paddedSequence, [1, metadata.max_len]);

    const predictOut = model.predict(input);
    const score = predictOut.dataSync()[0];
    predictOut.dispose();

    let label = 'neutral';
    if (score > SentimentThreshold.Positive) {
        label = 'positive';
    } else if (score > SentimentThreshold.Neutral) {
        label = 'neutral';
    } else {
        label = 'negative';
    }

    return { score: score, label: label };
}

// Expose functions globally
window.SentimentAnalyzer = {
    init: setupSentimentModel,
    predict: classifyComment
};