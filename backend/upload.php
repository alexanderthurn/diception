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

// Simple validation
if (!isset($data['id'])) {
    $data['id'] = uniqid();
}

// Use ID as filename if possible, otherwise uniqid
$filename = uniqid('map_') . '.json';
if (isset($data['name'])) {
    $cleanName = preg_replace('/[^a-zA-Z0-9_-]/', '', $data['name']);
    if (!empty($cleanName)) {
        $filename = $cleanName . '_' . uniqid() . '.json';
    }
}

$filepath = __DIR__ . '/data/' . $filename;

if (file_put_contents($filepath, json_encode($data, JSON_PRETTY_PRINT))) {
    echo json_encode(['success' => true, 'filename' => $filename]);
} else {
    http_response_code(500);
    echo json_encode(['error' => 'Failed to save file']);
}
