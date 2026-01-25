<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

$dataDir = __DIR__ . '/data';
if (!is_dir($dataDir)) {
    mkdir($dataDir, 0777, true);
}

$files = glob($dataDir . '/*.json');
$maps = [];

foreach ($files as $file) {
    $content = file_get_contents($file);
    $json = json_decode($content, true);
    if ($json) {
        // Ensure ID is not returned
        unset($json['id']);

        // Add metadata
        $json['filename'] = basename($file);
        $json['filesize'] = filesize($file);
        $json['filemtime'] = filemtime($file);
        $maps[] = $json;
    }
}

echo json_encode($maps);
