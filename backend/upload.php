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

// Ensure name exists
if (!isset($data['name']) || empty($data['name'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing map name']);
    exit;
}

// Remove any ID that might have been sent
unset($data['id']);

$targetName = $data['name'];
$filepath = null;
$action = 'created';

// Search for existing file with this name
$files = glob(__DIR__ . '/data/*.json');
foreach ($files as $file) {
    $content = json_decode(file_get_contents($file), true);
    if ($content && isset($content['name']) && $content['name'] === $targetName) {
        if ($settings['overwriteMode'] === 'replace') {
            $filepath = $file;
            $action = 'replaced';
        } else {
            // "new" mode: generate a new unique name
            $targetName .= ' (' . substr(md5(uniqid()), 0, 5) . ')';
            $data['name'] = $targetName;
            $action = 'duplicated';
        }
        break;
    }
}

// If no existing file found or name changed (duplicated)
if (!$filepath) {
    // Filename logic: use the name, convert spaces to underscores, keep it alpha-numeric
    $cleanFilename = preg_replace('/[^a-zA-Z0-9_-]/', '_', $targetName);
    if (empty($cleanFilename))
        $cleanFilename = 'map_' . uniqid();

    $filepath = __DIR__ . '/data/' . $cleanFilename . '.json';

    // Check if THIS specific filename exists (collision of cleaned names)
    if (file_exists($filepath)) {
        $filepath = __DIR__ . '/data/' . $cleanFilename . '_' . uniqid() . '.json';
    }
}

if (file_put_contents($filepath, json_encode($data, JSON_PRETTY_PRINT))) {
    $messages = [
        'replaced' => "Map '{$targetName}' has been updated (overwritten).",
        'duplicated' => "A duplicate was created as '{$targetName}'.",
        'created' => "Map '{$targetName}' was successfully uploaded."
    ];

    echo json_encode([
        'success' => true,
        'action' => $action,
        'message' => $messages[$action],
        'filename' => basename($filepath),
        'name' => $targetName
    ]);
} else {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to save file on the server.']);
}
