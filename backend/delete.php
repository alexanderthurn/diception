<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// In a real app, you'd want auth here
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$input = file_get_contents('php://input');
$data = json_decode($input, true);

if (!isset($data['filename'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Filename required']);
    exit;
}

$filename = basename($data['filename']); // Prevent directory traversal
$filepath = __DIR__ . '/data/' . $filename;

if (file_exists($filepath)) {
    if (unlink($filepath)) {
        echo json_encode(['success' => true]);
    } else {
        http_response_code(500);
        echo json_encode(['error' => 'Failed to delete file']);
    }
} else {
    http_response_code(404);
    echo json_encode(['error' => 'File not found']);
}
