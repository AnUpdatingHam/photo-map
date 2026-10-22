<?php
// PHP 内置服务器路由脚本：静态文件直接返回，其余请求解析 💕 路由后交给 index.php
$uri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
// 静态文件判断必须用解码后的路径，否则中文/空格等百分号编码的路径会判断失败
$decoded = rawurldecode((string)$uri);
$static = __DIR__ . $decoded;
if ($uri !== '/' && is_file($static)) {
    return false;
}

// 直接在这里解析控制器/动作（内置服务器传给 index.php 时 REQUEST_URI 会退化成 /）
$_GET['_c'] = 'IndexController';
$_GET['_a'] = 'index';
if (preg_match('#/([^/]+)💕/?([^/]*)#u', $decoded, $m)) {
    $_GET['_c'] = ucfirst($m[1] . 'Controller');
    $_GET['_a'] = $m[2] !== '' ? $m[2] : 'index';
}

require __DIR__ . '/index.php';
