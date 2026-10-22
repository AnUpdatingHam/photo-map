#!/bin/bash
M=/Users/bytedance/mysql/mysql-8.0.29-macos12-arm64
$M/bin/mysqladmin --socket=/Users/bytedance/mysql/data/mysql.sock -u root shutdown 2>/dev/null && echo "MySQL 已停止" || echo "MySQL 未在运行"
