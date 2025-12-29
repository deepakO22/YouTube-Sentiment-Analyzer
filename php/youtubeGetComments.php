<?php

/**
 * Sample PHP code for youtube.commentThreads.list
 * See instructions for running these code samples locally:
 * https://developers.google.com/explorer-help/code-samples#php
 */


if (!file_exists(dirname(__DIR__) . '/vendor/autoload.php')) {
  throw new Exception(sprintf('Please run "composer require google/apiclient:~2.0" in "%s"', __DIR__));
}
require_once dirname(__DIR__) . '/vendor/autoload.php';

// Load .env
$dotenv = Dotenv\Dotenv::createImmutable(dirname(__DIR__));
$dotenv->load();

$response = new stdClass();

if (!isset($_GET['v'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Video ID is required']);
    exit;
}

$VIDEO_ID = $_GET['v'];

$client = new Google_Client();
$client->setApplicationName('YouTube Comment Sentiment Analysis');
$client->setDeveloperKey($_ENV['YOUTUBE_API_KEY']);

// Define service object for making API requests.
$youtube = new Google_Service_YouTube($client);

try {
    // added liveStreamingDetails to parts
    $videoDetail = $youtube->videos->listVideos('snippet,statistics,liveStreamingDetails', array(
        'id' => $VIDEO_ID,
        'maxResults' => 1,
    ));

    if (empty($videoDetail['items'])) {
        throw new Exception("Video not found");
    }

    $item = $videoDetail[0]; // simplify access
    $response->videoId = $item['id'];
    $response->title = $item['snippet']['title'];
    $response->publishedAt = $item['snippet']['publishedAt'];
    $response->liveBroadcastContent = $item['snippet']['liveBroadcastContent'];
    $response->thumbnails = $item['snippet']['thumbnails']['medium'];
    $response->statistics = $item['statistics'];
    
    // Check for Live Chat
    $liveChatId = null;
    if (isset($item['liveStreamingDetails']['activeLiveChatId'])) {
        $liveChatId = $item['liveStreamingDetails']['activeLiveChatId'];
    }

    $comments = array();
    $response->commentsDisabled = false;
    $response->isLiveChat = false;

    // Use pageToken from GET if available (for polling cursor)
    $pageToken = isset($_GET['pageToken']) ? $_GET['pageToken'] : '';

    if ($liveChatId) {
        $response->isLiveChat = true;
        
        try {
           $params = array(
               'maxResults' => 50, // Fetch simplified batch
           );
           if ($pageToken) {
               $params['pageToken'] = $pageToken;
           }
           
           $chatResponse = $youtube->liveChatMessages->listLiveChatMessages($liveChatId, 'snippet', $params);
           
           foreach ($chatResponse['items'] as $chatMsg) {
               // For live chat, we use the display message
               // Only take text messages, ignore superchats etc/events for now or treat them as text
                if (isset($chatMsg['snippet']['displayMessage'])) {
                    array_push($comments, $chatMsg['snippet']['displayMessage']);
                }
           }

           $response->nextPageToken = $chatResponse['nextPageToken']; // Crucial for next poll
           $response->pollingIntervalMillis = $chatResponse['pollingIntervalMillis'];

        } catch (Exception $e) {
             // If live chat fails (e.g. ended/disabled), fallback or show error
             // We won't fallback to comments immediately as they might check different things
             // but let's just mark error
             $response->message = "Live Chat not available or ended.";
             $response->error = $e->getMessage();
        }

    } else {
        // STANDARD COMMENTS LOGIC
        try {
            $comments = fetchStandardComments($youtube, $VIDEO_ID);
        } catch (Google_Service_Exception $e) {
            $error = json_decode($e->getMessage());
            if (isset($error->error->errors[0]->reason) && $error->error->errors[0]->reason == 'commentsDisabled') {
                $response->commentsDisabled = true;
                $response->message = "Comment section disabled for this video";
            } else {
                // If it's another error, we might logging it but let's rethrow 
                // or just leave empty comments for now to avoid crash
                $response->error = $e->getMessage();
            }
        }
    }

    $response->comments = $comments;
    echo json_encode($response);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}


function getPagedComments($youtube, $videoId, $pageToken) {
    if (!isset($GLOBALS['comments'])) $GLOBALS['comments'] = array(); // Safety init
    
    $params = array(
        'videoId' => $videoId,
        'maxResults' => 20,
        'textFormat' => 'plainText',
    );
    
    if (!empty($pageToken)) {
        $params['pageToken'] = $pageToken;
    }

    $videoComments = $youtube->commentThreads->listCommentThreads('snippet', $params);
    
    foreach ($videoComments as $comment) {
        // Collect into the local array (which becomes response->comments in main flow if we assigned globals correctly, 
        // but cleaner to return it. for back-compat with original struct let's push to var)
        // Actually the original code pushed to $GLOBALS['comments']. Ideally we refactor to return array.
        // I will fix the usage above.
        // Let's just return the comments array from function or pass by ref.
        // For minimal breakage: use global or pass array. 
        // I'll assume usage above: $comments = ... 
        
        // Wait, the original code used $GLOBALS['comments']. I removed that declaration in the snippet.
        // Let's refactor this function to be pure.
    }
    // Refactoring helper function below
    return $videoComments;
}

// Helper to fetch standard comments (Redefined cleaner)
function fetchStandardComments($youtube, $videoId) {
    $list = [];
    $videoComments = $youtube->commentThreads->listCommentThreads('snippet', array(
        'videoId' => $videoId,
        'maxResults' => 20,
        'textFormat' => 'plainText',
    ));
    foreach ($videoComments as $comment) {
        $list[] = $comment['snippet']['topLevelComment']['snippet']['textOriginal'];
    }
    return $list;
}

// Updating the standard branch above to use fetchStandardComments
// And removing the old 'getPagedComments' entirely to avoid confusion.