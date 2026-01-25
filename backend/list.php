<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

$dataDir = __DIR__ . '/data';
$files = glob($dataDir . '/*.json');
$maps = [];

foreach ($files as $file) {
    $content = file_get_contents($file);
    $json = json_decode($content, true);
    if ($json) {
        $maps[] = [
            'filename' => basename($file),
            'id' => $json['id'] ?? null,
            'name' => $json['name'] ?? 'Untitled',
            'author' => $json['author'] ?? 'Unknown',
            'type' => $json['type'] ?? 'map',
            'size' => filesize($file),
            'created' => filemtime($file)
        ];
    }
}

echo json_encode($maps);
