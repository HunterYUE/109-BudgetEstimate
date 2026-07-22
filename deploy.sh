#!/bin/bash
# 前端部署脚本 — 确保从 dist/ 目录打包
set -e
cd "$(dirname "$0")"

echo "=== 构建前端 ==="
cd BudgetEstimateApp
npm run build

echo "=== 部署前端 ==="
cd dist
tar czf - . | ssh tencent-budget "cd /usr/share/nginx/html/budget && rm -rf * && tar xzf -"
echo "前端部署完成"

echo "=== 部署后端 ==="
cd ../../backend
tar czf - src/ --exclude='*.bak' | ssh tencent-budget "cd /opt/budget-estimate-api && tar xzf -"
ssh tencent-budget "systemctl restart budget-estimate-api.service"
echo "后端部署完成"
