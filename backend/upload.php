<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

// Load settings
$settingsFile = __DIR__ . '/settings.json';
$settings = ["allowUploads" => true, "overwriteMode" => "replace"];
if (file_exists($settingsFile)) {
    $settings = json_decode(file_get_contents($settingsFile), true);
}

// Check if uploads are allowed
if (!$settings['allowUploads']) {
    http_response_code(403);
    echo json_encode(['error' => 'Uploading is currently not allowed by the administrator.']);
    exit;
}

$input = file_get_contents('php://input');
$data = json_decode($input, true);

if (!$data) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid JSON']);
    exit;
}

// Ensure ID exists
if (!isset($data['id'])) {
    $data['id'] = uniqid('online_');
}

$originalId = $data['id'];
$targetId = $data['id'];
$filepath = null;
$action = 'created'; // default

// Search for existing file with this ID
$files = glob(__DIR__ . '/data/*.json');
foreach ($files as $file) {
    $content = json_decode(file_get_contents($file), true);
    if ($content && isset($content['id']) && $content['id'] === $targetId) {
        if ($settings['overwriteMode'] === 'replace') {
            $filepath = $file;
            $action = 'replaced';
        } else {
            // "new" mode: always generate a new ID to avoid overwriting
            $targetId .= '_' . substr(md5(uniqid()), 0, 5);
            $data['id'] = $targetId;
            $action = 'duplicated';
        }
        break;
    }
}

// If no existing file path found (either in 'new' mode or 'replace' mode with no match)
if (!$filepath) {
    $cleanId = preg_replace('/[^a-zA-Z0-9_-]/', '', $targetId);
    $filename = 'map_' . $cleanId . '.json';

    // Check for filename collision even if ID is new
    if (file_exists(__DIR__ . '/data/' . $filename)) {
        $filename = 'map_' . $cleanId . '_' . uniqid() . '.json';
    }

    $filepath = __DIR__ . '/data/' . $filename;
}

if (file_put_contents($filepath, json_encode($data, JSON_PRETTY_PRINT))) {
    $messages = [
        'replaced' => "Map '{$data['name']}' has been updated (overwritten).",
        'duplicated' => "A duplicate of '{$data['name']}' was created with a new ID ({$targetId}).",
        'created' => "Map '{$data['name']}' was successfully uploaded."
    ];

    echo json_encode([
        'success' => true,
        'action' => $action,
        'message' => $messages[$action],
        'filename' => basename($filepath),
        'id' => $targetId
    ]);
} else {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to save file on the server.']);
}
