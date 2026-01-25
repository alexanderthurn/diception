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

$settingsFile = __DIR__ . '/settings.json';
$settings = [
    "allowUploads" => isset($data['allowUploads']) ? (bool) $data['allowUploads'] : true,
    "overwriteMode" => isset($data['overwriteMode']) ? $data['overwriteMode'] : "replace"
];

if (file_put_contents($settingsFile, json_encode($settings, JSON_PRETTY_PRINT))) {
    echo json_encode(['success' => true, 'settings' => $settings]);
} else {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to save settings']);
}
