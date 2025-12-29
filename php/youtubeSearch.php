<?php

require_once dirname(__DIR__) . '/vendor/autoload.php';

$dotenv = Dotenv\Dotenv::createImmutable(dirname(__DIR__));
$dotenv->load();

$response = new stdClass();

if (!isset($_GET['q'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Query is required']);
    exit;
}

$query = $_GET['q'];

$client = new Google_Client();
$client->setApplicationName('YouTube Comment Sentiment Analysis');
$client->setDeveloperKey($_ENV['YOUTUBE_API_KEY']);

$youtube = new Google_Service_YouTube($client);

try {
    $searchResponse = $youtube->search->listSearch('snippet', array(
        'q' => $query,
        'maxResults' => 10,
        'type' => 'video'
    ));

    $videos = [];
    foreach ($searchResponse['items'] as $searchResult) {
        $video = [];
        $video['videoId'] = $searchResult['id']['videoId'];
        $video['title'] = $searchResult['snippet']['title'];
        $video['description'] = $searchResult['snippet']['description'];
        $video['thumbnail'] = $searchResult['snippet']['thumbnails']['medium']['url'];
        $video['channelTitle'] = $searchResult['snippet']['channelTitle'];
        $video['publishedAt'] = $searchResult['snippet']['publishedAt'];
        $videos[] = $video;
    }

    echo json_encode(['videos' => $videos]);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
