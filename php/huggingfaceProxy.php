<?php

require_once dirname(__DIR__) . '/vendor/autoload.php';

$dotenv = Dotenv\Dotenv::createImmutable(dirname(__DIR__));
$dotenv->load();

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);

if (!isset($input['inputs'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing inputs field']);
    exit;
}

$apiToken = $_ENV['HF_API_TOKEN'];

// Model: Multilingual Sentiment Analysis
// Switching to the most robust standard model to avoid 410/404 errors.
// cardiffnlp/twitter-xlm-roberta-base-sentiment (Multilingual)
// User requested model: tabularisai/multilingual-sentiment-analysis
$model = "tabularisai/multilingual-sentiment-analysis"; 

$url = "https://router.huggingface.co/hf-inference/models/" . $model;

$ch = curl_init($url);

curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($input));
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    "Authorization: Bearer " . $apiToken,
    "Content-Type: application/json"
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);

if (curl_errno($ch)) {
    http_response_code(500);
    echo json_encode(['error' => 'Curl error: ' . curl_error($ch)]);
} else {
    // Pass through the HTTP code from HF
    http_response_code($httpCode);
    
    // If error, log it for debugging (visible in PHP server console)
    if ($httpCode >= 400) {
        file_put_contents('php://stderr', "HF API Error ($httpCode): " . $response . "\n");
        // Ensure the frontend gets JSON
        if (json_decode($response) === null) {
             echo json_encode(['error' => 'Upstream Error', 'details' => $response]);
        } else {
             echo $response;
        }
    } else {
        echo $response;
    }
}

curl_close($ch);
