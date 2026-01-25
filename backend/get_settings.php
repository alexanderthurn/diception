<?php
header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json');

$settingsFile = __DIR__ . '/settings.json';
if (!file_exists($settingsFile)) {
    echo json_encode(["allowUploads" => true, "overwriteMode" => "replace"]);
} else {
    echo file_get_contents($settingsFile);
}
