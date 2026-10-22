<?php

//视图函数
function view($file,$data=[]){
    //如果传了数据就要把数组展开成变量
    if($data){
        extract($data);
    }
    include(ROOT.'views/'.str_replace('.','/',$file).'.html');
}

//配置信息函数
function config($name){
    static $config = null;
    if($config==null){
        $config = include(ROOT.'config.php');
    }
    return $config[$name];
}

//跳转函数
function redirect($url){
    header('Location:'.$url);
    exit;
}

function back(){
    redirect($_SERVER['HTTP_REFERER']);
}

//提示信息
function mess($mess){
    $_SESSION['mess']=$mess;
}

//xss处理
function e($content){
    return htmlspecialchars($content);
}

//表单token
function csrf(){
    if(!isset($_SESSION['token'])){
        $token = md5(rand(1,99999).microtime());
        $_SESSION['token']=$token;
    }
}

//获取经纬度
function getGps($exifCoord, $hemi) {
    $degrees = count($exifCoord) > 0 ? gps2Num($exifCoord[0]) : 0;
    $minutes = count($exifCoord) > 1 ? gps2Num($exifCoord[1]) : 0;
    $seconds = count($exifCoord) > 2 ? gps2Num($exifCoord[2]) : 0;
    $flip = ($hemi == 'W' or $hemi == 'S') ? -1 : 1;
    return $flip * ($degrees + $minutes / 60 + $seconds / 3600);
}

function gps2Num($coordPart) {
    $parts = explode('/', $coordPart);
    if (count($parts) <= 0)
        return 0;
    if (count($parts) == 1)
        return $parts[0];
    return floatval($parts[0]) / floatval($parts[1]);
}

//获取地理信息
function getGpsInfo($lon,$lat){
    $url = "http://restapi.amap.com/v3/geocode/regeo?location={$lon},{$lat}&key=".config('map-key');
    return json_decode(file_get_contents($url),1);
}

//获取拍摄时间
function getDateTime($exif){
    return $exif['DateTimeOriginal'];
}

//获取拍摄设备
function getMake($exif){
    return $exif['Make'].' '.$exif['Model'];
}

//输出函数
function dd($variable){
    var_dump($variable);
    die;
}

//加盐
function encryption($value,$type=0){
    $key=config('encryption_key');
    if($type == 0){//加密
        return str_replace('=','',base64_encode($value^$key));
    }else{
        $value = base64_decode($value);
        return $value ^ $key;
    }
}

//创建目录函数
function makeDir($dir){
    if(!is_dir($dir)){
        mkdir($dir, 0777, true);
    }
}

//缩略图文件名：统一用 jpg 后缀，保证浏览器能直接显示（TIFF/HEIC 等源格式也能用）
function thumb_name($filename){
    $base = pathinfo(basename($filename), PATHINFO_FILENAME);
    $base = preg_replace('/[\\\\\/:*?"<>|\x00-\x1F]+/u', '_', $base);
    return 'SL_'.$base.'_'.substr(md5($filename), 0, 8).'.jpg';
}

//图片缩略函数
// 固定最大边缩放：长边不超过 $maxSize，短边按比例，绝不放大
// 之前用 0.4 比例缩放的问题：大图缩完仍然很大（4000x3000 -> 1600x1200），
// 小图缩完可能变成 0px（1x1 -> 0），既起不到缩略图作用，也会让 GD 报错。
function suolue($filename,$savePath,$maxSize=320){
    $info = @getimagesize($filename);
    if(!$info) return suolue_fallback($filename,$savePath,$maxSize);
    $width = (int)$info[0];
    $height = (int)$info[1];
    if($width < 1 || $height < 1) return suolue_fallback($filename,$savePath,$maxSize);

    $scale = min(1, $maxSize / max($width, $height));
    $n_w = max(1, (int)round($width * $scale));
    $n_h = max(1, (int)round($height * $scale));

    // GD 的 imagecreatefromstring 支持 jpg/png/gif/webp/bmp/wbmp 等常见格式
    $img = @imagecreatefromstring(file_get_contents($filename));
    if(!$img) return suolue_fallback($filename,$savePath,$maxSize);

    $new = imagecreatetruecolor($n_w, $n_h);
    if(!$new){
        imagedestroy($img);
        return suolue_fallback($filename,$savePath,$maxSize);
    }
    // PNG/GIF 可能有透明通道，缩略图先铺白底，避免变黑
    imagefill($new, 0, 0, imagecolorallocate($new, 255, 255, 255));
    imagecopyresampled($new, $img, 0, 0, 0, 0, $n_w, $n_h, $width, $height);
    $ok = imagejpeg($new, $savePath, 85);
    imagedestroy($new);
    imagedestroy($img);
    if($ok && is_file($savePath) && filesize($savePath) > 0) return true;
    return suolue_fallback($filename,$savePath,$maxSize);
}

// 缩略图后备方案：GD 解不了的格式（如 HEIC/TIFF）尝试 Imagick 或系统命令
function suolue_fallback($filename,$savePath,$maxSize=320){
    $maxSize = (int)$maxSize;
    if($maxSize < 1) $maxSize = 320;

    // 1) Imagick 扩展（用 extension_loaded 判断，避免触发项目自动加载器）
    if(extension_loaded('imagick') && class_exists('Imagick', false)){
        try{
            $im = new \Imagick($filename);
            try{ $im->setImageBackgroundColor('white'); }catch(\Throwable $e){}
            try{ $im->setImageAlphaChannel(\Imagick::ALPHACHANNEL_REMOVE); }catch(\Throwable $e){}
            $im->thumbnailImage($maxSize, $maxSize, true);
            $im->setImageFormat('jpeg');
            $im->setImageCompressionQuality(85);
            $ok = $im->writeImage($savePath);
            $im->clear();
            $im->destroy();
            if($ok && is_file($savePath) && filesize($savePath) > 0) return true;
        }catch(\Throwable $e){
            // 继续尝试系统命令
        }
    }

    // 2) 系统命令：macOS 自带 sips 可处理 HEIC；Linux 常见 ImageMagick / vips
    if(!function_exists('exec')) return false;
    $cmds = [];
    if(PHP_OS_FAMILY === 'Darwin' && is_executable('/usr/bin/sips')){
        $cmds[] = '/usr/bin/sips -s format jpeg --resampleHeightWidthMax ' . $maxSize
            . ' ' . escapeshellarg($filename) . ' --out ' . escapeshellarg($savePath);
    }
    if(is_executable('/usr/bin/convert')){
        $cmds[] = '/usr/bin/convert ' . escapeshellarg($filename)
            . ' -thumbnail ' . $maxSize . 'x' . $maxSize
            . ' -background white -alpha remove -alpha off -quality 85 '
            . escapeshellarg($savePath);
    }
    if(is_executable('/usr/bin/magick')){
        $cmds[] = '/usr/bin/magick ' . escapeshellarg($filename)
            . ' -thumbnail ' . $maxSize . 'x' . $maxSize
            . ' -background white -alpha remove -alpha off -quality 85 '
            . escapeshellarg($savePath);
    }
    if(is_executable('/usr/bin/vips')){
        $cmds[] = '/usr/bin/vips thumbnail ' . escapeshellarg($filename) . ' ' . escapeshellarg($savePath) . ' ' . $maxSize;
    }

    foreach($cmds as $cmd){
        $out = [];
        $rc = 1;
        @exec($cmd . ' 2>/dev/null', $out, $rc);
        if($rc === 0 && is_file($savePath) && filesize($savePath) > 0) return true;
        if(is_file($savePath)) @unlink($savePath);
    }
    return false;
}
