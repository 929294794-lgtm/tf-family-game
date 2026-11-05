#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "没有检测到 Node.js。请先安装 Node.js 18 或更新版本：https://nodejs.org/"
  read -r -p "按回车键退出..."
  exit 1
fi
node server.js
