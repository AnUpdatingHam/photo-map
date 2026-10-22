#!/bin/bash
# Photo-Map 本地启动脚本（PHP 内置服务器）
DIR="$(cd "$(dirname "$0")" && pwd)"
PHP=/Users/bytedance/php82/bin/php
PORT=9999
echo "启动 Photo-Map: http://127.0.0.1:${PORT}/"
echo "按 Ctrl+C 停止"
exec "$PHP" -d upload_max_filesize=50M -d post_max_size=60M -d memory_limit=256M -S 127.0.0.1:${PORT} -t "$DIR/public" "$DIR/public/router.php"
