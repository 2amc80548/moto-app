# --- ORIGIN ACCESS CONTROL (OAC) DE CLOUDFRONT ---
# Permite a CloudFront autenticarse y leer de forma segura el bucket S3 privado.
resource "aws_cloudfront_origin_access_control" "oac" {
  count                             = var.enable_cloudfront ? 1 : 0
  name                              = "${var.bucket_name}-oac"
  description                       = "OAC para el S3 Bucket de MotoCab"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# --- DISTRIBUCIÓN DE CLOUDFRONT ---
resource "aws_cloudfront_distribution" "cdn" {
  count = var.enable_cloudfront ? 1 : 0

  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                = "S3-${var.bucket_name}"
    origin_access_control_id = aws_cloudfront_origin_access_control.oac[0].id
  }

  enabled             = true
  is_ipv6_enabled     = true
  comment             = "CDN para MotoCab frontend"
  default_root_object = "index.html"

  # Configuración por defecto de caché y comportamiento
  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-${var.bucket_name}"

    # Usar políticas recomendadas de AWS para optimizar la caché
    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 3600
    max_ttl                = 86400

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }
  }

  # --- CONFIGURACIÓN DE ERRORES PARA SPA (VUE/VITE) ---
  # Redirige rutas virtuales inexistentes en S3 al index.html para que el enrutador de Vue las procese.
  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }

  # Restricciones geográficas (ninguna por defecto)
  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  # Certificado SSL/TLS por defecto de CloudFront (*.cloudfront.net)
  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = {
    Environment = "production"
  }
}
