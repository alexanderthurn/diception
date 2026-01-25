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

$targetId = $data['id'];
$filepath = null;
$replaced = false;

// Search for existing file with this ID to replace it
$files = glob(__DIR__ . '/data/*.json');
foreach ($files as $file) {
    $content = json_decode(file_get_contents($file), true);
    if ($content && isset($content['id']) && $content['id'] === $targetId) {
        $filepath = $file;
        $replaced = true;
        break;
    }
}

// If no existing file found, create a new filename
if (!$filepath) {
    $cleanId = preg_replace('/[^a-zA-Z0-9_-]/', '', $targetId);
    $filename = 'map_' . $cleanId . '.json';

    // Fallback if cleanId is empty
    if ($filename === 'map_.json') {
        $filename = 'map_' . uniqid() . '.json';
    }

    $filepath = __DIR__ . '/data/' . $filename;
}

if (file_put_contents($filepath, json_encode($data, JSON_PRETTY_PRINT))) {
    echo json_encode([
        'success' => true,
        'filename' => basename($filepath),
        'id' => $targetId,
        'replaced' => $replaced
    ]);
} else {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to save file']);
}
