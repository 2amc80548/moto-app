#!/bin/bash
set -e

echo "===> 1. Entrando a la carpeta de Terraform..."
cd terraform

echo "===> 2. Destruyendo infraestructura de AWS..."
terraform destroy -auto-approve

echo "===> 3. Eliminando archivos temporales locales de Terraform..."
rm -rf .terraform
rm -f .terraform.lock.hcl
rm -f terraform.tfstate
rm -f terraform.tfstate.backup

echo ""
echo "=== LIMPIEZA COMPLETA FINALIZADA ==="
