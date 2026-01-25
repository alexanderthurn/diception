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
        // Add metadata to the json content itself so it's all in one object
        $json['filename'] = basename($file);
        $json['filesize'] = filesize($file);
        $json['filemtime'] = filemtime($file);
        $maps[] = $json;
    }
}

echo json_encode($maps);
