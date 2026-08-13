#!/bin/bash
# 部署脚本 — Budget 前端 + 共享后端：先跑后端门禁（tsc + vitest），再构建部署前端，最后发后端 src
set -e
cd "$(dirname "$0")"

echo "=== 后端门禁（tsc + vitest）==="
cd backend
npm run build
echo "后端门禁通过"

echo "=== 构建前端 ==="
cd ../BudgetEstimateApp
npm run build

echo "=== 部署前端 ==="
cd dist
tar czf - . | ssh tencent-budget "cd /usr/share/nginx/html/budget && rm -rf * && tar xzf -"
echo "前端部署完成"

echo "=== 部署后端 ==="
cd ../../backend
tar czf - --exclude='*.bak' src/ | ssh tencent-budget "cd /opt/budget-estimate-api && tar xzf -"
ssh tencent-budget "systemctl restart budget-estimate-api.service"
echo "后端部署完成"
