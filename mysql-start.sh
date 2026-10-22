#!/bin/bash
# 启动本地 MySQL 8.0.29（127.0.0.1:3306，root 空密码，库 photo_map）
M=/Users/bytedance/mysql/mysql-8.0.29-macos12-arm64
if $M/bin/mysqladmin --socket=/Users/bytedance/mysql/data/mysql.sock -u root ping >/dev/null 2>&1; then
  echo "MySQL 已在运行"
  exit 0
fi
nohup $M/bin/mysqld --no-defaults --basedir=$M \
  --datadir=/Users/bytedance/mysql/data \
  --bind-address=127.0.0.1 --port=3306 \
  --socket=/Users/bytedance/mysql/data/mysql.sock \
  --mysqlx=OFF \
  --log-error=/Users/bytedance/mysql/data/error.log \
  >/Users/bytedance/mysql/data/stdout.log 2>&1 &
for i in $(seq 1 20); do
  if $M/bin/mysqladmin --socket=/Users/bytedance/mysql/data/mysql.sock -u root ping >/dev/null 2>&1; then
    echo "MySQL 已启动: 127.0.0.1:3306 (库 photo_map)"
    exit 0
  fi
  sleep 1
done
echo "MySQL 启动失败，查看 /Users/bytedance/mysql/data/error.log"
exit 1
