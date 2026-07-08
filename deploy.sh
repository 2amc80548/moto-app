#!/bin/bash
set -e

echo "===> 1. Compilando el proyecto Vite..."
npm run build

echo "===> 2. Entrando a la carpeta de Terraform..."
cd terraform

echo "===> 3. Inicializando Terraform..."
terraform init

echo "===> 4. Aplicando cambios en AWS..."
terraform apply -auto-approve

echo ""
echo "=== DESPLIEGUE REALIZADO CON ÉXITO ==="
