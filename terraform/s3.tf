# --- BUCKET S3 PARA ALOJAR EL SITIO WEB ---
resource "aws_s3_bucket" "frontend" {
  bucket        = var.bucket_name
  force_destroy = true # Borra todos los archivos automáticamente al destruir la infraestructura

  tags = {
    Name        = var.bucket_name
    Environment = "production"
  }
}

# Configuración de Sitio Web Estático en S3 (Requerido para HTTP directo)
resource "aws_s3_bucket_website_configuration" "frontend_web" {
  bucket = aws_s3_bucket.frontend.id

  index_document {
    suffix = "index.html"
  }

  error_document {
    key = "index.html" # Indispensable para SPA routing en HTTP directo
  }
}

# Bloquear acceso público SOLO si CloudFront está habilitado.
# Si está deshabilitado (servidor HTTP directo), permitimos acceso público.
resource "aws_s3_bucket_public_access_block" "frontend_block" {
  bucket = aws_s3_bucket.frontend.id

  block_public_acls       = var.enable_cloudfront
  block_public_policy     = var.enable_cloudfront
  ignore_public_acls      = var.enable_cloudfront
  restrict_public_buckets = var.enable_cloudfront
}

# Política de Acceso al Bucket
# Si enable_cloudfront = true: Permite acceso de lectura exclusivo a CloudFront vía OAC.
# Si enable_cloudfront = false: Permite lectura pública a todo internet vía HTTP directo.
resource "aws_s3_bucket_policy" "bucket_policy" {
  bucket = aws_s3_bucket.frontend.id

  policy = var.enable_cloudfront ? jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowCloudFrontServicePrincipalReadOnly"
        Effect    = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.frontend.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.cdn[0].arn
          }
        }
      }
    ]
  }) : jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "PublicReadGetObject"
        Effect    = "Allow"
        Principal = "*"
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.frontend.arn}/*"
      }
    ]
  })

  # Asegurar que se cree después de configurar los bloques de acceso público
  depends_on = [
    aws_s3_bucket_public_access_block.frontend_block
  ]
}

# --- SUBIDA AUTOMÁTICA DE ARCHIVOS DE LA CARPETA 'dist' ---
locals {
  mime_types = {
    "html"  = "text/html"
    "css"   = "text/css"
    "js"    = "application/javascript"
    "json"  = "application/json"
    "png"   = "image/png"
    "jpg"   = "image/jpeg"
    "jpeg"  = "image/jpeg"
    "gif"   = "image/gif"
    "svg"   = "image/svg+xml"
    "ico"   = "image/vnd.microsoft.icon"
    "webp"  = "image/webp"
    "woff"  = "font/woff"
    "woff2" = "font/woff2"
    "ttf"   = "font/ttf"
  }
}

resource "aws_s3_object" "assets" {
  for_each = fileset("${path.module}/../dist", "**/*")

  bucket       = aws_s3_bucket.frontend.id
  key          = each.value
  source       = "${path.module}/../dist/${each.value}"
  content_type = lookup(local.mime_types, regex(".+\\.(.+)$", each.value)[0], "application/octet-stream")
  etag         = filemd5("${path.module}/../dist/${each.value}")
}
