<?php
// 旧代码在 PHP8 下会对未定义键/变量抛出 Warning，直接打印会破坏 header 跳转，这里只记录不输出
error_reporting(E_ALL & ~E_DEPRECATED & ~E_NOTICE);
ini_set('display_errors', '0');
session_start();
define('ROOT',__DIR__.'/../');
define('UPURL',__DIR__.'/');
require_once ROOT . 'vendor/autoload.php';
require(ROOT.'libs/functions.php');
function autoLoadClass($class){
    include(ROOT.str_replace('\\','/',$class).'.php');
}
spl_autoload_register('autoLoadClass');
$server_ext = '%F0%9F%92%95';
$server_path_item =2;
if(strstr(PHP_OS, 'WIN')){
    $server_ext = '💕';
    $server_path_item =1;
}
// 控制器/动作由 router.php 解析后经 $_GET 传入（内置服务器环境下 REQUEST_URI 不可靠）
$controller = $_GET['_c'] ?? 'IndexController';
$action  = $_GET['_a'] ?? 'index';
$controller = 'controllers\\'.$controller;
$C = new $controller;
if(method_exists($C, $action)){
    $C->$action();
}else{
    http_response_code(404);
    echo json_encode(['code'=>404,'msg'=>'页面不存在']);
}